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
  PlaceBuildingResponseData,
  RecruitVillagerResponseData,
  RemoveBuildingResponseData,
  UpgradeBuildingResponseData,
} from '../../src/types/messages.ts';
import { createInitialQuestState } from '../../src/core/quests/questEngine.ts';
import { formatLocalDateKey } from '../../src/core/quests/questDates.ts';
import { aggregateCoinBonus } from '../../src/core/economy/coinBonus.ts';

function createVillagerHarness() {
  const adapter = new MemoryStorageAdapter();
  const storage = new StorageManager(adapter);
  const profileManager = new ProfileManager(storage);
  const blockingCoordinator = new BlockingCoordinator(new MockDNRAdapter());
  const civCoordinator = new CivilizationCoordinator(storage);
  const questCoordinator = new QuestCoordinator(storage);
  const sessionCoordinator = new SessionCoordinator(
    storage,
    profileManager,
    new MockAlarmsAdapter(),
    new MockNotificationsAdapter(),
    new MockBadgeAdapter(),
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

  async function seed(coins = 5000, xp = 10000, level = 10, focusMinutes = 600) {
    await storage.setEconomy({ focusCoins: coins, totalXP: xp, level });
    const today = formatLocalDateKey(Date.now());
    await storage.setDailyStats({
      [today]: {
        date: today,
        totalFocusMinutes: focusMinutes,
        completedSessions: 8,
        abandonedSessions: 0,
        coinsEarned: 150,
        xpEarned: 450,
      },
    });
    await storage.setQuests(createInitialQuestState(Date.now()));
  }

  return { adapter, storage, profileManager, civCoordinator, sessionCoordinator, handler, seed };
}

test('Villager V2 Integration: 1-Cave cap, Lv1->5 upgrade capacity, exponential recruit cost, demolish guard, zero reward pollution', async () => {
  const h = createVillagerHarness();
  await h.seed(5000, 10000, 10, 600);
  const profile = await h.profileManager.createProfile('Villager Integrity', []);

  // 0. Recruiting before building a Cave fails with CIV_NO_VILLAGE_CAVE
  const noCaveRes = await h.handler.handleMessage({
    action: 'RECRUIT_VILLAGER',
    payload: { role: 'elder' },
  });
  assert.equal(noCaveRes.success, false);
  assert.equal(noCaveRes.errorCode, 'CIV_NO_VILLAGE_CAVE');

  // Invalid role fails with CIV_INVALID_VILLAGER_ROLE
  const badRoleRes = await h.handler.handleMessage({
    action: 'RECRUIT_VILLAGER',
    payload: { role: 'archer' },
  });
  assert.equal(badRoleRes.success, false);
  assert.equal(badRoleRes.errorCode, 'CIV_INVALID_VILLAGER_ROLE');

  // 1. Place 1st Cave (3x3 at (1,1), baseCost 25) -> coins 4975
  const placeRes = await h.handler.handleMessage({
    action: 'PLACE_BUILDING',
    payload: { buildingDefinitionId: 'stone_age_study_cave', position: { x: 1, y: 1 } },
  });
  assert.equal(placeRes.success, true);
  const cave = (placeRes.data as PlaceBuildingResponseData).building;

  // 2nd Cave must be rejected with CIV_VILLAGE_CAVE_LIMIT_REACHED
  const secondCaveRes = await h.handler.handleMessage({
    action: 'PLACE_BUILDING',
    payload: { buildingDefinitionId: 'stone_age_study_cave', position: { x: 4, y: 4 } },
  });
  assert.equal(secondCaveRes.success, false);
  assert.equal(secondCaveRes.errorCode, 'CIV_VILLAGE_CAVE_LIMIT_REACHED');

  // 2. Recruit 2 villagers at Lv.1 -> costs [40, 54] = 94 (coins 4975 - 94 = 4881)
  const r1 = await h.handler.handleMessage({ action: 'RECRUIT_VILLAGER', payload: { role: 'elder' } });
  const r2 = await h.handler.handleMessage({ action: 'RECRUIT_VILLAGER', payload: { role: 'crafter' } });
  assert.equal(r1.success, true);
  assert.equal(r2.success, true);
  assert.equal((r1.data as RecruitVillagerResponseData).cost, 40);
  assert.equal((r2.data as RecruitVillagerResponseData).cost, 54);

  // 3rd villager at Lv.1 blocked by CIV_VILLAGER_CAPACITY_REACHED
  const fullLv1Res = await h.handler.handleMessage({
    action: 'RECRUIT_VILLAGER',
    payload: { role: 'woodworker' },
  });
  assert.equal(fullLv1Res.success, false);
  assert.equal(fullLv1Res.errorCode, 'CIV_VILLAGER_CAPACITY_REACHED');
  assert.equal(fullLv1Res.errorParams?.capacity, 2);

  // 3. Attempting to demolish non-empty Cave fails with CIV_CAVE_HAS_VILLAGERS
  const blockedDemolishRes = await h.handler.handleMessage({
    action: 'REMOVE_BUILDING',
    payload: { buildingInstanceId: cave.id },
  });
  assert.equal(blockedDemolishRes.success, false);
  assert.equal(blockedDemolishRes.errorCode, 'CIV_CAVE_HAS_VILLAGERS');
  assert.equal(blockedDemolishRes.errorParams?.count, 2);

  // 4. Upgrade Cave Lv.1 -> Lv.5 (capacity 2 -> 4 -> 6 -> 8 -> 10) and recruit remaining 8 villagers
  const beforeStats = await h.storage.getDailyStats();
  const beforeQuests = await h.storage.getQuests();
  const beforeXp = (await h.storage.getEconomy()).totalXP;

  for (let lv = 1; lv < 5; lv++) {
    const upRes = await h.handler.handleMessage({
      action: 'UPGRADE_BUILDING',
      payload: { buildingId: cave.id, expectedLevel: lv },
    });
    assert.equal(upRes.success, true, `Cave upgrade L${lv}->L${lv + 1} failed: ${upRes.error}`);
    assert.equal((upRes.data as UpgradeBuildingResponseData).newLevel, lv + 1);
  }

  const remainingCosts = [73, 98, 133, 179, 242, 327, 441, 596];
  const roles = ['woodworker', 'elder', 'crafter', 'woodworker', 'elder', 'crafter', 'woodworker', 'elder'] as const;
  for (let i = 0; i < remainingCosts.length; i++) {
    const recRes = await h.handler.handleMessage({
      action: 'RECRUIT_VILLAGER',
      payload: { role: roles[i] },
    });
    assert.equal(recRes.success, true, `Recruit #${i + 3} failed: ${recRes.error}`);
    const recData = recRes.data as RecruitVillagerResponseData;
    assert.equal(recData.cost, remainingCosts[i]);
    // Villager object must never store x/y coordinates
    assert.deepEqual(Object.keys(recData.villager).sort(), ['id', 'recruitedAt', 'role']);
  }

  // 11th villager hits Lv.5 max capacity (10/10)
  const capLv5 = await h.handler.handleMessage({
    action: 'RECRUIT_VILLAGER',
    payload: { role: 'elder' },
  });
  assert.equal(capLv5.success, false);
  assert.equal(capLv5.errorCode, 'CIV_VILLAGER_CAPACITY_REACHED');
  assert.equal(capLv5.errorParams?.currentCount, 10);
  assert.equal(capLv5.errorParams?.capacity, 10);

  // Zero side effects on XP, DailyStats, or Quests; Villager CoinBonus reflects 3 Crafters (+9%) + Complete Tribe (+5%) = +14%
  assert.equal((await h.storage.getEconomy()).totalXP, beforeXp);
  assert.ok(Math.abs(aggregateCoinBonus(h.civCoordinator.getActiveCoinBonuses()) - 0.14) < 1e-9);
  assert.deepEqual(await h.storage.getDailyStats(), beforeStats);
  assert.deepEqual(await h.storage.getQuests(), beforeQuests);

  // Focus Session applies +14% CoinBonus to Coins only (10m Countdown = 15 * 1.14 = 17.1 Coins, XP unchanged at +50)
  const coinsBeforeSession = (await h.storage.getEconomy()).focusCoins;
  await h.sessionCoordinator.startSession('COUNTDOWN', 10, profile.id);
  await h.sessionCoordinator.completeCountdown();
  const afterSessionEcon = await h.storage.getEconomy();
  assert.ok(Math.abs(afterSessionEcon.focusCoins - (coinsBeforeSession + 17.1)) < 1e-9);
  assert.equal(afterSessionEcon.totalXP, beforeXp + 50);
});

test('Villager V2 Demolish Empty Cave & Concurrency Mutex + Storage Rollback', async () => {
  const h = createVillagerHarness();
  await h.seed(200, 1000, 5, 500);

  // Empty Cave can be demolished for 50% refund (25 -> 12.5 Coins)
  const cavePlace = await h.handler.handleMessage({
    action: 'PLACE_BUILDING',
    payload: { buildingDefinitionId: 'stone_age_study_cave', position: { x: 0, y: 0 } },
  });
  const caveId = (cavePlace.data as PlaceBuildingResponseData).building.id;
  // Coins now 175
  const removeEmptyRes = await h.handler.handleMessage({
    action: 'REMOVE_BUILDING',
    payload: { buildingInstanceId: caveId },
  });
  assert.equal(removeEmptyRes.success, true);
  assert.equal((removeEmptyRes.data as RemoveBuildingResponseData).refundedCoins, 12.5);
  assert.equal((await h.storage.getEconomy()).focusCoins, 187.5);

  // Re-place Cave (25 Coins -> 162.5 Coins left; capacity = 2; seed 80 Coins so ONLY 1 of 2 concurrent recruitments can succeed)
  const cave2Place = await h.handler.handleMessage({
    action: 'PLACE_BUILDING',
    payload: { buildingDefinitionId: 'stone_age_study_cave', position: { x: 0, y: 0 } },
  });
  assert.equal(cave2Place.success, true);
  await h.storage.setEconomy({ focusCoins: 80, totalXP: 1000, level: 5 });

  // Concurrent double-click recruitment under StorageMutex: 1st costs 40 (40 left), 2nd costs 54 -> fails!
  const [c1, c2] = await Promise.all([
    h.handler.handleMessage({ action: 'RECRUIT_VILLAGER', payload: { role: 'elder' } }),
    h.handler.handleMessage({ action: 'RECRUIT_VILLAGER', payload: { role: 'crafter' } }),
  ]);
  const okList = [c1, c2].filter((r) => r.success);
  const failList = [c1, c2].filter((r) => !r.success);
  assert.equal(okList.length, 1);
  assert.equal(failList.length, 1);
  assert.equal(failList[0].errorCode, 'CIV_VILLAGER_INSUFFICIENT_COINS');
  assert.equal((await h.storage.getEconomy()).focusCoins, 40);
  assert.equal((await h.storage.getCivilizationState()).villagers?.length, 1);

  // Storage failure during 2nd recruitment triggers atomic rollback of both economy and villagers
  await h.storage.setEconomy({ focusCoins: 100, totalXP: 1000, level: 5 });
  const origSetMultiple = h.adapter.setMultiple.bind(h.adapter);
  let crashOnce = true;
  h.adapter.setMultiple = async (items: Record<string, unknown>) => {
    if (crashOnce && items[STORAGE_KEYS.CIVILIZATION] && items[STORAGE_KEYS.ECONOMY]) {
      crashOnce = false;
      await h.adapter.set(STORAGE_KEYS.ECONOMY, items[STORAGE_KEYS.ECONOMY]);
      throw new Error('SIMULATED_RECRUIT_DISK_FAILURE');
    }
    return origSetMultiple(items);
  };

  const failRecruit = await h.handler.handleMessage({
    action: 'RECRUIT_VILLAGER',
    payload: { role: 'woodworker' },
  });
  assert.equal(failRecruit.success, false);
  assert.equal((await h.storage.getEconomy()).focusCoins, 100);
  assert.equal((await h.storage.getCivilizationState()).villagers?.length, 1);
});
