/**
 * Pure Villager Domain Engine for Focus Quest Civilization.
 * Milestone Villager V2: Villager Model, Cave Capacity, Recruitment & Idle Spots
 *
 * Rules:
 * - Pure functions with zero side effects.
 * - Cave capacity = 2 * caveLevel (0 if no cave exists).
 * - Recruitment cost = round(40 * 1.35^(n-1)) where n is 1-indexed, or round(40 * 1.35^currentCount).
 * - Placement limit: at most 1 Cave.
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
  readonly message?: string;
  readonly params?: Record<string, string | number>;
}

export interface VillagerIdleSpot {
  readonly villagerId: string;
  readonly role: VillagerRole;
  readonly coordinate: GridCoordinate;
}

/**
 * Calculates village population capacity granted by Meditation Cave level.
 * Each cave level grants +2 villager capacity (Lv 1: 2, Lv 2: 4, Lv 3: 6, Lv 4: 8, Lv 5: 10).
 * Returns 0 if no cave is placed or if level is invalid.
 */
export function getVillagerCapacity(
  caveBuilding: Pick<BuildingInstance, 'level'> | null | undefined
): number {
  if (!caveBuilding || typeof caveBuilding.level !== 'number' || caveBuilding.level < 1) {
    return 0;
  }
  return caveBuilding.level * VILLAGER_CAPACITY_PER_CAVE_LEVEL;
}

/**
 * Calculates the Focus Coins cost to recruit the next villager given the current count:
 * Cost = round(40 * 1.35^currentVillagerCount)
 * Examples: 0 -> 40, 1 -> 54, 2 -> 73, 3 -> 98, 4 -> 133, ...
 */
export function getVillagerRecruitCost(currentVillagerCount: number): number {
  const count = Number.isFinite(currentVillagerCount) && currentVillagerCount >= 0
    ? Math.floor(currentVillagerCount)
    : 0;
  const rawCost = VILLAGER_BASE_RECRUIT_COST * Math.pow(VILLAGER_RECRUIT_COST_RATIO, count);
  return Math.round(rawCost);
}

export interface EvaluateRecruitmentInput {
  caveBuilding?: BuildingInstance;
  villagers?: readonly Villager[];
  playerCoins: number;
  role: unknown;
}

/**
 * Evaluates whether a villager can be recruited.
 * Checks role validity, cave existence, village capacity, and player coin balance.
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
      message: 'Invalid villager role requested.',
      params: { role: String(role) },
    };
  }

  if (!caveBuilding) {
    return {
      canRecruit: false,
      reason: 'CIV_NO_VILLAGE_CAVE',
      cost,
      capacity: 0,
      currentCount,
      message: 'You need a Meditation Cave to recruit villagers.',
    };
  }

  if (currentCount >= capacity) {
    return {
      canRecruit: false,
      reason: 'CIV_VILLAGER_CAPACITY_REACHED',
      cost,
      capacity,
      currentCount,
      message: `Village capacity reached (${currentCount}/${capacity}). Upgrade your Meditation Cave to house more villagers.`,
      params: { currentCount, capacity },
    };
  }

  if (!Number.isFinite(playerCoins) || playerCoins < cost) {
    const shortfall = Math.max(0, cost - (Number.isFinite(playerCoins) ? playerCoins : 0));
    return {
      canRecruit: false,
      reason: 'CIV_VILLAGER_INSUFFICIENT_COINS',
      cost,
      capacity,
      currentCount,
      shortfallCoins: shortfall,
      message: `Insufficient coins: recruiting costs ${cost} Coins (current balance: ${playerCoins}).`,
      params: { cost, balance: playerCoins, shortfall },
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
 * Factory creating a new Villager instance.
 */
export function createVillager(
  role: VillagerRole,
  nowMs = Date.now(),
  idGenerator?: () => string
): Villager {
  const id = idGenerator
    ? idGenerator()
    : `villager_${role}_${nowMs}_${Math.random().toString(36).slice(2, 7)}`;
  return {
    id,
    role,
    recruitedAt: nowMs,
  };
}

/**
 * Immutably appends a newly recruited villager to the list.
 */
export function applyRecruitment(
  villagers: readonly Villager[],
  newVillager: Villager
): readonly Villager[] {
  return [...villagers, newVillager];
}

/**
 * Deterministically computes grass cells near the Cave entrance for idle villagers to stand on.
 * Cave is 3x3 at (x, y) with entrance at (x+1, y+2).
 * Searches concentric rings around the entrance for unlocked, unoccupied cells.
 */
export function getVillagerIdleSpots(
  villagers: readonly Villager[],
  cave: BuildingInstance | undefined,
  gridMap: GridMap
): readonly VillagerIdleSpot[] {
  if (!cave || villagers.length === 0) {
    return [];
  }

  const entranceX = cave.position.x + 1;
  const entranceY = cave.position.y + 2;

  // Search candidates prioritized around the entrance (south, then sides, then south-further)
  const candidateOffsets: readonly [number, number][] = [
    // Ring 1: south, south-east, south-west, east, west
    [0, 1],   // (x+1, y+3) immediately in front of entrance
    [-1, 1],  // (x, y+3)
    [1, 1],   // (x+2, y+3)
    [-2, 0],  // (x-1, y+2) west of cave bottom
    [2, 0],   // (x+3, y+2) east of cave bottom
    // Ring 2: further south and sides
    [0, 2],   // (x+1, y+4)
    [-1, 2],  // (x, y+4)
    [1, 2],   // (x+2, y+4)
    [-2, 1],  // (x-1, y+3)
    [2, 1],   // (x+3, y+3)
    [-2, -1], // (x-1, y+1)
    [2, -1],  // (x+3, y+1)
    [-1, -3], // north of cave
    [0, -3],
    [1, -3],
    [-2, 2],
    [2, 2],
    [0, 3],
    [-1, 3],
    [1, 3],
  ];

  const assignedSpots: VillagerIdleSpot[] = [];
  const usedCoords = new Set<string>();

  for (let i = 0; i < villagers.length; i++) {
    const villager = villagers[i];
    let foundCoord: GridCoordinate | null = null;

    for (const [dx, dy] of candidateOffsets) {
      const cx = entranceX + dx;
      const cy = entranceY + dy;
      const key = `${cx},${cy}`;

      if (usedCoords.has(key)) {
        continue;
      }

      if (gridMap.isCellUnlocked(cx, cy) && gridMap.getOccupyingBuilding(cx, cy) === null) {
        foundCoord = { x: cx, y: cy };
        usedCoords.add(key);
        break;
      }
    }

    // Fallback: if ring candidates were blocked, pick fallback offset
    if (!foundCoord) {
      const fallbackX = entranceX + (i % 3) - 1;
      const fallbackY = entranceY + 1 + Math.floor(i / 3);
      foundCoord = { x: fallbackX, y: fallbackY };
    }

    assignedSpots.push({
      villagerId: villager.id,
      role: villager.role,
      coordinate: foundCoord,
    });
  }

  return assignedSpots;
}
