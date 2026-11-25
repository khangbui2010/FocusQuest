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

test('v6 Migration: upgrades v5 -> v6 preserving all buildings, villagers, grid, economy, quests, and initializing jobs/founderRole', async () => {
  const adapter = new MemoryStorageAdapter();
  const baseCiv = createInitialCivilizationState();
  const gm = GridMap.fromSnapshot(baseCiv.grid);
  gm.placeBuilding('b_camp', { x: 0, y: 0 }, { width: 1, height: 1 });
  gm.placeBuilding('b_cave', { x: 2, y: 0 }, { width: 3, height: 3 });

  // Simulate legacy v5 civilization without `jobs` or `founderRole`
  const v5Civ = {
    schemaVersion: 5,
    era: 'STONE_AGE',
    grid: gm.toSnapshot(),
    buildings: [
      { id: 'b_camp', definitionId: 'stone_age_campfire', position: { x: 0, y: 0 }, level: 1, placedAt: 111 },
      { id: 'b_cave', definitionId: 'stone_age_study_cave', position: { x: 2, y: 0 }, level: 2, placedAt: 222 },
    ],
    villagers: [{ id: 'v1', role: 'elder', recruitedAt: 333 }],
    lastUpdated: 999,
  };

  const economy = { focusCoins: 420, totalXP: 1337, level: 5 };
  const quests = createInitialQuestState(1700000000000);
  const dailyStats = {
    '2026-01-01': {
      date: '2026-01-01',
      totalFocusMinutes: 90,
      completedSessions: 2,
      abandonedSessions: 0,
      coinsEarned: 135,
      xpEarned: 450,
    },
  };

  await adapter.setMultiple({
    [STORAGE_KEYS.SCHEMA_VERSION]: 5,
    [STORAGE_KEYS.CIVILIZATION]: v5Civ,
    [STORAGE_KEYS.ECONOMY]: economy,
    [STORAGE_KEYS.QUESTS]: quests,
    [STORAGE_KEYS.DAILY_STATS]: dailyStats,
  });

  const runner = new MigrationRunner(adapter);
  const firstRun = await runner.runMigrations();
  assert.equal(firstRun.previousVersion, 5);
  assert.equal(firstRun.currentVersion, CURRENT_SCHEMA_VERSION);
  assert.equal(CURRENT_SCHEMA_VERSION, 6);

  const migratedCiv = await adapter.get<Record<string, unknown>>(STORAGE_KEYS.CIVILIZATION);
  assert.ok(migratedCiv);
  assert.deepEqual(migratedCiv.buildings, v5Civ.buildings);
  assert.deepEqual(migratedCiv.villagers, v5Civ.villagers);
  assert.deepEqual(migratedCiv.grid, v5Civ.grid);
  assert.equal(migratedCiv.era, 'STONE_AGE');
  assert.deepEqual(migratedCiv.jobs, []);
  assert.equal(migratedCiv.founderRole, null);

  // Unrelated storage keys preserved identically
  assert.deepEqual(await adapter.get(STORAGE_KEYS.ECONOMY), economy);
  assert.deepEqual(await adapter.get(STORAGE_KEYS.QUESTS), quests);
  assert.deepEqual(await adapter.get(STORAGE_KEYS.DAILY_STATS), dailyStats);

  // Idempotent on subsequent run
  const secondRun = await runner.runMigrations();
  assert.equal(secondRun.previousVersion, 6);
  assert.equal(secondRun.currentVersion, 6);
});

test('v6 Migration: heals corrupt civilization object to clean v6 state', async () => {
  const adapter = new MemoryStorageAdapter();
  await adapter.setMultiple({
    [STORAGE_KEYS.SCHEMA_VERSION]: 5,
    [STORAGE_KEYS.CIVILIZATION]: { broken: true },
  });

  const runner = new MigrationRunner(adapter);
  const result = await runner.runMigrations();
  assert.equal(result.currentVersion, 6);

  const healed = await adapter.get<Record<string, unknown>>(STORAGE_KEYS.CIVILIZATION);
  assert.ok(healed);
  assert.deepEqual(healed.buildings, []);
  assert.deepEqual(healed.villagers, []);
  assert.deepEqual(healed.jobs, []);
  assert.equal(healed.founderRole, null);
});
