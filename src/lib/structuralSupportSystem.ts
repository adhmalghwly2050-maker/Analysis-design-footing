/**
 * Node-based Structural Support System — Database & Utilities
 * 
 * Manages the independent Support, SupportAssignment, SupportRestraint, SupportSpring, and SupportReaction entities.
 */

export interface SupportEntity {
  id: string; // SupportID
  name: string; // Name
  type: 'Fixed' | 'Pinned' | 'Roller-X' | 'Roller-Y' | 'Roller-Z' | 'Custom' | 'Elastic' | 'Spring' | 'User Defined'; // SupportType
  description: string; // Description
  createdDate: string; // CreatedDate
  modifiedDate: string; // ModifiedDate
}

export interface SupportAssignmentEntity {
  id: string; // AssignmentID
  supportId: string; // SupportID
  nodeId: string; // NodeID (e.g., "${x_meters.toFixed(2)}_${y_meters.toFixed(2)}_${z_mm}")
  projectId?: string; // ProjectID
}

export interface SupportRestraintEntity {
  supportId: string; // SupportID
  ux: boolean;
  uy: boolean;
  uz: boolean;
  rx: boolean;
  ry: boolean;
  rz: boolean;
}

export interface SupportSpringEntity {
  supportId: string; // SupportID
  kx: number; // N/mm or kN/m
  ky: number;
  kz: number;
  krx: number; // N.mm/rad or kN.m/rad
  kry: number;
  krz: number;
}

export interface SupportReactionEntity {
  nodeId: string; // NodeID
  loadCase: string; // LoadCase/Combo
  fx: number; // kN
  fy: number; // kN
  fz: number; // kN
  mx: number; // kN.m
  my: number; // kN.m
  mz: number; // kN.m
}

export interface SupportDatabase {
  supports: SupportEntity[];
  assignments: SupportAssignmentEntity[];
  restraints: Record<string, SupportRestraintEntity>; // supportId -> restraints
  springs: Record<string, SupportSpringEntity>; // supportId -> springs
  reactions?: SupportReactionEntity[];
}

export function createDefaultSupports(): SupportDatabase {
  const supports: SupportEntity[] = [
    {
      id: 'sup_fixed',
      name: 'مسند وثاقة (Fixed Support)',
      type: 'Fixed',
      description: 'مسند وثاقة صلب يمنع الانتقال والدوران في كافة الاتجاهات (UX, UY, UZ, RX, RY, RZ)',
      createdDate: new Date().toISOString(),
      modifiedDate: new Date().toISOString(),
    },
    {
      id: 'sup_pinned',
      name: 'مسندمفصل (Pinned Support)',
      type: 'Pinned',
      description: 'مسند مفصل يمنع كافة الانتقالات لكنه يسمح بالدوران الحر (UX, UY, UZ)',
      createdDate: new Date().toISOString(),
      modifiedDate: new Date().toISOString(),
    },
    {
      id: 'sup_roller_z',
      name: 'رولر رأسي (Roller-Z)',
      type: 'Roller-Z',
      description: 'منزلق شاقولي يقيد الحركة الرأسية ويسمح بالحركات الأفقية والدورانات',
      createdDate: new Date().toISOString(),
      modifiedDate: new Date().toISOString(),
    },
    {
      id: 'sup_roller_x',
      name: 'رولر أفقي X (Roller-X)',
      type: 'Roller-X',
      description: 'منزلق أفقي يمنع الانتقال على محور X ويسمح بالباقي',
      createdDate: new Date().toISOString(),
      modifiedDate: new Date().toISOString(),
    },
    {
      id: 'sup_roller_y',
      name: 'رولر أفقي Y (Roller-Y)',
      type: 'Roller-Y',
      description: 'منزلق أفقي يمنع الانتقال على محور Y ويسمح بالباقي',
      createdDate: new Date().toISOString(),
      modifiedDate: new Date().toISOString(),
    },
  ];

  const restraints: Record<string, SupportRestraintEntity> = {
    sup_fixed: { supportId: 'sup_fixed', ux: true, uy: true, uz: true, rx: true, ry: true, rz: true },
    sup_pinned: { supportId: 'sup_pinned', ux: true, uy: true, uz: true, rx: false, ry: false, rz: false },
    sup_roller_z: { supportId: 'sup_roller_z', ux: false, uy: false, uz: true, rx: false, ry: false, rz: false },
    sup_roller_x: { supportId: 'sup_roller_x', ux: true, uy: false, uz: false, rx: false, ry: false, rz: false },
    sup_roller_y: { supportId: 'sup_roller_y', ux: false, uy: true, uz: false, rx: false, ry: false, rz: false },
  };

  const springs: Record<string, SupportSpringEntity> = {
    sup_fixed: { supportId: 'sup_fixed', kx: 0, ky: 0, kz: 0, krx: 0, kry: 0, krz: 0 },
    sup_pinned: { supportId: 'sup_pinned', kx: 0, ky: 0, kz: 0, krx: 0, kry: 0, krz: 0 },
    sup_roller_z: { supportId: 'sup_roller_z', kx: 0, ky: 0, kz: 0, krx: 0, kry: 0, krz: 0 },
    sup_roller_x: { supportId: 'sup_roller_x', kx: 0, ky: 0, kz: 0, krx: 0, kry: 0, krz: 0 },
    sup_roller_y: { supportId: 'sup_roller_y', kx: 0, ky: 0, kz: 0, krx: 0, kry: 0, krz: 0 },
  };

  return {
    supports,
    assignments: [],
    restraints,
    springs,
    reactions: [],
  };
}

/**
 * Migration helper to ensure robust backwards compatibility.
 * Takes old column support fields and existing supportRestraints configurations
 * to construct a seamless modern SupportDatabase.
 */
export function migrateOrInitializeSupportDb(
  existingDb?: SupportDatabase,
  legacyColumnSupports?: Record<string, 'F' | 'P'>,
  legacySupportRestraints?: Record<string, { ux: boolean; uy: boolean; uz: boolean; rx: boolean; ry: boolean; rz: boolean }>,
  columns: any[] = []
): SupportDatabase {
  let db: SupportDatabase;
  if (existingDb && Array.isArray(existingDb.supports) && existingDb.supports.length > 0) {
    db = {
      supports: [...existingDb.supports],
      assignments: Array.isArray(existingDb.assignments) ? [...existingDb.assignments] : [],
      restraints: { ...existingDb.restraints },
      springs: { ...existingDb.springs },
      reactions: Array.isArray(existingDb.reactions) ? [...existingDb.reactions] : [],
    };
  } else {
    db = createDefaultSupports();
  }

  // Ensure key tables are initialized
  if (!db.restraints) db.restraints = {};
  if (!db.springs) db.springs = {};
  if (!db.assignments) db.assignments = [];
  if (!db.reactions) db.reactions = [];

  // Migrate legacy supportRestraints map
  if (legacySupportRestraints) {
    Object.entries(legacySupportRestraints).forEach(([nodeId, rest]) => {
      // Find if there's an existing assignment for this node
      const hasAssignment = db.assignments.some(a => a.nodeId === nodeId);
      if (!hasAssignment) {
        // Find if we have a match for standard fixed/pinned or create custom support
        const isFixed = rest.ux && rest.uy && rest.uz && rest.rx && rest.ry && rest.rz;
        const isPinned = rest.ux && rest.uy && rest.uz && !rest.rx && !rest.ry && !rest.rz;
        
        let targetSupportId = '';
        if (isFixed) {
          targetSupportId = 'sup_fixed';
        } else if (isPinned) {
          targetSupportId = 'sup_pinned';
        } else {
          // Create custom support
          const customId = `sup_migrated_${nodeId.replace(/\./g, '_')}`;
          const isExisting = db.supports.some(s => s.id === customId);
          if (!isExisting) {
            db.supports.push({
              id: customId,
              name: `مخصص ${nodeId}`,
              type: 'Custom',
              description: `تمت هجرته تلقائياً من الإعدادات السابقة للنقطة ${nodeId}`,
              createdDate: new Date().toISOString(),
              modifiedDate: new Date().toISOString(),
            });
            db.restraints[customId] = { supportId: customId, ...rest };
            db.springs[customId] = { supportId: customId, kx: 0, ky: 0, kz: 0, krx: 0, kry: 0, krz: 0 };
          }
          targetSupportId = customId;
        }

        db.assignments.push({
          id: `asg_migrated_${nodeId.replace(/\./g, '_')}`,
          supportId: targetSupportId,
          nodeId: nodeId,
        });
      }
    });
  }

  // Migrate legacy column bottomEndCondition fields
  if (columns && columns.length > 0) {
    // 1. First, self-heal: filter out automated column assignments for columns that actually have a column below them
    db.assignments = db.assignments.filter(asg => {
      if (asg.id && asg.id.startsWith('asg_col_')) {
        const colId = asg.id.replace('asg_col_', '');
        const col = columns.find(c => c.id === colId);
        if (col && !col.isRemoved) {
          const zBottom = col.zBottom ?? 0;
          const colBelow = columns.find(c =>
            !c.isRemoved &&
            c.id !== col.id &&
            Math.abs(c.x - col.x) < 0.05 &&
            Math.abs(c.y - col.y) < 0.05 &&
            Math.abs((c.zTop ?? ((c.zBottom ?? 0) + c.L)) - zBottom) < 10
          );
          if (colBelow) {
            // There is a column below, so this is an internal joint, not a foundation/base
            return false;
          }
        }
      }
      return true;
    });

    // 2. Assign default supports to columns only if they do NOT have an active column below them
    columns.forEach(col => {
      if (col.isRemoved) return;
      const xM = col.x;
      const yM = col.y;
      const zBottom = col.zBottom ?? 0;
      const nodeId = `${xM.toFixed(2)}_${yM.toFixed(2)}_${zBottom}`;

      // Check if there is an active column directly below this one
      const colBelow = columns.find(c =>
        !c.isRemoved &&
        c.id !== col.id &&
        Math.abs(c.x - col.x) < 0.05 &&
        Math.abs(c.y - col.y) < 0.05 &&
        Math.abs((c.zTop ?? ((c.zBottom ?? 0) + c.L)) - zBottom) < 10
      );

      // If there is a column below, this is an internal joint, so it must NOT receive a support
      if (colBelow) return;

      // Only assign if this basement/foundation node doesn't already have one
      const hasAsg = db.assignments.some(a => a.nodeId === nodeId);
      if (!hasAsg) {
        const cond = col.bottomEndCondition || 'F';
        const targetSupportId = cond === 'P' ? 'sup_pinned' : 'sup_fixed';
        db.assignments.push({
          id: `asg_col_${col.id}`,
          supportId: targetSupportId,
          nodeId: nodeId,
        });
      }
    });
  }

  return db;
}
