import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MemoryStorageAdapter } from '../../src/storage/memoryStorageAdapter.ts';
import { StorageManager } from '../../src/storage/storageManager.ts';
import { ProfileManager } from '../../src/core/profiles/profileManager.ts';
import {
  MockAlarmsAdapter,
  MockNotificationsAdapter,
  MockBadgeAdapter,
  MockDNRAdapter,
} from '../mocks/chromeMock.ts';
import { BlockingCoordinator } from '../../src/background/blockingCoordinator.ts';
import {
  SessionCoordinator,
  buildPomodoroStageAlarmName,
} from '../../src/background/sessionCoordinator.ts';
import { CivilizationCoordinator } from '../../src/background/civilizationCoordinator.ts';
import { QuestCoordinator } from '../../src/background/questCoordinator.ts';
import { MessageHandler } from '../../src/background/messageHandler.ts';
import { createInitialCivilizationState } from '../../src/core/civilization/civilizationState.ts';
import { createInitialQuestState } from '../../src/core/quests/questEngine.ts';
import {
  PlaceBuildingResponseData,
  UpgradeBuildingResponseData,
} from '../../src/types/messages.ts';
import { SessionSnapshot } from '../../src/types/session.ts';
import { sendExtensionMessage } from '../../src/ui/services/extensionClient.ts';

function createSessionJobHarness() {
  const adapter = new MemoryStorageAdapter();
  const storage = new StorageManager(adapter);
  const profileManager = new ProfileManager(storage);
  const alarms = new MockAlarmsAdapter();
  const notifications = new MockNotificationsAdapter();
  const badge = new MockBadgeAdapter();
  const blocking = new BlockingCoordinator(new MockDNRAdapter());
  const civCoordinator = new CivilizationCoordinator(storage);
  const questCoordinator = new QuestCoordinator(storage);
  const sessionCoordinator = new SessionCoordinator(
    storage,
    profileManager,
    alarms,
    notifications,
    badge,
    blocking,
    () => civCoordinator.getActiveCoinBonuses(),
    undefined,
    undefined,
    (civState) => {
      civCoordinator.refreshCachedBonuses(civState);
    }
  );
  const handler = new MessageHandler(
    sessionCoordinator,
    profileManager,
    storage,
    civCoordinator,
    undefined,
    questCoordinator
  );

  async function seed() {
    await storage.setEconomy({ focusCoins: 2000, totalXP: 5000, level: 8 });
    const today = new Date().toISOString().slice(0, 10);
    await storage.setDailyStats({
      [today]: {
        date: today,
        totalFocusMinutes: 600,
        completedSessions: 5,
        abandonedSessions: 0,
        coinsEarned: 100,
        xpEarned: 300,
      },
    });
    await storage.setQuests(createInitialQuestState(Date.now()));
    const init = createInitialCivilizationState();
    await storage.setCivilizationState({
      ...init,
      founderRole: 'woodworker', // 1 crew at start
      villagers: [],
    });
  }

  return {
    storage,
    profileManager,
    civCoordinator,
    sessionCoordinator,
    handler,
    seed,
  };
}

test('5E-2 Integration: START_SESSION rejects invalid assignedJobIds atomically without mutating session or activeProfileId', async () => {
  const h = createSessionJobHarness();
  await h.seed();
  const defaultProfile = await h.profileManager.createProfile('Default Work', []);
  await h.profileManager.setActiveProfile(defaultProfile.id);
  const otherProfile = await h.profileManager.createProfile('Other Profile', []);

  // Build Cave (1 crew -> 60m) + finish it, then queue Foraging Post 1 (1 crew) + Cave L1->L2 & L2->L3
  const caveRes = await h.handler.handleMessage({
    action: 'PLACE_BUILDING',
    payload: { buildingDefinitionId: 'stone_age_study_cave', position: { x: 0, y: 0 } },
  });
  assert.equal(caveRes.success, true);
  const caveId = (caveRes.data as PlaceBuildingResponseData).building.id;
  await h.sessionCoordinator.startSession('COUNTDOWN', 60, defaultProfile.id);
  await h.sessionCoordinator.completeCountdown();
  await h.sessionCoordinator.resetSession();

  const f1Res = await h.handler.handleMessage({
    action: 'PLACE_BUILDING',
    payload: { buildingDefinitionId: 'stone_age_foraging_post', position: { x: 3, y: 0 } },
  });
  const f1JobId = (f1Res.data as PlaceBuildingResponseData).job!.id;
  const up2Res = await h.handler.handleMessage({
    action: 'UPGRADE_BUILDING',
    payload: { buildingId: caveId, expectedLevel: 1 },
  });
  const up2JobId = (up2Res.data as UpgradeBuildingResponseData).job!.id;
  const up3Res = await h.handler.handleMessage({
    action: 'UPGRADE_BUILDING',
    payload: { buildingId: caveId, expectedLevel: 2 },
  });
  const up3JobId = (up3Res.data as UpgradeBuildingResponseData).job!.id;

  const expectRejected = async (
    payload: Record<string, unknown>,
    expectedCode: string
  ) => {
    const res = await h.handler.handleMessage({
      action: 'START_SESSION',
      payload,
    });
    assert.equal(res.success, false);
    assert.equal(res.errorCode, expectedCode);
    assert.equal(await h.storage.getCurrentSession(), null, 'Failed START_SESSION must leave session null');
    assert.equal(
      await h.storage.getActiveProfileId(),
      defaultProfile.id,
      'Failed START_SESSION must NOT mutate activeProfileId'
    );
  };

  // Invalid type in MessageHandler
  await expectRejected(
    { mode: 'COUNTDOWN', targetMinutes: 25, profileId: otherProfile.id, assignedJobIds: 'bad' },
    'SESSION_INVALID_JOB_ASSIGNMENT'
  );
  // Missing job
  await expectRejected(
    { mode: 'COUNTDOWN', targetMinutes: 25, profileId: otherProfile.id, assignedJobIds: ['nope'] },
    'SESSION_JOB_NOT_FOUND'
  );
  // Duplicate job ID
  await expectRejected(
    { mode: 'COUNTDOWN', targetMinutes: 25, profileId: otherProfile.id, assignedJobIds: [f1JobId, f1JobId] },
    'SESSION_JOB_DUPLICATE'
  );
  // Insufficient crew (1 crew available, selecting 2 jobs needing 2 crew)
  await expectRejected(
    { mode: 'COUNTDOWN', targetMinutes: 25, profileId: otherProfile.id, assignedJobIds: [f1JobId, up2JobId] },
    'SESSION_JOB_INSUFFICIENT_CREW'
  );
  // Upgrade out of order (up3 before up2)
  await expectRejected(
    { mode: 'COUNTDOWN', targetMinutes: 25, profileId: otherProfile.id, assignedJobIds: [up3JobId] },
    'SESSION_JOB_UPGRADE_ORDER'
  );
  // Too many (>4)
  await expectRejected(
    {
      mode: 'COUNTDOWN',
      targetMinutes: 25,
      profileId: otherProfile.id,
      assignedJobIds: ['a', 'b', 'c', 'd', 'e'],
    },
    'SESSION_JOB_TOO_MANY'
  );
});

test('5E-2 Integration: assignedJobIds & autoContinueJobs settle prioritized jobs on completion, ignore breaks/abandoned/short, and skip cancelled jobs', async () => {
  const h = createSessionJobHarness();
  await h.seed();
  const profile = await h.profileManager.createProfile('Priority Work', []);

  // Build Cave (1 crew, 60m) + finish -> then place 2 Foraging Posts (1 crew each)
  const caveRes = await h.handler.handleMessage({
    action: 'PLACE_BUILDING',
    payload: { buildingDefinitionId: 'stone_age_study_cave', position: { x: 0, y: 0 } },
  });
  const caveId = (caveRes.data as PlaceBuildingResponseData).building.id;
  await h.sessionCoordinator.startSession('COUNTDOWN', 60, profile.id);
  await h.sessionCoordinator.completeCountdown();

  const f1Res = await h.handler.handleMessage({
    action: 'PLACE_BUILDING',
    payload: { buildingDefinitionId: 'stone_age_foraging_post', position: { x: 3, y: 0 } },
  });
  const f1JobId = (f1Res.data as PlaceBuildingResponseData).job!.id;

  const up2Res = await h.handler.handleMessage({
    action: 'UPGRADE_BUILDING',
    payload: { buildingId: caveId, expectedLevel: 1 },
  });
  const up2JobId = (up2Res.data as UpgradeBuildingResponseData).job!.id; // 5m (300s)

  // f1Job is currently ACTIVE by FIFO, up2Job is PENDING.
  // Start Countdown 10m prioritizing [up2JobId] with autoContinueJobs=false -> survives GET_SESSION_STATE and finishes up2Job ONLY (f1Job stays 3600s)!
  const startRes = await h.handler.handleMessage({
    action: 'START_SESSION',
    payload: {
      mode: 'COUNTDOWN',
      targetMinutes: 10,
      profileId: profile.id,
      assignedJobIds: [up2JobId],
      autoContinueJobs: false,
    },
  });
  assert.equal(startRes.success, true);
  const startedSnap = startRes.data as SessionSnapshot;
  assert.deepStrictEqual(startedSnap.assignedJobIds, [up2JobId]);
  assert.equal(startedSnap.autoContinueJobs, false);

  const stateRes = await h.handler.handleMessage({ action: 'GET_SESSION_STATE' });
  const hydrated = (stateRes.data as { currentSession: SessionSnapshot | null }).currentSession!;
  assert.deepStrictEqual(hydrated.assignedJobIds, [up2JobId]);
  assert.equal(hydrated.autoContinueJobs, false);

  await h.sessionCoordinator.completeCountdown();

  let civ = await h.storage.getCivilizationState();
  assert.equal(civ.buildings.find((b) => b.id === caveId)?.level, 2, 'Prioritized upgrade Lv.2 must finish');
  assert.equal(civ.jobs?.length, 1);
  assert.equal(civ.jobs?.[0].id, f1JobId);
  assert.equal(civ.jobs?.[0].remainingSeconds, 3600, 'autoContinue=false must NOT advance f1Job during remaining 5m');

  // Queue Cave L2->L3 (10m) and assign it, then Give Up -> 0s advance
  const up3Res = await h.handler.handleMessage({
    action: 'UPGRADE_BUILDING',
    payload: { buildingId: caveId, expectedLevel: 2 },
  });
  const up3JobId = (up3Res.data as UpgradeBuildingResponseData).job!.id;

  await h.handler.handleMessage({
    action: 'START_SESSION',
    payload: {
      mode: 'COUNTDOWN',
      targetMinutes: 10,
      profileId: profile.id,
      assignedJobIds: [up3JobId],
      autoContinueJobs: false,
    },
  });
  await h.sessionCoordinator.giveUpCountdown();
  assert.equal((await h.storage.getCivilizationState()).jobs?.find((j) => j.id === up3JobId)?.remainingSeconds, 600);

  // Cancel up3Job BEFORE finishing a session that assigned [up3JobId, f1JobId] -> skipped gracefully, advances remaining valid job!
  // Recruit 1 villager first so we can assign 2 jobs (2 crew)
  await h.handler.handleMessage({ action: 'RECRUIT_VILLAGER', payload: { role: 'crafter' } });
  await h.handler.handleMessage({
    action: 'START_SESSION',
    payload: {
      mode: 'POMODORO_COUNTDOWN',
      targetMinutes: 20,
      profileId: profile.id,
      pomodoroConfig: {
        focusDurationMinutes: 20,
        focusIntervalDurationMinutes: 10,
        shortBreakDurationMinutes: 5,
        longBreakDurationMinutes: 15,
        focusIntervalsPerCycle: 2,
        targetFocusSessions: 2,
        numberOfCycles: 1,
      },
      assignedJobIds: [up3JobId, f1JobId],
      autoContinueJobs: false,
    },
  });

  // Cancel up3Job while session runs
  const cancelMid = await h.handler.handleMessage({
    action: 'CANCEL_CONSTRUCTION_JOB',
    payload: { jobId: up3JobId },
  });
  assert.equal(cancelMid.success, true);

  // Finish Focus 1 -> Break -> must NOT advance jobs yet
  let pomo = (await h.storage.getCurrentSession())!;
  await h.sessionCoordinator.advancePomodoroStage(
    buildPomodoroStageAlarmName(pomo.id, 1, 'FOCUS', pomo.pomodoroState!.phaseStartedAt)
  );
  assert.equal((await h.storage.getCivilizationState()).jobs?.find((j) => j.id === f1JobId)?.remainingSeconds, 3600);

  // Finish Break -> Focus 2 (completes 20m = 1200s): up3Job skipped gracefully, f1Job advances 1200s -> 2400s!
  pomo = (await h.storage.getCurrentSession())!;
  await h.sessionCoordinator.advancePomodoroStage(
    buildPomodoroStageAlarmName(pomo.id, 1, 'SHORT_BREAK', pomo.pomodoroState!.phaseStartedAt)
  );
  pomo = (await h.storage.getCurrentSession())!;
  await h.sessionCoordinator.advancePomodoroStage(
    buildPomodoroStageAlarmName(pomo.id, 2, 'FOCUS', pomo.pomodoroState!.phaseStartedAt)
  );

  civ = await h.storage.getCivilizationState();
  assert.equal(civ.jobs?.length, 1);
  assert.equal(civ.jobs?.[0].id, f1JobId);
  assert.equal(civ.jobs?.[0].remainingSeconds, 2400);
});

test('5E-2 Simulator Parity: extensionClient.ts validates and settles manual assignedJobIds on Stopwatch completion', async () => {
  // Ensure clean idle session in simulator
  await sendExtensionMessage({ action: 'RESET_SESSION' });

  const civRes = await sendExtensionMessage<{ founderRole?: string | null; buildings: Array<{ id: string }> }>({
    action: 'GET_CIVILIZATION_STATE',
  });
  assert.equal(civRes.success, true);
  if (!civRes.data?.founderRole) {
    const founderRes = await sendExtensionMessage({
      action: 'SELECT_FOUNDER',
      payload: { role: 'crafter' },
    });
    assert.equal(founderRes.success, true);
  }

  // Queue two non-conflicting jobs in simulator: Standing Stone (1 crew, 3600s) and Rock Shelter (1 crew, 3600s)
  const p1 = await sendExtensionMessage<PlaceBuildingResponseData>({
    action: 'PLACE_BUILDING',
    payload: { buildingDefinitionId: 'stone_age_totem', position: { x: 0, y: 6 } },
  });
  assert.equal(p1.success, true);
  const job1 = p1.data!.job!;

  const p2 = await sendExtensionMessage<PlaceBuildingResponseData>({
    action: 'PLACE_BUILDING',
    payload: { buildingDefinitionId: 'stone_age_study_cave', position: { x: 3, y: 4 } },
  });
  assert.equal(p2.success, true);
  const job2 = p2.data!.job!;

  const activeProfileRes = await sendExtensionMessage<{ id: string }>({
    action: 'GET_ACTIVE_PROFILE',
  });
  const activeProfileId = activeProfileRes.data?.id ?? 'default-study';

  // Simulator must reject invalid duplicate ID
  const badSim = await sendExtensionMessage({
    action: 'START_SESSION',
    payload: {
      mode: 'STOPWATCH',
      targetMinutes: 0,
      profileId: activeProfileId,
      assignedJobIds: [job1.id, job1.id],
    },
  });
  assert.equal(badSim.success, false);
  assert.equal(badSim.errorCode, 'SESSION_JOB_DUPLICATE');

  // Start Stopwatch assigning ONLY job2 with autoContinueJobs=false
  const realNow = Date.now;
  let mockNow = realNow();
  Date.now = () => mockNow;
  try {
    const startSim = await sendExtensionMessage<SessionSnapshot>({
      action: 'START_SESSION',
      payload: {
        mode: 'STOPWATCH',
        targetMinutes: 0,
        profileId: activeProfileId,
        assignedJobIds: [job2.id],
        autoContinueJobs: false,
      },
    });
    assert.equal(startSim.success, true);
    assert.deepStrictEqual(startSim.data?.assignedJobIds, [job2.id]);
    assert.equal(startSim.data?.autoContinueJobs, false);

    mockNow += 60 * 60 * 1000;
    const endSim = await sendExtensionMessage({ action: 'FINISH_STOPWATCH' });
    assert.equal(endSim.success, true);

    const postCiv = await sendExtensionMessage<{ jobs?: Array<{ id: string; remainingSeconds: number }> }>({
      action: 'GET_CIVILIZATION_STATE',
    });
    const remainingIds = (postCiv.data?.jobs ?? []).map((j) => j.id);
    assert.ok(!remainingIds.includes(job2.id), 'Simulator must complete prioritized job2');
    assert.ok(remainingIds.includes(job1.id), 'Simulator must keep unselected job1 when autoContinue=false');
  } finally {
    Date.now = realNow;
    await sendExtensionMessage({ action: 'RESET_SESSION' });
  }
});
