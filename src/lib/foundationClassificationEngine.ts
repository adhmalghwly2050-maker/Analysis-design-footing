// Foundation Type, Group, and Classification Engine for Structural Engineering
// Built according to ACI 318 & Senior Structural Software Architectural Guidelines

export type FoundationSystemType = 'isolated' | 'strip' | 'combined' | 'raft';

// User Grouping & Classification Tolerances
export interface GroupingTolerances {
  lengthTolerance: number;      // mm (e.g., +/- 100mm)
  widthTolerance: number;       // mm
  thicknessTolerance: number;   // mm
  loadTolerance: number;        // fractional (e.g., 0.15 = 15% loading difference)
  matchReinforcementExact: boolean; // if true, rebar diameter and count must match
  forceSameSystem: boolean;     // always true
}

// Representative / Merged Design Loads
export interface DesignLoads {
  P: number;  // axial service load in kN
  Mx: number; // moment x in kNm
  My: number; // moment y in kNm
}

// Rebar Configuration
export interface RebarConfig {
  barDia: number;   // mm
  count: number;    // number of bars
  spacing: number;  // mm
}

// Database Entity 1: FoundationType (Governs visual schedule schedules)
export interface FoundationType {
  id: string;
  tag: string;              // e.g. F1, F2, SF1, CF1, RF1
  systemType: FoundationSystemType;
  B: number;                // width in mm
  L: number;                // length in mm
  t: number;                // thickness/depth in mm
  columnNames: string;      // e.g. "C1", "C2, C3" ...
  rebarX: RebarConfig;
  rebarY: RebarConfig;
  designLoads: DesignLoads;
  concreteVolume: number;   // m3 per footing
  steelWeight: number;      // kg per footing
  isOrphan?: boolean;       // whether any instances are currently using it
  userOverriddenTag?: string; // custom tag defined by user
}

// Database Entity 2: FoundationInstance (Representing actual structural layouts)
export interface FoundationInstance {
  id: string;               // unique e.g. Footing_0
  name: string;             // user descriptive name
  systemType: FoundationSystemType;
  x: number;                // coordinate x in m
  y: number;                // coordinate y in m
  B: number;                // width in mm
  L: number;                // length in mm
  t: number;                // thickness in mm
  columnIds: string[];      // columns sitting on this footing
  rebarX: RebarConfig;
  rebarY: RebarConfig;
  serviceLoad: DesignLoads;
  hasManualOverride?: boolean; // If user edited dimensions manually
  
  // Relationship FK links
  typeId?: string;
  groupId?: string;
  tag?: string;
}

// Database Entity 3: FoundationGroup (Spatial, structural, or grid groupings)
export interface FoundationGroup {
  id: string;
  name: string;             // e.g., "Zone A Columns", "Interior Grid"
  typeId: string;
  instanceIds: string[];
}

export interface ProjectFoundationStats {
  totalCount: number;
  totalTypes: number;
  totalConcreteVolume: number; // m3
  totalSteelWeight: number;    // kg
  unificationRatio: number;    // totalCount / totalTypes
  typeDistribution: Record<string, number>; // Tag -> Count
  systemBreakdown: Record<FoundationSystemType, { count: number; concrete: number; steel: number }>;
}

/**
 * Standard Civil Engineering formula for steel bar weight in kg:
 * W = D^2 / 162 * Length (in meters)
 */
export function calculateSteelWeight(dia: number, count: number, lenMeters: number): number {
  if (dia <= 0 || count <= 0 || lenMeters <= 0) return 0;
  return (Math.pow(dia, 2) / 162) * lenMeters * count;
}

/**
 * Calculate concrete volume in m3
 */
export function calculateConcreteVolume(systemType: FoundationSystemType, B: number, L: number, t: number): number {
  const Bm = B / 1000;
  const Lm = L / 1000;
  const tm = t / 1000;
  return Bm * Lm * tm;
}

/**
 * Checks if two footings are nearly identical based on user tolerances
 */
export function areFootingsCompatible(
  a: any,
  b: any,
  tolerances: GroupingTolerances
): boolean {
  // 1. System type must be identical
  if (a.systemType !== b.systemType) return false;

  // 2. Geometric compatibility
  if (Math.abs(a.B - b.B) > tolerances.widthTolerance) return false;
  if (Math.abs(a.L - b.L) > tolerances.lengthTolerance) return false;
  if (Math.abs(a.t - b.t) > tolerances.thicknessTolerance) return false;

  // 3. Column Count configuration compatibility
  const aColIds = a.columnIds || (a.columnNames ? a.columnNames.split(', ').filter(Boolean) : []);
  const bColIds = b.columnIds || (b.columnNames ? b.columnNames.split(', ').filter(Boolean) : []);
  if (aColIds.length !== bColIds.length) return false;

  // 4. Reinforcement compatibility if requested
  if (tolerances.matchReinforcementExact && a.rebarX && b.rebarX && a.rebarY && b.rebarY) {
    if (a.rebarX.barDia !== b.rebarX.barDia || a.rebarX.count !== b.rebarX.count) return false;
    if (a.rebarY.barDia !== b.rebarY.barDia || a.rebarY.count !== b.rebarY.count) return false;
  }

  // 5. Load difference compatibility
  const aP = a.serviceLoad?.P ?? a.designLoads?.P ?? 0;
  const bP = b.serviceLoad?.P ?? b.designLoads?.P ?? 0;
  const pDiff = Math.abs(aP - bP);
  const maxP = Math.max(1, aP, bP);
  if (pDiff / maxP > tolerances.loadTolerance) return false;

  return true;
}

/**
 * Core engine implementation: Groups foundation instances into distinct types
 */
export function classifyAndGroupFoundations(
  instances: FoundationInstance[],
  tolerances: GroupingTolerances,
  existingTypes: FoundationType[] = []
): {
  types: FoundationType[];
  groupedInstances: FoundationInstance[];
  groups: FoundationGroup[];
} {
  if (instances.length === 0) {
    return { types: [], groupedInstances: [], groups: [] };
  }

  const types: FoundationType[] = [];
  const groupedInstances: FoundationInstance[] = [];

  // Categorize systems to increment tags properly
  const prefixCounter: Record<FoundationSystemType, number> = {
    isolated: 0,
    strip: 0,
    combined: 0,
    raft: 0
  };

  const systemPrefixes: Record<FoundationSystemType, string> = {
    isolated: 'F',
    strip: 'SF',
    combined: 'CF',
    raft: 'RF'
  };

  // Keep track of user overridden tags by their matching geometry+system to sustain stability
  const getOverriddenTag = (inst: FoundationInstance): string | undefined => {
    // Search in existing structures if they match this exact item to preserve tags
    const match = existingTypes.find(t => 
      t.systemType === inst.systemType &&
      Math.abs(t.B - inst.B) < 1 &&
      Math.abs(t.L - inst.L) < 1 &&
      Math.abs(t.t - inst.t) < 1 &&
      t.userOverriddenTag
    );
    return match?.userOverriddenTag;
  };

  for (const instance of instances) {
    // Try to find a compatible type already defined in our current local list
    let matchedType = types.find(t => areFootingsCompatible(t, instance, tolerances));

    if (!matchedType) {
      // Create new Foundation Type
      prefixCounter[instance.systemType]++;
      const typeNum = prefixCounter[instance.systemType];
      const typePrefix = systemPrefixes[instance.systemType];
      const typeId = `type_${instance.systemType}_${typeNum}_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
      
      const overriddenTag = getOverriddenTag(instance);
      const tag = overriddenTag || `${typePrefix}${typeNum}`;

      // Structural governing design: a type's physical properties are dictated by the worst-case (governing) footing inside that group.
      // Initially, the type matches this instance exactly.
      const newType: FoundationType = {
        id: typeId,
        tag: tag,
        systemType: instance.systemType,
        B: instance.B,
        L: instance.L,
        t: instance.t,
        columnNames: instance.columnIds.join(', '),
        rebarX: { ...instance.rebarX },
        rebarY: { ...instance.rebarY },
        designLoads: { ...instance.serviceLoad },
        concreteVolume: calculateConcreteVolume(instance.systemType, instance.B, instance.L, instance.t),
        steelWeight: 
          calculateSteelWeight(instance.rebarX.barDia, instance.rebarX.count, (instance.L - 150) / 1000) + 
          calculateSteelWeight(instance.rebarY.barDia, instance.rebarY.count, (instance.B - 150) / 1000),
        userOverriddenTag: overriddenTag
      };

      types.push(newType);
      matchedType = newType;
    } else {
      // Governed/Critical limits merge: A true senior engineering practice,
      // the standardized Type dimensions/reinforcements must support the critical loads of all its members.
      // So, the type values will be set to the MAXIMUM of all grouped instances.
      const prevB = matchedType.B;
      const prevL = matchedType.L;

      matchedType.B = Math.max(matchedType.B, instance.B);
      matchedType.L = Math.max(matchedType.L, instance.L);
      matchedType.t = Math.max(matchedType.t, instance.t);

      // Maximize reinforced steel configuration
      if (instance.rebarX.count > matchedType.rebarX.count || instance.rebarX.barDia > matchedType.rebarX.barDia) {
        matchedType.rebarX.count = Math.max(matchedType.rebarX.count, instance.rebarX.count);
        matchedType.rebarX.barDia = Math.max(matchedType.rebarX.barDia, instance.rebarX.barDia);
      }
      if (instance.rebarY.count > matchedType.rebarY.count || instance.rebarY.barDia > matchedType.rebarY.barDia) {
        matchedType.rebarY.count = Math.max(matchedType.rebarY.count, instance.rebarY.count);
        matchedType.rebarY.barDia = Math.max(matchedType.rebarY.barDia, instance.rebarY.barDia);
      }

      // Maximize axial & moment loads governing design limits
      matchedType.designLoads.P = Math.max(matchedType.designLoads.P, instance.serviceLoad.P);
      matchedType.designLoads.Mx = Math.max(matchedType.designLoads.Mx, instance.serviceLoad.Mx);
      matchedType.designLoads.My = Math.max(matchedType.designLoads.My, instance.serviceLoad.My);

      // Update structural steel and concrete volumes
      matchedType.concreteVolume = calculateConcreteVolume(matchedType.systemType, matchedType.B, matchedType.L, matchedType.t);
      matchedType.steelWeight = 
        calculateSteelWeight(matchedType.rebarX.barDia, matchedType.rebarX.count, (matchedType.L - 150) / 1000) + 
        calculateSteelWeight(matchedType.rebarY.barDia, matchedType.rebarY.count, (matchedType.B - 150) / 1000);

      // Merge column sits names
      const cols = Array.from(new Set([...matchedType.columnNames.split(', '), ...instance.columnIds])).filter(Boolean);
      matchedType.columnNames = cols.join(', ');
    }

    // Bind this instance to the governance type
    const updatedInstance: FoundationInstance = {
      ...instance,
      typeId: matchedType.id,
      tag: matchedType.tag
    };

    groupedInstances.push(updatedInstance);
  }

  // Create Foundation Groups (1 group per Type)
  const groups: FoundationGroup[] = types.map(t => {
    const instancesOfType = groupedInstances.filter(inst => inst.typeId === t.id);
    return {
      id: `group_${t.id}`,
      name: `مجموعة القواعد - ${t.tag} Group`,
      typeId: t.id,
      instanceIds: instancesOfType.map(inst => inst.id)
    };
  });

  // Assign group links back to instances
  groupedInstances.forEach(inst => {
    const associatedGroup = groups.find(g => g.typeId === inst.typeId);
    if (associatedGroup) {
      inst.groupId = associatedGroup.id;
    }
  });

  return { types, groupedInstances, groups };
}

/**
 * Computes consolidated quantities, statistics, and unification parameters
 */
export function calculateProjectFoundationStats(
  instances: FoundationInstance[],
  types: FoundationType[]
): ProjectFoundationStats {
  const totalCount = instances.length;
  const totalTypes = types.length;
  const unificationRatio = totalCount > 0 ? totalCount / (totalTypes || 1) : 0;

  let totalConcreteVolume = 0;
  let totalSteelWeight = 0;

  const typeDistribution: Record<string, number> = {};
  const systemBreakdown: Record<FoundationSystemType, { count: number; concrete: number; steel: number }> = {
    isolated: { count: 0, concrete: 0, steel: 0 },
    strip: { count: 0, concrete: 0, steel: 0 },
    combined: { count: 0, concrete: 0, steel: 0 },
    raft: { count: 0, concrete: 0, steel: 0 }
  };

  // Aggregate quantities over INSTANCES (with each instance receiving its governed Type size)
  for (const inst of instances) {
    const matchedType = types.find(t => t.id === inst.typeId);
    if (!matchedType) continue;

    // Distribute stats
    typeDistribution[matchedType.tag] = (typeDistribution[matchedType.tag] || 0) + 1;

    // Concrete & Steel volumes per instance derived from governed Type properties
    const vol = matchedType.concreteVolume;
    const steel = matchedType.steelWeight;

    totalConcreteVolume += vol;
    totalSteelWeight += steel;

    systemBreakdown[inst.systemType].count++;
    systemBreakdown[inst.systemType].concrete += vol;
    systemBreakdown[inst.systemType].steel += steel;
  }

  return {
    totalCount,
    totalTypes,
    totalConcreteVolume,
    totalSteelWeight,
    unificationRatio,
    typeDistribution,
    systemBreakdown
  };
}

/**
 * Performs sanity validation checks on the foundation database
 */
export function validateFoundationDatabase(
  instances: FoundationInstance[],
  types: FoundationType[]
): {
  isValid: boolean;
  warnings: string[];
} {
  const warnings: string[] = [];

  // 1. Verify no duplicate tags
  const tags = types.map(t => t.tag);
  const duplicates = tags.filter((item, index) => tags.indexOf(item) !== index);
  if (duplicates.length > 0) {
    warnings.push(`الوسوم التالية مكررة في المخطط: ${Array.from(new Set(duplicates)).join(', ')} (Duplicate tags)`);
  }

  // 2. Verify no missing type references on instances
  const missingTypeRef = instances.filter(i => !i.typeId || !types.some(t => t.id === i.typeId));
  if (missingTypeRef.length > 0) {
    warnings.push(`هناك ${missingTypeRef.length} قاعدة منفصلة لا تنتمي لأي نموذج أساس مصنف (Orphan Instance)`);
  }

  // 3. Verify no orphan foundation types (types with 0 instances referencing them)
  const orphanTypes = types.filter(t => !instances.some(i => i.typeId === t.id));
  if (orphanTypes.length > 0) {
    orphanTypes.forEach(ot => {
      ot.isOrphan = true;
      warnings.push(`الموديل ${ot.tag} لا يحتوي على أي قاعدة منفذة في المخطط (Orphan Type)`);
    });
  }

  return {
    isValid: warnings.length === 0,
    warnings
  };
}

/**
 * Generate synthetic layout instances if no batch isolated footing outputs are active
 * ensures wonderful demonstration first-time out of the box.
 */
export function generateSampleFoundations(): FoundationInstance[] {
  return [
    {
      id: 'F_C1',
      name: 'قاعدة العمود C1',
      systemType: 'isolated',
      x: 0,
      y: 0,
      B: 2000,
      L: 2000,
      t: 500,
      columnIds: ['C1'],
      rebarX: { barDia: 14, count: 12, spacing: 150 },
      rebarY: { barDia: 14, count: 12, spacing: 150 },
      serviceLoad: { P: 450, Mx: 5, My: 8 }
    },
    {
      id: 'F_C2',
      name: 'قاعدة العمود C2',
      systemType: 'isolated',
      x: 4.5,
      y: 0,
      B: 2000,
      L: 2000,
      t: 500,
      columnIds: ['C2'],
      rebarX: { barDia: 14, count: 12, spacing: 150 },
      rebarY: { barDia: 14, count: 12, spacing: 150 },
      serviceLoad: { P: 460, Mx: 4, My: 7 }
    },
    {
      id: 'F_C3',
      name: 'قاعدة العمود C3',
      systemType: 'isolated',
      x: 9.0,
      y: 0,
      B: 1800,
      L: 1800,
      t: 450,
      columnIds: ['C3'],
      rebarX: { barDia: 14, count: 10, spacing: 180 },
      rebarY: { barDia: 14, count: 10, spacing: 180 },
      serviceLoad: { P: 320, Mx: 3, My: 5 }
    },
    {
      id: 'F_C4',
      name: 'قاعدة العمود C4',
      systemType: 'isolated',
      x: 0,
      y: 5.0,
      B: 2200,
      L: 2200,
      t: 550,
      columnIds: ['C4'],
      rebarX: { barDia: 16, count: 14, spacing: 150 },
      rebarY: { barDia: 16, count: 14, spacing: 150 },
      serviceLoad: { P: 680, Mx: 12, My: 15 }
    },
    {
      id: 'F_C5',
      name: 'قاعدة العمود C5',
      systemType: 'isolated',
      x: 4.5,
      y: 5.0,
      B: 2200,
      L: 2200,
      t: 550,
      columnIds: ['C5'],
      rebarX: { barDia: 16, count: 14, spacing: 150 },
      rebarY: { barDia: 16, count: 14, spacing: 150 },
      serviceLoad: { P: 695, Mx: 10, My: 14 }
    },
    // Adding custom strip, combined, and raft foundations for mixed demo
    {
      id: 'SF_W1',
      name: 'أساس شريطي للجدار الشمالي SF1',
      systemType: 'strip',
      x: 2.25,
      y: -2.5,
      B: 1200,
      L: 5000,
      t: 400,
      columnIds: ['W1', 'W2'],
      rebarX: { barDia: 12, count: 8, spacing: 150 }, // Main longitudinal
      rebarY: { barDia: 12, count: 25, spacing: 200 }, // Transverse draft
      serviceLoad: { P: 250, Mx: 0, My: 0 }
    },
    {
      id: 'CF_C6_C7',
      name: 'قاعدة مشتركة CF1 للعمودين C6 و C7',
      systemType: 'combined',
      x: 9.0,
      y: 5.0,
      B: 1600,
      L: 4200,
      t: 600,
      columnIds: ['C6', 'C7'],
      rebarX: { barDia: 16, count: 18, spacing: 120 },
      rebarY: { barDia: 14, count: 22, spacing: 150 },
      serviceLoad: { P: 950, Mx: 25, My: 10 }
    },
    {
      id: 'RF_R1',
      name: 'لبشة خرسانية مسلحة RF1 لبيت الدرج والمنور',
      systemType: 'raft',
      x: 4.5,
      y: 9.0,
      B: 4000,
      L: 6000,
      t: 800,
      columnIds: ['CR1', 'CR2', 'CR3', 'CR4'],
      rebarX: { barDia: 16, count: 32, spacing: 150 },
      rebarY: { barDia: 16, count: 48, spacing: 150 },
      serviceLoad: { P: 2200, Mx: 85, My: 120 }
    }
  ];
}
