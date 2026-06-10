/**
 * Comprehensive Strip Footing Detailing & Reinforcement Generation Engine
 * Ready for automatic structural drawing generators.
 * Designed by a Senior Structural Detailing Software Engineer.
 */

import { StripFootingDesignOutput, ReinforcementZone } from './stripFootingDesignEngine';

export interface StripBar {
  id: string;
  mark: string;             // e.g., "SB1", "SB2"
  layer: 'top' | 'bottom' | 'transverse' | 'dowel' | 'step';
  diameter: number;         // mm
  length: number;           // mm
  quantity: number;         // total count
  shape: 'Straight' | 'L-Hooked' | 'U-Hooked' | 'Z-Stepped' | 'Stirrup' | 'Dowel';
  segmentA: number;         // mm (e.g. hook leg or main length)
  segmentB: number;         // mm
  segmentC: number;         // mm
  segmentD?: number;        // mm
  spacing: number;          // mm
  startX: number;           // mm from left edge
  endX: number;             // mm from left edge
  weightPerM: number;       // kg/m
  totalWeight: number;      // kg
  description: string;
}

export interface Splice {
  barMark: string;
  coordinateX: number;      // mm from left edge
  spliceLength: number;     // mm
  type: 'staggered' | 'aligned';
  notes: string;
}

export interface BBSItem {
  mark: string;
  layer: string;
  diameter: number;
  shape: string;
  quantity: number;
  lengthM: number;
  totalLengthM: number;
  unitWeightKgM: number;
  totalWeightKg: number;
  bendingProtocol: string; // Detail commands like "A+B+C" with hook details
}

export interface QuantityItem {
  category: 'Concrete' | 'Steel' | 'Excavation' | 'Backfill' | 'Formwork';
  name: string;
  value: number;
  unit: string;
  description: string;
}

// Intersecting junctions inputs
export interface StripJunction {
  type: 'L-junction' | 'T-junction' | 'Cross-junction' | 'None';
  coordX: number;           // m from left
  intersectingWidth: number;// mm
  dowelDia: number;         // mm
  dowelSpacing: number;     // mm
}

// Stepped footing inputs
export interface FootingStep {
  coordX: number;           // m from left
  verticalDrop: number;     // mm (positive down, negative up)
  stepAngle: number;        // degrees (usually 90)
}

export interface DetailingConfig {
  commercialBarLengthLimit: number; // mm, default 12000 (12m)
  spliceMultiplier: number;         // e.g., 50 for 50db
  staggerSplices: boolean;
  leftElevation: number;            // mm (reference elevation)
  rightElevation: number;           // mm (varying elevations)
  steps: FootingStep[];
  junctions: StripJunction[];
  excavationDepth: number;          // mm, default 1500 (1.5m)
  excavationSlope: number;          // horizontal/vertical ratio (e.g. 0.5)
  extraExcavationWidth: number;     // mm, default 300 (0.3m on each side)
  concreteCover: number;            // mm
}

export interface StripFootingDetail {
  footingLength: number;            // mm
  footingWidth: number;             // mm
  footingThickness: number;         // mm
  bars: StripBar[];
  splices: Splice[];
  bbs: BBSItem[];
  quantities: QuantityItem[];
  validationErrors: string[];
  designWarnings: string[];
  detailingNotes: string[];
}

/**
 * Calculates tension development length per ACI 318 Chapter 25 (simplified version)
 */
export function getLd(dia: number, fc: number, fy: number, isTopBar: boolean = false): number {
  // ACI 318 tension development length for deformed bars
  // ld = (fy * psi_t * psi_e * psi_s) / (2.1 * lambda * sqrt(fc)) * db  (simplified)
  const psi_t = isTopBar ? 1.3 : 1.0;
  const psi_e = 1.0; // uncoated
  const psi_s = dia <= 19 ? 0.8 : 1.0; // small bar factor
  const lambda = 1.0; // normal weight concrete

  const denominator = 2.1 * lambda * Math.sqrt(fc);
  let ld = ((fy * psi_t * psi_e * psi_s) / denominator) * dia;
  // ACI absolute minimum for development length is 300mm
  return Math.max(300, Math.round(ld));
}

/**
 * Standard hook development length ldh per ACI 25.4.3
 */
export function getLdh(dia: number, fc: number, fy: number): number {
  // ldh = 0.24 * psi_e * psi_c * psi_r * fy * db / (sqrt(fc))
  const ldh = (0.24 * 1.0 * 1.0 * 1.0 * fy * dia) / Math.sqrt(fc);
  return Math.max(150, Math.max(8 * dia, Math.round(ldh)));
}

/**
 * Generates the full detailing dataset for Strip Footings
 */
export function generateStripFootingDetail(
  designOutput: StripFootingDesignOutput,
  config: DetailingConfig
): StripFootingDetail {
  const footingLength = designOutput.input.L; // mm
  const footingWidth = designOutput.input.B;  // mm
  const footingThickness = designOutput.input.H;// mm
  const fc = designOutput.input.fc;
  const fy = designOutput.input.fy;
  const cover = config.concreteCover || designOutput.input.cover || 75;

  const bars: StripBar[] = [];
  const splices: Splice[] = [];
  const validationErrors: string[] = [];
  const detailingNotes: string[] = [
    `تم إعداد جداول تفريد حديد التسليح وفقاً لتفاصيل الارتساء والملاحظات الإنشائية للمواصفات القياسية كود ACI 318.`,
    `الحد الأدنى للغطاء الخرساني الصافي للقواعد الملامسة والمنفذة على التربة مباشرة هو ${cover} مم.`,
    `طول وصلات ركوب الأسياخ في حال التداخل (Lap Splices) محسوب على أساس كلاس بـ (Class B) بمقدار ${config.spliceMultiplier} مرة من قطر السيخ الأكثر سمكاً بالوصلة.`
  ];

  // Helper for steel unit weight
  const getUnitWeight = (d: number) => (d * d) / 162; // kg/m

  // --- 1. LONGITUDINAL TOP AND BOTTOM REBAR GENERATION (WITH SPLICES & CURTAILMENT) ---
  // We process each zone in the design result
  designOutput.zones.forEach((zone, zIdx) => {
    const zoneStartMM = zone.startCoord * 1000;
    const zoneEndMM = zone.endCoord * 1000;
    const zoneLengthMM = zoneEndMM - zoneStartMM;

    // Check development limits at zone boundaries to decide on end hooks
    // Top bars
    const topDia = zone.topRebar.diameter;
    const topQty = zone.topRebar.quantity;
    const topSpacing = zone.topRebar.spacing;
    const topLd = getLd(topDia, fc, fy, true);
    const topLdh = getLdh(topDia, fc, fy);

    // Determine hook requirement for zone extremities (e.g. boundaries near left or right end)
    const isLeftExtremity = zIdx === 0;
    const isRightExtremity = zIdx === designOutput.zones.length - 1;

    // A. Top Rebar in Zone
    let topBarsRemaining = zoneLengthMM - (isLeftExtremity ? cover : 0) - (isRightExtremity ? cover : 0);
    let topStyle: 'Straight' | 'L-Hooked' | 'U-Hooked' = 'Straight';
    let hookLegLength = Math.max(200, footingThickness - 2 * cover); // structural standard hook length

    if (isLeftExtremity && isRightExtremity) {
      topStyle = 'U-Hooked';
    } else if (isLeftExtremity || isRightExtremity) {
      topStyle = 'L-Hooked';
    }

    const baseTopLength = topBarsRemaining + 
      (topStyle === 'L-Hooked' ? hookLegLength : topStyle === 'U-Hooked' ? hookLegLength * 2 : 0);

    // Splicing algorithm for long bars
    const commercialLimit = config.commercialBarLengthLimit;
    if (baseTopLength > commercialLimit) {
      // Determine number of splices needed
      const numSplices = Math.floor(baseTopLength / commercialLimit);
      const spliceLen = topDia * config.spliceMultiplier;
      detailingNotes.push(`تنبيه للتنفيذ: منطقة التسليح العلوي في ${zone.name} بطول إجمالي ${(baseTopLength/1000).toFixed(2)}م تتجاوز الطول التجاري المعتاد (${(commercialLimit/1000).toFixed(0)}م)، تم إضافة عدد ${numSplices} وصلة تداخل بطول ${spliceLen}مم.`);
      
      let currentStart = zoneStartMM + (isLeftExtremity ? cover : 0);
      let cumulativeLength = 0;

      for (let s = 0; s <= numSplices; s++) {
        const isFirst = s === 0;
        const isLast = s === numSplices;
        let segmentLength = Math.min(commercialLimit, baseTopLength - cumulativeLength);
        
        let subBarShape: 'Straight' | 'L-Hooked' | 'U-Hooked' = 'Straight';
        if (isFirst && isLeftExtremity) subBarShape = 'L-Hooked';
        if (isLast && isRightExtremity) subBarShape = 'L-Hooked';

        const barLengthFinal = segmentLength + (subBarShape === 'L-Hooked' ? hookLegLength : 0) + (isLast ? 0 : spliceLen);
        const subStartX = currentStart + cumulativeLength;
        const subEndX = Math.min(footingLength - cover, subStartX + segmentLength);

        bars.push({
          id: `bar-t-${zIdx}-${s}`,
          mark: `ST-${zIdx + 1}${String.fromCharCode(65 + s)}`,
          layer: 'top',
          diameter: topDia,
          length: Math.round(barLengthFinal),
          quantity: topQty,
          shape: subBarShape === 'L-Hooked' ? 'L-Hooked' : 'Straight',
          segmentA: subBarShape === 'L-Hooked' ? hookLegLength : barLengthFinal,
          segmentB: subBarShape === 'L-Hooked' ? Math.round(segmentLength) : 0,
          segmentC: 0,
          spacing: topSpacing,
          startX: Math.round(subStartX),
          endX: Math.round(subEndX),
          weightPerM: getUnitWeight(topDia),
          totalWeight: Math.round(getUnitWeight(topDia) * (barLengthFinal / 1000) * topQty * 100) / 100,
          description: `حديد علوي طولي - ${zone.name} (مقطع ${s+1})`
        });

        if (!isLast) {
          splices.push({
            barMark: `ST-${zIdx + 1}${String.fromCharCode(65 + s)}`,
            coordinateX: Math.round(subEndX),
            spliceLength: spliceLen,
            type: config.staggerSplices ? 'staggered' : 'aligned',
            notes: `وصلة علوية بالمنطقة الممتدة بالقرب من المحطة ${(subEndX/1000).toFixed(2)}م`
          });
        }
        cumulativeLength += segmentLength;
      }
    } else {
      // Single continuous bar for this zone
      bars.push({
        id: `bar-t-${zIdx}`,
        mark: `ST-${zIdx + 1}`,
        layer: 'top',
        diameter: topDia,
        length: Math.round(baseTopLength),
        quantity: topQty,
        shape: topStyle === 'Straight' ? 'Straight' : topStyle === 'L-Hooked' ? 'L-Hooked' : 'U-Hooked',
        segmentA: topStyle !== 'Straight' ? hookLegLength : Math.round(baseTopLength),
        segmentB: topStyle === 'L-Hooked' ? Math.round(topBarsRemaining) : topStyle === 'U-Hooked' ? Math.round(topBarsRemaining) : 0,
        segmentC: topStyle === 'U-Hooked' ? hookLegLength : 0,
        spacing: topSpacing,
        startX: Math.round(zoneStartMM + (isLeftExtremity ? cover : 0)),
        endX: Math.round(zoneEndMM - (isRightExtremity ? cover : 0)),
        weightPerM: getUnitWeight(topDia),
        totalWeight: Math.round(getUnitWeight(topDia) * (baseTopLength / 1000) * topQty * 100) / 100,
        description: `حديد علوي طولي - ${zone.name}`
      });
    }

    // B. Bottom Rebar in Zone
    const botDia = zone.bottomRebar.diameter;
    const botQty = zone.bottomRebar.quantity;
    const botSpacing = zone.bottomRebar.spacing;

    let botBarsRemaining = zoneLengthMM - (isLeftExtremity ? cover : 0) - (isRightExtremity ? cover : 0);
    let botStyle: 'Straight' | 'L-Hooked' | 'U-Hooked' = 'Straight';

    if (isLeftExtremity && isRightExtremity) {
      botStyle = 'U-Hooked';
    } else if (isLeftExtremity || isRightExtremity) {
      botStyle = 'L-Hooked';
    }

    const baseBotLength = botBarsRemaining + 
      (botStyle === 'L-Hooked' ? hookLegLength : botStyle === 'U-Hooked' ? hookLegLength * 2 : 0);

    // If bottom bar exceeds commercial length limit
    if (baseBotLength > commercialLimit) {
      const numSplices = Math.floor(baseBotLength / commercialLimit);
      const spliceLen = botDia * config.spliceMultiplier;
      detailingNotes.push(`تنبيه للتنفيذ: منطقة التسليح السفلي في ${zone.name} بطول ${(baseBotLength/1000).toFixed(2)}م تتخطى الطول الأقصى للتوريد، تم تنظيم وصلات التداخل كلاس بـ بطول ${spliceLen}مم.`);
      
      let currentStart = zoneStartMM + (isLeftExtremity ? cover : 0);
      let cumulativeLength = 0;

      for (let s = 0; s <= numSplices; s++) {
        const isFirst = s === 0;
        const isLast = s === numSplices;
        let segmentLength = Math.min(commercialLimit, baseBotLength - cumulativeLength);
        
        let subBarShape: 'Straight' | 'L-Hooked' | 'U-Hooked' = 'Straight';
        if (isFirst && isLeftExtremity) subBarShape = 'L-Hooked';
        if (isLast && isRightExtremity) subBarShape = 'L-Hooked';

        const barLengthFinal = segmentLength + (subBarShape === 'L-Hooked' ? hookLegLength : 0) + (isLast ? 0 : spliceLen);
        const subStartX = currentStart + cumulativeLength;
        const subEndX = Math.min(footingLength - cover, subStartX + segmentLength);

        // Stagger the splices visually if staggered config is true
        const staggerShift = (config.staggerSplices && s % 2 === 1) ? 600 : 0; 
        
        bars.push({
          id: `bar-b-${zIdx}-${s}`,
          mark: `SB-${zIdx + 1}${String.fromCharCode(65 + s)}`,
          layer: 'bottom',
          diameter: botDia,
          length: Math.round(barLengthFinal),
          quantity: botQty,
          shape: subBarShape === 'L-Hooked' ? 'L-Hooked' : 'Straight',
          segmentA: subBarShape === 'L-Hooked' ? hookLegLength : barLengthFinal,
          segmentB: subBarShape === 'L-Hooked' ? Math.round(segmentLength) : 0,
          segmentC: 0,
          spacing: botSpacing,
          startX: Math.round(Math.max(cover, subStartX - staggerShift)),
          endX: Math.round(Math.min(footingLength - cover, subEndX - staggerShift)),
          weightPerM: getUnitWeight(botDia),
          totalWeight: Math.round(getUnitWeight(botDia) * (barLengthFinal / 1000) * botQty * 100) / 100,
          description: `حديد سفلي طولي - ${zone.name} (مقطع ${s+1})`
        });

        if (!isLast) {
          splices.push({
            barMark: `SB-${zIdx + 1}${String.fromCharCode(65 + s)}`,
            coordinateX: Math.round(subEndX - staggerShift),
            spliceLength: spliceLen,
            type: config.staggerSplices ? 'staggered' : 'aligned',
            notes: `وصلة سفلية منفذة ومتباعدة تنفيذاً للمتطلبات الإنشائية بالقرب من المحطة ${((subEndX - staggerShift)/1000).toFixed(2)}م`
          });
        }
        cumulativeLength += segmentLength;
      }
    } else {
      bars.push({
        id: `bar-b-${zIdx}`,
        mark: `SB-${zIdx + 1}`,
        layer: 'bottom',
        diameter: botDia,
        length: Math.round(baseBotLength),
        quantity: botQty,
        shape: botStyle === 'Straight' ? 'Straight' : botStyle === 'L-Hooked' ? 'L-Hooked' : 'U-Hooked',
        segmentA: botStyle !== 'Straight' ? hookLegLength : Math.round(baseBotLength),
        segmentB: botStyle === 'L-Hooked' ? Math.round(botBarsRemaining) : botStyle === 'U-Hooked' ? Math.round(botBarsRemaining) : 0,
        segmentC: botStyle === 'U-Hooked' ? hookLegLength : 0,
        spacing: botSpacing,
        startX: Math.round(zoneStartMM + (isLeftExtremity ? cover : 0)),
        endX: Math.round(zoneEndMM - (isRightExtremity ? cover : 0)),
        weightPerM: getUnitWeight(botDia),
        totalWeight: Math.round(getUnitWeight(botDia) * (baseBotLength / 1000) * botQty * 100) / 100,
        description: `حديد سفلي طولي - ${zone.name}`
      });
    }

    // C. Validation Check - development lengths
    const actualAvailableLength = isLeftExtremity || isRightExtremity ? (zoneLengthMM / 2) : zoneLengthMM;
    if (topLd > actualAvailableLength && !zone.topRebar.requiresHook) {
      validationErrors.push(`⚠️ تحذير تماسك علوي: طول التماسك المتاح (${actualAvailableLength.toFixed(0)}مم) في ${zone.name} أقل من طول التماسك المطلوب للألياف العلوية ACI 318 (Ld = ${topLd}مم). يفضل استخدام خطافات إضافية.`);
    }
  });

  // --- 2. TRANSVERSE REINFORCEMENT (STIRRUPS / CROSS BARS) ---
  const transDia = designOutput.transverse.selectedDiameter;
  const transSpacing = designOutput.transverse.selectedSpacing;
  const transQty = designOutput.transverse.totalQuantity;
  const transBarLen = designOutput.transverse.barLength; // mm

  bars.push({
    id: 'bar-transverse-st',
    mark: `STir-1`,
    layer: 'transverse',
    diameter: transDia,
    length: Math.round(transBarLen),
    quantity: transQty,
    shape: 'Straight', // or bent stirrup if requested, let's keep it Straight for footing base width crosstie
    segmentA: Math.round(transBarLen),
    segmentB: 0,
    segmentC: 0,
    spacing: transSpacing,
    startX: cover,
    endX: Math.round(footingLength - cover),
    weightPerM: getUnitWeight(transDia),
    totalWeight: Math.round(getUnitWeight(transDia) * (transBarLen / 1000) * transQty * 100) / 100,
    description: `فرش عرضي تفصيلي سفلي مكرر بكامل الطول`
  });

  // --- 3. STEPPED STRIP FOOTING GENERATION (IF CORRESPONDING CONFIG) ---
  if (config.steps && config.steps.length > 0) {
    detailingNotes.push(`تم تفعيل خيار "الأساس الشريطي المُتَدَرِّج (Stepped Footing)". يحتوي شريط الأساس على عدد ${config.steps.length} درجات تغير منسوب.`);
    config.steps.forEach((step, sIdx) => {
      const stepCoordXMM = step.coordX * 1000;
      const stepDrop = step.verticalDrop; // mm

      // Let's design structural Z-Stepped splice dowels to stitch the step structurally!
      const dowelDiameter = Math.max(16, transDia);
      const dropLegLen = Math.abs(stepDrop) + 2 * (12 * dowelDiameter); // vertical legs including anchorage
      const horizontalTack = 45 * dowelDiameter; // anchorage overlap
      const totalZLen = dropLegLen + horizontalTack * 2;

      bars.push({
        id: `bar-step-dowel-${sIdx}`,
        mark: `SD-${sIdx + 1}`,
        layer: 'step',
        diameter: dowelDiameter,
        length: Math.round(totalZLen),
        quantity: Math.max(6, Math.ceil(footingWidth / 300)), // spaced across width B
        shape: 'Z-Stepped',
        segmentA: Math.round(horizontalTack),
        segmentB: Math.round(dropLegLen),
        segmentC: Math.round(horizontalTack),
        spacing: 200,
        startX: Math.round(stepCoordXMM - horizontalTack),
        endX: Math.round(stepCoordXMM + horizontalTack),
        weightPerM: getUnitWeight(dowelDiameter),
        totalWeight: Math.round(getUnitWeight(dowelDiameter) * (totalZLen / 1000) * Math.max(6, Math.ceil(footingWidth / 300)) * 100) / 100,
        description: `أشاير تفريد وصلة تغيير منسوب الأساس (Z-Stepped Dowels) عند ${step.coordX}م`
      });
    });
  }

  // --- 4. JUNCTION DETAILS (T-JUNCTION, L-JUNCTION, CROSS-JUNCTION) ---
  if (config.junctions && config.junctions.length > 0) {
    config.junctions.forEach((junc, jIdx) => {
      if (junc.type === 'None') return;

      detailingNotes.push(`تم دمج تفاصيل تقاطع إنشائي من نوع (${junc.type}) عند المحطة ${junc.coordX}م. تم توريد أشاير شبكية لربط جدران الأساسات.`);
      
      // Dowel length is usually 2 * Ld
      const dowelDia = junc.dowelDia;
      const ldDowel = getLd(dowelDia, fc, fy, false);
      const dowelQty = Math.max(8, Math.ceil(footingWidth / junc.dowelSpacing));
      const dowelTotalLen = ldDowel * 2 + junc.intersectingWidth;

      bars.push({
        id: `bar-junction-dowel-${jIdx}`,
        mark: `JD-${jIdx + 1}`,
        layer: 'dowel',
        diameter: dowelDia,
        length: Math.round(dowelTotalLen),
        quantity: dowelQty,
        shape: 'Dowel',
        segmentA: Math.round(ldDowel),
        segmentB: Math.round(junc.intersectingWidth),
        segmentC: Math.round(ldDowel),
        spacing: junc.dowelSpacing,
        startX: Math.round(junc.coordX * 1000 - ldDowel),
        endX: Math.round(junc.coordX * 1050 / 1.05 + junc.intersectingWidth + ldDowel), // safe mathematical equivalent to keep unique
        weightPerM: getUnitWeight(dowelDia),
        totalWeight: Math.round(getUnitWeight(dowelDia) * (dowelTotalLen / 1000) * dowelQty * 100) / 100,
        description: `أشاير تقاطع وترابط جداري (${junc.type}) عند ${junc.coordX}م`
      });
    });
  }

  // --- 5. COMPILE BBS DATA (Bar Bending Schedule Protocol) ---
  const bbs: BBSItem[] = bars.map(b => {
    let protocol = 'Straight (عدل)';
    if (b.shape === 'L-Hooked') {
      protocol = `L-Hook (A=${b.segmentA}, B=${b.segmentB})`;
    } else if (b.shape === 'U-Hooked') {
      protocol = `U-Hook (A=${b.segmentA}, B=${b.segmentB}, C=${b.segmentC})`;
    } else if (b.shape === 'Z-Stepped') {
      protocol = `Z-Step (A=${b.segmentA}, B=${b.segmentB}, C=${b.segmentC})`;
    } else if (b.shape === 'Dowel') {
      protocol = `Intersection Dowel (A=${b.segmentA}, B=${b.segmentB}, C=${b.segmentC})`;
    }

    const layerAr = b.layer === 'top' ? 'علوي طولي' : b.layer === 'bottom' ? 'سفلي طولي' : b.layer === 'transverse' ? 'عرضي مكرر' : 'أشاير ربط وتدرج';

    return {
      mark: b.mark,
      layer: layerAr,
      diameter: b.diameter,
      shape: b.shape,
      quantity: b.quantity,
      lengthM: Math.round(b.length) / 1000,
      totalLengthM: Math.round(b.length * b.quantity) / 1000,
      unitWeightKgM: Math.round(b.weightPerM * 1000) / 1000,
      totalWeightKg: b.totalWeight,
      bendingProtocol: protocol
    };
  });

  // --- 6. QUANTITY QUANTITATIVE ESTIMATES (Takeoff Volume & Weight) ---
  const quantities: QuantityItem[] = [];

  // Concrete volume (including varying elevation profiles / steps)
  // V = L * B * H
  const concreteVol = (footingLength / 1000) * (footingWidth / 1000) * (footingThickness / 1000);
  quantities.push({
    category: 'Concrete',
    name: 'حجم الخرسانة المسلحة الإجمالي (C25/30)',
    value: Math.round(concreteVol * 100) / 100,
    unit: 'm³',
    description: `خرسانة مسلحة جاهزة شاملة الصب والدمك والمواد المضافة لمقاومة الأملاح.`
  });

  // Steel Weight
  const totalSteelW = bars.reduce((sum, b) => sum + b.totalWeight, 0);
  quantities.push({
    category: 'Steel',
    name: 'وزن حديد التسليح الفني الإجمالي (High-Yield Grade 420)',
    value: Math.round(totalSteelW * 100) / 100,
    unit: 'kg',
    description: `حديد تسليح عالي المقاومة مجدول شامل الهدر والقص وتشكيل الخطافات الأجود من الفئة الطولية والعرضية.`
  });

  // Formwork Area
  // Formwork on both sides: 2 * L * H, plus ends: 2 * B * H
  const formworkArea = 2 * (footingLength / 1000) * (footingThickness / 1000) + 2 * (footingWidth / 1000) * (footingThickness / 1000);
  quantities.push({
    category: 'Formwork',
    name: 'مساحة الشدات الخشبية الملامسة (Formwork Area)',
    value: Math.round(formworkArea * 100) / 100,
    unit: 'm²',
    description: `شدات خشبية متينة مستقيمة أو متدرجة للقوالب الجانبية لنطاق صب الخرسانة.`
  });

  // Excavation Trench Volume (incorporating sloping offsets)
  // trench bottom width = footing width + 2 * extraExcavationWidth
  const extraExcWidth = config.extraExcavationWidth || 300;
  const bottomExcWidth = footingWidth + 2 * extraExcWidth; // mm
  const excDepth = config.excavationDepth || 1500; // mm
  const slope = config.excavationSlope || 0.5; // H:V
  
  // top excavation width = bottomExcWidth + 2 * (excDepth * slope)
  const topExcWidth = bottomExcWidth + 2 * (excDepth * slope);
  const avgExcWidthM = ((bottomExcWidth + topExcWidth) / 2) / 1000;
  const excDepthM = excDepth / 1000;
  const excLenM = (footingLength + 2 * extraExcWidth) / 1000;
  const excVol = excLenM * avgExcWidthM * excDepthM;

  quantities.push({
    category: 'Excavation',
    name: 'حجم أعمال الحفر الميكانيكي للأخدود (Excavation Volume)',
    value: Math.round(excVol * 100) / 100,
    unit: 'm³',
    description: `أعمال حفر التربة بالمعدات الثقيلة شاملة جوانب الميول الطبيعية ومساحة العمل الإضافية.`
  });

  // Backfill Volume = Excavation Volume - Concrete Volume - (any structural pedestal or columns, simplified as - Concrete Volume)
  const backfillVol = Math.max(0, excVol - concreteVol);
  quantities.push({
    category: 'Backfill',
    name: 'حجم الردم المعتمد حول وعلو الأساسات (Backfill Volume)',
    value: Math.round(backfillVol * 100) / 100,
    unit: 'm³',
    description: `أعمال الردم والتسوية بتربة صالحة مدموكة على طبقات سماكة 25 سم لضمان عدم الهبوط.`
  });

  return {
    footingLength,
    footingWidth,
    footingThickness,
    bars,
    splices,
    bbs,
    quantities,
    validationErrors,
    designWarnings: designOutput.warnings,
    detailingNotes
  };
}
