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
import { getEffectiveMaxLevel } from './eraRules.ts';
import {
  Villager,
  findVillageCave,
  getVillagerCapacity,
} from './villager.ts';
import {
  ConstructionJob,
  MAX_ACTIVE_CONSTRUCTION_JOBS,
  getTotalVillagerCount,
} from './jobs.ts';
import { CHUNK_HEIGHT, CHUNK_WIDTH } from './constants.ts';
import {
  VillagerRole,
  isVillagerRole,
} from '../../ui/components/civilization/spriteRegistry.ts';

export const CURRENT_CIVILIZATION_SCHEMA_VERSION = 2;

/**
 * Top-level state of the player's civilization stored in persistent storage.
 */
export interface CivilizationState {
  readonly schemaVersion: number;
  readonly era: CivilizationEra;
  readonly grid: GridMapSnapshot;
  readonly buildings: readonly BuildingInstance[];
  readonly villagers?: readonly Villager[];
  readonly jobs?: readonly ConstructionJob[];
  readonly founderRole?: VillagerRole | null;
  readonly lastUpdated: number;
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
 */
export function createInitialCivilizationState(): CivilizationState {
  const initialMap = new GridMap();
  return {
    schemaVersion: CURRENT_CIVILIZATION_SCHEMA_VERSION,
    era: 'STONE_AGE',
    grid: initialMap.toSnapshot(),
    buildings: [],
    villagers: [],
    jobs: [],
    founderRole: null,
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
 * footprint accuracy, bidirectional occupancy agreement with GridMap,
 * villagers, founderRole, and construction jobs invariants.
 * Rejects legacy 10x10 chunk states so sanitizeCivilizationState re-seeds 8x8 cleanly.
 */
export function validateCivilizationState(state: unknown): CivilizationStateValidationResult {
  const errors: string[] = [];

  if (typeof state !== 'object' || state === null || Array.isArray(state)) {
    return { isValid: false, errors: ['State must be a non-null object'] };
  }

  const s = state as Partial<CivilizationState>;

  // 1. Schema version
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
  const buildingById = new Map<string, BuildingInstance>();
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
      buildingById.set(inst.id!, inst as BuildingInstance);
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
    const effectiveMaxLevel = getEffectiveMaxLevel(def, isValidEra(s.era) ? s.era : 'STONE_AGE');
    if (
      typeof inst.level !== 'number' ||
      !Number.isInteger(inst.level) ||
      inst.level < 1 ||
      inst.level > effectiveMaxLevel
    ) {
      errors.push(
        `Building "${inst.id}" level ${String(inst.level)} is out of range [1, ${effectiveMaxLevel}]`
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

  // 6. Optional founderRole validation
  if (s.founderRole !== undefined && s.founderRole !== null && !isVillagerRole(s.founderRole)) {
    errors.push(`Invalid founderRole: "${String(s.founderRole)}"`);
  }

  // 7. Jobs validation (if present)
  const safeJobs: ConstructionJob[] = [];
  if (s.jobs !== undefined) {
    if (!Array.isArray(s.jobs)) {
      errors.push('Jobs must be an array when defined');
    } else {
      const seenJobIds = new Set<string>();
      const placeBuildingIds = new Set<string>();
      const upgradePairs = new Set<string>();
      const expandOrigins = new Set<string>();
      const activeUpgradeBuildingIds = new Set<string>();
      let activeCount = 0;
      let busyCrew = 0;

      // Pass 1: individual job validation
      for (let i = 0; i < s.jobs.length; i += 1) {
        const job = s.jobs[i] as Partial<ConstructionJob>;
        if (!job || typeof job !== 'object') {
          errors.push(`Job[${i}] must be a non-null object`);
          continue;
        }
        if (typeof job.id !== 'string' || job.id.trim().length === 0) {
          errors.push(`Job[${i}] has invalid or empty id`);
        } else if (seenJobIds.has(job.id)) {
          errors.push(`Duplicate construction job id detected: "${job.id}"`);
        } else {
          seenJobIds.add(job.id);
        }

        if (job.kind !== 'place' && job.kind !== 'upgrade' && job.kind !== 'expand') {
          errors.push(`Job "${String(job.id)}" has invalid kind "${String(job.kind)}"`);
          continue;
        }
        if (job.status !== 'ACTIVE' && job.status !== 'PENDING') {
          errors.push(`Job "${String(job.id)}" has invalid status "${String(job.status)}"`);
          continue;
        }
        if (
          typeof job.crewRequired !== 'number' ||
          !Number.isInteger(job.crewRequired) ||
          job.crewRequired < 0
        ) {
          errors.push(`Job "${String(job.id)}" has invalid crewRequired`);
        }
        if (
          typeof job.totalSeconds !== 'number' ||
          !Number.isInteger(job.totalSeconds) ||
          job.totalSeconds <= 0
        ) {
          errors.push(`Job "${String(job.id)}" has invalid totalSeconds`);
        }
        if (
          typeof job.remainingSeconds !== 'number' ||
          !Number.isInteger(job.remainingSeconds) ||
          job.remainingSeconds < 1 ||
          (typeof job.totalSeconds === 'number' && job.remainingSeconds > job.totalSeconds)
        ) {
          errors.push(`Job "${String(job.id)}" has invalid remainingSeconds`);
        }
        if (typeof job.paidCoins !== 'number' || !Number.isFinite(job.paidCoins) || job.paidCoins < 0) {
          errors.push(`Job "${String(job.id)}" has invalid paidCoins`);
        }
        if (typeof job.createdAt !== 'number' || !Number.isFinite(job.createdAt) || job.createdAt < 0) {
          errors.push(`Job "${String(job.id)}" has invalid createdAt`);
        }

        if (job.kind === 'place') {
          if (typeof job.buildingId !== 'string' || !buildingById.has(job.buildingId)) {
            errors.push(`Place job "${String(job.id)}" references missing building "${String(job.buildingId)}"`);
          } else {
            const b = buildingById.get(job.buildingId)!;
            if (b.level !== 1) {
              errors.push(`Under-construction building "${b.id}" must be at level 1`);
            }
            if (placeBuildingIds.has(job.buildingId)) {
              errors.push(`Duplicate place job for building "${job.buildingId}"`);
            }
            placeBuildingIds.add(job.buildingId);
          }
        } else if (job.kind === 'upgrade') {
          if (typeof job.buildingId !== 'string' || !buildingById.has(job.buildingId)) {
            errors.push(`Upgrade job "${String(job.id)}" references missing building "${String(job.buildingId)}"`);
          } else {
            const b = buildingById.get(job.buildingId)!;
            const def = getBuildingDefinition(b.definitionId);
            const effMax = getEffectiveMaxLevel(def, isValidEra(s.era) ? s.era : 'STONE_AGE');
            if (
              typeof job.targetLevel !== 'number' ||
              !Number.isInteger(job.targetLevel) ||
              job.targetLevel <= b.level ||
              job.targetLevel > effMax
            ) {
              errors.push(
                `Upgrade job "${String(job.id)}" targetLevel ${String(job.targetLevel)} invalid for building level ${b.level}`
              );
            } else {
              const pairKey = `${job.buildingId}:${job.targetLevel}`;
              if (upgradePairs.has(pairKey)) {
                errors.push(`Duplicate upgrade job targeting ${pairKey}`);
              }
              upgradePairs.add(pairKey);
            }
          }
        } else if (job.kind === 'expand') {
          if (
            !isValidCoordinate(job.origin) ||
            job.origin.x % CHUNK_WIDTH !== 0 ||
            job.origin.y % CHUNK_HEIGHT !== 0
          ) {
            errors.push(`Expand job "${String(job.id)}" has invalid chunk origin`);
          } else if (reconstructedMap.hasChunkAt(job.origin.x, job.origin.y)) {
            errors.push(`Expand job "${String(job.id)}" targets already unlocked chunk`);
          } else {
            const oKey = `${job.origin.x},${job.origin.y}`;
            if (expandOrigins.has(oKey)) {
              errors.push(`Duplicate expand job for origin (${oKey})`);
            }
            expandOrigins.add(oKey);
          }
        }

        if (job.status === 'ACTIVE') {
          activeCount += 1;
          if (typeof job.crewRequired === 'number' && Number.isFinite(job.crewRequired)) {
            busyCrew += job.crewRequired;
          }
          if (job.kind === 'upgrade' && job.buildingId) {
            if (activeUpgradeBuildingIds.has(job.buildingId)) {
              errors.push(`Multiple ACTIVE upgrade jobs for building "${job.buildingId}"`);
            }
            activeUpgradeBuildingIds.add(job.buildingId);
          }
        }

        safeJobs.push(job as ConstructionJob);
      }

      // Pass 2: cross-check 'upgrade' vs 'place' conflict, max active count & busy crew <= total villagers
      for (const job of safeJobs) {
        if (job.kind === 'upgrade' && job.buildingId && placeBuildingIds.has(job.buildingId)) {
          errors.push(`Building "${job.buildingId}" cannot have both 'place' and 'upgrade' jobs`);
        }
      }

      if (activeCount > MAX_ACTIVE_CONSTRUCTION_JOBS) {
        errors.push(`Active job count (${activeCount}) exceeds limit (${MAX_ACTIVE_CONSTRUCTION_JOBS})`);
      }

      const validVillagers = Array.isArray(s.villagers) ? s.villagers : [];
      const validFounder = isVillagerRole(s.founderRole) ? s.founderRole : null;
      const totalCrew = getTotalVillagerCount(validVillagers, validFounder);
      if (busyCrew > totalCrew) {
        errors.push(`Busy crew (${busyCrew}) exceeds total villagers (${totalCrew})`);
      }
    }
  }

  // 8. Villagers invariant validation (if present; undefined remains valid for pre-v4 compatibility)
  if (s.villagers !== undefined) {
    if (!Array.isArray(s.villagers)) {
      errors.push('Villagers must be an array when defined');
    } else {
      const seenVillagerIds = new Set<string>();
      for (let i = 0; i < s.villagers.length; i++) {
        const v = s.villagers[i] as Partial<Villager>;
        if (!v || typeof v !== 'object') {
          errors.push(`Villager[${i}] must be a non-null object`);
          continue;
        }
        if (typeof v.id !== 'string' || v.id.trim().length === 0) {
          errors.push(`Villager[${i}] has invalid or empty id`);
        } else if (seenVillagerIds.has(v.id)) {
          errors.push(`Duplicate villager id detected: "${v.id}"`);
        } else {
          seenVillagerIds.add(v.id);
        }
        if (!isVillagerRole(v.role)) {
          errors.push(`Villager "${String(v.id)}" has invalid role "${String(v.role)}"`);
        }
        if (
          typeof v.recruitedAt !== 'number' ||
          !Number.isFinite(v.recruitedAt) ||
          v.recruitedAt < 0
        ) {
          errors.push(
            `Villager "${String(v.id)}" has invalid recruitedAt: ${String(v.recruitedAt)}`
          );
        }
      }

      const cave = findVillageCave(s.buildings, safeJobs);
      const capacity = getVillagerCapacity(cave);
      if (s.villagers.length > 0 && !cave) {
        errors.push('Villagers cannot exist without an active Meditation Cave on the map');
      } else if (s.villagers.length > capacity) {
        errors.push(
          `Villager count (${s.villagers.length}) exceeds Cave capacity (${capacity})`
        );
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

