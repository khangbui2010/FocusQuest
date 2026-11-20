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
import { QuestCoordinator } from '../../src/background/questCoordinator.ts';
import { MessageHandler } from '../../src/background/messageHandler.ts';
import { STORAGE_KEYS } from '../../src/storage/storageKeys.ts';
import {
  UpgradeBuildingResponseData,
  PlaceBuildingResponseData,
  RemoveBuildingResponseData,
} from '../../src/types/messages.ts';
import { createInitialQuestState } from '../../src/core/quests/questEngine.ts';
import { formatLocalDateKey } from '../../src/core/quests/questDates.ts';
import { aggregateCoinBonus } from '../../src/core/economy/coinBonus.ts';

const EPSILON = 1e-9;

function createStage5C1Harness() {
  const adapter = new MemoryStorageAdapter();
  const storage = new StorageManager(adapter);
  const profileManager = new ProfileManager(storage);
  const alarms = new MockAlarmsAdapter();
  const notifications = new MockNotificationsAdapter();
  const badge = new MockBadgeAdapter();
  const dnr = new MockDNRAdapter();
  const blockingCoordinator = new BlockingCoordinator(dnr);

  const civCoordinator = new CivilizationCoordinator(storage);
  const questCoordinator = new QuestCoordinator(storage);
  const sessionCoordinator = new SessionCoordinator(
    storage,
    profileManager,
    alarms,
    notifications,
    badge,
    blockingCoordinator,
    () => civCoordinator.getActiveCoinBonuses()
  );

  const handler = new MessageHandler(
    sessionCoordinator,
    profileManager,
    storage,
    civCoordinator,
    undefined,
    questCoordinator
  );

  async function seedPlayer(coins = 2000, xp = 1500, level = 6, focusMinutes = 500) {
    await storage.setEconomy({
      focusCoins: coins,
      totalXP: xp,
      level,
    });
    const today = formatLocalDateKey(Date.now());
    await storage.setDailyStats({
      [today]: {
        date: today,
        totalFocusMinutes: focusMinutes,
        completedSessions: 5,
        abandonedSessions: 0,
        coinsEarned: 100,
        xpEarned: 300,
      },
    });
    await storage.setQuests(createInitialQuestState(Date.now()));
  }

  return {
    adapter,
    storage,
    profileManager,
    civCoordinator,
    questCoordinator,
    sessionCoordinator,
    handler,
    seedPlayer,
  };
}

test('Stage 5C-1 Handler & Coordinator: UPGRADE_BUILDING validates payload strictly and enforces gates', async () => {
  const h = createStage5C1Harness();
  await h.seedPlayer(2000, 100, 2, 300); // Level 2 (100 XP)

  // Invalid payloads rejected before storage mutation
  const badPayloads = [
    undefined,
    {},
    { buildingId: '', expectedLevel: 1 },
    { buildingId: 'b1', expectedLevel: 0 },
    { buildingId: 'b1', expectedLevel: 1.5 },
    { buildingId: 'b1', expectedLevel: '1' },
  ];
  for (const payload of badPayloads) {
    const res = await h.handler.handleMessage({
      action: 'UPGRADE_BUILDING',
      payload,
    });
    assert.equal(res.success, false);
    assert.equal(res.errorCode, 'CIV_INVALID_UPGRADE_PAYLOAD');
  }

  // Non-existent building -> BUILDING_NOT_FOUND
  const missingRes = await h.handler.handleMessage({
    action: 'UPGRADE_BUILDING',
    payload: { buildingId: 'missing_bld_id', expectedLevel: 1 },
  });
  assert.equal(missingRes.success, false);
  assert.equal(missingRes.errorCode, 'BUILDING_NOT_FOUND');

  // Place Decorative + Focus Support + Economy buildings
  const campRes = await h.handler.handleMessage({
    action: 'PLACE_BUILDING',
    payload: { buildingDefinitionId: 'stone_age_campfire', position: { x: 0, y: 0 } },
  });
  const caveRes = await h.handler.handleMessage({
    action: 'PLACE_BUILDING',
    payload: { buildingDefinitionId: 'stone_age_study_cave', position: { x: 2, y: 0 } },
  });
  const granaryRes = await h.handler.handleMessage({
    action: 'PLACE_BUILDING',
    payload: { buildingDefinitionId: 'stone_age_food_cache', position: { x: 0, y: 4 } },
  });
  assert.equal(campRes.success, true);
  assert.equal(caveRes.success, true);
  assert.equal(granaryRes.success, true);

  const campData = campRes.data as PlaceBuildingResponseData;
  const caveData = caveRes.data as PlaceBuildingResponseData;
  const granaryData = granaryRes.data as PlaceBuildingResponseData;

  // Decorative & Focus Support reject upgrade with CIV_UPGRADE_NOT_SUPPORTED
  for (const bldId of [campData.building.id, caveData.building.id]) {
    const upRes = await h.handler.handleMessage({
      action: 'UPGRADE_BUILDING',
      payload: { buildingId: bldId, expectedLevel: 1 },
    });
    assert.equal(upRes.success, false);
    assert.equal(upRes.errorCode, 'CIV_UPGRADE_NOT_SUPPORTED');
  }

  // Granary L1->L2 requires Player Level 3 (minPlayerLevel 2 + 1 = 3); player is Lv. 2
  const lvErrRes = await h.handler.handleMessage({
    action: 'UPGRADE_BUILDING',
    payload: { buildingId: granaryData.building.id, expectedLevel: 1 },
  });
  assert.equal(lvErrRes.success, false);
  assert.equal(lvErrRes.errorCode, 'UPGRADE_PLAYER_LEVEL_REQUIRED');
  assert.equal(lvErrRes.errorParams?.requiredLevel, 3);

  // Low coins -> CIV_INSUFFICIENT_BUILDING_COINS
  await h.storage.setEconomy({ focusCoins: 50, totalXP: 1500, level: 6 });
  const coinErrRes = await h.handler.handleMessage({
    action: 'UPGRADE_BUILDING',
    payload: { buildingId: granaryData.building.id, expectedLevel: 1 },
  });
  assert.equal(coinErrRes.success, false);
  assert.equal(coinErrRes.errorCode, 'CIV_INSUFFICIENT_BUILDING_COINS');
});

test('Stage 5C-1 Reward Integration: upgrading L1->L5 deducts exact Coins, updates CoinBonus live without touching dailyStats/quests, XP unchanged', async () => {
  const h = createStage5C1Harness();
  await h.seedPlayer(2000, 1500, 6, 500);
  const profile = await h.profileManager.createProfile('Upgrade Integration', []);

  const beforeStats = await h.storage.getDailyStats();
  const beforeQuests = await h.storage.getQuests();

  // Place Foraging Post (cost 60 -> 1940 Coins left, +2% bonus)
  const placeRes = await h.handler.handleMessage({
    action: 'PLACE_BUILDING',
    payload: { buildingDefinitionId: 'stone_age_foraging_post', position: { x: 0, y: 0 } },
  });
  assert.equal(placeRes.success, true);
  const bldId = (placeRes.data as PlaceBuildingResponseData).building.id;
  assert.ok(Math.abs(aggregateCoinBonus(h.civCoordinator.getActiveCoinBonuses()) - 0.02) < EPSILON);

  // Upgrade sequentially L1 -> L5: costs [96, 154, 246, 393] (total = 889)
  const expectedCosts = [96, 154, 246, 393];
  let expectedCoins = 1940;
  for (let idx = 0; idx < expectedCosts.length; idx += 1) {
    const expectedLevel = idx + 1;
    const upRes = await h.handler.handleMessage({
      action: 'UPGRADE_BUILDING',
      payload: { buildingId: bldId, expectedLevel },
    });
    assert.equal(upRes.success, true, `Upgrade L${expectedLevel}->L${expectedLevel + 1} failed: ${upRes.error}`);
    const upData = upRes.data as UpgradeBuildingResponseData;
    assert.equal(upData.newLevel, expectedLevel + 1);
    assert.equal(upData.cost, expectedCosts[idx]);
    expectedCoins -= expectedCosts[idx];
    assert.equal(upData.economy.focusCoins, expectedCoins);
    assert.equal(upData.economy.totalXP, 1500, 'Upgrading must never alter totalXP');
  }

  // Bonus cache now reflects Lv.5 Foraging Post (+10% = 0.10)
  assert.ok(Math.abs(aggregateCoinBonus(h.civCoordinator.getActiveCoinBonuses()) - 0.1) < EPSILON);

  // Attempting L5 -> L6 fails with BUILDING_MAX_LEVEL
  const overMaxRes = await h.handler.handleMessage({
    action: 'UPGRADE_BUILDING',
    payload: { buildingId: bldId, expectedLevel: 5 },
  });
  assert.equal(overMaxRes.success, false);
  assert.equal(overMaxRes.errorCode, 'BUILDING_MAX_LEVEL');

  // Upgrade MUST NOT write to fq_daily_stats or fq_quests
  assert.deepEqual(await h.storage.getDailyStats(), beforeStats);
  assert.deepEqual(await h.storage.getQuests(), beforeQuests);

  // Subsequent Focus session uses +10% CoinBonus (10m Countdown = 10 * 1.5 * 1.0 * 1.10 = 16.5 Coins, XP = 50)
  await h.sessionCoordinator.startSession('COUNTDOWN', 10, profile.id);
  await h.sessionCoordinator.completeCountdown();

  const afterEcon = await h.storage.getEconomy();
  assert.ok(Math.abs(afterEcon.focusCoins - (expectedCoins + 16.5)) < EPSILON);
  assert.equal(afterEcon.totalXP, 1550);
});

test('Stage 5C-1 Concurrency & Rollback: concurrent upgrades enforce expectedLevel and storage failure rolls back without cache poison', async () => {
  const h = createStage5C1Harness();
  await h.seedPlayer(1000, 1500, 6, 500);

  const placeRes = await h.handler.handleMessage({
    action: 'PLACE_BUILDING',
    payload: { buildingDefinitionId: 'stone_age_foraging_post', position: { x: 0, y: 0 } },
  });
  assert.equal(placeRes.success, true);
  const bldId = (placeRes.data as PlaceBuildingResponseData).building.id;
  // Remaining Coins = 940

  // 1. Two concurrent upgrade requests with same expectedLevel: 1
  const [r1, r2] = await Promise.all([
    h.handler.handleMessage({
      action: 'UPGRADE_BUILDING',
      payload: { buildingId: bldId, expectedLevel: 1 },
    }),
    h.handler.handleMessage({
      action: 'UPGRADE_BUILDING',
      payload: { buildingId: bldId, expectedLevel: 1 },
    }),
  ]);

  const successes = [r1, r2].filter((r) => r.success);
  const failures = [r1, r2].filter((r) => !r.success);
  assert.equal(successes.length, 1, 'Strictly one concurrent upgrade must succeed');
  assert.equal(failures.length, 1, 'Second concurrent upgrade must be rejected');
  assert.equal(failures[0].errorCode, 'BUILDING_LEVEL_MISMATCH');

  const econAfterRace = await h.storage.getEconomy();
  assert.equal(econAfterRace.focusCoins, 940 - 96, 'Coins must only be deducted once');
  assert.ok(Math.abs(aggregateCoinBonus(h.civCoordinator.getActiveCoinBonuses()) - 0.04) < EPSILON);

  // 2. Partial storage write failure during L2->L3 must rollback economy & civilization and preserve +4% cache
  const originalSetMultiple = h.adapter.setMultiple.bind(h.adapter);
  let failOnce = true;
  h.adapter.setMultiple = async (items: Record<string, unknown>) => {
    if (failOnce && items[STORAGE_KEYS.CIVILIZATION] && items[STORAGE_KEYS.ECONOMY]) {
      failOnce = false;
      await h.adapter.set(STORAGE_KEYS.ECONOMY, items[STORAGE_KEYS.ECONOMY]);
      throw new Error('SIMULATED_UPGRADE_DISK_CRASH');
    }
    return originalSetMultiple(items);
  };

  const failUpgradeRes = await h.handler.handleMessage({
    action: 'UPGRADE_BUILDING',
    payload: { buildingId: bldId, expectedLevel: 2 },
  });
  assert.equal(failUpgradeRes.success, false);

  const rolledEcon = await h.storage.getEconomy();
  const rolledCiv = await h.storage.getCivilizationState();
  assert.equal(rolledEcon.focusCoins, 844);
  assert.equal(rolledCiv.buildings[0].level, 2);
  assert.ok(Math.abs(aggregateCoinBonus(h.civCoordinator.getActiveCoinBonuses()) - 0.04) < EPSILON);
});

test('Stage 5C-1 Placement Cap & 50% Demolish Refund: enforces 4 Economy max, refunds 50% of base + upgrades, and handles rollback', async () => {
  const h = createStage5C1Harness();
  await h.seedPlayer(2000, 1500, 6, 500);

  // Place 4 Foraging Posts (each 2x2) inside initial 8x8 map: (0,0), (2,0), (4,0), (6,0)
  const placedIds: string[] = [];
  for (const x of [0, 2, 4, 6]) {
    const res = await h.handler.handleMessage({
      action: 'PLACE_BUILDING',
      payload: { buildingDefinitionId: 'stone_age_foraging_post', position: { x, y: 0 } },
    });
    assert.equal(res.success, true, `Failed placing Foraging Post #${placedIds.length + 1}: ${res.error}`);
    placedIds.push((res.data as PlaceBuildingResponseData).building.id);
  }

  // 5th Foraging Post must be rejected with CIV_ECONOMY_BUILDING_LIMIT_REACHED
  const fifthForageRes = await h.handler.handleMessage({
    action: 'PLACE_BUILDING',
    payload: { buildingDefinitionId: 'stone_age_foraging_post', position: { x: 0, y: 2 } },
  });
  assert.equal(fifthForageRes.success, false);
  assert.equal(fifthForageRes.errorCode, 'CIV_ECONOMY_BUILDING_LIMIT_REACHED');
  assert.equal(fifthForageRes.errorParams?.buildingName, 'Foraging Post');

  // Primitive Granary has its own independent 0/4 Build Limit and can still be placed 4 times
  for (const pos of [
    { x: 0, y: 2 },
    { x: 2, y: 2 },
    { x: 4, y: 2 },
    { x: 0, y: 5 },
  ]) {
    const gRes = await h.handler.handleMessage({
      action: 'PLACE_BUILDING',
      payload: { buildingDefinitionId: 'stone_age_food_cache', position: pos },
    });
    assert.equal(gRes.success, true, `Failed placing Primitive Granary at (${pos.x},${pos.y}): ${gRes.error}`);
  }

  // 5th Primitive Granary hits CIV_ECONOMY_BUILDING_LIMIT_REACHED
  const fifthGranaryRes = await h.handler.handleMessage({
    action: 'PLACE_BUILDING',
    payload: { buildingDefinitionId: 'stone_age_food_cache', position: { x: 2, y: 5 } },
  });
  assert.equal(fifthGranaryRes.success, false);
  assert.equal(fifthGranaryRes.errorCode, 'CIV_ECONOMY_BUILDING_LIMIT_REACHED');
  assert.equal(fifthGranaryRes.errorParams?.buildingName, 'Primitive Granary');

  // Decorative & Focus Support buildings are still allowed when Economy caps are full
  const decorRes = await h.handler.handleMessage({
    action: 'PLACE_BUILDING',
    payload: { buildingDefinitionId: 'stone_age_campfire', position: { x: 7, y: 2 } },
  });
  assert.equal(decorRes.success, true);
  const decorData = decorRes.data as PlaceBuildingResponseData;

  // Upgrade first Foraging Post to Lv.3 (total spent: 60 + 96 + 154 = 310 -> 50% refund = 155)
  const firstId = placedIds[0];
  await h.handler.handleMessage({
    action: 'UPGRADE_BUILDING',
    payload: { buildingId: firstId, expectedLevel: 1 },
  });
  await h.handler.handleMessage({
    action: 'UPGRADE_BUILDING',
    payload: { buildingId: firstId, expectedLevel: 2 },
  });

  const econBeforeDemolish = await h.storage.getEconomy();
  const removeRes = await h.handler.handleMessage({
    action: 'REMOVE_BUILDING',
    payload: { buildingInstanceId: firstId },
  });
  assert.equal(removeRes.success, true);
  const removeData = removeRes.data as RemoveBuildingResponseData;
  assert.equal(removeData.refundedCoins, 155);
  assert.equal(removeData.economy!.focusCoins, econBeforeDemolish.focusCoins + 155);

  // Removing 1 Foraging Post frees a Foraging Post slot while Granary remains capped
  const replacementRes = await h.handler.handleMessage({
    action: 'PLACE_BUILDING',
    payload: { buildingDefinitionId: 'stone_age_foraging_post', position: { x: 0, y: 0 } },
  });
  assert.equal(replacementRes.success, true);

  // Rollback check on REMOVE_BUILDING partial storage failure (e.g. Campfire 7.5 refund)
  const originalSetMultiple = h.adapter.setMultiple.bind(h.adapter);
  const econBeforeFailRemove = await h.storage.getEconomy();
  let failRemoveOnce = true;
  h.adapter.setMultiple = async (items: Record<string, unknown>) => {
    if (failRemoveOnce && items[STORAGE_KEYS.CIVILIZATION] && items[STORAGE_KEYS.ECONOMY]) {
      failRemoveOnce = false;
      await h.adapter.set(STORAGE_KEYS.ECONOMY, items[STORAGE_KEYS.ECONOMY]);
      throw new Error('SIMULATED_REMOVE_FAIL');
    }
    return originalSetMultiple(items);
  };

  const failRemove = await h.handler.handleMessage({
    action: 'REMOVE_BUILDING',
    payload: { buildingInstanceId: decorData.building.id },
  });
  assert.equal(failRemove.success, false);
  const econAfterFailRemove = await h.storage.getEconomy();
  assert.equal(econAfterFailRemove.focusCoins, econBeforeFailRemove.focusCoins);
  const civAfterFailRemove = await h.storage.getCivilizationState();
  assert.ok(civAfterFailRemove.buildings.some((b) => b.id === decorData.building.id));
});
