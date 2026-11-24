import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MemoryStorageAdapter } from '../../src/storage/memoryStorageAdapter.ts';
import {
  CURRENT_SCHEMA_VERSION,
  MigrationRunner,
} from '../../src/storage/migrations/migrationRunner.ts';
import { v5_questPoolSchema } from '../../src/storage/migrations/v5_questPoolSchema.ts';
import { STORAGE_KEYS } from '../../src/storage/storageKeys.ts';
import { CURRENT_QUEST_STATE_VERSION, QuestState } from '../../src/types/quests.ts';
import {
  applyCompletedSession,
  getActiveQuestDefinitions,
  rolloverQuestState,
} from '../../src/core/quests/questEngine.ts';
import { PlayerEconomy } from '../../src/types/economy.ts';
import { CivilizationState, createInitialCivilizationState } from '../../src/core/civilization/index.ts';

test('Migration v5: upgrades v4 legacy fq_quests preserving active quests, progress, claims, ledger, streak, and unrelated data until rollover', async () => {
  const storage = new MemoryStorageAdapter();
  const nowMs = new Date(2026, 10, 18, 15, 0, 0, 0).getTime();

  const legacyV4Quests: QuestState = {
    schemaVersion: 1,
    dailyDateKey: '2026-11-18',
    weeklyStartKey: '2026-11-16',
    daily: {
      daily_first_spark: {
        questId: 'daily_first_spark',
        period: 'DAILY',
        progress: 1,
        target: 1,
        completed: true,
        claimed: true,
        claimedAt: nowMs - 3600_000,
      },
      daily_steady_rhythm: {
        questId: 'daily_steady_rhythm',
        period: 'DAILY',
        progress: 45,
        target: 60,
        completed: false,
        claimed: false,
        claimedAt: null,
      },
      daily_double_tap: {
        questId: 'daily_double_tap',
        period: 'DAILY',
        progress: 1,
        target: 2,
        completed: false,
        claimed: false,
        claimedAt: null,
      },
    },
    weekly: {
      weekly_habit_builder: {
        questId: 'weekly_habit_builder',
        period: 'WEEKLY',
        progress: 3,
        target: 4,
        completed: false,
        claimed: false,
        claimedAt: null,
      },
      weekly_deep_diver: {
        questId: 'weekly_deep_diver',
        period: 'WEEKLY',
        progress: 2,
        target: 3,
        completed: false,
        claimed: false,
        claimedAt: null,
      },
      weekly_tenacity_10: {
        questId: 'weekly_tenacity_10',
        period: 'WEEKLY',
        progress: 7,
        target: 10,
        completed: false,
        claimed: false,
        claimedAt: null,
      },
    },
    weeklyActiveDateKeys: ['2026-11-16', '2026-11-17', '2026-11-18'],
    streak: {
      currentDays: 4,
      longestDays: 9,
      lastCompletedDateKey: '2026-11-18',
    },
    lastSettledTimestamp: nowMs,
    processedPeriodKeys: ['daily:2026-11-17', 'daily:2026-11-18', 'weekly:2026-11-16'],
    recentClaimedKeys: ['daily:2026-11-18:daily_first_spark', 'weekly:2026-11-09:weekly_deep_diver'],
  };

  const economy: PlayerEconomy = { focusCoins: 245.5, totalXP: 980, level: 5 };
  const civ: CivilizationState = createInitialCivilizationState();

  await storage.set(STORAGE_KEYS.SCHEMA_VERSION, 4);
  await storage.set(STORAGE_KEYS.QUESTS, legacyV4Quests);
  await storage.set(STORAGE_KEYS.ECONOMY, economy);
  await storage.set(STORAGE_KEYS.CIVILIZATION, civ);

  assert.strictEqual(CURRENT_SCHEMA_VERSION, 5);
  const res = await new MigrationRunner(storage).runMigrations();
  assert.strictEqual(res.previousVersion, 4);
  assert.strictEqual(res.currentVersion, 5);
  assert.strictEqual(await storage.get<number>(STORAGE_KEYS.SCHEMA_VERSION), 5);

  const migrated = await storage.get<QuestState>(STORAGE_KEYS.QUESTS);
  assert.ok(migrated);
  assert.strictEqual(migrated.schemaVersion, CURRENT_QUEST_STATE_VERSION);
  assert.strictEqual(migrated.schemaVersion, 2);
  assert.ok(typeof migrated.salt === 'string' && migrated.salt.length >= 8);

  // Legacy active 3+3 quests, partial progress, claims, ledger, processedPeriodKeys, and streak remain intact!
  assert.deepStrictEqual(Object.keys(migrated.daily), [
    'daily_first_spark',
    'daily_steady_rhythm',
    'daily_double_tap',
  ]);
  assert.deepStrictEqual(Object.keys(migrated.weekly), [
    'weekly_habit_builder',
    'weekly_deep_diver',
    'weekly_tenacity_10',
  ]);
  assert.strictEqual(migrated.daily.daily_first_spark.claimed, true);
  assert.strictEqual(migrated.daily.daily_first_spark.claimedAt, nowMs - 3600_000);
  assert.strictEqual(migrated.daily.daily_steady_rhythm.progress, 45);
  assert.strictEqual(migrated.daily.daily_double_tap.progress, 1);
  assert.strictEqual(migrated.weekly.weekly_habit_builder.progress, 3);
  assert.strictEqual(migrated.weekly.weekly_deep_diver.progress, 2);
  assert.strictEqual(migrated.weekly.weekly_tenacity_10.progress, 7);
  assert.deepStrictEqual(migrated.weeklyActiveDateKeys, ['2026-11-16', '2026-11-17', '2026-11-18']);
  assert.deepStrictEqual(migrated.streak, legacyV4Quests.streak);
  assert.deepStrictEqual(migrated.processedPeriodKeys, legacyV4Quests.processedPeriodKeys);
  assert.deepStrictEqual(migrated.recentClaimedKeys, legacyV4Quests.recentClaimedKeys);

  // Unrelated keys remain bit-for-bit untouched
  assert.deepStrictEqual(await storage.get<PlayerEconomy>(STORAGE_KEYS.ECONOMY), economy);
  assert.deepStrictEqual(await storage.get<CivilizationState>(STORAGE_KEYS.CIVILIZATION), civ);

  // Completing another 15m session on same day finishes legacy daily_steady_rhythm and daily_double_tap
  const sameDayLater = applyCompletedSession(
    migrated,
    { completedDateKey: '2026-11-18', completedFocusMinutes: 15 },
    nowMs + 60_000
  );
  assert.strictEqual(sameDayLater.daily.daily_steady_rhythm.progress, 60);
  assert.strictEqual(sameDayLater.daily.daily_steady_rhythm.completed, true);
  assert.strictEqual(sameDayLater.daily.daily_double_tap.progress, 2);
  assert.strictEqual(sameDayLater.daily.daily_double_tap.completed, true);

  // At midnight rollover to next day, Quest Pool selects fresh 1-per-slot Daily quests without repeating legacy ones
  const nextDayMs = new Date(2026, 10, 19, 0, 5, 0, 0).getTime();
  const nextDayState = rolloverQuestState(sameDayLater, nextDayMs);
  assert.strictEqual(nextDayState.dailyDateKey, '2026-11-19');
  const nextDailyDefs = getActiveQuestDefinitions('DAILY', nextDayState);
  assert.strictEqual(nextDailyDefs.length, 3);
  for (const def of nextDailyDefs) {
    assert.strictEqual(nextDayState.daily[def.id].progress, 0);
    assert.ok(
      !['daily_first_spark', 'daily_steady_rhythm', 'daily_double_tap'].includes(def.id),
      `Next day should rotate away from legacy slot quest: got ${def.id}`
    );
  }
  // Weekly stays on legacy week until Monday
  assert.deepStrictEqual(Object.keys(nextDayState.weekly), [
    'weekly_habit_builder',
    'weekly_deep_diver',
    'weekly_tenacity_10',
  ]);

  // Idempotency check
  const reRun = await new MigrationRunner(storage).runMigrations();
  assert.strictEqual(reRun.previousVersion, 5);
  assert.strictEqual(reRun.currentVersion, 5);
  await v5_questPoolSchema.up(storage);
  assert.deepStrictEqual(await storage.get<QuestState>(STORAGE_KEYS.QUESTS), migrated);
});
