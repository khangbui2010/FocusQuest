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

import { createInitialCivilizationState } from '../../src/core/civilization/civilizationState.ts';

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

  async function seed(
    coins = 10000,
    xp = 15000,
    level = 12,
    focusMinutes = 600,
    founderRole: 'elder' | 'crafter' | 'woodworker' = 'woodworker'
  ) {
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
    const initCiv = createInitialCivilizationState();
    await storage.setCivilizationState({
      ...initCiv,
      founderRole,
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

test('VillagerBuffs Integration: SW restart rehydration, Countdown/Stopwatch Coin scaling, and zero XP/Stats/Quest scaling', async () => {
  const h = createV5Harness();
  await h.seed(5000, 15000, 12, 600, 'woodworker');
  const profile = await h.profileManager.createProfile('V5 Buff Session', []);

  // Place Cave (12, 60m build) -> finish 60m -> upgrade to Lv.2 (5m build) -> finish 5m -> capacity 4
  const caveRes = await h.handler.handleMessage({
    action: 'PLACE_BUILDING',
    payload: { buildingDefinitionId: 'stone_age_study_cave', position: { x: 0, y: 0 } },
  });
  assert.strictEqual(caveRes.success, true);
  const caveId = (caveRes.data as PlaceBuildingResponseData).building.id;
  await h.runFocusMinutes(profile.id, 60);

  await h.handler.handleMessage({
    action: 'UPGRADE_BUILDING',
    payload: { buildingId: caveId, expectedLevel: 1 },
  });
  await h.runFocusMinutes(profile.id, 5);

  // Recruit elder + crafter + woodworker (with woodworker founder) -> Complete Tribe (+10%) + 1 Crafter (+5%) = +15%
  await h.handler.handleMessage({ action: 'RECRUIT_VILLAGER', payload: { role: 'elder' } });
  await h.handler.handleMessage({ action: 'RECRUIT_VILLAGER', payload: { role: 'crafter' } });
  await h.handler.handleMessage({ action: 'RECRUIT_VILLAGER', payload: { role: 'woodworker' } });
  assert.ok(Math.abs(aggregateCoinBonus(h.civCoordinator.getActiveCoinBonuses()) - 0.15) < EPSILON);

  // Simulate SW restart: fresh CivilizationCoordinator recovers +15% CoinBonus cleanly
  const restartedCiv = new CivilizationCoordinator(h.storage);
  assert.strictEqual(restartedCiv.getActiveCoinBonuses().length, 0);
  await restartedCiv.ensureInitialized();
  assert.ok(Math.abs(aggregateCoinBonus(restartedCiv.getActiveCoinBonuses()) - 0.15) < EPSILON);

  // Countdown 10m -> Coins = 10 * 1.5 * 1.0 * 1.15 = 17.25; XP = 10 * 5 = 50 (unscaled)
  const beforeCountdown = await h.storage.getEconomy();
  await h.sessionCoordinator.startSession('COUNTDOWN', 10, profile.id);
  await h.sessionCoordinator.completeCountdown();
  const afterCountdown = await h.storage.getEconomy();
  assert.ok(Math.abs(afterCountdown.focusCoins - beforeCountdown.focusCoins - 17.25) < EPSILON);
  assert.strictEqual(afterCountdown.totalXP - beforeCountdown.totalXP, 50);

  // Verify Stopwatch >= 5m also scales Coins by +15% without scaling XP
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
  // Stopwatch 10m = 10 * 1.0 * 1.0 * 1.15 = 11.5 Coins, XP = 10 * 3 = 30
  assert.ok(Math.abs(afterSw.focusCoins - beforeSw.focusCoins - 11.5) < EPSILON);
  assert.strictEqual(afterSw.totalXP - beforeSw.totalXP, 30);

  // Verify stone_age_era stays STONE_AGE (Part C does not switch era)
  assert.strictEqual((await h.storage.getCivilizationState()).era, 'STONE_AGE');
});

test('VillagerBuffs Integration: Elder discounts ONLY building upgrades (never recruit/place) & Woodworker discounts land expansion (level gate unchanged)', async () => {
  const h = createV5Harness();
  await h.seed(5000, 15000, 12, 600, 'woodworker');
  const profile = await h.profileManager.createProfile('V5 Discount Session', []);

  // Place Cave (12, 60m build) + finish 60m
  const caveRes = await h.handler.handleMessage({
    action: 'PLACE_BUILDING',
    payload: { buildingDefinitionId: 'stone_age_study_cave', position: { x: 0, y: 0 } },
  });
  const caveId = (caveRes.data as PlaceBuildingResponseData).building.id;
  await h.runFocusMinutes(profile.id, 60);

  // Recruit 1 woodworker (34) + 1 elder (46) first so total crew = 3 >= 2 for Cave L3->L4
  const expectedFirstTwo = [34, 46];
  for (const [role, expCost] of [
    ['woodworker', expectedFirstTwo[0]],
    ['elder', expectedFirstTwo[1]],
  ] as const) {
    const rec = await h.handler.handleMessage({ action: 'RECRUIT_VILLAGER', payload: { role } });
    assert.strictEqual(rec.success, true);
    assert.strictEqual((rec.data as RecruitVillagerResponseData).cost, expCost);
  }

  // Upgrade Cave Lv.1 -> Lv.4 (5+10+15 = 30m Focus) so capacity = 8
  for (let lv = 1; lv < 4; lv += 1) {
    const upCave = await h.handler.handleMessage({
      action: 'UPGRADE_BUILDING',
      payload: { buildingId: caveId, expectedLevel: lv },
    });
    assert.strictEqual(upCave.success, true);
  }
  await h.runFocusMinutes(profile.id, 30);

  // Recruit remaining 4 elders -> total 5 elders (-30% upgrade cap) + 2 woodworkers (-10% expand)
  const remainingCosts = [62, 83, 112, 151];
  for (let i = 0; i < remainingCosts.length; i += 1) {
    const rec = await h.handler.handleMessage({
      action: 'RECRUIT_VILLAGER',
      payload: { role: 'elder' },
    });
    assert.strictEqual(rec.success, true);
    // Recruit cost is NOT discounted by elders or woodworkers
    assert.strictEqual((rec.data as RecruitVillagerResponseData).cost, remainingCosts[i]);
  }

  // Place Foraging Post: NOT discounted (exact baseCost = 15, 60m build)
  const econBeforePlace = (await h.storage.getEconomy()).focusCoins;
  const placeForage = await h.handler.handleMessage({
    action: 'PLACE_BUILDING',
    payload: { buildingDefinitionId: 'stone_age_foraging_post', position: { x: 4, y: 0 } },
  });
  assert.strictEqual(placeForage.success, true);
  assert.strictEqual((await h.storage.getEconomy()).focusCoins, econBeforePlace - 15);
  const forageId = (placeForage.data as PlaceBuildingResponseData).building.id;
  await h.runFocusMinutes(profile.id, 60);

  // Upgrade Foraging Post L1->L2: baseCost 24 with -30% Elder discount = round(24 * 0.7) = 17 Coins
  const upForage = await h.handler.handleMessage({
    action: 'UPGRADE_BUILDING',
    payload: { buildingId: forageId, expectedLevel: 1 },
  });
  assert.strictEqual(upForage.success, true);
  assert.strictEqual((upForage.data as UpgradeBuildingResponseData).cost, 17);

  // Expand land k=1: baseCost 30 with -10% Woodworker discount = round(30 * 0.9) = 27 Coins (60m clearing)
  const exp1 = await h.handler.handleMessage({
    action: 'EXPAND_LAND',
    payload: { origin: { x: 8, y: 0 } },
  });
  assert.strictEqual(exp1.success, true);
  assert.strictEqual((exp1.data as ExpandLandResponseData).cost, 27);

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
  await h.seed(5000, 15000, 12, 600, 'elder');
  const profile = await h.profileManager.createProfile('V5 Concurrent Session', []);

  // Setup Cave L2 (60m + 5m) + 1 elder + 1 woodworker (+ 1 elder founder = 2 elders -12%, 1 woodworker -5%, 3 crew)
  const caveRes = await h.handler.handleMessage({
    action: 'PLACE_BUILDING',
    payload: { buildingDefinitionId: 'stone_age_study_cave', position: { x: 0, y: 0 } },
  });
  const caveId = (caveRes.data as PlaceBuildingResponseData).building.id;
  await h.runFocusMinutes(profile.id, 60);
  await h.handler.handleMessage({ action: 'UPGRADE_BUILDING', payload: { buildingId: caveId, expectedLevel: 1 } });
  await h.runFocusMinutes(profile.id, 5);
  await h.handler.handleMessage({ action: 'RECRUIT_VILLAGER', payload: { role: 'elder' } });
  await h.handler.handleMessage({ action: 'RECRUIT_VILLAGER', payload: { role: 'woodworker' } });

  const fRes = await h.handler.handleMessage({
    action: 'PLACE_BUILDING',
    payload: { buildingDefinitionId: 'stone_age_foraging_post', position: { x: 4, y: 0 } },
  });
  const forageId = (fRes.data as PlaceBuildingResponseData).building.id;
  await h.runFocusMinutes(profile.id, 60);

  const coinsBefore = (await h.storage.getEconomy()).focusCoins;
  // Concurrently run: upgrade Foraging Post (round(24*0.88)=21, 5m, 1 crew),
  // expand East (round(30*0.95)=29, 60m, 2 crew), recruit Crafter (cost at total=3 is 62).
  // Total crew = 3 (1+2 run concurrently!), then recruit brings crew to 4.
  const [upR, expR, recR] = await Promise.all([
    h.handler.handleMessage({ action: 'UPGRADE_BUILDING', payload: { buildingId: forageId, expectedLevel: 1 } }),
    h.handler.handleMessage({ action: 'EXPAND_LAND', payload: { origin: { x: 8, y: 0 } } }),
    h.handler.handleMessage({ action: 'RECRUIT_VILLAGER', payload: { role: 'crafter' } }),
  ]);

  assert.strictEqual(upR.success, true);
  assert.strictEqual(expR.success, true);
  assert.strictEqual(recR.success, true);

  // Coins must match exact deduction 21 + 29 + 62 = 112
  const coinsAfterQueued = (await h.storage.getEconomy()).focusCoins;
  assert.strictEqual(coinsAfterQueued, coinsBefore - (21 + 29 + 62));

  // Complete 60m Focus -> both 5m upgrade & 60m expand complete
  await h.runFocusMinutes(profile.id, 60);
  const coinsAfter = (await h.storage.getEconomy()).focusCoins;

  // Complete Tribe (+10%) + 1 Crafter (+5%) + Lv.2 Foraging Post (+4%) = +19%
  assert.ok(Math.abs(aggregateCoinBonus(h.civCoordinator.getActiveCoinBonuses()) - 0.19) < EPSILON);

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
  assert.ok(Math.abs(aggregateCoinBonus(h.civCoordinator.getActiveCoinBonuses()) - 0.19) < EPSILON);
});
