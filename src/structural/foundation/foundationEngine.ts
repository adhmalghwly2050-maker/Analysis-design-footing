import {
  Foundation,
  FoundationType,
  FoundationGeometry,
  FoundationAssignment,
  FoundationLevel,
  SoilAssignment,
  FoundationGroup,
  FoundationValidationIssue
} from "./foundationTypes";
import type { Column } from "@/lib/structuralEngine";
import type { SupportDatabase } from "@/lib/structuralSupportSystem";

export interface FoundationDatabase {
  foundations: Foundation[];
  geometries: FoundationGeometry[];
  assignments: FoundationAssignment[];
  levels: FoundationLevel[];
  soils: SoilAssignment[];
  groups: FoundationGroup[];
}

export function createEmptyFoundationDatabase(): FoundationDatabase {
  return {
    foundations: [],
    geometries: [],
    assignments: [],
    levels: [],
    soils: [],
    groups: []
  };
}

// ===================== CORE DATABASE API =====================

/**
 * Gets a foundation by its unique ID.
 */
export function GetFoundationByID(db: FoundationDatabase, id: string): Foundation | undefined {
  return db.foundations.find(f => f.id === id);
}

/**
 * Gets all foundations of a specific type.
 */
export function GetFoundationsByType(db: FoundationDatabase, type: FoundationType): Foundation[] {
  return db.foundations.filter(f => f.type === type);
}

/**
 * Gets all support assignment records assigned to a given foundation.
 */
export function GetSupportedObjects(db: FoundationDatabase, foundationId: string): FoundationAssignment[] {
  return db.assignments.filter(a => a.foundationId === foundationId);
}

/**
 * Gets the geometry of a given foundation.
 */
export function GetFoundationGeometry(db: FoundationDatabase, foundationId: string): FoundationGeometry | undefined {
  return db.geometries.find(g => g.foundationId === foundationId);
}

/**
 * Gets the soil parameters assigned to a given foundation.
 */
export function GetSoilAssignment(db: FoundationDatabase, foundationId: string): SoilAssignment | undefined {
  return db.soils.find(s => s.foundationId === foundationId);
}

/**
 * Query loaded reaction forces on a foundation by checking active 3D column loads/reactions.
 */
export function GetFoundationLoads(
  db: FoundationDatabase,
  foundationId: string,
  columns: Column[],
  colLoads3D?: Map<string, { P_service?: number; Pu?: number; Mx?: number; My?: number; MxBot?: number; MyBot?: number; Vu?: number }>,
  etabsReactions?: any[]
) {
  const assignments = GetSupportedObjects(db, foundationId);
  let totalP = 0;
  let totalMx = 0;
  let totalMy = 0;
  let totalVx = 0;
  let totalVy = 0;

  assignments.forEach(assign => {
    const colId = assign.supportedId;
    const col = columns.find(c => c.id === colId);
    if (!col) return;

    let P = 200;
    let Mx = 0;
    let My = 0;
    let Vx = 0;
    let Vy = 0;

    // Check ETABS reactions first
    if (etabsReactions && etabsReactions.length > 0) {
      const etabs = etabsReactions.find(r => r.pointId === colId || r.pointLabel === colId || r.label === colId);
      if (etabs) {
        P = Math.abs(etabs.Fz || etabs.FZ || etabs.P || 200);
        Mx = Math.abs(etabs.Mx || etabs.MX || etabs.M2 || 0);
        My = Math.abs(etabs.My || etabs.MY || etabs.M3 || 0);
        Vx = Math.abs(etabs.Fx || etabs.FX || etabs.V2 || 0);
        Vy = Math.abs(etabs.Fy || etabs.FY || etabs.V3 || 0);
      }
    } else if (colLoads3D) {
      const load = colLoads3D.get(colId);
      if (load) {
        P = load.P_service ? load.P_service : (load.Pu ? load.Pu / 1.2 : 200);
        Mx = load.MxBot || load.Mx || 0;
        My = load.MyBot || load.My || 0;
        Vx = load.Vu ? load.Vu * 0.5 : 0;
        Vy = load.Vu ? load.Vu * 0.35 : 0;
      }
    }

    totalP += P;
    totalMx += Mx;
    totalMy += My;
    totalVx += Vx;
    totalVy += Vy;
  });

  return {
    P: parseFloat(totalP.toFixed(1)),
    Mx: parseFloat(totalMx.toFixed(1)),
    My: parseFloat(totalMy.toFixed(1)),
    Vx: parseFloat(totalVx.toFixed(1)),
    Vy: parseFloat(totalVy.toFixed(1)),
    columnCount: assignments.length
  };
}

// ===================== AUTOMATIC VALIDATION ENGINE =====================

/**
 * Validates the foundation database against structural standards.
 * Detects:
 * - Columns without foundations (at lower-bounding elevation)
 * - Foundations without supported objects
 * - Duplicate assignments
 * - Invalid references
 * - Missing geometry
 * - Missing soil properties
 */
export function ValidateFoundationDatabase(
  db: FoundationDatabase,
  columns: Column[],
  walls: any[] = []
): FoundationValidationIssue[] {
  const issues: FoundationValidationIssue[] = [];

  // 1. Identify "ground level" or bottom columns
  const activeCols = columns.filter(c => !c.isRemoved);
  if (activeCols.length > 0) {
    const minZ = Math.min(...activeCols.map(c => c.zBottom ?? 0));
    const bottomCols = activeCols.filter(col => Math.abs((col.zBottom ?? 0) - minZ) < 50);

    bottomCols.forEach(col => {
      const assigned = db.assignments.find(a => a.supportedId === col.id && a.supportedType === "column");
      if (!assigned) {
        issues.push({
          id: `missing-fdn-col-${col.id}`,
          type: "col_without_foundation",
          severity: "error",
          message: `العمود ${col.id} يقع في منسوب التأسيس ولكنه غير مسند لأي قاعدة مفصلة في جدول التعيينات.`,
          objectId: col.id
        });
      }
    });
  }

  // 2. Foundations without supported objects
  db.foundations.forEach(fdn => {
    const assignments = db.assignments.filter(a => a.foundationId === fdn.id);
    if (assignments.length === 0) {
      issues.push({
        id: `fdn-empty-${fdn.id}`,
        type: "foundation_without_supported",
        severity: "warning",
        message: `القاعدة الخرسانية ${fdn.name} (${fdn.id}) معرفة في الجداول ولكن لا يدعمها أي أعمدة أو جدران.`,
        objectId: fdn.id
      });
    }
  });

  // 3. Duplicate assignments
  const supportCounts = new Map<string, string[]>(); // supportedId -> foundationIds
  db.assignments.forEach(assign => {
    const key = `${assign.supportedId}_${assign.supportedType}`;
    if (!supportCounts.has(key)) {
      supportCounts.set(key, []);
    }
    supportCounts.get(key)!.push(assign.foundationId);
  });

  supportCounts.forEach((fdnIds, designKey) => {
    if (fdnIds.length > 1) {
      const [colId] = designKey.split("_");
      // Find associated assignment records
      const names = fdnIds.map(fId => db.foundations.find(f => f.id === fId)?.name || fId).join(", ");
      issues.push({
        id: `dup-assign-${colId}`,
        type: "duplicate_assignment",
        severity: "error",
        message: `تم رصد تعيينات مكررة للعمود/الجدار ${colId}. القواعد المربوطة به هي: ${names}.`,
        objectId: colId
      });
    }
  });

  // 4. Invalid references
  db.assignments.forEach(assign => {
    // Check foundation exists
    const fdnExists = db.foundations.some(f => f.id === assign.foundationId);
    if (!fdnExists) {
      issues.push({
        id: `invalid-ref-fdn-${assign.id}`,
        type: "invalid_reference",
        severity: "error",
        message: `رقم تعيين التأسيس ${assign.id} يشير إلى قاعدة غير موجودة بالمعرف (${assign.foundationId}).`,
        objectId: assign.id
      });
    }

    // Check supported object exists
    if (assign.supportedType === "column") {
      const colExists = columns.some(c => c.id === assign.supportedId);
      if (!colExists) {
        issues.push({
          id: `invalid-ref-col-${assign.id}`,
          type: "invalid_reference",
          severity: "error",
          message: `تعيين التأسيس يشير إلى عمود محذوف أو غير معرف بالمعرف (${assign.supportedId}).`,
          objectId: assign.supportedId
        });
      }
    }
  });

  // 5. Missing Geometry and Soil definitions
  db.foundations.forEach(fdn => {
    const geom = db.geometries.find(g => g.foundationId === fdn.id);
    if (!geom) {
      issues.push({
        id: `missing-geom-${fdn.id}`,
        type: "missing_geometry",
        severity: "error",
        message: `القاعدة ${fdn.name} تفتقد لتعريف الأبعاد الهندسية والسمك في جدول الخصائص الهندسية.`,
        objectId: fdn.id
      });
    }

    const soil = db.soils.find(s => s.foundationId === fdn.id);
    if (!soil) {
      issues.push({
        id: `missing-soil-${fdn.id}`,
        type: "missing_soil",
        severity: "warning",
        message: `القاعدة ${fdn.name} لم يتم تحديد مقاومة التربة المسموحة ومعامل رد الفعل الجيوتقني لها.`,
        objectId: fdn.id
      });
    }
  });

  return issues;
}

// ===================== AUTOMATIC SEEDER & POPULATOR =====================

/**
 * Automates creating explicit foundation configurations for all ground columns
 */
export function autoGenerateFoundations(
  columns: Column[],
  defaultFc = 25,
  defaultFy = 420,
  defaultQall = 150,
  supportDb?: SupportDatabase
): FoundationDatabase {
  const activeCols = columns.filter(c => !c.isRemoved);
  if (activeCols.length === 0) return createEmptyFoundationDatabase();

  let bottomCols = activeCols;
  if (supportDb && supportDb.assignments && supportDb.assignments.length > 0) {
    const assignedNodeIds = new Set(supportDb.assignments.map(a => a.nodeId));
    const colsAtSupports = activeCols.filter(col => {
      const key = `${col.x.toFixed(2)}_${col.y.toFixed(2)}_${col.zBottom ?? 0}`;
      return assignedNodeIds.has(key);
    });
    if (colsAtSupports.length > 0) {
      bottomCols = colsAtSupports;
    } else {
      const minZ = Math.min(...activeCols.map(c => c.zBottom ?? 0));
      bottomCols = activeCols.filter(col => Math.abs((col.zBottom ?? 0) - minZ) < 50);
    }
  } else {
    const minZ = Math.min(...activeCols.map(c => c.zBottom ?? 0));
    bottomCols = activeCols.filter(col => Math.abs((col.zBottom ?? 0) - minZ) < 50);
  }

  const minZ = Math.min(...bottomCols.map(c => c.zBottom ?? 0));

  const db = createEmptyFoundationDatabase();

  // Create foundation level
  const defaultLevel: FoundationLevel = {
    id: "level_sgl",
    name: "منسوب التأسيس الطبيعي (SGL)",
    elevation: minZ,
  };
  db.levels.push(defaultLevel);

  // Group columns by visual loading levels to form 3 elegant standard groups
  const estimateGroup = (col: Column): string => {
    const area = col.b * col.h;
    if (area < 100000) return "Group_Light";
    if (area < 180000) return "Group_Medium";
    return "Group_Heavy";
  };

  // Add groups
  db.groups = [
    { id: "Group_Light", name: "المجموعة آ - أساسات رفيعة (F-Light)", description: "مخصصة للأعمدة ذات المساحة الأقل من 1000 سم²" },
    { id: "Group_Medium", name: "المجموعة ب - أساسات متوسطة (F-Medium)", description: "مخصصة للأعمدة المتوسطة" },
    { id: "Group_Heavy", name: "المجموعة ج - أساسات مخصصة (F-Heavy)", description: "مخصصة للأعمدة الثقيلة والأعمدة المركزية المسلحة" },
  ];

  bottomCols.forEach((col, idx) => {
    const num = idx + 1;
    const fdnId = `FDN_${col.id}`;
    const group = estimateGroup(col);

    // Foundation Table Row
    const fdn: Foundation = {
      id: fdnId,
      name: `F_${col.id}`,
      type: FoundationType.Isolated,
      materialFc: defaultFc,
      materialFy: defaultFy,
      groupId: group,
      description: `قاعدة معينة تلقائياً للعمود ${col.id}`
    };
    db.foundations.push(fdn);

    // Foundation Assignment Table Row
    const assign: FoundationAssignment = {
      id: `ASGN_${col.id}`,
      foundationId: fdnId,
      supportedId: col.id,
      supportedType: "column"
    };
    db.assignments.push(assign);

    // Foundation Geometry Table Row
    // Default size adapted to columns size
    let B = 1500;
    let L = 1500;
    let H = 400;

    if (group === "Group_Medium") {
      B = 1800; L = 1800; H = 500;
    } else if (group === "Group_Heavy") {
      B = 2200; L = 2200; H = 600;
    }

    const geom: FoundationGeometry = {
      foundationId: fdnId,
      shape: "rectangular",
      width: B,
      length: L,
      thickness: H,
      offsetX: 0,
      offsetY: 0,
      elevation: minZ
    };
    db.geometries.push(geom);

    // Soil Assignment Table Row
    const soil: SoilAssignment = {
      foundationId: fdnId,
      qall: defaultQall,
      modulusSubgrade: defaultQall * 120, // Empirical Es estimate
      settlementLimit: 25 // 25 mm allowable settlement
    };
    db.soils.push(soil);
  });

  return db;
}
