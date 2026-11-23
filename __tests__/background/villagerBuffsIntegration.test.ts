import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MemoryStorageAdapter } from '../../src/storage/memoryStorageAdapter.ts';
import { StorageManager } from '../../src/storage/storageManager.ts';
import { ProfileManager } from '../../src/core/profiles/profileManager.ts';
import {
  MockAlarmsAdapter,
  MockBadgeAdapter,
  MockDNRAdapter,
  MockNotificationsAdapter,
} from '../mocks/chromeMock.ts';
import { BlockingCoordinator } from '../../src/background/blockingCoordinator.ts';
import { SessionCoordinator } from '../../src/background/sessionCoordinator.ts';
import { CivilizationCoordinator } from '../../src/background/civilizationCoordinator.ts';
import { QuestCoordinator } from '../../src/background/questCoordinator.ts';
import { MessageHandler } from '../../src/background/messageHandler.ts';
import { STORAGE_KEYS } from '../../src/storage/storageKeys.ts';
import { aggregateCoinBonus } from '../../src/core/economy/coinBonus.ts';
import { createInitialQuestState } from '../../src/core/quests/questEngine.ts';
import { formatLocalDateKey } from '../../src/core/quests/questDates.ts';
import {
  ExpandLandResponseData,
  PlaceBuildingResponseData,
  RecruitVillagerResponseData,
  UpgradeBuildingResponseData,
} from '../../src/types/messages.ts';

const EPSILON = 1e-9;

function createV5Harness() {
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

  async function seed(coins = 10000, xp = 15000, level = 12, focusMinutes = 600) {
    await storage.setEconomy({ focusCoins: coins, totalXP: xp, level });
    const today = formatLocalDateKey(Date.now());
    await storage.setDailyStats({
      [today]: {
        date: today,
        totalFocusMinutes: focusMinutes,
        completedSessions: 5,
        abandonedSessions: 0,
        coinsEarned: 150,
        xpEarned: 450,
      },
    });
    await storage.setQuests(createInitialQuestState(Date.now()));
  }

  return { adapter, storage, profileManager, civCoordinator, sessionCoordinator, handler, seed };
}

test('VillagerBuffs Integration: SW restart rehydration, Countdown/Stopwatch Coin scaling, and zero XP/Stats/Quest scaling', async () => {
  const h = createV5Harness();
  await h.seed(5000, 15000, 12, 600);
  const profile = await h.profileManager.createProfile('V5 Buff Session', []);

  // Place Meditation Cave (25) and upgrade to Lv.2 (44) -> capacity 4
  const caveRes = await h.handler.handleMessage({
    action: 'PLACE_BUILDING',
    payload: { buildingDefinitionId: 'stone_age_study_cave', position: { x: 0, y: 0 } },
  });
  assert.strictEqual(caveRes.success, true);
  const caveId = (caveRes.data as PlaceBuildingResponseData).building.id;
  await h.handler.handleMessage({
    action: 'UPGRADE_BUILDING',
    payload: { buildingId: caveId, expectedLevel: 1 },
  });

  // Recruit elder + crafter + woodworker -> Complete Tribe (+5%) + 1 Crafter (+3%) = +8%
  await h.handler.handleMessage({ action: 'RECRUIT_VILLAGER', payload: { role: 'elder' } });
  await h.handler.handleMessage({ action: 'RECRUIT_VILLAGER', payload: { role: 'crafter' } });
  await h.handler.handleMessage({ action: 'RECRUIT_VILLAGER', payload: { role: 'woodworker' } });
  assert.ok(Math.abs(aggregateCoinBonus(h.civCoordinator.getActiveCoinBonuses()) - 0.08) < EPSILON);

  // Simulate SW restart: fresh CivilizationCoordinator recovers +8% CoinBonus cleanly
  const restartedCiv = new CivilizationCoordinator(h.storage);
  assert.strictEqual(restartedCiv.getActiveCoinBonuses().length, 0);
  await restartedCiv.ensureInitialized();
  assert.ok(Math.abs(aggregateCoinBonus(restartedCiv.getActiveCoinBonuses()) - 0.08) < EPSILON);

  // Countdown 10m -> Coins = 10 * 1.5 * 1.0 * 1.08 = 16.2; XP = 10 * 5 = 50 (unscaled)
  const beforeCountdown = await h.storage.getEconomy();
  await h.sessionCoordinator.startSession('COUNTDOWN', 10, profile.id);
  await h.sessionCoordinator.completeCountdown();
  const afterCountdown = await h.storage.getEconomy();
  assert.ok(Math.abs(afterCountdown.focusCoins - beforeCountdown.focusCoins - 16.2) < EPSILON);
  assert.strictEqual(afterCountdown.totalXP - beforeCountdown.totalXP, 50);

  // Verify Stopwatch >= 5m also scales Coins by +8% without scaling XP
  const beforeSw = await h.storage.getEconomy();
  const realNow = Date.now;
  let mockNow = realNow();
  Date.now = () => mockNow;
  try {
    await h.sessionCoordinator.startSession('STOPWATCH', 0, profile.id);
    mockNow += 10 * 60 * 1000;
    await h.sessionCoordinator.finishStopwatch();
  } finally {
    Date.now = realNow;
  }
  const afterSw = await h.storage.getEconomy();
  // Stopwatch 10m = 10 * 1.0 * 1.0 * 1.08 = 10.8 Coins, XP = 10 * 3 = 30
  assert.ok(Math.abs(afterSw.focusCoins - beforeSw.focusCoins - 10.8) < EPSILON);
  assert.strictEqual(afterSw.totalXP - beforeSw.totalXP, 30);

  // Verify stone_age_era stays STONE_AGE (Part C does not switch era)
  assert.strictEqual((await h.storage.getCivilizationState()).era, 'STONE_AGE');
});

test('VillagerBuffs Integration: Elder discounts ONLY building upgrades (never recruit/place) & Woodworker discounts land expansion (level gate unchanged)', async () => {
  const h = createV5Harness();
  await h.seed(5000, 15000, 12, 600);

  // Place Cave (25) and upgrade Lv.1 -> Lv.4 so capacity = 8
  const caveRes = await h.handler.handleMessage({
    action: 'PLACE_BUILDING',
    payload: { buildingDefinitionId: 'stone_age_study_cave', position: { x: 0, y: 0 } },
  });
  const caveId = (caveRes.data as PlaceBuildingResponseData).building.id;
  for (let lv = 1; lv < 4; lv += 1) {
    await h.handler.handleMessage({
      action: 'UPGRADE_BUILDING',
      payload: { buildingId: caveId, expectedLevel: lv },
    });
  }

  // Recruit 5 elders (-20% upgrade discount) and 2 woodworkers (-10% expansion discount)
  const expectedRecruitCosts = [40, 54, 73, 98, 133, 179, 242];
  const roles = ['elder', 'elder', 'elder', 'elder', 'elder', 'woodworker', 'woodworker'] as const;
  for (let i = 0; i < roles.length; i += 1) {
    const rec = await h.handler.handleMessage({
      action: 'RECRUIT_VILLAGER',
      payload: { role: roles[i] },
    });
    assert.strictEqual(rec.success, true);
    // Recruit cost is NOT discounted by elders or woodworkers
    assert.strictEqual((rec.data as RecruitVillagerResponseData).cost, expectedRecruitCosts[i]);
  }

  // Place Foraging Post: NOT discounted (exact baseCost = 30)
  const econBeforePlace = (await h.storage.getEconomy()).focusCoins;
  const placeForage = await h.handler.handleMessage({
    action: 'PLACE_BUILDING',
    payload: { buildingDefinitionId: 'stone_age_foraging_post', position: { x: 4, y: 0 } },
  });
  assert.strictEqual(placeForage.success, true);
  assert.strictEqual((await h.storage.getEconomy()).focusCoins, econBeforePlace - 30);
  const forageId = (placeForage.data as PlaceBuildingResponseData).building.id;

  // Upgrade Foraging Post L1->L2: baseCost 48 with -20% Elder discount = round(48 * 0.8) = 38 Coins
  const upForage = await h.handler.handleMessage({
    action: 'UPGRADE_BUILDING',
    payload: { buildingId: forageId, expectedLevel: 1 },
  });
  assert.strictEqual(upForage.success, true);
  assert.strictEqual((upForage.data as UpgradeBuildingResponseData).cost, 38);

  // Expand land k=1: baseCost 60 with -10% Woodworker discount = round(60 * 0.9) = 54 Coins
  const exp1 = await h.handler.handleMessage({
    action: 'EXPAND_LAND',
    payload: { origin: { x: 8, y: 0 } },
  });
  assert.strictEqual(exp1.success, true);
  assert.strictEqual((exp1.data as ExpandLandResponseData).cost, 54);

  // Level gate remains k+2 even with Woodworker discount (set level to 3 for k=2 which requires Lv.4)
  const currCoins = (await h.storage.getEconomy()).focusCoins;
  await h.storage.setEconomy({ focusCoins: currCoins, totalXP: 350, level: 3 });
  const expBlocked = await h.handler.handleMessage({
    action: 'EXPAND_LAND',
    payload: { origin: { x: -4, y: 0 } },
  });
  assert.strictEqual(expBlocked.success, false);
  assert.strictEqual(expBlocked.errorCode, 'CIV_EXPAND_REQUIRES_LEVEL');
});

test('VillagerBuffs Integration: Concurrent Promise.all mutations serialize cleanly & partial failure rolls back cache and state', async () => {
  const h = createV5Harness();
  await h.seed(5000, 15000, 12, 600);

  // Setup Cave L2 + 2 elders (-8% upgrade) + 1 woodworker (-5% expand)
  const caveRes = await h.handler.handleMessage({
    action: 'PLACE_BUILDING',
    payload: { buildingDefinitionId: 'stone_age_study_cave', position: { x: 0, y: 0 } },
  });
  const caveId = (caveRes.data as PlaceBuildingResponseData).building.id;
  await h.handler.handleMessage({ action: 'UPGRADE_BUILDING', payload: { buildingId: caveId, expectedLevel: 1 } });
  await h.handler.handleMessage({ action: 'RECRUIT_VILLAGER', payload: { role: 'elder' } });
  await h.handler.handleMessage({ action: 'RECRUIT_VILLAGER', payload: { role: 'elder' } });
  await h.handler.handleMessage({ action: 'RECRUIT_VILLAGER', payload: { role: 'woodworker' } });

  const fRes = await h.handler.handleMessage({
    action: 'PLACE_BUILDING',
    payload: { buildingDefinitionId: 'stone_age_foraging_post', position: { x: 4, y: 0 } },
  });
  const forageId = (fRes.data as PlaceBuildingResponseData).building.id;

  const coinsBefore = (await h.storage.getEconomy()).focusCoins;
  // Concurrently run: upgrade Foraging Post (round(48*0.92)=44), expand East (round(60*0.95)=57), recruit Crafter (cost at count=3 is 98)
  const [upR, expR, recR] = await Promise.all([
    h.handler.handleMessage({ action: 'UPGRADE_BUILDING', payload: { buildingId: forageId, expectedLevel: 1 } }),
    h.handler.handleMessage({ action: 'EXPAND_LAND', payload: { origin: { x: 8, y: 0 } } }),
    h.handler.handleMessage({ action: 'RECRUIT_VILLAGER', payload: { role: 'crafter' } }),
  ]);

  assert.strictEqual(upR.success, true);
  assert.strictEqual(expR.success, true);
  assert.strictEqual(recR.success, true);

  // Coins must match exact deduction 44 + 57 + 98 = 199
  const coinsAfter = (await h.storage.getEconomy()).focusCoins;
  assert.strictEqual(coinsAfter, coinsBefore - (44 + 57 + 98));
  // Complete Tribe (+5%) + 1 Crafter (+3%) + Lv.2 Foraging Post (+4%) = +12%
  assert.ok(Math.abs(aggregateCoinBonus(h.civCoordinator.getActiveCoinBonuses()) - 0.12) < EPSILON);

  // Partial write failure rollback test on upgrade/recruit must preserve balance, buildings, villagers, and cache
  const origSetMultiple = h.adapter.setMultiple.bind(h.adapter);
  let failOnce = true;
  h.adapter.setMultiple = async (items: Record<string, unknown>) => {
    if (failOnce && items[STORAGE_KEYS.CIVILIZATION] && items[STORAGE_KEYS.ECONOMY]) {
      failOnce = false;
      await h.adapter.set(STORAGE_KEYS.ECONOMY, items[STORAGE_KEYS.ECONOMY]);
      throw new Error('SIMULATED_V5_PARTIAL_WRITE_ERROR');
    }
    return origSetMultiple(items);
  };

  const failedUp = await h.handler.handleMessage({
    action: 'UPGRADE_BUILDING',
    payload: { buildingId: forageId, expectedLevel: 2 },
  });
  assert.strictEqual(failedUp.success, false);
  assert.strictEqual((await h.storage.getEconomy()).focusCoins, coinsAfter);
  assert.ok(Math.abs(aggregateCoinBonus(h.civCoordinator.getActiveCoinBonuses()) - 0.12) < EPSILON);
});
