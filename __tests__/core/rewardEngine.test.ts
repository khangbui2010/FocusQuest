import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RewardEngine, DEFAULT_REWARD_CONFIG } from '../../src/core/reward/rewardEngine.ts';
import { SessionSnapshot } from '../../src/types/session.ts';

test('RewardEngine: Stopwatch below 5 minutes earns 0 Coins and 0 XP but retains actual minutes', () => {
  const engine = new RewardEngine();

  const r1 = engine.calculateReward({
    mode: 'STOPWATCH',
    status: 'COMPLETED',
    targetMinutes: 0,
    actualFocusMinutes: 4,
  });

  assert.strictEqual(r1.eligibleMinutes, 0);
  assert.strictEqual(r1.actualFocusMinutes, 4, 'Must retain actual focus minutes for daily stats');
  assert.strictEqual(r1.coinsEarned, 0);
  assert.strictEqual(r1.xpEarned, 0);
  assert.strictEqual(r1.isThresholdMet, false);
});

test('RewardEngine: Stopwatch at exactly 5 minutes earns rewards for all 5 minutes at 1.0x', () => {
  const engine = new RewardEngine();

  const r = engine.calculateReward({
    mode: 'STOPWATCH',
    status: 'COMPLETED',
    targetMinutes: 0,
    actualFocusMinutes: 5,
  });

  // Base: 1 coin/min, 3 xp/min. Multiplier for 5m is 1.0x
  // 5 * 1.0 * 1 = 5 coins; 5 * 3.0 * 1 = 15 XP
  assert.strictEqual(r.isThresholdMet, true);
  assert.strictEqual(r.eligibleMinutes, 5);
  assert.strictEqual(r.actualFocusMinutes, 5);
  assert.strictEqual(r.multiplier, 1.0);
  assert.strictEqual(r.coinsEarned, 5);
  assert.strictEqual(r.xpEarned, 15);
});

test('RewardEngine: Stopwatch respects unified multiplier schedule (5-29m: 1.0x, 30-59m: 1.2x, 60-89m: 1.4x, 180+m: 2.5x)', () => {
  const engine = new RewardEngine();

  // 9 mins: tier 5-29m -> 1.0x -> 9 * 1 * 1.0 = 9 coins, 27 XP
  const r9 = engine.calculateReward({
    mode: 'STOPWATCH',
    status: 'COMPLETED',
    targetMinutes: 0,
    actualFocusMinutes: 9,
  });
  assert.strictEqual(r9.multiplier, 1.0);
  assert.strictEqual(r9.coinsEarned, 9);
  assert.strictEqual(r9.xpEarned, 27);

  // 26 mins: tier 5-29m -> 1.0x -> 26 * 1 * 1.0 = 26 coins, 78 XP
  const r26 = engine.calculateReward({
    mode: 'STOPWATCH',
    status: 'COMPLETED',
    targetMinutes: 0,
    actualFocusMinutes: 26,
  });
  assert.strictEqual(r26.multiplier, 1.0);
  assert.strictEqual(r26.coinsEarned, 26);
  assert.strictEqual(r26.xpEarned, 78);

  // 30 mins: tier 30-59m -> 1.2x -> 30 * 1 * 1.2 = 36 coins, 108 XP
  const r30 = engine.calculateReward({
    mode: 'STOPWATCH',
    status: 'COMPLETED',
    targetMinutes: 0,
    actualFocusMinutes: 30,
  });
  assert.strictEqual(r30.multiplier, 1.2);
  assert.strictEqual(r30.coinsEarned, 36);
  assert.strictEqual(r30.xpEarned, 108);

  // 60 mins: tier 60-89m -> 1.4x -> 60 * 1 * 1.4 = 84 coins, 252 XP
  const r60 = engine.calculateReward({
    mode: 'STOPWATCH',
    status: 'COMPLETED',
    targetMinutes: 0,
    actualFocusMinutes: 60,
  });
  assert.strictEqual(r60.multiplier, 1.4);
  assert.strictEqual(r60.coinsEarned, 84);
  assert.ok(Math.abs(r60.xpEarned - 252) < 1e-9);
});

test('RewardEngine: Mandatory test - Stopwatch 240 minutes receives full 240 minutes at 2.5x without capping (600 Coins / 1800 XP)', () => {
  const engine = new RewardEngine();

  const r240 = engine.calculateReward({
    mode: 'STOPWATCH',
    status: 'COMPLETED',
    targetMinutes: 0,
    actualFocusMinutes: 240,
  });

  // Base: 1.0 coin/min, 3.0 xp/min
  // Multiplier for 240 mins is 2.5x (180+ tier)
  // Coins: 240 * 1.0 * 2.5 = 600
  // XP: 240 * 3.0 * 2.5 = 1800
  assert.strictEqual(r240.eligibleMinutes, 240);
  assert.strictEqual(r240.multiplier, 2.5);
  assert.strictEqual(r240.coinsEarned, 600, 'Stopwatch 240m must earn 600 Coins (240 * 1 * 2.5)');
  assert.strictEqual(r240.xpEarned, 1800, 'Stopwatch 240m must earn 1800 XP (240 * 3 * 2.5)');
});

test('RewardEngine: Mandatory test - Countdown preserves BaseRate (1.5 Coins, 5.0 XP) and full floating-point precision', () => {
  const engine = new RewardEngine();

  // 25 mins Countdown at 1.1x locked multiplier
  // Coins: 25 * 1.5 * 1.1 = 41.25 (NOT floored to 41)
  // XP: 25 * 5.0 * 1.1 = 137.5 (NOT floored to 137)
  const r = engine.calculateReward({
    mode: 'COUNTDOWN',
    status: 'COMPLETED',
    targetMinutes: 25,
    actualFocusMinutes: 25,
    lockedMultiplier: 1.1,
  });

  assert.strictEqual(r.isCompleted, true);
  assert.strictEqual(r.eligibleMinutes, 25);
  assert.strictEqual(r.coinsEarned, 41.25, 'Backend must retain full double precision number (41.25)');
  assert.strictEqual(r.xpEarned, 137.5, 'Backend must retain full double precision number (137.5)');
});

test('RewardEngine: Mandatory test - Stopwatch Extension Disable yields strictly 0 Coins and 0 XP', () => {
  const engine = new RewardEngine();

  // Extension disabled while Stopwatch was active at 20 valid minutes
  const interruptedReward = engine.calculateInterruptedStopwatchReward(20);

  assert.strictEqual(interruptedReward.coinsEarned, 0, 'Must not award 50% penalty; must be 0 Coins');
  assert.strictEqual(interruptedReward.xpEarned, 0, 'Must not award 50% penalty; must be 0 XP');
  assert.strictEqual(interruptedReward.isThresholdMet, false);
  assert.strictEqual(interruptedReward.isCompleted, false);
});

test('RewardEngine: Mandatory test - Pomodoro Countdown calculates reward on total completed focus minutes (4 x 25m = 100m -> x1.6 -> 240 Coins / 800 XP)', () => {
  const engine = new RewardEngine();

  // 4 completed intervals of 25 minutes = 100 Focus minutes
  // BaseRate: 1.5 Coins/min, 5.0 XP/min
  // Multiplier for 100 minutes (tier 90-119m) = 1.6x
  // Total Coins = 100 * 1.5 * 1.6 = 240 Coins
  // Total XP = 100 * 5.0 * 1.6 = 800 XP
  const result = engine.calculatePomodoroCumulativeReward({
    mode: 'POMODORO_COUNTDOWN',
    totalCompletedFocusMinutes: 100,
  });

  assert.strictEqual(result.multiplier, 1.6);
  assert.strictEqual(result.totalCoins, 240, '100m Pomodoro Countdown at 1.6x must yield 240 Coins');
  assert.strictEqual(result.totalXp, 800, '100m Pomodoro Countdown at 1.6x must yield 800 XP');
});

test('RewardEngine: Mandatory test - Pomodoro Stopwatch calculates reward on total completed focus minutes (4 x 25m = 100m -> x1.6 -> 160 Coins / 480 XP)', () => {
  const engine = new RewardEngine();

  // 4 completed intervals of 25 minutes = 100 Focus minutes
  // BaseRate: 1.0 Coin/min, 3.0 XP/min
  // Multiplier for 100 minutes = 1.6x
  // Total Coins = 100 * 1.0 * 1.6 = 160 Coins
  // Total XP = 100 * 3.0 * 1.6 = 480 XP
  const result = engine.calculatePomodoroCumulativeReward({
    mode: 'POMODORO_STOPWATCH',
    totalCompletedFocusMinutes: 100,
  });

  assert.strictEqual(result.multiplier, 1.6);
  assert.strictEqual(result.totalCoins, 160, '100m Pomodoro Stopwatch at 1.6x must yield 160 Coins');
  assert.strictEqual(result.totalXp, 480, '100m Pomodoro Stopwatch at 1.6x must yield 480 XP');
});

test('RewardEngine: Pomodoro at 240 Focus minutes receives 2.5x multiplier on all 240 minutes without auto-abort', () => {
  const engine = new RewardEngine();

  // Pomodoro Countdown: 240 minutes = 240 * 1.5 * 2.5 = 900 Coins, 3000 XP
  const pomoCd = engine.calculatePomodoroCumulativeReward({
    mode: 'POMODORO_COUNTDOWN',
    totalCompletedFocusMinutes: 240,
  });
  assert.strictEqual(pomoCd.multiplier, 2.5);
  assert.strictEqual(pomoCd.totalCoins, 900);
  assert.strictEqual(pomoCd.totalXp, 3000);

  // Pomodoro Stopwatch: 240 minutes = 240 * 1.0 * 2.5 = 600 Coins, 1800 XP
  const pomoSw = engine.calculatePomodoroCumulativeReward({
    mode: 'POMODORO_STOPWATCH',
    totalCompletedFocusMinutes: 240,
  });
  assert.strictEqual(pomoSw.multiplier, 2.5);
  assert.strictEqual(pomoSw.totalCoins, 600);
  assert.strictEqual(pomoSw.totalXp, 1800);
});

test('RewardEngine: Countdown Give Up (ABANDONED) awards 0 Coins/XP but preserves actual focus minutes', () => {
  const engine = new RewardEngine();

  const r = engine.calculateReward({
    mode: 'COUNTDOWN',
    status: 'ABANDONED',
    targetMinutes: 25,
    actualFocusMinutes: 18,
    lockedMultiplier: 1.0,
  });

  assert.strictEqual(r.isCompleted, false);
  assert.strictEqual(r.eligibleMinutes, 0);
  assert.strictEqual(r.actualFocusMinutes, 18, 'Actual focus minutes must be preserved for stats');
  assert.strictEqual(r.coinsEarned, 0);
  assert.strictEqual(r.xpEarned, 0);
});

test('RewardEngine: Interrupted session awards 0 Coins/XP for Countdown', () => {
  const engine = new RewardEngine();

  const r = engine.calculateReward({
    mode: 'COUNTDOWN',
    status: 'INTERRUPTED',
    targetMinutes: 30,
    actualFocusMinutes: 20,
    lockedMultiplier: 1.2,
  });

  assert.strictEqual(r.isCompleted, false);
  assert.strictEqual(r.eligibleMinutes, 0);
  assert.strictEqual(r.actualFocusMinutes, 20);
  assert.strictEqual(r.coinsEarned, 0);
  assert.strictEqual(r.xpEarned, 0);
});

test('RewardEngine: processRewardWithIdempotencyGuard blocks duplicate reward claims', () => {
  const engine = new RewardEngine();

  const session: SessionSnapshot = {
    id: 'test-session-1',
    mode: 'COUNTDOWN',
    profileId: 'profile-study',
    status: 'COMPLETED',
    targetMinutes: 25,
    lockedMultiplier: 1.0,
    startedAt: 1000000,
    currentPauseStartedAt: null,
    pauseCount: 0,
    totalPauseMs: 0,
    pauseHistory: [],
    lastHeartbeatAt: 1000000 + 25 * 60 * 1000,
    completedAt: 1000000 + 25 * 60 * 1000,
    rewardProcessed: false,
  };

  // First claim (25 * 1.5 * 1.0 = 37.5)
  const first = engine.processRewardWithIdempotencyGuard(session);
  assert.strictEqual(first.alreadyProcessed, false);
  assert.strictEqual(first.reward.coinsEarned, 37.5);

  // Mark session processed
  session.rewardProcessed = true;

  // Second duplicate claim attempt
  const second = engine.processRewardWithIdempotencyGuard(session);
  assert.strictEqual(second.alreadyProcessed, true);
  assert.strictEqual(second.reward.coinsEarned, 0);
  assert.strictEqual(second.reward.xpEarned, 0);
});

test('RewardEngine: Multi-session precision accumulates decimal rewards without premature truncation', () => {
  const engine = new RewardEngine();

  // Simulate 10 consecutive 5-minute countdown sessions (5 * 1.5 * 1.0 = 7.5 coins each)
  let totalCoins = 0;
  for (let i = 0; i < 10; i++) {
    const res = engine.calculateReward({
      mode: 'COUNTDOWN',
      status: 'COMPLETED',
      targetMinutes: 5,
      actualFocusMinutes: 5,
      lockedMultiplier: 1.0,
    });
    totalCoins += res.coinsEarned;
    assert.strictEqual(res.coinsEarned, 7.5);
  }

  // 10 * 7.5 = 75 exactly
  assert.strictEqual(totalCoins, 75);
});
