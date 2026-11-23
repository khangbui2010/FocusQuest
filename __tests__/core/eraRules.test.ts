import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  ERA_LEVEL_RULES,
  STONE_TO_BRONZE_ADVANCE_REQUIREMENTS,
  evaluateEraAdvance,
  getEffectiveMaxLevel,
  getEntryLevel,
  getEraAdvanceRequirements,
  getEraUpgradeCap,
} from '../../src/core/civilization/eraRules.ts';
import { getBuildingDefinition } from '../../src/core/civilization/buildingCatalog.ts';
import {
  BuildingInstance,
  CIVILIZATION_ERAS,
  CivilizationEra,
} from '../../src/core/civilization/buildingTypes.ts';
import { Villager } from '../../src/core/civilization/villager.ts';

function buildFullStoneAgeFloorSet(): BuildingInstance[] {
  const caveReq = STONE_TO_BRONZE_ADVANCE_REQUIREMENTS.buildingRequirements.find(
    (b) => b.definitionId === 'stone_age_study_cave'
  )!;
  const forageReq = STONE_TO_BRONZE_ADVANCE_REQUIREMENTS.buildingRequirements.find(
    (b) => b.definitionId === 'stone_age_foraging_post'
  )!;
  const granaryReq = STONE_TO_BRONZE_ADVANCE_REQUIREMENTS.buildingRequirements.find(
    (b) => b.definitionId === 'stone_age_food_cache'
  )!;

  return [
    { id: 'c1', definitionId: 'stone_age_campfire', position: { x: 0, y: 0 }, level: 1, placedAt: 1 },
    { id: 't1', definitionId: 'stone_age_totem', position: { x: 1, y: 0 }, level: 1, placedAt: 1 },
    { id: 'e1', definitionId: 'stone_age_elder_hut', position: { x: 2, y: 0 }, level: 1, placedAt: 1 },
    {
      id: 'cave',
      definitionId: 'stone_age_study_cave',
      position: { x: 4, y: 0 },
      level: caveReq.minLevel,
      placedAt: 1,
    },
    ...[0, 2, 4, 6].map((x, idx) => ({
      id: `fp_${idx}`,
      definitionId: 'stone_age_foraging_post',
      position: { x, y: 4 },
      level: forageReq.minLevel,
      placedAt: 1,
    })),
    ...[0, 2, 4, 6].map((x, idx) => ({
      id: `gr_${idx}`,
      definitionId: 'stone_age_food_cache',
      position: { x, y: 8 },
      level: granaryReq.minLevel,
      placedAt: 1,
    })),
  ];
}

function buildCompleteTribeVillagers(): Villager[] {
  return [
    { id: 'v_crafter', role: 'crafter', recruitedAt: 1 },
    { id: 'v_elder', role: 'elder', recruitedAt: 2 },
    { id: 'v_woodworker', role: 'woodworker', recruitedAt: 3 },
  ];
}

test('EraRules: ERA_LEVEL_RULES caps, provisional flags, getEraUpgradeCap & getEffectiveMaxLevel', () => {
  assert.strictEqual(ERA_LEVEL_RULES.STONE_AGE.upgradeCap, 5);
  assert.strictEqual(ERA_LEVEL_RULES.STONE_AGE.provisional, false);
  assert.strictEqual(ERA_LEVEL_RULES.BRONZE_AGE.upgradeCap, 10);
  assert.strictEqual(ERA_LEVEL_RULES.BRONZE_AGE.entryFloor, 5);
  assert.strictEqual(ERA_LEVEL_RULES.BRONZE_AGE.provisional, false);

  const provisionalEras: CivilizationEra[] = [
    'IRON_AGE',
    'MEDIEVAL',
    'EARLY_MODERN',
    'MODERN',
    'FUTURISTIC',
    'INTERPLANETARY',
  ];
  for (const era of provisionalEras) {
    assert.strictEqual(ERA_LEVEL_RULES[era].provisional, true, `${era} must be provisional`);
  }

  for (const era of CIVILIZATION_ERAS) {
    assert.strictEqual(getEraUpgradeCap(era), ERA_LEVEL_RULES[era].upgradeCap);
  }
  assert.strictEqual(getEraUpgradeCap('UNKNOWN_ERA'), 5);
  assert.strictEqual(getEraUpgradeCap(null), 5);

  // Stone Age effective max levels match building catalog
  assert.strictEqual(getEffectiveMaxLevel(getBuildingDefinition('stone_age_campfire'), 'STONE_AGE'), 3);
  assert.strictEqual(getEffectiveMaxLevel(getBuildingDefinition('stone_age_totem'), 'STONE_AGE'), 3);
  assert.strictEqual(getEffectiveMaxLevel(getBuildingDefinition('stone_age_study_cave'), 'STONE_AGE'), 5);
  assert.strictEqual(getEffectiveMaxLevel(getBuildingDefinition('stone_age_foraging_post'), 'STONE_AGE'), 5);
  assert.strictEqual(getEffectiveMaxLevel(getBuildingDefinition('stone_age_food_cache'), 'STONE_AGE'), 5);
  // Higher catalog maxLevel is capped by STONE_AGE (5) and allowed up to 10 in BRONZE_AGE
  assert.strictEqual(getEffectiveMaxLevel({ maxLevel: 10 }, 'STONE_AGE'), 5);
  assert.strictEqual(getEffectiveMaxLevel({ maxLevel: 10 }, 'BRONZE_AGE'), 10);
  assert.strictEqual(getEffectiveMaxLevel(undefined, 'STONE_AGE'), 5);
});

test('EraRules: getEntryLevel clamps Bronze Age floor [5..10] and safely guards invalid inputs', () => {
  const bronzeFloor = ERA_LEVEL_RULES.BRONZE_AGE.entryFloor;
  const bronzeCap = ERA_LEVEL_RULES.BRONZE_AGE.upgradeCap;
  assert.strictEqual(bronzeFloor, 5);

  assert.strictEqual(getEntryLevel('STONE_AGE', 1), 1);
  assert.strictEqual(getEntryLevel('BRONZE_AGE', 1), bronzeFloor);
  assert.strictEqual(getEntryLevel('BRONZE_AGE', 4), bronzeFloor);
  assert.strictEqual(getEntryLevel('BRONZE_AGE', 5), bronzeFloor);
  assert.strictEqual(getEntryLevel('BRONZE_AGE', 7), 7);
  assert.strictEqual(getEntryLevel('BRONZE_AGE', bronzeCap), bronzeCap);
  assert.strictEqual(getEntryLevel('BRONZE_AGE', 15), bronzeCap);
  assert.strictEqual(getEntryLevel('BRONZE_AGE', -5), bronzeFloor);
  assert.strictEqual(getEntryLevel('BRONZE_AGE', Number.NaN), bronzeFloor);
  assert.strictEqual(getEntryLevel('INVALID_ERA', 3), 3);
});

test('EraRules: STONE_TO_BRONZE_ADVANCE_REQUIREMENTS & evaluateEraAdvance truth table', () => {
  const req = STONE_TO_BRONZE_ADVANCE_REQUIREMENTS;
  assert.deepStrictEqual(getEraAdvanceRequirements('STONE_AGE'), req);
  assert.strictEqual(getEraAdvanceRequirements('BRONZE_AGE'), null);
  assert.strictEqual(getEraAdvanceRequirements('BAD'), null);

  assert.strictEqual(req.minPlayerLevel, 9);
  assert.strictEqual(req.minTotalFocusMinutes, 500);
  assert.strictEqual(req.minLandExpansions, 3);
  assert.strictEqual(req.feeCoins, 500);

  const fullBuildings = buildFullStoneAgeFloorSet();
  const fullVillagers = buildCompleteTribeVillagers();
  const baseCoins = req.feeCoins;
  const happy = evaluateEraAdvance({
    era: 'STONE_AGE',
    buildings: fullBuildings,
    villagers: fullVillagers,
    landExpansions: req.minLandExpansions,
    playerLevel: req.minPlayerLevel,
    totalFocusMinutes: req.minTotalFocusMinutes,
    coins: baseCoins,
  });

  assert.strictEqual(happy.eligible, true);
  assert.strictEqual(happy.nextEra, 'BRONZE_AGE');
  assert.strictEqual(happy.feeCoins, req.feeCoins);
  assert.ok(happy.checks.every((c) => c.met));
  // Never mutates coins, buildings, or villagers array
  assert.strictEqual(baseCoins, req.feeCoins);
  assert.strictEqual(fullBuildings.length, 12);
  assert.strictEqual(fullVillagers.length, 3);

  // Missing any single villager role breaks eligibility
  for (const missingRole of ['crafter', 'elder', 'woodworker'] as const) {
    const partialVillagers = fullVillagers.filter((v) => v.role !== missingRole);
    const res = evaluateEraAdvance({
      era: 'STONE_AGE',
      buildings: fullBuildings,
      villagers: partialVillagers,
      landExpansions: req.minLandExpansions,
      playerLevel: req.minPlayerLevel,
      totalFocusMinutes: req.minTotalFocusMinutes,
      coins: req.feeCoins,
    });
    assert.strictEqual(res.eligible, false, `Missing ${missingRole} must fail`);
    const vCheck = res.checks.find((c) => c.id === `villager:${missingRole}`);
    assert.strictEqual(vCheck?.current, 0);
    assert.strictEqual(vCheck?.required, 1);
    assert.strictEqual(vCheck?.met, false);
  }

  // Omitting villagers fails
  assert.strictEqual(
    evaluateEraAdvance({
      era: 'STONE_AGE',
      buildings: fullBuildings,
      landExpansions: req.minLandExpansions,
      playerLevel: req.minPlayerLevel,
      totalFocusMinutes: req.minTotalFocusMinutes,
      coins: req.feeCoins,
    }).eligible,
    false
  );

  // Land expansions: 2 -> false, 3 -> true
  const twoExpRes = evaluateEraAdvance({
    era: 'STONE_AGE',
    buildings: fullBuildings,
    villagers: fullVillagers,
    landExpansions: req.minLandExpansions - 1,
    playerLevel: req.minPlayerLevel,
    totalFocusMinutes: req.minTotalFocusMinutes,
    coins: req.feeCoins,
  });
  assert.strictEqual(twoExpRes.eligible, false);
  assert.strictEqual(twoExpRes.checks.find((c) => c.id === 'land_expansions')?.current, 2);
  assert.strictEqual(twoExpRes.checks.find((c) => c.id === 'land_expansions')?.met, false);

  // Missing each required building breaks eligibility
  for (const bReq of req.buildingRequirements) {
    const minusOne = fullBuildings.filter((_, idx) => {
      const firstMatch = fullBuildings.findIndex((item) => item.definitionId === bReq.definitionId);
      return idx !== firstMatch;
    });
    const res = evaluateEraAdvance({
      era: 'STONE_AGE',
      buildings: minusOne,
      villagers: fullVillagers,
      landExpansions: req.minLandExpansions,
      playerLevel: req.minPlayerLevel,
      totalFocusMinutes: req.minTotalFocusMinutes,
      coins: req.feeCoins,
    });
    assert.strictEqual(res.eligible, false, `Should be ineligible when missing ${bReq.definitionId}`);
    const check = res.checks.find((c) => c.id === `building:${bReq.definitionId}`);
    assert.strictEqual(check?.met, false);
  }

  // Cave at Lv.4 (<5), Foraging Post at Lv.4 (<5), Granary at Lv.4 (<5) all fail
  const caveLv4 = fullBuildings.map((b) =>
    b.definitionId === 'stone_age_study_cave' ? { ...b, level: 4 } : b
  );
  assert.strictEqual(
    evaluateEraAdvance({
      era: 'STONE_AGE',
      buildings: caveLv4,
      villagers: fullVillagers,
      landExpansions: req.minLandExpansions,
      playerLevel: req.minPlayerLevel,
      totalFocusMinutes: req.minTotalFocusMinutes,
      coins: req.feeCoins,
    }).eligible,
    false
  );

  const oneForageLv4 = fullBuildings.map((b) => (b.id === 'fp_3' ? { ...b, level: 4 } : b));
  const forageRes = evaluateEraAdvance({
    era: 'STONE_AGE',
    buildings: oneForageLv4,
    villagers: fullVillagers,
    landExpansions: req.minLandExpansions,
    playerLevel: req.minPlayerLevel,
    totalFocusMinutes: req.minTotalFocusMinutes,
    coins: req.feeCoins,
  });
  assert.strictEqual(forageRes.eligible, false);
  assert.strictEqual(forageRes.checks.find((c) => c.id === 'building:stone_age_foraging_post')?.current, 3);

  const oneGranaryLv4 = fullBuildings.map((b) => (b.id === 'gr_2' ? { ...b, level: 4 } : b));
  const granaryRes = evaluateEraAdvance({
    era: 'STONE_AGE',
    buildings: oneGranaryLv4,
    villagers: fullVillagers,
    landExpansions: req.minLandExpansions,
    playerLevel: req.minPlayerLevel,
    totalFocusMinutes: req.minTotalFocusMinutes,
    coins: req.feeCoins,
  });
  assert.strictEqual(granaryRes.eligible, false);
  assert.strictEqual(granaryRes.checks.find((c) => c.id === 'building:stone_age_food_cache')?.current, 3);

  // Level 8 fails (9 passes above)
  assert.strictEqual(
    evaluateEraAdvance({
      era: 'STONE_AGE',
      buildings: fullBuildings,
      villagers: fullVillagers,
      landExpansions: req.minLandExpansions,
      playerLevel: req.minPlayerLevel - 1,
      totalFocusMinutes: req.minTotalFocusMinutes,
      coins: req.feeCoins,
    }).eligible,
    false
  );

  // 499 minutes fails (500 passes above)
  assert.strictEqual(
    evaluateEraAdvance({
      era: 'STONE_AGE',
      buildings: fullBuildings,
      villagers: fullVillagers,
      landExpansions: req.minLandExpansions,
      playerLevel: req.minPlayerLevel,
      totalFocusMinutes: req.minTotalFocusMinutes - 1,
      coins: req.feeCoins,
    }).eligible,
    false
  );

  // 499 Coins fails (500 passes above)
  assert.strictEqual(
    evaluateEraAdvance({
      era: 'STONE_AGE',
      buildings: fullBuildings,
      villagers: fullVillagers,
      landExpansions: req.minLandExpansions,
      playerLevel: req.minPlayerLevel,
      totalFocusMinutes: req.minTotalFocusMinutes,
      coins: req.feeCoins - 1,
    }).eligible,
    false
  );

  // Safe on null/undefined/frozen inputs (must not mutate frozen arrays or objects)
  assert.strictEqual(evaluateEraAdvance(null).eligible, false);
  assert.strictEqual(evaluateEraAdvance(undefined).eligible, false);
  const frozenBuildings = Object.freeze(buildFullStoneAgeFloorSet().map((b) => Object.freeze(b)));
  const frozenVillagers = Object.freeze(buildCompleteTribeVillagers().map((v) => Object.freeze(v)));
  assert.strictEqual(
    evaluateEraAdvance({
      era: 'STONE_AGE',
      buildings: frozenBuildings,
      villagers: frozenVillagers,
      landExpansions: req.minLandExpansions,
      playerLevel: req.minPlayerLevel,
      totalFocusMinutes: req.minTotalFocusMinutes,
      coins: req.feeCoins,
    }).eligible,
    true
  );
});
