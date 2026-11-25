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
import { createInitialCivilizationState } from '../../src/core/civilization/civilizationState.ts';
import { GridMap } from '../../src/core/civilization/gridMap.ts';

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
    const initCiv = createInitialCivilizationState();
    const gm = GridMap.fromSnapshot(initCiv.grid);
    gm.placeBuilding('cave_seed', { x: 5, y: 5 }, { width: 3, height: 3 });
    await storage.setCivilizationState({
      ...initCiv,
      grid: gm.toSnapshot(),
      buildings: [
        {
          id: 'cave_seed',
          definitionId: 'stone_age_study_cave',
          position: { x: 5, y: 5 },
          level: 1,
          placedAt: 1,
        },
      ],
      villagers: [{ id: 'v_seed', role: 'woodworker', recruitedAt: 1 }],
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
    questCoordinator,
    sessionCoordinator,
    handler,
    seedPlayer,
    runFocusMinutes,
  };
}

test('Stage 5C-1 Handler & Coordinator: UPGRADE_BUILDING validates payload strictly and enforces gates', async () => {
  const h = createStage5C1Harness();
  await h.seedPlayer(2000, 100, 2, 300); // Level 2 (100 XP)
  const profile = await h.profileManager.createProfile('Upgrade Gate Profile', []);

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

  // Place Decorative + Fixed Focus Support + Economy buildings
  const campRes = await h.handler.handleMessage({
    action: 'PLACE_BUILDING',
    payload: { buildingDefinitionId: 'stone_age_campfire', position: { x: 0, y: 0 } },
  });
  const elderHutRes = await h.handler.handleMessage({
    action: 'PLACE_BUILDING',
    payload: { buildingDefinitionId: 'stone_age_elder_hut', position: { x: 5, y: 0 } },
  });
  const granaryRes = await h.handler.handleMessage({
    action: 'PLACE_BUILDING',
    payload: { buildingDefinitionId: 'stone_age_food_cache', position: { x: 0, y: 4 } },
  });
  assert.equal(campRes.success, true);
  assert.equal(elderHutRes.success, true);
  assert.equal(granaryRes.success, true);

  const campData = campRes.data as PlaceBuildingResponseData;
  const elderHutData = elderHutRes.data as PlaceBuildingResponseData;
  const granaryData = granaryRes.data as PlaceBuildingResponseData;

  // Granary is UNDER_CONSTRUCTION until its 120m build job finishes
  const underConsRes = await h.handler.handleMessage({
    action: 'UPGRADE_BUILDING',
    payload: { buildingId: granaryData.building.id, expectedLevel: 1 },
  });
  assert.equal(underConsRes.success, false);
  assert.equal(underConsRes.errorCode, 'CIV_BUILDING_UNDER_CONSTRUCTION');

  // Finish both 120m build jobs (240m sequential Focus with 2 crew)
  await h.runFocusMinutes(profile.id, 240);
  // Restore Level 2 for level-gate assertion
  await h.storage.setEconomy({ focusCoins: 1900, totalXP: 100, level: 2 });

  // Decorative & fixed-effect Focus Support reject upgrade with CIV_UPGRADE_NOT_SUPPORTED
  for (const bldId of [campData.building.id, elderHutData.building.id]) {
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

test('Stage 5C-1 Reward Integration: upgrading L1->L5 deducts exact Coins, updates CoinBonus after completion without touching dailyStats/quests, XP unchanged', async () => {
  const h = createStage5C1Harness();
  await h.seedPlayer(2000, 1500, 6, 500);
  const profile = await h.profileManager.createProfile('Upgrade Integration', []);

  // Place Foraging Post (cost 15 -> 1985 Coins left, 60m build -> 0% bonus while under construction)
  const placeRes = await h.handler.handleMessage({
    action: 'PLACE_BUILDING',
    payload: { buildingDefinitionId: 'stone_age_foraging_post', position: { x: 0, y: 0 } },
  });
  assert.equal(placeRes.success, true);
  const bldId = (placeRes.data as PlaceBuildingResponseData).building.id;
  assert.ok(Math.abs(aggregateCoinBonus(h.civCoordinator.getActiveCoinBonuses())) < EPSILON);

  // Complete 60m Focus to finish Foraging Post (+2% bonus unlocked)
  await h.runFocusMinutes(profile.id, 60);
  assert.ok(Math.abs(aggregateCoinBonus(h.civCoordinator.getActiveCoinBonuses()) - 0.02) < EPSILON);

  const beforeStats = await h.storage.getDailyStats();
  const beforeQuests = await h.storage.getQuests();
  const econBeforeUpgrades = await h.storage.getEconomy();

  // Queue sequential upgrades L1 -> L5: costs [24, 38, 61, 98] (total = 221)
  const expectedCosts = [24, 38, 61, 98];
  let expectedCoins = econBeforeUpgrades.focusCoins;
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
    assert.equal(upData.economy.totalXP, econBeforeUpgrades.totalXP, 'Upgrading must never alter totalXP');
  }

  // Attempting L5 -> L6 while Lv.5 is already queued fails with BUILDING_MAX_LEVEL
  const overMaxRes = await h.handler.handleMessage({
    action: 'UPGRADE_BUILDING',
    payload: { buildingId: bldId, expectedLevel: 5 },
  });
  assert.equal(overMaxRes.success, false);
  assert.equal(overMaxRes.errorCode, 'BUILDING_MAX_LEVEL');

  // UPGRADE_BUILDING MUST NOT write to fq_daily_stats or fq_quests
  assert.deepEqual(await h.storage.getDailyStats(), beforeStats);
  assert.deepEqual(await h.storage.getQuests(), beforeQuests);

  // Complete 5+10+15+20 = 50m Focus -> Foraging Post reaches Lv.5 (+10% CoinBonus)
  await h.runFocusMinutes(profile.id, 50);
  assert.ok(Math.abs(aggregateCoinBonus(h.civCoordinator.getActiveCoinBonuses()) - 0.1) < EPSILON);

  // Subsequent Focus session uses +10% CoinBonus (10m Countdown = 10 * 1.5 * 1.0 * 1.10 = 16.5 Coins, XP = 50)
  const econBeforeSession = await h.storage.getEconomy();
  await h.sessionCoordinator.startSession('COUNTDOWN', 10, profile.id);
  await h.sessionCoordinator.completeCountdown();

  const afterEcon = await h.storage.getEconomy();
  assert.ok(Math.abs(afterEcon.focusCoins - (econBeforeSession.focusCoins + 16.5)) < EPSILON);
  assert.equal(afterEcon.totalXP, econBeforeSession.totalXP + 50);
});

test('Stage 5C-1 Concurrency & Rollback: concurrent upgrades enforce expectedLevel and storage failure rolls back without cache poison', async () => {
  const h = createStage5C1Harness();
  await h.seedPlayer(1000, 1500, 6, 500);
  const profile = await h.profileManager.createProfile('Upgrade Concurrency Profile', []);

  const placeRes = await h.handler.handleMessage({
    action: 'PLACE_BUILDING',
    payload: { buildingDefinitionId: 'stone_age_foraging_post', position: { x: 0, y: 0 } },
  });
  assert.equal(placeRes.success, true);
  const bldId = (placeRes.data as PlaceBuildingResponseData).building.id;
  await h.runFocusMinutes(profile.id, 60);
  const coinsAfterBuild = (await h.storage.getEconomy()).focusCoins;

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
  assert.equal(econAfterRace.focusCoins, coinsAfterBuild - 24, 'Coins must only be deducted once');

  // Complete 5m Focus to finish L1->L2 upgrade (+4% bonus)
  await h.runFocusMinutes(profile.id, 5);
  const coinsAtLv2 = (await h.storage.getEconomy()).focusCoins;
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
  assert.equal(rolledEcon.focusCoins, coinsAtLv2);
  const rolledForage = rolledCiv.buildings.find((b) => b.id === bldId);
  assert.equal(rolledForage?.level, 2);
  assert.ok(Math.abs(aggregateCoinBonus(h.civCoordinator.getActiveCoinBonuses()) - 0.04) < EPSILON);
});

test('Stage 5C-1 Placement Cap & 50% Demolish Refund: enforces 4 Economy max, refunds 50% of base + upgrades, and handles rollback', async () => {
  const h = createStage5C1Harness();
  await h.seedPlayer(2000, 1500, 6, 500);
  const profile = await h.profileManager.createProfile('Placement Cap Profile', []);

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

  // Primitive Granary has its own independent 0/4 Build Limit and can still be placed 4 times (2x3 footprint)
  for (const pos of [
    { x: 0, y: 2 },
    { x: 2, y: 2 },
    { x: 4, y: 2 },
    { x: 6, y: 2 },
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
    payload: { buildingDefinitionId: 'stone_age_food_cache', position: { x: 0, y: 5 } },
  });
  assert.equal(fifthGranaryRes.success, false);
  assert.equal(fifthGranaryRes.errorCode, 'CIV_ECONOMY_BUILDING_LIMIT_REACHED');
  assert.equal(fifthGranaryRes.errorParams?.buildingName, 'Primitive Granary');

  // Decorative & Focus Support buildings are still allowed when Economy caps are full
  const decorRes = await h.handler.handleMessage({
    action: 'PLACE_BUILDING',
    payload: { buildingDefinitionId: 'stone_age_campfire', position: { x: 0, y: 5 } },
  });
  assert.equal(decorRes.success, true);
  const decorData = decorRes.data as PlaceBuildingResponseData;

  // Finish first Foraging Post (60m Focus via FIFO), then queue+finish upgrades L1->L3 (5+10=15m Focus)
  await h.runFocusMinutes(profile.id, 60);
  const firstId = placedIds[0];
  await h.handler.handleMessage({
    action: 'UPGRADE_BUILDING',
    payload: { buildingId: firstId, expectedLevel: 1 },
  });
  await h.handler.handleMessage({
    action: 'UPGRADE_BUILDING',
    payload: { buildingId: firstId, expectedLevel: 2 },
  });
  // First 3 Foraging Posts + 4 Granaries occupy remaining queue behind Foraging Post #1?
  // Wait: Foraging Post #2, #3, #4 and 4 Granaries were queued BEFORE upgrades!
  // Let's check: even if upgrades are queued at the tail, REMOVE_BUILDING refunds 50% of base + paid upgrades!
  const econBeforeDemolish = await h.storage.getEconomy();
  const removeRes = await h.handler.handleMessage({
    action: 'REMOVE_BUILDING',
    payload: { buildingInstanceId: firstId },
  });
  assert.equal(removeRes.success, true);
  const removeData = removeRes.data as RemoveBuildingResponseData;
  assert.equal(removeData.refundedCoins, 38.5);
  assert.equal(removeData.economy!.focusCoins, econBeforeDemolish.focusCoins + 38.5);

  // Removing 1 Foraging Post frees a Foraging Post slot while Granary remains capped
  const replacementRes = await h.handler.handleMessage({
    action: 'PLACE_BUILDING',
    payload: { buildingDefinitionId: 'stone_age_foraging_post', position: { x: 0, y: 0 } },
  });
  assert.equal(replacementRes.success, true);

  // Rollback check on REMOVE_BUILDING partial storage failure (e.g. Campfire 2 refund)
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
