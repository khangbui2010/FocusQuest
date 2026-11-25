import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  CONSTRUCTION_PLACE_SPEC,
  ConstructionJob,
  EXPAND_JOB_SPEC,
  MAX_ACTIVE_CONSTRUCTION_JOBS,
  advanceJobs,
  assignJobsFifo,
  getCrewSummary,
  getEffectiveTargetLevel,
  getExpandJobAtOrigin,
  getPlaceJobSpec,
  getTotalVillagerCount,
  getUpgradeJobSpec,
  isBuildingUnderConstruction,
  isChunkClearing,
  projectJobs,
} from '../../src/core/civilization/jobs.ts';
import {
  createInitialCivilizationState,
  validateCivilizationState,
} from '../../src/core/civilization/civilizationState.ts';
import { GridMap } from '../../src/core/civilization/gridMap.ts';
import { extractCivilizationCoinBonuses } from '../../src/core/civilization/civilizationBonusHelper.ts';
import { aggregateCoinBonus } from '../../src/core/economy/coinBonus.ts';
import {
  hasFocusStatUnlock,
  STREAK_ANALYSIS_STAT_ID,
} from '../../src/ui/utils/focusStatUnlock.ts';
import { buildFocusSceneModel } from '../../src/ui/utils/focusSceneModel.ts';

function makeJob(overrides: Partial<ConstructionJob> & { id: string; kind: ConstructionJob['kind'] }): ConstructionJob {
  return {
    status: 'PENDING',
    crewRequired: 1,
    totalSeconds: 3600,
    remainingSeconds: 3600,
    paidCoins: 10,
    createdAt: 1000,
    ...overrides,
  };
}

test('Stage A Design Table: getPlaceJobSpec, getUpgradeJobSpec, EXPAND_JOB_SPEC match exact Milestone 5E-1 values', () => {
  assert.deepEqual(getPlaceJobSpec('stone_age_campfire'), { crew: 0, durationSeconds: 0 });
  assert.deepEqual(getPlaceJobSpec('stone_age_totem'), { crew: 1, durationSeconds: 3600 });
  assert.deepEqual(getPlaceJobSpec('stone_age_study_cave'), { crew: 1, durationSeconds: 3600 });
  assert.deepEqual(getPlaceJobSpec('stone_age_foraging_post'), { crew: 1, durationSeconds: 3600 });
  assert.deepEqual(getPlaceJobSpec('stone_age_elder_hut'), { crew: 2, durationSeconds: 7200 });
  assert.deepEqual(getPlaceJobSpec('stone_age_food_cache'), { crew: 2, durationSeconds: 7200 });
  assert.equal(Object.keys(CONSTRUCTION_PLACE_SPEC).length, 6);

  // Upgrade spec: crew = 1 if L <= 2 else 2; duration = 5 * L minutes (seconds)
  assert.deepEqual(getUpgradeJobSpec(1), { crew: 1, durationSeconds: 300 });
  assert.deepEqual(getUpgradeJobSpec(2), { crew: 1, durationSeconds: 600 });
  assert.deepEqual(getUpgradeJobSpec(3), { crew: 2, durationSeconds: 900 });
  assert.deepEqual(getUpgradeJobSpec(4), { crew: 2, durationSeconds: 1200 });

  assert.deepEqual(EXPAND_JOB_SPEC, { crew: 2, durationSeconds: 3600 });
});

test('Stage A Crew Counting & FIFO Scheduler: max 4 ACTIVE, crew ceiling, sequential same-building upgrades', () => {
  assert.equal(getTotalVillagerCount([], null), 0);
  assert.equal(getTotalVillagerCount([], 'elder'), 1);
  assert.equal(
    getTotalVillagerCount([{ role: 'crafter' }], 'elder'),
    2
  );

  // 5 jobs with 1 crew each and 5 available crew -> strictly capped at MAX_ACTIVE_CONSTRUCTION_JOBS = 4
  const fiveJobs: ConstructionJob[] = [1, 2, 3, 4, 5].map((idx) =>
    makeJob({ id: `j${idx}`, kind: 'place', buildingId: `b${idx}`, crewRequired: 1 })
  );
  const resFive = assignJobsFifo(fiveJobs, 5);
  assert.equal(resFive.activeCount, MAX_ACTIVE_CONSTRUCTION_JOBS);
  assert.equal(resFive.busyCrew, 4);
  assert.equal(resFive.freeCrew, 1);
  assert.equal(resFive.jobs[4].status, 'PENDING');

  // Same-building upgrades: L1->L2 and L2->L3 queued simultaneously with plenty of crew -> only L2 ACTIVE!
  const sameBldUpgrades: ConstructionJob[] = [
    makeJob({
      id: 'u2',
      kind: 'upgrade',
      buildingId: 'b_forage',
      targetLevel: 2,
      crewRequired: 1,
      totalSeconds: 300,
      remainingSeconds: 300,
    }),
    makeJob({
      id: 'u3',
      kind: 'upgrade',
      buildingId: 'b_forage',
      targetLevel: 3,
      crewRequired: 1,
      totalSeconds: 600,
      remainingSeconds: 600,
    }),
  ];
  const assignedUp = assignJobsFifo(sameBldUpgrades, 4);
  assert.equal(assignedUp.jobs[0].status, 'ACTIVE');
  assert.equal(assignedUp.jobs[1].status, 'PENDING');

  const summary = getCrewSummary(
    assignedUp.jobs,
    [
      { role: 'elder' },
      { role: 'crafter' },
    ],
    'woodworker'
  );
  assert.equal(summary.totalCrew, 3);
  assert.equal(summary.busyCrew, 1);
  assert.equal(summary.freeCrew, 2);
  assert.equal(summary.activeCount, 1);
  assert.equal(summary.pendingCount, 1);
});

test('Stage A Continuous Event-Step Simulation: carries leftover seconds into newly promoted PENDING jobs & keeps projectJobs pure', () => {
  const base = createInitialCivilizationState();
  const gm = GridMap.fromSnapshot(base.grid);
  gm.placeBuilding('b1', { x: 0, y: 0 }, { width: 2, height: 2 });
  gm.placeBuilding('b2', { x: 2, y: 0 }, { width: 2, height: 2 });

  const stateWithJobs = {
    ...base,
    grid: gm.toSnapshot(),
    founderRole: 'woodworker' as const, // 1 crew total
    buildings: [
      { id: 'b1', definitionId: 'stone_age_foraging_post', position: { x: 0, y: 0 }, level: 1, placedAt: 10 },
      { id: 'b2', definitionId: 'stone_age_foraging_post', position: { x: 2, y: 0 }, level: 1, placedAt: 20 },
    ],
    jobs: [
      makeJob({
        id: 'j_place_b1',
        kind: 'place',
        status: 'ACTIVE',
        buildingId: 'b1',
        definitionId: 'stone_age_foraging_post',
        crewRequired: 1,
        totalSeconds: 3600,
        remainingSeconds: 600,
      }),
      makeJob({
        id: 'j_up_b1_2',
        kind: 'upgrade',
        status: 'PENDING',
        buildingId: 'b1',
        definitionId: 'stone_age_foraging_post',
        targetLevel: 2,
        crewRequired: 1,
        totalSeconds: 300,
        remainingSeconds: 300,
      }),
      makeJob({
        id: 'j_place_b2',
        kind: 'place',
        status: 'PENDING',
        buildingId: 'b2',
        definitionId: 'stone_age_foraging_post',
        crewRequired: 1,
        totalSeconds: 3600,
        remainingSeconds: 3600,
      }),
    ],
  };

  // Building helpers while under construction
  assert.equal(isBuildingUnderConstruction('b1', stateWithJobs.jobs), true);
  assert.equal(getEffectiveTargetLevel(stateWithJobs.buildings[0], stateWithJobs.jobs), 2);
  assert.equal(
    aggregateCoinBonus(
      extractCivilizationCoinBonuses(
        stateWithJobs.buildings,
        stateWithJobs.villagers,
        stateWithJobs.jobs,
        stateWithJobs.founderRole
      )
    ),
    0
  );

  // projectJobs(1000s): 600s finishes b1 place -> promotes b1 L1->L2 (300s) -> 400s left finishes b1 L1->L2 (300s)
  // -> promotes b2 place (3600s) -> remaining 100s applies to b2 (leaving 3500s)!
  const snapshotBefore = JSON.stringify(stateWithJobs);
  const projected = projectJobs(stateWithJobs, 1000);
  assert.equal(JSON.stringify(stateWithJobs), snapshotBefore, 'projectJobs must not mutate input');

  assert.equal(isBuildingUnderConstruction('b1', projected.jobs), false);
  assert.equal(projected.buildings.find((b) => b.id === 'b1')?.level, 2);
  assert.equal(projected.jobs?.length, 1);
  assert.equal(projected.jobs?.[0].id, 'j_place_b2');
  assert.equal(projected.jobs?.[0].status, 'ACTIVE');
  assert.equal(projected.jobs?.[0].remainingSeconds, 3500);

  // Now b1 is active at Lv.2 (+4% coin bonus), while b2 is still under construction (0%)
  assert.ok(
    Math.abs(
      aggregateCoinBonus(
        extractCivilizationCoinBonuses(
          projected.buildings,
          projected.villagers,
          projected.jobs,
          projected.founderRole
        )
      ) - 0.04
    ) < 1e-9
  );
});

test('Stage A Effects & Validation: expand chunk unlocks on completion, focusStatUnlock & focusSceneModel ignore under-construction buildings', () => {
  const base = createInitialCivilizationState();
  const gm = GridMap.fromSnapshot(base.grid);
  gm.placeBuilding('elder_hut_1', { x: 0, y: 0 }, { width: 2, height: 2 });
  gm.placeBuilding('cave_active', { x: 4, y: 0 }, { width: 3, height: 3 });

  const clearingOrigin = { x: 8, y: 0 };
  const civ = {
    ...base,
    grid: gm.toSnapshot(),
    founderRole: 'woodworker' as const,
    villagers: [
      { id: 'v1', role: 'elder' as const, recruitedAt: 10 },
      { id: 'v2', role: 'crafter' as const, recruitedAt: 11 },
    ], // 3 crew total
    buildings: [
      { id: 'elder_hut_1', definitionId: 'stone_age_elder_hut', position: { x: 0, y: 0 }, level: 1, placedAt: 10 },
      { id: 'cave_active', definitionId: 'stone_age_study_cave', position: { x: 4, y: 0 }, level: 1, placedAt: 10 },
    ],
    jobs: [
      makeJob({
        id: 'j_elder_hut',
        kind: 'place',
        status: 'ACTIVE',
        buildingId: 'elder_hut_1',
        definitionId: 'stone_age_elder_hut',
        crewRequired: 2,
        totalSeconds: 7200,
        remainingSeconds: 1800,
      }),
      makeJob({
        id: 'j_expand',
        kind: 'expand',
        status: 'PENDING', // 1 crew left after elder_hut (total 3), so expand (needs 2) is PENDING!
        origin: clearingOrigin,
        purchaseIndex: 1,
        crewRequired: 2,
        totalSeconds: 3600,
        remainingSeconds: 3600,
      }),
    ],
  };

  // Validate state invariants pass
  const validation = validateCivilizationState(civ);
  assert.equal(validation.isValid, true, validation.errors.join('; '));

  // Under construction Elder's Hut must NOT unlock Streak Analysis; only active Cave is in FocusSceneModel
  assert.equal(hasFocusStatUnlock(civ.buildings, STREAK_ANALYSIS_STAT_ID, civ.jobs), false);
  const sceneWhileBuilding = buildFocusSceneModel(civ);
  assert.equal(sceneWhileBuilding.buildings.length, 1);
  assert.equal(sceneWhileBuilding.buildings[0].definitionId, 'stone_age_study_cave');

  // Clearing chunk is still locked in GridMap
  assert.equal(isChunkClearing(clearingOrigin, civ.jobs), true);
  assert.equal(getExpandJobAtOrigin(clearingOrigin, civ.jobs)?.id, 'j_expand');
  assert.equal(GridMap.fromSnapshot(civ.grid).isCellUnlocked(8, 0), false);

  // Advance 1800s -> Elder's Hut completes, unlocking Streak Analysis & freeing crew so expand promotes to ACTIVE (3600s)
  const mid = advanceJobs(civ, 1800);
  assert.equal(hasFocusStatUnlock(mid.buildings, STREAK_ANALYSIS_STAT_ID, mid.jobs), true);
  assert.equal(buildFocusSceneModel(mid).buildings.length, 2);
  assert.equal(mid.jobs?.length, 1);
  assert.equal(mid.jobs?.[0].status, 'ACTIVE');
  assert.equal(GridMap.fromSnapshot(mid.grid).isCellUnlocked(8, 0), false);

  // Advance another 3600s -> Expand completes and unlocks chunk (8,0)
  const done = advanceJobs(mid, 3600);
  assert.equal(done.jobs?.length, 0);
  assert.equal(isChunkClearing(clearingOrigin, done.jobs), false);
  assert.equal(GridMap.fromSnapshot(done.grid).isCellUnlocked(8, 0), true);
});
