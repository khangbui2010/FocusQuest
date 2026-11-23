import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MemoryStorageAdapter } from '../../src/storage/memoryStorageAdapter.ts';
import {
  CURRENT_SCHEMA_VERSION,
  MigrationRunner,
} from '../../src/storage/migrations/migrationRunner.ts';
import { v4_villagersSchema } from '../../src/storage/migrations/v4_villagersSchema.ts';
import { STORAGE_KEYS } from '../../src/storage/storageKeys.ts';
import {
  CivilizationState,
  GridMap,
  VILLAGE_CAVE_DEFINITION_ID,
} from '../../src/core/civilization/index.ts';
import { PlayerEconomy } from '../../src/types/economy.ts';
import { QuestState } from '../../src/types/quests.ts';
import { createInitialQuestState } from '../../src/core/quests/questEngine.ts';

function makeLegacyV3StateWithBuildings(
  setup: (map: GridMap) => CivilizationState['buildings']
): CivilizationState {
  const map = new GridMap();
  const buildings = setup(map);
  return {
    schemaVersion: 2,
    era: 'STONE_AGE',
    grid: map.toSnapshot(),
    buildings,
    lastUpdated: 1_700_000_000_000,
  };
}

test('Migration v4: expands legacy 2x2 Cave cleanly to 3x3, backfills villagers [], and is strictly idempotent', async () => {
  const storage = new MemoryStorageAdapter();
  const quests: QuestState = createInitialQuestState(1_700_000_000_000);
  const economy: PlayerEconomy = { focusCoins: 100, totalXP: 300, level: 3 };
  const profiles = [{ id: 'p1', name: 'Default', allowedDomains: [], isDefault: true, createdAt: 1, updatedAt: 1 }];
  const dailyStats = { '2026-11-20': { date: '2026-11-20', totalFocusMinutes: 50, completedSessions: 2, abandonedSessions: 0, coinsEarned: 50, xpEarned: 150 } };

  const legacyCiv = makeLegacyV3StateWithBuildings((map) => {
    map.placeBuilding('cave-legacy', { x: 2, y: 2 }, { width: 2, height: 2 });
    return [
      {
        id: 'cave-legacy',
        definitionId: VILLAGE_CAVE_DEFINITION_ID,
        position: { x: 2, y: 2 },
        level: 2,
        placedAt: 1000,
      },
    ];
  });

  await storage.set(STORAGE_KEYS.SCHEMA_VERSION, 3);
  await storage.set(STORAGE_KEYS.CIVILIZATION, legacyCiv);
  await storage.set(STORAGE_KEYS.ECONOMY, economy);
  await storage.set(STORAGE_KEYS.QUESTS, quests);
  await storage.set(STORAGE_KEYS.PROFILES, profiles);
  await storage.set(STORAGE_KEYS.DAILY_STATS, dailyStats);

  assert.equal(CURRENT_SCHEMA_VERSION, 4);
  const res = await new MigrationRunner(storage).runMigrations();
  assert.equal(res.previousVersion, 3);
  assert.equal(res.currentVersion, 4);
  assert.equal(await storage.get<number>(STORAGE_KEYS.SCHEMA_VERSION), 4);

  const migrated = await storage.get<CivilizationState>(STORAGE_KEYS.CIVILIZATION);
  assert.ok(migrated);
  assert.equal(migrated.schemaVersion, 2);
  assert.deepEqual(migrated.villagers, []);
  assert.equal(migrated.buildings.length, 1);

  const migratedMap = GridMap.fromSnapshot(migrated.grid);
  assert.equal(migratedMap.getOccupiedCellCount(), 9, '2x2 Cave must expand to 3x3 (9 cells)');
  assert.equal(migratedMap.getOccupyingBuilding(4, 4), 'cave-legacy');

  // Unrelated keys remain bit-for-bit untouched
  assert.deepEqual(await storage.get(STORAGE_KEYS.ECONOMY), economy);
  assert.deepEqual(await storage.get(STORAGE_KEYS.QUESTS), quests);
  assert.deepEqual(await storage.get(STORAGE_KEYS.PROFILES), profiles);
  assert.deepEqual(await storage.get(STORAGE_KEYS.DAILY_STATS), dailyStats);

  // Idempotency check
  const second = await new MigrationRunner(storage).runMigrations();
  assert.equal(second.previousVersion, 4);
  assert.equal(second.currentVersion, 4);
  await v4_villagersSchema.up(storage);
  assert.deepEqual(await storage.get(STORAGE_KEYS.CIVILIZATION), migrated);
});

test('Migration v4: keeps highest-level Cave across multiple legacy Caves and refunds 100% of duplicate costs', async () => {
  const storage = new MemoryStorageAdapter();
  const legacyCiv = makeLegacyV3StateWithBuildings((map) => {
    map.placeBuilding('cave-low-older', { x: 0, y: 0 }, { width: 2, height: 2 });
    map.placeBuilding('cave-high-newer', { x: 4, y: 0 }, { width: 2, height: 2 });
    map.placeBuilding('cave-tie-later', { x: 0, y: 4 }, { width: 2, height: 2 });
    return [
      { id: 'cave-low-older', definitionId: VILLAGE_CAVE_DEFINITION_ID, position: { x: 0, y: 0 }, level: 1, placedAt: 100 },
      { id: 'cave-high-newer', definitionId: VILLAGE_CAVE_DEFINITION_ID, position: { x: 4, y: 0 }, level: 3, placedAt: 500 },
      { id: 'cave-tie-later', definitionId: VILLAGE_CAVE_DEFINITION_ID, position: { x: 0, y: 4 }, level: 3, placedAt: 900 },
    ];
  });

  await storage.set(STORAGE_KEYS.SCHEMA_VERSION, 3);
  await storage.set(STORAGE_KEYS.CIVILIZATION, legacyCiv);
  await storage.set(STORAGE_KEYS.ECONOMY, { focusCoins: 10, totalXP: 500, level: 4 });

  await new MigrationRunner(storage).runMigrations();

  const migrated = await storage.get<CivilizationState>(STORAGE_KEYS.CIVILIZATION);
  assert.equal(migrated?.buildings.length, 1);
  assert.equal(migrated?.buildings[0].id, 'cave-high-newer', 'Must keep highest level, tie-broken by earliest placedAt');

  // Removed caves: cave-low-older (Lv1: 12) + cave-tie-later (Lv3: 12 + 21 + 37 = 70) => 82 Coins refund
  const econ = await storage.get<PlayerEconomy>(STORAGE_KEYS.ECONOMY);
  assert.equal(econ?.focusCoins, 10 + 12 + 70);
});

test('Migration v4: colliding 2x2->3x3 Cave is removed cleanly with 100% refund of base + upgrades', async () => {
  const storage = new MemoryStorageAdapter();
  const legacyCiv = makeLegacyV3StateWithBuildings((map) => {
    // Legacy 2x2 cave at (0,0) with adjacent Granary at (2,0) blocks expansion to 3x3 at (0..2, 0..2)
    map.placeBuilding('cave-blocked', { x: 0, y: 0 }, { width: 2, height: 2 });
    map.placeBuilding('granary-block', { x: 2, y: 0 }, { width: 2, height: 3 });
    return [
      { id: 'cave-blocked', definitionId: VILLAGE_CAVE_DEFINITION_ID, position: { x: 0, y: 0 }, level: 2, placedAt: 100 },
      { id: 'granary-block', definitionId: 'stone_age_food_cache', position: { x: 2, y: 0 }, level: 1, placedAt: 200 },
    ];
  });

  await storage.set(STORAGE_KEYS.SCHEMA_VERSION, 3);
  await storage.set(STORAGE_KEYS.CIVILIZATION, legacyCiv);
  await storage.set(STORAGE_KEYS.ECONOMY, { focusCoins: 25, totalXP: 200, level: 2 });

  await new MigrationRunner(storage).runMigrations();

  const migrated = await storage.get<CivilizationState>(STORAGE_KEYS.CIVILIZATION);
  assert.equal(migrated?.buildings.length, 1);
  assert.equal(migrated?.buildings[0].id, 'granary-block');
  assert.deepEqual(migrated?.villagers, []);

  // Refund for Lv2 Cave = 12 (base) + 21 (L1->L2 at 1.75x) = 33 Coins (100% full refund)
  const econ = await storage.get<PlayerEconomy>(STORAGE_KEYS.ECONOMY);
  assert.equal(econ?.focusCoins, 25 + 33);
});
