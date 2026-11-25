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

import { createInitialCivilizationState } from '../../src/core/civilization/civilizationState.ts';

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
    () => civCoordinator.getActiveCoinBonuses(),
    undefined,
    undefined,
    (civState) => {
      civCoordinator.refreshCachedBonuses(civState);
    }
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
    const initCiv = createInitialCivilizationState();
    await storage.setCivilizationState({
      ...initCiv,
      founderRole: 'woodworker',
    });
  }

  async function runFocusMinutes(profileId: string, minutes: number) {
    await sessionCoordinator.startSession('COUNTDOWN', minutes, profileId);
    await sessionCoordinator.completeCountdown();
  }

  return {
    adapter,
    storage,
    profileManager,
    civCoordinator,
    sessionCoordinator,
    handler,
    seed,
    runFocusMinutes,
  };
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

  // 1. Place 1st Cave (3x3 at (1,1), baseCost 12, 60m build) -> coins 4988
  const placeRes = await h.handler.handleMessage({
    action: 'PLACE_BUILDING',
    payload: { buildingDefinitionId: 'stone_age_study_cave', position: { x: 1, y: 1 } },
  });
  assert.equal(placeRes.success, true);
  const cave = (placeRes.data as PlaceBuildingResponseData).building;

  // Recruiting while Cave is still UNDER_CONSTRUCTION fails with CIV_NO_VILLAGE_CAVE
  const buildingCaveRes = await h.handler.handleMessage({
    action: 'RECRUIT_VILLAGER',
    payload: { role: 'elder' },
  });
  assert.equal(buildingCaveRes.success, false);
  assert.equal(buildingCaveRes.errorCode, 'CIV_NO_VILLAGE_CAVE');

  // 2nd Cave must be rejected with CIV_VILLAGE_CAVE_LIMIT_REACHED
  const secondCaveRes = await h.handler.handleMessage({
    action: 'PLACE_BUILDING',
    payload: { buildingDefinitionId: 'stone_age_study_cave', position: { x: 4, y: 4 } },
  });
  assert.equal(secondCaveRes.success, false);
  assert.equal(secondCaveRes.errorCode, 'CIV_VILLAGE_CAVE_LIMIT_REACHED');

  // Complete 60m Focus session to finish Cave construction
  await h.runFocusMinutes(profile.id, 60);

  // 2. Recruit 2 villagers at Lv.1 (founder woodworker counts in cost exponent n=1,2) -> costs [34, 46] = 80
  const r1 = await h.handler.handleMessage({ action: 'RECRUIT_VILLAGER', payload: { role: 'elder' } });
  const r2 = await h.handler.handleMessage({ action: 'RECRUIT_VILLAGER', payload: { role: 'crafter' } });
  assert.equal(r1.success, true);
  assert.equal(r2.success, true);
  assert.equal((r1.data as RecruitVillagerResponseData).cost, 34);
  assert.equal((r2.data as RecruitVillagerResponseData).cost, 46);

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

  // 4. Queue Cave upgrades Lv.1 -> Lv.5 (5+10+15+20 = 50m total Focus; 3 crew >= max 2 crew required)
  for (let lv = 1; lv < 5; lv++) {
    const upRes = await h.handler.handleMessage({
      action: 'UPGRADE_BUILDING',
      payload: { buildingId: cave.id, expectedLevel: lv },
    });
    assert.equal(upRes.success, true, `Cave upgrade L${lv}->L${lv + 1} failed: ${upRes.error}`);
    assert.equal((upRes.data as UpgradeBuildingResponseData).newLevel, lv + 1);
  }
  await h.runFocusMinutes(profile.id, 50);

  const beforeStats = await h.storage.getDailyStats();
  const beforeQuests = await h.storage.getQuests();
  const beforeXp = (await h.storage.getEconomy()).totalXP;

  const remainingCosts = [62, 83, 112, 151, 204, 276, 372, 503];
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

  // Zero side effects on XP, DailyStats, or Quests; Villager CoinBonus reflects 3 Crafters (+15%) + Complete Tribe (+10%) = +25%
  assert.equal((await h.storage.getEconomy()).totalXP, beforeXp);
  assert.ok(Math.abs(aggregateCoinBonus(h.civCoordinator.getActiveCoinBonuses()) - 0.25) < 1e-9);
  assert.deepEqual(await h.storage.getDailyStats(), beforeStats);
  assert.deepEqual(await h.storage.getQuests(), beforeQuests);

  // Focus Session applies +25% CoinBonus to Coins only (10m Countdown = 15 * 1.25 = 18.75 Coins, XP unchanged at +50)
  const coinsBeforeSession = (await h.storage.getEconomy()).focusCoins;
  await h.sessionCoordinator.startSession('COUNTDOWN', 10, profile.id);
  await h.sessionCoordinator.completeCountdown();
  const afterSessionEcon = await h.storage.getEconomy();
  assert.ok(Math.abs(afterSessionEcon.focusCoins - (coinsBeforeSession + 18.75)) < 1e-9);
  assert.equal(afterSessionEcon.totalXP, beforeXp + 50);
});

test('Villager V2 Demolish Empty Cave & Concurrency Mutex + Storage Rollback', async () => {
  const h = createVillagerHarness();
  await h.seed(200, 1000, 5, 500);
  const profile = await h.profileManager.createProfile('Cave Demolish Profile', []);

  // Empty Cave can be demolished for 50% refund (12 -> 6 Coins)
  const cavePlace = await h.handler.handleMessage({
    action: 'PLACE_BUILDING',
    payload: { buildingDefinitionId: 'stone_age_study_cave', position: { x: 0, y: 0 } },
  });
  const caveId = (cavePlace.data as PlaceBuildingResponseData).building.id;
  // Coins now 188
  const removeEmptyRes = await h.handler.handleMessage({
    action: 'REMOVE_BUILDING',
    payload: { buildingInstanceId: caveId },
  });
  assert.equal(removeEmptyRes.success, true);
  assert.equal((removeEmptyRes.data as RemoveBuildingResponseData).refundedCoins, 6);
  assert.equal((await h.storage.getEconomy()).focusCoins, 194);

  // Re-place Cave (12 Coins -> 182 Coins left; finish 60m build; seed 60 Coins so ONLY 1 of 2 concurrent recruitments [34, 46] can succeed)
  const cave2Place = await h.handler.handleMessage({
    action: 'PLACE_BUILDING',
    payload: { buildingDefinitionId: 'stone_age_study_cave', position: { x: 0, y: 0 } },
  });
  assert.equal(cave2Place.success, true);
  await h.runFocusMinutes(profile.id, 60);
  await h.storage.setEconomy({ focusCoins: 60, totalXP: 1000, level: 5 });

  // Concurrent double-click recruitment under StorageMutex: 1st costs 34 (26 left), 2nd costs 46 -> fails!
  const [c1, c2] = await Promise.all([
    h.handler.handleMessage({ action: 'RECRUIT_VILLAGER', payload: { role: 'elder' } }),
    h.handler.handleMessage({ action: 'RECRUIT_VILLAGER', payload: { role: 'crafter' } }),
  ]);
  const okList = [c1, c2].filter((r) => r.success);
  const failList = [c1, c2].filter((r) => !r.success);
  assert.equal(okList.length, 1);
  assert.equal(failList.length, 1);
  assert.equal(failList[0].errorCode, 'CIV_VILLAGER_INSUFFICIENT_COINS');
  assert.equal((await h.storage.getEconomy()).focusCoins, 26);
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
