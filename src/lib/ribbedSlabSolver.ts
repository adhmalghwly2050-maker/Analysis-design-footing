import type { Slab, SlabProps, MatProps } from './structuralEngine';
import { analyzeByMomentDistribution, type MDNode, type MDElement, type MDResult } from './momentDistribution';

// ==========================================
// 1. ACI Code Verification Checks (ACI 318-19 §9.8)
// ==========================================
export interface RibbedSlabValidationResult {
  valid: boolean;
  warnings: string[];
}

export function validateRibbedSlab(props: any): RibbedSlabValidationResult {
  const warnings: string[] = [];

  const bw = props?.bw ?? 100;
  const tf = props?.tf ?? 70;
  const hb = props?.hb ?? 200;
  const s = props?.s ?? 400;

  // ACI 318-19 §9.8.1.1: Clear spacing between ribs s <= 30 in (762 mm)
  if (s > 762) {
    warnings.push(`تحذير (ACI 318-19 §9.8.1.1): المسافة الصافية بين الأعصاب (${s} مم) تتجاوز الحد الأقصى المسموح به كودياً وهو 762 مم.`);
  }

  // ACI 318-19 §9.8.1.2: Width of ribs bw >= 4 in (100 mm او 101.6 مم)
  if (bw < 100) {
    warnings.push(`تحذير (ACI 318-19 §9.8.1.2): عرض العصب (${bw} مم) أقل من الحد الأدنى كودياً وهو 100 مم.`);
  }

  // ACI 318-19 §9.8.1.3: Total depth of joist <= 3.5 * minimum width of web (bw)
  const totalDepth = tf + hb;
  if (totalDepth > 3.5 * bw) {
    warnings.push(`تحذير (ACI 318-19 §9.8.1.3): الارتفاع الكلي للاعصاب (${totalDepth} مم) يتجاوز 3.5 أضعاف عرض العصب (${(3.5 * bw).toFixed(0)} مم).`);
  }

  // ACI 318-19 §9.8.1.4: Slab thickness tf shall be at least the greater of 2 in (50 mm) and s/12
  const minTfLimit = Math.max(50, s / 12);
  if (tf < minTfLimit) {
    warnings.push(`تحذير (ACI 318-19 §9.8.1.4): سمك بلاطة التغطية العلوية (${tf} مم) أقل من الحد الأدنى المطلوب كودياً وهو ${minTfLimit.toFixed(1)} مم (الأكبر من 50 مم أو s/12).`);
  }

  // Geometric validity checks
  if (bw <= 0 || tf <= 0 || hb <= 0 || s <= 0) {
    warnings.push('خطأ هندسي: أبعاد البلاطة المضلعة يجب أن تكون أكبر من الصفر.');
  }

  return {
    valid: warnings.length === 0,
    warnings,
  };
}

// ==========================================
// 2. T-Beam Section Properties
// ==========================================
export interface TBeamProperties {
  beff: number; // Effective flange width (mm)
  tf: number;   // Flange thickness (mm)
  bw: number;   // Web width (mm)
  hb: number;   // Web depth (mm)
  h: number;    // Total height (mm)
  area: number; // Gross cross-sectional area (mm2)
  ybar: number; // Centroid from bottom of rib (mm)
  Ix: number;   // Moment of Inertia about major axis (mm4)
  Iy: number;   // Moment of Inertia about minor axis (mm4)
  Sx_top: number;   // Section modulus at top flange (mm3)
  Sx_bottom: number; // Section modulus at bottom rib (mm3)
}

export function calculateTBeamProperties(
  bw: number,
  hb: number,
  tf: number,
  s: number,
  isEdge: boolean = false
): TBeamProperties {
  const h = tf + hb;
  // ACI 318-19 §9.8.1.6: Effective flange width beff equal to rib spacing for interior ribs.
  // For edge ribs, flange is on one side, so effective width is bw + s/2
  const beff = isEdge ? (bw + s / 2) : (bw + s);

  // Gross area
  const area = (beff * tf) + (bw * hb);

  // Centroid from bottom of rib
  const y_web = hb / 2;
  const y_flange = hb + tf / 2;
  const ybar = ((bw * hb * y_web) + (beff * tf * y_flange)) / area;

  // Moment of Inertia Ix (Parallel Axis Theorem)
  const I_web = (bw * Math.pow(hb, 3)) / 12;
  const I_flange = (beff * Math.pow(tf, 3)) / 12;
  const Ix = I_web + (bw * hb * Math.pow(ybar - y_web, 2)) +
             I_flange + (beff * tf * Math.pow(ybar - y_flange, 2));

  // Moment of Inertia Iy
  // Web is symmetrical and flange is symmetrical about Y axis (approximate for edge rib)
  const Iy = (tf * Math.pow(beff, 3)) / 12 + (hb * Math.pow(bw, 3)) / 12;

  // Section Modulus
  const Sx_top = Ix / (h - ybar);
  const Sx_bottom = Ix / ybar;

  return {
    beff,
    tf,
    bw,
    hb,
    h,
    area,
    ybar,
    Ix,
    Iy,
    Sx_top,
    Sx_bottom,
  };
}

// ==========================================
// 3. Rib Model Generation & Structural Analysis
// ==========================================
export interface AnalyticalRibSpan {
  slabId: string;
  spanLength: number; // Clear span length (m)
  startCoord: number;
  endCoord: number;
}

export interface AnalyticalRib {
  id: string; // e.g. Rib-X1, Rib-Y4
  type: 'interior' | 'edge';
  direction: 'X' | 'Y';
  coordinate: number; // fixed coordinate along the spacing axis
  tributaryWidth: number; // m
  spans: AnalyticalRibSpan[];
  
  // Applied Loading (kN/m)
  toppingWeight: number;
  ribConcreteWeight: number;
  fillerWeight: number;
  finishesLoad: number;
  liveLoad: number;
  wDL: number; // total dead
  wLL: number; // total live
  wu: number;  // factored load (1.2 DL + 1.6 LL) kN/m
  
  // Section properties (gross)
  sectionProperties: TBeamProperties;

  // Analysis result
  maxPositiveMoment: number; // kN.m
  maxNegativeMoment: number; // kN.m
  maxShear: number;          // kN
  maxDeflection: number;     // mm
  reactions: number[];       // kN at supports
  
  // Detailed spans results for diagrams & text
  spanResults: {
    slabId: string;
    L: number;
    Mneg_left: number;
    Mpos: number;
    Mneg_right: number;
    Vu_left: number;
    Vu_right: number;
    maxDeflection: number;
    diagram: { x: number; shear: number; moment: number; deflection: number }[];
  }[];
}

export interface RibbedSlabAnalysisResult {
  ribs: AnalyticalRib[];
  controllingRib: AnalyticalRib | null;
  validation: RibbedSlabValidationResult;
  totalRibsCount: number;
  stats: {
    maxMpos: number;
    maxMneg: number;
    maxVu: number;
    maxDelta: number;
  };
}

/**
 * Automatically groups adjacent one-way ribbed slabs and generates individual analytical T-beam ribs.
 * Solves them using the Hardy Cross Moment Distribution module.
 */
export function analyzeOneWayRibbedSystem(
  slabs: Slab[],
  slabProps: SlabProps,
  mat: MatProps,
  ribbedSlabProps: any
): RibbedSlabAnalysisResult {
  const validation = validateRibbedSlab(ribbedSlabProps);
  const ribs: AnalyticalRib[] = [];

  const bw = ribbedSlabProps?.bw ?? 100;
  const tf = ribbedSlabProps?.tf ?? 70;
  const hb = ribbedSlabProps?.hb ?? 200;
  const s = ribbedSlabProps?.s ?? 400;
  const fillerType = ribbedSlabProps?.fillerType ?? 'block';

  // 1. Group slabs by adjacency to form ribbed systems
  // We separate HORIZONTAL (X-direction) ribs and VERTICAL (Y-direction) ribs
  const userRibbedSlabs = slabs.filter(s => s.slabType === 'one_way_ribbed');
  if (userRibbedSlabs.length === 0) {
    return { ribs: [], controllingRib: null, validation, totalRibsCount: 0, stats: { maxMpos: 0, maxMneg: 0, maxVu: 0, maxDelta: 0 } };
  }

  const EPS = 0.05;
  const spacingM = (bw + s) / 1000; // center-to-center spacing in meters
  if (spacingM <= 0) {
    return { ribs: [], controllingRib: null, validation, totalRibsCount: 0, stats: { maxMpos: 0, maxMneg: 0, maxVu: 0, maxDelta: 0 } };
  }

  // Material Concrete Ec = 4700 * sqrt(fc) in MPa
  const fc = mat.fc || 25;
  const Ec = 4700 * Math.sqrt(fc); // MPa = N/mm2

  // ----------------------------------------------------
  // Helper: process contiguous chains in given direction
  // ----------------------------------------------------
  const buildAndAnalyzeRibs = (direction: 'X' | 'Y') => {
    // Collect slabs whose rib direction matches this axis
    // direction is 'X' flag corresponds to direction 'one_way_x' or 'X' or 'auto' (if dominant is X)
    const matchingSlabs = userRibbedSlabs.filter(sl => {
      const dir = (sl.direction || 'auto').toUpperCase();
      if (direction === 'X') {
        return dir === 'ONE_WAY_X' || dir === 'X' || dir === 'AUTO';
      } else {
        return dir === 'ONE_WAY_Y' || dir === 'Y';
      }
    });

    if (matchingSlabs.length === 0) return;

    // We can group slabs that lie within the same band
    if (direction === 'X') {
      // Group by horizontal bands
      const yCoords = matchingSlabs.flatMap(s => [Math.min(s.y1, s.y2), Math.max(s.y1, s.y2)]);
      const uniqueY = [...new Set(yCoords)].sort((a, b) => a - b);
      
      const distinctY: number[] = [];
      for (const y of uniqueY) {
        if (distinctY.length === 0 || Math.abs(y - distinctY[distinctY.length - 1]) > EPS) {
          distinctY.push(y);
        }
      }

      let ribCounter = 1;

      for (let yi = 0; yi < distinctY.length - 1; yi++) {
        const yLow = distinctY[yi];
        const yHigh = distinctY[yi + 1];
        const yMid = (yLow + yHigh) / 2;
        const totalBandWidth = yHigh - yLow;

        // Slabs in this X band
        const bandSlabs = matchingSlabs.filter(s => {
          const sMinY = Math.min(s.y1, s.y2);
          const sMaxY = Math.max(s.y1, s.y2);
          return sMinY <= yLow + EPS && sMaxY >= yHigh - EPS;
        });

        if (bandSlabs.length === 0) continue;

        // Sort by X coordinate and group into continuous chains
        const sorted = [...bandSlabs].sort((a, b) => Math.min(a.x1, a.x2) - Math.min(b.x1, b.x2));
        const chains: Slab[][] = [];
        let currentChain: Slab[] = [sorted[0]];

        for (let i = 1; i < sorted.length; i++) {
          const prevEnd = Math.max(currentChain[currentChain.length - 1].x1, currentChain[currentChain.length - 1].x2);
          const nextStart = Math.min(sorted[i].x1, sorted[i].x2);
          if (Math.abs(prevEnd - nextStart) < EPS) {
            currentChain.push(sorted[i]);
          } else {
            chains.push(currentChain);
            currentChain = [sorted[i]];
          }
        }
        chains.push(currentChain);

        // For each chain, generate individual parallel joists
        for (const chain of chains) {
          const numRibs = Math.max(1, Math.floor(totalBandWidth / spacingM));
          
          for (let r = 0; r < numRibs; r++) {
            const isEdge = r === 0 || r === numRibs - 1;
            const ribCoord = yLow + spacingM * (r + 0.5);
            const ribId = `Rib-X${ribCounter++}`;

            // Calculate Tributary Width of this specific rib
            // Edge rib has half of the clear spacing + half of the rib web width
            const tribWidth = isEdge ? (bw + s / 2) / 1000 : spacingM;

            // Generate analytical spans
            const analyticalSpans: AnalyticalRibSpan[] = chain.map(s => ({
              slabId: s.id,
              spanLength: Math.abs(s.x2 - s.x1),
              startCoord: Math.min(s.x1, s.x2),
              endCoord: Math.max(s.x1, s.x2),
            }));

            // Solve rib
            const analyzedRib = solveAnalyticalRib(
              ribId,
              'X',
              isEdge ? 'edge' : 'interior',
              ribCoord,
              tribWidth,
              analyticalSpans,
              bw, hb, tf, s, fillerType, mat, slabProps, Ec
            );

            ribs.push(analyzedRib);
          }
        }
      }
    } else {
      // Group by vertical bands (Y direction ribs)
      const xCoords = matchingSlabs.flatMap(s => [Math.min(s.x1, s.x2), Math.max(s.x1, s.x2)]);
      const uniqueX = [...new Set(xCoords)].sort((a, b) => a - b);

      const distinctX: number[] = [];
      for (const x of uniqueX) {
        if (distinctX.length === 0 || Math.abs(x - distinctX[distinctX.length - 1]) > EPS) {
          distinctX.push(x);
        }
      }

      let ribCounter = 1;

      for (let xi = 0; xi < distinctX.length - 1; xi++) {
        const xLow = distinctX[xi];
        const xHigh = distinctX[xi + 1];
        const xMid = (xLow + xHigh) / 2;
        const totalBandWidth = xHigh - xLow;

        // Slabs in this Y band
        const bandSlabs = matchingSlabs.filter(s => {
          const sMinX = Math.min(s.x1, s.x2);
          const sMaxX = Math.max(s.x1, s.x2);
          return sMinX <= xLow + EPS && sMaxX >= xHigh - EPS;
        });

        if (bandSlabs.length === 0) continue;

        // Sort by Y coordinate and group into chains
        const sorted = [...bandSlabs].sort((a, b) => Math.min(a.y1, a.y2) - Math.min(b.y1, b.y2));
        const chains: Slab[][] = [];
        let currentChain: Slab[] = [sorted[0]];

        for (let i = 1; i < sorted.length; i++) {
          const prevEnd = Math.max(currentChain[currentChain.length - 1].y1, currentChain[currentChain.length - 1].y2);
          const nextStart = Math.min(sorted[i].y1, sorted[i].y2);
          if (Math.abs(prevEnd - nextStart) < EPS) {
            currentChain.push(sorted[i]);
          } else {
            chains.push(currentChain);
            currentChain = [sorted[i]];
          }
        }
        chains.push(currentChain);

        // Generate ribbed parallel joists for Y direction
        for (const chain of chains) {
          const numRibs = Math.max(1, Math.floor(totalBandWidth / spacingM));
          
          for (let r = 0; r < numRibs; r++) {
            const isEdge = r === 0 || r === numRibs - 1;
            const ribCoord = xLow + spacingM * (r + 0.5);
            const ribId = `Rib-Y${ribCounter++}`;

            const tribWidth = isEdge ? (bw + s / 2) / 1000 : spacingM;

            const analyticalSpans: AnalyticalRibSpan[] = chain.map(s => ({
              slabId: s.id,
              spanLength: Math.abs(s.y2 - s.y1),
              startCoord: Math.min(s.y1, s.y2),
              endCoord: Math.max(s.y1, s.y2),
            }));

            const analyzedRib = solveAnalyticalRib(
              ribId,
              'Y',
              isEdge ? 'edge' : 'interior',
              ribCoord,
              tribWidth,
              analyticalSpans,
              bw, hb, tf, s, fillerType, mat, slabProps, Ec
            );

            ribs.push(analyzedRib);
          }
        }
      }
    }
  };

  buildAndAnalyzeRibs('X');
  buildAndAnalyzeRibs('Y');

  // Compute stats and find the controlling rib
  let controllingRib: AnalyticalRib | null = null;
  let maxMpos = 0, maxMneg = 0, maxVu = 0, maxDelta = 0;

  for (const rib of ribs) {
    if (rib.maxPositiveMoment > maxMpos) maxMpos = rib.maxPositiveMoment;
    if (rib.maxNegativeMoment > maxMneg) maxMneg = rib.maxNegativeMoment;
    if (rib.maxShear > maxVu) maxVu = rib.maxShear;
    if (rib.maxDeflection > maxDelta) maxDelta = rib.maxDeflection;

    // Controlling rib criteria: maximum design flexural moment or shear force
    if (!controllingRib) {
      controllingRib = rib;
    } else {
      const controllingForce = Math.max(controllingRib.maxPositiveMoment, controllingRib.maxNegativeMoment);
      const currentForce = Math.max(rib.maxPositiveMoment, rib.maxNegativeMoment);
      if (currentForce > controllingForce || (currentForce === controllingForce && rib.maxShear > controllingRib.maxShear)) {
        controllingRib = rib;
      }
    }
  }

  return {
    ribs,
    controllingRib,
    validation,
    totalRibsCount: ribs.length,
    stats: {
      maxMpos,
      maxMneg,
      maxVu,
      maxDelta,
    },
  };
}

/**
 * Computes self-weight, loads, EI, stiffness, and performs elastic Hardy Cross Moment Distribution
 * computation for a single generated Rib joist.
 */
function solveAnalyticalRib(
  id: string,
  direction: 'X' | 'Y',
  type: 'interior' | 'edge',
  coordinate: number,
  tributaryWidth: number,
  spans: AnalyticalRibSpan[],
  bw: number,
  hb: number,
  tf: number,
  s: number,
  fillerType: 'block' | 'foam' | 'none',
  mat: MatProps,
  slabProps: SlabProps,
  Ec: number
): AnalyticalRib {
  // 1. Calculate T-Beam properties
  const isEdge = type === 'edge';
  const sectionProperties = calculateTBeamProperties(bw, hb, tf, s, isEdge);

  // 2. Weights calculations (kN/m² of area)
  // Topping weight
  const toppingWeight = (tf / 1000) * (mat.gamma ?? 25);
  // Rib weight
  const ribConcreteWeight = (bw / 1000) * (hb / 1000) * (1 / (spacingMOfStrip(bw, s, isEdge))) * (mat.gamma ?? 25);
  // Filler weight
  let fillerWeight = 0;
  if (fillerType === 'block') {
    const spacingFactor = s / (bw + s);
    fillerWeight = spacingFactor * (hb / 1000) * 12; // 12 kN/m3
  } else if (fillerType === 'foam') {
    fillerWeight = 0.1;
  }

  const finishesLoad = slabProps.finishLoad;
  const liveLoad = slabProps.liveLoad;

  const areaDL = toppingWeight + ribConcreteWeight + fillerWeight + finishesLoad;
  const areaLL = liveLoad;

  // Factored Ultimate load on area: Wu = 1.2 DL + 1.6 LL (kN/m²)
  const wuArea = 1.2 * areaDL + 1.6 * areaLL;

  // Ultimate Line Load on Rib: wu = wuArea * tributaryWidth (kN/m)
  const wuLine = wuArea * tributaryWidth;

  // 3. Set up the MDNodes and MDElements for the Hardy Cross solver
  // Nodes are placed at support bounds
  const nodes: MDNode[] = [];
  let cumDistance = 0;
  
  // First node
  nodes.push({
    id: `N_${id}_0`,
    x: 0,
    isSupport: true,
    colStiffnessAbove: 0,
    colStiffnessBelow: 0,
    endCondition: 'K', // Pinned simple behavior at discontinuous end
  });

  for (let idx = 0; idx < spans.length; idx++) {
    cumDistance += spans[idx].spanLength;
    nodes.push({
      id: `N_${id}_${idx + 1}`,
      x: cumDistance,
      isSupport: true,
      colStiffnessAbove: 0,
      colStiffnessBelow: 0,
      endCondition: (idx === spans.length - 1) ? 'K' : 'K', // supports are simple pinned
    });
  }

  // Calculate EI (in kN.m2) = Ec (MPa) * Ix (mm4) * 1e-9
  const EI = Ec * sectionProperties.Ix * 1e-9;

  // Elements
  const elements: MDElement[] = [];
  for (let idx = 0; idx < spans.length; idx++) {
    elements.push({
      id: `E_${id}_${idx}`,
      nodeI: idx,
      nodeJ: idx + 1,
      L: spans[idx].spanLength,
      EI: EI,
      w: wuLine, // uniform distributed ultimate load
    });
  }

  // 4. Run Moment Distribution Solver!
  const mdResult: MDResult = analyzeByMomentDistribution(nodes, elements, true);

  // 5. Structure outputs and extract diagrams
  const spanResults = spans.map((sp, idx) => {
    const elemRes = mdResult.elements[idx];
    const L = sp.spanLength;

    // Moments: convert hogging support moments to positive magnitudes for presentation
    // In our moment distribution: sagging spans show up positive, support hogging show up negative.
    // Convert to positive limits for consistent design forces display:
    const Mneg_left = Math.max(0, -elemRes.Mleft);
    const Mneg_right = Math.max(0, -elemRes.Mright);
    const Mpos = Math.max(0, elemRes.Mmid);

    const Vu_left = Math.abs(elemRes.Vleft);
    const Vu_right = Math.abs(elemRes.Vright);

    // Extract maximum deflection from diagram
    const diagPoints = elemRes.diagram || [];
    let maxDef = 0;
    for (const pt of diagPoints) {
      if (Math.abs(pt.deflection) > Math.abs(maxDef)) {
        maxDef = pt.deflection; 
      }
    }
    // Convert deflection to mm (from meters)
    const maxDef_mm = Math.abs(maxDef) * 1000;

    return {
      slabId: sp.slabId,
      L,
      Mneg_left,
      Mpos,
      Mneg_right,
      Vu_left,
      Vu_right,
      maxDeflection: maxDef_mm,
      diagram: diagPoints.map(pt => ({
        x: pt.x,
        shear: pt.shear,
        moment: pt.moment,
        deflection: pt.deflection * 1000, // to mm
      })),
    };
  });

  const maxMpos = Math.max(...spanResults.map(sr => sr.Mpos));
  const maxMneg = Math.max(...spanResults.map(sr => Math.max(sr.Mneg_left, sr.Mneg_right)));
  const maxShear = Math.max(...spanResults.map(sr => Math.max(sr.Vu_left, sr.Vu_right)));
  const maxDeflection = Math.max(...spanResults.map(sr => sr.maxDeflection));
  const reactions = mdResult.reactions;

  return {
    id,
    type,
    direction,
    coordinate,
    tributaryWidth,
    spans,
    toppingWeight,
    ribConcreteWeight,
    fillerWeight,
    finishesLoad,
    liveLoad,
    wDL: areaDL,
    wLL: areaLL,
    wu: wuLine,
    sectionProperties,
    maxPositiveMoment: maxMpos,
    maxNegativeMoment: maxMneg,
    maxShear,
    maxDeflection,
    reactions,
    spanResults,
  };
}

function spacingMOfStrip(bw: number, s: number, isEdge: boolean): number {
  const cToC = (bw + s) / 1000;
  return isEdge ? (bw + s/2)/1000 : cToC;
}
