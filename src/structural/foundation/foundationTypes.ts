// ===================== FOUNDATION DATA MODEL TYPES =====================

export enum FoundationType {
  Isolated = "isolated",
  Wall = "wall",
  Raft = "raft",
  Pile = "pile",
  Strap = "strap",
  Combined = "combined"
}

export interface Foundation {
  id: string;              // Primary Key
  name: string;            // e.g., "F1", "F-col2"
  type: FoundationType;    // FoundationType value
  materialFc: number;      // f'c in MPa (concrete strength)
  materialFy: number;      // fy in MPa (reinforcement strength)
  groupId?: string;        // Refers to FoundationGroup table (optional)
  description?: string;
}

export interface FoundationGeometry {
  foundationId: string;    // Primary Key & Foreign Key to Foundation table
  shape: "square" | "rectangular" | "circle" | "polygon";
  width: number;           // mm (B)
  length: number;          // mm (L)
  thickness: number;        // mm (H)
  offsetX: number;         // mm (offset from supported object center in X)
  offsetY: number;         // mm (offset from supported object center in Y)
  elevation: number;       // mm (top of footing elevation)
}

export interface FoundationAssignment {
  id: string;              // Primary Key
  foundationId: string;    // Foreign Key to Foundation table
  supportedId: string;     // Column.id or Wall.id
  supportedType: "column" | "wall";
}

export interface FoundationLevel {
  id: string;              // Primary Key
  name: string;            // e.g., "SGL", "Basement"
  elevation: number;       // mm
  storyId?: string;        // Associated story ID if any
}

export interface SoilAssignment {
  foundationId: string;    // Primary Key & Foreign Key to Foundation table
  qall: number;            // Allowable soil bearing capacity (kN/m²)
  modulusSubgrade?: number;// Modulus of subgrade reaction (kN/m³) (for rafts/piles)
  settlementLimit?: number;// Permissible settlement (mm)
}

export interface FoundationGroup {
  id: string;              // Primary Key
  name: string;            // e.g., "Group A - Heavy Columns"
  description?: string;
}

// Validation types
export interface FoundationValidationIssue {
  id: string;
  type: "col_without_foundation" | "wall_without_foundation" | "foundation_without_supported" | "duplicate_assignment" | "invalid_reference" | "missing_geometry" | "missing_soil";
  severity: "error" | "warning";
  message: string;
  objectId: string; // ID of the model object causing the issue
}
