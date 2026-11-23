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
import { SessionCoordinator } from '../../src/background/sessionCoordinator.ts';
import { MessageHandler } from '../../src/background/messageHandler.ts';
import { CivilizationCoordinator } from '../../src/background/civilizationCoordinator.ts';
import { CivilizationState } from '../../src/core/civilization/civilizationState.ts';
import { PlayerEconomy } from '../../src/types/economy.ts';

function createCivilizationTestHarness(initialCoins = 200, initialLevel = 2) {
  const adapter = new MemoryStorageAdapter();
  const storage = new StorageManager(adapter);
  const profileManager = new ProfileManager(storage);
  const alarms = new MockAlarmsAdapter();
  const notifications = new MockNotificationsAdapter();
  const badge = new MockBadgeAdapter();
  const dnr = new MockDNRAdapter();
  const blockingCoordinator = new BlockingCoordinator(dnr);

  const civilizationCoordinator = new CivilizationCoordinator(storage);

  const sessionCoordinator = new SessionCoordinator(
    storage,
    profileManager,
    alarms,
    notifications,
    badge,
    blockingCoordinator,
    () => civilizationCoordinator.getActiveCoinBonuses()
  );

  const handler = new MessageHandler(
    sessionCoordinator,
    profileManager,
    storage,
    civilizationCoordinator
  );

  return {
    adapter,
    storage,
    profileManager,
    sessionCoordinator,
    civilizationCoordinator,
    handler,
    async seedEconomy(coins = initialCoins, level = initialLevel) {
      const minXpForLevel = ((Math.max(1, level) - 1) * Math.max(1, level) * 100) / 2;
      await storage.setEconomy({
        focusCoins: coins,
        totalXP: Math.max(500, minXpForLevel),
        level,
      });
    },
    async seedFocusMinutes(minutes: number) {
      const today = new Date().toISOString().slice(0, 10);
      await storage.setDailyStats({
        [today]: {
          date: today,
          totalFocusMinutes: minutes,
          completedSessions: 1,
          abandonedSessions: 0,
          coinsEarned: 50,
          xpEarned: 100,
        },
      });
    },
  };
}

test('Civilization Messages: GET_CIVILIZATION_STATE returns pristine initial state', async () => {
  const { handler } = createCivilizationTestHarness();

  const response = await handler.handleMessage({ action: 'GET_CIVILIZATION_STATE' });
  assert.strictEqual(response.success, true);

  const state = response.data as CivilizationState;
  assert.strictEqual(state.schemaVersion, 2);
  assert.strictEqual(state.era, 'STONE_AGE');
  assert.strictEqual(state.buildings.length, 0);
  assert.strictEqual(state.grid.chunks.length, 4);
});

test('Civilization Messages: PLACE_BUILDING rejects unknown definition', async () => {
  const { handler, seedEconomy } = createCivilizationTestHarness(200, 5);
  await seedEconomy();

  const response = await handler.handleMessage({
    action: 'PLACE_BUILDING',
    payload: {
      buildingDefinitionId: 'non_existent_space_station',
      position: { x: 5, y: 5 },
    },
  });

  assert.strictEqual(response.success, false);
  assert.ok(response.error?.includes('Unknown building definition'));
});

test('Civilization Messages: PLACE_BUILDING rejects invalid or out-of-bounds coordinates', async () => {
  const { handler, seedEconomy } = createCivilizationTestHarness(200, 5);
  await seedEconomy();

  // Locked / out of bounds cell (initial grid is 0..19, cell 25 is locked)
  const response = await handler.handleMessage({
    action: 'PLACE_BUILDING',
    payload: {
      buildingDefinitionId: 'stone_age_campfire',
      position: { x: 25, y: 25 },
    },
  });

  assert.strictEqual(response.success, false);
  assert.ok(response.error?.includes('Cannot place building'));
});

test('Civilization Messages: PLACE_BUILDING enforces unlock requirements (level & focus minutes)', async () => {
  const { handler, seedEconomy, seedFocusMinutes } = createCivilizationTestHarness();

  // stone_age_elder_hut requires Player Level 2 and 100 lifetime focus minutes
  // Case A: Level 1 -> fails level requirement
  await seedEconomy(500, 1);
  await seedFocusMinutes(150);
  const respLevelFail = await handler.handleMessage({
    action: 'PLACE_BUILDING',
    payload: {
      buildingDefinitionId: 'stone_age_elder_hut',
      position: { x: 2, y: 2 },
    },
  });
  assert.strictEqual(respLevelFail.success, false);
  assert.ok(respLevelFail.error?.includes('requires Player Level 2'));

  // Case B: Level 2, but 30 minutes -> fails focus minutes requirement
  await seedEconomy(500, 2);
  await seedFocusMinutes(30);
  const respMinutesFail = await handler.handleMessage({
    action: 'PLACE_BUILDING',
    payload: {
      buildingDefinitionId: 'stone_age_elder_hut',
      position: { x: 2, y: 2 },
    },
  });
  assert.strictEqual(respMinutesFail.success, false);
  assert.ok(respMinutesFail.error?.includes('lifetime focus minutes'));
});

test('Civilization Messages: PLACE_BUILDING rejects when player has insufficient coins', async () => {
  const { handler, seedEconomy, seedFocusMinutes } = createCivilizationTestHarness();
  // stone_age_campfire costs 8 Coins. Seed 5 Coins.
  await seedEconomy(5, 2);
  await seedFocusMinutes(100);

  const response = await handler.handleMessage({
    action: 'PLACE_BUILDING',
    payload: {
      buildingDefinitionId: 'stone_age_campfire',
      position: { x: 2, y: 2 },
    },
  });

  assert.strictEqual(response.success, false);
  assert.ok(response.error?.includes('Insufficient coins'));
});

test('Civilization Messages: PLACE_BUILDING atomic transaction deducts coins and commits state', async () => {
  const { handler, storage, seedEconomy, seedFocusMinutes } = createCivilizationTestHarness();
  // Campfire costs 8 coins. Seed 100 coins.
  await seedEconomy(100, 2);
  await seedFocusMinutes(100);

  const response = await handler.handleMessage({
    action: 'PLACE_BUILDING',
    payload: {
      buildingDefinitionId: 'stone_age_campfire',
      position: { x: 3, y: 3 },
    },
  });

  assert.strictEqual(response.success, true);
  const data = response.data as {
    building: { id: string; definitionId: string; position: { x: number; y: number } };
    civilizationState: CivilizationState;
    economy: PlayerEconomy;
  };

  assert.strictEqual(data.building.definitionId, 'stone_age_campfire');
  assert.deepStrictEqual(data.building.position, { x: 3, y: 3 });
  assert.strictEqual(data.economy.focusCoins, 92); // 100 - 8 = 92
  assert.strictEqual(data.civilizationState.buildings.length, 1);

  // Verify persistence in storage
  const storedEconomy = await storage.getEconomy();
  assert.strictEqual(storedEconomy.focusCoins, 92);

  const storedCiv = await storage.getCivilizationState();
  assert.strictEqual(storedCiv.buildings.length, 1);
  assert.strictEqual(storedCiv.buildings[0].id, data.building.id);
});

test('Civilization Messages: PLACE_BUILDING rejects collision and preserves player balance (atomic rollback)', async () => {
  const { handler, storage, seedEconomy, seedFocusMinutes } = createCivilizationTestHarness();
  await seedEconomy(100, 2);
  await seedFocusMinutes(100);

  // 1. Place first 1x1 building at (4, 4)
  const first = await handler.handleMessage({
    action: 'PLACE_BUILDING',
    payload: {
      buildingDefinitionId: 'stone_age_campfire',
      position: { x: 4, y: 4 },
    },
  });
  assert.strictEqual(first.success, true);
  const econAfterFirst = await storage.getEconomy();
  assert.strictEqual(econAfterFirst.focusCoins, 92);

  // 2. Attempt to place another building overlapping (4, 4)
  const collision = await handler.handleMessage({
    action: 'PLACE_BUILDING',
    payload: {
      buildingDefinitionId: 'stone_age_campfire',
      position: { x: 4, y: 4 },
    },
  });
  assert.strictEqual(collision.success, false);
  assert.ok(collision.error?.includes('Cannot place building'));

  // 3. Balance must remain exactly 92 (no coins deducted for failed placement)
  const econAfterFailed = await storage.getEconomy();
  assert.strictEqual(econAfterFailed.focusCoins, 92);

  const civAfterFailed = await storage.getCivilizationState();
  assert.strictEqual(civAfterFailed.buildings.length, 1);
});

test('Civilization Messages: Concurrent purchases serialize safely without negative balance', async () => {
  const { handler, storage, seedEconomy, seedFocusMinutes } = createCivilizationTestHarness();
  // Foraging post costs 30 Coins. Seed exactly 45 Coins.
  // Two concurrent purchases of 30 coins each (60 total) would overdraw without atomic mutex.
  await seedEconomy(45, 2);
  await seedFocusMinutes(100);

  const [res1, res2] = await Promise.all([
    handler.handleMessage({
      action: 'PLACE_BUILDING',
      payload: {
        buildingDefinitionId: 'stone_age_foraging_post', // costs 30
        position: { x: 0, y: 0 },
      },
    }),
    handler.handleMessage({
      action: 'PLACE_BUILDING',
      payload: {
        buildingDefinitionId: 'stone_age_foraging_post', // costs 30
        position: { x: 6, y: 6 },
      },
    }),
  ]);

  // Exactly one must succeed and one must fail with insufficient coins
  const successes = [res1, res2].filter((r) => r.success);
  const failures = [res1, res2].filter((r) => !r.success);

  assert.strictEqual(successes.length, 1);
  assert.strictEqual(failures.length, 1);
  assert.ok(failures[0].error?.includes('Insufficient coins'));

  // Ending balance must be exactly 45 - 30 = 15 Coins
  const finalEcon = await storage.getEconomy();
  assert.strictEqual(finalEcon.focusCoins, 15);

  const finalCiv = await storage.getCivilizationState();
  assert.strictEqual(finalCiv.buildings.length, 1);
});

test('Civilization Messages: REMOVE_BUILDING frees occupancy and updates storage', async () => {
  const { handler, storage, seedEconomy, seedFocusMinutes } = createCivilizationTestHarness();
  await seedEconomy(100, 2);
  await seedFocusMinutes(100);

  // Place building at (5, 5)
  const placeResp = await handler.handleMessage({
    action: 'PLACE_BUILDING',
    payload: {
      buildingDefinitionId: 'stone_age_campfire',
      position: { x: 5, y: 5 },
    },
  });
  assert.strictEqual(placeResp.success, true);
  const buildingId = (placeResp.data as { building: { id: string } }).building.id;

  // Remove building
  const removeResp = await handler.handleMessage({
    action: 'REMOVE_BUILDING',
    payload: { buildingInstanceId: buildingId },
  });
  assert.strictEqual(removeResp.success, true);

  // Verify removed from storage
  const civState = await storage.getCivilizationState();
  assert.strictEqual(civState.buildings.length, 0);

  // Verify freed cell can now be built on again
  const secondPlaceResp = await handler.handleMessage({
    action: 'PLACE_BUILDING',
    payload: {
      buildingDefinitionId: 'stone_age_campfire',
      position: { x: 5, y: 5 },
    },
  });
  assert.strictEqual(secondPlaceResp.success, true);
});

test('Civilization Messages: REMOVE_BUILDING rejects non-existent building ID', async () => {
  const { handler } = createCivilizationTestHarness();

  const removeResp = await handler.handleMessage({
    action: 'REMOVE_BUILDING',
    payload: { buildingInstanceId: 'non_existent_id' },
  });

  assert.strictEqual(removeResp.success, false);
  assert.ok(removeResp.error?.includes('not found'));
});

test('Civilization Messages: EXPAND_LAND expands territory by chunk origin and deducts Coins atomically', async () => {
  const { handler, storage, seedEconomy } = createCivilizationTestHarness(100, 3);
  await seedEconomy(100, 3);

  // Initial grid has 4x4 chunks at (0,0), (4,0), (0,4), (4,4) - total 4 chunks (64 cells)
  // First purchase (k=1) requires Lv. 3 and costs 60 Coins
  const expandResp = await handler.handleMessage({
    action: 'EXPAND_LAND',
    payload: { origin: { x: 8, y: 0 } },
  });

  assert.strictEqual(expandResp.success, true);
  const data = expandResp.data as {
    newChunk: { x: number; y: number };
    civilizationState: CivilizationState;
    economy: PlayerEconomy;
    cost: number;
  };
  assert.deepStrictEqual(data.newChunk, { x: 8, y: 0 });
  assert.strictEqual(data.cost, 60);
  assert.strictEqual(data.economy.focusCoins, 40);
  assert.strictEqual(data.civilizationState.grid.chunks.length, 5);
  assert.strictEqual('terrainFeatures' in data.civilizationState.grid, false);

  const storedCiv = await storage.getCivilizationState();
  assert.strictEqual(storedCiv.grid.chunks.length, 5);
  const storedEcon = await storage.getEconomy();
  assert.strictEqual(storedEcon.focusCoins, 40);
});

test('Civilization Messages: EXPAND_LAND rejects deprecated direction/slotIndex and supports negative origin coordinates', async () => {
  const { handler, storage, seedEconomy } = createCivilizationTestHarness(500, 5);
  await seedEconomy(500, 5);

  // Deprecated cardinal direction must be rejected without mutating coins or chunks
  const deprecatedDir = await handler.handleMessage({
    action: 'EXPAND_LAND',
    payload: { direction: 'WEST' } as unknown as { origin: { x: number; y: number } },
  });
  assert.strictEqual(deprecatedDir.success, false);
  assert.strictEqual((await storage.getEconomy()).focusCoins, 500);
  assert.strictEqual((await storage.getCivilizationState()).grid.chunks.length, 4);

  // Expand WEST via explicit negative origin (-4, 0)
  const expandWest = await handler.handleMessage({
    action: 'EXPAND_LAND',
    payload: { origin: { x: -4, y: 0 } },
  });
  assert.strictEqual(expandWest.success, true);
  const westData = expandWest.data as {
    newChunk: { x: number; y: number };
    civilizationState: CivilizationState;
    economy: PlayerEconomy;
    cost: number;
  };
  assert.deepStrictEqual(westData.newChunk, { x: -4, y: 0 });
  assert.strictEqual(westData.cost, 60);
  assert.strictEqual(westData.economy.focusCoins, 440);

  // Verify building can now be placed in the newly unlocked negative territory (-4, 0)
  const placeResp = await handler.handleMessage({
    action: 'PLACE_BUILDING',
    payload: {
      buildingDefinitionId: 'stone_age_campfire',
      position: { x: -4, y: 0 },
    },
  });
  assert.strictEqual(placeResp.success, true);

  const storedCiv = await storage.getCivilizationState();
  assert.strictEqual(storedCiv.buildings.length, 1);
  assert.strictEqual(storedCiv.buildings[0].position.x, -4);
});

test('Civilization Messages: EXPAND_LAND rejects non-adjacent isolated origin without deducting Coins', async () => {
  const { handler, storage, seedEconomy } = createCivilizationTestHarness(500, 5);
  await seedEconomy(500, 5);

  const expandResp = await handler.handleMessage({
    action: 'EXPAND_LAND',
    payload: { origin: { x: 100, y: 100 } },
  });

  assert.strictEqual(expandResp.success, false);
  assert.ok(expandResp.error?.includes('Land expansion failed'));
  assert.strictEqual((await storage.getEconomy()).focusCoins, 500);
  assert.strictEqual((await storage.getCivilizationState()).grid.chunks.length, 4);
});

test('Civilization Messages: EXPAND_LAND enforces Level gate, Coins gate, alignment, and IEEE-754 float balance', async () => {
  // 1. Level too low (Lv. 2 < Lv. 3) even with 500 Coins -> reject, 0 Coins deducted
  const h1 = createCivilizationTestHarness();
  await h1.storage.setEconomy({ focusCoins: 500, totalXP: 150, level: 2 });
  const levelFail = await h1.handler.handleMessage({
    action: 'EXPAND_LAND',
    payload: { origin: { x: 8, y: 0 } },
  });
  assert.strictEqual(levelFail.success, false);
  assert.ok(levelFail.error?.includes('Player Level 3'));
  assert.strictEqual((await h1.storage.getEconomy()).focusCoins, 500);
  assert.strictEqual((await h1.storage.getCivilizationState()).grid.chunks.length, 4);

  // 2. Insufficient Coins (Lv. 3, 59.5 Coins < 60) -> reject, 0 Coins deducted
  const h2 = createCivilizationTestHarness();
  await h2.storage.setEconomy({ focusCoins: 59.5, totalXP: 350, level: 3 });
  const coinFail = await h2.handler.handleMessage({
    action: 'EXPAND_LAND',
    payload: { origin: { x: 8, y: 0 } },
  });
  assert.strictEqual(coinFail.success, false);
  assert.ok(coinFail.error?.includes('Insufficient coins'));
  assert.strictEqual((await h2.storage.getEconomy()).focusCoins, 59.5);
  assert.strictEqual((await h2.storage.getCivilizationState()).grid.chunks.length, 4);

  // 3. Valid decimal Coins (75.375 - 60 = 15.375 exact IEEE-754 float without flooring)
  const h3 = createCivilizationTestHarness();
  await h3.storage.setEconomy({ focusCoins: 75.375, totalXP: 350, level: 3 });
  const floatOk = await h3.handler.handleMessage({
    action: 'EXPAND_LAND',
    payload: { origin: { x: 8, y: 0 } },
  });
  assert.strictEqual(floatOk.success, true);
  const finalEcon = await h3.storage.getEconomy();
  assert.ok(Math.abs(finalEcon.focusCoins - 15.375) < 1e-9);

  // 4. Rejects already-unlocked chunk origin without deducting Coins
  await h3.storage.setEconomy({ focusCoins: 200, totalXP: 1000, level: 5 });
  const dupOrigin = await h3.handler.handleMessage({
    action: 'EXPAND_LAND',
    payload: { origin: { x: 8, y: 0 } },
  });
  assert.strictEqual(dupOrigin.success, false);
  assert.ok(dupOrigin.error?.includes('CHUNK_ALREADY_EXISTS'));
  assert.strictEqual((await h3.storage.getEconomy()).focusCoins, 200);
});

test('Civilization Messages: GET_CIVILIZATION_STATE rejects legacy 10x10 state and re-seeds clean 8x8 state', async () => {
  const { handler, adapter, storage } = createCivilizationTestHarness();

  // Seed legacy pre-4a-2 state directly in raw storage (10x10 chunks)
  await adapter.setMultiple({
    civilization: {
      schemaVersion: 2,
      era: 'STONE_AGE',
      grid: {
        chunks: [
          { id: 'chunk_0_0', origin: { x: 0, y: 0 }, dimensions: { width: 10, height: 10 } },
          { id: 'chunk_10_0', origin: { x: 10, y: 0 }, dimensions: { width: 10, height: 10 } },
          { id: 'chunk_0_10', origin: { x: 0, y: 10 }, dimensions: { width: 10, height: 10 } },
          { id: 'chunk_10_10', origin: { x: 10, y: 10 }, dimensions: { width: 10, height: 10 } },
        ],
        buildings: [],
      },
      buildings: [],
      lastUpdated: 1000,
    },
  });

  const resp = await handler.handleMessage({ action: 'GET_CIVILIZATION_STATE' });
  assert.strictEqual(resp.success, true);
  const civ = resp.data as CivilizationState;
  assert.strictEqual(civ.schemaVersion, 2);
  assert.strictEqual(civ.grid.chunks.length, 4);
  for (const ch of civ.grid.chunks) {
    assert.strictEqual(ch.dimensions.width, 4);
    assert.strictEqual(ch.dimensions.height, 4);
  }
  assert.deepStrictEqual(Object.keys(civ.grid).sort(), ['buildings', 'chunks']);
  assert.strictEqual(civ.buildings.length, 0);

  const persisted = await storage.getCivilizationState();
  assert.deepStrictEqual(persisted.grid.chunks, civ.grid.chunks);
});
