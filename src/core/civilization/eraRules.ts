/**
 * Pure Era Rules & Advance Evaluator for Focus Quest Civilization.
 * Milestone Villager V5.2:
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
import { Villager } from './villager.ts';
import { getVillagerRoleCounts } from './villagerBuffs.ts';
import {
  VILLAGER_ROLES,
  VillagerRole,
} from '../../ui/components/civilization/spriteRegistry.ts';
import { ConstructionJob, isBuildingUnderConstruction } from './jobs.ts';
import type { CivilizationState } from './civilizationState.ts';
import { AppError } from '../../types/errors.ts';

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
  BRONZE_AGE: Object.freeze({ era: 'BRONZE_AGE', upgradeCap: 10, entryFloor: 5, provisional: false }),
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

export interface EraAdvanceVillagerRequirement {
  readonly role: VillagerRole;
  readonly minCount: number;
}

export interface EraAdvanceRequirements {
  readonly fromEra: CivilizationEra;
  readonly nextEra: CivilizationEra;
  readonly minPlayerLevel: number;
  readonly minTotalFocusMinutes: number;
  readonly minLandExpansions: number;
  readonly feeCoins: number;
  readonly buildingRequirements: readonly EraAdvanceBuildingRequirement[];
  readonly villagerRequirements: readonly EraAdvanceVillagerRequirement[];
}

export const STONE_TO_BRONZE_ADVANCE_REQUIREMENTS: EraAdvanceRequirements = Object.freeze({
  fromEra: 'STONE_AGE',
  nextEra: 'BRONZE_AGE',
  minPlayerLevel: 9,
  minTotalFocusMinutes: 500,
  minLandExpansions: 3,
  feeCoins: 500,
  buildingRequirements: Object.freeze([
    Object.freeze({ definitionId: 'stone_age_campfire', minCount: 1, minLevel: 1 }),
    Object.freeze({ definitionId: 'stone_age_totem', minCount: 1, minLevel: 1 }),
    Object.freeze({ definitionId: 'stone_age_elder_hut', minCount: 1, minLevel: 1 }),
    Object.freeze({ definitionId: 'stone_age_study_cave', minCount: 1, minLevel: 5 }),
    Object.freeze({ definitionId: 'stone_age_foraging_post', minCount: 4, minLevel: 5 }),
    Object.freeze({ definitionId: 'stone_age_food_cache', minCount: 4, minLevel: 5 }),
  ]),
  villagerRequirements: Object.freeze([
    Object.freeze({ role: 'crafter', minCount: 1 }),
    Object.freeze({ role: 'elder', minCount: 1 }),
    Object.freeze({ role: 'woodworker', minCount: 1 }),
  ]),
});

const ERA_ADVANCE_REQUIREMENTS_MAP: Readonly<Partial<Record<CivilizationEra, EraAdvanceRequirements>>> = {
  STONE_AGE: STONE_TO_BRONZE_ADVANCE_REQUIREMENTS,
};

export type EraAdvanceCheckId =
  | `building:${string}`
  | `villager:${VillagerRole}`
  | 'land_expansions'
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
  readonly villagers?: readonly Villager[] | null;
  readonly jobs?: readonly ConstructionJob[] | null;
  readonly founderRole?: VillagerRole | null;
  readonly landExpansions?: number;
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
  era: CivilizationEra,
  jobs?: readonly ConstructionJob[] | null
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
      !isBuildingUnderConstruction(b.id, jobs) &&
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
  const safeJobs = Array.isArray(input.jobs) ? input.jobs : null;
  const roleCounts = getVillagerRoleCounts(input.villagers, input.founderRole);
  const safeLandExpansions = Math.floor(toNonNegativeFinite(input.landExpansions ?? 0));
  const safeLevel = Math.floor(toNonNegativeFinite(input.playerLevel));
  const safeMinutes = toNonNegativeFinite(input.totalFocusMinutes);
  const safeCoins = toNonNegativeFinite(input.coins);

  const checks: EraAdvanceCheckItem[] = [];

  for (const bReq of req.buildingRequirements) {
    const matchingCount = countBuildingsMeetingFloor(
      safeBuildings,
      bReq.definitionId,
      Math.max(1, bReq.minLevel),
      validEra,
      safeJobs
    );

    checks.push({
      id: `building:${bReq.definitionId}`,
      current: matchingCount,
      required: bReq.minCount,
      met: matchingCount >= bReq.minCount,
    });
  }

  for (const vReq of req.villagerRequirements) {
    const currentCount = VILLAGER_ROLES.includes(vReq.role) ? roleCounts[vReq.role] : 0;
    checks.push({
      id: `villager:${vReq.role}`,
      current: currentCount,
      required: vReq.minCount,
      met: currentCount >= vReq.minCount,
    });
  }

  checks.push({
    id: 'land_expansions',
    current: safeLandExpansions,
    required: req.minLandExpansions,
    met: safeLandExpansions >= req.minLandExpansions,
  });

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

/**
 * Returns the immediate sequential next Era after `era`, or null if invalid or final Era.
 */
export function getNextEra(era: CivilizationEra | unknown): CivilizationEra | null {
  if (!isValidEraLocal(era)) {
    return null;
  }
  const idx = CIVILIZATION_ERAS.indexOf(era);
  if (idx < 0 || idx + 1 >= CIVILIZATION_ERAS.length) {
    return null;
  }
  return CIVILIZATION_ERAS[idx + 1];
}

function getEraIndex(era: CivilizationEra | unknown): number {
  if (!isValidEraLocal(era)) {
    return -1;
  }
  return CIVILIZATION_ERAS.indexOf(era);
}

/**
 * Pure, deterministic Era transition helper for CivilizationState.
 * Validates sequential fromEra -> targetEra transition and current state.era,
 * returning a shallow-copied CivilizationState with ONLY `era` updated.
 * Never mutates inputs, never touches buildings/grid/villagers/jobs/founderRole/lastUpdated,
 * and never calls Date.now() or Math.random().
 */
export function applyEraAdvance(
  state: CivilizationState,
  fromEra: CivilizationEra,
  targetEra: CivilizationEra
): CivilizationState {
  if (!isValidEraLocal(fromEra)) {
    throw new AppError('ERA_FROM_MISMATCH', `Invalid source Era ("${String(fromEra)}").`, {
      fromEra: String(fromEra),
      currentEra: state && typeof state === 'object' ? String(state.era) : '',
    });
  }

  const expectedNext = getNextEra(fromEra);
  if (!isValidEraLocal(targetEra) || !expectedNext || targetEra !== expectedNext) {
    throw new AppError('ERA_TARGET_INVALID', `Invalid target Era ("${String(targetEra)}").`, {
      targetEra: String(targetEra),
    });
  }

  if (!state || typeof state !== 'object' || !isValidEraLocal(state.era)) {
    throw new AppError('ERA_FROM_MISMATCH', 'Invalid current civilization Era.', {
      fromEra,
      currentEra: state && typeof state === 'object' ? String((state as { era?: unknown }).era) : '',
    });
  }

  if (state.era === targetEra || getEraIndex(state.era) >= getEraIndex(targetEra)) {
    throw new AppError(
      'ERA_ALREADY_ADVANCED',
      `Settlement has already advanced to ${state.era}.`,
      { currentEra: state.era }
    );
  }

  if (state.era !== fromEra) {
    throw new AppError(
      'ERA_FROM_MISMATCH',
      `Source Era mismatch (expected ${fromEra}, current: ${state.era}).`,
      { fromEra, currentEra: state.era }
    );
  }

  return {
    ...state,
    era: targetEra,
  };
}

