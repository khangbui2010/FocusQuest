/**
 * Pure Era Rules & Advance Evaluator for Focus Quest Civilization.
 * Milestone Villager V5 (Part C):
 * - Defines Era upgrade level caps, Stone Age -> Bronze Age advance checklist,
 *   and entry floor level rules as pure data & evaluators.
 * - DOES NOT execute Era transitions or mutate Coins/state; Stone Age stays active.
 * - Upgrade caps for IRON_AGE..INTERPLANETARY are PROVISIONAL tuning tiers until
 *   subsequent Era content milestones finalize them.
 */

import {
  BuildingDefinition,
  BuildingInstance,
  CIVILIZATION_ERAS,
  CivilizationEra,
  isEraUnlocked,
} from './buildingTypes.ts';
import { getBuildingDefinition } from './buildingCatalog.ts';

function isValidEraLocal(era: unknown): era is CivilizationEra {
  return typeof era === 'string' && CIVILIZATION_ERAS.includes(era as CivilizationEra);
}

export interface EraLevelRule {
  readonly era: CivilizationEra;
  readonly upgradeCap: number;
  readonly entryFloor: number;
  readonly provisional: boolean;
}

export const ERA_LEVEL_RULES: Readonly<Record<CivilizationEra, EraLevelRule>> = Object.freeze({
  STONE_AGE: Object.freeze({ era: 'STONE_AGE', upgradeCap: 5, entryFloor: 1, provisional: false }),
  BRONZE_AGE: Object.freeze({ era: 'BRONZE_AGE', upgradeCap: 10, entryFloor: 4, provisional: false }),
  // Provisional caps for unimplemented future eras:
  IRON_AGE: Object.freeze({ era: 'IRON_AGE', upgradeCap: 15, entryFloor: 1, provisional: true }),
  MEDIEVAL: Object.freeze({ era: 'MEDIEVAL', upgradeCap: 20, entryFloor: 1, provisional: true }),
  EARLY_MODERN: Object.freeze({ era: 'EARLY_MODERN', upgradeCap: 30, entryFloor: 1, provisional: true }),
  MODERN: Object.freeze({ era: 'MODERN', upgradeCap: 40, entryFloor: 1, provisional: true }),
  FUTURISTIC: Object.freeze({ era: 'FUTURISTIC', upgradeCap: 50, entryFloor: 1, provisional: true }),
  INTERPLANETARY: Object.freeze({ era: 'INTERPLANETARY', upgradeCap: 60, entryFloor: 1, provisional: true }),
});

export interface EraAdvanceBuildingRequirement {
  readonly definitionId: string;
  readonly minCount: number;
  readonly minLevel: number;
}

export interface EraAdvanceRequirements {
  readonly fromEra: CivilizationEra;
  readonly nextEra: CivilizationEra;
  readonly minPlayerLevel: number;
  readonly minTotalFocusMinutes: number;
  readonly feeCoins: number;
  readonly buildingRequirements: readonly EraAdvanceBuildingRequirement[];
}

export const STONE_TO_BRONZE_ADVANCE_REQUIREMENTS: EraAdvanceRequirements = Object.freeze({
  fromEra: 'STONE_AGE',
  nextEra: 'BRONZE_AGE',
  minPlayerLevel: 12,
  minTotalFocusMinutes: 1500,
  feeCoins: 3500,
  buildingRequirements: Object.freeze([
    Object.freeze({ definitionId: 'stone_age_campfire', minCount: 1, minLevel: 1 }),
    Object.freeze({ definitionId: 'stone_age_totem', minCount: 1, minLevel: 1 }),
    Object.freeze({ definitionId: 'stone_age_elder_hut', minCount: 1, minLevel: 1 }),
    Object.freeze({ definitionId: 'stone_age_study_cave', minCount: 1, minLevel: 4 }),
    Object.freeze({ definitionId: 'stone_age_foraging_post', minCount: 4, minLevel: 4 }),
    Object.freeze({ definitionId: 'stone_age_food_cache', minCount: 4, minLevel: 4 }),
  ]),
});

const ERA_ADVANCE_REQUIREMENTS_MAP: Readonly<Partial<Record<CivilizationEra, EraAdvanceRequirements>>> = {
  STONE_AGE: STONE_TO_BRONZE_ADVANCE_REQUIREMENTS,
};

export type EraAdvanceCheckId =
  | `building:${string}`
  | 'player_level'
  | 'total_focus_minutes'
  | 'fee_coins';

export interface EraAdvanceCheckItem {
  readonly id: EraAdvanceCheckId;
  readonly current: number;
  readonly required: number;
  readonly met: boolean;
}

export interface EvaluateEraAdvanceInput {
  readonly era: CivilizationEra | unknown;
  readonly buildings: readonly BuildingInstance[] | null | undefined;
  readonly playerLevel: number;
  readonly totalFocusMinutes: number;
  readonly coins: number;
}

export interface EraAdvanceEvaluation {
  readonly nextEra: CivilizationEra | null;
  readonly eligible: boolean;
  readonly feeCoins: number;
  readonly checks: readonly EraAdvanceCheckItem[];
}

/**
 * Returns the maximum building level permitted during `era`.
 * Falls back safely to STONE_AGE cap (5) on invalid/unknown input.
 */
export function getEraUpgradeCap(era: CivilizationEra | unknown): number {
  if (isValidEraLocal(era)) {
    return ERA_LEVEL_RULES[era].upgradeCap;
  }
  return ERA_LEVEL_RULES.STONE_AGE.upgradeCap;
}

/**
 * Returns the effective max upgrade level of `definition` under `era`:
 * min(definition.maxLevel, getEraUpgradeCap(era)), clamped at >= 1.
 */
export function getEffectiveMaxLevel(
  definition: Pick<BuildingDefinition, 'maxLevel'> | undefined,
  era: CivilizationEra | unknown
): number {
  const cap = getEraUpgradeCap(era);
  if (
    !definition ||
    typeof definition.maxLevel !== 'number' ||
    !Number.isFinite(definition.maxLevel) ||
    definition.maxLevel < 1
  ) {
    return Math.max(1, cap);
  }
  return Math.max(1, Math.min(Math.floor(definition.maxLevel), cap));
}

/**
 * Retrieves the advance requirements out of `era`, or null when no next Era is defined yet.
 */
export function getEraAdvanceRequirements(
  era: CivilizationEra | unknown
): EraAdvanceRequirements | null {
  if (!isValidEraLocal(era)) {
    return null;
  }
  return ERA_ADVANCE_REQUIREMENTS_MAP[era] ?? null;
}

/**
 * Computes the entry level of a carried-over building upon entering `era`:
 * max(carriedLevel, era.entryFloor), clamped to [1, getEraUpgradeCap(era)].
 */
export function getEntryLevel(era: CivilizationEra | unknown, carriedLevel: number): number {
  const validEra: CivilizationEra = isValidEraLocal(era) ? era : 'STONE_AGE';
  const rule = ERA_LEVEL_RULES[validEra];
  const safeCarried =
    typeof carriedLevel === 'number' && Number.isFinite(carriedLevel)
      ? Math.floor(carriedLevel)
      : 1;
  const floored = Math.max(safeCarried, rule.entryFloor);
  return Math.max(1, Math.min(floored, rule.upgradeCap));
}

function toNonNegativeFinite(value: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return 0;
  }
  return value;
}

function countBuildingsMeetingFloor(
  buildings: readonly BuildingInstance[],
  definitionId: string,
  minLevel: number,
  era: CivilizationEra
): number {
  const def = getBuildingDefinition(definitionId);
  if (!def || !isEraUnlocked(era, def.era)) {
    return 0;
  }
  let count = 0;
  for (const b of buildings) {
    if (
      b &&
      typeof b === 'object' &&
      b.definitionId === definitionId &&
      typeof b.level === 'number' &&
      Number.isInteger(b.level) &&
      b.level >= minLevel
    ) {
      count += 1;
    }
  }
  return count;
}

/**
 * Pure evaluator for Era advance readiness.
 * Never mutates inputs, never deducts Coins, and handles malformed/null values safely.
 */
export function evaluateEraAdvance(input: EvaluateEraAdvanceInput | null | undefined): EraAdvanceEvaluation {
  if (!input || typeof input !== 'object') {
    return {
      nextEra: null,
      eligible: false,
      feeCoins: 0,
      checks: [],
    };
  }

  const req = getEraAdvanceRequirements(input.era);
  if (!req) {
    return {
      nextEra: null,
      eligible: false,
      feeCoins: 0,
      checks: [],
    };
  }

  const validEra = input.era as CivilizationEra;
  const safeBuildings = Array.isArray(input.buildings) ? input.buildings : [];
  const safeLevel = Math.floor(toNonNegativeFinite(input.playerLevel));
  const safeMinutes = toNonNegativeFinite(input.totalFocusMinutes);
  const safeCoins = toNonNegativeFinite(input.coins);

  const checks: EraAdvanceCheckItem[] = [];

  for (const bReq of req.buildingRequirements) {
    const matchingCount = countBuildingsMeetingFloor(
      safeBuildings,
      bReq.definitionId,
      Math.max(1, bReq.minLevel),
      validEra
    );

    checks.push({
      id: `building:${bReq.definitionId}`,
      current: matchingCount,
      required: bReq.minCount,
      met: matchingCount >= bReq.minCount,
    });
  }

  checks.push({
    id: 'player_level',
    current: safeLevel,
    required: req.minPlayerLevel,
    met: safeLevel >= req.minPlayerLevel,
  });

  checks.push({
    id: 'total_focus_minutes',
    current: safeMinutes,
    required: req.minTotalFocusMinutes,
    met: safeMinutes >= req.minTotalFocusMinutes,
  });

  checks.push({
    id: 'fee_coins',
    current: safeCoins,
    required: req.feeCoins,
    met: safeCoins >= req.feeCoins,
  });

  const eligible = checks.every((c) => c.met);

  return {
    nextEra: req.nextEra,
    eligible,
    feeCoins: req.feeCoins,
    checks,
  };
}
