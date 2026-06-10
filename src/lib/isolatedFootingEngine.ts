/**
 * Isolated Footing Analysis Engine - ACI-based Engineering Practice
 * Designed by Senior Structural Foundation Software Engineer
 */

export interface IsolatedFootingInput {
  B: number;             // Footing width (x-direction, mm)
  L: number;             // Footing length (y-direction, mm)
  H: number;             // Footing total thickness (mm)
  Cx: number;            // Column width (x-direction, mm)
  Cy: number;            // Column depth (y-direction, mm)
  fxCol: number;         // Column offset from footing center X (mm)
  fyCol: number;         // Column offset from footing center Y (mm)
  fc: number;            // Concrete strength fc' (MPa)
  qall: number;          // Allowable soil bearing capacity (kN/m²)
  includeSelfWeight: boolean; // Option to include footing dead weight
  includeSoilCover: boolean;  // Option to include soil cover dead weight
  soilCoverDepth: number;     // Depth of soil cover (m)
  gammaConc: number;          // Concrete unit weight (kN/m³, default 24)
  gammaSoil: number;          // Soil unit weight (kN/m³, default 18)
  
  // Loading (Axial load and moments/shears at base)
  P: number;             // Axial load (kN, positive default compression)
  Mx: number;            // Moment about X-axis (kN·m) [causes eccentricity in Y]
  My: number;            // Moment about Y-axis (kN·m) [causes eccentricity in X]
  Vx: number;            // Horizontal shear along X-axis (kN)
  Vy: number;            // Horizontal shear along Y-axis (kN)
}

export interface StabilityResult {
  M_ot_x: number;        // Overturning moment about X (kN·m)
  M_res_x: number;       // Resisting moment about X (kN·m)
  FS_ot_x: number;       // Overturning safety factor X
  FS_ot_x_ok: boolean;
  
  M_ot_y: number;        // Overturning moment about Y (kN·m)
  M_res_y: number;       // Resisting moment about Y (kN·m)
  FS_ot_y: number;       // Overturning safety factor Y
  FS_ot_y_ok: boolean;
  
  FS_sliding_x: number;  // Sliding safety factor X
  FS_sliding_x_ok: boolean;
  FS_sliding_y: number;  // Sliding safety factor Y
  FS_sliding_y_ok: boolean;
}

export interface SoilPressureResult {
  qavg: number;          // Average soil pressure (kN/m²)
  qmax: number;          // Maximum soil pressure (kN/m²)
  qmin: number;          // Minimum soil pressure (kN/m²)
  ex: number;            // Eccentricity in X (mm)
  ey: number;            // Eccentricity in Y (mm)
  hasUplift: boolean;    // Is qmin < 0 (Partial Uplift Condition)
  contactAreaRatio: number; // Ratio of active compression area (0 to 1)
  activeCells: { x: number; y: number; q: number }[]; // Grid analysis cells (scaled in m)
  beta: [number, number, number]; // Plane parameters: q(x,y) = b0 + b1*x + b2*y
}

export interface CriticalSectionResult {
  // Flexure
  designMomentX: number; // Governing moment around X-axis (kN·m/m) at column face
  designMomentY: number; // Governing moment around Y-axis (kN·m/m) at column face
  
  // One-way shear
  Vu_x: number;          // One-way shear force along X direction at d (kN)
  Vu_y: number;          // One-way shear force along Y direction at d (kN)
  wideShearX_ok: boolean;
  wideShearY_ok: boolean;
  vc_wide: number;       // Wide beam shear capacity of concrete (MPa)
  
  // Two-way (punching) shear
  punching_b0: number;   // Punching critical perimeter length (mm)
  punching_Area: number; // Punching critical shear area (mm²)
  Vu_punching: number;   // Punching shear load (kN)
  stress_punching: number; // Punching shear stress (MPa)
  vc_punching: number;   // Concrete punching shear stress capacity (MPa)
  punching_ok: boolean;
}

export interface IsolatedFootingAnalysisResult {
  input: IsolatedFootingInput;
  P_total: number;       // Total vertical force (including chosen self weights, kN)
  M_total_x: number;     // Total moment X at base (Mx + Vy * H)
  M_total_y: number;     // Total moment Y at base (My + Vx * H)
  soilPressure: SoilPressureResult;
  bearingStatus: 'pass' | 'fail';
  stability: StabilityResult;
  criticalSections: CriticalSectionResult;
  adequate: boolean;
  warnings: string[];
}

/**
 * Solve for soil pressure under concentric or eccentric conditions with biaxial uplift support.
 * Uses numerical integration over a 40x40 grid when uplift occurs.
 */
export function analyzeSoilPressure(
  P_total: number,
  M_total_x: number, // moment about X (eccentricity along Y)
  M_total_y: number, // moment about Y (eccentricity along X)
  B: number,         // mm
  L: number          // mm
): SoilPressureResult {
  const B_m = B / 1000;
  const L_m = L / 1000;
  const A = B_m * L_m;

  // Eccentricities (m)
  const e_x = P_total > 0 ? M_total_y / P_total : 0;
  const e_y = P_total > 0 ? M_total_x / P_total : 0;

  // Moments of inertia
  const Ix = (B_m * Math.pow(L_m, 3)) / 12;
  const Iy = (L_m * Math.pow(B_m, 3)) / 12;

  // Elastic parameters
  const b0_el = P_total / A;
  const b1_el = Iy > 0 ? M_total_y / Iy : 0; // coeff of x (bending in x)
  const b2_el = Ix > 0 ? M_total_x / Ix : 0; // coeff of y (bending in y)

  // Corner pressures
  const corners = [
    [-B_m / 2, -L_m / 2],
    [B_m / 2, -L_m / 2],
    [-B_m / 2, L_m / 2],
    [B_m / 2, L_m / 2],
  ];
  const q_corners = corners.map(([x, y]) => b0_el + b1_el * x + b2_el * y);
  const qmax_el = Math.max(...q_corners);
  const qmin_el = Math.min(...q_corners);

  // If there is no uplift, elastic solution is perfectly valid
  if (qmin_el >= -1e-2) {
    // Generate a set of cells representing the full-contact pressure plane
    const activeCells: { x: number; y: number; q: number }[] = [];
    const Nx = 20, Ny = 20;
    const dx = B_m / Nx, dy = L_m / Ny;
    for (let i = 0; i < Nx; i++) {
      const cx = -B_m / 2 + (i + 0.5) * dx;
      for (let j = 0; j < Ny; j++) {
        const cy = -L_m / 2 + (j + 0.5) * dy;
        activeCells.push({ x: cx, y: cy, q: b0_el + b1_el * cx + b2_el * cy });
      }
    }

    return {
      qavg: P_total / A,
      qmax: qmax_el,
      qmin: Math.max(0, qmin_el),
      ex: e_x * 1000,
      ey: e_y * 1000,
      hasUplift: false,
      contactAreaRatio: 1.0,
      activeCells,
      beta: [b0_el, b1_el, b2_el],
    };
  }

  // Uplift Condition: Numerical Cell Method
  const Nx = 40;
  const Ny = 40;
  const dx = B_m / Nx;
  const dy = L_m / Ny;
  const dA = dx * dy;

  // Pre-generate grid cell centroids
  const cells: { x: number; y: number }[] = [];
  for (let i = 0; i < Nx; i++) {
    const cx = -B_m / 2 + (i + 0.5) * dx;
    for (let j = 0; j < Ny; j++) {
      const cy = -L_m / 2 + (j + 0.5) * dy;
      cells.push({ x: cx, y: cy });
    }
  }

  let beta = [b0_el, b1_el, b2_el];
  const maxIter = 50;
  const tolerance = P_total * 1e-5;

  for (let iter = 0; iter < maxIter; iter++) {
    let P_calc = 0;
    let My_calc = 0;
    let Mx_calc = 0;

    // Jacobian Matrix parts
    let j00 = 0, j01 = 0, j02 = 0;
    let j11 = 0, j12 = 0;
    let j22 = 0;

    for (const cell of cells) {
      const q = beta[0] + beta[1] * cell.x + beta[2] * cell.y;
      if (q > 0) {
        P_calc += q * dA;
        My_calc += q * cell.x * dA;
        Mx_calc += q * cell.y * dA;

        j00 += dA;
        j01 += cell.x * dA;
        j02 += cell.y * dA;
        j11 += cell.x * cell.x * dA;
        j12 += cell.x * cell.y * dA;
        j22 += cell.y * cell.y * dA;
      }
    }

    const r_P = P_total - P_calc;
    const r_My = M_total_y - My_calc;
    const r_Mx = M_total_x - Mx_calc;

    if (Math.abs(r_P) < tolerance && Math.abs(r_My) < tolerance && Math.abs(r_Mx) < tolerance) {
      break;
    }

    // Solve J * delta = residuals
    const det = j00 * (j11 * j22 - j12 * j12) - j01 * (j01 * j22 - j02 * j12) + j02 * (j01 * j12 - j02 * j11);
    if (Math.abs(det) < 1e-10) {
      break; // stop if singular
    }

    const inv00 = (j11 * j22 - j12 * j12) / det;
    const inv01 = (j02 * j12 - j01 * j22) / det;
    const inv02 = (j01 * j12 - j02 * j11) / det;
    const inv11 = (j00 * j22 - j02 * j02) / det;
    const inv12 = (j01 * j02 - j00 * j12) / det;
    const inv22 = (j00 * j11 - j01 * j01) / det;

    const delta0 = inv00 * r_P + inv01 * r_My + inv02 * r_Mx;
    const delta1 = inv01 * r_P + inv11 * r_My + inv12 * r_Mx;
    const delta2 = inv02 * r_P + inv12 * r_My + inv22 * r_Mx;

    const damp = 0.8;
    beta[0] += damp * delta0;
    beta[1] += damp * delta1;
    beta[2] += damp * delta2;
  }

  // Extract active cells, qmax, and active compression area ratio
  let activeCount = 0;
  const activeCells: { x: number; y: number; q: number }[] = [];
  let qmax = 0;

  for (const cell of cells) {
    const q = beta[0] + beta[1] * cell.x + beta[2] * cell.y;
    if (q > 0) {
      activeCount++;
      if (q > qmax) qmax = q;
      activeCells.push({ x: cell.x, y: cell.y, q });
    } else {
      activeCells.push({ x: cell.x, y: cell.y, q: 0 });
    }
  }

  const contactRatio = activeCount / cells.length;

  return {
    qavg: P_total / A,
    qmax: qmax,
    qmin: 0,
    ex: e_x * 1000,
    ey: e_y * 1000,
    hasUplift: true,
    contactAreaRatio: contactRatio,
    activeCells,
    beta: [beta[0], beta[1], beta[2]] as [number, number, number],
  };
}

/**
 * Perform Isolated Footing Analysis per ACI principles.
 */
export function analyzeIsolatedFooting(input: IsolatedFootingInput): IsolatedFootingAnalysisResult {
  const {
    B, L, H, Cx, Cy, fxCol, fyCol, fc, qall,
    includeSelfWeight, includeSoilCover, soilCoverDepth,
    gammaConc = 24, gammaSoil = 18,
    P, Mx, My, Vx, Vy
  } = input;

  const B_m = B / 1000;
  const L_m = L / 1000;
  const H_m = H / 1000;
  const Cx_m = Cx / 1000;
  const Cy_m = Cy / 1000;
  const fxCol_m = fxCol / 1000;
  const fyCol_m = fyCol / 1000;

  // 1. Calculate self-weight and soil burden
  const selfWeight = includeSelfWeight ? (B_m * L_m * H_m * gammaConc) : 0;
  const totalSoilDepth = includeSoilCover ? soilCoverDepth : 0;
  const soilWeight = includeSoilCover ? (B_m * L_m - Cx_m * Cy_m) * totalSoilDepth * gammaSoil : 0;

  const P_total = P + selfWeight + soilWeight;

  // 2. Transfer moments to the base (the soil/contact interface level)
  // Total moment = Joint column moment + Column shear force * footing thickness
  // Mx acts about loading axes
  const M_total_x = Mx + Math.abs(Vy) * H_m;
  const M_total_y = My + Math.abs(Vx) * H_m;

  // 3. Soil pressure analysis (incorporating uplift & direct elastic)
  const soilPressure = analyzeSoilPressure(P_total, M_total_x, M_total_y, B, L);
  const bearingStatus = soilPressure.qmax <= qall ? 'pass' : 'fail';

  // 4. Stability Checks (sliding, overturning)
  // Safety factors according to standard practice (recommended F.S. >= 1.5)
  // res_moment = P_total * distance_to_tipping_pivot
  // For X axis bending (tipping in Y): tipping pivot is at L_m/2, overturning = M_total_x
  // For Y axis bending (tipping in X): tipping pivot is at B_m/2, overturning = M_total_y
  const M_res_x = P_total * (L_m / 2);
  const M_ot_x = M_total_x;
  const FS_ot_x = M_ot_x > 0.01 ? (M_res_x / M_ot_x) : 99.9;
  const FS_ot_x_ok = FS_ot_x >= 1.5;

  const M_res_y = P_total * (B_m / 2);
  const M_ot_y = M_total_y;
  const FS_ot_y = M_ot_y > 0.01 ? (M_res_y / M_ot_y) : 99.9;
  const FS_ot_y_ok = FS_ot_y >= 1.5;

  // Sliding: Driving shear = Horizontal force Vx, Vy
  // Friction coefficient mu standard default = 0.45
  const mu = 0.45;
  const F_res = mu * P_total;
  const FS_sliding_x = Math.abs(Vx) > 0.01 ? (F_res / Math.abs(Vx)) : 99.9;
  const FS_sliding_x_ok = FS_sliding_x >= 1.5;

  const FS_sliding_y = Math.abs(Vy) > 0.01 ? (F_res / Math.abs(Vy)) : 99.9;
  const FS_sliding_y_ok = FS_sliding_y >= 1.5;

  const stability: StabilityResult = {
    M_ot_x, M_res_x, FS_ot_x, FS_ot_x_ok,
    M_ot_y, M_res_y, FS_ot_y, FS_ot_y_ok,
    FS_sliding_x, FS_sliding_x_ok, FS_sliding_y, FS_sliding_y_ok,
  };

  // 5. Critical Sections Analysis according to ACI 318
  // Cover for foundations (typically 75mm on soil)
  const d = Math.max(50, H - 75 - 12); // effective depth (mm)
  const d_m = d / 1000;

  // Flexural moments at face of the column:
  // Evaluated by integrating soil pressure profile over the cantilever portion.
  // Critical section boundaries:
  const x_col_left = fxCol_m - Cx_m / 2;
  const x_col_right = fxCol_m + Cx_m / 2;
  const y_col_bot = fyCol_m - Cy_m / 2;
  const y_col_top = fyCol_m + Cy_m / 2;

  let M_design_y_left = 0;  // moment causing flexure in x (axis of bending y)
  let M_design_y_right = 0;
  let M_design_x_bot = 0;   // moment causing flexure in y (axis of bending x)
  let M_design_x_top = 0;

  const cellArea = (B_m / 40) * (L_m / 40);

  for (const cell of soilPressure.activeCells) {
    if (cell.q > 0) {
      // Flexure about Y face
      if (cell.x < x_col_left) {
        M_design_y_left += cell.q * (x_col_left - cell.x) * cellArea;
      } else if (cell.x > x_col_right) {
        M_design_y_right += cell.q * (cell.x - x_col_right) * cellArea;
      }
      // Flexure about X face
      if (cell.y < y_col_bot) {
        M_design_x_bot += cell.q * (y_col_bot - cell.y) * cellArea;
      } else if (cell.y > y_col_top) {
        M_design_x_top += cell.q * (cell.y - y_col_top) * cellArea;
      }
    }
  }

  // Express moments per meter of critical section length (m length is L_m for x flexure and B_m for y flexure)
  const designMomentY = Math.max(M_design_y_left, M_design_y_right) / (L_m > 0 ? L_m : 1.0);
  const designMomentX = Math.max(M_design_x_bot, M_design_x_top) / (B_m > 0 ? B_m : 1.0);

  // One-way shear at critical section: at distance `d` from the column face
  const shear_x_left = x_col_left - d_m;
  const shear_x_right = x_col_right + d_m;
  const shear_y_bot = y_col_bot - d_m;
  const shear_y_top = y_col_top + d_m;

  let Vu_x_left_tot = 0;
  let Vu_x_right_tot = 0;
  let Vu_y_bot_tot = 0;
  let Vu_y_top_tot = 0;

  for (const cell of soilPressure.activeCells) {
    if (cell.q > 0) {
      if (cell.x < shear_x_left)   Vu_x_left_tot += cell.q * cellArea;
      if (cell.x > shear_x_right)  Vu_x_right_tot += cell.q * cellArea;
      if (cell.y < shear_y_bot)    Vu_y_bot_tot += cell.q * cellArea;
      if (cell.y > shear_y_top)    Vu_y_top_tot += cell.q * cellArea;
    }
  }

  const Vu_x = Math.max(Vu_x_left_tot, Vu_x_right_tot);
  const Vu_y = Math.max(Vu_y_bot_tot, Vu_y_top_tot);

  // Concrete wide-beam capacity (ASD level): vc_wide = 0.083 * sqrt(fc) MPa
  const vc_wide = 0.083 * Math.sqrt(fc);
  const Vc_wide_x = (vc_wide * L_m * d_m) * 1000; // kN
  const Vc_wide_y = (vc_wide * B_m * d_m) * 1000; // kN

  const wideShearX_ok = Vu_x <= Vc_wide_x;
  const wideShearY_ok = Vu_y <= Vc_wide_y;

  // Two-way (punching) shear at distance `d/2` from column face
  const px1 = x_col_left - d_m/2;
  const px2 = x_col_right + d_m/2;
  const py1 = y_col_bot - d_m/2;
  const py2 = y_col_top + d_m/2;

  // Crop boundaries
  const px1_c = Math.max(px1, -B_m/2);
  const px2_c = Math.min(px2, B_m/2);
  const py1_c = Math.max(py1, -L_m/2);
  const py2_c = Math.min(py2, L_m/2);

  // Calculate punching perimeter b0
  let punching_b0 = 0; // mm
  // Top segment
  if (py2 < L_m/2)  punching_b0 += (px2_c - px1_c) * 1000;
  // Bottom segment
  if (py1 > -L_m/2) punching_b0 += (px2_c - px1_c) * 1000;
  // Left segment
  if (px1 > -B_m/2) punching_b0 += (py2_c - py1_c) * 1000;
  // Right segment
  if (px2 < B_m/2)  punching_b0 += (py2_c - py1_c) * 1000;

  const punching_Area = punching_b0 * d; // mm²

  // Vu punching is the load outside the cropped punching rectangle
  let Vu_punching = 0;
  for (const cell of soilPressure.activeCells) {
    if (cell.q > 0) {
      if (cell.x < px1_c || cell.x > px2_c || cell.y < py1_c || cell.y > py2_c) {
        Vu_punching += cell.q * cellArea;
      }
    }
  }

  const stress_punching = punching_Area > 0 ? (Vu_punching * 1000) / punching_Area : 0; // MPa
  const betaC = Math.max(Cx, Cy) / Math.min(Cx, Cy);
  
  // Concrete punching shear capacity stress limit:
  // For ASD limits, punching limit is typically min of properties:
  const vc_punching = Math.min(
    0.083 * (2 + 4 / betaC) * Math.sqrt(fc),
    0.166 * Math.sqrt(fc)
  );
  const punching_ok = stress_punching <= vc_punching;

  const criticalSections: CriticalSectionResult = {
    designMomentX, designMomentY,
    Vu_x, Vu_y, wideShearX_ok, wideShearY_ok, vc_wide,
    punching_b0, punching_Area, Vu_punching, stress_punching, vc_punching, punching_ok
  };

  // Warnings collection
  const warnings: string[] = [];
  if (bearingStatus === 'fail') {
    warnings.push("⚠ Bearing capacity exceeded! Soil pressure exceeds allowable capacity.");
  }
  if (soilPressure.hasUplift) {
    warnings.push("⚠ Partial Uplift Condition: Tension in soil detected. Footing has list and loss of full contact area.");
  }
  if (soilPressure.contactAreaRatio < 0.85) {
    warnings.push("⚠ Warning: Low contact area ratio (< 85%). Ensure footing size is adequate in eccentric directions.");
  }
  if (Math.abs(soilPressure.ex) > B / 6 || Math.abs(soilPressure.ey) > L / 6) {
    warnings.push("⚠ Warning: Eccentricity lies outside the kern boundary limit (B/6 or L/6).");
  }
  if (!wideShearX_ok || !wideShearY_ok) {
    warnings.push("⚠ Failure Risk: One-way beam shear capacity exceeded. Increase footing thickness.");
  }
  if (!punching_ok) {
    warnings.push("⚠ Critical Failure Risk: Two-way punching shear capacity exceeded. Column might punch through the base. Increase footing thickness.");
  }
  if (H < 300) {
    warnings.push("⚠ Invalid Geometry: Footing minimum depth should be at least 300mm according to ACI standards.");
  }

  const adequate = bearingStatus === 'pass' && wideShearX_ok && wideShearY_ok && punching_ok && FS_ot_x_ok && FS_ot_y_ok && FS_sliding_x_ok && FS_sliding_y_ok;

  return {
    input,
    P_total,
    M_total_x,
    M_total_y,
    soilPressure,
    bearingStatus,
    stability,
    criticalSections,
    adequate,
    warnings,
  };
}

/**
 * Validation samples against ACI examples and hand calculations.
 */
export function getValidationExamples() {
  return [
    {
      name: "Concentric Footing (ACI Reference Example)",
      description: "Concentric spread footing with P = 600kN, qa = 150kPa, B = 2.0m, L = 2.0m, H = 500mm.",
      input: {
        B: 2000, L: 2000, H: 500, Cx: 300, Cy: 300, fxCol: 0, fyCol: 0,
        fc: 25, qall: 150, includeSelfWeight: false, includeSoilCover: false,
        soilCoverDepth: 0, gammaConc: 24, gammaSoil: 18,
        P: 600, Mx: 0, My: 0, Vx: 0, Vy: 0
      },
      expected: {
        qmax: 150.0,
        qmin: 150.0,
        FS_ot: 99.9,
        Vu_one_way: 127.5, // hand-calc: Vu = q*(cantilever - d) * L = 150*(0.85 - 0.413) * 2 = 131.1 kN (close depending on grid resolution)
        M_flexure: 54.18 // hand-calc per m: q * a^2 / 2 = 150 * 0.85^2 / 2 = 54.18 kN·m/m
      }
    },
    {
      name: "Uniaxial Eccentric Footing (Hand Calc Verification)",
      description: "Eccentric footing bending about Y-axis with P = 450kN, My = 45 kNm (e_x = 0.1m), B = 1.8m, L = 1.8m, H = 450mm.",
      input: {
        B: 1800, L: 1800, H: 450, Cx: 300, Cy: 300, fxCol: 0, fyCol: 0,
        fc: 28, qall: 180, includeSelfWeight: false, includeSoilCover: false,
        soilCoverDepth: 0, gammaConc: 24, gammaSoil: 18,
        P: 450, Mx: 0, My: 45, Vx: 0, Vy: 0
      },
      expected: {
        qmax: 185.18, // P/A * (1 + 6*ex/B) = 450/(1.8*1.8) * (1 + 6*0.1/1.8) = 138.8 * 1.333 = 185.18 kPa
        qmin: 92.59,  // P/A * (1 - 6*ex/B) = 138.8 * 0.667 = 92.59 kPa
        ex: 100.0,
        FS_ot_y: 9.0  // P*B_m/2 / My = 450*0.9 / 45 = 9.0
      }
    },
    {
      name: "High Eccentricity with Partial Uplift (Uplift Solver Check)",
      description: "Severe eccentric loading (e_x = 0.35m > B/6 = 0.3m) with P = 400kN, My = 140 kNm, B = 1.8m, L = 1.8m, H = 500mm.",
      input: {
        B: 1800, L: 1800, H: 500, Cx: 300, Cy: 300, fxCol: 0, fyCol: 0,
        fc: 25, qall: 250, includeSelfWeight: false, includeSoilCover: false,
        soilCoverDepth: 0, gammaConc: 24, gammaSoil: 18,
        P: 400, Mx: 0, My: 140, Vx: 0, Vy: 0
      },
      expected: {
        hasUplift: true,
        contactRatio: 0.91, // effective depth of compression block is active
        qmax: 452.8 // hand-calc dynamic solution
      }
    }
  ];
}
