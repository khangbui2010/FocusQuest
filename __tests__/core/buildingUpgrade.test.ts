import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  BUILDING_DEMOLISH_REFUND_RATE,
  BUILDING_UPGRADE_PLAYER_LEVEL_STEP,
  MAX_ECONOMY_EFFECT_BUILDINGS,
} from '../../src/core/civilization/constants.ts';
import {
  STONE_AGE_BUILDING_DEFINITIONS,
  calculateUpgradeCost,
  getBuildingDefinition,
} from '../../src/core/civilization/buildingCatalog.ts';
import {
  applyBuildingUpgrade,
  calculateBuildingDemolishRefund,
  calculateTotalBuildingCoinsSpent,
  canPlaceAnotherBuildingOfCategory,
  evaluateBuildingUpgrade,
  getBuildingCoinBonusRateAtLevel,
  getBuildingPlacementLimit,
  getBuildingUpgradeRequiredPlayerLevel,
  getPlacedBuildingCountByDefinition,
  getPlacedEconomyBuildingsCount,
  isBuildingCategoryUpgradeable,
} from '../../src/core/civilization/buildingUpgrade.ts';
import { BuildingInstance } from '../../src/core/civilization/buildingTypes.ts';
import { extractBuildingCoinBonuses } from '../../src/core/civilization/civilizationBonusHelper.ts';
import { aggregateCoinBonus } from '../../src/core/economy/coinBonus.ts';

const EPSILON = 1e-12;

function makeInstance(definitionId: string, level = 1, id = 'bld_test'): BuildingInstance {
  return {
    id,
    definitionId,
    position: { x: 0, y: 0 },
    level,
    placedAt: 1700000000000,
  };
}

test('Core 5C-1 (Policy & Constants): category upgradeability, refund rate, and Economy cap invariants', () => {
  assert.equal(BUILDING_UPGRADE_PLAYER_LEVEL_STEP, 1);
  assert.equal(BUILDING_DEMOLISH_REFUND_RATE, 0.5);
  assert.equal(MAX_ECONOMY_EFFECT_BUILDINGS, 4);

  assert.equal(isBuildingCategoryUpgradeable('ECONOMY_EFFECT'), true);
  assert.equal(isBuildingCategoryUpgradeable('DECORATIVE'), false);
  assert.equal(isBuildingCategoryUpgradeable('FOCUS_SUPPORT'), false);

  assert.equal(getBuildingPlacementLimit(getBuildingDefinition('stone_age_foraging_post')!), 4);
  assert.equal(getBuildingPlacementLimit(getBuildingDefinition('stone_age_food_cache')!), 4);
  assert.equal(getBuildingPlacementLimit(getBuildingDefinition('stone_age_campfire')!), null);
  assert.equal(getBuildingPlacementLimit(getBuildingDefinition('stone_age_elder_hut')!), null);
});

test('Core 5C-1 (Catalog & Refunds): exact cumulative Coins spent & IEEE-754 50% demolish refund across all 6 Stone Age buildings', () => {
  const campfire = getBuildingDefinition('stone_age_campfire')!;
  assert.equal(calculateTotalBuildingCoinsSpent(campfire, 1), 8);
  assert.equal(calculateBuildingDemolishRefund(campfire, 1), 4);
  assert.equal(calculateTotalBuildingCoinsSpent(campfire, 3), 8 + 12 + 18);
  assert.equal(calculateBuildingDemolishRefund(campfire, 3), 19);

  const totem = getBuildingDefinition('stone_age_totem')!;
  assert.equal(calculateBuildingDemolishRefund(totem, 1), 7.5);
  assert.equal(calculateTotalBuildingCoinsSpent(totem, 3), 15 + 24 + 38);
  assert.equal(calculateBuildingDemolishRefund(totem, 3), 38.5);

  const foraging = getBuildingDefinition('stone_age_foraging_post')!;
  const foragingCosts = [30, 48, 77, 123, 197]; // base + L1->2, L2->3, L3->4, L4->5
  assert.equal(calculateUpgradeCost(foraging, 1), 48);
  assert.equal(calculateUpgradeCost(foraging, 2), 77);
  assert.equal(calculateUpgradeCost(foraging, 3), 123);
  assert.equal(calculateUpgradeCost(foraging, 4), 197);
  assert.equal(calculateTotalBuildingCoinsSpent(foraging, 1), 30);
  assert.equal(calculateBuildingDemolishRefund(foraging, 1), 15);
  assert.equal(calculateTotalBuildingCoinsSpent(foraging, 3), 30 + 48 + 77);
  assert.equal(calculateBuildingDemolishRefund(foraging, 3), 77.5);
  assert.equal(
    calculateTotalBuildingCoinsSpent(foraging, 5),
    foragingCosts.reduce((sum, n) => sum + n, 0)
  );
  assert.equal(calculateBuildingDemolishRefund(foraging, 5), 237.5);

  const granary = getBuildingDefinition('stone_age_food_cache')!;
  assert.equal(calculateUpgradeCost(granary, 1), 108);
  assert.equal(calculateUpgradeCost(granary, 2), 194);
  assert.equal(calculateUpgradeCost(granary, 3), 350);
  assert.equal(calculateUpgradeCost(granary, 4), 630);
  assert.equal(calculateTotalBuildingCoinsSpent(granary, 5), 60 + 108 + 194 + 350 + 630);
  assert.equal(calculateBuildingDemolishRefund(granary, 5), 671);

  // Unknown definition or invalid level must degrade safely to 0
  assert.equal(calculateBuildingDemolishRefund(undefined, 2), 0);
  assert.equal(calculateTotalBuildingCoinsSpent(foraging, 0), 0);
  assert.equal(STONE_AGE_BUILDING_DEFINITIONS.length, 6);
});

test('Core 5C-1 (Evaluator & Level Gates): verifies every gate precedence, CoinBonus preview, and applyBuildingUpgrade immutability', () => {
  const foraging = getBuildingDefinition('stone_age_foraging_post')!;
  const granary = getBuildingDefinition('stone_age_food_cache')!;
  const campfire = getBuildingDefinition('stone_age_campfire')!;
  const elderHut = getBuildingDefinition('stone_age_elder_hut')!;

  // Required player levels: minPlayerLevel + currentLevel
  assert.equal(getBuildingUpgradeRequiredPlayerLevel(foraging, 1), 2);
  assert.equal(getBuildingUpgradeRequiredPlayerLevel(foraging, 4), 5);
  assert.equal(getBuildingUpgradeRequiredPlayerLevel(granary, 1), 3);
  assert.equal(getBuildingUpgradeRequiredPlayerLevel(granary, 4), 6);

  // CoinBonus progression
  assert.ok(Math.abs(getBuildingCoinBonusRateAtLevel(foraging, 1) - 0.02) < EPSILON);
  assert.ok(Math.abs(getBuildingCoinBonusRateAtLevel(foraging, 5) - 0.1) < EPSILON);
  assert.ok(Math.abs(getBuildingCoinBonusRateAtLevel(granary, 5) - 0.15) < EPSILON);

  // Missing building / invalid state
  assert.equal(
    evaluateBuildingUpgrade({
      instance: undefined,
      definition: foraging,
      currentEra: 'STONE_AGE',
      playerLevel: 10,
      playerCoins: 1000,
    }).reason,
    'BUILDING_NOT_FOUND'
  );
  assert.equal(
    evaluateBuildingUpgrade({
      instance: makeInstance('stone_age_foraging_post', 0),
      definition: foraging,
      currentEra: 'STONE_AGE',
      playerLevel: 10,
      playerCoins: 1000,
    }).reason,
    'INVALID_STATE'
  );

  // Expected level concurrency mismatch
  assert.equal(
    evaluateBuildingUpgrade({
      instance: makeInstance('stone_age_foraging_post', 2),
      definition: foraging,
      currentEra: 'STONE_AGE',
      playerLevel: 10,
      playerCoins: 1000,
      expectedLevel: 1,
    }).reason,
    'LEVEL_MISMATCH'
  );

  // Non-upgradeable categories (DECORATIVE & FOCUS_SUPPORT)
  for (const [id, def] of [
    ['stone_age_campfire', campfire],
    ['stone_age_elder_hut', elderHut],
  ] as const) {
    const res = evaluateBuildingUpgrade({
      instance: makeInstance(id, 1),
      definition: def,
      currentEra: 'STONE_AGE',
      playerLevel: 99,
      playerCoins: 99999,
    });
    assert.equal(res.canUpgrade, false);
    assert.equal(res.reason, 'NON_UPGRADEABLE_CATEGORY');
    assert.equal(res.isCategoryUpgradeable, false);
  }

  // Max level check
  const maxRes = evaluateBuildingUpgrade({
    instance: makeInstance('stone_age_foraging_post', 5),
    definition: foraging,
    currentEra: 'STONE_AGE',
    playerLevel: 99,
    playerCoins: 99999,
  });
  assert.equal(maxRes.canUpgrade, false);
  assert.equal(maxRes.reason, 'BUILDING_MAX_LEVEL');
  assert.equal(maxRes.nextLevel, null);

  // Player Level gate check
  const lvGate = evaluateBuildingUpgrade({
    instance: makeInstance('stone_age_food_cache', 1),
    definition: granary,
    currentEra: 'STONE_AGE',
    playerLevel: 2, // needs Lv. 3
    playerCoins: 500,
  });
  assert.equal(lvGate.canUpgrade, false);
  assert.equal(lvGate.reason, 'PLAYER_LEVEL_REQUIRED');
  assert.equal(lvGate.requiredPlayerLevel, 3);
  assert.equal(lvGate.cost, 108);

  // Coins gate check
  const coinGate = evaluateBuildingUpgrade({
    instance: makeInstance('stone_age_foraging_post', 1),
    definition: foraging,
    currentEra: 'STONE_AGE',
    playerLevel: 2,
    playerCoins: 30,
  });
  assert.equal(coinGate.canUpgrade, false);
  assert.equal(coinGate.reason, 'INSUFFICIENT_COINS');
  assert.equal(coinGate.cost, 48);
  assert.equal(coinGate.shortfallCoins, 18);

  // Happy path + pure immutability of applyBuildingUpgrade
  const orig = makeInstance('stone_age_foraging_post', 1);
  const okEval = evaluateBuildingUpgrade({
    instance: orig,
    definition: foraging,
    currentEra: 'STONE_AGE',
    playerLevel: 2,
    playerCoins: 48,
    expectedLevel: 1,
  });
  assert.equal(okEval.canUpgrade, true);
  assert.equal(okEval.reason, null);
  assert.equal(okEval.nextLevel, 2);
  assert.equal(okEval.cost, 48);
  assert.equal(okEval.baseCost, 48);
  assert.equal(okEval.discountRate, 0);
  assert.ok(Math.abs(okEval.currentCoinBonusRate - 0.02) < EPSILON);
  assert.ok(Math.abs(okEval.nextCoinBonusRate - 0.04) < EPSILON);

  // Elder discount reduces upgrade cost while preserving baseCost
  const discountedEval = evaluateBuildingUpgrade({
    instance: orig,
    definition: foraging,
    currentEra: 'STONE_AGE',
    playerLevel: 2,
    playerCoins: 40,
    upgradeDiscountRate: 0.2,
  });
  assert.equal(discountedEval.canUpgrade, true);
  assert.equal(discountedEval.baseCost, 48);
  assert.equal(discountedEval.discountRate, 0.2);
  assert.equal(discountedEval.cost, 38); // Math.round(48 * 0.8) = 38

  const upgraded = applyBuildingUpgrade(orig);
  assert.equal(orig.level, 1, 'original instance must remain immutable');
  assert.equal(upgraded.level, 2);
  assert.equal(upgraded.id, orig.id);
});

test('Core 5C-1 (Per-Building Build Limit & Max Stone Age CoinBonus): caps Foraging Post and Granary independently at 4 each (+100% max theoretical CoinBonus)', () => {
  const foraging = getBuildingDefinition('stone_age_foraging_post')!;
  const granary = getBuildingDefinition('stone_age_food_cache')!;
  const campfire = getBuildingDefinition('stone_age_campfire')!;

  const fourMaxGranaries: BuildingInstance[] = [
    makeInstance('stone_age_food_cache', 5, 'g1'),
    makeInstance('stone_age_food_cache', 5, 'g2'),
    makeInstance('stone_age_food_cache', 5, 'g3'),
    makeInstance('stone_age_food_cache', 5, 'g4'),
    makeInstance('stone_age_campfire', 1, 'c1'),
    makeInstance('stone_age_elder_hut', 1, 'h1'),
  ];

  assert.equal(getPlacedEconomyBuildingsCount(fourMaxGranaries), 4);
  assert.equal(getPlacedBuildingCountByDefinition('stone_age_food_cache', fourMaxGranaries), 4);
  assert.equal(getPlacedBuildingCountByDefinition('stone_age_foraging_post', fourMaxGranaries), 0);

  // Foraging Post has its own independent 0/4 Build Limit even when Granary is 4/4
  const foragingCheck = canPlaceAnotherBuildingOfCategory(foraging, fourMaxGranaries);
  assert.equal(foragingCheck.allowed, true);
  assert.equal(foragingCheck.limit, 4);
  assert.equal(foragingCheck.currentCount, 0);

  // 5th Granary is blocked at 4/4
  const anotherGranaryCheck = canPlaceAnotherBuildingOfCategory(granary, fourMaxGranaries);
  assert.equal(anotherGranaryCheck.allowed, false);
  assert.equal(anotherGranaryCheck.limit, 4);
  assert.equal(anotherGranaryCheck.currentCount, 4);

  // Decorative & Focus Support are not capped
  assert.equal(canPlaceAnotherBuildingOfCategory(campfire, fourMaxGranaries).allowed, true);

  // After removing 1 Granary, Granary slot opens again
  const threeGranaries = fourMaxGranaries.slice(1);
  assert.equal(canPlaceAnotherBuildingOfCategory(granary, threeGranaries).allowed, true);

  // Max theoretical Stone Age CoinBonus = 4 * (2% * 5) + 4 * (3% * 5) = +40% + +60% = +100% (1.00)
  const fullEconomyFleet: BuildingInstance[] = [
    ...fourMaxGranaries,
    makeInstance('stone_age_foraging_post', 5, 'f1'),
    makeInstance('stone_age_foraging_post', 5, 'f2'),
    makeInstance('stone_age_foraging_post', 5, 'f3'),
    makeInstance('stone_age_foraging_post', 5, 'f4'),
  ];
  const bonuses = extractBuildingCoinBonuses(fullEconomyFleet);
  assert.equal(bonuses.length, 8);
  assert.ok(Math.abs(aggregateCoinBonus(bonuses) - 1.0) < EPSILON);
});
