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

function createAuditHarness(initialCoins = 500, initialLevel = 3, initialMinutes = 300) {
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

  const seedPrerequisites = async (coins = initialCoins, level = initialLevel, mins = initialMinutes) => {
    await storage.setEconomy({
      focusCoins: coins,
      totalXP: 500,
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
// Test 1: Invalid deductCoins inputs (NaN, Infinity, -Infinity, negative, non-numeric)
// -----------------------------------------------------------------------------
test('Audit 1: executeCivilizationTransaction rejects invalid deductCoins inputs without mutating storage', async () => {
  const h = createAuditHarness(100);
  await h.seedPrerequisites(100);

  const invalidInputs: unknown[] = [NaN, Infinity, -Infinity, -15, -0.01, '50', null, {}];

  for (const badInput of invalidInputs) {
    if (badInput === null) continue; // null is treated as omitting deductCoins
    await assert.rejects(
      async () => {
        await h.storage.executeCivilizationTransaction(() => ({
          result: 'failed',
          deductCoins: badInput as number,
        }));
      },
      (err: Error) => {
        return err.message.includes('Invalid deductCoins');
      },
      `Expected reject for invalid input: ${String(badInput)}`
    );

    // Verify storage remains pristine
    const econ = await h.storage.getEconomy();
    assert.strictEqual(econ.focusCoins, 100, `Coins mutated for input: ${String(badInput)}`);
  }

  // deductCoins: 0 must succeed without mutating balance
  const zeroResult = await h.storage.executeCivilizationTransaction(() => ({
    result: 'zero_success',
    deductCoins: 0,
  }));
  assert.strictEqual(zeroResult.result, 'zero_success');
  const econZero = await h.storage.getEconomy();
  assert.strictEqual(econZero.focusCoins, 100);

  // Valid decimal deduction (exact IEEE-754 subtraction without floor/rounding)
  const decimalResult = await h.storage.executeCivilizationTransaction(() => ({
    result: 'decimal_success',
    deductCoins: 12.375,
  }));
  assert.strictEqual(decimalResult.result, 'decimal_success');
  const econDec = await h.storage.getEconomy();
  assert.ok(
    Math.abs(econDec.focusCoins - (100 - 12.375)) < EPSILON,
    `Expected exact 87.625, got ${econDec.focusCoins}`
  );
});

// -----------------------------------------------------------------------------
// Test 2: Corrupt storage economy and candidate civilization invariants
// -----------------------------------------------------------------------------
test('Audit 2: Corrupt economy or invalid candidate state aborts transaction before commit', async () => {
  const h = createAuditHarness();
  await h.seedPrerequisites(100);

  // 1. Corrupt economy in storage (negative balance)
  await h.adapter.set(STORAGE_KEYS.ECONOMY, {
    focusCoins: -20,
    totalXP: 100,
    level: 1,
  });

  await assert.rejects(
    async () => {
      await h.storage.executeCivilizationTransaction(() => ({
        result: 'should_fail',
        deductCoins: 10,
      }));
    },
    /Corrupt economy state/
  );

  // Restore clean economy
  await h.seedPrerequisites(100);

  // 2. Candidate civilization state validation failure (e.g. mismatched buildings and grid occupancy)
  await assert.rejects(
    async () => {
      await h.storage.executeCivilizationTransaction(({ civilization }) => {
        // Create candidate with an orphaned building not registered on the grid
        const corruptCiv: CivilizationState = {
          ...civilization,
          buildings: [
            {
              id: 'orphan_building',
              definitionId: 'stone_age_campfire',
              position: { x: 0, y: 0 },
              level: 1,
              placedAt: Date.now(),
            },
          ],
        };
        return {
          result: 'invalid_civ',
          nextCivilization: corruptCiv,
        };
      });
    },
    /Civilization state validation failed/
  );
});

// -----------------------------------------------------------------------------
// Test 3: Partial storage write failure with successful rollback compensation
// -----------------------------------------------------------------------------
test('Audit 3: Partial storage write failure executes rollback compensation and restores exact prior state', async () => {
  const h = createAuditHarness(200, 3, 300);
  await h.seedPrerequisites(200, 3, 300);

  const initialCiv = await h.storage.getCivilizationState();
  const initialEcon = await h.storage.getEconomy();

  let hasFailedOnce = false;
  const originalSetMultiple = h.adapter.setMultiple.bind(h.adapter);

  // Simulate an adapter that writes the first key (ECONOMY) successfully, then throws on CIVILIZATION
  h.adapter.setMultiple = async (items: Record<string, unknown>) => {
    if (!hasFailedOnce && items[STORAGE_KEYS.CIVILIZATION] && items[STORAGE_KEYS.ECONOMY]) {
      hasFailedOnce = true;
      // Partial write: write economy, then fail before civilization
      await h.adapter.set(STORAGE_KEYS.ECONOMY, items[STORAGE_KEYS.ECONOMY]);
      throw new Error('SIMULATED_PARTIAL_DISK_FAILURE');
    }
    return originalSetMultiple(items);
  };

  const placeResult = await h.handler.handleMessage({
    action: 'PLACE_BUILDING',
    payload: {
      buildingDefinitionId: 'stone_age_foraging_post',
      position: { x: 0, y: 0 },
    },
  });

  assert.strictEqual(placeResult.success, false);
  assert.ok(placeResult.error?.includes('SIMULATED_PARTIAL_DISK_FAILURE'));

  // Verify rollback restored economy balance to 200 (not 140)
  const restoredEcon = await h.storage.getEconomy();
  assert.strictEqual(restoredEcon.focusCoins, initialEcon.focusCoins, 'Economy must be rolled back');

  const restoredCiv = await h.storage.getCivilizationState();
  assert.strictEqual(restoredCiv.buildings.length, initialCiv.buildings.length, 'Civilization must be rolled back');

  // Verify in-memory cache was not poisoned
  assert.strictEqual(h.civilizationCoordinator.getActiveCoinBonuses().length, 0);
});

// -----------------------------------------------------------------------------
// Test 4: Rollback failure produces explicit transparent error (not swallowed)
// -----------------------------------------------------------------------------
test('Audit 4: Rollback failure is NOT swallowed and reports both primary write and rollback errors', async () => {
  const h = createAuditHarness(200, 3, 300);
  await h.seedPrerequisites(200, 3, 300);

  // Make setMultiple always throw so both primary commit and rollback compensation fail
  h.adapter.setMultiple = async () => {
    throw new Error('PERMANENT_IO_CRASH');
  };

  await assert.rejects(
    async () => {
      await h.storage.executeCivilizationTransaction(({ civilization }) => ({
        result: 'fail',
        nextCivilization: {
          ...civilization,
          lastUpdated: 999999,
        },
      }));
    },
    (err: Error) => {
      const msg = err.message;
      return (
        msg.includes('Transaction write failed: "PERMANENT_IO_CRASH"') &&
        msg.includes('Critical: Rollback compensation also failed: "PERMANENT_IO_CRASH"') &&
        msg.includes('Storage may be in an inconsistent state')
      );
    },
    'Should throw combined error disclosing rollback failure'
  );
});

// -----------------------------------------------------------------------------
// Test 5: Storage unreadable on transaction start aborts cleanly
// -----------------------------------------------------------------------------
test('Audit 5: Storage read failure on transaction start aborts cleanly under mutex', async () => {
  const h = createAuditHarness();
  await h.seedPrerequisites();

  h.adapter.get = async () => {
    throw new Error('STORAGE_UNREADABLE');
  };

  await assert.rejects(
    async () => {
      await h.storage.executeCivilizationTransaction(() => ({
        result: 'should_not_run',
      }));
    },
    /STORAGE_UNREADABLE/
  );
});

// -----------------------------------------------------------------------------
// Test 6: Concurrent mutation arriving while previous transaction is rolling back
// -----------------------------------------------------------------------------
test('Audit 6: Concurrent mutation arriving while prior transaction is handling rollback serializes safely', async () => {
  const h = createAuditHarness(300, 3, 300);
  await h.seedPrerequisites(300, 3, 300);

  const originalSetMultiple = h.adapter.setMultiple.bind(h.adapter);
  let failFirstAttempt = true;

  // Adapter that fails on first attempt and adds a simulated delay during rollback
  h.adapter.setMultiple = async (items: Record<string, unknown>) => {
    if (failFirstAttempt) {
      failFirstAttempt = false;
      // Simulate slow rollback
      throw new Error('FIRST_WRITE_FAIL');
    }
    return originalSetMultiple(items);
  };

  // Trigger transaction 1 (fails and rolls back) and transaction 2 (succeeds) concurrently
  const [res1, res2] = await Promise.allSettled([
    h.handler.handleMessage({
      action: 'PLACE_BUILDING',
      payload: {
        buildingDefinitionId: 'stone_age_campfire', // costs 15
        position: { x: 0, y: 0 },
      },
    }),
    h.handler.handleMessage({
      action: 'PLACE_BUILDING',
      payload: {
        buildingDefinitionId: 'stone_age_campfire', // costs 15
        position: { x: 5, y: 5 },
      },
    }),
  ]);

  // Exactly one rejected, one fulfilled
  const results = [res1, res2];
  const fulfilled = results.filter((r) => r.status === 'fulfilled') as PromiseFulfilledResult<{ success: boolean; error?: string }>[];

  const succCount = fulfilled.filter((f) => f.value.success).length;
  const failCount = fulfilled.filter((f) => !f.value.success).length;

  assert.strictEqual(succCount, 1, 'Second mutation must succeed after first rollback finishes');
  assert.strictEqual(failCount, 1, 'First mutation must report failure');

  // Storage must contain exactly 1 building at (5, 5) and deducted 15 coins
  const civ = await h.storage.getCivilizationState();
  assert.strictEqual(civ.buildings.length, 1);
  assert.strictEqual(civ.buildings[0].position.x, 5);

  const econ = await h.storage.getEconomy();
  assert.strictEqual(econ.focusCoins, 285);
});

// -----------------------------------------------------------------------------
// Test 7: Race condition verification — Settlement at exact boundary of CoinBonus commit
// -----------------------------------------------------------------------------
test('Audit 7: Settlement occurring concurrently with building placement receives new CoinBonus with zero stale window', async () => {
  const h = createAuditHarness(300, 3, 300);
  await h.seedPrerequisites(300, 3, 300);
  const profile = await h.profileManager.createProfile('Bonus Settlement Race', []);

  // 1. Start a 20-minute Countdown session
  await h.sessionCoordinator.startSession('COUNTDOWN', 20, profile.id);

  // 2. Dispatch PLACE_BUILDING (costs 60, gives +2% bonus) and completeCountdown concurrently
  const [placeResp, compResp] = await Promise.all([
    h.handler.handleMessage({
      action: 'PLACE_BUILDING',
      payload: {
        buildingDefinitionId: 'stone_age_foraging_post',
        position: { x: 0, y: 0 },
      },
    }),
    h.sessionCoordinator.completeCountdown(),
  ]);

  assert.strictEqual(placeResp.success, true);
  assert.ok(compResp);

  // Both operations were serialized under StorageMutex.
  // Whichever ran first, because onCommitted runs INSIDE the mutex lock before release:
  // If placeBuilding committed first:
  //   - Balance was 300 - 60 = 240
  //   - completeCountdown ran second, saw +2% bonus
  //   - Coins earned: 20 * 1.5 * 1.02 = 30.6
  //   - Final balance: 240 + 30.6 = 270.6
  // If completeCountdown committed first:
  //   - Coins earned: 20 * 1.5 * 1.0 = 30
  //   - Balance became 300 + 30 = 330
  //   - placeBuilding ran second: balance = 330 - 60 = 270
  // Crucially, coins must be either 270.6 or 270.0 (strictly serialized, no lost update or negative balance)
  const finalEcon = await h.storage.getEconomy();
  const validBalances = [270.6, 270.0];
  const matched = validBalances.some((b) => Math.abs(finalEcon.focusCoins - b) < EPSILON);
  assert.ok(
    matched,
    `Final balance ${finalEcon.focusCoins} must be strictly serialized (either 270.6 or 270.0)`
  );

  // XP is completely unchanged by CoinBonus: 500 initial + 100 earned = 600
  assert.strictEqual(finalEcon.totalXP, 600);
});

// -----------------------------------------------------------------------------
// Test 8: Race condition verification — Settlement at exact boundary of building removal
// -----------------------------------------------------------------------------
test('Audit 8: Settlement occurring concurrently with building removal immediately revokes bonus without stale credit', async () => {
  const h = createAuditHarness(300, 3, 300);
  await h.seedPrerequisites(300, 3, 300);
  const profile = await h.profileManager.createProfile('Bonus Revoke Race', []);

  // 1. Place building (+2% bonus)
  const placeResp = await h.handler.handleMessage({
    action: 'PLACE_BUILDING',
    payload: {
      buildingDefinitionId: 'stone_age_foraging_post',
      position: { x: 0, y: 0 },
    },
  });
  assert.strictEqual(placeResp.success, true);
  const bldId = (placeResp.data as { building: { id: string } }).building.id;

  // Active bonuses must contain +2% bonus
  assert.strictEqual(h.civilizationCoordinator.getActiveCoinBonuses().length, 1);

  // 2. Start a 20-minute Countdown session
  await h.sessionCoordinator.startSession('COUNTDOWN', 20, profile.id);

  // 3. Concurrently remove building AND complete session
  const [removeResp, compResp] = await Promise.all([
    h.handler.handleMessage({
      action: 'REMOVE_BUILDING',
      payload: { buildingInstanceId: bldId },
    }),
    h.sessionCoordinator.completeCountdown(),
  ]);

  assert.strictEqual(removeResp.success, true);
  assert.ok(compResp);

  // Active bonuses must now be empty
  assert.strictEqual(h.civilizationCoordinator.getActiveCoinBonuses().length, 0);

  // Final economy must be serialized accurately (Stage 5C-1 includes 50% demolish refund = +30 Coins)
  const econ = await h.storage.getEconomy();
  // Initial 300 -> place Foraging Post (-60) = 240.
  // Remove refunds 50% (+30 Coins -> 270).
  // If remove ran first: 240 + 30 + (20 * 1.5 * 1.0) = 300.0
  // If complete ran first: 240 + (20 * 1.5 * 1.02) + 30 = 300.6
  const validBalances = [300.0, 300.6];
  const matched = validBalances.some((b) => Math.abs(econ.focusCoins - b) < EPSILON);
  assert.ok(matched, `Final balance ${econ.focusCoins} must be either 300.0 or 300.6`);
});

// -----------------------------------------------------------------------------
// Test 9: Service Worker reinitialization and cache recovery
// -----------------------------------------------------------------------------
test('Audit 9: Fresh Service Worker instance rehydrates CoinBonus cache accurately from persisted state', async () => {
  const h = createAuditHarness(300, 3, 300);
  await h.seedPrerequisites(300, 3, 300);

  // 1. Place 2 buildings:
  // - stone_age_foraging_post (+2% coin bonus)
  // - stone_age_food_cache (+3% coin bonus)
  const r1 = await h.handler.handleMessage({
    action: 'PLACE_BUILDING',
    payload: {
      buildingDefinitionId: 'stone_age_foraging_post',
      position: { x: 0, y: 0 },
    },
  });
  const r2 = await h.handler.handleMessage({
    action: 'PLACE_BUILDING',
    payload: {
      buildingDefinitionId: 'stone_age_food_cache',
      position: { x: 4, y: 4 },
    },
  });
  assert.strictEqual(r1.success, true);
  assert.strictEqual(r2.success, true);

  // 2. Simulate Service Worker termination and restart with fresh coordinator instance
  const newCivCoordinator = new CivilizationCoordinator(h.storage);

  // Before ensureInitialized, bonuses are uninitialized
  assert.strictEqual(newCivCoordinator.getActiveCoinBonuses().length, 0);

  // Call ensureInitialized concurrently 3 times (test deduplication promise)
  await Promise.all([
    newCivCoordinator.ensureInitialized(),
    newCivCoordinator.ensureInitialized(),
    newCivCoordinator.ensureInitialized(),
  ]);

  // Cache must be accurately recovered: 2 bonuses summing to +5% (+0.05)
  const bonuses = newCivCoordinator.getActiveCoinBonuses();
  assert.strictEqual(bonuses.length, 2);
  const totalFactor = bonuses.reduce((acc, b) => acc + b.rate, 0);
  assert.ok(Math.abs(totalFactor - 0.05) < EPSILON, `Expected 0.05, got ${totalFactor}`);
});

// -----------------------------------------------------------------------------
// Test 10: Corrupt CivilizationState recovery via transaction
// -----------------------------------------------------------------------------
test('Audit 10: Corrupt CivilizationState re-initializes cleanly via executeCivilizationTransaction', async () => {
  const h = createAuditHarness();
  await h.seedPrerequisites();

  // Corrupt the civilization key in storage directly
  await h.adapter.set(STORAGE_KEYS.CIVILIZATION, { invalid: 'corrupted_state_data' });

  // getCivilizationState() must detect the corruption and reset state cleanly under mutex
  const recoveredState = await h.civilizationCoordinator.getCivilizationState();
  assert.strictEqual(recoveredState.schemaVersion, 2);
  assert.strictEqual(recoveredState.era, 'STONE_AGE');
  assert.strictEqual(recoveredState.buildings.length, 0);

  // Ensure storage was updated with the clean state
  const storedCiv = await h.storage.getCivilizationState();
  assert.strictEqual(storedCiv.buildings.length, 0);
  assert.strictEqual(storedCiv.grid.chunks.length, 4);
});

// -----------------------------------------------------------------------------
// Test 11: Stale snapshot prevention — updateCivilizationState serializes mutation callbacks
// -----------------------------------------------------------------------------
test('Audit 11: updateCivilizationState cannot overwrite newer state with stale snapshot', async () => {
  const h = createAuditHarness(200);
  await h.seedPrerequisites(200);

  // 1. updateCivilizationState receives an updater evaluated against fresh locked state
  const updated = await h.storage.updateCivilizationState((current) => ({
    ...current,
    lastUpdated: 123456789,
  }));
  assert.strictEqual(updated.lastUpdated, 123456789);

  // 2. Concurrently run 2 updates; both updaters must see and preserve each other's increments
  await Promise.all([
    h.storage.updateCivilizationState((current) => ({
      ...current,
      lastUpdated: current.lastUpdated + 1,
    })),
    h.storage.updateCivilizationState((current) => ({
      ...current,
      lastUpdated: current.lastUpdated + 10,
    })),
  ]);

  const finalCiv = await h.storage.getCivilizationState();
  // 123456789 + 1 + 10 = 123456800
  assert.strictEqual(finalCiv.lastUpdated, 123456800, 'Concurrent updates must serialize without stale snapshot overwrites');

  // 3. Confirm commitBuildingPlacement (which accepted stale precomputed snapshots) is removed
  assert.strictEqual(
    (h.storage as unknown as Record<string, unknown>).commitBuildingPlacement,
    undefined,
    'commitBuildingPlacement must be removed to eliminate stale precomputed snapshot mutations'
  );
});

// -----------------------------------------------------------------------------
// Test 12: Deadlock-free in-place recovery when storage data is corrupted
// -----------------------------------------------------------------------------
test('Audit 12: Corrupt storage data does NOT deadlock when concurrent mutation arrives', async () => {
  const h = createAuditHarness(300, 3, 300);
  await h.seedPrerequisites(300, 3, 300);

  // 1. Directly inject corrupt civilization data into storage
  await h.adapter.set(STORAGE_KEYS.CIVILIZATION, {
    corrupted: true,
    bogusField: 12345,
  });

  // 2. Concurrently call getCivilizationState() and placeBuilding()
  // Must NOT cause a nested-lock deadlock; both must complete within reasonable time
  const [getStateRes, placeRes] = await Promise.all([
    h.civilizationCoordinator.getCivilizationState(),
    h.handler.handleMessage({
      action: 'PLACE_BUILDING',
      payload: {
        buildingDefinitionId: 'stone_age_campfire',
        position: { x: 0, y: 0 },
      },
    }),
  ]);

  // Both operations must succeed
  assert.ok(getStateRes);
  assert.strictEqual(getStateRes.schemaVersion, 2);
  assert.strictEqual(placeRes.success, true, `Placement failed: ${placeRes.error}`);

  // Storage must now be fully healed and contain the new building
  const finalCiv = await h.storage.getCivilizationState();
  assert.strictEqual(finalCiv.schemaVersion, 2);
  assert.strictEqual(finalCiv.buildings.length, 1);
  assert.strictEqual(finalCiv.buildings[0].definitionId, 'stone_age_campfire');
});

// -----------------------------------------------------------------------------
// Test 13: onCommitted hook exception does not falsely fail committed storage transaction
// -----------------------------------------------------------------------------
test('Audit 13: onCommitted hook error does not cause caller to receive false failure after successful commit', async () => {
  const h = createAuditHarness(200);
  await h.seedPrerequisites(200);

  // Execute a transaction whose onCommitted hook throws
  const txResult = await h.storage.executeCivilizationTransaction(({ civilization }) => ({
    result: 'committed_payload',
    nextCivilization: {
      ...civilization,
      lastUpdated: 555555,
    },
    deductCoins: 10,
    onCommitted: () => {
      throw new Error('SIMULATED_HOOK_ERROR');
    },
  }));

  // Transaction must still report success because storage was committed
  assert.strictEqual(txResult.result, 'committed_payload');
  assert.strictEqual(txResult.civilization.lastUpdated, 555555);

  // Verify storage was committed
  const storedCiv = await h.storage.getCivilizationState();
  assert.strictEqual(storedCiv.lastUpdated, 555555);

  const storedEcon = await h.storage.getEconomy();
  assert.strictEqual(storedEcon.focusCoins, 190);
});
