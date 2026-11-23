import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  GridMap,
  getBuildingDefinition,
  createInitialCivilizationState,
  validateCivilizationState,
  VILLAGE_CAVE_DEFINITION_ID,
  MAX_VILLAGE_CAVES,
  VILLAGER_BASE_RECRUIT_COST,
  VILLAGER_RECRUIT_COST_RATIO,
  VILLAGER_CAPACITY_PER_CAVE_LEVEL,
  findVillageCave,
  getVillagerCapacity,
  getVillagerRecruitCost,
  evaluateRecruitment,
  applyRecruitment,
  getVillagerIdleSpots,
  getBuildingPlacementLimit,
  isBuildingDefinitionUpgradeable,
  Villager,
} from '../../src/core/civilization/index.ts';
import { extractBuildingCoinBonuses } from '../../src/core/civilization/civilizationBonusHelper.ts';
import { aggregateCoinBonus } from '../../src/core/economy/coinBonus.ts';
import { BuildingInstance } from '../../src/core/civilization/buildingTypes.ts';

function makeCave(level = 1, x = 2, y = 2): BuildingInstance {
  return {
    id: 'cave-1',
    definitionId: VILLAGE_CAVE_DEFINITION_ID,
    position: { x, y },
    level,
    placedAt: 1_700_000_000_000,
  };
}

test('Cave Catalog & Upgrade Metadata (V2): 3x3 footprint, 1-Cave cap, upgradeable Lv1..5', () => {
  const caveDef = getBuildingDefinition(VILLAGE_CAVE_DEFINITION_ID)!;
  assert.ok(caveDef);
  assert.deepEqual(caveDef.footprint, { width: 3, height: 3 });
  assert.equal(caveDef.maxLevel, 5);
  assert.equal(MAX_VILLAGE_CAVES, 1);
  assert.equal(getBuildingPlacementLimit(caveDef), 1);
  assert.equal(isBuildingDefinitionUpgradeable(caveDef), true);

  // Elder Hut remains fixed-effect and non-upgradeable
  const elderDef = getBuildingDefinition('stone_age_elder_hut')!;
  assert.equal(isBuildingDefinitionUpgradeable(elderDef), false);
});

test('Villager Capacity & Recruit Cost Curves (V2): exact Lv1..5 capacities and exponential rounded costs 0..9', () => {
  assert.equal(VILLAGER_CAPACITY_PER_CAVE_LEVEL, 2);
  assert.equal(VILLAGER_BASE_RECRUIT_COST, 40);
  assert.equal(VILLAGER_RECRUIT_COST_RATIO, 1.35);

  assert.equal(getVillagerCapacity(undefined), 0);
  assert.equal(getVillagerCapacity(null), 0);
  assert.equal(getVillagerCapacity({ level: 0 }), 0);

  for (let lv = 1; lv <= 5; lv++) {
    assert.equal(getVillagerCapacity({ level: lv }), lv * 2);
  }

  const expectedCosts = [40, 54, 73, 98, 133, 179, 242, 327, 441, 596];
  expectedCosts.forEach((expectedCost, idx) => {
    assert.equal(getVillagerRecruitCost(idx), expectedCost, `Mismatch at count=${idx}`);
  });
});

test('evaluateRecruitment & applyRecruitment (V2): enforces role, cave, capacity, coins cleanly without mutating inputs', () => {
  const emptyList: readonly Villager[] = [];
  const caveLv1 = makeCave(1);

  // 1. Invalid role
  const badRole = evaluateRecruitment({
    caveBuilding: caveLv1,
    villagers: emptyList,
    playerCoins: 500,
    role: 'warrior',
  });
  assert.equal(badRole.canRecruit, false);
  assert.equal(badRole.reason, 'CIV_INVALID_VILLAGER_ROLE');

  // 2. Missing cave
  const noCave = evaluateRecruitment({
    caveBuilding: undefined,
    villagers: emptyList,
    playerCoins: 500,
    role: 'elder',
  });
  assert.equal(noCave.canRecruit, false);
  assert.equal(noCave.reason, 'CIV_NO_VILLAGE_CAVE');
  assert.equal(noCave.capacity, 0);

  // 3. Insufficient coins
  const lowCoins = evaluateRecruitment({
    caveBuilding: caveLv1,
    villagers: emptyList,
    playerCoins: 39,
    role: 'crafter',
  });
  assert.equal(lowCoins.canRecruit, false);
  assert.equal(lowCoins.reason, 'CIV_VILLAGER_INSUFFICIENT_COINS');
  assert.equal(lowCoins.cost, 40);
  assert.equal(lowCoins.shortfallCoins, 1);

  // 4. Valid first recruitment -> cost 40
  const ok1 = evaluateRecruitment({
    caveBuilding: caveLv1,
    villagers: emptyList,
    playerCoins: 40,
    role: 'elder',
  });
  assert.equal(ok1.canRecruit, true);
  assert.equal(ok1.cost, 40);

  const v1: Villager = { id: 'vil-1', role: 'elder', recruitedAt: 100 };
  const after1 = applyRecruitment(emptyList, v1);
  assert.equal(emptyList.length, 0);
  assert.deepEqual(after1, [v1]);

  // 5. Capacity reached at Lv.1 (max 2)
  const v2: Villager = { id: 'vil-2', role: 'woodworker', recruitedAt: 200 };
  const fullLv1 = applyRecruitment(after1, v2);
  const fullEval = evaluateRecruitment({
    caveBuilding: caveLv1,
    villagers: fullLv1,
    playerCoins: 999,
    role: 'crafter',
  });
  assert.equal(fullEval.canRecruit, false);
  assert.equal(fullEval.reason, 'CIV_VILLAGER_CAPACITY_REACHED');
  assert.equal(fullEval.currentCount, 2);
  assert.equal(fullEval.capacity, 2);

  // 6. Upgrading Cave to Lv.2 unlocks capacity 4; 3rd recruit costs 73
  const okAfterUpgrade = evaluateRecruitment({
    caveBuilding: makeCave(2),
    villagers: fullLv1,
    playerCoins: 73,
    role: 'crafter',
  });
  assert.equal(okAfterUpgrade.canRecruit, true);
  assert.equal(okAfterUpgrade.cost, 73);
  assert.equal(okAfterUpgrade.capacity, 4);
});

test('getVillagerIdleSpots (V2): deterministic sorting, non-mutation, zero building/locked collisions, handles 10 villagers & overflow', () => {
  const map = new GridMap();
  const cave = makeCave(5, 2, 2); // Occupies (2..4, 2..4); entrance bottom-center is (3,4)
  assert.equal(map.placeBuilding(cave.id, cave.position, { width: 3, height: 3 }).success, true);

  // Block immediate spot south of entrance (3,5) with a campfire
  assert.equal(map.placeBuilding('camp-block', { x: 3, y: 5 }, { width: 1, height: 1 }).success, true);

  // Supply unsorted input array to verify pure sort by (recruitedAt, id) without mutating input
  const villagersUnsorted: Villager[] = [
    { id: 'v_b', role: 'crafter', recruitedAt: 200 },
    { id: 'v_z', role: 'elder', recruitedAt: 100 },
    { id: 'v_a', role: 'woodworker', recruitedAt: 100 },
    { id: 'v_4', role: 'elder', recruitedAt: 300 },
    { id: 'v_5', role: 'crafter', recruitedAt: 400 },
    { id: 'v_6', role: 'woodworker', recruitedAt: 500 },
    { id: 'v_7', role: 'elder', recruitedAt: 600 },
    { id: 'v_8', role: 'crafter', recruitedAt: 700 },
    { id: 'v_9', role: 'woodworker', recruitedAt: 800 },
    { id: 'v_10', role: 'elder', recruitedAt: 900 },
  ];
  const snapshotBefore = villagersUnsorted.map((v) => v.id);

  const spots = getVillagerIdleSpots(villagersUnsorted, cave, map);
  assert.deepEqual(
    villagersUnsorted.map((v) => v.id),
    snapshotBefore,
    'Input villagers array must not be mutated'
  );

  // Order must match sorted (recruitedAt, id): v_a, v_z, v_b, ...
  assert.equal(spots.length, 10);
  assert.equal(spots[0].villagerId, 'v_a');
  assert.equal(spots[1].villagerId, 'v_z');
  assert.equal(spots[2].villagerId, 'v_b');

  // Every spot must be unlocked, unoccupied by any building, and unique
  const seenCoords = new Set<string>();
  for (const spot of spots) {
    assert.equal(map.isCellUnlocked(spot.coordinate.x, spot.coordinate.y), true);
    assert.equal(map.getOccupyingBuilding(spot.coordinate.x, spot.coordinate.y), undefined);
    const key = `${spot.coordinate.x},${spot.coordinate.y}`;
    assert.equal(seenCoords.has(key), false, `Duplicate spot coordinate ${key}`);
    seenCoords.add(key);
  }
  assert.equal(seenCoords.has('3,5'), false, 'Blocked campfire cell (3,5) must never be used');

  // Determinism across repeated runs
  assert.deepEqual(getVillagerIdleSpots(villagersUnsorted, cave, map), spots);

  // Tiny island corner with zero free cells: overflow skips invalid positions instead of fabricating
  const tightMap = new GridMap();
  const tightCave = makeCave(5, 0, 0);
  tightMap.placeBuilding(tightCave.id, tightCave.position, { width: 3, height: 3 });
  // Fill every remaining cell of 8x8 initial map (64 - 9 = 55 cells) with campfires
  let blockerCount = 0;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      if (tightMap.getOccupyingBuilding(x, y) === undefined) {
        tightMap.placeBuilding(`blk-${blockerCount++}`, { x, y }, { width: 1, height: 1 });
      }
    }
  }
  assert.deepEqual(getVillagerIdleSpots(villagersUnsorted, tightCave, tightMap), []);
  assert.deepEqual(getVillagerIdleSpots(villagersUnsorted, undefined, map), []);
});

test('validateCivilizationState (V2): validates villager invariants & Cave bonus purity', () => {
  const base = createInitialCivilizationState();
  assert.deepEqual(base.villagers, []);

  // Valid state with Cave Lv.1 & 2 villagers
  const map = new GridMap();
  const cave = makeCave(1, 2, 2);
  map.placeBuilding(cave.id, cave.position, { width: 3, height: 3 });

  const validState = {
    ...base,
    grid: map.toSnapshot(),
    buildings: [cave],
    villagers: [
      { id: 'v1', role: 'elder' as const, recruitedAt: 10 },
      { id: 'v2', role: 'crafter' as const, recruitedAt: 20 },
    ],
  };
  assert.equal(validateCivilizationState(validState).isValid, true);
  assert.ok(findVillageCave(validState.buildings));

  // Cave & villagers must grant ZERO CoinBonus multiplier or passive income
  assert.equal(aggregateCoinBonus(extractBuildingCoinBonuses(validState.buildings)), 0);

  // Exceeding Cave Lv.1 capacity (3 > 2) must fail validation
  const overCapacity = {
    ...validState,
    villagers: [
      ...validState.villagers,
      { id: 'v3', role: 'woodworker' as const, recruitedAt: 30 },
    ],
  };
  assert.equal(validateCivilizationState(overCapacity).isValid, false);

  // Villagers without a Cave must fail validation
  const orphanVillagers = {
    ...base,
    villagers: [{ id: 'v1', role: 'elder' as const, recruitedAt: 10 }],
  };
  assert.equal(validateCivilizationState(orphanVillagers).isValid, false);

  // Duplicate villager IDs must fail validation
  const dupVillagers = {
    ...validState,
    villagers: [
      { id: 'v1', role: 'elder' as const, recruitedAt: 10 },
      { id: 'v1', role: 'crafter' as const, recruitedAt: 20 },
    ],
  };
  assert.equal(validateCivilizationState(dupVillagers).isValid, false);

  // Non-empty non-existent fields / negative recruitedAt fail validation
  const badRole = {
    ...validState,
    villagers: [{ id: 'v1', role: 'wizard' as unknown as 'elder', recruitedAt: 10 }],
  };
  assert.equal(validateCivilizationState(badRole).isValid, false);
});
