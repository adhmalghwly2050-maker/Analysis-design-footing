/**
 * Isolated Footing Structural Detailing & Schedule Engine (ACI 318 Standard)
 * Designed by Senior Structural Detailing Software Engineer
 * 
 * Provides automated spread footing classification into standardized footing marks (F1, F2, etc.),
 * comprehensive Bar Bending Schedules (BBS), high-fidelity gridline mapping, physical column references, 
 * layout tag alignments, and project-wide material takeoff quantities.
 */

import { IsolatedFootingAnalysisResult } from './isolatedFootingEngine';
import { IsolatedFootingDesignOutput, FlexuralDesignResult } from './isolatedFootingDesignEngine';
import { designFooting, FootingDesignResult, FootingMaterials } from './foundationDesign';
import type { Column } from './structuralEngine';

export interface BBSItem {
  barMark: string;        // E.g., F1-B-X, F1-B-Y
  diameter: number;       // mm
  shapeCode: number;      // 00 for straight, 11 for standard hook/L-bend
  shapeDescription: string;
  qty: number;
  totalLengthM: number;
  weightPerM: number;     // kg/m
  totalWeightKg: number;
  segments: {
    A: number; // Straight length / bottom run
    B?: number; // Left hook/turn height
    C?: number; // Right hook/turn height
    R?: number; // Bend radius
  };
}

export interface DetailedBarLocation {
  id: string;
  coordStart: [number, number, number]; // [x, y, z] mm from footing center
  coordEnd: [number, number, number];   // [x, y, z] mm
  length: number;                      // mm
  diameter: number;                    // mm
}

export interface DetailingBarGroup {
  groupMark: string;
  direction: 'X' | 'Y';
  layer: 'bottom-outer' | 'bottom-inner';
  diameter: number;
  quantity: number;
  spacing: number;
  totalLengthM: number;
  totalWeightKg: number;
  bars: DetailedBarLocation[];
  ldRequired: number;                  // mm
  ldAvailable: number;                 // mm
  ldStatus: 'pass' | 'fail' | 'needs-hook';
  hasSplice: boolean;
  spliceDetails?: {
    numSplices: number;
    spliceLength: number;            // mm
    splicePositions: number[];        // coordinates
  };
}

export interface MaterialQuantities {
  concreteVolumeM3: number;
  excavationVolumeM3: number;
  backfillVolumeM3: number;
  formworkAreaM2: number;
  steelWeightKg: number;
  steelDensityKgPerM3: number;
}

export interface DetailingValidationResult {
  code: string;
  severity: 'info' | 'warning' | 'error';
  messageAr: string;
  messageEn: string;
}

export interface IsolatedFootingDetailingOutput {
  footingMark: string;
  dimensions: {
    B: number; // mm
    L: number; // mm
    H: number; // mm
    cover: number; // mm
  };
  column: {
    Cx: number; // mm
    Cy: number; // mm
    xOffset: number; // mm
    yOffset: number; // mm
  };
  rebarGroups: DetailingBarGroup[];
  bbs: BBSItem[];
  quantities: MaterialQuantities;
  validations: DetailingValidationResult[];
}

/**
 * Project-Wide Database & Layout Structures for Drawing Engine
 */
export interface ProjectFootingType {
  typeMark: string; // e.g. F1, F2, F3
  B: number; // footing width mm
  L: number; // footing length mm
  H: number; // thickness mm
  colCx: number; // column width x mm
  colCy: number; // column width y mm
  rebarX: { diameter: number; quantity: number; spacing: number };
  rebarY: { diameter: number; quantity: number; spacing: number };
  concreteVolumeIndividual: number; // m3
  steelWeightIndividual: number; // kg
  footingCount: number; // quantity of identical footings
  bbs: BBSItem[];
}

export interface ProjectFootingLocation {
  colId: string;
  gridRef: string; // e.g. "A-2"
  x: number; // meters from global structural origin
  y: number; // meters from global structural origin
  colB: number; // mm
  colH: number; // mm
  typeMark: string; // F1, F2, F3
  rotation: number; // degrees
  elevation: number; // mm (depth, e.g. -1500)
  P_service?: number;
}

export interface ProjectFoundationLayoutData {
  types: ProjectFootingType[];
  locations: ProjectFootingLocation[];
  xGridLines: { label: string; coord: number }[]; // meters
  yGridLines: { label: string; coord: number }[]; // meters
  totalConcreteVolume: number; // m3
  totalSteelWeight: number; // kg
  totalExcavationVolume: number; // m3
  totalBackfillVolume: number; // m3
  totalFormworkArea: number; // m2
}

// Steel Unit Weight Calculation (7850 kg/m³)
export const getWeightPerMeter = (db: number) => (Math.PI * db * db * 7850) / 4000000;

/**
 * High-precision single footing detailing analyzer.
 */
export function generateFootingDetailing(
  analysis: IsolatedFootingAnalysisResult,
  design: IsolatedFootingDesignOutput,
  options: {
    footingMark?: string;
    stockLength?: number;
    excavationOffset?: number;
    naturalGroundLevel?: number;
  } = {}
): IsolatedFootingDetailingOutput {
  const { B, L, H, Cx, Cy, fxCol, fyCol } = analysis.input;
  const { flexureX, flexureY } = design;
  
  const footingMark = options.footingMark || `F-${B/100}x${L/100}`;
  const stockLength = options.stockLength || 12000;
  const excavationOffset = options.excavationOffset ?? 500;
  const naturalGroundLevel = Math.abs(options.naturalGroundLevel ?? 1500);
  const cover = 75; // Standard protective soil cover for ACI 318

  const rebarGroups: DetailingBarGroup[] = [];
  const bbs: BBSItem[] = [];
  const validations: DetailingValidationResult[] = [];

  const processGroup = (
    dir: 'X' | 'Y',
    flexResult: FlexuralDesignResult,
    layer: 'bottom-outer' | 'bottom-inner'
  ): DetailingBarGroup => {
    const db = flexResult.selectedDiameter;
    const qty = flexResult.selectedQuantity;
    const spacing = flexResult.selectedSpacing;
    const weightPerM = getWeightPerMeter(db);

    const mainAxeSpan = dir === 'X' ? B : L;
    const distribAxeSpan = dir === 'X' ? L : B;

    let baseBarLength = mainAxeSpan - 2 * cover;
    let hasSplice = false;
    let numSplices = 0;
    let spliceLength = 0;

    if (baseBarLength > stockLength) {
      hasSplice = true;
      spliceLength = Math.round(1.3 * 50 * db);
      numSplices = Math.ceil(baseBarLength / stockLength);
      baseBarLength += numSplices * spliceLength;
    }

    const ldRequired = dir === 'X' ? design.developmentX.ld : design.developmentY.ld;
    const ldAvailable = dir === 'X' ? design.developmentX.availableLength : design.developmentY.availableLength;
    let ldStatus: 'pass' | 'fail' | 'needs-hook' = 'pass';
    if (ldAvailable < ldRequired) {
      ldStatus = 'needs-hook';
    }

    const hookLength = ldStatus === 'needs-hook' ? Math.max(150, 12 * db) : 0;
    const totalSingleBarLength = baseBarLength + (ldStatus === 'needs-hook' ? 2 * hookLength : 0);

    const bars: DetailedBarLocation[] = [];
    const clearDistribSpan = distribAxeSpan - 2 * cover;

    for (let i = 0; i < qty; i++) {
      const offset = -clearDistribSpan / 2 + (qty > 1 ? (i * (clearDistribSpan / (qty - 1))) : 0);
      const zLevel = layer === 'bottom-outer' ? -H / 2 + cover + db / 2 : -H / 2 + cover + db + db / 2;

      let startPt: [number, number, number];
      let endPt: [number, number, number];

      if (dir === 'X') {
        startPt = [-B / 2 + cover, offset, zLevel];
        endPt = [B / 2 - cover, offset, zLevel];
      } else {
        startPt = [offset, -L / 2 + cover, zLevel];
        endPt = [offset, L / 2 - cover, zLevel];
      }

      bars.push({
        id: `${footingMark}-${dir}-${i + 1}`,
        coordStart: startPt,
        coordEnd: endPt,
        length: parseFloat(totalSingleBarLength.toFixed(1)),
        diameter: db
      });
    }

    const totalLengthM = (totalSingleBarLength * qty) / 1000;
    const totalWeightKg = totalLengthM * weightPerM;

    const group: DetailingBarGroup = {
      groupMark: `${footingMark}-B-${dir}`,
      direction: dir,
      layer,
      diameter: db,
      quantity: qty,
      spacing,
      totalLengthM: parseFloat(totalLengthM.toFixed(2)),
      totalWeightKg: parseFloat(totalWeightKg.toFixed(2)),
      bars,
      ldRequired,
      ldAvailable,
      ldStatus,
      hasSplice,
      spliceDetails: hasSplice ? { numSplices, spliceLength, splicePositions: [0] } : undefined
    };

    const shapeCode = ldStatus === 'needs-hook' ? 11 : 0;
    const bbsItem: BBSItem = {
      barMark: group.groupMark,
      diameter: db,
      shapeCode,
      shapeDescription: shapeCode === 11 ? 'قضيب طولي بخطاف في الطرفين (L-Hooked)' : 'قضيب مستقيم (Straight Bar)',
      qty,
      totalLengthM: group.totalLengthM,
      weightPerM: parseFloat(weightPerM.toFixed(3)),
      totalWeightKg: group.totalWeightKg,
      segments: {
        A: Math.round(baseBarLength),
        B: hookLength > 0 ? Math.round(hookLength) : undefined,
        C: hookLength > 0 ? Math.round(hookLength) : undefined,
        R: Math.round(2 * db)
      }
    };
    bbs.push(bbsItem);

    return group;
  };

  const groupX = processGroup('X', flexureX, 'bottom-outer');
  const groupY = processGroup('Y', flexureY, 'bottom-inner');

  rebarGroups.push(groupX, groupY);

  const concreteVolumeM3 = (B * L * H) / 1e9;
  const excavB = B + 2 * excavationOffset;
  const excavL = L + 2 * excavationOffset;
  const excavationVolumeM3 = (excavB * excavL * naturalGroundLevel) / 1e9;
  const backfillVolumeM3 = Math.max(0, excavationVolumeM3 - concreteVolumeM3);
  const formworkAreaM2 = (2 * (B + L) * H) / 1e6;

  const totalSteelWeightKg = groupX.totalWeightKg + groupY.totalWeightKg;
  const steelDensityKgPerM3 = concreteVolumeM3 > 0 ? totalSteelWeightKg / concreteVolumeM3 : 0;

  const quantities: MaterialQuantities = {
    concreteVolumeM3: parseFloat(concreteVolumeM3.toFixed(3)),
    excavationVolumeM3: parseFloat(excavationVolumeM3.toFixed(3)),
    backfillVolumeM3: parseFloat(backfillVolumeM3.toFixed(3)),
    formworkAreaM2: parseFloat(formworkAreaM2.toFixed(2)),
    steelWeightKg: parseFloat(totalSteelWeightKg.toFixed(2)),
    steelDensityKgPerM3: parseFloat(steelDensityKgPerM3.toFixed(2))
  };

  // Validations
  if (cover < 75) {
    validations.push({
      code: 'ERR_MIN_COVER',
      severity: 'error',
      messageAr: 'الغطاء الخرساني المستعمل أقل من 75 مم للقواعد المتعرضة للتربة المباشرة (مخالف لفصل 20 بالكود).',
      messageEn: 'Concrete protective cover is less than 75mm minimum for foundations in contact with earth (ACI 318 Chapter 20 violation).'
    });
  }

  const minClearSpacingX = groupX.spacing - groupX.diameter;
  if (minClearSpacingX < 75) {
    validations.push({
      code: 'WARN_SPACING_X_NARROW',
      severity: 'warning',
      messageAr: 'التباعد الصافي لحديد اتجاه X أقل من 75 مم. قد يحدث تعشيش للخرسانة أثناء الصب.',
      messageEn: 'Net spacing for X direction bars is less than 75mm. High risk of concrete segregation/honeycombing.'
    });
  }

  const minClearSpacingY = groupY.spacing - groupY.diameter;
  if (minClearSpacingY < 75) {
    validations.push({
      code: 'WARN_SPACING_Y_NARROW',
      severity: 'warning',
      messageAr: 'التباعد الصافي لحديد اتجاه Y أقل من 75 مم. قد يحدث تعشيش للخرسانة أثناء الصب.',
      messageEn: 'Net spacing for Y direction bars is less than 75mm. High risk of concrete segregation/honeycombing.'
    });
  }

  return {
    footingMark,
    dimensions: { B, L, H, cover },
    column: { Cx, Cy, xOffset: fxCol, yOffset: fyCol },
    rebarGroups,
    bbs,
    quantities,
    validations
  };
}

/**
 * Automates project-wide footing design, classifications (footings matching dimensions, col, rebar),
 * coordinates, automatic gridline creation (A,B,C / 1,2,3), and schedules.
 */
export function generateProjectDetailing(
  columns: Column[],
  colLoads3D: Map<string, { P_service?: number; Pu?: number; MxBot?: number; MyBot?: number; Vu?: number }> | undefined,
  materials: FootingMaterials,
  options: {
    naturalGroundLevel?: number;
    excavationOffset?: number;
    stockLength?: number;
  } = {}
): ProjectFoundationLayoutData {
  const ngl = Math.abs(options.naturalGroundLevel ?? 1500);
  const offset = options.excavationOffset ?? 500;
  const stockLen = options.stockLength ?? 12000;

  // 1. Compute Footing Design results for all foundation columns
  const designResults: FootingDesignResult[] = columns.map(col => {
    const loads = colLoads3D?.get(col.id);
    const P_service = loads?.P_service 
      ? loads.P_service 
      : (loads?.Pu ? (loads.Pu / 1.2) : 250);

    return designFooting({
      colId: col.id,
      x: col.x,
      y: col.y,
      P_DL: P_service * 0.6,
      P_LL: P_service * 0.4,
      colB: col.b,
      colH: col.h
    }, materials);
  });

  // 2. Generate Automatic Gridlines based on sorted X and Y coordinates
  const rawXCoords = columns.map(c => c.x);
  const rawYCoords = columns.map(c => c.y);

  // Helper to group items within 0.5 meters of each other
  const groupCoords = (coords: number[]): number[] => {
    if (coords.length === 0) return [];
    const sorted = [...new Set(coords)].sort((a, b) => a - b);
    const groups: number[] = [sorted[0]];
    for (let i = 1; i < sorted.length; i++) {
      const prev = groups[groups.length - 1];
      if (sorted[i] - prev > 0.6) {
        groups.push(sorted[i]);
      }
    }
    return groups;
  };

  const xUniques = groupCoords(rawXCoords);
  const yUniques = groupCoords(rawYCoords);

  const xGridLines = xUniques.map((coord, idx) => {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const label = alphabet[idx % alphabet.length];
    return { label, coord };
  });

  const yGridLines = yUniques.map((coord, idx) => {
    return { label: (idx + 1).toString(), coord };
  });

  // 3. Classify Footings into unique Types (identical footing geometry, column geometry, and rebar)
  const typesMap: Map<string, {
    B: number; L: number; H: number;
    colB: number; colH: number;
    rebarX: { diameter: number; quantity: number; spacing: number };
    rebarY: { diameter: number; quantity: number; spacing: number };
    concreteVol: number;
    steelWeight: number;
    footingCount: number;
    bbs: BBSItem[];
  }> = new Map();

  designResults.forEach(r => {
    // Round for safer classification matching
    const B = Math.round(r.B);
    const L = Math.round(r.L);
    const H = Math.round(r.t);
    const colB = Math.round(r.colB);
    const colH = Math.round(r.colH);

    const rebarX = { diameter: r.dia_x, quantity: r.bars_x, spacing: r.spacing_x };
    const rebarY = { diameter: r.dia_y, quantity: r.bars_y, spacing: r.spacing_y };

    // Unique key representing perfect match of all parameters
    const key = `${B}_${L}_${H}_${colB}_${colH}_${rebarX.diameter}x${rebarX.quantity}_${rebarY.diameter}x${rebarY.quantity}`;

    const existing = typesMap.get(key);
    if (existing) {
      existing.footingCount += 1;
    } else {
      // Create detailed BBS and single weight
      const weightX = getWeightPerMeter(rebarX.diameter) * (B - 150) * rebarX.quantity / 1000;
      const weightY = getWeightPerMeter(rebarY.diameter) * (L - 150) * rebarY.quantity / 1000;
      const totalSteelWeight = weightX + weightY;

      // Single footing BBS
      const bbs: BBSItem[] = [
        {
          barMark: `FX-B-X`, // Will overwrite dynamically as F1-B-X, F2-B-X ...
          diameter: rebarX.diameter,
          shapeCode: 0,
          shapeDescription: 'قضيب طولي مستقيم (Straight)',
          qty: rebarX.quantity,
          totalLengthM: (B - 150) * rebarX.quantity / 1000,
          weightPerM: getWeightPerMeter(rebarX.diameter),
          totalWeightKg: weightX,
          segments: { A: B - 150 }
        },
        {
          barMark: `FX-B-Y`,
          diameter: rebarY.diameter,
          shapeCode: 0,
          shapeDescription: 'قضيب عرضي مستقيم (Straight)',
          qty: rebarY.quantity,
          totalLengthM: (L - 150) * rebarY.quantity / 1000,
          weightPerM: getWeightPerMeter(rebarY.diameter),
          totalWeightKg: weightY,
          segments: { A: L - 150 }
        }
      ];

      typesMap.set(key, {
        B, L, H, colB, colH,
        rebarX, rebarY,
        concreteVol: (B * L * H) / 1e9,
        steelWeight: totalSteelWeight,
        footingCount: 1,
        bbs
      });
    }
  });

  // Assign standardized names like F1, F2, F3 sorted by size (largest volume first)
  const sortedClassified = Array.from(typesMap.values())
    .sort((a, b) => (b.B * b.L * b.H) - (a.B * a.L * a.H));

  const projectFootingTypes: ProjectFootingType[] = sortedClassified.map((type, idx) => {
    const typeMark = `F${idx + 1}`;
    // Rewrite BBS item titles
    const updatedBbs = type.bbs.map(b => ({
      ...b,
      barMark: b.barMark.replace('FX', typeMark)
    }));

    return {
      typeMark,
      B: type.B,
      L: type.L,
      H: type.H,
      colCx: type.colB,
      colCy: type.colH,
      rebarX: type.rebarX,
      rebarY: type.rebarY,
      concreteVolumeIndividual: parseFloat(type.concreteVol.toFixed(3)),
      steelWeightIndividual: parseFloat(type.steelWeight.toFixed(1)),
      footingCount: type.footingCount,
      bbs: updatedBbs
    };
  });

  // 4. Map each column instance to its specific Footing Location & Tag reference
  const locations: ProjectFootingLocation[] = columns.map(col => {
    // Find closest designed footing to extract dimensions
    const df = designResults.find(r => r.colId === col.id)!;
    const rebarX = { diameter: df.dia_x, quantity: df.bars_x };
    const rebarY = { diameter: df.dia_y, quantity: df.bars_y };
    
    const findKey = `${Math.round(df.B)}_${Math.round(df.L)}_${Math.round(df.t)}_${Math.round(df.colB)}_${Math.round(df.colH)}_${rebarX.diameter}x${rebarX.quantity}_${rebarY.diameter}x${rebarY.quantity}`;

    // Match with the sorted classified types
    const typeIndex = sortedClassified.findIndex(t => {
      const tKey = `${t.B}_${t.L}_${t.H}_${t.colB}_${t.colH}_${t.rebarX.diameter}x${t.rebarX.quantity}_${t.rebarY.diameter}x${t.rebarY.quantity}`;
      return tKey === findKey;
    });

    const typeMark = typeIndex !== -1 ? `F${typeIndex + 1}` : 'F1';

    // Grid References
    const closestXGrid = xGridLines.reduce((prev, curr) => 
      Math.abs(curr.coord - col.x) < Math.abs(prev.coord - col.x) ? curr : prev, xGridLines[0]);
    const closestYGrid = yGridLines.reduce((prev, curr) => 
      Math.abs(curr.coord - col.y) < Math.abs(prev.coord - col.y) ? curr : prev, yGridLines[0]);

    const gridRef = (closestXGrid && closestYGrid) ? `${closestXGrid.label}-${closestYGrid.label}` : 'Grid';

    return {
      colId: col.id,
      gridRef,
      x: col.x,
      y: col.y,
      colB: col.b,
      colH: col.h,
      typeMark,
      rotation: 0,
      elevation: -ngl,
      P_service: colLoads3D?.get(col.id)?.P_service
    };
  });

  // Calculate project totals
  let totalConcreteVolume = 0;
  let totalSteelWeight = 0;
  let totalExcavationVolume = 0;
  let totalBackfillVolume = 0;
  let totalFormworkArea = 0;

  locations.forEach(loc => {
    const fType = projectFootingTypes.find(t => t.typeMark === loc.typeMark)!;
    const B = fType.B;
    const L = fType.L;
    const H = fType.H;

    const concreteVol = (B * L * H) / 1e9;
    const excavB = B + 2 * offset;
    const excavL = L + 2 * offset;
    const excavationVol = (excavB * excavL * ngl) / 1e9;
    const backfillVol = Math.max(0, excavationVol - concreteVol);
    const formworkArea = (2 * (B + L) * H) / 1e6;

    totalConcreteVolume += concreteVol;
    totalSteelWeight += fType.steelWeightIndividual;
    totalExcavationVolume += excavationVol;
    totalBackfillVolume += backfillVol;
    totalFormworkArea += formworkArea;
  });

  return {
    types: projectFootingTypes,
    locations,
    xGridLines,
    yGridLines,
    totalConcreteVolume: parseFloat(totalConcreteVolume.toFixed(2)),
    totalSteelWeight: parseFloat(totalSteelWeight.toFixed(1)),
    totalExcavationVolume: parseFloat(totalExcavationVolume.toFixed(2)),
    totalBackfillVolume: parseFloat(totalBackfillVolume.toFixed(2)),
    totalFormworkArea: parseFloat(totalFormworkArea.toFixed(1))
  };
}
