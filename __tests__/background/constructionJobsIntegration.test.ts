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
import { aggregateCoinBonus } from '../../src/core/economy/coinBonus.ts';
import { GridMap } from '../../src/core/civilization/gridMap.ts';
import {
  CancelConstructionJobResponseData,
  ExpandLandResponseData,
  PlaceBuildingResponseData,
  RemoveBuildingResponseData,
  UpgradeBuildingResponseData,
} from '../../src/types/messages.ts';

function createJobsHarness() {
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

  async function seed(options?: {
    coins?: number;
    level?: number;
    xp?: number;
    focusMinutes?: number;
    founderRole?: 'elder' | 'crafter' | 'woodworker' | null;
    extraVillagers?: Array<{ id: string; role: 'elder' | 'crafter' | 'woodworker' }>;
  }) {
    const coins = options?.coins ?? 2000;
    const level = options?.level ?? 8;
    const xp = options?.xp ?? 5000;
    const focusMinutes = options?.focusMinutes ?? 600;
    await storage.setEconomy({ focusCoins: coins, totalXP: xp, level });
    const today = new Date().toISOString().slice(0, 10);
    await storage.setDailyStats({
      [today]: {
        date: today,
        totalFocusMinutes: focusMinutes,
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
      founderRole: options?.founderRole !== undefined ? options.founderRole : 'woodworker',
      villagers: (options?.extraVillagers ?? []).map((v, idx) => ({
        ...v,
        recruitedAt: idx + 1,
      })),
    });
  }

  return {
    adapter,
    storage,
    profileManager,
    civCoordinator,
    sessionCoordinator,
    handler,
    seed,
  };
}

test('Stage A Integration: Campfire instant (0 crew, 0s), crew gating, Focus settlement & GiveUp/ShortStopwatch give 0s', async () => {
  const h = createJobsHarness();
  // Start with NO villagers & NO founder (0 crew total)
  await h.seed({ founderRole: null });
  const profile = await h.profileManager.createProfile('Stage A Settlement', []);

  // Campfire requires 0 crew, 0s -> succeeds instantly with 0 jobs created
  const campRes = await h.handler.handleMessage({
    action: 'PLACE_BUILDING',
    payload: { buildingDefinitionId: 'stone_age_campfire', position: { x: 0, y: 0 } },
  });
  assert.equal(campRes.success, true);
  assert.equal((campRes.data as PlaceBuildingResponseData).job, undefined);
  assert.equal((await h.storage.getCivilizationState()).jobs?.length, 0);

  // Foraging Post requires 1 crew -> rejected with CIV_NOT_ENOUGH_VILLAGERS
  const noCrewRes = await h.handler.handleMessage({
    action: 'PLACE_BUILDING',
    payload: { buildingDefinitionId: 'stone_age_foraging_post', position: { x: 2, y: 0 } },
  });
  assert.equal(noCrewRes.success, false);
  assert.equal(noCrewRes.errorCode, 'CIV_NOT_ENOUGH_VILLAGERS');
  assert.equal(noCrewRes.errorParams?.requiredCrew, 1);

  // Assign founder (1 crew) -> Foraging Post queues as ACTIVE 3600s
  const curCiv = await h.storage.getCivilizationState();
  await h.storage.setCivilizationState({ ...curCiv, founderRole: 'woodworker' });
  const forageRes = await h.handler.handleMessage({
    action: 'PLACE_BUILDING',
    payload: { buildingDefinitionId: 'stone_age_foraging_post', position: { x: 2, y: 0 } },
  });
  assert.equal(forageRes.success, true);
  const forageData = forageRes.data as PlaceBuildingResponseData;
  assert.equal(forageData.job?.status, 'ACTIVE');
  assert.equal(forageData.job?.remainingSeconds, 3600);
  // Bonus remains 0 while building is UNDER_CONSTRUCTION
  assert.equal(aggregateCoinBonus(h.civCoordinator.getActiveCoinBonuses()), 0);

  // Give up Countdown 25m -> ABANDONED must advance jobs by 0s!
  await h.sessionCoordinator.startSession('COUNTDOWN', 25, profile.id);
  await h.sessionCoordinator.giveUpCountdown();
  assert.equal(
    (await h.storage.getCivilizationState()).jobs?.[0].remainingSeconds,
    3600,
    'Abandoned session must give 0 construction seconds'
  );

  // Stopwatch < 5m (4m) -> 0 valid minutes -> 0 construction seconds!
  const realNow = Date.now;
  let mockNow = realNow();
  Date.now = () => mockNow;
  try {
    await h.sessionCoordinator.startSession('STOPWATCH', 0, profile.id);
    mockNow += 4 * 60 * 1000;
    await h.sessionCoordinator.finishStopwatch();
  } finally {
    Date.now = realNow;
  }
  assert.equal((await h.storage.getCivilizationState()).jobs?.[0].remainingSeconds, 3600);

  // Interrupted Countdown after 10m focus (EXTENSION_RELOADED) -> INTERRUPTED must advance jobs by 0s!
  const realNowForInterrupt = Date.now;
  let mockInterruptNow = realNowForInterrupt();
  Date.now = () => mockInterruptNow;
  try {
    await h.sessionCoordinator.startSession('COUNTDOWN', 30, profile.id);
    mockInterruptNow += 10 * 60 * 1000;
    const recovered = await h.sessionCoordinator.recoverSession({ reason: 'EXTENSION_RELOADED' });
    assert.equal(recovered?.status, 'INTERRUPTED');
  } finally {
    Date.now = realNowForInterrupt;
  }
  assert.equal(
    (await h.storage.getCivilizationState()).jobs?.[0].remainingSeconds,
    3600,
    'Interrupted session must give 0 construction seconds'
  );

  // Pomodoro FOCUS phase 1 (15m) entering SHORT_BREAK must NOT commit construction seconds yet
  let pomoSnap = await h.sessionCoordinator.startSession('POMODORO_COUNTDOWN', 30, profile.id, {
    focusDurationMinutes: 30,
    focusIntervalDurationMinutes: 15,
    shortBreakDurationMinutes: 5,
    longBreakDurationMinutes: 15,
    focusIntervalsPerCycle: 2,
    targetFocusSessions: 2,
    numberOfCycles: 1,
  });
  await h.sessionCoordinator.advancePomodoroStage(
    buildPomodoroStageAlarmName(pomoSnap.id, 1, 'FOCUS', pomoSnap.pomodoroState!.phaseStartedAt)
  );
  assert.equal(
    (await h.storage.getCivilizationState()).jobs?.[0].remainingSeconds,
    3600,
    'Mid-Pomodoro break transition must not advance jobs until full Pomodoro completes'
  );

  // Advance Break 1 -> Focus 2 -> Complete full 30m Pomodoro (advances job by 1800s -> 1800s left)
  pomoSnap = (await h.storage.getCurrentSession())!;
  await h.sessionCoordinator.advancePomodoroStage(
    buildPomodoroStageAlarmName(pomoSnap.id, 1, 'SHORT_BREAK', pomoSnap.pomodoroState!.phaseStartedAt)
  );
  pomoSnap = (await h.storage.getCurrentSession())!;
  await h.sessionCoordinator.advancePomodoroStage(
    buildPomodoroStageAlarmName(pomoSnap.id, 2, 'FOCUS', pomoSnap.pomodoroState!.phaseStartedAt)
  );
  assert.equal((await h.storage.getCivilizationState()).jobs?.[0].remainingSeconds, 1800);
  assert.equal(aggregateCoinBonus(h.civCoordinator.getActiveCoinBonuses()), 0);

  // Finish remaining 30m Countdown -> completes building and unlocks +2% CoinBonus immediately
  await h.sessionCoordinator.startSession('COUNTDOWN', 30, profile.id);
  await h.sessionCoordinator.completeCountdown();
  assert.equal((await h.storage.getCivilizationState()).jobs?.length, 0);
  assert.ok(Math.abs(aggregateCoinBonus(h.civCoordinator.getActiveCoinBonuses()) - 0.02) < 1e-9);
});

test('Stage A Integration: CANCEL_CONSTRUCTION_JOB 100% vs 50% refund, upgrade cascade, place grid release, expand duplicate guard, recruit wakeup', async () => {
  const h = createJobsHarness();
  await h.seed({
    coins: 1000,
    founderRole: 'woodworker',
  });
  const profile = await h.profileManager.createProfile('Cancel & Cascade', []);

  // 1. Place Cave (12 Coins, 1 crew, 3600s) and finish 60m Focus, then recruit 1 crafter (2 crew total)
  const caveRes = await h.handler.handleMessage({
    action: 'PLACE_BUILDING',
    payload: { buildingDefinitionId: 'stone_age_study_cave', position: { x: 0, y: 0 } },
  });
  assert.equal(caveRes.success, true);
  const caveId = (caveRes.data as PlaceBuildingResponseData).building.id;
  await h.sessionCoordinator.startSession('COUNTDOWN', 60, profile.id);
  await h.sessionCoordinator.completeCountdown();
  const recruitCrafter = await h.handler.handleMessage({
    action: 'RECRUIT_VILLAGER',
    payload: { role: 'crafter' },
  });
  assert.equal(recruitCrafter.success, true);

  // Place Foraging Post (15 Coins, 1 crew, 3600s) and cancel BEFORE any Focus elapsed -> 100% refund & grid cells released
  const forageRes = await h.handler.handleMessage({
    action: 'PLACE_BUILDING',
    payload: { buildingDefinitionId: 'stone_age_foraging_post', position: { x: 4, y: 0 } },
  });
  assert.equal(forageRes.success, true);
  const forageData = forageRes.data as PlaceBuildingResponseData;

  const econBeforeCancelPlace = (await h.storage.getEconomy()).focusCoins;
  const cancelPlaceRes = await h.handler.handleMessage({
    action: 'CANCEL_CONSTRUCTION_JOB',
    payload: { jobId: forageData.job!.id },
  });
  assert.equal(cancelPlaceRes.success, true);
  const cancelPlaceData = cancelPlaceRes.data as CancelConstructionJobResponseData;
  assert.equal(cancelPlaceData.refundedCoins, 15);
  assert.equal(cancelPlaceData.economy.focusCoins, econBeforeCancelPlace + 15);
  assert.equal(
    GridMap.fromSnapshot(cancelPlaceData.civilizationState.grid).getOccupyingBuilding(4, 0),
    undefined
  );

  // Queue Cave L1->L2 (5m, cost 21) and L2->L3 (10m, cost 34)
  const up2 = await h.handler.handleMessage({
    action: 'UPGRADE_BUILDING',
    payload: { buildingId: caveId, expectedLevel: 1 },
  });
  const up3 = await h.handler.handleMessage({
    action: 'UPGRADE_BUILDING',
    payload: { buildingId: caveId, expectedLevel: 2 },
  });
  const up2Data = up2.data as UpgradeBuildingResponseData;
  const up3Data = up3.data as UpgradeBuildingResponseData;
  const up2Job = up2Data.job!;
  const up3Job = up3Data.job!;
  assert.equal(up2Job.status, 'ACTIVE');
  assert.equal(up3Job.status, 'PENDING');

  // Run 2m Focus so L1->L2 has >0s elapsed (180s left) while L2->L3 still has 0s elapsed
  await h.sessionCoordinator.startSession('COUNTDOWN', 2, profile.id);
  await h.sessionCoordinator.completeCountdown();

  // Cancelling L1->L2 cascades to L2->L3: 50% of up2 + 100% of up3
  const expectedCascadeRefund = up2Data.cost * 0.5 + up3Data.cost;
  const econBeforeCascade = (await h.storage.getEconomy()).focusCoins;
  const cancelCascadeRes = await h.handler.handleMessage({
    action: 'CANCEL_CONSTRUCTION_JOB',
    payload: { jobId: up2Job.id },
  });
  assert.equal(cancelCascadeRes.success, true);
  const cascadeData = cancelCascadeRes.data as CancelConstructionJobResponseData;
  assert.equal(cascadeData.cancelledJobIds.length, 2);
  assert.equal(cascadeData.refundedCoins, expectedCascadeRefund);
  assert.equal(cascadeData.economy.focusCoins, econBeforeCascade + expectedCascadeRefund);
  assert.equal(cascadeData.civilizationState.jobs?.length, 0);

  // Upgrade Cave to Lv.2 (capacity 4) and recruit 1 elder -> 3 crew total (1 founder + 1 crafter + 1 elder)
  await h.handler.handleMessage({
    action: 'UPGRADE_BUILDING',
    payload: { buildingId: caveId, expectedLevel: 1 },
  });
  await h.sessionCoordinator.startSession('COUNTDOWN', 5, profile.id);
  await h.sessionCoordinator.completeCountdown();
  const recElder1 = await h.handler.handleMessage({ action: 'RECRUIT_VILLAGER', payload: { role: 'elder' } });
  assert.equal(recElder1.success, true);

  // Queue granary1 (2 crew -> ACTIVE, 1 free crew left) & expand (2 crew -> PENDING)
  const granary1 = await h.handler.handleMessage({
    action: 'PLACE_BUILDING',
    payload: { buildingDefinitionId: 'stone_age_food_cache', position: { x: 4, y: 0 } },
  });
  assert.equal(granary1.success, true);
  const granary1Job = (granary1.data as PlaceBuildingResponseData).job!;
  assert.equal(granary1Job.status, 'ACTIVE');

  const exp1 = await h.handler.handleMessage({
    action: 'EXPAND_LAND',
    payload: { origin: { x: 8, y: 0 } },
  });
  assert.equal(exp1.success, true);
  const expJob = (exp1.data as ExpandLandResponseData).job!;
  assert.equal(expJob.status, 'PENDING'); // waiting on 4th villager

  // Duplicate expand on same origin rejected
  const dupExp = await h.handler.handleMessage({
    action: 'EXPAND_LAND',
    payload: { origin: { x: 8, y: 0 } },
  });
  assert.equal(dupExp.success, false);
  assert.equal(dupExp.errorCode, 'CIV_EXPAND_ALREADY_QUEUED');

  // Recruiting 4th villager (total crew = 4) wakes up PENDING expand job immediately!
  const recWake = await h.handler.handleMessage({ action: 'RECRUIT_VILLAGER', payload: { role: 'elder' } });
  assert.equal(recWake.success, true);
  const wokenCiv = await h.storage.getCivilizationState();
  assert.equal(wokenCiv.jobs?.find((j) => j.id === expJob.id)?.status, 'ACTIVE');

  // Demolish granary1 under construction -> 50% refund of 30 = 15 Coins & removes its job
  const demRes = await h.handler.handleMessage({
    action: 'REMOVE_BUILDING',
    payload: { buildingInstanceId: (granary1.data as PlaceBuildingResponseData).building.id },
  });
  assert.equal(demRes.success, true);
  assert.equal((demRes.data as RemoveBuildingResponseData).refundedCoins, 15);
  assert.equal((await h.storage.getCivilizationState()).jobs?.length, 1); // only expand remains

  // Finish 60m Focus -> expand unlocks chunk (8,0)
  await h.sessionCoordinator.startSession('COUNTDOWN', 60, profile.id);
  await h.sessionCoordinator.completeCountdown();
  const finalCiv = await h.storage.getCivilizationState();
  assert.equal(finalCiv.jobs?.length, 0);
  assert.equal(GridMap.fromSnapshot(finalCiv.grid).isCellUnlocked(8, 0), true);
});
