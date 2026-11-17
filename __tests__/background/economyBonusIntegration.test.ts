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
import { CoinBonus } from '../../src/types/economy.ts';

const EPSILON = 1e-9;

const FIRST_ERA_BONUSES: CoinBonus[] = [
  { id: 'tech:currency', source: 'TECHNOLOGY', rate: 0.1 },
  { id: 'building:market', source: 'BUILDING', rate: 0.05 },
];

function createHarness(coinBonuses: readonly CoinBonus[]) {
  const adapter = new MemoryStorageAdapter();
  const storage = new StorageManager(adapter);
  const profileManager = new ProfileManager(storage);
  const alarms = new MockAlarmsAdapter();
  const notifications = new MockNotificationsAdapter();
  const badge = new MockBadgeAdapter();
  const dnr = new MockDNRAdapter();
  const blockingCoordinator = new BlockingCoordinator(dnr);

  const coordinator = new SessionCoordinator(
    storage,
    profileManager,
    alarms,
    notifications,
    badge,
    blockingCoordinator,
    () => coinBonuses
  );

  return { storage, profileManager, notifications, coordinator };
}

test('Economy bonus integration: Countdown settlement applies additive bonuses exactly once', async () => {
  const h = createHarness(FIRST_ERA_BONUSES);
  const profile = await h.profileManager.createProfile('Bonus Test', []);

  await h.coordinator.startSession('COUNTDOWN', 25, profile.id);
  await h.coordinator.completeCountdown();

  // Base: 25 * 1.5 * 1.0 = 37.5 Coins; +10% +5% additive = 43.125 Coins.
  // XP is untouched: 25 * 5.0 * 1.0 = 125.
  const economy = await h.storage.getEconomy();
  assert.ok(Math.abs(economy.focusCoins - 43.125) < EPSILON, `got ${economy.focusCoins}`);
  assert.strictEqual(economy.totalXP, 125);

  const stats = await h.storage.getDailyStats();
  const today = stats[new Date().toISOString().slice(0, 10)];
  assert.ok(Math.abs(today.coinsEarned - 43.125) < EPSILON);
  assert.strictEqual(today.xpEarned, 125);
});

test('Economy bonus integration: completing the same Countdown twice never double-credits bonuses', async () => {
  const h = createHarness(FIRST_ERA_BONUSES);
  const profile = await h.profileManager.createProfile('Bonus Idempotency', []);

  await h.coordinator.startSession('COUNTDOWN', 25, profile.id);
  await h.coordinator.completeCountdown();
  const afterFirst = await h.storage.getEconomy();

  await h.coordinator.completeCountdown();
  const afterSecond = await h.storage.getEconomy();

  assert.ok(Math.abs(afterFirst.focusCoins - 43.125) < EPSILON);
  assert.deepStrictEqual(afterSecond, afterFirst);
});

test('Economy bonus integration: Stopwatch settlement applies the bonus without touching XP', async () => {
  const h = createHarness(FIRST_ERA_BONUSES);
  const profile = await h.profileManager.createProfile('Bonus Stopwatch', []);

  await h.coordinator.startSession('STOPWATCH', 0, profile.id);

  // Simulate 30 full minutes of focus (tier 30-59m => 1.2x).
  await h.storage.updateCurrentSession((current) =>
    current ? { ...current, startedAt: Date.now() - 30 * 60 * 1000 - 1000 } : current
  );

  const result = await h.coordinator.finishStopwatch();

  // Base: 30 * 1.0 * 1.2 = 36 Coins; +15% additive = 41.4 Coins. XP: 30 * 3.0 * 1.2 = 108.
  assert.ok(Math.abs(result.coinsEarned - 41.4) < EPSILON);
  assert.strictEqual(result.xpEarned, 108);

  const economy = await h.storage.getEconomy();
  assert.ok(Math.abs(economy.focusCoins - 41.4) < EPSILON);
  assert.strictEqual(economy.totalXP, 108);
});

test('Economy bonus integration: no bonus provider preserves existing reward values exactly', async () => {
  const h = createHarness([]);
  const profile = await h.profileManager.createProfile('No Bonus', []);

  await h.coordinator.startSession('COUNTDOWN', 25, profile.id);
  await h.coordinator.completeCountdown();

  const economy = await h.storage.getEconomy();
  assert.strictEqual(economy.focusCoins, 37.5);
  assert.strictEqual(economy.totalXP, 125);
});
