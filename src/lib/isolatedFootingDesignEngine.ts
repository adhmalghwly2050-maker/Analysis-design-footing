/**
 * ACI 318 Ultimate Strength Design Engine for Isolated Footings
 * Designed by Senior Structural Foundation Software Engineer
 */

import { IsolatedFootingAnalysisResult } from './isolatedFootingEngine';

export interface FootingBar {
  barMark: string;
  direction: 'X' | 'Y';
  diameter: number;     // mm
  quantity: number;
  spacing: number;      // mm
  length: number;       // mm
  weight: number;       // kg
  coordinates: {
    start: [number, number, number]; // [x, y, z] in mm relative to footing center
    end: [number, number, number];
  }[];
}

export interface DesignSummary {
  footingB: number;
  footingL: number;
  footingH: number;
  governingMomentX: number; // kN·m/m
  governingMomentY: number; // kN·m/m
  requiredAsX: number;      // mm²
  requiredAsY: number;      // mm²
  providedAsX: number;      // mm²
  providedAsY: number;      // mm²
  oneWayShearStatus: 'pass' | 'fail';
  punchingStatus: 'pass' | 'fail';
  developmentLengthStatus: 'pass' | 'fail';
  overallStatus: 'pass' | 'fail';
}

export interface FlexuralDesignResult {
  direction: 'X' | 'Y';
  Mu: number;                // ultimate design moment, kN·m
  MuPerMeter: number;        // ultimate design moment per meter, kN·m/m
  AsRequiredPerMeter: number; // mm²/m
  AsRequiredTotal: number;    // mm² (for entire width)
  AsMinPerMeter: number;      // mm²/m
  AsMinTotal: number;         // mm²
  governingType: 'strength' | 'minimum';
  phiMn: number;             // kN·m
  isSafe: boolean;
  selectedDiameter: number;   // mm
  selectedQuantity: number;
  selectedSpacing: number;    // mm
  AsProvided: number;        // mm²
  barsLayout: FootingBar;
}

export interface ShearDesignResult {
  direction: 'X' | 'Y';
  Vu: number;                // ultimate shear force, kN
  Vc: number;                // concrete shear capacity, kN
  phiVc: number;             // factored shear capacity, kN
  dcr: number;
  isSafe: boolean;
}

export interface PunchingDesignResult {
  b0: number;                // punching perimeter, mm
  Area: number;              // punching shear area, mm²
  Vu: number;                // ultimate punching shear force, kN
  Vc1: number;               // Stress eq 1 capacity, MPa
  Vc2: number;               // Stress eq 2 capacity, MPa
  Vc3: number;               // Stress eq 3 capacity, MPa
  governingCapacityStress: number; // MPa
  governingConditionLabel: string;
  stressVu: number;          // ultimate punch stress, MPa
  stressVc: number;          // ultimate concrete stress capacity, MPa
  phiVcStress: number;       // factored concrete stress capacity, Mpa
  dcr: number;
  isSafe: boolean;
}

export interface DevelopmentLengthResult {
  direction: 'X' | 'Y';
  barDiameter: number;       // mm
  ld: number;                // straight development length, mm
  ldh: number;               // 90-degree hook development length, mm
  availableLength: number;   // available straight length, mm
  requiresHook: boolean;
  isSafe: boolean;           // true if available >= ld OR hooks are feasible
}

export interface SpacingCheckResult {
  direction: 'X' | 'Y';
  spacing: number;           // mm
  minSpacing: number;        // mm
  maxSpacing: number;        // mm
  isSafe: boolean;
}

export interface IsolatedFootingDesignOutput {
  summary: DesignSummary;
  flexureX: FlexuralDesignResult;
  flexureY: FlexuralDesignResult;
  shearX: ShearDesignResult;
  shearY: ShearDesignResult;
  punching: PunchingDesignResult;
  developmentX: DevelopmentLengthResult;
  developmentY: DevelopmentLengthResult;
  spacingX: SpacingCheckResult;
  spacingY: SpacingCheckResult;
  warnings: string[];
  totalSteelWeightKg: number;
  concreteVolumeM3: number;
}

/**
 * Executes a full ACI 318-19 strength design for an isolated footing,
 * taking service-level analysis results from the analyzer.
 */
export function designIsolatedFootingStrength(
  analysis: IsolatedFootingAnalysisResult,
  fy: number = 420,           // Steel reinforcing yield strength, default Grade 60 (420 MPa)
  loadFactor: number = 1.5,   // Unified load factor to scale service loads to ultimate state (typical 1.4~1.5)
  cover: number = 75          // Standard footing concrete cover, 75mm on soil
): IsolatedFootingDesignOutput {
  const { B, L, H, Cx, Cy, fxCol, fyCol, fc } = analysis.input;
  const warnings: string[] = [];

  // Effective depth calculations
  // Nominally assume a 16mm main rebar diameter
  const defaultBarDia = 16;
  const dX = H - cover - defaultBarDia / 2;             // Effective depth for outer layer (x-dir)
  const dY = H - cover - defaultBarDia - defaultBarDia / 2; // Effective depth for inner layer (y-dir)
  const d_avg = (dX + dY) / 2;

  // Concrete volumes
  const concreteVolumeM3 = (B / 1000) * (L / 1000) * (H / 1000);

  // Strength reduction factors (ACI 318 chapter 21)
  const phiFlexure = 0.90;
  const phiShear = 0.75;

  // --- 1. FLEXURAL DESIGN & REINFORCEMENT SELECTION ---
  // A. X-Direction Reinforcement (running parallel to B, resisting moment about Y column face)
  // The cantilever actions in the X direction create bending about Y face.
  // designMomentY is per-meter of Distribution width L.
  const MuY_per_meter = analysis.criticalSections.designMomentY * loadFactor; // kN·m/m
  const MuY_total = MuY_per_meter * (L / 1000); // For entire length L of the footing

  // B. Y-Direction Reinforcement (running parallel to L, resisting moment about X column face)
  // Bending about X face. designMomentX is per-meter of Distribution width B.
  const MuX_per_meter = analysis.criticalSections.designMomentX * loadFactor; // kN·m/m
  const MuX_total = MuX_per_meter * (B / 1000); // For entire width B of the footing

  // ACI Shrinkage / Temp reinforcement minimum (ACI 318-19 §7.6.1 / §8.6.1 / §13.3.4.4)
  // For spread footings, minimum flexural reinforcement ratio is:
  const rho_min = Math.max(0.0018 * 420 / fy, 0.0014);
  
  // Design X flexural steel per meter of distrib length L: b = 1000
  const designFlexure = (
    direction: 'X' | 'Y',
    Mu_per_m: number,
    totalDistribLength: number, // mm
    d_eff: number
  ): FlexuralDesignResult => {
    const b_strip = 1000; // 1m design strip
    const As_min_per_m = rho_min * b_strip * H;
    
    // Concrete compression block factor beta1 (ACI 318-19 Table 22.2.2.4.3)
    let beta1 = 0.85;
    if (fc > 28) {
      beta1 = Math.max(0.65, 0.85 - (0.05 * (fc - 28)) / 7);
    }
    // Net tensile strain controlled reinforcement ratio limit (ε_t >= 0.005)
    // rho_tc = 0.85 * beta1 * (fc/fy) * (0.003 / (0.003 + 0.005))
    const rho_tc = 0.31875 * beta1 * (fc / fy);
    
    // Concrete flexural stress block index
    // Rn = Mu / (phi * b * d^2)
    const Mu_Nmm = Mu_per_m * 1e6;
    const Rn = Mu_Nmm / (phiFlexure * b_strip * d_eff * d_eff);

    let requiredAsPerM = As_min_per_m;
    let governingType: 'strength' | 'minimum' = 'minimum';

    if (Rn > 0.85 * fc) {
      warnings.push(`⚠ Critical Design Error: Factored moment Mu in ${direction} direction exceeds compression concrete capacity limit! Increase footing thickness.`);
      requiredAsPerM = As_min_per_m * 1.5; // fallback
      governingType = 'strength';
    } else {
      const term = 1 - (2 * Rn) / (0.85 * fc);
      if (term > 0) {
        const rho_req = (0.85 * fc * (1 - Math.sqrt(term))) / fy;
        if (rho_req > rho_tc) {
          warnings.push(`⚠ Design Warning: Reinforcement ratio ρ in ${direction} direction exceeds tension-controlled limit (${rho_tc.toFixed(4)}) per ACI 318. Footing design is compression-controlled. Increase concrete thickness to ensure ductile behavior.`);
        }
        const As_req_strength = rho_req * b_strip * d_eff;
        if (As_req_strength > As_min_per_m) {
          requiredAsPerM = As_req_strength;
          governingType = 'strength';
        }
      }
    }

    const AsRequiredTotal = requiredAsPerM * (totalDistribLength / 1000);
    const AsMinTotal = As_min_per_m * (totalDistribLength / 1000);

    // --- Select Bar Arrangement ---
    // Standard diameters to evaluate: 12, 14, 16, 18, 20, 22, 25 mm
    const candidateDiameters = [12, 14, 16, 18, 20, 22, 25];
    let bestDia = 16;
    let bestQty = 5;
    let bestSpacing = 150;
    let bestAsProvided = 0;
    let foundOptimal = false;

    for (const db of candidateDiameters) {
      const ab = (Math.PI * db * db) / 4;
      const exactQty = AsRequiredTotal / ab;
      // Minimum 5 bars on foundations for proper structural matrix grid
      const qty = Math.max(5, Math.ceil(exactQty));
      
      // Clear spacing check (distribution width - 2*cover - qty*db)/(qty-1)
      const totalSpan = direction === 'X' ? L : B;
      const spacingLine = qty > 1 ? (totalSpan - 2 * cover - db) / (qty - 1) : 0;
      
      if (spacingLine >= 75 && spacingLine <= 300) {
        bestDia = db;
        bestQty = qty;
        bestSpacing = Math.round(spacingLine);
        bestAsProvided = qty * ab;
        foundOptimal = true;
        break;
      }
    }

    // Fallback if no candidate perfect spacing found
    if (!foundOptimal) {
      const db = 16;
      const ab = (Math.PI * db * db) / 4;
      const qty = Math.max(5, Math.ceil(AsRequiredTotal / ab));
      const totalSpan = direction === 'X' ? L : B;
      bestDia = db;
      bestQty = qty;
      bestSpacing = qty > 1 ? Math.round((totalSpan - 2 * cover - db) / (qty - 1)) : 150;
      bestAsProvided = qty * ab;
    }

    // Check strength capacity with provided reinforcement
    // a = As * fy / (0.85 * fc * b)
    const totalSpan = direction === 'X' ? L : B;
    const a = (bestAsProvided * fy) / (0.85 * fc * totalSpan);
    const Mn_provided = bestAsProvided * fy * (d_eff - a / 2) * 1e-6; // kN·m
    const phiMn = phiFlexure * Mn_provided;
    
    // Generate detailing rebar coordinates
    const barLength = (direction === 'X' ? B : L) - 2 * cover;
    const footingBars: FootingBar = {
      barMark: direction === 'X' ? 'T1-X' : 'T2-Y',
      direction,
      diameter: bestDia,
      quantity: bestQty,
      spacing: bestSpacing,
      length: barLength,
      weight: parseFloat(((bestAsProvided * (barLength / 1000) * 7850) / 1e6).toFixed(2)),
      coordinates: []
    };

    // Build visual center coordinates for detailing integration
    const spanWidth = direction === 'X' ? L : B;
    const rebarSpan = spanWidth - 2 * cover;
    for (let i = 0; i < bestQty; i++) {
      const coordOffset = -rebarSpan / 2 + i * (bestSpacing && bestSpacing > 0 ? bestSpacing : 150);
      const zHeight = direction === 'X' ? -H/2 + cover + bestDia/2 : -H/2 + cover + bestDia + bestDia/2;
      
      if (direction === 'X') {
        footingBars.coordinates.push({
          start: [-barLength/2, coordOffset, zHeight],
          end: [barLength/2, coordOffset, zHeight]
        });
      } else {
        footingBars.coordinates.push({
          start: [coordOffset, -barLength/2, zHeight],
          end: [coordOffset, barLength/2, zHeight]
        });
      }
    }

    return {
      direction,
      Mu: direction === 'X' ? MuY_total : MuX_total,
      MuPerMeter: Mu_per_m,
      AsRequiredPerMeter: parseFloat(requiredAsPerM.toFixed(1)),
      AsRequiredTotal: parseFloat(AsRequiredTotal.toFixed(1)),
      AsMinPerMeter: parseFloat(As_min_per_m.toFixed(1)),
      AsMinTotal: parseFloat(AsMinTotal.toFixed(1)),
      governingType,
      phiMn: parseFloat(phiMn.toFixed(1)),
      isSafe: phiMn >= (direction === 'X' ? MuY_total : MuX_total),
      selectedDiameter: bestDia,
      selectedQuantity: bestQty,
      selectedSpacing: bestSpacing,
      AsProvided: parseFloat(bestAsProvided.toFixed(1)),
      barsLayout: footingBars
    };
  };

  const flexureX = designFlexure('X', MuY_per_meter, L, dX);
  const flexureY = designFlexure('Y', MuX_per_meter, B, dY);

  if (!flexureX.isSafe) {
    warnings.push(`⚠ Design Warning: Provided flexural capacity phiMn in X-direction (${flexureX.phiMn} kNm) is less than factored design moment (${flexureX.Mu.toFixed(1)} kNm).`);
  }
  if (!flexureY.isSafe) {
    warnings.push(`⚠ Design Warning: Provided flexural capacity phiMn in Y-direction (${flexureY.phiMn} kNm) is less than factored design moment (${flexureY.Mu.toFixed(1)} kNm).`);
  }


  // --- 2. ONE-WAY SHEAR CHECK (Strength Design) ---
  // Factored shear force from analytical integration at distance 'd'
  const VuX_factored = analysis.criticalSections.Vu_x * loadFactor;
  const VuY_factored = analysis.criticalSections.Vu_y * loadFactor;

  // Concrete nominal shear strength under ACI 318-19 Table 22.5.5.1:
  // Vc = 0.17 * lambda * lambda_s * sqrt(fc) * b * d
  // Where lambda_s is the Size Effect Factor: lambda_s = sqrt(2 / (1 + 0.004 * d)) <= 1.0
  const lambda = 1.0; // normal weight concrete
  
  const lambda_sX = Math.min(1.0, Math.sqrt(2 / (1 + 0.004 * dX)));
  const lambda_sY = Math.min(1.0, Math.sqrt(2 / (1 + 0.004 * dY)));

  // For x-direction shear (critical plane parallel to Y, width = L)
  const VcX = 0.17 * lambda * lambda_sX * Math.sqrt(fc) * L * dX * 1e-3; // kN
  const phiVcX = phiShear * VcX;
  const shearX_ok = phiVcX >= VuX_factored;

  // For y-direction shear (critical plane parallel to X, width = B)
  const VcY = 0.17 * lambda * lambda_sY * Math.sqrt(fc) * B * dY * 1e-3; // kN
  const phiVcY = phiShear * VcY;
  const shearY_ok = phiVcY >= VuY_factored;

  const shearX: ShearDesignResult = {
    direction: 'X',
    Vu: parseFloat(VuX_factored.toFixed(1)),
    Vc: parseFloat(VcX.toFixed(1)),
    phiVc: parseFloat(phiVcX.toFixed(1)),
    dcr: parseFloat((VuX_factored / phiVcX).toFixed(3)),
    isSafe: shearX_ok
  };

  const shearY: ShearDesignResult = {
    direction: 'Y',
    Vu: parseFloat(VuY_factored.toFixed(1)),
    Vc: parseFloat(VcY.toFixed(1)),
    phiVc: parseFloat(phiVcY.toFixed(1)),
    dcr: parseFloat((VuY_factored / phiVcY).toFixed(3)),
    isSafe: shearY_ok
  };

  if (!shearX_ok) {
    warnings.push(`⚠ Critical Design Failure: Factored One-Way Shear along X direction (Vu = ${shearX.Vu} kN) exceeds capacity (phiVc = ${shearX.phiVc} kN). Increase footing thickness.`);
  }
  if (!shearY_ok) {
    warnings.push(`⚠ Critical Design Failure: Factored One-Way Shear along Y direction (Vu = ${shearY.Vu} kN) exceeds capacity (phiVc = ${shearY.phiVc} kN). Increase footing thickness.`);
  }

  // --- 3. TWO-WAY (PUNCHING) SHEAR CHECK (Strength Design) ---
  const b0 = analysis.criticalSections.punching_b0; // mm
  const punchingArea = analysis.criticalSections.punching_Area; // mm²
  const VuPunching_factored = analysis.criticalSections.Vu_punching * loadFactor; // kN

  // Ultimate punching shear stress (MPa)
  const stressVu = punchingArea > 0 ? (VuPunching_factored * 1000) / punchingArea : 0;

  // Concrete punching capacity stresses under ACI 318-19 §22.6.5.2
  const betaCol = Math.max(Cx, Cy) / Math.min(Cx, Cy);
  
  // Equation 1: vc = 0.17 * (1 + 2/beta) * lambda * sqrt(fc)
  const vc_eq1 = 0.17 * (1 + 2 / betaCol) * Math.sqrt(fc);

  // Equation 2: vc = 0.083 * (2 + alpha_s * d / b0) * lambda * sqrt(fc)
  const is_edge = Math.abs(fxCol) > (B / 4) || Math.abs(fyCol) > (L / 4);
  const alpha_s = is_edge ? 30 : 40;
  const vc_eq2 = 0.083 * (2 + (alpha_s * d_avg) / b0) * Math.sqrt(fc);

  // Equation 3 (with ACI 318-19 Size Effect Factor lambda_s): vc = 0.33 * lambda_s * lambda * sqrt(fc)
  const lambda_sPunch = Math.min(1.0, Math.sqrt(2 / (1 + 0.004 * d_avg)));
  const vc_eq3 = 0.33 * lambda_sPunch * Math.sqrt(fc);

  const vc_nom_stress = Math.min(vc_eq1, vc_eq2, vc_eq3);
  const phiVc_stress = phiShear * vc_nom_stress;
  const punching_ok = stressVu <= phiVc_stress;

  let governingLabel = "حد المقاومة الأقصى العام لقص الاختراق المعدل بعامل الحجم (0.33*λs*√f'c) ACI 318 Eq (3)";
  if (vc_eq1 === vc_nom_stress) {
    governingLabel = "تأثير استطالة مقطع العمود (Eq 1 - Aspect ratio governing)";
  } else if (vc_eq2 === vc_nom_stress) {
    governingLabel = "تأثير محيط الثقب للمقطع الحرج النسبي (Eq 2 - Perimeter/Confinement governing)";
  }

  const punchingResult: PunchingDesignResult = {
    b0,
    Area: punchingArea,
    Vu: parseFloat(VuPunching_factored.toFixed(1)),
    Vc1: parseFloat(vc_eq1.toFixed(3)),
    Vc2: parseFloat(vc_eq2.toFixed(3)),
    Vc3: parseFloat(vc_eq3.toFixed(3)),
    governingCapacityStress: parseFloat(vc_nom_stress.toFixed(3)),
    governingConditionLabel: governingLabel,
    stressVu: parseFloat(stressVu.toFixed(3)),
    stressVc: parseFloat(vc_nom_stress.toFixed(3)),
    phiVcStress: parseFloat(phiVc_stress.toFixed(3)),
    dcr: parseFloat((stressVu / phiVc_stress).toFixed(3)),
    isSafe: punching_ok
  };

  if (!punching_ok) {
    warnings.push(`⚠ Critical Detailing Failure: Factored punching shear stress (vu = ${punchingResult.stressVu} MPa) exceeds ACI shear capacity (phi*vc = ${punchingResult.phiVcStress} MPa). Column will rupture through the footing. Increase thickness immediately!`);
  }


  // --- 4. DEVELOPMENT LENGTH CHECKS (ACI 318-19 §25.4.2) ---
  const calculateDevelopmentLength = (
    direction: 'X' | 'Y',
    db: number,
    d_eff: number,
    cantileverDistance: number // mm
  ): DevelopmentLengthResult => {
    // Tension development length of deformed bar check (ACI 318-19 §25.4.2)
    // ld = [ (fy * psi_t * psi_e * psi_s * psi_g * lambda) / (1.1 * sqrt(fc) * confinement_term) ] * db
    // Confinement term (cb + Ktr)/db where Ktr = 0. cb is cover dimension or spacing
    const psi_t = 1.0; // Bottom bars in footing (less than 300mm of fresh concrete below them)
    const psi_e = 1.0; // Uncoated black bars
    const psi_s = db <= 19 ? 0.8 : 1.0; // Size factor
    
    // Grade factor psi_g (ACI 318-19 Table 25.4.2.5)
    let psi_g = 1.0;
    if (fy > 420 && fy <= 550) {
      psi_g = 1.15;
    } else if (fy > 550) {
      psi_g = 1.30;
    }

    // cb confinement
    const c_b = Math.min(cover + db/2, 100); // Confinement covers
    const confinementRatio = Math.min(2.5, c_b / db);

    const num = fy * psi_t * psi_e * psi_s * psi_g * lambda;
    const den = 1.1 * Math.sqrt(fc) * confinementRatio;
    const ld_exact = (num / den) * db;
    const ld = Math.max(300, Math.round(ld_exact));

    // ACI 318-19 standard 90-degree hook development length in tension (§25.4.3.1):
    // ldh = [ (fy * psi_e * psi_r * psi_o * psi_c) / (1.1 * lambda * sqrt(fc)) ] * (db^1.5)
    const psi_r = 1.0; // No additional standard stirrup ties wrapping the hook
    const psi_o = 1.0; // Standard footing location
    const psi_c_hook = fc < 40 ? (fc / 100 + 0.6) : 1.0;
    
    const ldh_exact = ((fy * psi_e * psi_r * psi_o * psi_c_hook) / (1.1 * lambda * Math.sqrt(fc))) * Math.pow(db, 1.5);
    const ldh = Math.max(150, Math.round(8 * db), Math.round(ldh_exact));

    // Available straight length is cantilever length - end concrete cover
    const availableLength = cantileverDistance - cover;
    const requiresHook = availableLength < ld;
    const isSafe = availableLength >= ld || (availableLength >= ldh); // safe if we can fit hooks

    return {
      direction,
      barDiameter: db,
      ld,
      ldh,
      availableLength,
      requiresHook,
      isSafe
    };
  };

  const cantileverDistanceX = (B - Cx) / 2;
  const cantileverDistanceY = (L - Cy) / 2;

  const develX = calculateDevelopmentLength('X', flexureX.selectedDiameter, dX, cantileverDistanceX);
  const develY = calculateDevelopmentLength('Y', flexureY.selectedDiameter, dY, cantileverDistanceY);

  if (develX.requiresHook) {
    warnings.push(`💡 Detailing Notice: Available straight development length in X-direction (${develX.availableLength} mm) is less than required ACI straight length (${develX.ld} mm). End 90-degree standard anchorage hooks must be specified.`);
  }
  if (develY.requiresHook) {
    warnings.push(`💡 Detailing Notice: Available straight development length in Y-direction (${develY.availableLength} mm) is less than required ACI straight length (${develY.ld} mm). End 90-degree standard anchorage hooks must be specified.`);
  }


  // --- 5. SPACING CHECKS ---
  const checkSpacing = (
    direction: 'X' | 'Y',
    spacing: number,
    db: number
  ): SpacingCheckResult => {
    // ACI 318 limit on spacing
    const minSpacing = Math.max(75, 1.5 * db); // constructability
    const maxSpacing = Math.min(3 * H, 450);  // shrinkage tension limit
    const isSafe = spacing >= minSpacing && spacing <= maxSpacing;
    return {
      direction,
      spacing,
      minSpacing,
      maxSpacing,
      isSafe
    };
  };

  const spacingX = checkSpacing('X', flexureX.selectedSpacing, flexureX.selectedDiameter);
  const spacingY = checkSpacing('Y', flexureY.selectedSpacing, flexureY.selectedDiameter);

  if (!spacingX.isSafe) {
    warnings.push(`⚠ Spacing Warning: Selected spacing in X-direction (${spacingX.spacing} mm) is out of limits [${spacingX.minSpacing} mm - ${spacingX.maxSpacing} mm].`);
  }
  if (!spacingY.isSafe) {
    warnings.push(`⚠ Spacing Warning: Selected spacing in Y-direction (${spacingY.spacing} mm) is out of limits [${spacingY.minSpacing} mm - ${spacingY.maxSpacing} mm].`);
  }


  // --- 6. QUANTITY CALCULATIONS ---
  // Unit weights per meter
  const getUnitWeight = (db: number) => (Math.PI * db * db * 7850) / 4e6; // kg/m
  
  const wX = getUnitWeight(flexureX.selectedDiameter);
  const rebarLengthX = B - 2 * cover;
  const weightX = flexureX.selectedQuantity * (rebarLengthX / 1000) * wX;

  const wY = getUnitWeight(flexureY.selectedDiameter);
  const rebarLengthY = L - 2 * cover;
  const weightY = flexureY.selectedQuantity * (rebarLengthY / 1000) * wY;

  const totalSteelWeightKg = parseFloat((weightX + weightY).toFixed(1));

  // Overall status check
  const okFlexure = flexureX.isSafe && flexureY.isSafe;
  const okShear = shearX_ok && shearY_ok;
  const okPunch = punching_ok;
  const overallAdequate = okFlexure && okShear && okPunch;

  const summary: DesignSummary = {
    footingB: B,
    footingL: L,
    footingH: H,
    governingMomentX: parseFloat(analysis.criticalSections.designMomentX.toFixed(1)),
    governingMomentY: parseFloat(analysis.criticalSections.designMomentY.toFixed(1)),
    requiredAsX: flexureX.AsRequiredTotal,
    requiredAsY: flexureY.AsRequiredTotal,
    providedAsX: flexureX.AsProvided,
    providedAsY: flexureY.AsProvided,
    oneWayShearStatus: okShear ? 'pass' : 'fail',
    punchingStatus: okPunch ? 'pass' : 'fail',
    developmentLengthStatus: (develX.isSafe && develY.isSafe) ? 'pass' : 'fail',
    overallStatus: overallAdequate ? 'pass' : 'fail'
  };

  return {
    summary,
    flexureX,
    flexureY,
    shearX,
    shearY,
    punching: punchingResult,
    developmentX: develX,
    developmentY: develY,
    spacingX,
    spacingY,
    warnings,
    totalSteelWeightKg,
    concreteVolumeM3: parseFloat(concreteVolumeM3.toFixed(3))
  };
}
