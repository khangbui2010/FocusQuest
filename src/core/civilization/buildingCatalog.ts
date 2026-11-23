/**
 * Building Catalog for Focus Quest Civilization Engine.
 * Milestone 5B.2: Building Catalog & Storage Schema v2 Migration
 *
 * Provides immutable, data-driven building definitions.
 * Initial Era: STONE_AGE (with representative DECORATIVE, FOCUS_SUPPORT, and ECONOMY_EFFECT buildings).
 * All economic figures are provisional/tunable and clearly centralized here.
 */

import {
  BuildingDefinition,
  BuildingCategory,
  CivilizationEra,
} from './buildingTypes.ts';

/**
 * Master catalog list of Stone Age building definitions.
 * Note: Costs, multipliers and bonus rates are provisional and centralized here for tuning.
 */
export const STONE_AGE_BUILDING_DEFINITIONS: readonly BuildingDefinition[] = Object.freeze([
  // --- Category: DECORATIVE ---
  {
    id: 'stone_age_campfire',
    name: 'Campfire',
    description: 'A modest communal fire providing warmth, light, and morale to early settlers.',
    era: 'STONE_AGE',
    category: 'DECORATIVE',
    footprint: { width: 1, height: 1 },
    baseCost: 8,
    upgradeCostMultiplier: 1.5,
    maxLevel: 3,
    unlockRequirements: {
      minPlayerLevel: 1,
      minTotalFocusMinutes: 0,
      minEra: 'STONE_AGE',
    },
    effects: [],
    iconIdentifier: 'flame',
  },
  {
    id: 'stone_age_totem',
    name: 'Ancient Totem',
    description: 'A hand-carved stone monument commemorating early discipline and perseverance.',
    era: 'STONE_AGE',
    category: 'DECORATIVE',
    footprint: { width: 1, height: 1 },
    baseCost: 15,
    upgradeCostMultiplier: 1.6,
    maxLevel: 3,
    unlockRequirements: {
      minPlayerLevel: 1,
      minTotalFocusMinutes: 25,
      minEra: 'STONE_AGE',
    },
    effects: [],
    iconIdentifier: 'sparkles',
  },

  // --- Category: FOCUS_SUPPORT ---
  {
    id: 'stone_age_study_cave',
    name: 'Meditation Cave',
    description: 'A quiet shelter shielded from wind and distractions, fostering uninterrupted study.',
    era: 'STONE_AGE',
    category: 'FOCUS_SUPPORT',
    footprint: { width: 3, height: 3 },
    baseCost: 25,
    upgradeCostMultiplier: 1.75,
    maxLevel: 5,
    unlockRequirements: {
      minPlayerLevel: 1,
      minTotalFocusMinutes: 50,
      minEra: 'STONE_AGE',
    },
    effects: [
      {
        type: 'FOCUS_FEATURE_UNLOCK',
        featureId: 'focus_preset_cave_retreat',
      },
    ],
    iconIdentifier: 'book-open',
  },
  {
    id: 'stone_age_elder_hut',
    name: "Elder's Hut",
    description: 'Home of tribal mentors who record past Focus journeys and track daily wisdom.',
    era: 'STONE_AGE',
    category: 'FOCUS_SUPPORT',
    footprint: { width: 2, height: 2 },
    baseCost: 40,
    upgradeCostMultiplier: 1.8,
    maxLevel: 5,
    unlockRequirements: {
      minPlayerLevel: 2,
      minTotalFocusMinutes: 100,
      minEra: 'STONE_AGE',
    },
    effects: [
      {
        type: 'FOCUS_STAT_UNLOCK',
        statId: 'focus_metric_streak_analysis',
      },
    ],
    iconIdentifier: 'award',
  },

  // --- Category: ECONOMY_EFFECT ---
  {
    id: 'stone_age_foraging_post',
    name: 'Foraging Post',
    description: 'Organized supply gathering that boosts Focus rewards (+2% additive Coins per level).',
    era: 'STONE_AGE',
    category: 'ECONOMY_EFFECT',
    footprint: { width: 2, height: 2 },
    baseCost: 30,
    upgradeCostMultiplier: 1.6,
    maxLevel: 5,
    unlockRequirements: {
      minPlayerLevel: 1,
      minTotalFocusMinutes: 60,
      minEra: 'STONE_AGE',
    },
    effects: [
      {
        type: 'COIN_BONUS',
        rate: 0.02, // +2% additive bonus per level on Focus session reward
      },
    ],
    iconIdentifier: 'compass',
  },
  {
    id: 'stone_age_food_cache',
    name: 'Primitive Granary',
    description: 'A secure stone cache preserving provisions (+3% additive Coins per level).',
    era: 'STONE_AGE',
    category: 'ECONOMY_EFFECT',
    footprint: { width: 2, height: 3 },
    baseCost: 60,
    upgradeCostMultiplier: 1.8,
    maxLevel: 5,
    unlockRequirements: {
      minPlayerLevel: 2,
      minTotalFocusMinutes: 150,
      minEra: 'STONE_AGE',
    },
    effects: [
      {
        type: 'COIN_BONUS',
        rate: 0.03, // +3% additive bonus per level on Focus session reward
      },
    ],
    iconIdentifier: 'archive',
  },
]);

/** Fast lookup map indexed by definition ID */
const DEFINITION_MAP: ReadonlyMap<string, BuildingDefinition> = new Map(
  STONE_AGE_BUILDING_DEFINITIONS.map((def) => [def.id, def])
);

/**
 * Retrieve a building definition by its unique identifier.
 * Returns undefined safely if not recognized.
 */
export function getBuildingDefinition(id: string): BuildingDefinition | undefined {
  if (typeof id !== 'string' || id.length === 0) return undefined;
  return DEFINITION_MAP.get(id);
}

/** Check if a building definition exists in the catalog */
export function hasBuildingDefinition(id: string): boolean {
  if (typeof id !== 'string' || id.length === 0) return false;
  return DEFINITION_MAP.has(id);
}

/** Get all registered building definitions */
export function getAllBuildingDefinitions(): readonly BuildingDefinition[] {
  return STONE_AGE_BUILDING_DEFINITIONS;
}

/** Filter building definitions by civilization era */
export function getBuildingDefinitionsByEra(era: CivilizationEra): readonly BuildingDefinition[] {
  return STONE_AGE_BUILDING_DEFINITIONS.filter((def) => def.era === era);
}

/** Filter building definitions by functional category */
export function getBuildingDefinitionsByCategory(
  category: BuildingCategory
): readonly BuildingDefinition[] {
  return STONE_AGE_BUILDING_DEFINITIONS.filter((def) => def.category === category);
}

/**
 * Pure calculation of the Coins required to upgrade a building from currentLevel to (currentLevel + 1).
 * Returns 0 if already at or above maxLevel or if parameters are invalid.
 */
export function calculateUpgradeCost(
  definition: BuildingDefinition,
  currentLevel: number
): number {
  if (
    !definition ||
    typeof currentLevel !== 'number' ||
    !Number.isInteger(currentLevel) ||
    currentLevel < 1 ||
    currentLevel >= definition.maxLevel
  ) {
    return 0;
  }

  // Cost formula: baseCost * (upgradeCostMultiplier ^ currentLevel)
  const rawCost = definition.baseCost * Math.pow(definition.upgradeCostMultiplier, currentLevel);
  if (!Number.isFinite(rawCost) || rawCost <= 0) {
    return 0;
  }

  return Math.round(rawCost);
}
