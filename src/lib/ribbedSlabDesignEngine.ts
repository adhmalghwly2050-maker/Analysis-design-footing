import type { SlabProps, MatProps } from './structuralEngine';
import type { RibbedSlabAnalysisResult, AnalyticalRib, TBeamProperties } from './ribbedSlabSolver';

export interface RibBarDetail {
  barMark: string;
  type: 'BOT_CONT' | 'BOT_ADD' | 'TOP_SUPPORT' | 'STIRRUP' | 'TOPPING_SHRINKAGE';
  memberId: string; // rib ID or 'topping'
  diameter: number; // mm
  count: number;
  length: number;  // m
  weight: number;  // kg
  startCoord: number; // m from left
  endCoord: number;   // m from left
  description: string;
}

export interface SpanDesignResult {
  spanIndex: number;
  slabId: string;
  L: number; // m
  
  // Design Forces & Moments (factored)
  Mneg_left: number;  // kN.m
  Mpos: number;       // kN.m
  Mneg_right: number; // kN.m
  Vu_left: number;    // kN
  Vu_right: number;   // kN
  
  // Flexural Steel Areas (mm2)
  As_req_left: number;
  As_req_mid: number;
  As_req_right: number;
  
  As_min_left: number;
  As_min_mid: number;
  As_min_right: number;
  
  // Governing design areas (after minimums / limits)
  As_gov_left: number;
  As_gov_mid: number;
  As_gov_right: number;
  
  // T-Beam Case Identification
  midspanCase: 'A' | 'B'; // A = NA inside flange, B = NA below flange
  a_mid: number; // concrete equivalent stress block depth
  c_mid: number; // neutral axis depth
  strain_mid: number; // tension reinforcement strain
  
  // Selected actual bar arrangement
  bars_left: string;  // e.g. 2Φ12
  bars_mid: string;   // e.g. 2Φ14
  bars_right: string; // e.g. 2Φ12
  
  As_prov_left: number;
  As_prov_mid: number;
  As_prov_right: number;
  
  // Shear stirrup results
  Vc: number; // kN
  Vs_left: number; // kN
  Vs_right: number; // kN
  stirrups_left: string;  // e.g. Φ8@100
  stirrups_right: string; // e.g. Φ8@150
  
  // Deflection and depth-to-span checks
  minRequiredDepth: number; // m (per ACI span-to-depth)
  isDepthAdequate: boolean;
  deflectionLimit: number; // m
  actualDeflection: number; // m
  deflectionStatus: 'PASS' | 'FAIL';
  
  warnings: string[];
}

export interface RibDesignResult {
  ribId: string;
  type: 'interior' | 'edge';
  direction: 'X' | 'Y';
  coordinate: number;
  tributaryWidth: number;
  
  spans: SpanDesignResult[];
  
  // Governing totals for this rib
  maxMomentPos: number;
  maxMomentNeg: number;
  maxShear: number;
  maxDeflection: number;
  
  status: 'SAFE' | 'WARNING' | 'CRITICAL';
  warnings: string[];
  
  // Detailed physical bar schedule database entries
  rebarSchedule: RibBarDetail[];
}

export interface ToppingSlabDesign {
  thickness: number; // mm
  rebarGrid: string; // e.g., Φ8 @ 200 mm
  rhoProvided: number;
  AsRequired: number; // mm2/m
  AsProvided: number; // mm2/m
  spacingLimit: number; // mm
  weightPerSqm: number; // kg/m²
  barsInfo: string;
}

export interface SlabDesignSummary {
  controllingRibId: string;
  maxMoment: number; // kN.m
  maxShear: number; // kN
  maxDeflection: number; // mm
  totalSlabArea: number; // m²
  totalRebarWeight: number; // kg
  weightDensity: number; // kg/m² of slab
}

export interface RibbedSlabCompleteDesign {
  ribs: RibDesignResult[];
  topping: ToppingSlabDesign;
  summary: SlabDesignSummary;
  warnings: string[];
}

/**
 * Executes complete, multi-step structural concrete design of One-Way Ribbed Slab
 * based on ACI 318-19.
 */
export function designOneWayRibbedSystem(
  analysisResult: RibbedSlabAnalysisResult,
  slabProps: SlabProps,
  mat: MatProps,
  ribbedSlabProps: any
): RibbedSlabCompleteDesign {
  const ribs: RibDesignResult[] = [];
  const allWarnings: string[] = [];

  const bw = ribbedSlabProps?.bw ?? 100;
  const hb = ribbedSlabProps?.hb ?? 200;
  const tf = ribbedSlabProps?.tf ?? 70;
  const s = ribbedSlabProps?.s ?? 400;
  
  const h = tf + hb; // Total depth of rib in mm
  const fc = mat.fc ?? 25;
  const fy = mat.fy ?? 420;
  const fyt = mat.fyt ?? 280; // shear steel yield
  const cover = slabProps.cover ?? 20;

  // Bar diameter for design
  const diaMain = slabProps.phiSlab ?? 12;
  const diaShear = 8; // standard Φ8 stirrups for ribbed slab channels
  const singleBarArea = (Math.PI / 4) * diaMain * diaMain;
  const singleStirrupLegArea = (Math.PI / 4) * diaShear * diaShear;

  // Effective depth calculation: d = h - cover - diaShear - diaMain/2
  const d = h - cover - diaShear - diaMain / 2;

  // ACI Beta_1 parameter for concrete stress block
  let beta_1 = 0.85;
  if (fc > 28) {
    beta_1 = Math.max(0.65, 0.85 - (0.05 * (fc - 28)) / 7);
  }

  // 1. Process each rib generated from structural framing model
  let cumulativeWeight = 0;
  let barMarkCounter = 1;

  for (const ribAnalysis of analysisResult.ribs) {
    const isEdge = ribAnalysis.type === 'edge';
    const beff = ribAnalysis.sectionProperties.beff;
    
    const spanDesigns: SpanDesignResult[] = [];
    const ribWarnings: string[] = [];
    const ribRebar: RibBarDetail[] = [];

    // Continuous span cumulative coordinate tracker
    let ribLength = ribAnalysis.spans.reduce((total, sp) => total + sp.spanLength, 0);

    // Let's design each individual span of this continuous rib
    ribAnalysis.spanResults.forEach((sr, idx) => {
      const L = sr.L;
      const spanWarnings: string[] = [];

      // ACI Span-to-depth thickness check (ACI 318-19 Table 7.3.1.1 / Table 9.3.1.1)
      // For ribbed slab (one-way joist), minimum thickness h_min:
      // - Simply supported: L / 16
      // - One end continuous: L / 18.5
      // - Both ends continuous: L / 21
      // - Cantilever: L / 8
      const isFirst = idx === 0;
      const isLast = idx === ribAnalysis.spanResults.length - 1;
      const isSingleSpan = ribAnalysis.spanResults.length === 1;

      let divider = 21; // both ends continuous default
      if (isSingleSpan) {
        divider = 16;
      } else if (isFirst || isLast) {
        divider = 18.5; // one end continuous
      }

      const minDepthReq = L / divider;
      const minDepthReqMM = minDepthReq * 1000;
      const isDepthAdequate = h >= minDepthReqMM;
      if (!isDepthAdequate) {
        spanWarnings.push(
          `تحذير الترخيم (ACI 318-19 Table 9.3.1.1): سمك البلاطة الكلي (${h} مم) أقل من الحد الأدنى المقترح كودياً للبحرة ${sr.slabId} وهو ${minDepthReqMM.toFixed(0)} مم.`
        );
      }

      // Deflection limit: L / 360 or L / 240
      const defLimit = (L * 1000) / 360; // mm limit
      const actDef = sr.maxDeflection; // mm
      const deflectionStatus = actDef <= defLimit ? 'PASS' : 'FAIL';
      if (deflectionStatus === 'FAIL') {
        spanWarnings.push(
          `خطر (ACI 318-19 §24.2): سهم الترخيم الفعلي في البحرة ${sr.slabId} (${actDef.toFixed(2)} مم) يتجاوز الحد الأقصى كودياً L/360 وهو ${defLimit.toFixed(1)} مم.`
        );
      }

      // ───────────────────────────────────────────
      // Flexural design at critical sections: Left, Mid, Right
      // ───────────────────────────────────────────
      const phiFlex = 0.90;

      // Helper function to design a rectangular section
      const designRectSection = (Mu_kNm: number, bWidth: number): { As_req: number; a: number; c: number; strain: number; case: 'A' | 'B' } => {
        const Mu = Math.max(0.01, Math.abs(Mu_kNm)); // avoid zero division
        const Mu_Nmm = Mu * 1e6;
        
        // R_u = Mu / (phi * b * d^2)
        const Ru = Mu_Nmm / (phiFlex * bWidth * d * d);
        
        // rho = (0.85 * fc / fy) * (1 - sqrt(1 - 2*Ru / (0.85 * fc)))
        const rArg = 1 - (2 * Ru) / (0.85 * fc);
        if (rArg < 0) {
          // Cross section too small to maintain ductile behavior or requires compression reinforcement
          return { As_req: 9999, a: h, c: h, strain: 0.001, case: 'A' };
        }
        
        const rho = (0.85 * fc / fy) * (1 - Math.sqrt(rArg));
        const As_req = rho * bWidth * d;
        const a = rho * d * (fy / (0.85 * fc));
        const c = a / beta_1;
        const strain = 0.003 * (d - c) / c;

        return { As_req, a, c, strain, case: 'A' };
      };

      // T-Beam Section Design for Positive Moment (Compression at fiber top, Flange width beff)
      const designTBeamSection = (Mu_kNm: number): { As_req: number; a: number; c: number; strain: number; case: 'A' | 'B' } => {
        // Step 1: Assume NA is in the flange (Treat as rectangular of width beff)
        const rDesign = designRectSection(Mu_kNm, beff);
        if (rDesign.a <= tf) {
          return { ...rDesign, case: 'A' }; // Confirmed Case A
        }
        
        // Case B: NA is below the flange (a > tf). Overhanging flanges resist part of the load.
        const Mu = Math.abs(Mu_kNm);
        const Mu_Nmm = Mu * 1e6;

        // Steel area resisting flange overhangs (Asf)
        const Asf = (0.85 * fc * (beff - bw) * tf) / fy;
        const Muf_Nmm = phiFlex * Asf * fy * (d - tf / 2);
        
        const Muw_Nmm = Mu_Nmm - Muf_Nmm;
        if (Muw_Nmm <= 0) {
          // Concrete flange alone exceeds the required strength! Minimum steel governs.
          return { As_req: Asf, a: tf, c: tf / beta_1, strain: 0.015, case: 'B' };
        }

        // Web design portion:
        const Ru_w = Muw_Nmm / (phiFlex * bw * d * d);
        const rArg_w = 1 - (2 * Ru_w) / (0.85 * fc);
        if (rArg_w < 0) {
          return { As_req: 9999, a: h, c: h, strain: 0.001, case: 'B' }; // fails limits
        }

        const rho_w = (0.85 * fc / fy) * (1 - Math.sqrt(rArg_w));
        const Asw = rho_w * bw * d;
        const a = rho_w * d * (fy / (0.85 * fc));
        const c = a / beta_1;
        const strain = 0.003 * (d - c) / c;

        return {
          As_req: Asf + Asw,
          a,
          c,
          strain,
          case: 'B'
        };
      };

      // Calculate Required steel
      // Left and Right supports represent negative moment, so they are rectangular of width bw
      const leftDesign = designRectSection(sr.Mneg_left, bw);
      const rightDesign = designRectSection(sr.Mneg_right, bw);
      // Midspan is positive moment, so it works as T-beam of flange beff
      const midDesign = designTBeamSection(sr.Mpos);

      // Verify ACI Minimum Flexural Rebar: As_min = max(0.25*sqrt(fc)/fy, 1.4/fy) * bw * d
      // ACI 318-19 §9.6.1.2: but can be reduced to 4/3 of As_req if needed
      const rawAsMin = Math.max((0.25 * Math.sqrt(fc)) / fy, 1.4 / fy) * bw * d;
      
      const calcAsMinGov = (As_req: number) => {
        return Math.min(rawAsMin, (4 / 3) * As_req);
      };

      const As_min_left = calcAsMinGov(leftDesign.As_req);
      const As_min_mid = calcAsMinGov(midDesign.As_req);
      const As_min_right = calcAsMinGov(rightDesign.As_req);

      const As_gov_left = Math.max(leftDesign.As_req, As_min_left);
      const As_gov_mid = Math.max(midDesign.As_req, As_min_mid);
      const As_gov_right = Math.max(rightDesign.As_req, As_min_right);

      // Verify Maximum Ductility limit (strain >= 0.004)
      if (leftDesign.strain < 0.004 && sr.Mneg_left > 0.5) {
        spanWarnings.push(`خلل ليونة (ACI 318-19 §21.2.2): مقطع مسند يسار في ${sr.slabId} تالف بالقصور والضغط المفرط (الانفعال أقل من 0.004). يلزم زيادة عمق مقطع العصب.`);
      }
      if (midDesign.strain < 0.004 && sr.Mpos > 0.5) {
        spanWarnings.push(`خلل ليونة: مقطع منتصف البحرة في ${sr.slabId} مفرط التسليح (الانفعال أقل من 0.004).`);
      }
      if (rightDesign.strain < 0.004 && sr.Mneg_right > 0.5) {
        spanWarnings.push(`خلل ليونة: مقطع مسند يمين في ${sr.slabId} مفرط التسليح (الانفعال أقل من 0.004).`);
      }

      // Convert steel areas to actual rebar selections
      // For ribbed slabs, standard is to provide 2 continuous bottom bars (usually 2Φ12 or 2Φ14)
      // and add negative top reinforcement over the supports.
      const selectBarsForArea = (requiredArea: number): { text: string; area: number; count: number; dia: number } => {
        if (requiredArea <= 1) return { text: '0', area: 0, count: 0, dia: diaMain };
        // We select the count (typically 2 bars for rib web, max 3 bars)
        let count = 2;
        let dia = diaMain;
        let area = count * (Math.PI / 4) * dia * dia;
        
        if (area < requiredArea) {
          // Try larger diameters in steps: 14, 16, 18
          const pool = [12, 14, 16, 18, 20];
          for (const dPool of pool) {
            const trialArea = 2 * (Math.PI / 4) * dPool * dPool;
            if (trialArea >= requiredArea) {
              dia = dPool;
              area = trialArea;
              break;
            }
          }
        }
        
        // If 2 bars of 20mm still insufficient, try 3 bars
        if (area < requiredArea) {
          count = 3;
          dia = diaMain;
          for (const dPool of [12, 14, 16, 18, 20]) {
            const trialArea = 3 * (Math.PI / 4) * dPool * dPool;
            if (trialArea >= requiredArea) {
              dia = dPool;
              area = trialArea;
              break;
            }
          }
        }

        return {
          text: `${count}Φ${dia}`,
          area,
          count,
          dia
        };
      };

      const selectLeft = selectBarsForArea(As_gov_left);
      const selectMid = selectBarsForArea(As_gov_mid);
      const selectRight = selectBarsForArea(As_gov_right);

      // ───────────────────────────────────────────
      // Shear Design: Vu vs Vc
      // ───────────────────────────────────────────
      const phiShear = 0.75;
      // Vc calculation with ACI 318 §9.8.1.5.1: 10% increase for One-Way joist ribs
      const Vc_N = 1.10 * 0.17 * Math.sqrt(fc) * bw * d;
      const Vc = Vc_N / 1000; // kN
      const phiVc = phiShear * Vc;

      // Shear on left and right
      const designShearLeft = Math.abs(sr.Vu_left);
      const designShearRight = Math.abs(sr.Vu_right);

      // Stirrup calculations
      const calcStirrups = (Vu: number): { text: string; Vs: number; spacing: number } => {
        if (Vu <= phiVc) {
          // ACI allows no stirrups when Vu <= phi*Vc in ribbed joists
          return { text: 'خرسانة آمنة (لا يلزم)', Vs: 0, spacing: 0 };
        }

        // Vs = Vu/phi - Vc
        const Vs = (Vu / phiShear) - Vc;
        const Vs_N = Vs * 1000;

        // Shear reinforcement limit to avoid concrete crushing (Vs <= 0.66 * sqrt(fc) * bw * d)
        const maxVsLimit = 0.66 * Math.sqrt(fc) * bw * d / 1000;
        if (Vs > maxVsLimit) {
          spanWarnings.push(`فشل القص (ACI 318-19 §9.7.6.2.2): قوة القص (${Vu.toFixed(1)} kN) تتجاوز قدرة القطاع الكلية للخرسانة وحديد التسليح القصوى.`);
          return { text: 'فشل بالقص! زد الأبعاد', Vs, spacing: 50 };
        }

        // Area of 2-legged shear stirrup
        const Av = 2 * singleStirrupLegArea; // mm2

        // Spacing: s = Av * fyt * d / Vs
        let s_req = (Av * fyt * d) / Vs_N; // mm

        // Spacing limits check (ACI 318-19 Table 9.7.6.2.2)
        // If Vs <= 0.33 * sqrt(fc) * bw * d -> s_max = min(d/2, 600)
        // If Vs > 0.33 * sqrt(fc) * bw * d -> s_max = min(d/4, 300)
        const limitStress = 0.33 * Math.sqrt(fc) * bw * d / 1000;
        const maxAllowS = Vs <= limitStress ? Math.min(d / 2, 600) : Math.min(d / 4, 300);
        
        s_req = Math.min(s_req, maxAllowS);

        // Standard rounding down (e.g., 50, 75, 100, 120, 150, 200 mm)
        let s_rounded = 200;
        if (s_req < 100) s_rounded = 100;
        else if (s_req < 150) s_rounded = 150;
        else s_rounded = 200;

        return {
          text: `Φ${diaShear}@${s_rounded}`,
          Vs,
          spacing: s_rounded
        };
      };

      const leftShear = calcStirrups(designShearLeft);
      const rightShear = calcStirrups(designShearRight);

      // Append span warnings
      ribWarnings.push(...spanWarnings);

      spanDesigns.push({
        spanIndex: idx,
        slabId: sr.slabId,
        L,
        Mneg_left: sr.Mneg_left,
        Mpos: sr.Mpos,
        Mneg_right: sr.Mneg_right,
        Vu_left: sr.Vu_left,
        Vu_right: sr.Vu_right,
        As_req_left: leftDesign.As_req,
        As_req_mid: midDesign.As_req,
        As_req_right: rightDesign.As_req,
        As_min_left,
        As_min_mid,
        As_min_right,
        As_gov_left,
        As_gov_mid,
        As_gov_right,
        midspanCase: midDesign.case,
        a_mid: midDesign.a,
        c_mid: midDesign.c,
        strain_mid: midDesign.strain,
        bars_left: selectLeft.text,
        bars_mid: selectMid.text,
        bars_right: selectRight.text,
        As_prov_left: selectLeft.area,
        As_prov_mid: selectMid.area,
        As_prov_right: selectRight.area,
        Vc,
        Vs_left: leftShear.Vs,
        Vs_right: rightShear.Vs,
        stirrups_left: leftShear.text,
        stirrups_right: rightShear.text,
        minRequiredDepth: minDepthReq,
        isDepthAdequate,
        deflectionLimit: defLimit,
        actualDeflection: actDef,
        deflectionStatus,
        warnings: spanWarnings
      });

      // ───────────────────────────────────────────
      // Detailed reinforcement mapping (BBS Schedule Database)
      // ───────────────────────────────────────────
      // 1. Continuous bottom bars (BOT_CONT)
      // Usually, continuous bottom reinforcement runs across the span, anchoring 150-300mm into support or column
      // To satisfy the required midspan As_gov_mid, we provided selectMid.count bars of dia selectMid.dia
      if (idx === 0) {
        // Create full length continuous bottom bars for the whole rib system
        const wtFactor = (Math.pow(selectMid.dia, 2) / 162.2);
        const continuousBarLength = ribLength + 0.30; // extension into columns
        const finalLength = Math.min(continuousBarLength, 12.0); // max default stock length
        
        ribRebar.push({
          barMark: `B${barMarkCounter++}`,
          type: 'BOT_CONT',
          memberId: ribAnalysis.id,
          diameter: selectMid.dia,
          count: selectMid.count,
          length: finalLength,
          weight: selectMid.count * finalLength * wtFactor,
          startCoord: 0,
          endCoord: finalLength,
          description: `حديد تسليح سفلي رئيسي عصب متصل — كامل الطول ${finalLength.toFixed(2)}م`
        });

        // Handle Lap Splices if total continuous length exceeds 12m stock
        if (continuousBarLength > 12.0) {
          const spliceLength = 1.3 * ((fy * 1.0 * 1.0 * 0.8 * selectMid.dia) / (1.1 * 1.0 * Math.sqrt(fc))) / 1000; // class B splice approx
          const secondPiece = continuousBarLength - 12.0 + spliceLength;
          ribRebar.push({
            barMark: `B${barMarkCounter++}`,
            type: 'BOT_CONT',
            memberId: ribAnalysis.id,
            diameter: selectMid.dia,
            count: selectMid.count,
            length: secondPiece,
            weight: selectMid.count * secondPiece * wtFactor,
            startCoord: 12.0 - spliceLength,
            endCoord: continuousBarLength,
            description: `تكملة تراكب حديد سفلي مستمر — بطول تراكب فني ${spliceLength.toFixed(2)}م`
          });
        }
      }

      // 2. Top negative support bars (TOP_SUPPORT)
      // Interior support negative reinforcement extends by 0.30 * L into the adjacent spans
      // Exterior support extends by 0.25 * L
      const wtLeft = (Math.pow(selectLeft.dia, 2) / 162.2);
      if (selectLeft.count > 0 && As_gov_left > 1.0) {
        const topBarLength = idx === 0 ? (0.25 * L + 0.20) : (0.30 * L); // exterior vs interior
        ribRebar.push({
          barMark: `T${barMarkCounter++}`,
          type: 'TOP_SUPPORT',
          memberId: ribAnalysis.id,
          diameter: selectLeft.dia,
          count: selectLeft.count,
          length: topBarLength,
          weight: selectLeft.count * topBarLength * wtLeft,
          startCoord: Math.max(0, idx === 0 ? 0 : 0.25 * L),
          endCoord: idx === 0 ? topBarLength : topBarLength,
          description: `حديد علوي سالب مسند يسار للبحرة ${sr.slabId}`
        });
      }

      // 3. Stirrups detailing
      if (leftShear.spacing > 0 || rightShear.spacing > 0) {
        // Zone 1: critical shear left (e.g. 1st 25% of span length)
        // Zone 2: middle 50% spacing standard (usually Φ8@150/200)
        // Zone 3: critical shear right (e.g. last 25% of span length)
        const sL = leftShear.spacing || 200;
        const sR = rightShear.spacing || 200;
        
        const countL = Math.ceil((0.25 * L * 1000) / sL);
        const countR = Math.ceil((0.25 * L * 1000) / sR);
        const countM = Math.ceil((0.50 * L * 1000) / 200);

        const stirrupWt = (Math.pow(diaShear, 2) / 162.2);
        const perimeterOfStirrup = 2 * (bw - 30) + 2 * (h - 30); // loop perimeter in mm
        const singleStirrupLength = (perimeterOfStirrup + 100) / 1000; // in m
        
        const totalCount = countL + countM + countR;

        ribRebar.push({
          barMark: `S${barMarkCounter++}`,
          type: 'STIRRUP',
          memberId: ribAnalysis.id,
          diameter: diaShear,
          count: totalCount,
          length: singleStirrupLength,
          weight: totalCount * singleStirrupLength * stirrupWt,
          startCoord: 0,
          endCoord: L,
          description: `كانات مغلقة بقنوات بحرة ${sr.slabId} — توزيع ثلاثي الأجزاء`
        });
      }
    });

    const maxMomentPos = Math.max(...spanDesigns.map(s => s.Mpos), 0);
    const maxMomentNeg = Math.max(...spanDesigns.map(s => Math.max(s.Mneg_left, s.Mneg_right)), 0);
    const maxShear = Math.max(...spanDesigns.map(s => Math.max(s.Vu_left, s.Vu_right)), 0);
    const maxDeflection = Math.max(...spanDesigns.map(s => s.actualDeflection), 0);

    let status: 'SAFE' | 'WARNING' | 'CRITICAL' = 'SAFE';
    if (spanDesigns.some(sd => sd.deflectionStatus === 'FAIL')) {
      status = 'CRITICAL';
    } else if (ribWarnings.length > 0) {
      status = 'WARNING';
    }

    ribs.push({
      ribId: ribAnalysis.id,
      type: ribAnalysis.type,
      direction: ribAnalysis.direction,
      coordinate: ribAnalysis.coordinate,
      tributaryWidth: ribAnalysis.tributaryWidth,
      spans: spanDesigns,
      maxMomentPos,
      maxMomentNeg,
      maxShear,
      maxDeflection,
      status,
      warnings: ribWarnings,
      rebarSchedule: ribRebar
    });

    allWarnings.push(...ribWarnings);
  }

  // ───────────────────────────────────────────
  // 2. Topping Slab Design (Shrinkage & Temperature ACI 318-19 §24.4)
  // ───────────────────────────────────────────
  // rho_ts = 0.0018, thickness = tf (mm). Grid spacing limits = min(5*tf, 450 mm).
  const rho_ts = 0.0018;
  const As_req_topping = rho_ts * 1000 * tf; // mm2 per meter width

  // Select shrinkage rebar. Standard is Φ6 or Φ8
  const toppingBarDia = 8;
  const areaToppingBar = (Math.PI / 4) * toppingBarDia * toppingBarDia;
  let spacingTopping = (areaToppingBar * 1000) / As_req_topping; // mm
  const spacingLimit = Math.min(5 * tf, 450);
  spacingTopping = Math.min(spacingTopping, spacingLimit);
  
  // round down spacing to nearest 50 mm
  let spaceToppingRounded = Math.floor(spacingTopping / 50) * 50;
  if (spaceToppingRounded < 100) spaceToppingRounded = 100;
  if (spaceToppingRounded > 300) spaceToppingRounded = 250; // standard Φ8 @ 200 or 250

  const toppingProvidedAs = (areaToppingBar * 1000) / spaceToppingRounded;
  
  // Topping mesh rebar grid (Arabic desc)
  const rebarGrid = `Φ${toppingBarDia}@${spaceToppingRounded} مم (مفرش شبكي بالاتجاهين)`;
  const toppingWeightSqm = 2 * ((Math.pow(toppingBarDia, 2) / 162.2) * (1000 / spaceToppingRounded)); // 2 directions

  const toppingDesign: ToppingSlabDesign = {
    thickness: tf,
    rebarGrid,
    rhoProvided: toppingProvidedAs / (1000 * tf),
    AsRequired: As_req_topping,
    AsProvided: toppingProvidedAs,
    spacingLimit,
    weightPerSqm: toppingWeightSqm,
    barsInfo: `حديد مقاوم للانكماش والحرارة طبقا للكود الأمريكي ACI 318-19 §24.4 بكلا الاتجاهين.`
  };

  // Add summary details
  let maxMom = 0;
  let maxShearVal = 0;
  let maxDef = 0;
  let controllingId = "";
  let totalRebarWeight = 0;

  ribs.forEach(r => {
    totalRebarWeight += r.rebarSchedule.reduce((s, b) => s + b.weight, 0);
    const m = Math.max(r.maxMomentPos, r.maxMomentNeg);
    if (m > maxMom) {
      maxMom = m;
      controllingId = r.ribId;
    }
    if (r.maxShear > maxShearVal) maxShearVal = r.maxShear;
    if (r.maxDeflection > maxDef) maxDef = r.maxDeflection;
  });

  // Calculate rough slab area from tributary widths & span lengths
  let totalSlabArea = 0;
  ribs.forEach(r => {
    const rLen = r.spans.reduce((s, sp) => s + sp.L, 0);
    totalSlabArea += rLen * r.tributaryWidth;
  });
  if (totalSlabArea === 0) totalSlabArea = 25.0; // safe fallback

  // include topping slab rebar weight in the total weight
  const toppingTotalWeight = toppingWeightSqm * totalSlabArea;
  totalRebarWeight += toppingTotalWeight;

  const designSummary: SlabDesignSummary = {
    controllingRibId: controllingId || "Rib-1",
    maxMoment: maxMom,
    maxShear: maxShearVal,
    maxDeflection: maxDef,
    totalSlabArea,
    totalRebarWeight,
    weightDensity: totalRebarWeight / totalSlabArea
  };

  return {
    ribs,
    topping: toppingDesign,
    summary: designSummary,
    warnings: [...new Set(allWarnings)]
  };
}
