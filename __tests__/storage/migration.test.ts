import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStorageAdapter } from '../../src/storage/memoryStorageAdapter.ts';
import { MigrationRunner } from '../../src/storage/migrations/migrationRunner.ts';
import { STORAGE_KEYS } from '../../src/storage/storageKeys.ts';
import { FocusProfile } from '../../src/types/profiles.ts';
import { PlayerEconomy } from '../../src/types/economy.ts';

test('MigrationRunner runs v1_initialSchema on empty storage and seeds default data', async () => {
  const storage = new MemoryStorageAdapter();
  const runner = new MigrationRunner(storage);

  const result = await runner.runMigrations();

  assert.strictEqual(result.previousVersion, 0);
  assert.strictEqual(result.currentVersion, 1);

  const version = await storage.get<number>(STORAGE_KEYS.SCHEMA_VERSION);
  assert.strictEqual(version, 1);

  const session = await storage.get(STORAGE_KEYS.CURRENT_SESSION);
  assert.strictEqual(session, null);

  const profiles = await storage.get<FocusProfile[]>(STORAGE_KEYS.PROFILES);
  assert.ok(Array.isArray(profiles));
  assert.strictEqual(profiles.length, 2);
  assert.strictEqual(profiles[0].name, 'Study & Research');
  assert.strictEqual(profiles[1].name, 'Deep Work / Coding');
  // Invariants check: Domain lists must be empty until approved by PM
  assert.deepStrictEqual(profiles[0].allowedDomains, []);
  assert.deepStrictEqual(profiles[1].allowedDomains, []);

  const economy = await storage.get<PlayerEconomy>(STORAGE_KEYS.ECONOMY);
  assert.deepStrictEqual(economy, { focusCoins: 0, totalXP: 0, level: 1 });
});

test('MigrationRunner skips execution if storage is already up to date', async () => {
  const storage = new MemoryStorageAdapter();
  await storage.set(STORAGE_KEYS.SCHEMA_VERSION, 1);

  const runner = new MigrationRunner(storage);
  const result = await runner.runMigrations();

  assert.strictEqual(result.previousVersion, 1);
  assert.strictEqual(result.currentVersion, 1);
});
