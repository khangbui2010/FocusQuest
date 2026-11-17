import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStorageAdapter } from '../../src/storage/memoryStorageAdapter.ts';
import { StorageManager } from '../../src/storage/storageManager.ts';
import { MigrationRunner } from '../../src/storage/migrations/migrationRunner.ts';
import { v2_civilizationSchema } from '../../src/storage/migrations/v2_civilizationSchema.ts';
import { STORAGE_KEYS } from '../../src/storage/storageKeys.ts';
import { PlayerEconomy } from '../../src/types/economy.ts';
import { DailyStatRecord, UserSettings } from '../../src/types/storageSchema.ts';
import { FocusProfile } from '../../src/types/profiles.ts';
import { SessionSnapshot } from '../../src/types/session.ts';
import {
  CivilizationState,
  createInitialCivilizationState,
  GridMap,
} from '../../src/core/civilization/index.ts';

function makeV1ActiveSession(): SessionSnapshot {
  return {
    id: 'active-v1-session',
    mode: 'COUNTDOWN',
    profileId: 'profile-deep-work-coding',
    status: 'RUNNING',
    targetMinutes: 25,
    lockedMultiplier: 1.0,
    startedAt: 1_700_000_000_000,
    currentPauseStartedAt: null,
    pauseCount: 0,
    totalPauseMs: 0,
    pauseHistory: [],
    lastHeartbeatAt: 1_700_000_050_000,
    completedAt: null,
    rewardProcessed: false,
  };
}

function makeV1Profile(): FocusProfile {
  return {
    id: 'profile-v1-custom',
    name: 'Custom Research Profile',
    allowedDomains: ['arxiv.org', 'wikipedia.org'],
    isDefault: false,
    createdAt: 1_650_000_000_000,
    updatedAt: 1_650_000_000_000,
  };
}

test('Migration v2: upgrades schema v1 to v2 while preserving 100% of player data', async () => {
  const storage = new MemoryStorageAdapter();

  // Populate rich v1 storage
  const v1Economy: PlayerEconomy = { focusCoins: 84.75, totalXP: 450, level: 3 };
  const v1Session = makeV1ActiveSession();
  const v1Profile = makeV1Profile();
  const v1Stats: Record<string, DailyStatRecord> = {
    '2026-11-03': {
      date: '2026-11-03',
      totalFocusMinutes: 120,
      completedSessions: 4,
      abandonedSessions: 0,
      coinsEarned: 54.25,
      xpEarned: 360,
    },
  };
  const v1Settings: UserSettings = {
    soundEnabled: false,
    notificationsEnabled: true,
  };

  await storage.set(STORAGE_KEYS.SCHEMA_VERSION, 1);
  await storage.set(STORAGE_KEYS.ECONOMY, v1Economy);
  await storage.set(STORAGE_KEYS.CURRENT_SESSION, v1Session);
  await storage.set(STORAGE_KEYS.PROFILES, [v1Profile]);
  await storage.set(STORAGE_KEYS.ACTIVE_PROFILE_ID, v1Profile.id);
  await storage.set(STORAGE_KEYS.DAILY_STATS, v1Stats);
  await storage.set(STORAGE_KEYS.SETTINGS, v1Settings);

  // Run migration
  const runner = new MigrationRunner(storage);
  const result = await runner.runMigrations(2); // Explicitly target version 2

  assert.strictEqual(result.previousVersion, 1);
  assert.strictEqual(result.currentVersion, 2);

  // Verify Schema Version is updated to 2
  const version = await storage.get<number>(STORAGE_KEYS.SCHEMA_VERSION);
  assert.strictEqual(version, 2);

  // Verify all v1 player progress is preserved with bit-for-bit fidelity
  assert.deepStrictEqual(await storage.get<PlayerEconomy>(STORAGE_KEYS.ECONOMY), v1Economy);
  assert.strictEqual((await storage.get<PlayerEconomy>(STORAGE_KEYS.ECONOMY))?.focusCoins, 84.75);
  assert.strictEqual((await storage.get<PlayerEconomy>(STORAGE_KEYS.ECONOMY))?.totalXP, 450);
  assert.strictEqual((await storage.get<PlayerEconomy>(STORAGE_KEYS.ECONOMY))?.level, 3);
  assert.deepStrictEqual(await storage.get<SessionSnapshot>(STORAGE_KEYS.CURRENT_SESSION), v1Session);
  assert.deepStrictEqual(await storage.get<FocusProfile[]>(STORAGE_KEYS.PROFILES), [v1Profile]);
  assert.strictEqual(await storage.get<string>(STORAGE_KEYS.ACTIVE_PROFILE_ID), v1Profile.id);
  assert.deepStrictEqual(await storage.get<Record<string, DailyStatRecord>>(STORAGE_KEYS.DAILY_STATS), v1Stats);
  assert.deepStrictEqual(await storage.get<UserSettings>(STORAGE_KEYS.SETTINGS), v1Settings);

  // Verify Civilization state is seeded with pristine initial 8x8 grid
  const civ = await storage.get<CivilizationState>(STORAGE_KEYS.CIVILIZATION);
  assert.ok(civ);
  assert.strictEqual(civ!.schemaVersion, 2);
  assert.strictEqual(civ!.era, 'STONE_AGE');
  assert.strictEqual(civ!.buildings.length, 0);

  const map = GridMap.fromSnapshot(civ!.grid);
  assert.strictEqual(map.getUnlockedCellCount(), 64);
  assert.strictEqual(map.getOccupiedCellCount(), 0);
  assert.strictEqual(map.getEmptyCellCount(), 64);
});

test('Migration v2: running multiple times is strictly idempotent', async () => {
  const storage = new MemoryStorageAdapter();
  await storage.set(STORAGE_KEYS.SCHEMA_VERSION, 1);

  const runner = new MigrationRunner(storage);
  const firstRun = await runner.runMigrations(2);
  assert.strictEqual(firstRun.currentVersion, 2);

  const firstCiv = await storage.get<CivilizationState>(STORAGE_KEYS.CIVILIZATION);

  // Second run on already-migrated storage
  const secondRun = await runner.runMigrations(2);
  assert.strictEqual(secondRun.previousVersion, 2);
  assert.strictEqual(secondRun.currentVersion, 2);

  const secondCiv = await storage.get<CivilizationState>(STORAGE_KEYS.CIVILIZATION);
  assert.deepStrictEqual(secondCiv, firstCiv, 'Second run must not mutate civilization state');
});

test('Migration v2: directly re-running v2 migration preserves existing valid civilization progress', async () => {
  const storage = new MemoryStorageAdapter();

  // Create customized civilization state with a placed building
  const customMap = new GridMap();
  customMap.placeBuilding('bld-saved-1', { x: 5, y: 5 }, { width: 2, height: 2 });

  const existingCiv: CivilizationState = {
    schemaVersion: 2,
    era: 'STONE_AGE',
    grid: customMap.toSnapshot(),
    buildings: [
      {
        id: 'bld-saved-1',
        definitionId: 'stone_age_study_cave',
        position: { x: 5, y: 5 },
        level: 2,
        placedAt: 5000,
      },
    ],
    lastUpdated: 5000,
  };

  await storage.set(STORAGE_KEYS.SCHEMA_VERSION, 1);
  await storage.set(STORAGE_KEYS.CIVILIZATION, existingCiv);

  // Run v2 migration
  await v2_civilizationSchema.up(storage);

  const preservedCiv = await storage.get<CivilizationState>(STORAGE_KEYS.CIVILIZATION);
  assert.deepStrictEqual(preservedCiv, existingCiv, 'Existing valid civilization state must not be reset');
});

test('Migration v2: empty storage runs full migration chain up to v2', async () => {
  const storage = new MemoryStorageAdapter();
  const runner = new MigrationRunner(storage);

  const result = await runner.runMigrations(2);
  assert.strictEqual(result.previousVersion, 0);
  assert.strictEqual(result.currentVersion, 2);

  // Both v1 defaults and v2 defaults must be present
  assert.ok(await storage.get(STORAGE_KEYS.PROFILES));
  assert.ok(await storage.get(STORAGE_KEYS.ECONOMY));
  assert.ok(await storage.get(STORAGE_KEYS.CIVILIZATION));
  assert.strictEqual(await storage.get<number>(STORAGE_KEYS.SCHEMA_VERSION), 2);
});

test('StorageManager: civilization accessors integrate cleanly with StorageMutex', async () => {
  const adapter = new MemoryStorageAdapter();
  const manager = new StorageManager(adapter);

  // 1. getCivilizationState on empty storage returns initial state without crashing
  const initial = await manager.getCivilizationState();
  assert.strictEqual(initial.schemaVersion, 2);
  assert.strictEqual(initial.era, 'STONE_AGE');
  assert.strictEqual(initial.buildings.length, 0);

  // 2. setCivilizationState persists state
  const updatedState: CivilizationState = {
    ...initial,
    lastUpdated: 123456,
  };
  await manager.setCivilizationState(updatedState);
  assert.strictEqual((await manager.getCivilizationState()).lastUpdated, 123456);

  // 3. updateCivilizationState executes atomically under mutex
  const finalState = await manager.updateCivilizationState((current) => ({
    ...current,
    lastUpdated: 999999,
  }));
  assert.strictEqual(finalState.lastUpdated, 999999);
  assert.strictEqual((await manager.getCivilizationState()).lastUpdated, 999999);
});
