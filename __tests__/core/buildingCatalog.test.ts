import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  STONE_AGE_BUILDING_DEFINITIONS,
  getBuildingDefinition,
  hasBuildingDefinition,
  getAllBuildingDefinitions,
  getBuildingDefinitionsByEra,
  getBuildingDefinitionsByCategory,
  calculateUpgradeCost,
  extractBuildingCoinBonuses,
  BuildingInstance,
} from '../../src/core/civilization/index.ts';

test('BuildingCatalog: all definition IDs are unique and well-formed', () => {
  const all = getAllBuildingDefinitions();
  assert.ok(all.length >= 6, `Expected at least 6 Stone Age buildings, found ${all.length}`);

  const seenIds = new Set<string>();
  for (const def of all) {
    assert.strictEqual(typeof def.id, 'string');
    assert.ok(def.id.length > 0, 'id must not be empty');
    assert.ok(!seenIds.has(def.id), `Duplicate definition ID detected: ${def.id}`);
    seenIds.add(def.id);
  }
});

test('BuildingCatalog: definitions cover DECORATIVE, FOCUS_SUPPORT, and ECONOMY_EFFECT categories', () => {
  const decorative = getBuildingDefinitionsByCategory('DECORATIVE');
  const focusSupport = getBuildingDefinitionsByCategory('FOCUS_SUPPORT');
  const economyEffect = getBuildingDefinitionsByCategory('ECONOMY_EFFECT');

  assert.ok(decorative.length >= 2, 'Should have at least 2 decorative buildings');
  assert.ok(focusSupport.length >= 2, 'Should have at least 2 focus support buildings');
  assert.ok(economyEffect.length >= 2, 'Should have at least 2 economy effect buildings');

  // Verify era filtering
  const stoneAge = getBuildingDefinitionsByEra('STONE_AGE');
  assert.strictEqual(stoneAge.length, getAllBuildingDefinitions().length);

  const bronzeAge = getBuildingDefinitionsByEra('BRONZE_AGE');
  assert.strictEqual(bronzeAge.length, 0, 'Bronze Age is not populated in Phase 5B.2');
});

test('BuildingCatalog: lookups return definitions correctly and handle unknown IDs safely', () => {
  assert.strictEqual(hasBuildingDefinition('stone_age_campfire'), true);
  assert.strictEqual(hasBuildingDefinition('stone_age_foraging_post'), true);
  assert.strictEqual(hasBuildingDefinition('non_existent_building'), false);
  assert.strictEqual(hasBuildingDefinition(''), false);

  const campfire = getBuildingDefinition('stone_age_campfire');
  assert.ok(campfire);
  assert.strictEqual(campfire!.name, 'Campfire');
  assert.strictEqual(campfire!.category, 'DECORATIVE');
  assert.strictEqual(campfire!.footprint.width, 1);
  assert.strictEqual(campfire!.footprint.height, 1);

  assert.strictEqual(getBuildingDefinition('non_existent_building'), undefined);
  assert.strictEqual(getBuildingDefinition(''), undefined);
});

test('BuildingCatalog: definitions enforce valid footprints, costs, and positive limits', () => {
  for (const def of getAllBuildingDefinitions()) {
    assert.ok(def.name.length > 0);
    assert.ok(def.description.length > 0);
    assert.strictEqual(def.era, 'STONE_AGE');

    // Footprint
    assert.ok(Number.isInteger(def.footprint.width) && def.footprint.width >= 1);
    assert.ok(Number.isInteger(def.footprint.height) && def.footprint.height >= 1);

    // Costs
    assert.ok(Number.isInteger(def.baseCost) && def.baseCost > 0);
    assert.ok(Number.isFinite(def.upgradeCostMultiplier) && def.upgradeCostMultiplier > 1);
    assert.ok(Number.isInteger(def.maxLevel) && def.maxLevel >= 1);

    // Unlock requirements
    assert.ok(def.unlockRequirements.minPlayerLevel >= 1);
    assert.ok(def.unlockRequirements.minTotalFocusMinutes >= 0);
  }
});

test('BuildingCatalog: category rules strictly restrict CoinBonus to ECONOMY_EFFECT', () => {
  // DECORATIVE buildings must NEVER declare CoinBonus
  for (const def of getBuildingDefinitionsByCategory('DECORATIVE')) {
    assert.strictEqual(def.effects.length, 0, 'Decorative buildings should have no gameplay effects');
  }

  // FOCUS_SUPPORT buildings must NEVER declare CoinBonus
  for (const def of getBuildingDefinitionsByCategory('FOCUS_SUPPORT')) {
    for (const effect of def.effects) {
      assert.notStrictEqual(effect.type, 'COIN_BONUS', 'Focus support buildings must not award CoinBonus');
      assert.ok(effect.type === 'FOCUS_FEATURE_UNLOCK' || effect.type === 'FOCUS_STAT_UNLOCK');
    }
  }

  // ECONOMY_EFFECT buildings must declare valid, positive finite CoinBonus rates
  for (const def of getBuildingDefinitionsByCategory('ECONOMY_EFFECT')) {
    assert.ok(def.effects.length > 0);
    for (const effect of def.effects) {
      assert.strictEqual(effect.type, 'COIN_BONUS');
      assert.ok(Number.isFinite(effect.rate));
      assert.ok(effect.rate > 0 && effect.rate <= 0.1, `Provisional bonus rate should be reasonable: ${effect.rate}`);
    }
  }
});

test('BuildingCatalog: master list is frozen and cannot be mutated externally', () => {
  assert.ok(Object.isFrozen(STONE_AGE_BUILDING_DEFINITIONS));
});

test('calculateUpgradeCost: computes progressive integer costs and returns 0 at max level', () => {
  const granary = getBuildingDefinition('stone_age_food_cache')!;
  assert.ok(granary);
  assert.strictEqual(granary.baseCost, 60);
  assert.strictEqual(granary.upgradeCostMultiplier, 1.8);
  assert.strictEqual(granary.maxLevel, 5);

  // Level 1 -> 2: 60 * (1.8^1) = 108
  const costL1 = calculateUpgradeCost(granary, 1);
  assert.strictEqual(costL1, 108);

  // Level 2 -> 3: 60 * (1.8^2) = 194.4 -> 194
  const costL2 = calculateUpgradeCost(granary, 2);
  assert.strictEqual(costL2, 194);
  assert.ok(costL2 > costL1, 'Cost must scale monotonically');

  // Level 4 -> 5: 60 * (1.8^4) = 629.856 -> 630
  const costL4 = calculateUpgradeCost(granary, 4);
  assert.strictEqual(costL4, 630);

  // At or above maxLevel: returns 0 (cannot upgrade)
  assert.strictEqual(calculateUpgradeCost(granary, 5), 0);
  assert.strictEqual(calculateUpgradeCost(granary, 6), 0);

  // Invalid levels
  assert.strictEqual(calculateUpgradeCost(granary, 0), 0);
  assert.strictEqual(calculateUpgradeCost(granary, -1), 0);
  assert.strictEqual(calculateUpgradeCost(granary, 1.5), 0);
});

test('extractBuildingCoinBonuses: extracts additive CoinBonus per level from active instances', () => {
  const instances: BuildingInstance[] = [
    {
      id: 'inst-campfire-1',
      definitionId: 'stone_age_campfire', // DECORATIVE: 0 bonus
      position: { x: 0, y: 0 },
      level: 2,
      placedAt: 1000,
    },
    {
      id: 'inst-cave-1',
      definitionId: 'stone_age_study_cave', // FOCUS_SUPPORT: 0 bonus
      position: { x: 5, y: 5 },
      level: 1,
      placedAt: 1000,
    },
    {
      id: 'inst-foraging-1',
      definitionId: 'stone_age_foraging_post', // rate: 0.02, level: 3 -> 0.06
      position: { x: 10, y: 10 },
      level: 3,
      placedAt: 1000,
    },
    {
      id: 'inst-granary-1',
      definitionId: 'stone_age_food_cache', // rate: 0.03, level: 2 -> 0.06
      position: { x: 15, y: 15 },
      level: 2,
      placedAt: 1000,
    },
  ];

  const bonuses = extractBuildingCoinBonuses(instances);

  assert.strictEqual(bonuses.length, 2);

  assert.deepStrictEqual(bonuses[0], {
    id: 'building:inst-foraging-1',
    source: 'BUILDING',
    rate: 0.06, // 0.02 * 3
  });

  assert.deepStrictEqual(bonuses[1], {
    id: 'building:inst-granary-1',
    source: 'BUILDING',
    rate: 0.06, // 0.03 * 2
  });

  // Empty, null, or malformed instances return empty array
  assert.deepStrictEqual(extractBuildingCoinBonuses([]), []);
  assert.deepStrictEqual(extractBuildingCoinBonuses(null), []);
  assert.deepStrictEqual(extractBuildingCoinBonuses(undefined), []);
});
