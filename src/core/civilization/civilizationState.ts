/**
 * Civilization state model and validation for Focus Quest.
 * Milestone 5B.2: Building Catalog & Storage Schema v2 Migration
 *
 * Manages the top-level persistent representation of the player's civilization:
 * grid map snapshot, placed building instances, current era, and consistency checks.
 */

import { GridMapSnapshot } from './types.ts';
import { GridMap, decodeCoordinateKey } from './gridMap.ts';
import { isValidCoordinate, isValidBuildingId, getFootprintCoordinates } from './placementValidator.ts';
import {
  CivilizationEra,
  BuildingInstance,
  CIVILIZATION_ERAS,
} from './buildingTypes.ts';
import { getBuildingDefinition } from './buildingCatalog.ts';
import { Villager } from './villager.ts';
import { isVillagerRole } from '../../ui/components/civilization/spriteRegistry.ts';

export type { Villager };
export const CURRENT_CIVILIZATION_SCHEMA_VERSION = 2;

/**
 * Top-level state of the player's civilization stored in persistent storage.
 */
export interface CivilizationState {
  readonly schemaVersion: number;
  readonly era: CivilizationEra;
  readonly grid: GridMapSnapshot;
  readonly buildings: readonly BuildingInstance[];
  readonly lastUpdated: number;
  readonly villagers?: readonly Villager[];
}

/**
 * Result of comprehensive CivilizationState consistency validation.
 */
export interface CivilizationStateValidationResult {
  readonly isValid: boolean;
  readonly errors: readonly string[];
}

/**
 * Creates the initial, default CivilizationState for a new player or newly migrated storage.
 * - Initial Era: STONE_AGE
 * - Initial Grid: 8x8 cells (4 chunks of 4x4, 64 unlocked cells)
 * - Buildings: Empty list (0 buildings automatically constructed)
 * - Villagers: Empty list
 */
export function createInitialCivilizationState(): CivilizationState {
  const initialMap = new GridMap();
  return {
    schemaVersion: CURRENT_CIVILIZATION_SCHEMA_VERSION,
    era: 'STONE_AGE',
    grid: initialMap.toSnapshot(),
    buildings: [],
    villagers: [],
    lastUpdated: Date.now(),
  };
}

/**
 * Type guard for CivilizationEra.
 */
export function isValidEra(era: unknown): era is CivilizationEra {
  return (
    typeof era === 'string' &&
    CIVILIZATION_ERAS.includes(era as CivilizationEra)
  );
}

/**
 * Comprehensive validation of CivilizationState.
 * Verifies structural integrity, catalog definitions, spatial alignment,
 * footprint accuracy, and bidirectional occupancy agreement with GridMap.
 * Rejects legacy 10x10 chunk states so sanitizeCivilizationState re-seeds 8x8 cleanly.
 */
export function validateCivilizationState(state: unknown): CivilizationStateValidationResult {
  const errors: string[] = [];

  if (typeof state !== 'object' || state === null || Array.isArray(state)) {
    return { isValid: false, errors: ['State must be a non-null object'] };
  }

  const s = state as Partial<CivilizationState>;

  // 1. Schema version (kept at 2 for Stage 4a-2; v3 is reserved for Quest schema in Stage 2a)
  if (typeof s.schemaVersion !== 'number' || !Number.isInteger(s.schemaVersion) || s.schemaVersion < 1) {
    errors.push(`Invalid schemaVersion: expected integer >= 1, got ${String(s.schemaVersion)}`);
  }

  // 2. Era
  if (!isValidEra(s.era)) {
    errors.push(`Invalid era: ${String(s.era)}`);
  }

  // 3. Grid snapshot presence
  if (
    typeof s.grid !== 'object' ||
    s.grid === null ||
    !Array.isArray(s.grid.chunks) ||
    !Array.isArray(s.grid.buildings)
  ) {
    errors.push('Invalid grid snapshot: expected GridMapSnapshot with chunks and buildings');
    return { isValid: false, errors };
  }

  // Attempt GridMap reconstitution to verify geometry (rejects legacy 10x10 chunks)
  let reconstructedMap: GridMap;
  try {
    reconstructedMap = GridMap.fromSnapshot(s.grid);
  } catch (err) {
    errors.push(`Failed to reconstruct GridMap from snapshot: ${err instanceof Error ? err.message : String(err)}`);
    return { isValid: false, errors };
  }

  // 4. Buildings array
  if (!Array.isArray(s.buildings)) {
    errors.push('Buildings must be an array');
    return { isValid: false, errors };
  }

  const seenInstanceIds = new Set<string>();
  let totalExpectedOccupiedCells = 0;

  for (let i = 0; i < s.buildings.length; i++) {
    const inst = s.buildings[i] as Partial<BuildingInstance>;

    // 4.1 Instance ID
    if (!isValidBuildingId(inst.id)) {
      errors.push(`Building[${i}] has invalid or empty id`);
      continue;
    }
    if (seenInstanceIds.has(inst.id!)) {
      errors.push(`Duplicate building instance id detected: "${inst.id}"`);
    } else {
      seenInstanceIds.add(inst.id!);
    }

    // 4.2 Definition reference
    if (typeof inst.definitionId !== 'string' || inst.definitionId.length === 0) {
      errors.push(`Building "${inst.id}" has invalid definitionId`);
      continue;
    }
    const def = getBuildingDefinition(inst.definitionId);
    if (!def) {
      errors.push(`Building "${inst.id}" references unknown definitionId "${inst.definitionId}"`);
      continue;
    }

    // 4.3 Position
    if (!isValidCoordinate(inst.position)) {
      errors.push(`Building "${inst.id}" has invalid position`);
      continue;
    }

    // 4.4 Level
    if (
      typeof inst.level !== 'number' ||
      !Number.isInteger(inst.level) ||
      inst.level < 1 ||
      inst.level > def.maxLevel
    ) {
      errors.push(
        `Building "${inst.id}" level ${String(inst.level)} is out of range [1, ${def.maxLevel}]`
      );
    }

    // 4.5 Spatial occupancy verification in reconstructed GridMap
    const expectedCells = getFootprintCoordinates(inst.position, def.footprint);
    totalExpectedOccupiedCells += expectedCells.length;

    for (const cell of expectedCells) {
      if (!reconstructedMap.isCellUnlocked(cell.x, cell.y)) {
        errors.push(
          `Building "${inst.id}" occupies locked or out-of-bounds cell (${cell.x}, ${cell.y})`
        );
      } else {
        const occupyingId = reconstructedMap.getOccupyingBuilding(cell.x, cell.y);
        if (occupyingId !== inst.id) {
          errors.push(
            `GridMap occupancy mismatch at (${cell.x}, ${cell.y}): expected "${inst.id}", found "${String(occupyingId)}"`
          );
        }
      }
    }
  }

  // 5. Reverse check: Total occupied cells in grid must equal total expected cells (no orphaned cells)
  if (reconstructedMap.getOccupiedCellCount() !== totalExpectedOccupiedCells) {
    errors.push(
      `GridMap total occupied cells (${reconstructedMap.getOccupiedCellCount()}) does not match total building footprint area (${totalExpectedOccupiedCells})`
    );
  }

  // 6. Villagers array validation (if present)
  if (s.villagers !== undefined) {
    if (!Array.isArray(s.villagers)) {
      errors.push('Villagers must be an array when defined');
    } else {
      const seenVillagerIds = new Set<string>();
      for (let i = 0; i < s.villagers.length; i++) {
        const v = s.villagers[i] as Partial<Villager>;
        if (typeof v.id !== 'string' || v.id.length === 0) {
          errors.push(`Villager[${i}] has invalid or empty id`);
        } else if (seenVillagerIds.has(v.id)) {
          errors.push(`Duplicate villager id detected: "${v.id}"`);
        } else {
          seenVillagerIds.add(v.id);
        }

        if (!isVillagerRole(v.role)) {
          errors.push(`Villager[${i}] has invalid role "${String(v.role)}"`);
        }
        if (typeof v.recruitedAt !== 'number' || !Number.isFinite(v.recruitedAt) || v.recruitedAt <= 0) {
          errors.push(`Villager[${i}] has invalid recruitedAt timestamp`);
        }
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Defensive sanitizer for CivilizationState loaded from storage.
 * Returns null if the state is missing, legacy (10x10), or corrupt.
 */
export function sanitizeCivilizationState(raw: unknown): CivilizationState | null {
  if (!raw) return null;
  const validation = validateCivilizationState(raw);
  if (!validation.isValid) {
    return null;
  }
  return raw as CivilizationState;
}
