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
import { CivilizationCoordinator } from '../../src/background/civilizationCoordinator.ts';
import { MessageHandler } from '../../src/background/messageHandler.ts';
import { GridMap } from '../../src/core/civilization/gridMap.ts';
import {
  CivilizationState,
  createInitialCivilizationState,
} from '../../src/core/civilization/civilizationState.ts';
import { STORAGE_KEYS } from '../../src/storage/storageKeys.ts';

const EPSILON = 1e-9;

function createHarness(initialCoins = 500, initialLevel = 3, initialMinutes = 300) {
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
    () => civilizationCoordinator.getActiveCoinBonuses(),
    undefined,
    undefined,
    (civState) => {
      civilizationCoordinator.refreshCachedBonuses(civState);
    }
  );

  const handler = new MessageHandler(
    sessionCoordinator,
    profileManager,
    storage,
    civilizationCoordinator
  );

  const seedPrerequisites = async (
    coins = initialCoins,
    level = initialLevel,
    mins = initialMinutes,
    seedCrew = true
  ) => {
    const minXpForLevel = ((Math.max(1, level) - 1) * Math.max(1, level) * 100) / 2;
    await storage.setEconomy({
      focusCoins: coins,
      totalXP: level === 3 ? 500 : Math.max(500, minXpForLevel),
      level,
    });
    const today = new Date().toISOString().slice(0, 10);
    await storage.setDailyStats({
      [today]: {
        date: today,
        totalFocusMinutes: mins,
        completedSessions: 2,
        abandonedSessions: 0,
        coinsEarned: 100,
        xpEarned: 200,
      },
    });
    if (seedCrew) {
      const initCiv = createInitialCivilizationState();
      const gm = GridMap.fromSnapshot(initCiv.grid);
      gm.placeBuilding('cave_seed', { x: 5, y: 0 }, { width: 3, height: 3 });
      await storage.setCivilizationState({
        ...initCiv,
        grid: gm.toSnapshot(),
        buildings: [
          {
            id: 'cave_seed',
            definitionId: 'stone_age_study_cave',
            position: { x: 5, y: 0 },
            level: 1,
            placedAt: 1,
          },
        ],
        villagers: [{ id: 'v_seed', role: 'woodworker', recruitedAt: 1 }],
        founderRole: 'elder',
      });
    }
  };

  return {
    adapter,
    storage,
    profileManager,
    sessionCoordinator,
    civilizationCoordinator,
    handler,
    seedPrerequisites,
  };
}

// -----------------------------------------------------------------------------
// Test A — Concurrent placement (Lost Update Prevention)
// -----------------------------------------------------------------------------
test('Test A: Concurrent placement at non-overlapping positions preserves both buildings without lost updates', async () => {
  const h = createHarness(200, 3, 300);
  await h.seedPrerequisites(200, 3, 300, false);

  // Send two placement requests concurrently
  // Campfire costs 4 coins each.
  const [res1, res2] = await Promise.all([
    h.handler.handleMessage({
      action: 'PLACE_BUILDING',
      payload: {
        buildingDefinitionId: 'stone_age_campfire',
        position: { x: 0, y: 0 },
      },
    }),
    h.handler.handleMessage({
      action: 'PLACE_BUILDING',
      payload: {
        buildingDefinitionId: 'stone_age_campfire',
        position: { x: 5, y: 5 },
      },
    }),
  ]);

  // Both must succeed
  assert.strictEqual(res1.success, true, `Res1 failed: ${res1.error}`);
  assert.strictEqual(res2.success, true, `Res2 failed: ${res2.error}`);

  // Exactly 2 buildings must exist in CivilizationState
  const civState = await h.storage.getCivilizationState();
  assert.strictEqual(civState.buildings.length, 2, 'Both building instances must be preserved');

  const b1 = civState.buildings.find((b) => b.position.x === 0 && b.position.y === 0);
  const b2 = civState.buildings.find((b) => b.position.x === 5 && b.position.y === 5);
  assert.ok(b1, 'Building 1 at (0,0) must exist');
  assert.ok(b2, 'Building 2 at (5,5) must exist');
  assert.notStrictEqual(b1?.id, b2?.id, 'Building IDs must be distinct');

  // Verify GridMap occupancy contains both footprints
  const gridMap = GridMap.fromSnapshot(civState.grid);
  assert.strictEqual(gridMap.getOccupiedCellCount(), 2);
  assert.strictEqual(gridMap.getOccupyingBuilding(0, 0), b1?.id);
  assert.strictEqual(gridMap.getOccupyingBuilding(5, 5), b2?.id);

  // Coins must be deducted accurately: 200 - 4 - 4 = 192
  const economy = await h.storage.getEconomy();
  assert.strictEqual(economy.focusCoins, 192, 'Coins must be deducted for both transactions');
});

// -----------------------------------------------------------------------------
// Test B — Concurrent purchase with insufficient combined balance
// -----------------------------------------------------------------------------
test('Test B: Concurrent purchase with insufficient combined balance serializes safely without negative balance', async () => {
  const h = createHarness(20, 3, 300);
  // Foraging post costs 15 Coins. Seed exactly 20 Coins.
  await h.seedPrerequisites(20, 3, 300);

  const [res1, res2] = await Promise.all([
    h.handler.handleMessage({
      action: 'PLACE_BUILDING',
      payload: {
        buildingDefinitionId: 'stone_age_foraging_post', // costs 15
        position: { x: 0, y: 0 },
      },
    }),
    h.handler.handleMessage({
      action: 'PLACE_BUILDING',
      payload: {
        buildingDefinitionId: 'stone_age_foraging_post', // costs 15
        position: { x: 4, y: 4 },
      },
    }),
  ]);

  const successes = [res1, res2].filter((r) => r.success);
  const failures = [res1, res2].filter((r) => !r.success);

  assert.strictEqual(successes.length, 1, 'Exactly one purchase must succeed');
  assert.strictEqual(failures.length, 1, 'Second purchase must fail');
  assert.ok(failures[0].error?.includes('Insufficient coins'), 'Error must specify insufficient coins');

  // Ending balance must be exactly 20 - 15 = 5 (non-negative)
  const economy = await h.storage.getEconomy();
  assert.strictEqual(economy.focusCoins, 5);

  // 1 Foraging Post added + seeded Cave = 2 buildings
  const civState = await h.storage.getCivilizationState();
  assert.strictEqual(civState.buildings.length, 2);
});

// -----------------------------------------------------------------------------
// Test C — Placement + removal concurrency
// -----------------------------------------------------------------------------
test('Test C: Concurrent placement and removal preserves valid serial execution and eliminates orphaned cells', async () => {
  const h = createHarness(300, 3, 300);
  await h.seedPrerequisites(300, 3, 300, false);

  // Place initial building A at (0, 0)
  const placeA = await h.handler.handleMessage({
    action: 'PLACE_BUILDING',
    payload: {
      buildingDefinitionId: 'stone_age_campfire',
      position: { x: 0, y: 0 },
    },
  });
  assert.strictEqual(placeA.success, true);
  const buildingAId = (placeA.data as { building: { id: string } }).building.id;

  // Concurrently remove building A AND place building B at (6, 6)
  const [resRemove, resPlaceB] = await Promise.all([
    h.handler.handleMessage({
      action: 'REMOVE_BUILDING',
      payload: { buildingInstanceId: buildingAId },
    }),
    h.handler.handleMessage({
      action: 'PLACE_BUILDING',
      payload: {
        buildingDefinitionId: 'stone_age_campfire',
        position: { x: 6, y: 6 },
      },
    }),
  ]);

  assert.strictEqual(resRemove.success, true, `Remove failed: ${resRemove.error}`);
  assert.strictEqual(resPlaceB.success, true, `PlaceB failed: ${resPlaceB.error}`);

  // Final state: Building A must be gone, Building B must be present
  const civState = await h.storage.getCivilizationState();
  assert.strictEqual(civState.buildings.length, 1, 'Only building B should remain');
  assert.strictEqual(civState.buildings[0].position.x, 6);
  assert.strictEqual(civState.buildings[0].position.y, 6);

  // GridMap occupancy check: exactly 1 occupied cell at (6, 6), (0, 0) is freed
  const gridMap = GridMap.fromSnapshot(civState.grid);
  assert.strictEqual(gridMap.getOccupiedCellCount(), 1);
  assert.strictEqual(gridMap.getOccupyingBuilding(0, 0), undefined, 'Cell (0,0) must be empty');
  assert.strictEqual(gridMap.getOccupyingBuilding(6, 6), civState.buildings[0].id);
});

// -----------------------------------------------------------------------------
// Test D — Placement + expansion concurrency
// -----------------------------------------------------------------------------
test('Test D: Concurrent building placement and land expansion preserves both mutations and accurate Coins balance', async () => {
  const h = createHarness(300, 3, 300);
  await h.seedPrerequisites(300, 3, 300);
  // 1 woodworker gives -5% expand discount -> use elder + elder? Actually seedPrerequisites has 1 woodworker + 1 elder (-5%: round(60*0.95) = 57)
  // Override villager role to elder so exact baseCost 30 applies cleanly
  await h.storage.updateCivilizationState((c) => ({
    ...c,
    villagers: [{ id: 'v_seed', role: 'elder', recruitedAt: 1 }],
  }));
  const profile = await h.profileManager.createProfile('Concurrent D', []);

  // Dispatch PLACE_BUILDING (4 Coins) and EXPAND_LAND (k=1 -> 30 Coins, 60m job) concurrently
  const [resPlace, resExpand] = await Promise.all([
    h.handler.handleMessage({
      action: 'PLACE_BUILDING',
      payload: {
        buildingDefinitionId: 'stone_age_campfire',
        position: { x: 2, y: 2 },
      },
    }),
    h.handler.handleMessage({
      action: 'EXPAND_LAND',
      payload: { origin: { x: 8, y: 0 } },
    }),
  ]);

  assert.strictEqual(resPlace.success, true, `Place failed: ${resPlace.error}`);
  assert.strictEqual(resExpand.success, true, `Expand failed: ${resExpand.error}`);

  // Coins deducted accurately for both: 300 - 4 - 30 = 266
  const finalEcon = await h.storage.getEconomy();
  assert.strictEqual(finalEcon.focusCoins, 266);

  const midCiv = await h.storage.getCivilizationState();
  assert.strictEqual(midCiv.grid.chunks.length, 4, 'Chunk remains locked while clearing');
  assert.strictEqual(midCiv.jobs?.length, 1);

  // Finish 60m clearing session -> 5 chunks unlocked + Campfire & Cave preserved
  await h.sessionCoordinator.startSession('COUNTDOWN', 60, profile.id);
  await h.sessionCoordinator.completeCountdown();

  const civState = await h.storage.getCivilizationState();
  assert.strictEqual(civState.grid.chunks.length, 5, 'Expanded chunk must be unlocked after Focus');
  assert.strictEqual(civState.buildings.length, 2, 'Placed Campfire + Cave must be preserved');

  const gridMap = GridMap.fromSnapshot(civState.grid);
  assert.strictEqual(gridMap.getUnlockedCellCount(), 80);
  const campfire = civState.buildings.find((b) => b.definitionId === 'stone_age_campfire');
  assert.ok(campfire);
  assert.strictEqual(gridMap.getOccupyingBuilding(2, 2), campfire.id);
});

// -----------------------------------------------------------------------------
// Test E — Concurrent expansion in different origins
// -----------------------------------------------------------------------------
test('Test E: Concurrent land expansion at distinct origins serializes progressive pricing cleanly', async () => {
  const h = createHarness(500, 4, 300);
  await h.seedPrerequisites(500, 4, 300);
  await h.storage.updateCivilizationState((c) => ({
    ...c,
    villagers: [{ id: 'v_seed', role: 'elder', recruitedAt: 1 }],
  }));
  const profile = await h.profileManager.createProfile('Concurrent E', []);

  // Concurrently expand (0, -4) North and (0, 8) South (k=1 costs 30 Lv.3, k=2 costs 40 Lv.4)
  const [resNorth, resSouth] = await Promise.all([
    h.handler.handleMessage({
      action: 'EXPAND_LAND',
      payload: { origin: { x: 0, y: -4 } },
    }),
    h.handler.handleMessage({
      action: 'EXPAND_LAND',
      payload: { origin: { x: 0, y: 8 } },
    }),
  ]);

  assert.strictEqual(resNorth.success, true, `North expand failed: ${resNorth.error}`);
  assert.strictEqual(resSouth.success, true, `South expand failed: ${resSouth.error}`);

  // Coins deducted sequentially under mutex: 500 - (30 + 40) = 430
  const finalEcon = await h.storage.getEconomy();
  assert.strictEqual(finalEcon.focusCoins, 430);

  // Two 60m jobs queued (1 ACTIVE, 1 PENDING with 2 crew) -> 120m Focus completes both
  await h.sessionCoordinator.startSession('COUNTDOWN', 120, profile.id);
  await h.sessionCoordinator.completeCountdown();

  // Total chunks should be 4 + 2 = 6
  const civState = await h.storage.getCivilizationState();
  assert.strictEqual(civState.grid.chunks.length, 6, 'Both chunks must be persisted');

  // Verify distinct chunk origins (no duplicates)
  const originKeys = new Set(civState.grid.chunks.map((c) => `${c.origin.x},${c.origin.y}`));
  assert.strictEqual(originKeys.size, 6, 'All 6 chunk origins must be distinct');

  const gridMap = GridMap.fromSnapshot(civState.grid);
  assert.strictEqual(gridMap.getUnlockedCellCount(), 96);

  // Verify bounding box has expanded vertically in both directions (4x4 chunks)
  const box = gridMap.getBoundingBox();
  assert.strictEqual(box.minY, -4, 'North expansion should unlock y=-4');
  assert.strictEqual(box.maxY, 11, 'South expansion should unlock up to y=11');
});

// -----------------------------------------------------------------------------
// Test F — Storage failure atomicity & rollback compensation
// -----------------------------------------------------------------------------
test('Test F: Storage adapter failure rolls back state and does not poison CoinBonus cache', async () => {
  const h = createHarness(200, 3, 300);
  await h.seedPrerequisites(200, 3, 300);

  // Intercept adapter.setMultiple to simulate a fatal storage write failure
  const originalSetMultiple = h.adapter.setMultiple.bind(h.adapter);
  let shouldFailWrite = true;

  h.adapter.setMultiple = async (items: Record<string, unknown>) => {
    if (shouldFailWrite) {
      throw new Error('SIMULATED_STORAGE_WRITE_FAILURE');
    }
    return originalSetMultiple(items);
  };

  // Attempt to place an economy building (costs 60 coins, gives +2% bonus)
  const placeResult = await h.handler.handleMessage({
    action: 'PLACE_BUILDING',
    payload: {
      buildingDefinitionId: 'stone_age_foraging_post',
      position: { x: 0, y: 0 },
    },
  });

  // Purchase must fail cleanly
  assert.strictEqual(placeResult.success, false);
  assert.ok(placeResult.error?.includes('SIMULATED_STORAGE_WRITE_FAILURE'));

  // Allow storage writes again to verify the persisted state
  shouldFailWrite = false;

  // 1. Economy must NOT have deducted any coins
  const economy = await h.storage.getEconomy();
  assert.strictEqual(economy.focusCoins, 200, 'Coins must not be deducted on failed commit');

  // 2. CivilizationState still has only seeded Cave (no new building persisted)
  const civState = await h.storage.getCivilizationState();
  assert.strictEqual(civState.buildings.length, 1, 'No new building must be persisted on failure');

  // 3. CoinBonus cache must remain completely empty (not poisoned by uncommitted transaction)
  const activeBonuses = h.civilizationCoordinator.getActiveCoinBonuses();
  assert.strictEqual(activeBonuses.length, 0, 'Cache must not retain bonus from failed transaction');
});

// -----------------------------------------------------------------------------
// Test G — Concurrent placement collision on the exact same coordinate
// -----------------------------------------------------------------------------
test('Test G: Concurrent placement on the exact same coordinate rejects collision and deducts coins once', async () => {
  const h = createHarness(200, 3, 300);
  await h.seedPrerequisites(200, 3, 300, false);

  // Two concurrent requests to place a building at identical coordinate (4, 4)
  const [res1, res2] = await Promise.all([
    h.handler.handleMessage({
      action: 'PLACE_BUILDING',
      payload: {
        buildingDefinitionId: 'stone_age_campfire', // costs 4
        position: { x: 4, y: 4 },
      },
    }),
    h.handler.handleMessage({
      action: 'PLACE_BUILDING',
      payload: {
        buildingDefinitionId: 'stone_age_campfire', // costs 4
        position: { x: 4, y: 4 },
      },
    }),
  ]);

  const successes = [res1, res2].filter((r) => r.success);
  const failures = [res1, res2].filter((r) => !r.success);

  assert.strictEqual(successes.length, 1, 'Exactly one placement must succeed');
  assert.strictEqual(failures.length, 1, 'Colliding placement must fail');
  assert.ok(failures[0].error?.includes('Cannot place building'));

  // Coins deducted once: 200 - 4 = 196
  const economy = await h.storage.getEconomy();
  assert.strictEqual(economy.focusCoins, 196);

  const civState = await h.storage.getCivilizationState();
  assert.strictEqual(civState.buildings.length, 1);
});

// -----------------------------------------------------------------------------
// Test H — CoinBonus updates immediately once Focus session finishes construction
// -----------------------------------------------------------------------------
test('Test H: CoinBonus cache updates immediately on construction job completion and reflects on next session', async () => {
  const h = createHarness(300, 3, 300);
  await h.seedPrerequisites(300, 3, 300);
  const profile = await h.profileManager.createProfile('Live Bonus Test', []);

  // 1. Start a 35-minute Countdown session while 0 economy buildings exist
  await h.sessionCoordinator.startSession('COUNTDOWN', 35, profile.id);

  // 2. Mid-session: player queues Foraging Post (costs 15, 60m build job)
  const placeResp = await h.handler.handleMessage({
    action: 'PLACE_BUILDING',
    payload: {
      buildingDefinitionId: 'stone_age_foraging_post', // costs 15
      position: { x: 0, y: 0 },
    },
  });
  assert.strictEqual(placeResp.success, true);

  // Current balance after build: 300 - 15 = 285 Coins; still under construction -> 0% bonus
  const econMid = await h.storage.getEconomy();
  assert.strictEqual(econMid.focusCoins, 285);
  assert.strictEqual(h.civilizationCoordinator.getActiveCoinBonuses().length, 0);

  // 3. Complete 35m session: 0% bonus applied to this session, job advances 60m -> 25m remaining
  await h.sessionCoordinator.completeCountdown();
  await h.sessionCoordinator.resetSession();
  const econAfter35 = await h.storage.getEconomy();
  assert.strictEqual(h.civilizationCoordinator.getActiveCoinBonuses().length, 0);

  // 4. Complete a 25m session: finishes the remaining 25m construction -> activates +2% bonus immediately on hook
  await h.sessionCoordinator.startSession('COUNTDOWN', 25, profile.id);
  await h.sessionCoordinator.completeCountdown();
  await h.sessionCoordinator.resetSession();
  assert.strictEqual(h.civilizationCoordinator.getActiveCoinBonuses().length, 1);

  const coinsReady = (await h.storage.getEconomy()).focusCoins;
  const xpReady = (await h.storage.getEconomy()).totalXP;

  // 5. Subsequent 25m session receives +2% bonus (25 * 1.5 * 1.02 = 38.25 Coins, XP = +125)
  await h.sessionCoordinator.startSession('COUNTDOWN', 25, profile.id);
  await h.sessionCoordinator.completeCountdown();

  const econFinal = await h.storage.getEconomy();
  assert.ok(
    Math.abs(econFinal.focusCoins - (coinsReady + 38.25)) < EPSILON,
    `expected ${coinsReady + 38.25}, got ${econFinal.focusCoins}`
  );
  assert.strictEqual(econFinal.totalXP - xpReady, 125);
});

// -----------------------------------------------------------------------------
// Test I — EXPAND_LAND rollback rolls back clearing job & Coins cleanly on storage failure
// -----------------------------------------------------------------------------
test('Test I: EXPAND_LAND storage failure rolls back chunk and Focus Coins atomically', async () => {
  const h = createHarness(200, 3, 300);
  await h.seedPrerequisites(200, 3, 300);
  await h.storage.updateCivilizationState((c) => ({
    ...c,
    villagers: [{ id: 'v_seed', role: 'elder', recruitedAt: 1 }],
  }));
  const profile = await h.profileManager.createProfile('Rollback I', []);

  const beforeState = await h.storage.getCivilizationState();
  const chunksBefore = [...beforeState.grid.chunks];

  const originalSetMultiple = h.adapter.setMultiple.bind(h.adapter);
  let failWrite = true;
  h.adapter.setMultiple = async (items: Record<string, unknown>) => {
    if (failWrite) {
      throw new Error('SIMULATED_EXPAND_WRITE_FAILURE');
    }
    return originalSetMultiple(items);
  };

  const expandRes = await h.handler.handleMessage({
    action: 'EXPAND_LAND',
    payload: { origin: { x: 8, y: 0 } },
  });

  assert.strictEqual(expandRes.success, false);
  assert.ok(expandRes.error?.includes('SIMULATED_EXPAND_WRITE_FAILURE'));

  failWrite = false;
  const afterFailure = await h.storage.getCivilizationState();
  assert.strictEqual(afterFailure.grid.chunks.length, chunksBefore.length);
  assert.strictEqual(afterFailure.jobs?.length ?? 0, 0);
  assert.strictEqual((await h.storage.getEconomy()).focusCoins, 200);

  // Subsequent valid expansion after recovery queues cleanly and unlocks chunk after 60m Focus
  const retryRes = await h.handler.handleMessage({
    action: 'EXPAND_LAND',
    payload: { origin: { x: 8, y: 0 } },
  });
  assert.strictEqual(retryRes.success, true);
  assert.strictEqual((await h.storage.getEconomy()).focusCoins, 170);

  await h.sessionCoordinator.startSession('COUNTDOWN', 60, profile.id);
  await h.sessionCoordinator.completeCountdown();

  const afterRetry = await h.storage.getCivilizationState();
  assert.strictEqual(afterRetry.grid.chunks.length, chunksBefore.length + 1);
  assert.deepStrictEqual(Object.keys(afterRetry.grid).sort(), ['buildings', 'chunks']);
});

// -----------------------------------------------------------------------------
// Test J — Concurrent EXPAND_LAND on identical origin
// -----------------------------------------------------------------------------
test('Test J: Concurrent EXPAND_LAND on identical origin succeeds once and deducts Coins once', async () => {
  const h = createHarness(500, 4, 300);
  await h.seedPrerequisites(500, 4, 300);
  await h.storage.updateCivilizationState((c) => ({
    ...c,
    villagers: [{ id: 'v_seed', role: 'elder', recruitedAt: 1 }],
  }));

  const [res1, res2] = await Promise.all([
    h.handler.handleMessage({
      action: 'EXPAND_LAND',
      payload: { origin: { x: 8, y: 0 } },
    }),
    h.handler.handleMessage({
      action: 'EXPAND_LAND',
      payload: { origin: { x: 8, y: 0 } },
    }),
  ]);

  const successes = [res1, res2].filter((r) => r.success);
  const failures = [res1, res2].filter((r) => !r.success);

  assert.strictEqual(successes.length, 1);
  assert.strictEqual(failures.length, 1);
  assert.strictEqual(failures[0].errorCode, 'CIV_EXPAND_ALREADY_QUEUED');

  const econ = await h.storage.getEconomy();
  assert.strictEqual(econ.focusCoins, 470);
  const civ = await h.storage.getCivilizationState();
  assert.strictEqual(civ.jobs?.length, 1);
});

// -----------------------------------------------------------------------------
// Test K — Concurrent EXPAND_LAND on different origins with Coins sufficient for only 1
// -----------------------------------------------------------------------------
test('Test K: Concurrent EXPAND_LAND on different origins with Coins for 1 blocks second safely', async () => {
  // k=1 costs 30, k=2 costs 40 (total 70). Seed 55 Coins, Lv. 4.
  const h = createHarness(55, 4, 300);
  await h.seedPrerequisites(55, 4, 300);
  await h.storage.updateCivilizationState((c) => ({
    ...c,
    villagers: [{ id: 'v_seed', role: 'elder', recruitedAt: 1 }],
  }));

  const [res1, res2] = await Promise.all([
    h.handler.handleMessage({
      action: 'EXPAND_LAND',
      payload: { origin: { x: 8, y: 0 } },
    }),
    h.handler.handleMessage({
      action: 'EXPAND_LAND',
      payload: { origin: { x: -4, y: 0 } },
    }),
  ]);

  const successes = [res1, res2].filter((r) => r.success);
  const failures = [res1, res2].filter((r) => !r.success);

  assert.strictEqual(successes.length, 1);
  assert.strictEqual(failures.length, 1);
  assert.ok(failures[0].error?.includes('Insufficient coins'));

  const econ = await h.storage.getEconomy();
  assert.strictEqual(econ.focusCoins, 25);
  const civ = await h.storage.getCivilizationState();
  assert.strictEqual(civ.jobs?.length, 1);
});
