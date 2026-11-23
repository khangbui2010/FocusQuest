/**
 * Pure Villager Domain Engine for Focus Quest Civilization.
 * Milestone Villager V2: Villager Model, Cave Capacity, Recruitment & Idle Spots
 *
 * Rules:
 * - Strictly pure deterministic functions (zero Date.now(), zero Math.random(), zero I/O).
 * - Cave capacity = 2 * caveLevel (0 if no cave exists).
 * - Recruitment cost = round(40 * 1.35^currentCount).
 * - Placement limit: at most 1 Cave (MAX_VILLAGE_CAVES = 1).
 * - Deterministic idle spots around Cave entrance for MapGridView rendering.
 */

import {
  VILLAGER_BASE_RECRUIT_COST,
  VILLAGER_RECRUIT_COST_RATIO,
  VILLAGER_CAPACITY_PER_CAVE_LEVEL,
} from './constants.ts';
import {
  VillagerRole,
  isVillagerRole,
} from '../../ui/components/civilization/spriteRegistry.ts';
import { BuildingInstance } from './buildingTypes.ts';
import { GridCoordinate } from './types.ts';
import { GridMap } from './gridMap.ts';

export const VILLAGE_CAVE_DEFINITION_ID = 'stone_age_study_cave';

export interface Villager {
  readonly id: string;
  readonly role: VillagerRole;
  readonly recruitedAt: number;
}

export type RecruitFailureReason =
  | 'CIV_INVALID_VILLAGER_ROLE'
  | 'CIV_NO_VILLAGE_CAVE'
  | 'CIV_VILLAGER_CAPACITY_REACHED'
  | 'CIV_VILLAGER_INSUFFICIENT_COINS';

export interface RecruitEvaluationResult {
  readonly canRecruit: boolean;
  readonly reason?: RecruitFailureReason;
  readonly cost: number;
  readonly capacity: number;
  readonly currentCount: number;
  readonly shortfallCoins?: number;
}

export interface VillagerIdleSpot {
  readonly villagerId: string;
  readonly role: VillagerRole;
  readonly coordinate: GridCoordinate;
}

export interface EvaluateRecruitmentInput {
  readonly caveBuilding?: BuildingInstance;
  readonly villagers?: readonly Villager[];
  readonly playerCoins: number;
  readonly role: unknown;
}

/**
 * Finds the active Meditation Cave instance on the map (or undefined if absent).
 */
export function findVillageCave(
  buildings: readonly BuildingInstance[]
): BuildingInstance | undefined {
  for (const building of buildings) {
    if (building.definitionId === VILLAGE_CAVE_DEFINITION_ID) {
      return building;
    }
  }
  return undefined;
}

/**
 * Calculates village population capacity granted by Meditation Cave level.
 * Each cave level grants +2 villager capacity (Lv 1: 2, Lv 2: 4, Lv 3: 6, Lv 4: 8, Lv 5: 10).
 * Returns 0 if no cave is placed or if level is invalid.
 */
export function getVillagerCapacity(
  caveBuilding: Pick<BuildingInstance, 'level'> | null | undefined
): number {
  if (
    !caveBuilding ||
    typeof caveBuilding.level !== 'number' ||
    !Number.isInteger(caveBuilding.level) ||
    caveBuilding.level < 1
  ) {
    return 0;
  }
  return caveBuilding.level * VILLAGER_CAPACITY_PER_CAVE_LEVEL;
}

/**
 * Calculates the Focus Coins cost to recruit the next villager given the current count:
 * Cost = Math.round(40 * 1.35^currentVillagerCount)
 * Examples: 0 -> 40, 1 -> 54, 2 -> 73, 3 -> 98, 4 -> 133, ..., 9 -> 596.
 */
export function getVillagerRecruitCost(currentVillagerCount: number): number {
  const count =
    typeof currentVillagerCount === 'number' &&
    Number.isFinite(currentVillagerCount) &&
    currentVillagerCount >= 0
      ? Math.floor(currentVillagerCount)
      : 0;
  const rawCost = VILLAGER_BASE_RECRUIT_COST * Math.pow(VILLAGER_RECRUIT_COST_RATIO, count);
  return Math.round(rawCost);
}

/**
 * Pure evaluator checking role validity, Cave existence, capacity, and player Coins.
 */
export function evaluateRecruitment(input: EvaluateRecruitmentInput): RecruitEvaluationResult {
  const { caveBuilding, villagers = [], playerCoins, role } = input;
  const currentCount = villagers.length;
  const capacity = getVillagerCapacity(caveBuilding);
  const cost = getVillagerRecruitCost(currentCount);

  if (!isVillagerRole(role)) {
    return {
      canRecruit: false,
      reason: 'CIV_INVALID_VILLAGER_ROLE',
      cost,
      capacity,
      currentCount,
    };
  }

  if (!caveBuilding) {
    return {
      canRecruit: false,
      reason: 'CIV_NO_VILLAGE_CAVE',
      cost,
      capacity: 0,
      currentCount,
    };
  }

  if (currentCount >= capacity) {
    return {
      canRecruit: false,
      reason: 'CIV_VILLAGER_CAPACITY_REACHED',
      cost,
      capacity,
      currentCount,
    };
  }

  if (typeof playerCoins !== 'number' || !Number.isFinite(playerCoins) || playerCoins < cost) {
    const safeBalance =
      typeof playerCoins === 'number' && Number.isFinite(playerCoins) ? playerCoins : 0;
    return {
      canRecruit: false,
      reason: 'CIV_VILLAGER_INSUFFICIENT_COINS',
      cost,
      capacity,
      currentCount,
      shortfallCoins: Math.max(0, cost - safeBalance),
    };
  }

  return {
    canRecruit: true,
    cost,
    capacity,
    currentCount,
  };
}

/**
 * Pure applier: returns an immutable new villager list with `newVillager` appended.
 */
export function applyRecruitment(
  villagers: readonly Villager[],
  newVillager: Villager
): readonly Villager[] {
  return [...villagers, newVillager];
}

const PRIORITY_CAVE_ENTRANCE_OFFSETS: readonly [number, number][] = (() => {
  const offsets: [number, number][] = [
    // Row 1 directly south of 3x3 Cave entrance (cave bottom row is dy=0, so dy=1 is y+3)
    [0, 1],
    [-1, 1],
    [1, 1],
    // Immediate west/east sides of Cave bottom row
    [-2, 0],
    [2, 0],
    [-2, 1],
    [2, 1],
    // Row 2 south of Cave
    [0, 2],
    [-1, 2],
    [1, 2],
    [-2, 2],
    [2, 2],
    // Flanking west/east of Cave middle & top rows
    [-2, -1],
    [2, -1],
    [-2, -2],
    [2, -2],
    // Directly north of Cave
    [0, -3],
    [-1, -3],
    [1, -3],
    [-2, -3],
    [2, -3],
  ];

  const seen = new Set(offsets.map(([dx, dy]) => `${dx},${dy}`));

  // Deterministic outer rings (radius 3..5) so up to 10 villagers always find free cells
  // whenever unlocked space exists around the Cave without overlapping buildings.
  for (let radius = 3; radius <= 5; radius++) {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        const key = `${dx},${dy}`;
        if (!seen.has(key)) {
          seen.add(key);
          offsets.push([dx, dy]);
        }
      }
    }
  }

  return offsets;
})();

/**
 * Deterministically computes unlocked, unoccupied grass cells near the 3x3 Cave entrance
 * (`cave.position.x + 1, cave.position.y + 2`) for idle villagers.
 * - Sorts stably by `(recruitedAt, id)` without mutating input array.
 * - Skips any villager if no free unlocked cell is available (never invents occupied/locked coords).
 */
export function getVillagerIdleSpots(
  villagers: readonly Villager[],
  cave: BuildingInstance | undefined,
  gridMap: GridMap
): readonly VillagerIdleSpot[] {
  if (!cave || villagers.length === 0) {
    return [];
  }

  // Entrance anchor cell at bottom-center of 3x3 Cave footprint
  const entranceX = cave.position.x + 1;
  const entranceY = cave.position.y + 2;

  const sortedVillagers = [...villagers].sort(
    (a, b) => a.recruitedAt - b.recruitedAt || a.id.localeCompare(b.id)
  );

  const assignedSpots: VillagerIdleSpot[] = [];
  const usedCoords = new Set<string>();

  for (const villager of sortedVillagers) {
    let foundCoord: GridCoordinate | null = null;

    for (const [dx, dy] of PRIORITY_CAVE_ENTRANCE_OFFSETS) {
      const cx = entranceX + dx;
      const cy = entranceY + dy;
      const key = `${cx},${cy}`;

      if (usedCoords.has(key)) {
        continue;
      }

      if (gridMap.isCellUnlocked(cx, cy) && gridMap.getOccupyingBuilding(cx, cy) === undefined) {
        foundCoord = { x: cx, y: cy };
        usedCoords.add(key);
        break;
      }
    }

    if (foundCoord) {
      assignedSpots.push({
        villagerId: villager.id,
        role: villager.role,
        coordinate: foundCoord,
      });
    }
  }

  return assignedSpots;
}
