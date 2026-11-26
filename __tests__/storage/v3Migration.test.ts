import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStorageAdapter } from '../../src/storage/memoryStorageAdapter.ts';
import { StorageManager } from '../../src/storage/storageManager.ts';
import {
  CURRENT_SCHEMA_VERSION,
  MigrationRunner,
} from '../../src/storage/migrations/migrationRunner.ts';
import { v3_questsSchema } from '../../src/storage/migrations/v3_questsSchema.ts';
import { STORAGE_KEYS } from '../../src/storage/storageKeys.ts';
import { PlayerEconomy } from '../../src/types/economy.ts';
import { DailyStatRecord, UserSettings } from '../../src/types/storageSchema.ts';
import { FocusProfile } from '../../src/types/profiles.ts';
import { SessionSnapshot } from '../../src/types/session.ts';
import { QuestState } from '../../src/types/quests.ts';
import { CivilizationState, createInitialCivilizationState } from '../../src/core/civilization/index.ts';
import {
  applyCompletedSession,
  claimQuest,
  createInitialQuestState,
  formatLocalDateKey,
  getActiveQuestDefinitions,
} from '../../src/core/quests/index.ts';
import {
  MockAlarmsAdapter,
  MockBadgeAdapter,
  MockDNRAdapter,
  MockNotificationsAdapter,
  MockTabsAdapter,
} from '../mocks/chromeMock.ts';
import { BlockingCoordinator } from '../../src/background/blockingCoordinator.ts';
import { SessionCoordinator } from '../../src/background/sessionCoordinator.ts';
import { ProfileManager } from '../../src/core/profiles/profileManager.ts';

function createSessionHarness(storageManager: StorageManager) {
  const alarms = new MockAlarmsAdapter();
  const notifications = new MockNotificationsAdapter();
  const badge = new MockBadgeAdapter();
  const blocking = new BlockingCoordinator(new MockDNRAdapter(), new MockTabsAdapter([]));
  const profileManager = new ProfileManager(storageManager);
  const coordinator = new SessionCoordinator(
    storageManager,
    profileManager,
    alarms,
    notifications,
    badge,
    blocking
  );
  return { coordinator, profileManager };
}

test('Migration v3: upgrades v2 -> v3 preserving 100% of player data with zero historical quest backfill', async () => {
  const storage = new MemoryStorageAdapter();

  const v2Economy: PlayerEconomy = { focusCoins: 63.375, totalXP: 450, level: 3 };
  const v2Profile: FocusProfile = {
    id: 'profile-v2-study',
    name: 'Deep Study',
    allowedDomains: ['arxiv.org'],
    isDefault: true,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
  };
  const v2DailyStats: Record<string, DailyStatRecord> = {
    '2026-11-15': {
      date: '2026-11-15',
      totalFocusMinutes: 180,
      completedSessions: 5,
      abandonedSessions: 0,
      coinsEarned: 450,
      xpEarned: 1500,
    },
    '2026-11-16': {
      date: '2026-11-16',
      totalFocusMinutes: 90,
      completedSessions: 2,
      abandonedSessions: 0,
      coinsEarned: 216,
      xpEarned: 720,
    },
  };
  const v2Settings: UserSettings = {
    soundEnabled: false,
    notificationsEnabled: true,
    language: 'vi',
    chimeEnabled: true,
  };
  const v2Civ: CivilizationState = createInitialCivilizationState();
  const v2Session: SessionSnapshot = {
    id: 'active-v2-sess',
    mode: 'COUNTDOWN',
    profileId: v2Profile.id,
    status: 'RUNNING',
    targetMinutes: 25,
    lockedMultiplier: 1.0,
    startedAt: 1_700_000_000_000,
    currentPauseStartedAt: null,
    pauseCount: 0,
    totalPauseMs: 0,
    pauseHistory: [],
    lastHeartbeatAt: 1_700_000_010_000,
    completedAt: null,
    rewardProcessed: false,
  };

  await storage.set(STORAGE_KEYS.SCHEMA_VERSION, 2);
  await storage.set(STORAGE_KEYS.ECONOMY, v2Economy);
  await storage.set(STORAGE_KEYS.PROFILES, [v2Profile]);
  await storage.set(STORAGE_KEYS.ACTIVE_PROFILE_ID, v2Profile.id);
  await storage.set(STORAGE_KEYS.DAILY_STATS, v2DailyStats);
  await storage.set(STORAGE_KEYS.SETTINGS, v2Settings);
  await storage.set(STORAGE_KEYS.CIVILIZATION, v2Civ);
  await storage.set(STORAGE_KEYS.CURRENT_SESSION, v2Session);

  assert.strictEqual(CURRENT_SCHEMA_VERSION, 7);

  const runner = new MigrationRunner(storage);
  const res = await runner.runMigrations();
  assert.strictEqual(res.previousVersion, 2);
  assert.strictEqual(res.currentVersion, 7);
  assert.strictEqual(await storage.get<number>(STORAGE_KEYS.SCHEMA_VERSION), 7);

  // All prior v2 data preserved bit-for-bit (v6 adds default jobs/founderRole)
  assert.deepStrictEqual(await storage.get<PlayerEconomy>(STORAGE_KEYS.ECONOMY), v2Economy);
  assert.strictEqual((await storage.get<PlayerEconomy>(STORAGE_KEYS.ECONOMY))?.focusCoins, 63.375);
  assert.deepStrictEqual(await storage.get<FocusProfile[]>(STORAGE_KEYS.PROFILES), [v2Profile]);
  assert.strictEqual(await storage.get<string>(STORAGE_KEYS.ACTIVE_PROFILE_ID), v2Profile.id);
  assert.deepStrictEqual(await storage.get<Record<string, DailyStatRecord>>(STORAGE_KEYS.DAILY_STATS), v2DailyStats);
  assert.deepStrictEqual(await storage.get<UserSettings>(STORAGE_KEYS.SETTINGS), v2Settings);
  assert.deepStrictEqual(await storage.get<CivilizationState>(STORAGE_KEYS.CIVILIZATION), {
    ...v2Civ,
    jobs: [],
    founderRole: null,
  });
  assert.deepStrictEqual(await storage.get<SessionSnapshot>(STORAGE_KEYS.CURRENT_SESSION), v2Session);

  // Quests seeded clean with ZERO historical session backfill (3 active Daily + 3 active Weekly)
  const quests = await storage.get<QuestState>(STORAGE_KEYS.QUESTS);
  assert.ok(quests);
  const activeDaily = getActiveQuestDefinitions('DAILY', quests);
  const activeWeekly = getActiveQuestDefinitions('WEEKLY', quests);
  assert.strictEqual(activeDaily.length, 3);
  assert.strictEqual(activeWeekly.length, 3);
  for (const def of activeDaily) {
    assert.strictEqual(quests.daily[def.id].progress, 0);
    assert.strictEqual(quests.daily[def.id].claimed, false);
  }
  for (const def of activeWeekly) {
    assert.strictEqual(quests.weekly[def.id].progress, 0);
    assert.strictEqual(quests.weekly[def.id].claimed, false);
  }
  assert.strictEqual(quests.streak.currentDays, 0);
  assert.strictEqual(quests.streak.longestDays, 0);
  assert.strictEqual(quests.streak.lastCompletedDateKey, null);
});

test('Migration v3: upgrades empty storage & legacy v1 storage cleanly up to CURRENT_SCHEMA_VERSION', async () => {
  const emptyStorage = new MemoryStorageAdapter();
  const resEmpty = await new MigrationRunner(emptyStorage).runMigrations();
  assert.strictEqual(resEmpty.previousVersion, 0);
  assert.strictEqual(resEmpty.currentVersion, CURRENT_SCHEMA_VERSION);
  assert.ok(await emptyStorage.get(STORAGE_KEYS.PROFILES));
  assert.ok(await emptyStorage.get(STORAGE_KEYS.CIVILIZATION));
  assert.ok(await emptyStorage.get(STORAGE_KEYS.QUESTS));

  const v1Storage = new MemoryStorageAdapter();
  await v1Storage.set(STORAGE_KEYS.SCHEMA_VERSION, 1);
  await v1Storage.set(STORAGE_KEYS.ECONOMY, { focusCoins: 18.75, totalXP: 125, level: 2 });
  const resV1 = await new MigrationRunner(v1Storage).runMigrations();
  assert.strictEqual(resV1.previousVersion, 1);
  assert.strictEqual(resV1.currentVersion, CURRENT_SCHEMA_VERSION);
  assert.strictEqual((await v1Storage.get<PlayerEconomy>(STORAGE_KEYS.ECONOMY))?.focusCoins, 18.75);
  assert.ok(await v1Storage.get(STORAGE_KEYS.CIVILIZATION));
  assert.ok(await v1Storage.get(STORAGE_KEYS.QUESTS));
});

test('Migration v3: strictly idempotent and preserves existing quest progress & sanitizes corrupt fq_quests', async () => {
  const storage = new MemoryStorageAdapter();
  const runner = new MigrationRunner(storage);
  await runner.runMigrations();

  // Record legitimate progress & claim using legacy 3+3 selection
  const manager = new StorageManager(storage);
  const fixedNow = new Date(2026, 10, 18, 12, 0, 0, 0).getTime();
  let state = createInitialQuestState(fixedNow, { useLegacySelection: true });
  state = {
    ...state,
    dailyDateKey: '2026-11-18',
    weeklyStartKey: '2026-11-16',
    lastSettledTimestamp: fixedNow,
  };
  state = applyCompletedSession(state, { completedDateKey: '2026-11-18', completedFocusMinutes: 25 }, fixedNow);
  state = claimQuest(state, 'DAILY', 'daily_first_spark', fixedNow).state;
  await manager.setQuests(state);

  // Re-running MigrationRunner skips cleanly
  const second = await runner.runMigrations();
  assert.strictEqual(second.previousVersion, CURRENT_SCHEMA_VERSION);
  assert.strictEqual(second.currentVersion, CURRENT_SCHEMA_VERSION);
  assert.deepStrictEqual(await storage.get<QuestState>(STORAGE_KEYS.QUESTS), state);

  // Even calling v3_questsSchema.up directly after forcing version 2 preserves valid quest state
  await storage.set(STORAGE_KEYS.SCHEMA_VERSION, 2);
  await v3_questsSchema.up(storage);
  assert.strictEqual(await storage.get<number>(STORAGE_KEYS.SCHEMA_VERSION), 3);
  assert.deepStrictEqual(await storage.get<QuestState>(STORAGE_KEYS.QUESTS), state);

  // Corrupt fq_quests sanitizes cleanly without throwing via both v3 migration and StorageManager
  await storage.set(STORAGE_KEYS.SCHEMA_VERSION, 2);
  await storage.set(STORAGE_KEYS.QUESTS, {
    dailyDateKey: 'bad-date',
    daily: { daily_first_spark: { progress: Number.NaN } },
    streak: { currentDays: -9, longestDays: 'corrupt' },
  });
  await v3_questsSchema.up(storage);
  const healed = await manager.getQuests(fixedNow);
  assert.strictEqual(healed.daily.daily_first_spark.progress, 0);
  assert.strictEqual(healed.streak.currentDays, 0);
});

test('StorageManager Quests accessors work cleanly & Stage 2a does NOT alter existing session Coins/XP/Level/DailyStats', async () => {
  const adapter = new MemoryStorageAdapter();
  await new MigrationRunner(adapter).runMigrations();
  const manager = new StorageManager(adapter);

  const nowMs = Date.now();
  const initialQuests = await manager.getQuests(nowMs);
  assert.strictEqual(initialQuests.dailyDateKey, formatLocalDateKey(nowMs));
  assert.strictEqual(getActiveQuestDefinitions('DAILY', initialQuests).length, 3);

  const testNowMs = Date.now();
  const legacyInitial = createInitialQuestState(testNowMs, { useLegacySelection: true });
  await manager.setQuests(legacyInitial);
  const mutated = await manager.updateQuests((curr) =>
    applyCompletedSession(curr, { completedDateKey: curr.dailyDateKey, completedFocusMinutes: 25 }, curr.lastSettledTimestamp)
  );
  assert.strictEqual(mutated.daily.daily_first_spark.progress, 1);

  // Reset quests snapshot cleanly to current day and verify SessionCoordinator settlement across modes
  await manager.setQuests(createInitialQuestState(testNowMs, { useLegacySelection: true }));
  const { coordinator, profileManager } = createSessionHarness(manager);
  const profile = await profileManager.createProfile('Stage2a Check', ['example.com']);

  // 1. Countdown 25m -> 37.5 Coins, 125 XP
  await coordinator.startSession('COUNTDOWN', 25, profile.id);
  const cdDone = await coordinator.completeCountdown();
  assert.strictEqual(cdDone?.status, 'COMPLETED');
  let eco = await manager.getEconomy();
  assert.strictEqual(eco.focusCoins, 37.5);
  assert.strictEqual(eco.totalXP, 125);
  assert.strictEqual(eco.level, 2);

  // 2. Countdown Give Up -> +0 Coins, +0 XP
  await coordinator.resetSession();
  await coordinator.startSession('COUNTDOWN', 25, profile.id);
  await coordinator.giveUpCountdown();
  eco = await manager.getEconomy();
  assert.strictEqual(eco.focusCoins, 37.5);
  assert.strictEqual(eco.totalXP, 125);

  // 3. Stopwatch 30m -> +36 Coins (30 * 1.0 * 1.2), +108 XP (30 * 3.0 * 1.2)
  await coordinator.resetSession();
  await coordinator.startSession('STOPWATCH', 0, profile.id);
  const thirtyMinAgo = Date.now() - 30 * 60 * 1000 - 200;
  await manager.updateCurrentSession((s) => ({
    ...s!,
    startedAt: thirtyMinAgo,
    lastCheckpointAt: thirtyMinAgo,
  }));
  const swDone = await coordinator.finishStopwatch();
  assert.strictEqual(swDone.coinsEarned, 36);
  assert.strictEqual(swDone.xpEarned, 108);

  // 4. Pomodoro Countdown config check (untouched session flow -> 2 * 25m = 50m -> 1.2x lockedMultiplier)
  await coordinator.resetSession();
  const pomo = await coordinator.startSession('POMODORO_COUNTDOWN', 0, profile.id, {
    focusDurationMinutes: 25,
    focusIntervalDurationMinutes: 25,
    shortBreakDurationMinutes: 5,
    longBreakDurationMinutes: 15,
    targetFocusSessions: 2,
    focusIntervalsPerCycle: 2,
    numberOfCycles: 1,
  });
  assert.strictEqual(pomo.targetMinutes, 25);
  assert.strictEqual(pomo.lockedMultiplier, 1.2);
  assert.strictEqual(pomo.pomodoroConfig?.focusIntervalsPerCycle, 2);

  // Stage 2b: completed 25m Countdown + Give Up (0) + 30m Stopwatch -> 2 sessions, 55m credited to fq_quests
  const questsAfterSessions = await manager.getQuests(Date.now());
  assert.strictEqual(questsAfterSessions.daily.daily_first_spark.progress, 1);
  assert.strictEqual(questsAfterSessions.daily.daily_first_spark.completed, true);
  assert.strictEqual(questsAfterSessions.daily.daily_double_tap.progress, 2);
  assert.strictEqual(questsAfterSessions.daily.daily_double_tap.completed, true);
  assert.strictEqual(questsAfterSessions.daily.daily_steady_rhythm.progress, 55);
  assert.strictEqual(questsAfterSessions.daily.daily_steady_rhythm.completed, false);
  assert.strictEqual(questsAfterSessions.weekly.weekly_tenacity_10.progress, 2);
  assert.strictEqual(questsAfterSessions.weekly.weekly_habit_builder.progress, 1);
  assert.strictEqual(questsAfterSessions.streak.currentDays, 1);
});
