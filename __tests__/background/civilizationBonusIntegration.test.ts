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

const EPSILON = 1e-9;

function createCivilizationBonusHarness() {
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
    async setupPlayerWithCoinsAndMinutes(coins = 500, minutes = 200, level = 3, initialXP = 500) {
      await storage.setEconomy({
        focusCoins: coins,
        totalXP: initialXP,
        level,
      });
      const today = new Date().toISOString().slice(0, 10);
      await storage.setDailyStats({
        [today]: {
          date: today,
          totalFocusMinutes: minutes,
          completedSessions: 2,
          abandonedSessions: 0,
          coinsEarned: 100,
          xpEarned: 200,
        },
      });
    },
  };
}

test('Civilization Bonus Integration: Base session produces standard rewards with zero buildings', async () => {
  const h = createCivilizationBonusHarness();
  await h.setupPlayerWithCoinsAndMinutes(0, 0, 1, 0);
  const profile = await h.profileManager.createProfile('Test Profile', []);

  await h.sessionCoordinator.startSession('COUNTDOWN', 25, profile.id);
  await h.sessionCoordinator.completeCountdown();

  // 25 mins * 1.5 rate = 37.5 Coins, XP: 25 * 5 = 125
  const economy = await h.storage.getEconomy();
  assert.ok(Math.abs(economy.focusCoins - 37.5) < EPSILON, `expected 37.5, got ${economy.focusCoins}`);
  assert.strictEqual(economy.totalXP, 125);
});

test('Civilization Bonus Integration: Active economy building boosts session coin rewards additively', async () => {
  const h = createCivilizationBonusHarness();
  await h.setupPlayerWithCoinsAndMinutes(200, 200, 2);
  const profile = await h.profileManager.createProfile('Test Profile', []);

  // Construct Foraging Post (+2% additive coins per level, level 1)
  const placeResp = await h.handler.handleMessage({
    action: 'PLACE_BUILDING',
    payload: {
      buildingDefinitionId: 'stone_age_foraging_post', // costs 30
      position: { x: 2, y: 2 },
    },
  });
  assert.strictEqual(placeResp.success, true);

  // Balance before session: 200 - 30 = 170 Coins
  const economyBefore = await h.storage.getEconomy();
  assert.strictEqual(economyBefore.focusCoins, 170);
  const xpBefore = economyBefore.totalXP;

  // Run 25-minute countdown session
  await h.sessionCoordinator.startSession('COUNTDOWN', 25, profile.id);
  await h.sessionCoordinator.completeCountdown();

  // Calculation:
  // Base: 25 * 1.5 = 37.5
  // Multiplier: 1.0 + 0.02 = 1.02
  // Reward: 37.5 * 1.02 = 38.25 Coins
  // Final Coins: 170 + 38.25 = 208.25
  const economyAfter = await h.storage.getEconomy();
  assert.ok(
    Math.abs(economyAfter.focusCoins - 208.25) < EPSILON,
    `expected 208.25, got ${economyAfter.focusCoins}`
  );

  // XP is completely uninfluenced by CoinBonus
  assert.strictEqual(economyAfter.totalXP - xpBefore, 125);
});

test('Civilization Bonus Integration: Decorative and Focus Support buildings do not affect coin rewards', async () => {
  const h = createCivilizationBonusHarness();
  await h.setupPlayerWithCoinsAndMinutes(300, 200, 2);
  const profile = await h.profileManager.createProfile('Test Profile', []);

  // Place Campfire (DECORATIVE) and Meditation Cave (FOCUS_SUPPORT)
  await h.handler.handleMessage({
    action: 'PLACE_BUILDING',
    payload: {
      buildingDefinitionId: 'stone_age_campfire',
      position: { x: 0, y: 0 },
    },
  });
  await h.handler.handleMessage({
    action: 'PLACE_BUILDING',
    payload: {
      buildingDefinitionId: 'stone_age_study_cave',
      position: { x: 5, y: 5 },
    },
  });

  const econBefore = await h.storage.getEconomy();
  const coinsBefore = econBefore.focusCoins;

  // Run 20-min session: 20 * 1.5 = 30.0 Coins
  await h.sessionCoordinator.startSession('COUNTDOWN', 20, profile.id);
  await h.sessionCoordinator.completeCountdown();

  const econAfter = await h.storage.getEconomy();
  const earnedCoins = econAfter.focusCoins - coinsBefore;
  assert.ok(Math.abs(earnedCoins - 30.0) < EPSILON, `expected 30.0, got ${earnedCoins}`);
});

test('Civilization Bonus Integration: Multiple economy buildings stack additively', async () => {
  const h = createCivilizationBonusHarness();
  await h.setupPlayerWithCoinsAndMinutes(500, 300, 3);
  const profile = await h.profileManager.createProfile('Test Profile', []);

  // Place Foraging Post (+2%) and Primitive Granary (+3%) -> Total +5% additive bonus
  await h.handler.handleMessage({
    action: 'PLACE_BUILDING',
    payload: {
      buildingDefinitionId: 'stone_age_foraging_post',
      position: { x: 0, y: 0 },
    },
  });
  await h.handler.handleMessage({
    action: 'PLACE_BUILDING',
    payload: {
      buildingDefinitionId: 'stone_age_food_cache',
      position: { x: 4, y: 4 },
    },
  });

  const econBefore = await h.storage.getEconomy();
  const coinsBefore = econBefore.focusCoins;

  // Run 25-min session:
  // Base: 25 * 1.5 = 37.5
  // Multiplier: 1.0 + 0.02 + 0.03 = 1.05
  // Earned: 37.5 * 1.05 = 39.375 Coins
  await h.sessionCoordinator.startSession('COUNTDOWN', 25, profile.id);
  await h.sessionCoordinator.completeCountdown();

  const econAfter = await h.storage.getEconomy();
  const earnedCoins = econAfter.focusCoins - coinsBefore;
  assert.ok(Math.abs(earnedCoins - 39.375) < EPSILON, `expected 39.375, got ${earnedCoins}`);
});

test('Civilization Bonus Integration: Removing building immediately revokes its CoinBonus', async () => {
  const h = createCivilizationBonusHarness();
  await h.setupPlayerWithCoinsAndMinutes(200, 200, 2);
  const profile = await h.profileManager.createProfile('Test Profile', []);

  // Place Foraging Post (+2%)
  const placeResp = await h.handler.handleMessage({
    action: 'PLACE_BUILDING',
    payload: {
      buildingDefinitionId: 'stone_age_foraging_post',
      position: { x: 0, y: 0 },
    },
  });
  const buildingId = (placeResp.data as { building: { id: string } }).building.id;

  // Verify provider has bonus
  assert.strictEqual(h.civilizationCoordinator.getActiveCoinBonuses().length, 1);

  // Remove building
  await h.handler.handleMessage({
    action: 'REMOVE_BUILDING',
    payload: { buildingInstanceId: buildingId },
  });

  // Verify provider has 0 bonuses
  assert.strictEqual(h.civilizationCoordinator.getActiveCoinBonuses().length, 0);

  const econBefore = await h.storage.getEconomy();
  const coinsBefore = econBefore.focusCoins;

  // Run 25-min session -> Standard 37.5 Coins without bonus
  await h.sessionCoordinator.startSession('COUNTDOWN', 25, profile.id);
  await h.sessionCoordinator.completeCountdown();

  const econAfter = await h.storage.getEconomy();
  const earned = econAfter.focusCoins - coinsBefore;
  assert.ok(Math.abs(earned - 37.5) < EPSILON, `expected 37.5, got ${earned}`);
});
