/**
 * Pure placement and collision validation logic for Civilization Map Engine.
 * Milestone 5B.1: Core Map Grid & Collision Validation Engine
 *
 * All functions are pure, deterministic, and free of side-effects.
 */

import {
  GridCoordinate,
  BuildingFootprint,
  PlacementValidationResult,
  PlacementFailureReason,
} from './types.ts';

/**
 * Validates that an arbitrary value is a well-formed integer GridCoordinate.
 */
export function isValidCoordinate(pos: unknown): pos is GridCoordinate {
  if (typeof pos !== 'object' || pos === null) return false;
  const p = pos as { x?: unknown; y?: unknown };
  return (
    typeof p.x === 'number' &&
    Number.isInteger(p.x) &&
    typeof p.y === 'number' &&
    Number.isInteger(p.y)
  );
}

/**
 * Validates that an arbitrary value is a well-formed positive integer BuildingFootprint.
 */
export function isValidFootprint(fp: unknown): fp is BuildingFootprint {
  if (typeof fp !== 'object' || fp === null) return false;
  const f = fp as { width?: unknown; height?: unknown };
  return (
    typeof f.width === 'number' &&
    Number.isInteger(f.width) &&
    f.width > 0 &&
    typeof f.height === 'number' &&
    Number.isInteger(f.height) &&
    f.height > 0
  );
}

/**
 * Validates that an arbitrary building ID is a valid non-empty string.
 */
export function isValidBuildingId(id: unknown): id is string {
  return typeof id === 'string' && id.trim().length > 0;
}

/**
 * Generate all cell coordinates covered by a building anchor and footprint.
 * Anchor (x, y) is the top-left cell. Footprint expands right (width) and down (height).
 */
export function getFootprintCoordinates(
  anchor: GridCoordinate,
  footprint: BuildingFootprint
): GridCoordinate[] {
  const coords: GridCoordinate[] = [];
  for (let dy = 0; dy < footprint.height; dy++) {
    for (let dx = 0; dx < footprint.width; dx++) {
      coords.push({
        x: anchor.x + dx,
        y: anchor.y + dy,
      });
    }
  }
  return coords;
}

/**
 * Query context required to validate a placement against a map instance.
 */
export interface PlacementValidationContext {
  /** True if cell is within unlocked chunk territory */
  isCellUnlocked(x: number, y: number): boolean;
  /** Returns the building instance ID if occupied, or undefined if empty */
  getOccupyingBuilding(x: number, y: number): string | undefined;
  /** True if the building ID already exists on the map */
  hasBuilding(buildingId: string): boolean;
  /** True if cell is within the outer coordinate bounding envelope of the unlocked map */
  isWithinMapEnvelope(x: number, y: number): boolean;
}

/**
 * Pure validation of a proposed building placement.
 * Returns detailed validation result including exact failure reason and conflict details.
 */
export function validatePlacement(
  position: unknown,
  footprint: unknown,
  context: PlacementValidationContext,
  buildingInstanceId?: unknown
): PlacementValidationResult {
  // 1. Validate coordinate
  if (!isValidCoordinate(position)) {
    return {
      isValid: false,
      reason: 'INVALID_COORDINATE',
    };
  }

  // 2. Validate footprint dimensions
  if (!isValidFootprint(footprint)) {
    return {
      isValid: false,
      reason: 'INVALID_FOOTPRINT',
    };
  }

  // 3. Validate building ID if supplied
  if (buildingInstanceId !== undefined) {
    if (!isValidBuildingId(buildingInstanceId)) {
      return {
        isValid: false,
        reason: 'INVALID_BUILDING_ID',
      };
    }
    if (context.hasBuilding(buildingInstanceId)) {
      return {
        isValid: false,
        reason: 'DUPLICATE_BUILDING_ID',
      };
    }
  }

  // 4. Validate every cell within the footprint
  const targetCells = getFootprintCoordinates(position, footprint);

  for (const cell of targetCells) {
    // Check if cell is unlocked
    if (!context.isCellUnlocked(cell.x, cell.y)) {
      // Differentiate between completely outside map boundary vs locked chunk gap
      const isOutside = !context.isWithinMapEnvelope(cell.x, cell.y);
      const reason: PlacementFailureReason = isOutside ? 'OUT_OF_BOUNDS' : 'CELL_LOCKED';
      return {
        isValid: false,
        reason,
        conflictingCoordinate: cell,
      };
    }

    // Check if cell is already occupied by another building
    const occupyingBuildingId = context.getOccupyingBuilding(cell.x, cell.y);
    if (occupyingBuildingId !== undefined) {
      return {
        isValid: false,
        reason: 'CELL_OCCUPIED',
        conflictingCoordinate: cell,
        conflictingBuildingId: occupyingBuildingId,
      };
    }
  }

  // All cells are unlocked and empty
  return {
    isValid: true,
  };
}
