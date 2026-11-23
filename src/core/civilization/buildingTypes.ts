/**
 * Building domain types for Focus Quest Civilization Engine.
 * Milestone 5B.2: Building Catalog & Storage Schema v2 Migration
 *
 * Pure domain definitions: zero UI, zero DOM, zero external runtime dependencies.
 */

import { GridCoordinate, BuildingFootprint } from './types.ts';

/** Historical / technological progression era */
export type CivilizationEra =
  | 'STONE_AGE'
  | 'BRONZE_AGE'
  | 'IRON_AGE'
  | 'MEDIEVAL'
  | 'EARLY_MODERN'
  | 'MODERN'
  | 'FUTURISTIC'
  | 'INTERPLANETARY';

/** Ordered list of all 8 historical & technological progression eras */
export const CIVILIZATION_ERAS: readonly CivilizationEra[] = [
  'STONE_AGE',
  'BRONZE_AGE',
  'IRON_AGE',
  'MEDIEVAL',
  'EARLY_MODERN',
  'MODERN',
  'FUTURISTIC',
  'INTERPLANETARY',
] as const;

/** Return 0-indexed ranking of an era */
export function getEraIndex(era: CivilizationEra): number {
  return CIVILIZATION_ERAS.indexOf(era);
}

/** Check if current era meets or exceeds required era */
export function isEraUnlocked(currentEra: CivilizationEra, requiredEra?: CivilizationEra): boolean {
  if (!requiredEra) return true;
  const currentIdx = getEraIndex(currentEra);
  const requiredIdx = getEraIndex(requiredEra);
  return currentIdx !== -1 && requiredIdx !== -1 && currentIdx >= requiredIdx;
}

/** High-level functional category of a building */
export type BuildingCategory = 'DECORATIVE' | 'FOCUS_SUPPORT' | 'ECONOMY_EFFECT';

/**
 * Discriminated union of possible building effects.
 * Additive, extensible, type-safe:
 * - COIN_BONUS: Additive coin multiplier bonus applied exclusively to Focus session rewards.
 *               (Zero idle production, zero passive generation).
 * - FOCUS_FEATURE_UNLOCK: Unlocks a focus tool or milestone preset.
 * - FOCUS_STAT_UNLOCK: Unlocks an advanced focus statistic or metric view.
 */
export type BuildingEffect =
  | {
      readonly type: 'COIN_BONUS';
      /** Additive fraction per level, e.g. 0.02 = +2% additive bonus per level */
      readonly rate: number;
    }
  | {
      readonly type: 'FOCUS_FEATURE_UNLOCK';
      readonly featureId: string;
    }
  | {
      readonly type: 'FOCUS_STAT_UNLOCK';
      readonly statId: string;
    };

/** Criteria required before a player can construct or unlock this building */
export interface BuildingUnlockRequirements {
  /** Minimum player progression level (from PlayerEconomy.level) */
  readonly minPlayerLevel: number;
  /** Minimum lifetime focus minutes worked */
  readonly minTotalFocusMinutes: number;
  /** Minimum era reached */
  readonly minEra?: CivilizationEra;
}

/**
 * Immutable master template definition for a building type.
 */
export interface BuildingDefinition {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly era: CivilizationEra;
  readonly category: BuildingCategory;
  readonly footprint: BuildingFootprint;
  /** Base construction cost in Coins */
  readonly baseCost: number;
  /** Cost multiplier applied per upgrade level */
  readonly upgradeCostMultiplier: number;
  /** Maximum level this building can reach */
  readonly maxLevel: number;
  /** Requirements needed to unlock construction */
  readonly unlockRequirements: BuildingUnlockRequirements;
  /** Functional effects provided by this building */
  readonly effects: readonly BuildingEffect[];
  /** UI icon identifier */
  readonly iconIdentifier: string;
}

/**
 * Concrete instance of a building constructed on the player's map.
 * Does not clone definition fields; references definitionId.
 */
export interface BuildingInstance {
  readonly id: string;
  readonly definitionId: string;
  readonly position: GridCoordinate;
  readonly level: number;
  readonly placedAt: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
}
