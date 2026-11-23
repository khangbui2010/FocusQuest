import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  aggregateCoinBonus,
  getCoinBonusMultiplier,
  normalizeCoinBonusRate,
} from '../../src/core/economy/coinBonus.ts';
import { RewardEngine } from '../../src/core/reward/rewardEngine.ts';
import { CoinBonus } from '../../src/types/economy.ts';

const EPSILON = 1e-9;

function assertClose(actual: number, expected: number, message?: string): void {
  assert.ok(
    Math.abs(actual - expected) < EPSILON,
    message ?? `Expected ${actual} to be within ${EPSILON} of ${expected}`
  );
}

test('CoinBonus: no bonus yields exactly 1.0 factor and zero aggregated bonus', () => {
  assert.strictEqual(aggregateCoinBonus(undefined), 0);
  assert.strictEqual(aggregateCoinBonus(null), 0);
  assert.strictEqual(aggregateCoinBonus([]), 0);
  assert.strictEqual(getCoinBonusMultiplier([]), 1);
});

test('CoinBonus: a single bonus is applied exactly once', () => {
  const bonuses: CoinBonus[] = [{ id: 'tech:currency', source: 'TECHNOLOGY', rate: 0.1 }];
  assertClose(aggregateCoinBonus(bonuses), 0.1);
  assertClose(getCoinBonusMultiplier(bonuses), 1.1);
});

test('CoinBonus: multiple bonuses are summed, never compounded', () => {
  const bonuses: CoinBonus[] = [
    { id: 'tech:currency', source: 'TECHNOLOGY', rate: 0.1 },
    { id: 'building:market', source: 'BUILDING', rate: 0.05 },
    { id: 'milestone:first-era', source: 'MILESTONE', rate: 0.15 },
  ];

  assertClose(aggregateCoinBonus(bonuses), 0.3);
  assertClose(getCoinBonusMultiplier(bonuses), 1.3);

  // Compounding would be 1.10 * 1.05 * 1.15 = 1.32825, which must NOT happen.
  const compounded = 1.1 * 1.05 * 1.15;
  assert.ok(Math.abs(getCoinBonusMultiplier(bonuses) - compounded) > 0.01);
});

test('CoinBonus: a duplicated bonus id is applied only once', () => {
  const bonuses: CoinBonus[] = [
    { id: 'tech:currency', source: 'TECHNOLOGY', rate: 0.1 },
    { id: 'tech:currency', source: 'TECHNOLOGY', rate: 0.1 },
  ];

  assertClose(aggregateCoinBonus(bonuses), 0.1);
  assertClose(getCoinBonusMultiplier(bonuses), 1.1);
});

test('CoinBonus: invalid or malformed bonuses are handled safely', () => {
  const bonuses: CoinBonus[] = [
    { id: 'invalid:nan', source: 'OTHER', rate: Number.NaN },
    { id: 'invalid:infinity', source: 'OTHER', rate: Number.POSITIVE_INFINITY },
    { id: 'invalid:negative', source: 'OTHER', rate: -0.5 },
    { id: 'invalid:zero', source: 'OTHER', rate: 0 },
    { id: '', source: 'OTHER', rate: 0.2 },
    { id: 'valid:building', source: 'BUILDING', rate: 0.25 },
  ];

  assert.strictEqual(normalizeCoinBonusRate(Number.NaN), 0);
  assert.strictEqual(normalizeCoinBonusRate(Number.POSITIVE_INFINITY), 0);
  assert.strictEqual(normalizeCoinBonusRate(-1), 0);
  assertClose(aggregateCoinBonus(bonuses), 0.25);
});

test('CoinBonus: Countdown reward is unchanged when no bonus exists', () => {
  const engine = new RewardEngine();
  const reward = engine.calculateReward({
    mode: 'COUNTDOWN',
    status: 'COMPLETED',
    targetMinutes: 25,
    actualFocusMinutes: 25,
    lockedMultiplier: 1.0,
  });

  assert.strictEqual(reward.coinsEarned, 37.5);
  assert.strictEqual(reward.xpEarned, 125);
  assert.strictEqual(reward.coinBonusMultiplier, 1);
});

test('CoinBonus: Countdown applies aggregated bonuses once and leaves XP untouched', () => {
  const engine = new RewardEngine();
  const bonuses: CoinBonus[] = [
    { id: 'tech:currency', source: 'TECHNOLOGY', rate: 0.1 },
    { id: 'building:market', source: 'BUILDING', rate: 0.05 },
  ];

  const reward = engine.calculateReward({
    mode: 'COUNTDOWN',
    status: 'COMPLETED',
    targetMinutes: 25,
    actualFocusMinutes: 25,
    lockedMultiplier: 1.1,
    coinBonuses: bonuses,
  });

  // 25 * 1.5 * 1.1 = 41.25 base coins; * 1.15 additive bonus = 47.4375
  assertClose(reward.coinsEarned, 47.4375);
  assertClose(reward.rawCoinsEarned ?? 0, 47.4375);
  // XP is never modified by a coin bonus: 25 * 5.0 * 1.1 = 137.5
  assert.strictEqual(reward.xpEarned, 137.5);
  assertClose(reward.coinBonusMultiplier ?? 0, 1.15);
});

test('CoinBonus: Stopwatch reward stays unchanged without bonus and scales with bonus', () => {
  const engine = new RewardEngine();

  const plain = engine.calculateReward({
    mode: 'STOPWATCH',
    status: 'COMPLETED',
    targetMinutes: 0,
    actualFocusMinutes: 30,
  });
  assert.strictEqual(plain.coinsEarned, 36);
  assert.strictEqual(plain.xpEarned, 108);

  const boosted = engine.calculateReward({
    mode: 'STOPWATCH',
    status: 'COMPLETED',
    targetMinutes: 0,
    actualFocusMinutes: 30,
    coinBonuses: [{ id: 'tech:currency', source: 'TECHNOLOGY', rate: 0.15 }],
  });

  // 30 * 1.0 * 1.2 = 36 base coins; * 1.15 = 41.4
  assertClose(boosted.coinsEarned, 41.4);
  assert.strictEqual(boosted.xpEarned, 108);
});

test('CoinBonus: Pomodoro cumulative reward applies bonus to Coins only', () => {
  const engine = new RewardEngine();
  const bonuses: CoinBonus[] = [{ id: 'milestone:first-era', source: 'MILESTONE', rate: 0.15 }];

  const result = engine.calculatePomodoroCumulativeReward({
    mode: 'POMODORO_COUNTDOWN',
    totalCompletedFocusMinutes: 100,
    coinBonuses: bonuses,
  });

  // 100 * 1.5 * 1.6 = 240 base coins; * 1.15 = 276
  assertClose(result.totalCoins, 276);
  assert.strictEqual(result.totalXp, 800);
  assert.strictEqual(result.multiplier, 1.6);

  const noBonus = engine.calculatePomodoroCumulativeReward({
    mode: 'POMODORO_STOPWATCH',
    totalCompletedFocusMinutes: 100,
  });
  assert.strictEqual(noBonus.totalCoins, 160);
  assert.strictEqual(noBonus.totalXp, 480);
});

test('CoinBonus: Pomodoro interval reward applies bonus once', () => {
  const engine = new RewardEngine();

  const result = engine.calculatePomodoroIntervalReward({
    mode: 'POMODORO_COUNTDOWN',
    focusMinutes: 25,
    targetMinutes: 25,
    lockedMultiplier: 1.0,
    coinBonuses: [{ id: 'building:market', source: 'BUILDING', rate: 0.2 }],
  });

  // 25 * 1.5 * 1.0 = 37.5; * 1.2 = 45
  assertClose(result.coinsEarned, 45);
  assert.strictEqual(result.xpEarned, 125);
});

test('CoinBonus: interrupted Stopwatch still awards zero regardless of bonuses', () => {
  const engine = new RewardEngine();
  const reward = engine.calculateInterruptedStopwatchReward(20);

  assert.strictEqual(reward.coinsEarned, 0);
  assert.strictEqual(reward.xpEarned, 0);
});
