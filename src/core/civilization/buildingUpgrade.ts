/**
 * Pure Civilization Building Upgrade, Demolish Refund & Placement Limit Engine.
 * Milestone 5C-1: Building Upgrades (UPGRADE_BUILDING)
 *
 * Rules:
 * - Deterministic pure functions (zero Date.now(), zero Math.random(), zero I/O).
 * - Only ECONOMY_EFFECT buildings can be upgraded (COIN_BONUS scales as rate * level).
 * - DECORATIVE and FOCUS_SUPPORT keep their non-upgradable behavior.
 * - Required Player Level for L -> L+1: definition.unlockRequirements.minPlayerLevel + L * BUILDING_UPGRADE_PLAYER_LEVEL_STEP.
 * - Demolish refunds BUILDING_DEMOLISH_REFUND_RATE (50%) of total Coins spent (baseCost + upgrades).
 * Placed ECONOMY_EFFECT buildings are capped per building type (e.g. Foraging Post, Primitive Granary) at MAX_ECONOMY_EFFECT_BUILDINGS.
 */

import {
  BUILDING_DEMOLISH_REFUND_RATE,
  BUILDING_UPGRADE_PLAYER_LEVEL_STEP,
  MAX_ECONOMY_EFFECT_BUILDINGS,
  MAX_VILLAGE_CAVES,
} from './constants.ts';
import {
  BuildingCategory,
  BuildingDefinition,
  BuildingInstance,
  CIVILIZATION_ERAS,
  CivilizationEra,
} from './buildingTypes.ts';
import { calculateUpgradeCost, getBuildingDefinition } from './buildingCatalog.ts';
import { getEffectiveMaxLevel } from './eraRules.ts';
import { applyCostDiscount } from './villagerBuffs.ts';
import {
  ConstructionJob,
  getEffectiveTargetLevel,
  getUpgradeJobSpec,
  isBuildingUnderConstruction,
} from './jobs.ts';

export type UpgradeFailureReason =
  | 'BUILDING_NOT_FOUND'
  | 'BUILDING_UNDER_CONSTRUCTION'
  | 'NON_UPGRADEABLE_CATEGORY'
  | 'BUILDING_MAX_LEVEL'
  | 'ERA_LOCKED'
  | 'LEVEL_MISMATCH'
  | 'PLAYER_LEVEL_REQUIRED'
  | 'NOT_ENOUGH_VILLAGERS'
  | 'INSUFFICIENT_COINS'
  | 'INVALID_STATE';

export interface BuildingUpgradeEvaluation {
  readonly canUpgrade: boolean;
  readonly reason: UpgradeFailureReason | null;
  readonly currentLevel: number;
  readonly nextLevel: number | null;
  readonly maxLevel: number;
  readonly isCategoryUpgradeable: boolean;
  readonly baseCost: number;
  readonly discountRate: number;
  readonly cost: number;
  readonly requiredPlayerLevel: number;
  readonly shortfallCoins: number;
  readonly currentCoinBonusRate: number;
  readonly nextCoinBonusRate: number;
}

export interface EconomyPlacementLimitCheck {
  readonly allowed: boolean;
  readonly limit: number | null;
  readonly currentCount: number;
}

/**
 * Only ECONOMY_EFFECT categories scale generically by category.
 * Individual building definitions (like stone_age_study_cave) are checked via
 * `isBuildingDefinitionUpgradeable`.
 */
export function isBuildingCategoryUpgradeable(category: BuildingCategory): boolean {
  return category === 'ECONOMY_EFFECT';
}

/**
 * Determines whether a specific building definition can be upgraded.
 * Includes ECONOMY_EFFECT buildings plus the Meditation Cave (`stone_age_study_cave`)
 * which increases villager capacity per level.
 */
export function isBuildingDefinitionUpgradeable(
  definition: Pick<BuildingDefinition, 'id' | 'category'>
): boolean {
  return (
    isBuildingCategoryUpgradeable(definition.category) ||
    definition.id === 'stone_age_study_cave'
  );
}

/**
 * Returns the maximum number of active instances allowed per building type,
 * or null when unlimited.
 * - `stone_age_study_cave`: capped at MAX_VILLAGE_CAVES (1)
 * - `ECONOMY_EFFECT`: capped independently at MAX_ECONOMY_EFFECT_BUILDINGS (4)
 */
export function getBuildingPlacementLimit(
  definition: Pick<BuildingDefinition, 'id' | 'category'>
): number | null {
  if (definition.id === 'stone_age_study_cave') {
    return MAX_VILLAGE_CAVES;
  }
  return definition.category === 'ECONOMY_EFFECT' ? MAX_ECONOMY_EFFECT_BUILDINGS : null;
}

/**
 * Counts active building instances of a specific building definition ID on the map.
 */
export function getPlacedBuildingCountByDefinition(
  definitionId: string,
  buildings: readonly BuildingInstance[]
): number {
  let count = 0;
  for (const b of buildings) {
    if (b.definitionId === definitionId) {
      count += 1;
    }
  }
  return count;
}

/**
 * Counts total active ECONOMY_EFFECT building instances on the map.
 */
export function getPlacedEconomyBuildingsCount(
  buildings: readonly BuildingInstance[],
  resolveDef: (definitionId: string) => BuildingDefinition | undefined = getBuildingDefinition
): number {
  let count = 0;
  for (const b of buildings) {
    const def = resolveDef(b.definitionId);
    if (def && def.category === 'ECONOMY_EFFECT') {
      count += 1;
    }
  }
  return count;
}

/**
 * Checks whether another instance of `definition` may be placed given `existingBuildings`,
 * counting per building type (`definition.id`) independently.
 */
export function canPlaceAnotherBuildingOfCategory(
  definition: Pick<BuildingDefinition, 'id' | 'category'>,
  existingBuildings: readonly BuildingInstance[]
): EconomyPlacementLimitCheck {
  const limit = getBuildingPlacementLimit(definition);
  if (limit === null) {
    return { allowed: true, limit: null, currentCount: 0 };
  }
  const currentCount = getPlacedBuildingCountByDefinition(definition.id, existingBuildings);
  return {
    allowed: currentCount < limit,
    limit,
    currentCount,
  };
}

/**
 * Required Player Level to upgrade a building from `currentLevel` to `currentLevel + 1`.
 */
export function getBuildingUpgradeRequiredPlayerLevel(
  definition: Pick<BuildingDefinition, 'unlockRequirements'>,
  currentLevel: number
): number {
  if (!Number.isInteger(currentLevel) || currentLevel < 1) {
    return definition.unlockRequirements.minPlayerLevel;
  }
  return (
    definition.unlockRequirements.minPlayerLevel +
    currentLevel * BUILDING_UPGRADE_PLAYER_LEVEL_STEP
  );
}

/**
 * Computes additive CoinBonus rate (e.g. 0.06 = +6%) provided by `definition` at `level`.
 */
export function getBuildingCoinBonusRateAtLevel(
  definition: Pick<BuildingDefinition, 'effects'>,
  level: number
): number {
  if (!Number.isInteger(level) || level < 1) {
    return 0;
  }
  let total = 0;
  for (const effect of definition.effects) {
    if (effect.type === 'COIN_BONUS' && Number.isFinite(effect.rate) && effect.rate > 0) {
      total += effect.rate * level;
    }
  }
  return total;
}

/**
 * Computes total Focus Coins invested into a building at `level` (baseCost + upgrades 1..level-1).
 */
export function calculateTotalBuildingCoinsSpent(
  definition: BuildingDefinition,
  level: number
): number {
  if (!Number.isInteger(level) || level < 1) {
    return 0;
  }
  const clampedLevel = Math.min(level, getEffectiveMaxLevel(definition, definition.era));
  let total = definition.baseCost;
  for (let lvl = 1; lvl < clampedLevel; lvl += 1) {
    total += calculateUpgradeCost(definition, lvl);
  }
  return total;
}

export interface DemolishRefundOptions {
  readonly placeJob?: Pick<ConstructionJob, 'paidCoins'>;
  readonly upgradeJobs?: readonly Pick<ConstructionJob, 'paidCoins'>[];
}

/**
 * Computes exact Coins refunded (50%) when demolishing a building at `level`
 * or cancelling/demolishing an under-construction / queued-upgrade building.
 */
export function calculateBuildingDemolishRefund(
  definition: BuildingDefinition | undefined,
  level: number,
  options?: DemolishRefundOptions
): number {
  if (!definition) {
    return 0;
  }
  if (options?.placeJob) {
    const placePaid =
      typeof options.placeJob.paidCoins === 'number' &&
      Number.isFinite(options.placeJob.paidCoins) &&
      options.placeJob.paidCoins > 0
        ? options.placeJob.paidCoins
        : 0;
    return placePaid * BUILDING_DEMOLISH_REFUND_RATE;
  }
  const spent = calculateTotalBuildingCoinsSpent(definition, level);
  const queuedUpgradeSpent = Array.isArray(options?.upgradeJobs)
    ? options.upgradeJobs.reduce(
        (sum, job) =>
          sum +
          (typeof job.paidCoins === 'number' && Number.isFinite(job.paidCoins) && job.paidCoins > 0
            ? job.paidCoins
            : 0),
        0
      )
    : 0;
  return (spent + queuedUpgradeSpent) * BUILDING_DEMOLISH_REFUND_RATE;
}

function isBuildingEraUnlockedForUpgrade(
  currentEra: CivilizationEra,
  buildingEra: CivilizationEra
): boolean {
  const currentIdx = CIVILIZATION_ERAS.indexOf(currentEra);
  const buildingIdx = CIVILIZATION_ERAS.indexOf(buildingEra);
  if (currentIdx === -1 || buildingIdx === -1) {
    return false;
  }
  return currentIdx >= buildingIdx;
}

export interface EvaluateBuildingUpgradeInput {
  readonly instance: BuildingInstance | undefined;
  readonly definition: BuildingDefinition | undefined;
  readonly currentEra: CivilizationEra;
  readonly playerLevel: number;
  readonly playerCoins: number;
  readonly expectedLevel?: number;
  readonly upgradeDiscountRate?: number;
  readonly jobs?: readonly ConstructionJob[];
  readonly totalVillagers?: number;
}

/**
 * Pure evaluator checking all invariants and gates for upgrading a placed building.
 */
export function evaluateBuildingUpgrade(
  input: EvaluateBuildingUpgradeInput
): BuildingUpgradeEvaluation {
  const {
    instance,
    definition,
    currentEra,
    playerLevel,
    playerCoins,
    expectedLevel,
    upgradeDiscountRate = 0,
    jobs,
    totalVillagers,
  } = input;

  const safeDiscountRate =
    typeof upgradeDiscountRate === 'number' && Number.isFinite(upgradeDiscountRate)
      ? Math.min(1, Math.max(0, upgradeDiscountRate))
      : 0;

  if (!instance || !definition) {
    return {
      canUpgrade: false,
      reason: 'BUILDING_NOT_FOUND',
      currentLevel: instance?.level ?? 0,
      nextLevel: null,
      maxLevel: definition ? getEffectiveMaxLevel(definition, currentEra) : 0,
      isCategoryUpgradeable: false,
      baseCost: 0,
      discountRate: safeDiscountRate,
      cost: 0,
      requiredPlayerLevel: 0,
      shortfallCoins: 0,
      currentCoinBonusRate: 0,
      nextCoinBonusRate: 0,
    };
  }

  const effectiveMaxLevel = getEffectiveMaxLevel(definition, currentEra);
  const isCategoryUpgradeable = isBuildingDefinitionUpgradeable(definition);
  const fromLevel = instance && Number.isInteger(instance.level)
    ? getEffectiveTargetLevel(instance, jobs)
    : instance?.level ?? 0;
  const currentCoinBonusRate = getBuildingCoinBonusRateAtLevel(definition, fromLevel);

  if (!Number.isInteger(instance.level) || instance.level < 1) {
    return {
      canUpgrade: false,
      reason: 'INVALID_STATE',
      currentLevel: instance.level,
      nextLevel: null,
      maxLevel: effectiveMaxLevel,
      isCategoryUpgradeable,
      baseCost: 0,
      discountRate: safeDiscountRate,
      cost: 0,
      requiredPlayerLevel: definition.unlockRequirements.minPlayerLevel,
      shortfallCoins: 0,
      currentCoinBonusRate: 0,
      nextCoinBonusRate: 0,
    };
  }

  if (isBuildingUnderConstruction(instance.id, jobs)) {
    return {
      canUpgrade: false,
      reason: 'BUILDING_UNDER_CONSTRUCTION',
      currentLevel: fromLevel,
      nextLevel: null,
      maxLevel: effectiveMaxLevel,
      isCategoryUpgradeable,
      baseCost: 0,
      discountRate: safeDiscountRate,
      cost: 0,
      requiredPlayerLevel: definition.unlockRequirements.minPlayerLevel,
      shortfallCoins: 0,
      currentCoinBonusRate,
      nextCoinBonusRate: currentCoinBonusRate,
    };
  }

  if (expectedLevel !== undefined && fromLevel !== expectedLevel) {
    return {
      canUpgrade: false,
      reason: 'LEVEL_MISMATCH',
      currentLevel: fromLevel,
      nextLevel: null,
      maxLevel: effectiveMaxLevel,
      isCategoryUpgradeable,
      baseCost: 0,
      discountRate: safeDiscountRate,
      cost: 0,
      requiredPlayerLevel: getBuildingUpgradeRequiredPlayerLevel(definition, fromLevel),
      shortfallCoins: 0,
      currentCoinBonusRate,
      nextCoinBonusRate: currentCoinBonusRate,
    };
  }

  if (!isCategoryUpgradeable) {
    return {
      canUpgrade: false,
      reason: 'NON_UPGRADEABLE_CATEGORY',
      currentLevel: fromLevel,
      nextLevel: null,
      maxLevel: effectiveMaxLevel,
      isCategoryUpgradeable: false,
      baseCost: 0,
      discountRate: safeDiscountRate,
      cost: 0,
      requiredPlayerLevel: definition.unlockRequirements.minPlayerLevel,
      shortfallCoins: 0,
      currentCoinBonusRate,
      nextCoinBonusRate: currentCoinBonusRate,
    };
  }

  if (fromLevel >= effectiveMaxLevel) {
    return {
      canUpgrade: false,
      reason: 'BUILDING_MAX_LEVEL',
      currentLevel: fromLevel,
      nextLevel: null,
      maxLevel: effectiveMaxLevel,
      isCategoryUpgradeable: true,
      baseCost: 0,
      discountRate: safeDiscountRate,
      cost: 0,
      requiredPlayerLevel: definition.unlockRequirements.minPlayerLevel,
      shortfallCoins: 0,
      currentCoinBonusRate,
      nextCoinBonusRate: currentCoinBonusRate,
    };
  }

  const nextLevel = fromLevel + 1;
  const baseCost = calculateUpgradeCost(definition, fromLevel);
  const cost = baseCost > 0 ? applyCostDiscount(baseCost, safeDiscountRate) : 0;
  const requiredPlayerLevel = getBuildingUpgradeRequiredPlayerLevel(definition, fromLevel);
  const nextCoinBonusRate = getBuildingCoinBonusRateAtLevel(definition, nextLevel);
  const shortfallCoins = playerCoins < cost ? Math.max(0, cost - playerCoins) : 0;

  if (!isBuildingEraUnlockedForUpgrade(currentEra, definition.era)) {
    return {
      canUpgrade: false,
      reason: 'ERA_LOCKED',
      currentLevel: fromLevel,
      nextLevel,
      maxLevel: effectiveMaxLevel,
      isCategoryUpgradeable: true,
      baseCost,
      discountRate: safeDiscountRate,
      cost,
      requiredPlayerLevel,
      shortfallCoins,
      currentCoinBonusRate,
      nextCoinBonusRate,
    };
  }

  if (!Number.isFinite(playerLevel) || playerLevel < requiredPlayerLevel) {
    return {
      canUpgrade: false,
      reason: 'PLAYER_LEVEL_REQUIRED',
      currentLevel: fromLevel,
      nextLevel,
      maxLevel: effectiveMaxLevel,
      isCategoryUpgradeable: true,
      baseCost,
      discountRate: safeDiscountRate,
      cost,
      requiredPlayerLevel,
      shortfallCoins,
      currentCoinBonusRate,
      nextCoinBonusRate,
    };
  }

  if (
    typeof totalVillagers === 'number' &&
    Number.isFinite(totalVillagers) &&
    totalVillagers < getUpgradeJobSpec(fromLevel).crew
  ) {
    return {
      canUpgrade: false,
      reason: 'NOT_ENOUGH_VILLAGERS',
      currentLevel: fromLevel,
      nextLevel,
      maxLevel: effectiveMaxLevel,
      isCategoryUpgradeable: true,
      baseCost,
      discountRate: safeDiscountRate,
      cost,
      requiredPlayerLevel,
      shortfallCoins,
      currentCoinBonusRate,
      nextCoinBonusRate,
    };
  }

  if (!Number.isFinite(playerCoins) || playerCoins < cost) {
    return {
      canUpgrade: false,
      reason: 'INSUFFICIENT_COINS',
      currentLevel: fromLevel,
      nextLevel,
      maxLevel: effectiveMaxLevel,
      isCategoryUpgradeable: true,
      baseCost,
      discountRate: safeDiscountRate,
      cost,
      requiredPlayerLevel,
      shortfallCoins,
      currentCoinBonusRate,
      nextCoinBonusRate,
    };
  }

  return {
    canUpgrade: true,
    reason: null,
    currentLevel: fromLevel,
    nextLevel,
    maxLevel: effectiveMaxLevel,
    isCategoryUpgradeable: true,
    baseCost,
    discountRate: safeDiscountRate,
    cost,
    requiredPlayerLevel,
    shortfallCoins: 0,
    currentCoinBonusRate,
    nextCoinBonusRate,
  };
}

/**
 * Pure applier: returns an immutable upgraded clone of `instance` at `level + 1`.
 */
export function applyBuildingUpgrade(instance: BuildingInstance): BuildingInstance {
  return {
    ...instance,
    level: instance.level + 1,
  };
}
