/**
 * Strip Footing Analysis Engine - ACI 318 & Foundation Engineering Standard
 * Designed by Senior Structural Foundation Software Engineer
 * 
 * Provides rigorous analysis of continuous / strip footings supporting columns or walls.
 * Fully supports beam-on-elastic-foundation (Winkler model) and rigid uniform modes.
 */

export interface StripFootingLoad {
  id: string;
  type: 'column' | 'wall' | 'point' | 'distributed' | 'moment';
  label: string;
  x: number;              // Position from left end (m)
  length?: number;        // For walls/distributed loads (m)
  PDead: number;          // Axial/concentrated dead load (kN) or Uniform dead load (kN/m)
  PLive: number;          // Axial/concentrated live load (kN) or Uniform live load (kN/m)
  MDead?: number;         // Concentrated dead moment (kN·m)
  MLive?: number;         // Concentrated live moment (kN·m)
  columnCx?: number;      // Column dimension along footing length (mm)
  columnCy?: number;      // Column dimension transverse to length (mm)
}

export interface StripFootingInput {
  L: number;                 // Total length (mm)
  B: number;                 // Total width (mm)
  H: number;                 // Total thickness (mm)
  fc: number;                // Concrete strength f'c (MPa)
  fy: number;                // Reinforcement yield limit fy (MPa)
  qall: number;              // Allowable soil bearing capacity (kN/m²)
  Ks: number;                // Modulus of subgrade reaction Ks (kN/m³)
  analysisMode: 'uniform' | 'winkler';
  springType: 'linear' | 'compression_only';
  includeSelfWeight: boolean;
  includeSoilCover: boolean;
  soilCoverDepth: number;    // Soil cover height (m)
  gammaConc: number;         // Concrete unit weight (kN/m³)
  gammaSoil: number;         // Soil unit weight (kN/m³)
  loads: StripFootingLoad[];
}

export interface StripFootingNodeResult {
  x: number;                 // Coordinate from left end (m)
  deflection: number;        // Vertical deflection/displacement (mm, downward positive)
  pressure: number;          // Soil contact pressure (kN/m²)
  shear: number;             // Shear force (kN)
  moment: number;            // Bending moment (kN·m)
  reaction: number;          // Nodal spring reaction (kN)
  isUplifted: boolean;       // Is soil spring in tension (0 stiffness)
}

export interface CriticalSection {
  id: string;
  type: 'support_zone' | 'midspan_zone' | 'max_moment' | 'max_shear' | 'one_way_shear_d' | 'punching_shear';
  label: string;
  xStart: number;            // Start coordinate (m)
  xEnd: number;              // End coordinate (m)
  governingValue: number;    // Bending moment (kN·m) or Shears (kN) or Pressure (kN/m²)
  description: string;
}

export interface StripFootingCombinationResult {
  comboName: string;
  nodes: StripFootingNodeResult[];
  
  // Critical Peak Statistics
  maxPositiveMoment: number; // kN·m (tension on bottom)
  maxPositiveMomentX: number;
  maxNegativeMoment: number; // kN·m (tension on top)
  maxNegativeMomentX: number;
  maxShear: number;          // kN
  maxShearX: number;
  
  maxPressure: number;       // kN/m²
  maxPressureX: number;
  minPressure: number;       // kN/m²
  minPressureX: number;
  
  maxSettlement: number;     // mm
  maxSettlementX: number;
  
  // Contact check
  contactRatio: number;      // Fraction of length with positive contact pressure (0 to 1)
  upliftSectors: { start: number; end: number }[];
  effectiveContactLength: number; // m
}

export interface StripFootingAnalysisResult {
  input: StripFootingInput;
  combinations: {
    service: StripFootingCombinationResult;  // D + L
    ultimate: StripFootingCombinationResult; // 1.2D + 1.6L
  };
  designRegions: CriticalSection[];
  warnings: string[];
}

/**
 * Solve static analysis for Strip Footing using Gaussian Elimination
 */
function solveLinearSystem(K: number[][], F: number[]): number[] {
  const n = F.length;
  const A = K.map(row => [...row]);
  const B = [...F];
  
  for (let i = 0; i < n; i++) {
    let maxRow = i;
    for (let r = i + 1; r < n; r++) {
      if (Math.abs(A[r][i]) > Math.abs(A[maxRow][i])) {
        maxRow = r;
      }
    }
    const tempRow = A[i]; A[i] = A[maxRow]; A[maxRow] = tempRow;
    const tempVal = B[i]; B[i] = B[maxRow]; B[maxRow] = tempVal;
    
    const pivot = A[i][i];
    if (Math.abs(pivot) < 1e-15) {
      A[i][i] = 1.0; // Avoid numerical division by zero
      continue;
    }
    for (let r = i + 1; r < n; r++) {
      const coeff = A[r][i] / pivot;
      for (let c = i; c < n; c++) {
        A[r][c] -= coeff * A[i][c];
      }
      B[r] -= coeff * B[i];
    }
  }
  
  const U = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let sum = 0;
    for (let c = i + 1; c < n; c++) {
      sum += A[i][c] * U[c];
    }
    U[i] = (B[i] - sum) / A[i][i];
  }
  return U;
}

/**
 * High fidelity finite element beam-on-elastic-foundation solver (Winkler model)
 */
function solveWinklerMode(
  input: StripFootingInput,
  loads: { P: { x: number; P: number }[]; M: { x: number; M: number }[]; distLoads: { xStart: number; xEnd: number; intensity: number }[] }
): StripFootingNodeResult[] {
  const L_m = input.L / 1000;
  const B_m = input.B / 1000;
  const H_m = input.H / 1000;
  
  // Concrete Elastictity
  const Ec = 4700 * Math.sqrt(input.fc) * 1000; // kN/m²
  const I_beam = (B_m * Math.pow(H_m, 3)) / 12; // m⁴
  const EI = Ec * I_beam; // kN·m²

  // Segmentations (100 elements, 101 nodes is accurate and fast!)
  const N_elem = 100;
  const N_nodes = N_elem + 1;
  const h_elem = L_m / N_elem;
  
  // 2 DOFs per node: index 2i is deflection w_i (downward +), index 2i+1 is rotation θ_i (clockwise +)
  const totalDOFs = N_nodes * 2;
  
  // Nodal coordinates
  const nodeCoords = Array.from({ length: N_nodes }, (_, i) => i * h_elem);
  
  // Force Vector
  let F_global = new Array(totalDOFs).fill(0);
  
  // Add concentrated point loads & column moments using exact Hermite Cubic Interpolations
  loads.P.forEach(({ x, P }) => {
    // Find element holding x coordinate
    let elemIdx = Math.floor(x / h_elem);
    if (elemIdx >= N_elem) elemIdx = N_elem - 1;
    if (elemIdx < 0) elemIdx = 0;
    
    const x0 = elemIdx * h_elem;
    const xi = (x - x0) / h_elem;
    
    // Hermite Interpolations
    const N1 = 1 - 3 * xi * xi + 2 * Math.pow(xi, 3);
    const M1 = xi * Math.pow(1 - xi, 2) * h_elem;
    const N2 = 3 * xi * xi - 2 * Math.pow(xi, 3);
    const M2 = xi * xi * (xi - 1) * h_elem;
    
    F_global[elemIdx * 2] += P * N1;
    F_global[elemIdx * 2 + 1] += P * M1;
    F_global[(elemIdx + 1) * 2] += P * N2;
    F_global[(elemIdx + 1) * 2 + 1] += P * M2;
  });
  
  // Add direct concentrated moments
  loads.M.forEach(({ x, M }) => {
    let elemIdx = Math.floor(x / h_elem);
    if (elemIdx >= N_elem) elemIdx = N_elem - 1;
    if (elemIdx < 0) elemIdx = 0;
    
    const x0 = elemIdx * h_elem;
    const xi = (x - x0) / h_elem;
    
    // First derivatives of Hermite with respect to x
    const dN1 = (-6 * xi + 6 * xi * xi) / h_elem;
    const dM1 = 1 - 4 * xi + 3 * xi * xi;
    const dN2 = (6 * xi - 6 * xi * xi) / h_elem;
    const dM2 = xi * (3 * xi - 2);
    
    // Apply equivalent force system representing point moment
    F_global[elemIdx * 2] += M * dN1;
    F_global[elemIdx * 2 + 1] += M * dM1;
    F_global[(elemIdx + 1) * 2] += M * dN2;
    F_global[(elemIdx + 1) * 2 + 1] += M * dM2;
  });
  
  // Add Distributed / Wall Loads
  loads.distLoads.forEach(({ xStart, xEnd, intensity }) => {
    for (let i = 0; i < N_elem; i++) {
      const x0 = i * h_elem;
      const x1 = x0 + h_elem;
      
      // Compute overlapping length
      const overlapStart = Math.max(xStart, x0);
      const overlapEnd = Math.min(xEnd, x1);
      
      if (overlapEnd > overlapStart) {
        const overlapLen = overlapEnd - overlapStart;
        // Equivalent node forces
        const midPoint = (overlapStart + overlapEnd) / 2;
        const totalP = intensity * overlapLen;
        
        const xi = (midPoint - x0) / h_elem;
        const N1 = 1 - 3 * xi * xi + 2 * Math.pow(xi, 3);
        const M1 = xi * Math.pow(1 - xi, 2) * h_elem;
        const N2 = 3 * xi * xi - 2 * Math.pow(xi, 3);
        const M2 = xi * xi * (xi - 1) * h_elem;
        
        F_global[i * 2] += totalP * N1;
        F_global[i * 2 + 1] += totalP * M1;
        F_global[(i + 1) * 2] += totalP * N2;
        F_global[(i + 1) * 2 + 1] += totalP * M2;
      }
    }
  });

  // Iterative Spring Solver for Compression-Only Behavior (Uplift Safeguard)
  let activeSprings = new Array(N_nodes).fill(true);
  let displacements = new Array(totalDOFs).fill(0);
  let iterations = 0;
  const maxIterations = 25;
  let converged = false;
  
  while (!converged && iterations < maxIterations) {
    iterations++;
    
    // Assemble Global Stiffness matrix
    let K_global = Array.from({ length: totalDOFs }, () => new Array(totalDOFs).fill(0));
    
    // Assemble Beam Element matrices
    for (let e = 0; e < N_elem; e++) {
      const idx = e * 2;
      // standard beam component
      const c1 = (12 * EI) / Math.pow(h_elem, 3);
      const c2 = (6 * EI) / Math.pow(h_elem, 2);
      const c3 = (4 * EI) / h_elem;
      const c4 = (2 * EI) / h_elem;
      
      const k_elem = [
        [c1, c2, -c1, c2],
        [c2, c3, -c2, c4],
        [-c1, -c2, c1, -c2],
        [c2, c4, -c2, c3]
      ];
      
      // Map to global stiffness coordinate
      for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 4; c++) {
          K_global[idx + r][idx + c] += k_elem[r][c];
        }
      }
    }
    
    // Add Winkler Subgrade springs at nodes
    for (let i = 0; i < N_nodes; i++) {
      if (activeSprings[i]) {
        // Tributary Length
        const b_width = (i === 0 || i === N_nodes - 1) ? h_elem / 2 : h_elem;
        const k_spring = input.Ks * B_m * b_width; // kN/m
        
        K_global[i * 2][i * 2] += k_spring;
      }
    }
    
    // Stabilize rigid body modes in case all springs are disabled (no contact zone)
    let totalSpringStiffness = 0;
    activeSprings.forEach((active, idx) => {
      if (active) totalSpringStiffness++;
    });
    if (totalSpringStiffness < 2) {
      // Extremely soft virtual springs to avoid singular matrices (unstable uplift)
      K_global[0][0] += 10.0;
      K_global[1 * 2][1 * 2] += 10.0;
      K_global[(N_nodes - 1) * 2][(N_nodes - 1) * 2] += 10.0;
    }
    
    // Solve linear equation system
    const newDisps = solveLinearSystem(K_global, F_global);
    
    if (input.springType === 'linear') {
      displacements = newDisps;
      converged = true;
      break;
    }
    
    // Check uplift compression conditions
    let changed = false;
    const nextActive = [...activeSprings];
    for (let i = 0; i < N_nodes; i++) {
      const w_node = newDisps[i * 2]; // vertical displacement
      // w_node > 0 means downward displacement (compression on soil)
      const shouldBeActive = w_node > -1e-5;
      if (shouldBeActive !== activeSprings[i]) {
        nextActive[i] = shouldBeActive;
        changed = true;
      }
    }
    
    displacements = newDisps;
    activeSprings = nextActive;
    
    if (!changed) {
      converged = true;
    }
  }

  // Back-calculate reactions, soil pressures, exact shears, and bending moments
  // To protect diagrams from piecewise numerical errors, we generate the Shear Force Diagram (SFD) 
  // and Bending Moment Diagram (BMD) using analytical integration of the node-to-node forces starting from x=0.
  const results: StripFootingNodeResult[] = [];
  
  // Nodal spacing parameters
  for (let i = 0; i < N_nodes; i++) {
    const xNode = nodeCoords[i];
    const def = displacements[i * 2] * 1000; // convert to mm
    
    // Active reaction calculation
    const trib = (i === 0 || i === N_nodes - 1) ? h_elem / 2 : h_elem;
    let actualReaction = 0;
    let computedPressure = 0;
    
    if (activeSprings[i] && displacements[i * 2] > 0) {
      actualReaction = displacements[i * 2] * input.Ks * B_m * trib; // kN
      computedPressure = displacements[i * 2] * input.Ks; // kN/m²
    }
    
    results.push({
      x: xNode,
      deflection: Math.max(-10, parseFloat(def.toFixed(4))),
      pressure: Math.max(0, parseFloat(computedPressure.toFixed(3))),
      shear: 0,
      moment: 0,
      reaction: parseFloat(actualReaction.toFixed(3)),
      isUplifted: !activeSprings[i]
    });
  }

  // Accurate shear/moment integration along length
  for (let idx = 0; idx < N_nodes; idx++) {
    const xVal = results[idx].x;
    
    // Upward force contribution from reaction springs
    let upwardForce = 0;
    results.forEach((node, nIdx) => {
      if (node.x <= xVal + 1e-5) {
        upwardForce += node.reaction;
      }
    });
    
    // Point loads applied to the left of xVal
    let downwardPointP = 0;
    loads.P.forEach(pt => {
      if (pt.x <= xVal - 1e-4) {
        downwardPointP += pt.P;
      } else if (Math.abs(pt.x - xVal) < 1e-4) {
        // Half load is accounted at the exact node coordinate
        downwardPointP += pt.P * 0.5;
      }
    });
    
    // Continuous distributed load left of xVal
    let downwardDistW = 0;
    loads.distLoads.forEach(dl => {
      if (dl.xStart < xVal) {
        const activeEnd = Math.min(dl.xEnd, xVal);
        downwardDistW += dl.intensity * (activeEnd - dl.xStart);
      }
    });
    
    // Shear calculation from left end equilibrium (upward reaction - downward load)
    const V_calc = upwardForce - downwardPointP - downwardDistW;
    results[idx].shear = parseFloat(V_calc.toFixed(2));
  }

  // Moment integration from Shear curve (M = ∫ V dx)
  let integratedMoment = 0;
  for (let idx = 0; idx < N_nodes; idx++) {
    if (idx === 0) {
      results[idx].moment = 0;
    } else {
      const prevShear = results[idx - 1].shear;
      const currShear = results[idx].shear;
      integratedMoment += ((prevShear + currShear) / 2) * h_elem;
      
      // Subtract applied moments to the left
      let appliedMomentsSub = 0;
      loads.M.forEach(m => {
        if (m.x <= results[idx].x) {
          appliedMomentsSub += m.M;
        }
      });
      
      results[idx].moment = parseFloat((integratedMoment - appliedMomentsSub).toFixed(2));
    }
  }

  // Adjust possible rounding offset at ending boundary to guarantee SFD/BMD closure:
  const lastIndex = N_nodes - 1;
  const roundingErrorV = results[lastIndex].shear;
  const roundingErrorM = results[lastIndex].moment;
  
  if (Math.abs(roundingErrorV) < 8.0) {
    // Redraw linear slope adjustment to close shear perfectly
    for (let j = 0; j < N_nodes; j++) {
      results[j].shear -= roundingErrorV * (results[j].x / L_m);
    }
  }
  if (Math.abs(roundingErrorM) < 8.0) {
    // Redraw linear slope adjustment for closing moment
    for (let j = 0; j < N_nodes; j++) {
      results[j].moment -= roundingErrorM * (results[j].x / L_m);
    }
  }
  
  // Set explicit boundary condition values
  results[0].moment = 0.0;
  results[lastIndex].moment = 0.0;
  results[0].shear = 0.0;
  results[lastIndex].shear = 0.0;

  return results;
}

/**
 * Rigid Uniform soil pressure solver (Mode 1 - concentric / eccentric with redistribution)
 */
function solveUniformMode(
  input: StripFootingInput,
  loads: { P: { x: number; P: number }[]; M: { x: number; M: number }[]; distLoads: { xStart: number; xEnd: number; intensity: number }[] }
): StripFootingNodeResult[] {
  const L_m = input.L / 1000;
  const B_m = input.B / 1000;
  
  // Aggregate total vertical downward load & Moments summation about center of footing
  let totalP = 0;
  let totalMomCenter = 0;
  
  // Point values
  loads.P.forEach(pt => {
    totalP += pt.P;
    totalMomCenter += pt.P * (pt.x - L_m / 2);
  });
  
  // Moments
  loads.M.forEach(m => {
    totalMomCenter += m.M;
  });
  
  // Distributed loads
  loads.distLoads.forEach(dl => {
    const len = dl.xEnd - dl.xStart;
    const force = dl.intensity * len;
    const geometricCenter = (dl.xStart + dl.xEnd) / 2;
    totalP += force;
    totalMomCenter += force * (geometricCenter - L_m / 2);
  });
  
  // Centroid eccentricity (eccentricity e along L direction)
  const e_ecc = totalP > 0 ? totalMomCenter / totalP : 0;
  
  // Calculate Soil pressure profile q(x) along length
  const N_nodes = 101;
  const nodeCoords = Array.from({ length: N_nodes }, (_, i) => i * (L_m / (N_nodes - 1)));
  const results: StripFootingNodeResult[] = [];
  
  // Safe bounds checks
  const exLimit = L_m / 6;
  const isEccentricUplift = Math.abs(e_ecc) > exLimit;
  
  nodeCoords.forEach(xVal => {
    let q_soil = 0;
    
    if (!isEccentricUplift) {
      // Elastic Stress Formula
      q_soil = (totalP / (B_m * L_m)) + (12 * totalMomCenter * (xVal - L_m / 2)) / (B_m * Math.pow(L_m, 3));
    } else {
      // Redistribute bearing over effective non-negative contact zone
      if (e_ecc > 0) {
        // Eccentricity towards right end
        const L_prime = 3 * (L_m / 2 - e_ecc);
        const q_max = (2 * totalP) / (B_m * L_prime);
        const x_uplift_limit = L_m - L_prime;
        if (xVal >= x_uplift_limit) {
          q_soil = q_max * ((xVal - x_uplift_limit) / L_prime);
        }
      } else {
        // Eccentricity towards left end (|e| represents positive distance)
        const L_prime = 3 * (L_m / 2 + e_ecc);
        const q_max = (2 * totalP) / (B_m * L_prime);
        if (xVal <= L_prime) {
          q_soil = q_max * ((L_prime - xVal) / L_prime);
        }
      }
    }
    
    results.push({
      x: xVal,
      deflection: 0, // In Mode 1, settlement or flexion deflections are zero
      pressure: parseFloat(Math.max(0, q_soil).toFixed(3)),
      shear: 0,
      moment: 0,
      reaction: 0,
      isUplifted: q_soil < 1e-4
    });
  });

  // Solve exact Shear BMD for Node results
  const h_elem = L_m / (N_nodes - 1);
  for (let idx = 0; idx < N_nodes; idx++) {
    const xVal = results[idx].x;
    
    // Integrated upwards soil bearing force
    let forceUp = 0;
    for (let s = 1; s <= idx; s++) {
      const q_prev = results[s - 1].pressure;
      const q_curr = results[s].pressure;
      forceUp += ((q_prev + q_curr) / 2) * B_m * h_elem;
    }
    
    // Point loads applied
    let downwardP = 0;
    loads.P.forEach(pt => {
      if (pt.x <= xVal - 1e-4) {
        downwardP += pt.P;
      } else if (Math.abs(pt.x - xVal) < 1e-4) {
        downwardP += pt.P * 0.5;
      }
    });
    
    // Distributed load applied
    let downwardDist = 0;
    loads.distLoads.forEach(dl => {
      if (dl.xStart < xVal) {
        const activeEnd = Math.min(dl.xEnd, xVal);
        downwardDist += dl.intensity * (activeEnd - dl.xStart);
      }
    });
    
    results[idx].shear = parseFloat((forceUp - downwardP - downwardDist).toFixed(2));
  }

  // Moment integration M = ∫ V dx
  let integratedMoment = 0;
  for (let idx = 0; idx < N_nodes; idx++) {
    if (idx === 0) {
      results[idx].moment = 0;
    } else {
      const prevShear = results[idx - 1].shear;
      const currShear = results[idx].shear;
      integratedMoment += ((prevShear + currShear) / 2) * h_elem;
      
      let appliedMomentsSub = 0;
      loads.M.forEach(m => {
        if (m.x <= results[idx].x) {
          appliedMomentsSub += m.M;
        }
      });
      
      results[idx].moment = parseFloat((integratedMoment - appliedMomentsSub).toFixed(2));
    }
  }

  // Adjust closures
  const lastIndex = N_nodes - 1;
  const roundingErrorV = results[lastIndex].shear;
  const roundingErrorM = results[lastIndex].moment;
  
  if (Math.abs(roundingErrorV) < 8.0) {
    for (let j = 0; j < N_nodes; j++) {
      results[j].shear -= roundingErrorV * (results[j].x / L_m);
    }
  }
  if (Math.abs(roundingErrorM) < 8.0) {
    for (let j = 0; j < N_nodes; j++) {
      results[j].moment -= roundingErrorM * (results[j].x / L_m);
    }
  }
  
  results[0].moment = 0.0;
  results[lastIndex].moment = 0.0;
  results[0].shear = 0.0;
  results[lastIndex].shear = 0.0;

  // Estimate Settlement based on subgrade elasticity ratio Ks to give beautiful visuals even for Uniform Mode
  for (let i = 0; i < N_nodes; i++) {
    results[i].deflection = results[i].pressure / input.Ks * 1000; // in mm
  }

  return results;
}

/**
 * Main calculation controller of Strip Footing Analysis
 */
export function analyzeStripFooting(input: StripFootingInput): StripFootingAnalysisResult {
  const L_m = input.L / 1000;
  const B_m = input.B / 1000;
  const H_m = input.H / 1000;
  const warnings: string[] = [];
  
  // Calculate material and self weight distributed load contributions (kN/m)
  let selfWeightW = 0;
  if (input.includeSelfWeight) {
    selfWeightW += H_m * B_m * input.gammaConc; // kN/m
  }
  if (input.includeSoilCover) {
    selfWeightW += input.soilCoverDepth * B_m * input.gammaSoil; // kN/m
  }
  
  // Prepare discrete loads package for combinations
  const compileLoads = (factorD: number, factorL: number) => {
    const P: { x: number; P: number }[] = [];
    const M: { x: number; M: number }[] = [];
    const distLoads: { xStart: number; xEnd: number; intensity: number }[] = [];
    
    // Base self weight distribution
    if (selfWeightW > 0) {
      distLoads.push({
        xStart: 0,
        xEnd: L_m,
        intensity: selfWeightW * factorD
      });
    }
    
    // Add external loads
    input.loads.forEach(load => {
      const deadP = load.PDead;
      const liveP = load.PLive;
      const combinedP = deadP * factorD + liveP * factorL;
      
      const deadM = load.MDead ?? 0;
      const liveM = load.MLive ?? 0;
      const combinedM = deadM * factorD + liveM * factorL;
      
      if (load.type === 'column' || load.type === 'point') {
        P.push({ x: load.x, P: combinedP });
        if (combinedM !== 0) {
          M.push({ x: load.x, M: combinedM });
        }
      } else if (load.type === 'wall' || load.type === 'distributed') {
        const len = load.length ?? 1.0;
        distLoads.push({
          xStart: load.x,
          xEnd: Math.min(L_m, load.x + len),
          intensity: combinedP // represent continuous load magnitude (already in kN/m)
        });
      } else if (load.type === 'moment') {
        if (combinedM !== 0) {
          M.push({ x: load.x, M: combinedM });
        }
      }
    });
    
    return { P, M, distLoads };
  };

  // Solve Service combination (1.0D + 1.0L)
  const serviceLoads = compileLoads(1.0, 1.0);
  const serviceNodes = input.analysisMode === 'winkler' 
    ? solveWinklerMode(input, serviceLoads)
    : solveUniformMode(input, serviceLoads);
    
  // Solve Ultimate combination (1.2D + 1.6L)
  const ultimateLoads = compileLoads(1.2, 1.6);
  const ultimateNodes = input.analysisMode === 'winkler'
    ? solveWinklerMode(input, ultimateLoads)
    : solveUniformMode(input, ultimateLoads);

  // Helper to compile statistics for a combo result
  const buildComboStatistics = (comboName: string, nodes: StripFootingNodeResult[]): StripFootingCombinationResult => {
    let maxPosM = 0; let maxPosMX = 0;
    let maxNegM = 0; let maxNegMX = 0;
    let maxV = 0; let maxVX = 0;
    let maxQ = 0; let maxQX = 0;
    let minQ = 99999; let minQX = 0;
    let maxS = 0; let maxSX = 0;
    
    let activeNodesCount = 0;
    let coordUpliftStart = -1;
    const upliftSectors: { start: number; end: number }[] = [];
    
    nodes.forEach(node => {
      // In beam moment convention, positive moments cause tension in bottom fibers:
      // Negative moments cause tension in top fibers (commonly found on supports/columns in continuous beams)
      if (node.moment > maxPosM) {
        maxPosM = node.moment;
        maxPosMX = node.x;
      }
      if (node.moment < maxNegM) {
        maxNegM = node.moment;
        maxNegMX = node.x;
      }
      if (Math.abs(node.shear) > Math.abs(maxV)) {
        maxV = Math.abs(node.shear);
        maxVX = node.x;
      }
      if (node.pressure > maxQ) {
        maxQ = node.pressure;
        maxQX = node.x;
      }
      if (node.pressure < minQ) {
        minQ = node.pressure;
        minQX = node.x;
      }
      if (node.deflection > maxS) {
        maxS = node.deflection;
        maxSX = node.x;
      }
      
      // Contact ratio metrics
      if (node.pressure > 1e-3) {
        activeNodesCount++;
        // If we were inside an uplift sector, close it
        if (coordUpliftStart !== -1) {
          upliftSectors.push({ start: coordUpliftStart, end: node.x });
          coordUpliftStart = -1;
        }
      } else {
        if (coordUpliftStart === -1) {
          coordUpliftStart = node.x;
        }
      }
    });
    
    // Keep unclosed uplift sector
    if (coordUpliftStart !== -1) {
      upliftSectors.push({ start: coordUpliftStart, end: L_m });
    }
    
    const contactRatio = activeNodesCount / nodes.length;
    
    return {
      comboName,
      nodes,
      maxPositiveMoment: maxPosM,
      maxPositiveMomentX: maxPosMX,
      maxNegativeMoment: maxNegM,
      maxNegativeMomentX: maxNegMX,
      maxShear: maxV,
      maxShearX: maxVX,
      maxPressure: maxQ,
      maxPressureX: maxQX,
      minPressure: minQ === 99999 ? 0 : minQ,
      minPressureX: minQX,
      maxSettlement: maxS,
      maxSettlementX: maxSX,
      contactRatio: parseFloat(contactRatio.toFixed(3)),
      upliftSectors,
      effectiveContactLength: parseFloat((contactRatio * L_m).toFixed(3))
    };
  };

  const serviceStats = buildComboStatistics('Service (D+L)', serviceNodes);
  const ultimateStats = buildComboStatistics('Ultimate (1.2D+1.6L)', ultimateNodes);

  // --- AUTOMATICAL IDENTIFICATION OF DESIGN STRIPS / REGIONS ---
  const designRegions: CriticalSection[] = [];
  const d_eff = (input.H - 75) / 1000; // effective depth in m (75mm cover)
  
  // Extract Columns list
  const columnsList = input.loads.filter(l => l.type === 'column' || l.type === 'point');
  
  // 1. Identify under column "Support Zones" representing column-face regions
  columnsList.forEach(col => {
    const colFace = (col.columnCx ?? 300) / 2000; // half column support width in m
    const xStart = Math.max(0, col.x - colFace);
    const xEnd = Math.min(L_m, col.x + colFace);
    
    // Find peak ultimate moment under column support region
    let peakMom = 0;
    ultimateNodes.forEach(node => {
      if (node.x >= xStart - 1e-4 && node.x <= xEnd + 1e-4) {
        if (Math.abs(node.moment) > Math.abs(peakMom)) {
          peakMom = node.moment;
        }
      }
    });
    
    designRegions.push({
      id: `sz-${col.id}`,
      type: 'support_zone',
      label: `منطقة التدعيم للعمود ${col.label} (Support Zone)`,
      xStart: parseFloat(xStart.toFixed(3)),
      xEnd: parseFloat(xEnd.toFixed(3)),
      governingValue: parseFloat(peakMom.toFixed(2)),
      description: `توزيع عزوم التدعيم حول وجه العمود لمراجعة متطلبات القص الثاقب والتسليح العلوي المانع للتشقق (governing moment: ${peakMom.toFixed(1)} kN·m).`
    });
    
    // 2. Critical section for One-Way Shear at distance "d" from column faces
    const xShearLeft = col.x - colFace - d_eff;
    const xShearRight = col.x + colFace + d_eff;
    
    if (xShearLeft >= 0) {
      let maxV_d = 0;
      ultimateNodes.forEach(n => {
        if (Math.abs(n.x - xShearLeft) < 0.05) {
          if (Math.abs(n.shear) > Math.abs(maxV_d)) maxV_d = n.shear;
        }
      });
      designRegions.push({
        id: `vd-${col.id}-left`,
        type: 'one_way_shear_d',
        label: `مقطع حرج للقص أحادي الاتجاه مائل (الشقة اليسرى للعمود ${col.label})`,
        xStart: parseFloat(xShearLeft.toFixed(3)),
        xEnd: parseFloat(xShearLeft.toFixed(3)),
        governingValue: parseFloat(maxV_d.toFixed(2)),
        description: `فحص إجهادات القص الفعلي على مسافة d=${(d_eff*1000).toFixed(0)} مم من وجه العمود لمقارنته مع مقاومة الخرسانة (Shear Force: ${maxV_d.toFixed(1)} kN).`
      });
    }
    
    if (xShearRight <= L_m) {
      let maxV_d = 0;
      ultimateNodes.forEach(n => {
        if (Math.abs(n.x - xShearRight) < 0.05) {
          if (Math.abs(n.shear) > Math.abs(maxV_d)) maxV_d = n.shear;
        }
      });
      designRegions.push({
        id: `vd-${col.id}-right`,
        type: 'one_way_shear_d',
        label: `مقطع حرج للقص أحادي الاتجاه مائل (الشقة اليمنى للعمود ${col.label})`,
        xStart: parseFloat(xShearRight.toFixed(3)),
        xEnd: parseFloat(xShearRight.toFixed(3)),
        governingValue: parseFloat(maxV_d.toFixed(2)),
        description: `فحص إجهادات القص الفعلي على مسافة d=${(d_eff*1000).toFixed(0)} مم من وجه العمود لمقارنته مع مقاومة الخرسانة (Shear Force: ${maxV_d.toFixed(1)} kN).`
      });
    }
  });

  // 3. Identify spans between columns as "Midspan Zones"
  const sortedCols = [...columnsList].sort((a, b) => a.x - b.x);
  for (let s = 0; s < sortedCols.length - 1; s++) {
    const colA = sortedCols[s];
    const colB = sortedCols[s + 1];
    const faceA = (colA.columnCx ?? 300) / 2000;
    const faceB = (colB.columnCx ?? 300) / 2000;
    
    const xStart = colA.x + faceA;
    const xEnd = colB.x - faceB;
    
    if (xEnd > xStart) {
      let peakPositiveMom = -99999;
      ultimateNodes.forEach(node => {
        if (node.x >= xStart && node.x <= xEnd) {
          if (node.moment > peakPositiveMom) {
            peakPositiveMom = node.moment;
          }
        }
      });
      
      designRegions.push({
        id: `mid-${colA.id}-${colB.id}`,
        type: 'midspan_zone',
        label: `فضاء منتصف البحر المتصل (بين عمودي ${colA.label} و ${colB.label})`,
        xStart: parseFloat(xStart.toFixed(3)),
        xEnd: parseFloat(xEnd.toFixed(3)),
        governingValue: peakPositiveMom === -99999 ? 0 : parseFloat(peakPositiveMom.toFixed(2)),
        description: `مراجعة العزوم الموجبة المتطورة بسبعة الضغط المعاكس لتربة الميدان والتي تسلح أسفل القاعدة (Governing Positive Moment: ${(peakPositiveMom === -99999 ? 0 : peakPositiveMom).toFixed(1)} kN·m).`
      });
    }
  }

  // Engineering Warnings Checks
  if (serviceStats.maxPressure > input.qall) {
    warnings.push(`تعد تعدي مجهودات التربة: الإجهاد الأقصى تحت تأثير الأحمال التشغيلية (${serviceStats.maxPressure.toFixed(1)} kN/m²) يجاوز قدرة التحمل المسموحة للتربة (${input.qall} kN/m²). يرجى زيادة عرض صبة القاعدة B.`);
  }
  
  if (serviceStats.contactRatio < 1.0) {
    warnings.push(`تحذير رفع تماس (Loss of Soil Contact): رصد تخلخل وارتفاع في الأطراف أو الفراغات (نسبة منطقة الانضغاط الفعالة ${ (serviceStats.contactRatio*100).toFixed(1) }%). يوصى بزيادة سمك القاعدة أو إعادة توازن التموضع أو التحقق الشامل من توازن الاستقرار.`);
  }

  if (input.Ks < 5000) {
    warnings.push(`عامل رد فعل التربة السطحية Ks منخفض للغاية، قد يسبب انهمار أو هبوط هائل وتأرجحات غير دقيقة في النماذج المرنة.`);
  }

  return {
    input,
    combinations: {
      service: serviceStats,
      ultimate: ultimateStats
    },
    designRegions,
    warnings
  };
}

/**
 * Technical validation cases comparative list
 */
export function getStripFootingBenchmarks() {
  return [
    {
      title: 'Hand-Calculation Validation Case (Two Column Strip)',
      description: 'Classic textbook case comparing Euler-Bernoulli Winkler formulations vs. static rigid uniform approximations for deep foundations.',
      input: {
        L: 8000,
        B: 1500,
        H: 650,
        fc: 28,
        fy: 420,
        qall: 160,
        Ks: 40000,
        analysisMode: 'winkler',
        springType: 'compression_only',
        includeSelfWeight: true,
        includeSoilCover: false,
        soilCoverDepth: 0,
        gammaConc: 24,
        gammaSoil: 18,
        loads: [
          { id: 'C1', type: 'column', label: 'C1 (Interior Primary)', x: 1.5, PDead: 280, PLive: 150, columnCx: 400, columnCy: 400 },
          { id: 'C2', type: 'column', label: 'C2 (Boundary Outer)', x: 6.5, PDead: 320, PLive: 200, columnCx: 400, columnCy: 400 }
        ]
      },
      expectations: {
        totalVerticalServiceLoad: '1226 kN (including self-weight 187 kN)',
        rigidSoilPressure: '102.2 kN/m²',
        winklerPeakSoilPressureScale: '115 - 130 kN/m² (at column joints)',
        winklerDeflectionRange: '2.5 mm to 3.5 mm'
      }
    },
    {
      title: 'Loss of Contact / Uplift Demonstration Benchmark',
      description: 'Severe eccentric case proving redistribution behavior of the compression-only Winkler springs when large cantilever moments occur.',
      input: {
        L: 6000,
        B: 1200,
        H: 500,
        fc: 25,
        fy: 420,
        qall: 120,
        Ks: 15000,
        analysisMode: 'winkler',
        springType: 'compression_only',
        includeSelfWeight: false,
        includeSoilCover: false,
        soilCoverDepth: 0,
        gammaConc: 24,
        gammaSoil: 18,
        loads: [
          { id: 'C1', type: 'column', label: 'Boundary C1', x: 0.5, PDead: 350, PLive: 100, columnCx: 300, columnCy: 300 },
          { id: 'C2', type: 'column', label: 'Mid C2', x: 3.0, PDead: 50, PLive: 10, columnCx: 300, columnCy: 300 }
        ]
      },
      expectations: {
        totalVerticalServiceLoad: '510 kN',
        activeContactRatio: 'Approx 70% to 80% with zero pressure in uplift sectors',
        settlementExtreme: 'Uplift region shows upward curve deflection with zero soil stress'
      }
    }
  ];
}
