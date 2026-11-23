import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  MAX_SCENE_VILLAGERS,
  SCENE_BUILDING_SLOTS,
  SCENE_STAGE_WIDTH_PX,
  SCENE_WALK_MIN_X,
  SCENE_WALK_MAX_X,
  buildFocusSceneModel,
  getSceneVillagerRoute,
} from '../../src/ui/utils/focusSceneModel.ts';
import { CivilizationState } from '../../src/core/civilization/civilizationState.ts';
import { STONE_AGE_SPRITE_DATA } from '../../src/ui/components/civilization/spriteData.ts';

function makeBuilding(id: string, definitionId: string, level = 1) {
  return {
    id,
    definitionId,
    position: { x: 0, y: 0 },
    level,
    placedAt: 1_700_000_000_000,
  };
}

function makeVillager(id: string, role: 'elder' | 'crafter' | 'woodworker', recruitedAt: number) {
  return { id, role, recruitedAt };
}

test('focusSceneModel (V4): guards null, undefined, and malformed states into safe empty model', () => {
  for (const input of [undefined, null, {} as Partial<CivilizationState>, { buildings: null as unknown as [], villagers: 'bad' as unknown as [] }]) {
    const model = buildFocusSceneModel(input);
    assert.equal(model.buildings.length, 0);
    assert.equal(model.villagers.length, 0);
    assert.equal(model.hasCampfire, false);
    assert.equal(model.hasCave, false);
    assert.equal(model.hasElder, false);
    assert.equal(model.isEmpty, true);
  }
});

test('focusSceneModel (V4): deduplicates repeated definitionIds to 1 sprite and keeps Cave 48x48 with non-overlapping slots', () => {
  const allSixPlusDuplicates: Partial<CivilizationState> = {
    era: 'STONE_AGE',
    buildings: [
      makeBuilding('b1', 'stone_age_campfire'),
      makeBuilding('b2', 'stone_age_study_cave'),
      makeBuilding('b3', 'stone_age_elder_hut'),
      makeBuilding('b4', 'stone_age_totem'),
      makeBuilding('b5', 'stone_age_foraging_post'),
      makeBuilding('b6', 'stone_age_foraging_post'),
      makeBuilding('b7', 'stone_age_foraging_post'),
      makeBuilding('b8', 'stone_age_food_cache'),
      makeBuilding('b9', 'stone_age_totem'),
      makeBuilding('b10', 'unknown_future_building'),
    ],
    villagers: [],
  };

  const model = buildFocusSceneModel(allSixPlusDuplicates);
  assert.equal(model.isEmpty, false);
  assert.equal(model.buildings.length, 6, 'Each built definitionId renders at most 1 sprite');
  assert.equal(model.hasCampfire, true);
  assert.equal(model.hasCave, true);

  const foraging = model.buildings.find((b) => b.definitionId === 'stone_age_foraging_post');
  assert.ok(foraging);
  assert.equal(foraging.count, 3);

  const cave = model.buildings.find((b) => b.definitionId === 'stone_age_study_cave');
  assert.ok(cave);
  assert.equal(cave.width, 48);
  assert.equal(cave.height, 48);

  // Verify every slot fits cleanly inside 336px stage and horizontal bands never overlap
  const sortedByX = [...Object.values(SCENE_BUILDING_SLOTS)].sort((a, b) => a.leftPx - b.leftPx);
  for (let i = 0; i < sortedByX.length; i++) {
    const curr = sortedByX[i];
    assert.ok(STONE_AGE_SPRITE_DATA[curr.definitionId], `Sprite missing for ${curr.definitionId}`);
    assert.ok(curr.leftPx >= 0 && curr.leftPx + curr.width <= SCENE_STAGE_WIDTH_PX);
    if (i > 0) {
      const prev = sortedByX[i - 1];
      assert.ok(
        curr.leftPx >= prev.leftPx + prev.width,
        `Slot ${curr.definitionId} overlaps ${prev.definitionId}: ${prev.leftPx + prev.width} > ${curr.leftPx}`
      );
    }
  }
});

test('focusSceneModel (V4): sorts villagers by (recruitedAt, id) without mutating input and caps display at 6', () => {
  const inputVillagers = [
    makeVillager('v-10', 'woodworker', 100),
    makeVillager('v-02', 'crafter', 20),
    makeVillager('v-01-b', 'elder', 10),
    makeVillager('v-01-a', 'elder', 10),
    makeVillager('v-05', 'woodworker', 50),
    makeVillager('v-06', 'crafter', 60),
    makeVillager('v-07', 'woodworker', 70),
    makeVillager('v-08', 'crafter', 80),
  ];
  const snapshotOrder = inputVillagers.map((v) => v.id);

  const model = buildFocusSceneModel({
    buildings: [makeBuilding('c1', 'stone_age_study_cave')],
    villagers: inputVillagers,
  });

  assert.deepStrictEqual(inputVillagers.map((v) => v.id), snapshotOrder, 'Input villagers array must not be mutated');
  assert.equal(model.villagers.length, MAX_SCENE_VILLAGERS);
  assert.deepStrictEqual(
    model.villagers.map((v) => v.id),
    ['v-01-a', 'v-01-b', 'v-02', 'v-05', 'v-06', 'v-07']
  );
  assert.equal(model.hasElder, true);
});

test('getSceneVillagerRoute (V4): deterministic routes, tools only when standing in working, zZ only on elder in resting, paused stays stationary', () => {
  const model = buildFocusSceneModel({
    buildings: [
      makeBuilding('b1', 'stone_age_study_cave'),
      makeBuilding('b2', 'stone_age_campfire'),
    ],
    villagers: [
      makeVillager('vil-elder', 'elder', 1),
      makeVillager('vil-crafter', 'crafter', 2),
      makeVillager('vil-wood', 'woodworker', 3),
    ],
  });

  const [elder, crafter, woodworker] = model.villagers;

  // 1. Determinism & tick 0 working: standing idle so crafter (#117) & woodworker (#119) hold tools; elder never holds tool
  const pElder0 = getSceneVillagerRoute(elder, model, 'working', 0);
  const pCrafter0 = getSceneVillagerRoute(crafter, model, 'working', 0);
  const pWood0 = getSceneVillagerRoute(woodworker, model, 'working', 0);

  assert.deepStrictEqual(pCrafter0, getSceneVillagerRoute(crafter, model, 'working', 0));
  assert.equal(pElder0.showTool, false);
  assert.equal(pCrafter0.showTool, true);
  assert.equal(pCrafter0.toolTileIndex, 117);
  assert.equal(pWood0.showTool, true);
  assert.equal(pWood0.toolTileIndex, 119);
  assert.equal(pElder0.showRestZzz, false);

  // 2. Over ticks 0..16 in working, villagers walk left/right smoothly inside clearing bounds and alternate standing/walking
  const animationsSeen = new Set<string>();
  for (let tick = 0; tick <= 16; tick++) {
    for (const v of model.villagers) {
      const pose = getSceneVillagerRoute(v, model, 'working', tick);
      assert.ok(pose.xPx >= SCENE_WALK_MIN_X && pose.xPx <= SCENE_WALK_MAX_X);
      animationsSeen.add(pose.animation);
      if (pose.isMoving) {
        assert.equal(pose.showTool, false, 'Tools hide while villager is walking');
      }
    }
  }
  assert.ok(animationsSeen.has('idle'));
  assert.ok(animationsSeen.has('walk_left') || animationsSeen.has('walk_right'));

  // 3. Paused: strictly stationary, idle, zero tools, zero zZ
  const pPaused0 = getSceneVillagerRoute(crafter, model, 'paused', 0);
  const pPaused5 = getSceneVillagerRoute(crafter, model, 'paused', 5);
  assert.deepStrictEqual(pPaused0, pPaused5);
  assert.equal(pPaused5.isMoving, false);
  assert.equal(pPaused5.animation, 'idle');
  assert.equal(pPaused5.showTool, false);
  assert.equal(pPaused5.showRestZzz, false);

  // 4. Resting: elder shows zZ; crafter/woodworker hide tools and gather near campfire
  const campfireCenter = SCENE_BUILDING_SLOTS.stone_age_campfire.leftPx;
  const rElder = getSceneVillagerRoute(elder, model, 'resting', 0);
  const rCrafter = getSceneVillagerRoute(crafter, model, 'resting', 0);
  assert.equal(rElder.showRestZzz, true);
  assert.equal(rCrafter.showRestZzz, false);
  assert.equal(rCrafter.showTool, false);
  assert.ok(Math.abs(rCrafter.xPx - campfireCenter) <= 72, 'Villager should gather near campfire while resting');

  // 5. Resting without campfire falls back to Cave entrance gathering
  const caveOnlyModel = buildFocusSceneModel({
    buildings: [makeBuilding('b1', 'stone_age_study_cave')],
    villagers: [makeVillager('vil-wood', 'woodworker', 3)],
  });
  const caveGather = getSceneVillagerRoute(caveOnlyModel.villagers[0], caveOnlyModel, 'resting', 0);
  assert.ok(
    Math.abs(caveGather.xPx - SCENE_BUILDING_SLOTS.stone_age_study_cave.leftPx) <= 80,
    'When campfire is absent, resting villagers gather near Cave entrance'
  );
  assert.equal(caveGather.showRestZzz, false, 'Woodworker must not show zZ');
});

test('focusSceneModel (V4): source is strictly pure (zero Math.random, zero Date.now)', () => {
  const filePath = path.resolve(import.meta.dirname, '../../src/ui/utils/focusSceneModel.ts');
  const source = fs.readFileSync(filePath, 'utf8');
  assert.equal(source.includes('Math.random'), false);
  assert.equal(source.includes('Date.now'), false);
});
