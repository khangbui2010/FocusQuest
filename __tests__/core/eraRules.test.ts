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

function buildFullStoneAgeFloorSet(): BuildingInstance[] {
  return [
    { id: 'c1', definitionId: 'stone_age_campfire', position: { x: 0, y: 0 }, level: 1, placedAt: 1 },
    { id: 't1', definitionId: 'stone_age_totem', position: { x: 1, y: 0 }, level: 1, placedAt: 1 },
    { id: 'e1', definitionId: 'stone_age_elder_hut', position: { x: 2, y: 0 }, level: 1, placedAt: 1 },
    { id: 'cave', definitionId: 'stone_age_study_cave', position: { x: 4, y: 0 }, level: 4, placedAt: 1 },
    ...[0, 2, 4, 6].map((x, idx) => ({
      id: `fp_${idx}`,
      definitionId: 'stone_age_foraging_post',
      position: { x, y: 4 },
      level: 4,
      placedAt: 1,
    })),
    ...[0, 2, 4, 6].map((x, idx) => ({
      id: `gr_${idx}`,
      definitionId: 'stone_age_food_cache',
      position: { x, y: 8 },
      level: 4,
      placedAt: 1,
    })),
  ];
}

test('EraRules: ERA_LEVEL_RULES caps, provisional flags, getEraUpgradeCap & getEffectiveMaxLevel', () => {
  assert.strictEqual(ERA_LEVEL_RULES.STONE_AGE.upgradeCap, 5);
  assert.strictEqual(ERA_LEVEL_RULES.STONE_AGE.provisional, false);
  assert.strictEqual(ERA_LEVEL_RULES.BRONZE_AGE.upgradeCap, 10);
  assert.strictEqual(ERA_LEVEL_RULES.BRONZE_AGE.entryFloor, 4);
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

test('EraRules: getEntryLevel clamps Bronze Age floor [4..10] and safely guards invalid inputs', () => {
  assert.strictEqual(getEntryLevel('STONE_AGE', 1), 1);
  assert.strictEqual(getEntryLevel('BRONZE_AGE', 1), 4);
  assert.strictEqual(getEntryLevel('BRONZE_AGE', 3), 4);
  assert.strictEqual(getEntryLevel('BRONZE_AGE', 4), 4);
  assert.strictEqual(getEntryLevel('BRONZE_AGE', 7), 7);
  assert.strictEqual(getEntryLevel('BRONZE_AGE', 10), 10);
  assert.strictEqual(getEntryLevel('BRONZE_AGE', 15), 10);
  assert.strictEqual(getEntryLevel('BRONZE_AGE', -5), 4);
  assert.strictEqual(getEntryLevel('BRONZE_AGE', Number.NaN), 4);
  assert.strictEqual(getEntryLevel('INVALID_ERA', 3), 3);
});

test('EraRules: STONE_TO_BRONZE_ADVANCE_REQUIREMENTS & evaluateEraAdvance truth table', () => {
  assert.deepStrictEqual(getEraAdvanceRequirements('STONE_AGE'), STONE_TO_BRONZE_ADVANCE_REQUIREMENTS);
  assert.strictEqual(getEraAdvanceRequirements('BRONZE_AGE'), null);
  assert.strictEqual(getEraAdvanceRequirements('BAD'), null);

  const fullBuildings = buildFullStoneAgeFloorSet();
  const baseCoins = 3500;
  const happy = evaluateEraAdvance({
    era: 'STONE_AGE',
    buildings: fullBuildings,
    playerLevel: 12,
    totalFocusMinutes: 1500,
    coins: baseCoins,
  });

  assert.strictEqual(happy.eligible, true);
  assert.strictEqual(happy.nextEra, 'BRONZE_AGE');
  assert.strictEqual(happy.feeCoins, 3500);
  assert.ok(happy.checks.every((c) => c.met));
  // Never mutates coins or building array
  assert.strictEqual(baseCoins, 3500);
  assert.strictEqual(fullBuildings.length, 12);

  // Missing each required building breaks eligibility
  for (const defId of [
    'stone_age_campfire',
    'stone_age_totem',
    'stone_age_elder_hut',
    'stone_age_study_cave',
    'stone_age_foraging_post',
    'stone_age_food_cache',
  ]) {
    const minusOne = fullBuildings.filter((b, idx) => {
      const firstMatch = fullBuildings.findIndex((item) => item.definitionId === defId);
      return idx !== firstMatch;
    });
    const res = evaluateEraAdvance({
      era: 'STONE_AGE',
      buildings: minusOne,
      playerLevel: 12,
      totalFocusMinutes: 1500,
      coins: 3500,
    });
    assert.strictEqual(res.eligible, false, `Should be ineligible when missing ${defId}`);
    const check = res.checks.find((c) => c.id === `building:${defId}`);
    assert.strictEqual(check?.met, false);
  }

  // Cave at Lv.3 (<4) or 1 of 4 Foraging Posts at Lv.3 (<4) fails
  const caveLv3 = fullBuildings.map((b) =>
    b.definitionId === 'stone_age_study_cave' ? { ...b, level: 3 } : b
  );
  assert.strictEqual(
    evaluateEraAdvance({
      era: 'STONE_AGE',
      buildings: caveLv3,
      playerLevel: 12,
      totalFocusMinutes: 1500,
      coins: 3500,
    }).eligible,
    false
  );

  const oneForageLv3 = fullBuildings.map((b) => (b.id === 'fp_3' ? { ...b, level: 3 } : b));
  const forageRes = evaluateEraAdvance({
    era: 'STONE_AGE',
    buildings: oneForageLv3,
    playerLevel: 12,
    totalFocusMinutes: 1500,
    coins: 3500,
  });
  assert.strictEqual(forageRes.eligible, false);
  assert.strictEqual(forageRes.checks.find((c) => c.id === 'building:stone_age_foraging_post')?.current, 3);

  // Level 11 fails
  assert.strictEqual(
    evaluateEraAdvance({
      era: 'STONE_AGE',
      buildings: fullBuildings,
      playerLevel: 11,
      totalFocusMinutes: 1500,
      coins: 3500,
    }).eligible,
    false
  );

  // 1499 minutes fails
  assert.strictEqual(
    evaluateEraAdvance({
      era: 'STONE_AGE',
      buildings: fullBuildings,
      playerLevel: 12,
      totalFocusMinutes: 1499,
      coins: 3500,
    }).eligible,
    false
  );

  // 3499 Coins fails
  assert.strictEqual(
    evaluateEraAdvance({
      era: 'STONE_AGE',
      buildings: fullBuildings,
      playerLevel: 12,
      totalFocusMinutes: 1500,
      coins: 3499,
    }).eligible,
    false
  );

  // Safe on null/undefined/frozen inputs
  assert.strictEqual(evaluateEraAdvance(null).eligible, false);
  assert.strictEqual(evaluateEraAdvance(undefined).eligible, false);
  const frozenBuildings = Object.freeze(buildFullStoneAgeFloorSet().map((b) => Object.freeze(b)));
  assert.strictEqual(
    evaluateEraAdvance({
      era: 'STONE_AGE',
      buildings: frozenBuildings,
      playerLevel: 12,
      totalFocusMinutes: 1500,
      coins: 3500,
    }).eligible,
    true
  );
});
