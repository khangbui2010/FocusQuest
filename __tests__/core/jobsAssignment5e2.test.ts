import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialCivilizationState } from '../../src/core/civilization/civilizationState.ts';
import { GridMap } from '../../src/core/civilization/gridMap.ts';
import {
  ConstructionJob,
  advanceJobs,
  assignJobsFifo,
  assignJobsWithSchedule,
  assignVillagersToActiveJobs,
  projectJobs,
  validateSessionJobAssignment,
} from '../../src/core/civilization/jobs.ts';
import { Villager } from '../../src/core/civilization/villager.ts';

function makePlaceJob(id: string, crewRequired = 1, remainingSeconds = 3600): ConstructionJob {
  return {
    id,
    kind: 'place',
    status: 'PENDING',
    definitionId: 'stone_age_foraging_post',
    buildingId: `b_${id}`,
    crewRequired,
    totalSeconds: 3600,
    remainingSeconds,
    paidCoins: 15,
    createdAt: 100,
  };
}

function makeUpgradeJob(
  id: string,
  buildingId: string,
  targetLevel: number,
  crewRequired = 1,
  remainingSeconds = 600
): ConstructionJob {
  return {
    id,
    kind: 'upgrade',
    status: 'PENDING',
    definitionId: 'stone_age_study_cave',
    buildingId,
    targetLevel,
    crewRequired,
    totalSeconds: remainingSeconds,
    remainingSeconds,
    paidCoins: 21,
    createdAt: 100 + targetLevel,
  };
}

function makeExpandJob(id: string, originX = 8, originY = 0, remainingSeconds = 3600): ConstructionJob {
  return {
    id,
    kind: 'expand',
    status: 'PENDING',
    origin: { x: originX, y: originY },
    purchaseIndex: 1,
    crewRequired: 2,
    totalSeconds: 3600,
    remainingSeconds,
    paidCoins: 30,
    createdAt: 200,
  };
}

test('5E-2 Core Schedule: assignJobsWithSchedule defaults to FIFO when options omitted', () => {
  const jobs = [
    makePlaceJob('j1', 1),
    makePlaceJob('j2', 2),
    makePlaceJob('j3', 1),
  ];
  const fifo = assignJobsFifo(jobs, 2);
  const schedDefault = assignJobsWithSchedule(jobs, 2);
  const schedUndefined = assignJobsWithSchedule(jobs, 2, { priorityJobIds: undefined, autoContinue: true });

  assert.deepStrictEqual(schedDefault, fifo);
  assert.deepStrictEqual(schedUndefined, fifo);
});

test('5E-2 Core Schedule: priorityJobIds prioritizes selected jobs first and honors autoContinue true/false', () => {
  const jobs = [
    makePlaceJob('j1', 1, 1800),
    makePlaceJob('j2', 1, 1800),
    makePlaceJob('j3', 1, 1800),
    makePlaceJob('j4', 1, 1800),
    makePlaceJob('j5', 1, 1800),
  ];

  // User picks j4 & j2 with totalCrew=3 and autoContinue=true -> j4, j2, plus FIFO backfill j1
  const resAuto = assignJobsWithSchedule(jobs, 3, {
    priorityJobIds: ['j4', 'j2'],
    autoContinue: true,
  });
  assert.deepStrictEqual(
    resAuto.jobs.filter((j) => j.status === 'ACTIVE').map((j) => j.id),
    ['j1', 'j2', 'j4']
  );
  assert.strictEqual(resAuto.busyCrew, 3);

  // User picks j4 & j2 with autoContinue=false -> ONLY j4 & j2 are ACTIVE; j1 stays PENDING
  const resManualOnly = assignJobsWithSchedule(jobs, 3, {
    priorityJobIds: ['j4', 'j2'],
    autoContinue: false,
  });
  assert.deepStrictEqual(
    resManualOnly.jobs.filter((j) => j.status === 'ACTIVE').map((j) => j.id),
    ['j2', 'j4']
  );
  assert.strictEqual(resManualOnly.busyCrew, 2);
  assert.strictEqual(resManualOnly.freeCrew, 1);

  // Explicit empty selection [] with autoContinue=false leaves all jobs PENDING (0 ACTIVE)
  const resPauseAll = assignJobsWithSchedule(jobs, 3, {
    priorityJobIds: [],
    autoContinue: false,
  });
  assert.strictEqual(resPauseAll.activeCount, 0);
  assert.strictEqual(resPauseAll.busyCrew, 0);
});

test('5E-2 Core Schedule: safely skips missing/cancelled IDs, enforces max 4 jobs & sequential upgrades', () => {
  const jobs = [
    makeUpgradeJob('up_2', 'b_cave', 2, 1, 300),
    makeUpgradeJob('up_3', 'b_cave', 3, 2, 600),
    makePlaceJob('p1', 1, 3600),
    makePlaceJob('p2', 1, 3600),
    makePlaceJob('p3', 1, 3600),
    makePlaceJob('p4', 1, 3600),
  ];

  // Missing 'deleted_job' skipped; up_3 blocked while up_2 exists; max 4 active slots enforced
  const res = assignJobsWithSchedule(jobs, 10, {
    priorityJobIds: ['deleted_job', 'up_3', 'up_2', 'p1', 'p2', 'p3', 'p4'],
    autoContinue: false,
  });
  assert.deepStrictEqual(
    res.jobs.filter((j) => j.status === 'ACTIVE').map((j) => j.id),
    ['up_2', 'p1', 'p2', 'p3']
  );
  assert.strictEqual(res.activeCount, 4);
});

test('5E-2 Core Advance/Project: manual priority executes in exact order and chained upgrade activates upon lower completion', () => {
  const init = createInitialCivilizationState();
  const grid = GridMap.fromSnapshot(init.grid);
  grid.placeBuilding('b_cave', { x: 0, y: 0 }, { width: 3, height: 3 });
  grid.placeBuilding('b_f1', { x: 3, y: 0 }, { width: 2, height: 2 });

  const state = {
    ...init,
    grid: grid.toSnapshot(),
    founderRole: 'crafter' as const, // 1 crew total
    buildings: [
      { id: 'b_cave', definitionId: 'stone_age_study_cave', position: { x: 0, y: 0 }, level: 1, placedAt: 10 },
      { id: 'b_f1', definitionId: 'stone_age_foraging_post', position: { x: 3, y: 0 }, level: 1, placedAt: 10 },
    ],
    jobs: [
      makePlaceJob('j_place', 1, 3600),
      makeUpgradeJob('j_up2', 'b_cave', 2, 1, 300),
      makeUpgradeJob('j_up3', 'b_cave', 3, 1, 600),
    ],
  };

  // Prioritize j_up2 with autoContinue=true and run 900s -> finishes j_up2 (300s) then FIFO backfill advances j_place (600s -> 3000s)!
  const optsAuto = { priorityJobIds: ['j_up2'], autoContinue: true };
  const projected = projectJobs(state, 900, optsAuto);
  const advanced = advanceJobs(state, 900, optsAuto);

  assert.deepStrictEqual(projected, advanced, 'projectJobs and advanceJobs must match identically');
  assert.strictEqual(advanced.buildings.find((b) => b.id === 'b_cave')?.level, 2);
  assert.deepStrictEqual(
    advanced.jobs?.map((j) => [j.id, j.remainingSeconds]),
    [
      ['j_place', 3000],
      ['j_up3', 600],
    ]
  );

  // If j_place is ahead-of/equal, prioritizing ['j_up2'] while j_up3 is next FIFO slot activates chained Lv.3 immediately
  const chainedState = {
    ...state,
    jobs: [
      makeUpgradeJob('j_up2', 'b_cave', 2, 1, 300),
      makeUpgradeJob('j_up3', 'b_cave', 3, 1, 600),
      makePlaceJob('j_place', 1, 3600),
    ],
  };
  const chainedDone = advanceJobs(chainedState, 900, { priorityJobIds: ['j_up2'], autoContinue: true });
  assert.strictEqual(chainedDone.buildings.find((b) => b.id === 'b_cave')?.level, 3);
  assert.deepStrictEqual(chainedDone.jobs?.map((j) => j.id), ['j_place']);

  // With autoContinue=false & priorityJobIds=['j_up2'], 900s finishes j_up2 (300s) and STOPS without touching j_up3 or j_place
  const optsStop = { priorityJobIds: ['j_up2'], autoContinue: false };
  const manualStopped = advanceJobs(state, 900, optsStop);
  assert.strictEqual(manualStopped.buildings.find((b) => b.id === 'b_cave')?.level, 2);
  assert.deepStrictEqual(
    manualStopped.jobs?.map((j) => [j.id, j.status, j.remainingSeconds]),
    [
      ['j_place', 'PENDING', 3600],
      ['j_up3', 'PENDING', 600],
    ]
  );
});

test('5E-2 Core Validation: validateSessionJobAssignment enforces every invariant and returns exact errorCodes', () => {
  const jobs = [
    makePlaceJob('j1', 1),
    makePlaceJob('j2', 2),
    makePlaceJob('j3', 1),
    makePlaceJob('j4', 1),
    makePlaceJob('j5', 1),
    makeUpgradeJob('up2', 'b_cave', 2, 1, 300),
    makeUpgradeJob('up3', 'b_cave', 3, 2, 600),
  ];
  const villagers: Villager[] = [
    { id: 'v1', role: 'elder', recruitedAt: 10 },
    { id: 'v2', role: 'woodworker', recruitedAt: 20 },
  ]; // totalCrew = 3 with founderRole='crafter'

  // Empty selection & valid subset pass
  assert.strictEqual(
    validateSessionJobAssignment({ jobs, villagers, founderRole: 'crafter', assignedJobIds: [] }).valid,
    true
  );
  const okSubset = validateSessionJobAssignment({
    jobs,
    villagers,
    founderRole: 'crafter',
    assignedJobIds: ['j2', 'up2'],
  });
  assert.strictEqual(okSubset.valid, true);
  assert.strictEqual(okSubset.totalAssignedCrew, 3);

  // Duplicate
  assert.strictEqual(
    validateSessionJobAssignment({
      jobs,
      villagers,
      founderRole: 'crafter',
      assignedJobIds: ['j1', 'j1'],
    }).errorCode,
    'SESSION_JOB_DUPLICATE'
  );

  // > 4 jobs
  assert.strictEqual(
    validateSessionJobAssignment({
      jobs,
      villagers,
      founderRole: 'crafter',
      assignedJobIds: ['j1', 'j2', 'j3', 'j4', 'j5'],
    }).errorCode,
    'SESSION_JOB_TOO_MANY'
  );

  // Missing job
  assert.strictEqual(
    validateSessionJobAssignment({
      jobs,
      villagers,
      founderRole: 'crafter',
      assignedJobIds: ['missing'],
    }).errorCode,
    'SESSION_JOB_NOT_FOUND'
  );

  // Insufficient crew (j2=2 + j1=1 + j3=1 = 4 > 3)
  const crewErr = validateSessionJobAssignment({
    jobs,
    villagers,
    founderRole: 'crafter',
    assignedJobIds: ['j2', 'j1', 'j3'],
  });
  assert.strictEqual(crewErr.valid, false);
  assert.strictEqual(crewErr.errorCode, 'SESSION_JOB_INSUFFICIENT_CREW');
  assert.deepStrictEqual(crewErr.errorParams, { required: 4, available: 3 });

  // Out-of-order same-building upgrade (up3 before up2)
  assert.strictEqual(
    validateSessionJobAssignment({
      jobs,
      villagers,
      founderRole: 'crafter',
      assignedJobIds: ['up3'],
    }).errorCode,
    'SESSION_JOB_UPGRADE_ORDER'
  );

  // Both same-building upgrades together (up2 + up3) also rejected by sequential rule
  assert.strictEqual(
    validateSessionJobAssignment({
      jobs,
      villagers,
      founderRole: 'crafter',
      assignedJobIds: ['up2', 'up3'],
    }).errorCode,
    'SESSION_JOB_UPGRADE_ORDER'
  );
});

test('5E-2 Core Crew Pool: assignVillagersToActiveJobs deterministically maps real villagers without any duplication', () => {
  const villagers: Villager[] = [
    { id: 'v_late', role: 'woodworker', recruitedAt: 300 },
    { id: 'v_b', role: 'elder', recruitedAt: 100 },
    { id: 'v_a', role: 'crafter', recruitedAt: 100 },
  ];
  const jobs: ConstructionJob[] = [
    { ...makePlaceJob('j1', 1), status: 'ACTIVE' },
    { ...makeExpandJob('j2', 8, 0), status: 'ACTIVE' },
    { ...makePlaceJob('j3', 2), status: 'PENDING' }, // pending job must get zero villagers
    { ...makeUpgradeJob('j4', 'b_cave', 2, 1), status: 'ACTIVE' },
  ];

  const allocation = assignVillagersToActiveJobs(jobs, villagers, 'elder');

  // 3 ACTIVE jobs need 1 + 2 + 1 = 4 villagers; founder + 3 recruited = 4 villagers -> 0 idle
  assert.strictEqual(allocation.assignments.length, 3);
  assert.deepStrictEqual(allocation.assignments[0].villagers.map((v) => v.id), ['founder_villager']);
  assert.deepStrictEqual(allocation.assignments[1].villagers.map((v) => v.id), ['v_a', 'v_b']);
  assert.deepStrictEqual(allocation.assignments[2].villagers.map((v) => v.id), ['v_late']);

  const allAssignedIds = allocation.assignments.flatMap((a) => a.villagers.map((v) => v.id));
  assert.strictEqual(new Set(allAssignedIds).size, allAssignedIds.length, 'Zero duplicate villagers');
  assert.strictEqual(allocation.idleVillagers.length, 0);

  // With 1 fewer active job, last villager stays idle
  const partialAllocation = assignVillagersToActiveJobs(
    [{ ...makePlaceJob('j1', 1), status: 'ACTIVE' }],
    villagers,
    'elder'
  );
  assert.strictEqual(partialAllocation.assignedVillagerIds.size, 1);
  assert.deepStrictEqual(
    partialAllocation.idleVillagers.map((v) => v.id),
    ['v_a', 'v_b', 'v_late']
  );
});
