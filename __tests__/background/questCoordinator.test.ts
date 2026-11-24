import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStorageAdapter } from '../../src/storage/memoryStorageAdapter.ts';
import { StorageManager } from '../../src/storage/storageManager.ts';
import { STORAGE_KEYS } from '../../src/storage/storageKeys.ts';
import { MigrationRunner } from '../../src/storage/migrations/migrationRunner.ts';
import { ProfileManager } from '../../src/core/profiles/profileManager.ts';
import { BlockingCoordinator } from '../../src/background/blockingCoordinator.ts';
import { SessionCoordinator, ALARM_NAMES } from '../../src/background/sessionCoordinator.ts';
import { QuestCoordinator, QuestCoordinatorError } from '../../src/background/questCoordinator.ts';
import { MessageHandler } from '../../src/background/messageHandler.ts';
import {
  MockAlarmsAdapter,
  MockBadgeAdapter,
  MockDNRAdapter,
  MockNotificationsAdapter,
  MockTabsAdapter,
} from '../mocks/chromeMock.ts';
import {
  ALL_QUEST_DEFINITIONS,
  DAILY_QUEST_CAP,
  DAILY_QUEST_DEFINITIONS,
  DAILY_SLOT_REWARDS,
  WEEKLY_QUEST_CAP,
  WEEKLY_QUEST_DEFINITIONS,
  WEEKLY_SLOT_REWARDS,
  applyCompletedSession,
  createInitialQuestState,
  formatLocalDateKey,
  getActiveQuestDefinitions,
  getQuestDefinition,
  getSlotDefinitions,
} from '../../src/core/quests/index.ts';
import { QUEST_SLOTS } from '../../src/types/quests.ts';
import { calculatePlayerLevel } from '../../src/core/economy/levelSystem.ts';
import { localizeErrorMessage } from '../../src/i18n/errorTranslator.ts';
import { CoinBonus } from '../../src/types/economy.ts';
import { DailyStatRecord } from '../../src/types/storageSchema.ts';
import {
  ClaimQuestRewardResponseData,
  FullSessionStateResponse,
  GetQuestStateResponseData,
} from '../../src/types/messages.ts';
import { sendExtensionMessage } from '../../src/ui/services/extensionClient.ts';
import { getLocalDateKey } from '../../src/core/utils/dateUtils.ts';

const EPSILON = 1e-9;

function getScheduledAlarms(alarms: MockAlarmsAdapter) {
  return Array.from(alarms.alarms.values());
}

function localMs(year: number, month: number, day: number, hour = 10, min = 0, sec = 0): number {
  return new Date(year, month - 1, day, hour, min, sec, 0).getTime();
}

async function withMockedNow<T>(nowProvider: () => number, fn: () => Promise<T>): Promise<T> {
  const originalNow = Date.now;
  Date.now = nowProvider;
  try {
    return await fn();
  } finally {
    Date.now = originalNow;
  }
}

async function createHarness(coinBonuses: readonly CoinBonus[] = []) {
  const adapter = new MemoryStorageAdapter();
  await new MigrationRunner(adapter).runMigrations();
  const storage = new StorageManager(adapter);
  const profileManager = new ProfileManager(storage);
  const alarms = new MockAlarmsAdapter();
  const notifications = new MockNotificationsAdapter();
  const badge = new MockBadgeAdapter();
  const blocking = new BlockingCoordinator(new MockDNRAdapter(), new MockTabsAdapter([]));
  const sessionCoordinator = new SessionCoordinator(
    storage,
    profileManager,
    alarms,
    notifications,
    badge,
    blocking,
    () => coinBonuses
  );
  const questCoordinator = new QuestCoordinator(storage);
  const messageHandler = new MessageHandler(
    sessionCoordinator,
    profileManager,
    storage,
    undefined,
    undefined,
    questCoordinator
  );
  const profiles = await profileManager.getProfiles();
  const profileId = profiles[0]?.id ?? (await profileManager.createProfile('Focus Lab', [])).id;
  return {
    adapter,
    storage,
    profileManager,
    alarms,
    notifications,
    sessionCoordinator,
    questCoordinator,
    messageHandler,
    profileId,
  };
}

test('Stage 2b Step 0a: Quest Pool catalog, slot rewards & Daily/Weekly reward caps match specification exactly', () => {
  assert.strictEqual(DAILY_QUEST_DEFINITIONS.length, 9);
  assert.strictEqual(WEEKLY_QUEST_DEFINITIONS.length, 10);
  assert.strictEqual(ALL_QUEST_DEFINITIONS.length, 19);

  for (const slot of QUEST_SLOTS) {
    const dPool = getSlotDefinitions('DAILY', slot);
    const wPool = getSlotDefinitions('WEEKLY', slot);
    assert.ok(dPool.length >= 3);
    assert.ok(wPool.length >= 3);
    for (const def of dPool) {
      assert.strictEqual(def.rewardCoins, DAILY_SLOT_REWARDS[slot].rewardCoins);
      assert.strictEqual(def.rewardXp, DAILY_SLOT_REWARDS[slot].rewardXp);
    }
    for (const def of wPool) {
      assert.strictEqual(def.rewardCoins, WEEKLY_SLOT_REWARDS[slot].rewardCoins);
      assert.strictEqual(def.rewardXp, WEEKLY_SLOT_REWARDS[slot].rewardXp);
    }
  }

  // Legacy 6 definitions remain present with exact caps
  assert.strictEqual(getQuestDefinition('DAILY', 'daily_first_spark')?.target, 1);
  assert.strictEqual(getQuestDefinition('DAILY', 'daily_steady_rhythm')?.target, 60);
  assert.strictEqual(getQuestDefinition('DAILY', 'daily_double_tap')?.target, 2);
  assert.strictEqual(getQuestDefinition('WEEKLY', 'weekly_habit_builder')?.target, 4);
  assert.strictEqual(getQuestDefinition('WEEKLY', 'weekly_deep_diver')?.target, 3);
  assert.strictEqual(getQuestDefinition('WEEKLY', 'weekly_deep_diver')?.minSessionMinutes, 45);
  assert.strictEqual(getQuestDefinition('WEEKLY', 'weekly_tenacity_10')?.target, 10);

  assert.deepStrictEqual(DAILY_QUEST_CAP, { coins: 40, xp: 100 });
  assert.deepStrictEqual(WEEKLY_QUEST_CAP, { coins: 150, xp: 370 });
});

test('Stage 2b Session Invariant: Quest integration leaves session Coins/XP/Level/DailyStats bit-for-bit identical across all modes', async () => {
  const bonuses: CoinBonus[] = [{ id: 'building:test', source: 'BUILDING', rate: 0.05 }];
  const nowStart = localMs(2026, 11, 18, 9, 0, 0);
  let clock = nowStart;

  await withMockedNow(
    () => clock,
    async () => {
      const h = await createHarness(bonuses);
      await h.storage.setQuests(createInitialQuestState(clock, { useLegacySelection: true }));
      const todayKey = formatLocalDateKey(clock);

      // 1. COUNTDOWN 45m -> 45 * 1.5 * 1.2 * 1.05 = 85.05 Coins, 45 * 5 * 1.2 = 270 XP
      await h.sessionCoordinator.startSession('COUNTDOWN', 45, h.profileId);
      clock += 45 * 60 * 1000;
      const cd = await h.sessionCoordinator.completeCountdown();
      assert.strictEqual(cd?.status, 'COMPLETED');

      let eco = await h.storage.getEconomy();
      assert.ok(Math.abs(eco.focusCoins - 85.05) < EPSILON, `got ${eco.focusCoins}`);
      assert.strictEqual(eco.totalXP, 270);
      assert.strictEqual(eco.level, calculatePlayerLevel(270)); // Level 2

      // Completing Countdown updates Quests atomically; wallet receives NO quest reward before Claim
      let quests = await h.storage.getQuests(clock);
      assert.strictEqual(quests.daily.daily_first_spark.progress, 1);
      assert.strictEqual(quests.daily.daily_first_spark.completed, true);
      assert.strictEqual(quests.daily.daily_first_spark.claimed, false);
      assert.strictEqual(quests.daily.daily_steady_rhythm.progress, 45);
      assert.strictEqual(quests.weekly.weekly_deep_diver.progress, 1); // >= 45m
      assert.strictEqual(quests.weekly.weekly_tenacity_10.progress, 1);
      assert.strictEqual(quests.streak.currentDays, 1);

      // 2. STOPWATCH 15m -> 15 * 1.0 * 1.0 * 1.05 = 15.75 Coins, 45 XP
      await h.sessionCoordinator.resetSession();
      await h.sessionCoordinator.startSession('STOPWATCH', 0, h.profileId);
      clock += 15 * 60 * 1000 + 200;
      const sw = await h.sessionCoordinator.finishStopwatch();
      assert.ok(Math.abs(sw.coinsEarned - 15.75) < EPSILON);
      assert.strictEqual(sw.xpEarned, 45);

      eco = await h.storage.getEconomy();
      assert.ok(Math.abs(eco.focusCoins - 100.8) < EPSILON);
      assert.strictEqual(eco.totalXP, 315);
      assert.strictEqual(eco.level, calculatePlayerLevel(315)); // Level 3 (threshold 300)

      quests = await h.storage.getQuests(clock);
      assert.strictEqual(quests.daily.daily_double_tap.progress, 2);
      assert.strictEqual(quests.daily.daily_steady_rhythm.progress, 60); // 45 + 15
      assert.strictEqual(quests.daily.daily_steady_rhythm.completed, true);
      assert.strictEqual(quests.weekly.weekly_deep_diver.progress, 1); // 15m < 45m
      assert.strictEqual(quests.weekly.weekly_tenacity_10.progress, 2);

      // 3. POMODORO_COUNTDOWN 2x25m (50m -> 1.2x) -> 50 * 1.5 * 1.2 * 1.05 = 94.5 Coins, 300 XP
      await h.sessionCoordinator.resetSession();
      const pomoCd = await h.sessionCoordinator.startSession('POMODORO_COUNTDOWN', 0, h.profileId, {
        focusDurationMinutes: 25,
        focusIntervalDurationMinutes: 25,
        shortBreakDurationMinutes: 5,
        longBreakDurationMinutes: 15,
        targetFocusSessions: 2,
        focusIntervalsPerCycle: 2,
        numberOfCycles: 1,
      });
      // Advance interval 1 FOCUS -> SHORT_BREAK (incomplete: quests NOT incremented yet)
      clock += 25 * 60 * 1000;
      const alarm1 = getScheduledAlarms(h.alarms).find((a) => a.name.includes('_FOCUS_'))!.name;
      await h.sessionCoordinator.advancePomodoroStage(alarm1);
      quests = await h.storage.getQuests(clock);
      assert.strictEqual(quests.weekly.weekly_tenacity_10.progress, 2);

      // Skip SHORT_BREAK -> interval 2 FOCUS -> complete 100%
      clock += 5 * 60 * 1000;
      const breakAlarm = getScheduledAlarms(h.alarms).find((a) => a.name.includes('SHORT_BREAK'))!.name;
      await h.sessionCoordinator.advancePomodoroStage(breakAlarm);
      clock += 25 * 60 * 1000;
      const alarm2 = getScheduledAlarms(h.alarms).find((a) => a.name.includes('_FOCUS_'))!.name;
      const pomoCdDone = await h.sessionCoordinator.advancePomodoroStage(alarm2);
      assert.strictEqual(pomoCdDone?.status, 'COMPLETED');
      assert.strictEqual(pomoCd.id, pomoCdDone?.id);

      eco = await h.storage.getEconomy();
      assert.ok(Math.abs(eco.focusCoins - 195.3) < EPSILON, `got ${eco.focusCoins}`);
      assert.strictEqual(eco.totalXP, 615);

      quests = await h.storage.getQuests(clock);
      assert.strictEqual(quests.weekly.weekly_tenacity_10.progress, 3);
      assert.strictEqual(quests.weekly.weekly_deep_diver.progress, 2); // 50m planned >= 45m

      // 4. POMODORO_STOPWATCH: 1 completed 25m interval + 10m partial interval -> Economy & DailyStats preserve exact split, Quest counts ONLY 25m
      await h.sessionCoordinator.resetSession();
      await h.sessionCoordinator.startSession('POMODORO_STOPWATCH', 0, h.profileId, {
        focusDurationMinutes: 25,
        focusIntervalDurationMinutes: 25,
        shortBreakDurationMinutes: 5,
        longBreakDurationMinutes: 15,
        targetFocusSessions: 4,
        focusIntervalsPerCycle: 2,
        numberOfCycles: 1,
      });
      clock += 25 * 60 * 1000;
      const swAlarm1 = getScheduledAlarms(h.alarms).find((a) => a.name.includes('_FOCUS_'))!.name;
      await h.sessionCoordinator.advancePomodoroStage(swAlarm1);
      clock += 5 * 60 * 1000;
      const swBreak = getScheduledAlarms(h.alarms).find((a) => a.name.includes('SHORT_BREAK'))!.name;
      await h.sessionCoordinator.advancePomodoroStage(swBreak);
      // 10 partial mins into interval 2
      clock += 10 * 60 * 1000;
      const pomoSwDone = await h.sessionCoordinator.finishStopwatch();
      // Economy: only completed 25m * 1.0 * 1.0 * 1.05 = 26.25 Coins, 75 XP
      assert.ok(Math.abs(pomoSwDone.coinsEarned - 26.25) < EPSILON);
      assert.strictEqual(pomoSwDone.xpEarned, 75);

      const dailyStats = await h.storage.getDailyStats();
      // DailyStats minutes: 45 + 15 + 50 + (25 + 10 partial) = 145m
      assert.strictEqual(dailyStats[todayKey].totalFocusMinutes, 145);
      assert.strictEqual(dailyStats[todayKey].completedSessions, 4);
      assert.ok(Math.abs(dailyStats[todayKey].coinsEarned - 221.55) < EPSILON);
      assert.strictEqual(dailyStats[todayKey].xpEarned, 690);

      quests = await h.storage.getQuests(clock);
      assert.strictEqual(quests.weekly.weekly_tenacity_10.progress, 4);
      // Verify 25m completed (NOT 35m) was used: neither counted as deep (>=45m)
      assert.strictEqual(quests.weekly.weekly_deep_diver.progress, 2);

      // Idempotency: duplicate completeCountdown / finishStopwatch never double-applies
      await h.sessionCoordinator.finishStopwatch();
      const questsAfterDup = await h.storage.getQuests(clock);
      assert.deepStrictEqual(questsAfterDup, quests);
    }
  );
});

test('Stage 2b Invariant: Give Up, INTERRUPTED, Stopwatch <5m, Pomo Stopwatch 0-interval, Pomo Stopwatch BROWSER_CLOSED, and Reset NEVER touch fq_quests', async () => {
  let clock = localMs(2026, 11, 18, 10, 0, 0);

  await withMockedNow(
    () => clock,
    async () => {
      const h = await createHarness();
      // Seed clean quest state and spy on setMultiple to verify STORAGE_KEYS.QUESTS is NEVER written
      const seedQuests = createInitialQuestState(clock);
      await h.storage.setQuests(seedQuests);

      const writtenKeysLog: string[][] = [];
      const originalSetMultiple = h.adapter.setMultiple.bind(h.adapter);
      h.adapter.setMultiple = async (items: Record<string, unknown>) => {
        writtenKeysLog.push(Object.keys(items));
        return originalSetMultiple(items);
      };

      // 1. Countdown Give Up after 10 mins
      await h.sessionCoordinator.startSession('COUNTDOWN', 25, h.profileId);
      clock += 10 * 60 * 1000;
      await h.sessionCoordinator.giveUpCountdown();
      await h.sessionCoordinator.resetSession();

      // 2. Stopwatch < 5 mins (4m)
      await h.sessionCoordinator.startSession('STOPWATCH', 0, h.profileId);
      clock += 4 * 60 * 1000;
      const swShort = await h.sessionCoordinator.finishStopwatch();
      assert.strictEqual(swShort.coinsEarned, 0);
      await h.sessionCoordinator.resetSession();

      // 3. Stopwatch EXTENSION_DISABLED interruption after 20m
      const swInt = await h.sessionCoordinator.startSession('STOPWATCH', 0, h.profileId);
      clock += 20 * 60 * 1000;
      await h.storage.updateCurrentSession((s) => (s ? { ...s, lastHeartbeatAt: clock } : s));
      await h.sessionCoordinator.handleExtensionDisabledRecovery(swInt, 'EXTENSION_DISABLED');
      await h.sessionCoordinator.resetSession();

      // 4. Countdown BROWSER_CLOSED interruption after 15m
      const cdInt = await h.sessionCoordinator.startSession('COUNTDOWN', 25, h.profileId);
      clock += 15 * 60 * 1000;
      await h.sessionCoordinator.handleBrowserStartupRecovery(cdInt);
      await h.sessionCoordinator.resetSession();

      // 5. Pomodoro Stopwatch 0 completed intervals manual finish
      await h.sessionCoordinator.startSession('POMODORO_STOPWATCH', 0, h.profileId);
      clock += 10 * 60 * 1000;
      const pomoSw0 = await h.sessionCoordinator.finishStopwatch();
      assert.strictEqual(pomoSw0.coinsEarned, 0);
      await h.sessionCoordinator.resetSession();

      // 6. Pomodoro Stopwatch BROWSER_CLOSED after 1 completed interval (awards 25m economy, status INTERRUPTED -> 0 Quest progress)
      const pomoSwInt = await h.sessionCoordinator.startSession('POMODORO_STOPWATCH', 0, h.profileId, {
        focusDurationMinutes: 25,
        focusIntervalDurationMinutes: 25,
        shortBreakDurationMinutes: 5,
        longBreakDurationMinutes: 15,
        targetFocusSessions: 4,
        focusIntervalsPerCycle: 2,
        numberOfCycles: 1,
      });
      clock += 25 * 60 * 1000;
      const pAlarm = getScheduledAlarms(h.alarms).find((a) => a.name.includes('_FOCUS_'))!.name;
      await h.sessionCoordinator.advancePomodoroStage(pAlarm);
      clock += 2 * 60 * 1000;
      const recovered = await h.sessionCoordinator.handleBrowserStartupRecovery(pomoSwInt);
      assert.strictEqual(recovered.status, 'INTERRUPTED');
      const ecoAfter = await h.storage.getEconomy();
      assert.strictEqual(ecoAfter.focusCoins, 25);

      const allWrittenKeys = writtenKeysLog.flat();
      assert.ok(
        !allWrittenKeys.includes(STORAGE_KEYS.QUESTS),
        `fq_quests must NOT be written for non-eligible sessions, saw keys: ${JSON.stringify(writtenKeysLog)}`
      );
      assert.deepStrictEqual(await h.adapter.get(STORAGE_KEYS.QUESTS), seedQuests);
    }
  );
});

test('Stage 2b Resilience: Missing or corrupted fq_quests self-heals safely on session completion without breaking economy/stats', async () => {
  let clock = localMs(2026, 11, 18, 11, 0, 0);

  await withMockedNow(
    () => clock,
    async () => {
      const h = await createHarness();
      // Case A: fq_quests missing completely
      await h.adapter.remove(STORAGE_KEYS.QUESTS);
      await h.sessionCoordinator.startSession('COUNTDOWN', 25, h.profileId);
      clock += 25 * 60 * 1000;
      const res1 = await h.sessionCoordinator.completeCountdown();
      assert.strictEqual(res1?.status, 'COMPLETED');
      assert.strictEqual((await h.storage.getEconomy()).focusCoins, 37.5);
      let quests = await h.storage.getQuests(clock);
      assert.strictEqual(getActiveQuestDefinitions('DAILY', quests).length, 3);
      assert.strictEqual(quests.daily[getActiveQuestDefinitions('DAILY', quests)[0].id].progress > 0, true);

      // Case B: fq_quests corrupted with non-object string
      await h.sessionCoordinator.resetSession();
      await h.adapter.set(STORAGE_KEYS.QUESTS, 'CORRUPT_BLOB');
      await h.sessionCoordinator.startSession('COUNTDOWN', 25, h.profileId);
      clock += 25 * 60 * 1000;
      const res2 = await h.sessionCoordinator.completeCountdown();
      assert.strictEqual(res2?.status, 'COMPLETED');
      assert.strictEqual((await h.storage.getEconomy()).focusCoins, 75);
      quests = await h.storage.getQuests(clock);
      assert.strictEqual(quests.daily[getActiveQuestDefinitions('DAILY', quests)[0].id].progress > 0, true);

      // Case C: fq_quests corrupted with bad numeric fields
      await h.sessionCoordinator.resetSession();
      await h.adapter.set(STORAGE_KEYS.QUESTS, {
        dailyDateKey: formatLocalDateKey(clock),
        weeklyStartKey: 'invalid-week',
        daily: { daily_first_spark: { progress: -99 } },
        streak: { currentDays: 'bad', longestDays: null },
      });
      await h.sessionCoordinator.startSession('COUNTDOWN', 25, h.profileId);
      clock += 25 * 60 * 1000;
      const res3 = await h.sessionCoordinator.completeCountdown();
      assert.strictEqual(res3?.status, 'COMPLETED');
      assert.strictEqual((await h.storage.getEconomy()).focusCoins, 112.5);
      quests = await h.storage.getQuests(clock);
      assert.strictEqual(quests.daily.daily_first_spark.progress, 1);
      assert.strictEqual(quests.streak.currentDays, 1);
    }
  );
});

test('Stage 2b Error Isolation: Quest calculation failure logs warning and STILL commits session, economy, and dailyStats', async () => {
  const h = await createHarness();
  let clock = localMs(2026, 11, 18, 12, 0, 0);

  await h.sessionCoordinator.startSession('COUNTDOWN', 25, h.profileId);
  clock += 25 * 60 * 1000;

  const originalGet = h.adapter.get.bind(h.adapter);
  const warnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    warnings.push(args.map(String).join(' '));
  };
  h.adapter.get = async <T>(key: string) => {
    if (key === STORAGE_KEYS.QUESTS) {
      throw new Error('Injected Quest read fault');
    }
    return originalGet<T>(key);
  };

  try {
    await withMockedNow(
      () => clock,
      async () => {
        const done = await h.sessionCoordinator.completeCountdown();
        assert.strictEqual(done?.status, 'COMPLETED');
      }
    );
  } finally {
    console.warn = originalWarn;
    h.adapter.get = originalGet;
  }

  const eco = await h.storage.getEconomy();
  assert.strictEqual(eco.focusCoins, 37.5);
  assert.strictEqual(eco.totalXP, 125);
  const stats = await h.storage.getDailyStats();
  assert.strictEqual(stats[formatLocalDateKey(clock)].completedSessions, 1);
  assert.ok(
    warnings.some((w) => w.includes('Isolated quest progress failure')),
    `Expected isolated quest warning, got ${JSON.stringify(warnings)}`
  );
});

test('Stage 2b Atomicity & Rollback: Partial setMultiple failure rolls back session, economy, dailyStats, and quests', async () => {
  const h = await createHarness();
  const baseClock = localMs(2026, 11, 18, 13, 0, 0);
  await h.storage.setEconomy({ focusCoins: 10, totalXP: 50, level: 1 });
  const initialQuests = createInitialQuestState(baseClock, { useLegacySelection: true });
  await h.storage.setQuests(initialQuests);
  await h.sessionCoordinator.startSession('COUNTDOWN', 25, h.profileId);

  const preSession = await h.storage.getCurrentSession();
  const preEconomy = await h.storage.getEconomy();
  const preStats = await h.storage.getDailyStats();
  const preQuests = await h.adapter.get(STORAGE_KEYS.QUESTS);

  // Inject partial write failure inside setMultiple (writes first 2 keys then throws before QUESTS)
  const originalSetMultiple = h.adapter.setMultiple.bind(h.adapter);
  let failOnce = true;
  h.adapter.setMultiple = async (items: Record<string, unknown>) => {
    if (failOnce) {
      failOnce = false;
      const entries = Object.entries(items);
      for (let i = 0; i < Math.min(2, entries.length); i++) {
        await h.adapter.set(entries[i][0], entries[i][1]);
      }
      throw new Error('Injected partial setMultiple disk failure');
    }
    return originalSetMultiple(items);
  };

  await withMockedNow(
    () => baseClock + 25 * 60 * 1000,
    async () => {
      await assert.rejects(
        () => h.sessionCoordinator.completeCountdown(),
        /Injected partial setMultiple disk failure/
      );
    }
  );

  // Full rollback verified across all 4 storage keys
  assert.deepStrictEqual(await h.storage.getCurrentSession(), preSession);
  assert.deepStrictEqual(await h.storage.getEconomy(), preEconomy);
  assert.deepStrictEqual(await h.storage.getDailyStats(), preStats);
  assert.deepStrictEqual(await h.adapter.get(STORAGE_KEYS.QUESTS), preQuests);

  // Claim rollback test: commitQuestClaimInternal failure leaves economy & quest unclaimed
  const readyQuests = applyCompletedSession(
    initialQuests,
    { completedDateKey: initialQuests.dailyDateKey, completedFocusMinutes: 25 },
    baseClock
  );
  await h.storage.setQuests(readyQuests);

  let failClaim = true;
  h.adapter.setMultiple = async (items: Record<string, unknown>) => {
    if (failClaim) {
      failClaim = false;
      if (items[STORAGE_KEYS.ECONOMY]) {
        await h.adapter.set(STORAGE_KEYS.ECONOMY, items[STORAGE_KEYS.ECONOMY]);
      }
      throw new Error('Injected claim write failure');
    }
    return originalSetMultiple(items);
  };

  await assert.rejects(
    () => h.questCoordinator.claimQuestReward({ period: 'DAILY', questId: 'daily_first_spark' }, baseClock),
    /Injected claim write failure/
  );
  assert.deepStrictEqual(await h.storage.getEconomy(), preEconomy);
  assert.strictEqual((await h.storage.getQuests(baseClock)).daily.daily_first_spark.claimed, false);
});

test('Stage 2b Midnight 00:00 Crossover & Period Rollovers (Daily midnight, Weekly Monday, Anti-Clock-Rollback)', async () => {
  const h = await createHarness();

  // Start Countdown on Sunday 2026-11-22 23:50:00, complete on Monday 2026-11-23 00:15:00
  const sunNight = localMs(2026, 11, 22, 23, 50, 0);
  const monMorning = localMs(2026, 11, 23, 0, 15, 0);
  let clock = sunNight;

  await withMockedNow(
    () => clock,
    async () => {
      // Seed Sunday legacy progress & 1 completed unclaimed quest from Sunday before starting late-night session
      const sunState = applyCompletedSession(
        createInitialQuestState(sunNight - 2 * 60 * 60 * 1000, { useLegacySelection: true }),
        { completedDateKey: '2026-11-22', completedFocusMinutes: 25 },
        sunNight - 2 * 60 * 60 * 1000
      );
      await h.storage.setQuests(sunState);

      await h.sessionCoordinator.startSession('COUNTDOWN', 25, h.profileId);
      clock = monMorning;
      const completed = await h.sessionCoordinator.completeCountdown();
      assert.strictEqual(completed?.status, 'COMPLETED');

      const stats = await h.storage.getDailyStats();
      assert.strictEqual(stats['2026-11-22'], undefined, 'Day N must NOT receive session completed after 00:00');
      assert.strictEqual(stats['2026-11-23'].completedSessions, 1);

      const questsAfter = await h.storage.getQuests(monMorning);
      assert.strictEqual(questsAfter.dailyDateKey, '2026-11-23');
      assert.strictEqual(questsAfter.weeklyStartKey, '2026-11-23');
      // Midnight Monday rollover rotated away from legacy quests into fresh Quest Pool quests
      const monDailyDefs = getActiveQuestDefinitions('DAILY', questsAfter);
      const monWeeklyDefs = getActiveQuestDefinitions('WEEKLY', questsAfter);
      assert.strictEqual(monDailyDefs.length, 3);
      assert.strictEqual(monWeeklyDefs.length, 3);
      assert.ok(!questsAfter.daily.daily_first_spark, 'Monday rollover should select new Daily Slot A quest');
      assert.ok(questsAfter.daily[monDailyDefs[0].id].progress > 0);
      assert.ok(questsAfter.weekly[monWeeklyDefs[2].id].progress > 0);
      // Streak grew from Sunday (2026-11-22) -> Monday (2026-11-23) = 2 consecutive days
      assert.strictEqual(questsAfter.streak.currentDays, 2);
      assert.strictEqual(questsAfter.streak.lastCompletedDateKey, '2026-11-23');

      // Tuesday daily rollover expires unclaimed Monday Daily quest, keeps Weekly progress intact
      const tueMorning = localMs(2026, 11, 24, 0, 5, 0);
      const tueState = await h.questCoordinator.getQuestState(tueMorning);
      assert.strictEqual(tueState.questState.dailyDateKey, '2026-11-24');
      assert.strictEqual(tueState.questState.weeklyStartKey, '2026-11-23');
      const tueDailyIds = Object.keys(tueState.questState.daily);
      assert.strictEqual(tueDailyIds.length, 3);
      for (const qId of tueDailyIds) {
        assert.strictEqual(tueState.questState.daily[qId].progress, 0);
      }
      assert.ok(tueState.questState.weekly[monWeeklyDefs[2].id].progress > 0);
      assert.strictEqual(tueState.unclaimedCount, 0);

      // Clock rollback backward to Monday after Tuesday rollover cannot revive expired Monday Slot A reward
      await assert.rejects(
        () =>
          h.questCoordinator.claimQuestReward(
            { period: 'DAILY', questId: monDailyDefs[0].id },
            monMorning + 60_000
          ),
        (err: unknown) =>
          err instanceof QuestCoordinatorError &&
          (err.code === 'QUEST_NOT_COMPLETED' || err.code === 'QUEST_EXPIRED')
      );
    }
  );
});

test('Stage 2b QuestCoordinator.claimQuestReward: flat Coins/XP, IEEE-754 precision, calculatePlayerLevel, and NEVER mutates fq_daily_stats', async () => {
  // Civilization +25% bonus is active — must NOT multiply flat Quest rewards
  const h = await createHarness([{ id: 'b1', source: 'BUILDING', rate: 0.25 }]);
  const t = localMs(2026, 11, 18, 14, 0, 0);

  await h.storage.setEconomy({ focusCoins: 12.375, totalXP: 80, level: 1 });
  const preDailyStats: Record<string, DailyStatRecord> = {
    '2026-11-18': {
      date: '2026-11-18',
      totalFocusMinutes: 60,
      completedSessions: 2,
      abandonedSessions: 0,
      coinsEarned: 112.5,
      xpEarned: 360,
    },
  };
  await h.storage.setDailyStats(preDailyStats);

  let q = createInitialQuestState(t, { useLegacySelection: true });
  q = applyCompletedSession(q, { completedDateKey: '2026-11-18', completedFocusMinutes: 60 }, t);
  await h.storage.setQuests(q);

  const infoBefore = await h.questCoordinator.getQuestState(t);
  assert.strictEqual(infoBefore.unclaimedCount, 2); // daily_first_spark (1/1) + daily_steady_rhythm (60/60)

  const claimRes = await h.questCoordinator.claimQuestReward(
    { period: 'DAILY', questId: 'daily_first_spark' },
    t + 1000
  );
  assert.strictEqual(claimRes.claimedCoins, 10);
  assert.strictEqual(claimRes.claimedXp, 25);
  // IEEE-754 decimal balance preserved cleanly: 12.375 + 10 = 22.375; 80 + 25 = 105 -> Level 2
  assert.strictEqual(claimRes.economy.focusCoins, 22.375);
  assert.strictEqual(claimRes.economy.totalXP, 105);
  assert.strictEqual(claimRes.economy.level, calculatePlayerLevel(105));
  assert.strictEqual(claimRes.economy.level, 2);
  assert.strictEqual(claimRes.questState.daily.daily_first_spark.claimed, true);

  // DailyStats MUST NOT include flat Quest claim Coins/XP
  assert.deepStrictEqual(await h.storage.getDailyStats(), preDailyStats);

  // Check info after claim
  const infoAfter = await h.questCoordinator.getQuestState(t + 2000);
  assert.strictEqual(infoAfter.unclaimedCount, 1);
});

test('Stage 2b QuestCoordinator Claim rejections: QUEST_EXPIRED, QUEST_ALREADY_CLAIMED, QUEST_NOT_COMPLETED, anti-rollback ledger', async () => {
  const h = await createHarness();
  const day1 = localMs(2026, 11, 18, 23, 50, 0);
  const day2 = localMs(2026, 11, 19, 0, 5, 0);

  let q = createInitialQuestState(day1, { useLegacySelection: true });
  q = applyCompletedSession(q, { completedDateKey: '2026-11-18', completedFocusMinutes: 60 }, day1);
  await h.storage.setQuests(q);

  // Incomplete quest check (weekly_tenacity_10 is 1/10)
  await assert.rejects(
    () => h.questCoordinator.claimQuestReward({ period: 'WEEKLY', questId: 'weekly_tenacity_10' }, day1 + 1000),
    (err: unknown) => err instanceof QuestCoordinatorError && err.code === 'QUEST_NOT_COMPLETED'
  );

  // Claim daily_first_spark normally on day1
  await h.questCoordinator.claimQuestReward({ period: 'DAILY', questId: 'daily_first_spark' }, day1 + 2000);

  // Re-claiming same quest throws QUEST_ALREADY_CLAIMED
  await assert.rejects(
    () => h.questCoordinator.claimQuestReward({ period: 'DAILY', questId: 'daily_first_spark' }, day1 + 3000),
    (err: unknown) => err instanceof QuestCoordinatorError && err.code === 'QUEST_ALREADY_CLAIMED'
  );

  // Even if someone tampers with entry.claimed = false without clearing recentClaimedKeys, ledger blocks double-claim
  const stored = await h.storage.getQuests(day1 + 3000);
  await h.storage.setQuests({
    ...stored,
    daily: {
      ...stored.daily,
      daily_first_spark: { ...stored.daily.daily_first_spark, claimed: false, claimedAt: null },
    },
  });
  await assert.rejects(
    () => h.questCoordinator.claimQuestReward({ period: 'DAILY', questId: 'daily_first_spark' }, day1 + 4000),
    (err: unknown) => err instanceof QuestCoordinatorError && err.code === 'QUEST_ALREADY_CLAIMED'
  );

  // Rollover into day2 while daily_steady_rhythm was completed & unclaimed -> QUEST_EXPIRED!
  await assert.rejects(
    () => h.questCoordinator.claimQuestReward({ period: 'DAILY', questId: 'daily_steady_rhythm' }, day2),
    (err: unknown) => err instanceof QuestCoordinatorError && err.code === 'QUEST_EXPIRED'
  );
});

test('Stage 2b Concurrency: parallel CLAIM_QUEST_REWARD double-claim prevention & Claim vs completeCountdown serialization', async () => {
  const h = await createHarness();
  const baseNow = localMs(2026, 11, 18, 15, 0, 0);

  await withMockedNow(
    () => baseNow,
    async () => {
      const q = applyCompletedSession(
        createInitialQuestState(baseNow, { useLegacySelection: true }),
        { completedDateKey: '2026-11-18', completedFocusMinutes: 25 },
        baseNow
      );
      await h.storage.setQuests(q);

      // Slow adapter.setMultiple slightly so concurrent calls truly contend for StorageMutex
      const origSetMult = h.adapter.setMultiple.bind(h.adapter);
      h.adapter.setMultiple = async (items) => {
        await new Promise((r) => setTimeout(r, 10));
        return origSetMult(items);
      };

      // 1. Two parallel CLAIM_QUEST_REWARD requests for the exact same quest
      const [resA, resB] = await Promise.all([
        h.messageHandler.handleMessage({
          action: 'CLAIM_QUEST_REWARD',
          payload: { period: 'DAILY', questId: 'daily_first_spark' },
        }),
        h.messageHandler.handleMessage({
          action: 'CLAIM_QUEST_REWARD',
          payload: { period: 'DAILY', questId: 'daily_first_spark' },
        }),
      ]);

      const successes = [resA, resB].filter((r) => r.success);
      const failures = [resA, resB].filter((r) => !r.success);
      assert.strictEqual(successes.length, 1);
      assert.strictEqual(failures.length, 1);
      assert.strictEqual(failures[0].errorCode, 'QUEST_ALREADY_CLAIMED');

      const ecoAfterRace = await h.storage.getEconomy();
      assert.strictEqual(ecoAfterRace.focusCoins, 10);
      assert.strictEqual(ecoAfterRace.totalXP, 25);

      // 2. Interleaved completeCountdown + CLAIM_QUEST_REWARD for a second completed quest
      const q2 = applyCompletedSession(
        await h.storage.getQuests(baseNow),
        { completedDateKey: '2026-11-18', completedFocusMinutes: 35 },
        baseNow
      );
      await h.storage.setQuests(q2);
      // Now daily_steady_rhythm = 60/60 unclaimed, daily_double_tap = 2/2 unclaimed
      await h.sessionCoordinator.startSession('COUNTDOWN', 25, h.profileId);

      const [sessionDone, claimSteady] = await Promise.all([
        h.sessionCoordinator.completeCountdown(),
        h.questCoordinator.claimQuestReward(
          { period: 'DAILY', questId: 'daily_steady_rhythm' },
          baseNow
        ),
      ]);

      assert.strictEqual(sessionDone?.status, 'COMPLETED');
      assert.strictEqual(claimSteady.claimedCoins, 15);
      // Final economy = prior (10C, 25XP) + session (37.5C, 125XP) + claim (15C, 35XP) = 62.5C, 185XP
      const finalEco = await h.storage.getEconomy();
      assert.strictEqual(finalEco.focusCoins, 62.5);
      assert.strictEqual(finalEco.totalXP, 185);
      // Both session progress (weekly_tenacity_10 = 3) and claimed flag preserved without lost update!
      const finalQuests = await h.storage.getQuests(baseNow);
      assert.strictEqual(finalQuests.daily.daily_steady_rhythm.claimed, true);
      assert.strictEqual(finalQuests.weekly.weekly_tenacity_10.progress, 3);
    }
  );
});

test('Stage 2b MessageHandler & ErrorTranslator (EN/VI): validation, errorCodes, and zero sensitive leaks', async () => {
  const h = await createHarness();

  // 1. GET_QUEST_STATE through MessageHandler
  const getRes = await h.messageHandler.handleMessage({ action: 'GET_QUEST_STATE' });
  assert.strictEqual(getRes.success, true);
  const qData = getRes.data as GetQuestStateResponseData;
  assert.ok(qData.questState);
  assert.strictEqual(typeof qData.resetCountdown.dailyResetInMs, 'number');
  assert.strictEqual(typeof qData.unclaimedCount, 'number');

  // 2. Malformed payloads -> INVALID_QUEST_PAYLOAD
  const invalidPayloads: unknown[] = [
    undefined,
    null,
    [],
    { period: 'MONTHLY', questId: 'daily_first_spark' },
    { period: 'DAILY', questId: '   ' },
    { period: 'DAILY', questId: 123 },
    { period: 'DAILY', questId: 'a'.repeat(65) },
    { period: 'DAILY', questId: 'bad<script>' },
  ];
  for (const payload of invalidPayloads) {
    const res = await h.messageHandler.handleMessage({
      action: 'CLAIM_QUEST_REWARD',
      payload,
    } as never);
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.errorCode, 'INVALID_QUEST_PAYLOAD');
    assert.ok(localizeErrorMessage('en', res.error).length > 0);
    const viMsg = localizeErrorMessage('vi', res.error);
    assert.notStrictEqual(viMsg, res.error, `Missing VI translation for: ${res.error}`);
  }

  // 3. UNKNOWN_QUEST & QUEST_PERIOD_MISMATCH
  const unknownRes = await h.messageHandler.handleMessage({
    action: 'CLAIM_QUEST_REWARD',
    payload: { period: 'DAILY', questId: 'quest_does_not_exist' },
  });
  assert.strictEqual(unknownRes.success, false);
  assert.strictEqual(unknownRes.errorCode, 'UNKNOWN_QUEST');
  assert.match(localizeErrorMessage('vi', unknownRes.error), /Không tìm thấy nhiệm vụ/);

  const mismatchRes = await h.messageHandler.handleMessage({
    action: 'CLAIM_QUEST_REWARD',
    payload: { period: 'WEEKLY', questId: 'daily_first_spark' },
  });
  assert.strictEqual(mismatchRes.success, false);
  assert.strictEqual(mismatchRes.errorCode, 'QUEST_PERIOD_MISMATCH');
  assert.match(localizeErrorMessage('vi', mismatchRes.error), /Hàng tuần/);

  // 4. QUEST_NOT_COMPLETED, QUEST_ALREADY_CLAIMED, QUEST_EXPIRED VI translations
  assert.match(
    localizeErrorMessage('vi', 'Quest "daily_first_spark" is not completed yet (0/1).'),
    /chưa hoàn thành \(0\/1\)/
  );
  assert.match(
    localizeErrorMessage('vi', 'Quest "daily_first_spark" reward has already been claimed.'),
    /đã được nhận trước đó/
  );
  assert.match(
    localizeErrorMessage('vi', 'Quest "daily_first_spark" reward expired after period reset.'),
    /đã hết hạn/
  );
  // Ensure clean user-facing error contains no stack traces or internal file paths
  assert.ok(!unknownRes.error?.includes('/app/') && !unknownRes.error?.includes('Error:'));
});

test('Stage 2b ExtensionClient Simulator: deterministic GET_QUEST_STATE, CLAIM_QUEST_REWARD & completed session sync', async () => {
  // Verify GET_QUEST_STATE seeded deterministically without Math.random
  const initialRes = await sendExtensionMessage<GetQuestStateResponseData>({
    action: 'GET_QUEST_STATE',
  });
  assert.strictEqual(initialRes.success, true);
  assert.ok(initialRes.data);
  const activeDaily = getActiveQuestDefinitions('DAILY', initialRes.data.questState);
  assert.strictEqual(activeDaily.length, 3);
  const slotADef = activeDaily[0];

  const preEcoRes = await sendExtensionMessage<FullSessionStateResponse>({
    action: 'GET_SESSION_STATE',
  });
  const ecoBefore = preEcoRes.data!.economy;

  // Claim active Slot A quest (completed by simulator's initial 25m session -> 10C / 25XP)
  const claimRes = await sendExtensionMessage<ClaimQuestRewardResponseData>({
    action: 'CLAIM_QUEST_REWARD',
    payload: { period: 'DAILY', questId: slotADef.id },
  });
  assert.strictEqual(claimRes.success, true);
  assert.strictEqual(claimRes.data?.claimedCoins, 10);
  assert.strictEqual(claimRes.data?.claimedXp, 25);
  assert.strictEqual(
    claimRes.data?.economy.focusCoins,
    ecoBefore.focusCoins + slotADef.rewardCoins
  );

  // Double-claim in simulator returns QUEST_ALREADY_CLAIMED
  const dupClaimRes = await sendExtensionMessage({
    action: 'CLAIM_QUEST_REWARD',
    payload: { period: 'DAILY', questId: slotADef.id },
  });
  assert.strictEqual(dupClaimRes.success, false);
  assert.strictEqual(dupClaimRes.errorCode, 'QUEST_ALREADY_CLAIMED');

  // Period mismatch & unknown quest in simulator match backend errorCodes
  const mismatchSim = await sendExtensionMessage({
    action: 'CLAIM_QUEST_REWARD',
    payload: { period: 'DAILY', questId: 'weekly_habit_builder' },
  });
  assert.strictEqual(mismatchSim.success, false);
  assert.strictEqual(mismatchSim.errorCode, 'QUEST_PERIOD_MISMATCH');

  const unknownSim = await sendExtensionMessage({
    action: 'CLAIM_QUEST_REWARD',
    payload: { period: 'DAILY', questId: 'missing_quest' },
  });
  assert.strictEqual(unknownSim.success, false);
  assert.strictEqual(unknownSim.errorCode, 'UNKNOWN_QUEST');

  // Completing an elapsed COUNTDOWN via GET_SESSION_STATE advances active Daily Slot B quest
  const slotBDef = activeDaily[1];
  await sendExtensionMessage({ action: 'RESET_SESSION' });
  await sendExtensionMessage({
    action: 'START_SESSION',
    payload: { mode: 'COUNTDOWN', targetMinutes: 35, profileId: 'profile-study-research' },
  });
  const beforeQ = await sendExtensionMessage<GetQuestStateResponseData>({ action: 'GET_QUEST_STATE' });
  const prevSlotBProgress = beforeQ.data!.questState.daily[slotBDef.id].progress;

  // Give Up does NOT advance Slot B
  await sendExtensionMessage({ action: 'GIVE_UP_SESSION' });
  await sendExtensionMessage({ action: 'RESET_SESSION' });
  const afterGiveUp = await sendExtensionMessage<GetQuestStateResponseData>({
    action: 'GET_QUEST_STATE',
  });
  assert.strictEqual(afterGiveUp.data!.questState.daily[slotBDef.id].progress, prevSlotBProgress);

  // Completing an elapsed 35m COUNTDOWN advances Slot B (either >=45m or >=60m or 1x60m)
  const simStartClock = Date.now();
  await sendExtensionMessage({
    action: 'START_SESSION',
    payload: { mode: 'COUNTDOWN', targetMinutes: 35, profileId: 'profile-study-research' },
  });
  await withMockedNow(
    () => simStartClock + 35 * 60 * 1000 + 500,
    async () => {
      const stateRes = await sendExtensionMessage<FullSessionStateResponse>({
        action: 'GET_SESSION_STATE',
      });
      assert.strictEqual(stateRes.success, true);
      assert.strictEqual(stateRes.data?.currentSession?.status, 'COMPLETED');
      const afterComplete = await sendExtensionMessage<GetQuestStateResponseData>({
        action: 'GET_QUEST_STATE',
      });
      const expectedAfter =
        slotBDef.metric === 'FOCUS_MINUTES'
          ? Math.min(slotBDef.target, prevSlotBProgress + 35)
          : prevSlotBProgress;
      assert.strictEqual(afterComplete.data!.questState.daily[slotBDef.id].progress, expectedAfter);
    }
  );
  await sendExtensionMessage({ action: 'RESET_SESSION' });

  // Verify today's local date key aligns with getLocalDateKey()
  assert.strictEqual(afterGiveUp.data!.questState.dailyDateKey, getLocalDateKey());
});

test('Milestone 5D-1 Coordinator: SW restart & same-day getQuestState do not reroll; inactive pool quests cannot be claimed mid-period', async () => {
  const h = await createHarness();
  const day1 = localMs(2026, 11, 18, 10, 0, 0);

  const first = await h.questCoordinator.getQuestState(day1);
  const firstDailyIds = Object.keys(first.questState.daily);
  const firstWeeklyIds = Object.keys(first.questState.weekly);
  assert.strictEqual(firstDailyIds.length, 3);
  assert.strictEqual(firstWeeklyIds.length, 3);

  // Simulate Service Worker restart with a fresh QuestCoordinator instance on same StorageManager
  const freshCoordinator = new QuestCoordinator(h.storage);
  const afterRestart = await freshCoordinator.getQuestState(day1 + 2 * 60 * 60 * 1000);
  assert.deepStrictEqual(Object.keys(afterRestart.questState.daily), firstDailyIds);
  assert.deepStrictEqual(Object.keys(afterRestart.questState.weekly), firstWeeklyIds);

  // Inactive pool quest in same slot must reject claim cleanly
  const inactiveDailyA = getSlotDefinitions('DAILY', 'A').find(
    (q) => !firstDailyIds.includes(q.id)
  )!;
  await assert.rejects(
    () => freshCoordinator.claimQuestReward({ period: 'DAILY', questId: inactiveDailyA.id }, day1 + 5000),
    (err: unknown) => err instanceof QuestCoordinatorError && err.code === 'QUEST_NOT_COMPLETED'
  );
});
