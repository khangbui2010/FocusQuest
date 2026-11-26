import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStorageAdapter } from '../../src/storage/memoryStorageAdapter.ts';
import { STORAGE_KEYS } from '../../src/storage/storageKeys.ts';
import {
  CURRENT_SCHEMA_VERSION,
  MigrationRunner,
} from '../../src/storage/migrations/migrationRunner.ts';
import { createInitialCivilizationState } from '../../src/core/civilization/civilizationState.ts';
import { createInitialQuestState } from '../../src/core/quests/questEngine.ts';
import { GridMap } from '../../src/core/civilization/gridMap.ts';
import { AwardState, CURRENT_AWARDS_STATE_VERSION } from '../../src/types/awards.ts';

test('v7 Migration: backfills earned tiers as seen:true from v6 history while preserving all v6 keys identically and running idempotently', async () => {
  const adapter = new MemoryStorageAdapter();
  const nowMs = Date.now();
  const baseCiv = createInitialCivilizationState();
  const gm = GridMap.fromSnapshot(baseCiv.grid);
  gm.placeBuilding('b_camp', { x: 0, y: 0 }, { width: 1, height: 1 });
  gm.placeBuilding('b_cave', { x: 2, y: 0 }, { width: 3, height: 3 });

  const v6Civ = {
    ...baseCiv,
    grid: gm.toSnapshot(),
    founderRole: 'elder' as const,
    villagers: [
      { id: 'v1', role: 'crafter' as const, recruitedAt: 100 },
      { id: 'v2', role: 'woodworker' as const, recruitedAt: 200 },
    ],
    buildings: [
      { id: 'b_camp', definitionId: 'stone_age_campfire', position: { x: 0, y: 0 }, level: 1, placedAt: 100 },
      { id: 'b_cave', definitionId: 'stone_age_study_cave', position: { x: 2, y: 0 }, level: 5, placedAt: 200 },
    ],
    lastUpdated: 999,
  };

  const economy = { focusCoins: 500, totalXP: 1200, level: 5 };
  const quests = createInitialQuestState(nowMs);
  const dailyStats = {
    '2026-02-01': {
      date: '2026-02-01',
      totalFocusMinutes: 120,
      completedSessions: 5,
      abandonedSessions: 0,
      coinsEarned: 240,
      xpEarned: 600,
    },
  };
  const settings = { soundEnabled: true, notificationsEnabled: true, language: 'vi' };

  await adapter.setMultiple({
    [STORAGE_KEYS.SCHEMA_VERSION]: 6,
    [STORAGE_KEYS.CIVILIZATION]: v6Civ,
    [STORAGE_KEYS.ECONOMY]: economy,
    [STORAGE_KEYS.QUESTS]: quests,
    [STORAGE_KEYS.DAILY_STATS]: dailyStats,
    [STORAGE_KEYS.SETTINGS]: settings,
  });

  const runner = new MigrationRunner(adapter);
  const firstRun = await runner.runMigrations();
  assert.equal(firstRun.previousVersion, 6);
  assert.equal(firstRun.currentVersion, 7);
  assert.equal(CURRENT_SCHEMA_VERSION, 7);

  const awards = await adapter.get<AwardState>(STORAGE_KEYS.AWARDS);
  assert.ok(awards);
  assert.equal(awards.version, CURRENT_AWARDS_STATE_VERSION);
  assert.ok(awards.unlocked.focus_hours?.[1]?.seen === true);
  assert.ok(awards.unlocked.focus_sessions?.[2]?.seen === true);
  assert.ok(awards.unlocked.master_builder?.[1]?.seen === true);
  assert.ok(awards.unlocked.tribe?.[2]?.seen === true);
  assert.ok(awards.unlocked.tribe_complete?.[1]?.seen === true);
  assert.equal(awards.counters.totalBuildingsBuilt, 2);

  // Every existing tier earned from backfill must have seen: true (zero unseen flood)
  for (const tierMap of Object.values(awards.unlocked)) {
    for (const entry of Object.values(tierMap)) {
      assert.equal(entry.seen, true);
    }
  }

  // Unrelated storage keys preserved identically (0 Coins / 0 XP granted)
  assert.deepStrictEqual(await adapter.get(STORAGE_KEYS.ECONOMY), economy);
  assert.deepStrictEqual(await adapter.get(STORAGE_KEYS.CIVILIZATION), v6Civ);
  assert.deepStrictEqual(await adapter.get(STORAGE_KEYS.QUESTS), quests);
  assert.deepStrictEqual(await adapter.get(STORAGE_KEYS.DAILY_STATS), dailyStats);
  assert.deepStrictEqual(await adapter.get(STORAGE_KEYS.SETTINGS), settings);

  // Idempotent on second run
  const secondRun = await runner.runMigrations();
  assert.equal(secondRun.previousVersion, 7);
  assert.equal(secondRun.currentVersion, 7);
  assert.deepStrictEqual(await adapter.get(STORAGE_KEYS.AWARDS), awards);
});

test('v7 Migration: heals corrupt pre-existing fq_awards while preserving valid unlocks', async () => {
  const adapter = new MemoryStorageAdapter();
  await adapter.setMultiple({
    [STORAGE_KEYS.SCHEMA_VERSION]: 6,
    [STORAGE_KEYS.AWARDS]: {
      version: 'bad',
      unlocked: {
        focus_hours: { '1': { unlockedAt: 12345, seen: false }, '-2': { unlockedAt: 1, seen: false } },
      },
      counters: null,
    },
  });

  await new MigrationRunner(adapter).runMigrations();
  const awards = await adapter.get<AwardState>(STORAGE_KEYS.AWARDS);
  assert.ok(awards);
  assert.equal(awards.version, CURRENT_AWARDS_STATE_VERSION);
  assert.equal(awards.unlocked.focus_hours?.[1]?.unlockedAt, 12345);
  assert.equal(awards.unlocked.focus_hours?.[-2], undefined);
});
