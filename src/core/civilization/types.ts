/**
 * Domain types for Focus Quest Civilization Map Engine.
 * Milestone 5B.1: Core Map Grid & Collision Validation Engine
 *
 * Pure domain definitions: zero UI, zero DOM, zero external runtime dependencies.
 */

/** An integer column (x) and row (y) on the map grid */
export interface GridCoordinate {
  readonly x: number;
  readonly y: number;
}

/** Width and height in grid cell units */
export interface GridDimensions {
  readonly width: number;
  readonly height: number;
}

/** An expansion chunk of 4x4 cells */
export interface GridChunk {
  readonly id: string;
  readonly origin: GridCoordinate;
  readonly dimensions: GridDimensions;
}

/** Footprint dimensions of a building in cell units */
export interface BuildingFootprint {
  readonly width: number;
  readonly height: number;
}

/**
 * Logical status of any queried cell:
 * - EMPTY: Cell is unlocked and free for building placement.
 * - OCCUPIED: Cell is unlocked and currently occupied by a building instance.
 * - BLOCKED: Cell is outside unlocked territory or invalid coordinate.
 */
export type CellStatus = 'EMPTY' | 'OCCUPIED' | 'BLOCKED';

/** State descriptor of a single cell */
export interface CellState {
  readonly coordinate: GridCoordinate;
  readonly status: CellStatus;
  readonly buildingInstanceId?: string;
}

/** Reasons why a building placement attempt may fail */
export type PlacementFailureReason =
  | 'INVALID_COORDINATE'
  | 'INVALID_FOOTPRINT'
  | 'INVALID_BUILDING_ID'
  | 'DUPLICATE_BUILDING_ID'
  | 'OUT_OF_BOUNDS'
  | 'CELL_LOCKED'
  | 'CELL_OCCUPIED';

/** Detailed result of a placement validation check */
export interface PlacementValidationResult {
  readonly isValid: boolean;
  readonly reason?: PlacementFailureReason;
  readonly conflictingCoordinate?: GridCoordinate;
  readonly conflictingBuildingId?: string;
}

/** Reasons why expanding a chunk may fail */
export type ChunkExpansionFailureReason =
  | 'INVALID_ORIGIN'
  | 'CHUNK_ALREADY_EXISTS'
  | 'CHUNK_NOT_ADJACENT'
  | 'CHUNK_OVERLAPS_EXISTING';

/** Result of an explicit chunk expansion operation */
export interface ChunkExpansionResult {
  readonly success: boolean;
  readonly chunk?: GridChunk;
  readonly reason?: ChunkExpansionFailureReason;
}

/** Result of committing a building placement */
export interface PlacementOperationResult {
  readonly success: boolean;
  readonly reason?: PlacementFailureReason;
  readonly placedBuildingId?: string;
  readonly conflictingCoordinate?: GridCoordinate;
  readonly conflictingBuildingId?: string;
}

/** Result of removing a building from the map */
export interface RemovalOperationResult {
  readonly success: boolean;
  readonly freedCellCount: number;
  readonly removedBuildingId?: string;
  readonly reason?: 'BUILDING_NOT_FOUND' | 'INVALID_BUILDING_ID';
}

/** Internal record for an active building placed on the map */
export interface PlacedBuildingRecord {
  readonly buildingInstanceId: string;
  readonly anchor: GridCoordinate;
  readonly footprint: BuildingFootprint;
  readonly occupiedCellKeys: readonly string[];
}

/** Bounding box of the currently unlocked map */
export interface MapBoundingBox {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
  readonly width: number;
  readonly height: number;
}

/** Serializable snapshot of GridMap state for persistence */
export interface GridMapSnapshot {
  readonly chunks: readonly GridChunk[];
  readonly buildings: readonly {
    readonly buildingInstanceId: string;
    readonly anchor: GridCoordinate;
    readonly footprint: BuildingFootprint;
  }[];
}
