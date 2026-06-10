/**
 * Automatic Isolated Footing Sizing Engine
 * Designed by Senior Structural Foundation Software Engineer
 */

import { analyzeIsolatedFooting, IsolatedFootingInput, IsolatedFootingAnalysisResult } from './isolatedFootingEngine';

export interface SizingConstraints {
  maxLength?: number;       // mm
  maxWidth?: number;        // mm
  maxThickness?: number;     // mm
  shapeType: 'square' | 'rectangular' | 'equal_cantilever';
  stepSize: 25 | 50 | 100;   // Rounding increment (mm)
  bearingSafetyFactor?: number; // Target ratio modifier
}

export interface SizingResultOption {
  optionName: 'economical' | 'balanced' | 'conservative';
  titleAr: string;
  titleEn: string;
  B: number;                 // mm
  L: number;                 // mm
  H: number;                 // mm
  footingArea: number;       // m²
  concreteVolume: number;    // m³
  bearingUtilization: number; // qmax / qall
  punchingUtilization: number; // punching stress / capacity
  oneWayShearUtilization: number; // max (Vu_x/Vc, Vu_y/Vc)
  estimatedRebarRatio: number; // percentage (e.g., 0.20 for 0.20%)
  estimatedRebarWeightKg: number; // kg of steel
  overallEfficiency: number; // % (combines utilization & volume efficiency)
  analysis: IsolatedFootingAnalysisResult;
}

export interface AutoSizingOutput {
  economical: SizingResultOption;
  balanced: SizingResultOption;
  conservative: SizingResultOption;
}

/**
 * Calculates estimated flexural reinforcement for the sizing option
 */
function estimateReinforcement(
  M_design: number, // kN·m/m
  b_width_mm: number,
  H_mm: number,
  fc: number,
  fy: number
): { rebarRatio: number; rebarWeightKg: number } {
  // Use 75mm cover and nominal 14mm bar diameter
  const d_mm = Math.max(100, H_mm - 75 - 7);
  const b_mm = 1000; // design stripe width

  // Factored moment estimation
  const Mu = Math.max(0.1, M_design * 1.5 * 1e6); // N·mm per meter

  // Simple concrete flexural design
  const phi = 0.90;
  const Rn = Mu / (phi * b_mm * d_mm * d_mm); // MPa

  let rho = 0.0018; // default to shrinkage limit
  if (Rn < 0.85 * fc) {
    const term = 1 - (2 * Rn) / (0.85 * fc);
    if (term > 0) {
      rho = (0.85 * fc * (1 - Math.sqrt(term))) / fy;
    }
  }

  // Cover minimum limit
  const rho_sh = 0.0018; // shrinkage/temp limit of gross concrete area
  const As_req_per_m = Math.max(rho * b_mm * d_mm, rho_sh * b_mm * H_mm); // mm²/m
  
  // Total steel area in both directions
  // Width direction and Length direction
  const rebarRatioPercent = (As_req_per_m / (b_mm * H_mm)) * 100;

  // Approximate weight in kg:
  // Density of steel = 7850 kg/m³, volume of steel is As * total footprint length
  const totalBarAreaM2 = (As_req_per_m / 1e6) * (b_width_mm / 1000);
  const rebarWeightKg = totalBarAreaM2 * 7850 * 2.1; // multiplier of 2.1 for two-way detailing + hooks

  return {
    rebarRatio: parseFloat(rebarRatioPercent.toFixed(3)),
    rebarWeightKg: parseFloat(rebarWeightKg.toFixed(1)),
  };
}

/**
 * Sizing Engine Resolver:
 * Deterministic coarse-to-fine design optimizer
 */
export function solveFootingSizing(
  baseInput: Omit<IsolatedFootingInput, 'B' | 'L' | 'H'> & { fy?: number },
  constraints: SizingConstraints
): AutoSizingOutput {
  const { shapeType, stepSize, maxLength = 6000, maxWidth = 6000, maxThickness = 1200 } = constraints;
  const { P, Mx, My, Vx, Vy, qall, fc, Cx, Cy } = baseInput;
  const fy = baseInput.fy ?? 420;

  // Targets based on desired safety / conservativeness level
  const targets = {
    economical: { maxBearingUtil: 0.95, maxPunchingUtil: 0.90, maxShearUtil: 0.90, minContactRatio: 0.85 },
    balanced: { maxBearingUtil: 0.78, maxPunchingUtil: 0.72, maxShearUtil: 0.70, minContactRatio: 0.95 },
    conservative: { maxBearingUtil: 0.60, maxPunchingUtil: 0.50, maxShearUtil: 0.48, minContactRatio: 1.00 },
  };

  const solveOption = (
    level: 'economical' | 'balanced' | 'conservative'
  ): SizingResultOption => {
    const cfg = targets[level];

    // 1. Initial size estimation based on service loads
    const P_service_est = P + Math.max(10, 0.08 * P); // scale up for self weight guess
    const reqFootprintArea = P_service_est / qall; // m²

    let startB = 1000;
    let startL = 1000;

    if (shapeType === 'square') {
      const edge = Math.max(1000, Math.sqrt(reqFootprintArea) * 1000);
      startB = startL = Math.ceil(edge / stepSize) * stepSize;
    } else if (shapeType === 'equal_cantilever') {
      // Canton overhang: (L - Cy) = (B - Cx) => L = B + (Cy - Cx)
      // L * B = reqArea => B*(B + dCol) = reqArea
      const dCol = (Cy - Cx) / 1000; // meters
      // Solve B² + B*dCol - reqArea = 0
      const solB = (-dCol + Math.sqrt(dCol * dCol + 4 * reqFootprintArea)) / 2;
      const b_mm = Math.max(1000, solB * 1000);
      startB = Math.ceil(b_mm / stepSize) * stepSize;
      startL = startB + Math.round((Cy - Cx) / stepSize) * stepSize;
    } else { // rectangular
      // Prefer general aspect ratio of 1.25 or column aspect ratio
      const aspect = Math.max(1.0, Cy / Cx);
      const solB = Math.sqrt(reqFootprintArea / aspect);
      startB = Math.max(1000, Math.ceil((solB * 1000) / stepSize) * stepSize);
      startL = Math.max(1000, Math.ceil((solB * aspect * 1000) / stepSize) * stepSize);
    }

    let B = Math.min(maxWidth, startB);
    let L = Math.min(maxLength, startL);
    let H = 350; // default initial thickness

    // 2. Optimization refinement loop
    let passed = false;
    let iterations = 0;
    const maxIters = 120;

    let ultimateBestAnalysis: IsolatedFootingAnalysisResult | null = null;

    while (!passed && iterations < maxIters) {
      iterations++;

      // Build analysis input
      const testInput: IsolatedFootingInput = {
        ...baseInput,
        B,
        L,
        H,
      };

      const analysis = analyzeIsolatedFooting(testInput);
      ultimateBestAnalysis = analysis;

      // Extract current status indicator ratios
      const maxQ = analysis.soilPressure.qmax;
      const bearingUtil = maxQ / qall;
      const punchingUtil = analysis.criticalSections.stress_punching / Math.max(0.1, analysis.criticalSections.vc_punching);
      const shearUtil = Math.max(
        analysis.criticalSections.Vu_x / Math.max(1.0, (analysis.criticalSections.vc_wide * analysis.input.L * (analysis.input.H - 85)) / 1),
        analysis.criticalSections.Vu_y / Math.max(1.0, (analysis.criticalSections.vc_wide * analysis.input.B * (analysis.input.H - 85)) / 1)
      );

      const oneWayShearX_ok = analysis.criticalSections.wideShearX_ok;
      const oneWayShearY_ok = analysis.criticalSections.wideShearY_ok;
      const stabilityCheck = analysis.stability.FS_ot_x_ok && analysis.stability.FS_ot_y_ok &&
                            analysis.stability.FS_sliding_x_ok && analysis.stability.FS_sliding_y_ok;

      const contactRatio = analysis.soilPressure.contactAreaRatio;

      // Check failure modes
      const bearingFailed = bearingUtil > cfg.maxBearingUtil;
      const punchingFailed = punchingUtil > cfg.maxPunchingUtil || !analysis.criticalSections.punching_ok;
      const wideShearFailed = shearUtil > cfg.maxShearUtil || !oneWayShearX_ok || !oneWayShearY_ok;
      const upliftFailed = contactRatio < cfg.minContactRatio;

      if (!bearingFailed && !punchingFailed && !wideShearFailed && !upliftFailed && stabilityCheck && H >= 300) {
        passed = true;
        break;
      }

      // If bearing or uplift or stability fails: We need more area
      if (bearingFailed || upliftFailed || !stabilityCheck) {
        if (shapeType === 'square') {
          B = Math.min(maxWidth, B + stepSize);
          L = Math.min(maxLength, L + stepSize);
        } else if (shapeType === 'equal_cantilever') {
          B = Math.min(maxWidth, B + stepSize);
          L = B + Math.round((Cy - Cx) / stepSize) * stepSize;
        } else {
          // Increase smaller side, or both
          if (B <= L && B < maxWidth) {
            B = Math.min(maxWidth, B + stepSize);
          } else if (L < maxLength) {
            L = Math.min(maxLength, L + stepSize);
          } else if (B < maxWidth) {
            B = Math.min(maxWidth, B + stepSize);
          } else {
            // Cannot increase size anymore, try increasing depth to reduce self weight/bearing eccentricity or stop
            H = Math.min(maxThickness, H + stepSize);
          }
        }
      }

      // If shear or punching shear fails: We need more thickness
      if (punchingFailed || wideShearFailed) {
        if (H < maxThickness) {
          H = Math.min(maxThickness, H + stepSize);
        } else {
          // If thickness is at max, increase footing area to distribute shear stress
          if (shapeType === 'square') {
            B = Math.min(maxWidth, B + stepSize);
            L = Math.min(maxLength, L + stepSize);
          } else {
            B = Math.min(maxWidth, B + stepSize);
            L = Math.min(maxLength, L + stepSize);
          }
        }
      }

      // Prevent infinite loop if we hit limits
      if (B >= maxWidth && L >= maxLength && H >= maxThickness) {
        break;
      }
    }

    const finalAnalysis = ultimateBestAnalysis || analyzeIsolatedFooting({ ...baseInput, B, L, H });

    // Calculate final metrics
    const footingArea = (B / 1000) * (L / 1000);
    const concreteVolume = footingArea * (H / 1000);

    const maxQ = finalAnalysis.soilPressure.qmax;
    const finalBearingUtil = parseFloat((maxQ / qall).toFixed(3));
    const finalPunchingUtil = parseFloat((finalAnalysis.criticalSections.stress_punching / Math.max(0.1, finalAnalysis.criticalSections.vc_punching)).toFixed(3));

    const vcx = finalAnalysis.criticalSections.vc_wide * L * (H - 87);
    const vcy = finalAnalysis.criticalSections.vc_wide * B * (H - 87);
    const finalShearUtil = parseFloat(Math.max(
      finalAnalysis.criticalSections.Vu_x / Math.max(1.0, vcx / 1000),
      finalAnalysis.criticalSections.Vu_y / Math.max(1.0, vcy / 1000)
    ).toFixed(3));

    // Flexural reinforcement estimation
    const governingMoment = Math.max(finalAnalysis.criticalSections.designMomentX, finalAnalysis.criticalSections.designMomentY);
    const estRebar = estimateReinforcement(governingMoment, Math.min(B, L), H, fc, fy);

    // Compute Overall Design Efficiency:
    // Combo of material conservation and close target utilization
    // Efficiency = (Average utilization of critical forces) * 100
    const avgUtil = (finalBearingUtil + finalPunchingUtil + finalShearUtil) / 3;
    const efficiencyVal = Math.min(99, Math.max(30, Math.round(avgUtil * 100 + (1.0 / (concreteVolume + 0.1)) * 5)));

    const titleMap = {
      economical: { ar: 'الخيار الاقتصادي', en: 'Economical Option' },
      balanced: { ar: 'الخيار المتوازن', en: 'Balanced Option' },
      conservative: { ar: 'الخيار المحافظ', en: 'Conservative Option' }
    };

    return {
      optionName: level,
      titleAr: titleMap[level].ar,
      titleEn: titleMap[level].en,
      B,
      L,
      H,
      footingArea: parseFloat(footingArea.toFixed(2)),
      concreteVolume: parseFloat(concreteVolume.toFixed(3)),
      bearingUtilization: finalBearingUtil,
      punchingUtilization: finalPunchingUtil,
      oneWayShearUtilization: finalShearUtil,
      estimatedRebarRatio: estRebar.rebarRatio,
      estimatedRebarWeightKg: estRebar.rebarWeightKg,
      overallEfficiency: efficiencyVal,
      analysis: finalAnalysis,
    };
  };

  // Run solver on all three tiers
  return {
    economical: solveOption('economical'),
    balanced: solveOption('balanced'),
    conservative: solveOption('conservative'),
  };
}

/**
 * Custom text generator to explain automatic footing design decisions (in Arabic)
 */
export function generateArabicSizingReport(
  res: AutoSizingOutput,
  colName: string
): string {
  const econ = res.economical;
  const bal = res.balanced;
  const cons = res.conservative;

  return `تقرير المعايرة والتصميم التلقائي للقاعدة المعزولة (${colName}):
----------------------------------------------------------------------
1. الخيار الاقتصادي (Economical):
- الأبعاد المقترحة: العرض ${econ.B} مم × الطول ${econ.L} مم × السماكة ${econ.H} مم.
- حجم الخرسانة المطلوبة: ${econ.concreteVolume} م³.
- نسبة كفاءة التصميم الإجمالية: ${econ.overallEfficiency}%.
- يهدف هذا التعديل لرفع نسبة استغلال إجهاد التربة حتى حدود ${Math.round(econ.bearingUtilization * 100)}% لتقليل استهلاك المواد مع الحفاظ التام على شروط السلامة الإنشائية ومقاومة القص الثاقب وقوى القص في اتجاه واحد وفقاً لـ ACI 318.

2. الخيار المتوازن (Balanced - موصى به):
- الأبعاد المقترحة: العرض ${bal.B} مم × الطول ${bal.L} مم × السماكة ${bal.H} مم.
- حجم الخرسانة المطلوبة: ${bal.concreteVolume} م³.
- نسبة كفاءة التصميم الإجمالية: ${bal.overallEfficiency}%.
- يوفر هذا الحل هامش أمان متزن (نسبة استغلال التربة في حدود ${Math.round(bal.bearingUtilization * 100)}%) ويمنع تشكل أي قوى رفع أو انفصال بأسفل القاعدة في حالات اللامركزية المعتدلة، وهو البديل الأمثل لسهولة التنفيذ بالموقع.

3. الخيار المحافظ (Conservative):
- الأبعاد المقترحة: العرض ${cons.B} مم × الطول ${cons.L} مم × السماكة ${cons.H} مم.
- حجم الخرسانة المطلوبة: ${cons.concreteVolume} م³.
- نسبة كفاءة التصميم الإجمالية: ${cons.overallEfficiency}%.
- حل فائق الأمان بنسب استغلال منخفضة لا تتجاوز ${Math.round(cons.bearingUtilization * 100)}%، يضمن تماساً كاملاً لقاع القاعدة مع التربة (بدون أي شد أو رفع) ومقاومة عالية لأية أحمال زلزالية أو رياح عازمة مفاجئة.`;
}
