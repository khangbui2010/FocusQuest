import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStorageAdapter } from '../../src/storage/memoryStorageAdapter.ts';
import { MigrationRunner } from '../../src/storage/migrations/migrationRunner.ts';
import { v1_initialSchema } from '../../src/storage/migrations/v1_initialSchema.ts';
import { STORAGE_KEYS } from '../../src/storage/storageKeys.ts';
import { PlayerEconomy } from '../../src/types/economy.ts';
import { DailyStatRecord } from '../../src/types/storageSchema.ts';
import { FocusProfile } from '../../src/types/profiles.ts';
import { SessionSnapshot } from '../../src/types/session.ts';

function makeLegacySession(): SessionSnapshot {
  return {
    id: 'legacy-active-session',
    mode: 'COUNTDOWN',
    profileId: 'profile-custom',
    status: 'RUNNING',
    targetMinutes: 30,
    lockedMultiplier: 1.2,
    startedAt: 1_700_000_000_000,
    currentPauseStartedAt: null,
    pauseCount: 0,
    totalPauseMs: 0,
    pauseHistory: [],
    lastHeartbeatAt: 1_700_000_100_000,
    completedAt: null,
    rewardProcessed: false,
  };
}

function makeLegacyProfile(): FocusProfile {
  return {
    id: 'profile-custom',
    name: 'Legacy Profile',
    allowedDomains: ['example.com'],
    isDefault: true,
    createdAt: 1_600_000_000_000,
    updatedAt: 1_600_000_000_000,
  };
}

test('Migration v1: legacy economy, XP, daily stats, profiles and active session are preserved', async () => {
  const storage = new MemoryStorageAdapter();
  const legacyEconomy: PlayerEconomy = { focusCoins: 12.5, totalXP: 250, level: 3 };
  const legacyStats: Record<string, DailyStatRecord> = {
    '2026-10-01': {
      date: '2026-10-01',
      totalFocusMinutes: 75,
      completedSessions: 3,
      abandonedSessions: 1,
      coinsEarned: 18.75,
      xpEarned: 90,
    },
  };
  const legacySession = makeLegacySession();
  const legacyProfile = makeLegacyProfile();

  await storage.set(STORAGE_KEYS.ECONOMY, legacyEconomy);
  await storage.set(STORAGE_KEYS.DAILY_STATS, legacyStats);
  await storage.set(STORAGE_KEYS.CURRENT_SESSION, legacySession);
  await storage.set(STORAGE_KEYS.PROFILES, [legacyProfile]);
  await storage.set(STORAGE_KEYS.ACTIVE_PROFILE_ID, legacyProfile.id);

  const runner = new MigrationRunner(storage);
  const result = await runner.runMigrations();

  assert.strictEqual(result.previousVersion, 0);
  assert.strictEqual(result.currentVersion, 1);

  assert.deepStrictEqual(await storage.get<PlayerEconomy>(STORAGE_KEYS.ECONOMY), legacyEconomy);
  assert.deepStrictEqual(await storage.get<Record<string, DailyStatRecord>>(STORAGE_KEYS.DAILY_STATS), legacyStats);
  assert.deepStrictEqual(await storage.get<SessionSnapshot>(STORAGE_KEYS.CURRENT_SESSION), legacySession);
  assert.deepStrictEqual(await storage.get<FocusProfile[]>(STORAGE_KEYS.PROFILES), [legacyProfile]);
  assert.strictEqual(await storage.get<string>(STORAGE_KEYS.ACTIVE_PROFILE_ID), legacyProfile.id);
});

test('Migration v1: running twice is idempotent and does not reset progress', async () => {
  const storage = new MemoryStorageAdapter();
  const economy: PlayerEconomy = { focusCoins: 103.2, totalXP: 480, level: 4 };
  await storage.set(STORAGE_KEYS.ECONOMY, economy);

  const runner = new MigrationRunner(storage);
  await runner.runMigrations();
  const firstEconomy = await storage.get<PlayerEconomy>(STORAGE_KEYS.ECONOMY);
  const firstVersion = await storage.get<number>(STORAGE_KEYS.SCHEMA_VERSION);

  const secondRun = await runner.runMigrations();
  const secondEconomy = await storage.get<PlayerEconomy>(STORAGE_KEYS.ECONOMY);
  const secondVersion = await storage.get<number>(STORAGE_KEYS.SCHEMA_VERSION);

  assert.strictEqual(firstVersion, 1);
  assert.strictEqual(secondVersion, 1);
  assert.strictEqual(secondRun.previousVersion, 1);
  assert.deepStrictEqual(firstEconomy, economy);
  assert.deepStrictEqual(secondEconomy, firstEconomy);
});

test('Migration v1: directly re-running the migration preserves newer values instead of overwriting them', async () => {
  const storage = new MemoryStorageAdapter();
  await storage.set(STORAGE_KEYS.SCHEMA_VERSION, 1);
  await storage.set(STORAGE_KEYS.ECONOMY, { focusCoins: 5.25, totalXP: 10, level: 1 });

  // Simulate a defensive re-run on already-migrated storage.
  await v1_initialSchema.up(storage);

  assert.deepStrictEqual(await storage.get<PlayerEconomy>(STORAGE_KEYS.ECONOMY), {
    focusCoins: 5.25,
    totalXP: 10,
    level: 1,
  });
});

test('Migration v1: corrupt numeric amounts are sanitized without losing valid decimals', async () => {
  const storage = new MemoryStorageAdapter();
  await storage.set(STORAGE_KEYS.ECONOMY, {
    focusCoins: '18.75',
    totalXP: -40,
    level: 0,
  });

  const runner = new MigrationRunner(storage);
  await runner.runMigrations();

  assert.deepStrictEqual(await storage.get<PlayerEconomy>(STORAGE_KEYS.ECONOMY), {
    focusCoins: 18.75,
    totalXP: 0,
    level: 1,
  });
});

test('Migration v1: empty storage still seeds the initial schema', async () => {
  const storage = new MemoryStorageAdapter();
  const runner = new MigrationRunner(storage);
  await runner.runMigrations();

  assert.deepStrictEqual(await storage.get<PlayerEconomy>(STORAGE_KEYS.ECONOMY), {
    focusCoins: 0,
    totalXP: 0,
    level: 1,
  });
  assert.strictEqual(await storage.get<SessionSnapshot | null>(STORAGE_KEYS.CURRENT_SESSION), null);
  assert.deepStrictEqual(await storage.get<Record<string, DailyStatRecord>>(STORAGE_KEYS.DAILY_STATS), {});
});
