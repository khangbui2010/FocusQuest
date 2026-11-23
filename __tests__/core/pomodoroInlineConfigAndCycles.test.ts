import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TimeCalculator } from '../../src/core/timer/timeCalculator.ts';
import { MultiplierRules } from '../../src/core/reward/multiplierRules.ts';
import { DEFAULT_REWARD_CONFIG } from '../../src/core/reward/rewardEngine.ts';
import { PomodoroConfig, PomodoroState, SessionSnapshot } from '../../src/types/session.ts';
import { formatRewardAmount } from '../../src/ui/utils/formatters.ts';

/**
 * Pure calculation helpers mirroring the exact logic in TimerView.tsx
 */
function computeActivePomodoroDisplay(params: {
  mode: 'POMODORO_COUNTDOWN' | 'POMODORO_STOPWATCH';
  config: PomodoroConfig;
  state: PomodoroState;
}) {
  const { mode, config, state } = params;
  const intervalsPerCycle = config.focusIntervalsPerCycle ?? config.targetFocusSessions ?? 4;
  const totalCycles = config.numberOfCycles ?? 3;
  const currentIntervalNum = state.currentInterval;
  const currentCycleNum = Math.floor((currentIntervalNum - 1) / intervalsPerCycle) + 1;
  const intervalInCycle = ((currentIntervalNum - 1) % intervalsPerCycle) + 1;

  const isBreakPhase = state.currentPhase !== 'FOCUS';
  const isLongBreak = state.currentPhase === 'LONG_BREAK';
  const phaseName = isLongBreak
    ? 'LONG BREAK'
    : isBreakPhase
    ? 'SHORT BREAK'
    : 'FOCUS';

  const intervalBadge = `${phaseName} ${intervalInCycle}/${intervalsPerCycle}`;
  const cycleBadge =
    mode === 'POMODORO_COUNTDOWN'
      ? `CYCLE ${currentCycleNum}/${totalCycles}`
      : `CYCLE ${currentCycleNum}`;
  const cycleDetails =
    mode === 'POMODORO_COUNTDOWN'
      ? `${intervalsPerCycle} intervals / cycle · ${totalCycles} cycles`
      : `${intervalsPerCycle} intervals / cycle`;

  const liveRewardLabel = mode === 'POMODORO_COUNTDOWN' ? 'Total Reward:' : 'Accumulated Reward:';

  return {
    intervalBadge,
    cycleBadge,
    cycleDetails,
    liveRewardLabel,
    currentCycleNum,
    intervalInCycle,
    phaseName,
  };
}

function computeCountdownTotalReward(config: PomodoroConfig) {
  const intervalDuration =
    config.focusIntervalDurationMinutes ?? config.focusDurationMinutes ?? 25;
  const intervalsPerCycle =
    config.focusIntervalsPerCycle ?? config.targetFocusSessions ?? 4;
  const cycles = config.numberOfCycles ?? 3;

  const totalIntervals = intervalsPerCycle * cycles;
  const totalFocusMinutes = intervalDuration * totalIntervals;
  const previewMultiplier = MultiplierRules.getCountdownMultiplier(totalFocusMinutes);
  const estimatedCoins =
    DEFAULT_REWARD_CONFIG.countdownBaseCoinPerMinute * totalFocusMinutes * previewMultiplier;
  const estimatedXp =
    DEFAULT_REWARD_CONFIG.countdownBaseXpPerMinute * totalFocusMinutes * previewMultiplier;

  return {
    label: 'Total Reward',
    totalIntervals,
    totalFocusMinutes,
    previewMultiplier,
    estimatedCoins,
    estimatedXp,
  };
}

// ============================================================================
// 1. INLINE CONFIGURATION STEP & BOUNDARY TESTS
// ============================================================================

test('Config constraints: Focus Interval Duration: 5-90 min, step 5, default 25', () => {
  // Step +5
  assert.strictEqual(TimeCalculator.stepPomodoroFocus(25, 1), 30);
  assert.strictEqual(TimeCalculator.stepPomodoroFocus(85, 1), 90);
  // Upper boundary clamp
  assert.strictEqual(TimeCalculator.stepPomodoroFocus(90, 1), 90, 'Cannot exceed 90');
  // Step -5
  assert.strictEqual(TimeCalculator.stepPomodoroFocus(25, -1), 20);
  assert.strictEqual(TimeCalculator.stepPomodoroFocus(10, -1), 5);
  // Lower boundary clamp
  assert.strictEqual(TimeCalculator.stepPomodoroFocus(5, -1), 5, 'Cannot decrease below 5');
});

test('Config constraints: Short Break Duration: 1-20 min, step 1, default 5', () => {
  // Step +1
  assert.strictEqual(TimeCalculator.stepPomodoroShortBreak(5, 1), 6);
  assert.strictEqual(TimeCalculator.stepPomodoroShortBreak(19, 1), 20);
  // Upper boundary clamp
  assert.strictEqual(TimeCalculator.stepPomodoroShortBreak(20, 1), 20, 'Cannot exceed 20');
  // Step -1
  assert.strictEqual(TimeCalculator.stepPomodoroShortBreak(5, -1), 4);
  assert.strictEqual(TimeCalculator.stepPomodoroShortBreak(2, -1), 1);
  // Lower boundary clamp
  assert.strictEqual(TimeCalculator.stepPomodoroShortBreak(1, -1), 1, 'Cannot decrease below 1');
});

test('Config constraints: Long Break Duration: 5-60 min, step 5, default 15', () => {
  // Step +5
  assert.strictEqual(TimeCalculator.stepPomodoroLongBreak(15, 1), 20);
  assert.strictEqual(TimeCalculator.stepPomodoroLongBreak(55, 1), 60);
  // Upper boundary clamp
  assert.strictEqual(TimeCalculator.stepPomodoroLongBreak(60, 1), 60, 'Cannot exceed 60');
  // Step -5
  assert.strictEqual(TimeCalculator.stepPomodoroLongBreak(15, -1), 10);
  assert.strictEqual(TimeCalculator.stepPomodoroLongBreak(10, -1), 5);
  // Lower boundary clamp
  assert.strictEqual(TimeCalculator.stepPomodoroLongBreak(5, -1), 5, 'Cannot decrease below 5');
});

test('Config constraints: Focus Intervals per Cycle: 2-10, step 1, default 4', () => {
  // Step +1
  assert.strictEqual(TimeCalculator.stepPomodoroIntervalsPerCycle(4, 1), 5);
  assert.strictEqual(TimeCalculator.stepPomodoroIntervalsPerCycle(9, 1), 10);
  // Upper boundary clamp
  assert.strictEqual(TimeCalculator.stepPomodoroIntervalsPerCycle(10, 1), 10, 'Cannot exceed 10');
  // Step -1
  assert.strictEqual(TimeCalculator.stepPomodoroIntervalsPerCycle(4, -1), 3);
  assert.strictEqual(TimeCalculator.stepPomodoroIntervalsPerCycle(3, -1), 2);
  // Lower boundary clamp
  assert.strictEqual(TimeCalculator.stepPomodoroIntervalsPerCycle(2, -1), 2, 'Cannot decrease below 2');
});

test('Config constraints: Number of Cycles: 1-10, step 1, default 3 (Countdown only)', () => {
  // Step +1
  assert.strictEqual(TimeCalculator.stepPomodoroCycles(3, 1), 4);
  assert.strictEqual(TimeCalculator.stepPomodoroCycles(9, 1), 10);
  // Upper boundary clamp
  assert.strictEqual(TimeCalculator.stepPomodoroCycles(10, 1), 10, 'Cannot exceed 10');
  // Step -1
  assert.strictEqual(TimeCalculator.stepPomodoroCycles(3, -1), 2);
  assert.strictEqual(TimeCalculator.stepPomodoroCycles(2, -1), 1);
  // Lower boundary clamp
  assert.strictEqual(TimeCalculator.stepPomodoroCycles(1, -1), 1, 'Cannot decrease below 1');
});

// ============================================================================
// 2. DISPLAY CURRENT INTERVAL AND CYCLE TESTS (COUNTDOWN & STOPWATCH)
// ============================================================================

test('Active session display: Pomodoro Countdown correctly computes interval, cycle, and details across all phases', () => {
  const config: PomodoroConfig = {
    focusDurationMinutes: 25,
    focusIntervalDurationMinutes: 25,
    shortBreakDurationMinutes: 5,
    longBreakDurationMinutes: 15,
    targetFocusSessions: 4,
    focusIntervalsPerCycle: 4,
    numberOfCycles: 3,
  };

  // 1. Cycle 1, Focus 1
  const d1 = computeActivePomodoroDisplay({
    mode: 'POMODORO_COUNTDOWN',
    config,
    state: {
      currentPhase: 'FOCUS',
      currentInterval: 1,
      completedFocusCount: 0,
      phaseStartedAt: Date.now(),
      phaseTargetDurationMinutes: 25,
      phaseTotalPauseMs: 0,
      totalCompletedFocusMinutes: 0,
      accumulatedCoins: 0,
      accumulatedXp: 0,
    },
  });
  assert.strictEqual(d1.intervalBadge, 'FOCUS 1/4');
  assert.strictEqual(d1.cycleBadge, 'CYCLE 1/3');
  assert.strictEqual(d1.cycleDetails, '4 intervals / cycle · 3 cycles');
  assert.strictEqual(d1.liveRewardLabel, 'Total Reward:');

  // 2. Cycle 1, Short Break after Focus 1
  const d1Break = computeActivePomodoroDisplay({
    mode: 'POMODORO_COUNTDOWN',
    config,
    state: {
      currentPhase: 'SHORT_BREAK',
      currentInterval: 1,
      completedFocusCount: 1,
      phaseStartedAt: Date.now(),
      phaseTargetDurationMinutes: 5,
      phaseTotalPauseMs: 0,
      totalCompletedFocusMinutes: 25,
      accumulatedCoins: 37.5,
      accumulatedXp: 125,
    },
  });
  assert.strictEqual(d1Break.intervalBadge, 'SHORT BREAK 1/4');
  assert.strictEqual(d1Break.cycleBadge, 'CYCLE 1/3');
  assert.strictEqual(d1Break.cycleDetails, '4 intervals / cycle · 3 cycles');

  // 3. Cycle 1, Focus 4 (Last interval of Cycle 1)
  const d4 = computeActivePomodoroDisplay({
    mode: 'POMODORO_COUNTDOWN',
    config,
    state: {
      currentPhase: 'FOCUS',
      currentInterval: 4,
      completedFocusCount: 3,
      phaseStartedAt: Date.now(),
      phaseTargetDurationMinutes: 25,
      phaseTotalPauseMs: 0,
      totalCompletedFocusMinutes: 75,
      accumulatedCoins: 112.5,
      accumulatedXp: 375,
    },
  });
  assert.strictEqual(d4.intervalBadge, 'FOCUS 4/4');
  assert.strictEqual(d4.cycleBadge, 'CYCLE 1/3');

  // 4. Cycle 1, Long Break after Focus 4
  const d4Break = computeActivePomodoroDisplay({
    mode: 'POMODORO_COUNTDOWN',
    config,
    state: {
      currentPhase: 'LONG_BREAK',
      currentInterval: 4,
      completedFocusCount: 4,
      phaseStartedAt: Date.now(),
      phaseTargetDurationMinutes: 15,
      phaseTotalPauseMs: 0,
      totalCompletedFocusMinutes: 100,
      accumulatedCoins: 240,
      accumulatedXp: 800,
    },
  });
  assert.strictEqual(d4Break.intervalBadge, 'LONG BREAK 4/4');
  assert.strictEqual(d4Break.cycleBadge, 'CYCLE 1/3');

  // 5. Cycle 2, Focus 1 (overall interval 5)
  const d5 = computeActivePomodoroDisplay({
    mode: 'POMODORO_COUNTDOWN',
    config,
    state: {
      currentPhase: 'FOCUS',
      currentInterval: 5,
      completedFocusCount: 4,
      phaseStartedAt: Date.now(),
      phaseTargetDurationMinutes: 25,
      phaseTotalPauseMs: 0,
      totalCompletedFocusMinutes: 100,
      accumulatedCoins: 240,
      accumulatedXp: 800,
    },
  });
  assert.strictEqual(d5.intervalBadge, 'FOCUS 1/4');
  assert.strictEqual(d5.cycleBadge, 'CYCLE 2/3');
  assert.strictEqual(d5.cycleDetails, '4 intervals / cycle · 3 cycles');

  // 6. Cycle 3, Focus 4 (overall interval 12: final interval of 3 cycles)
  const d12 = computeActivePomodoroDisplay({
    mode: 'POMODORO_COUNTDOWN',
    config,
    state: {
      currentPhase: 'FOCUS',
      currentInterval: 12,
      completedFocusCount: 11,
      phaseStartedAt: Date.now(),
      phaseTargetDurationMinutes: 25,
      phaseTotalPauseMs: 0,
      totalCompletedFocusMinutes: 275,
      accumulatedCoins: 1031.25,
      accumulatedXp: 3437.5,
    },
  });
  assert.strictEqual(d12.intervalBadge, 'FOCUS 4/4');
  assert.strictEqual(d12.cycleBadge, 'CYCLE 3/3');
});

test('Active session display: Pomodoro Stopwatch shows CYCLE X (no total cycles) and increments unbounded', () => {
  const config: PomodoroConfig = {
    focusDurationMinutes: 25,
    focusIntervalDurationMinutes: 25,
    shortBreakDurationMinutes: 5,
    longBreakDurationMinutes: 15,
    targetFocusSessions: 4,
    focusIntervalsPerCycle: 4,
  };

  // 1. Cycle 1, Focus 1
  const sw1 = computeActivePomodoroDisplay({
    mode: 'POMODORO_STOPWATCH',
    config,
    state: {
      currentPhase: 'FOCUS',
      currentInterval: 1,
      completedFocusCount: 0,
      phaseStartedAt: Date.now(),
      phaseTargetDurationMinutes: 0,
      phaseTotalPauseMs: 0,
      totalCompletedFocusMinutes: 0,
      accumulatedCoins: 0,
      accumulatedXp: 0,
    },
  });
  assert.strictEqual(sw1.intervalBadge, 'FOCUS 1/4');
  assert.strictEqual(sw1.cycleBadge, 'CYCLE 1');
  assert.strictEqual(sw1.cycleDetails, '4 intervals / cycle');
  assert.strictEqual(sw1.liveRewardLabel, 'Accumulated Reward:');

  // 2. Cycle 2, Focus 1 (Interval 5)
  const sw5 = computeActivePomodoroDisplay({
    mode: 'POMODORO_STOPWATCH',
    config,
    state: {
      currentPhase: 'FOCUS',
      currentInterval: 5,
      completedFocusCount: 4,
      phaseStartedAt: Date.now(),
      phaseTargetDurationMinutes: 0,
      phaseTotalPauseMs: 0,
      totalCompletedFocusMinutes: 100,
      accumulatedCoins: 160,
      accumulatedXp: 480,
    },
  });
  assert.strictEqual(sw5.intervalBadge, 'FOCUS 1/4');
  assert.strictEqual(sw5.cycleBadge, 'CYCLE 2');
  assert.strictEqual(sw5.cycleDetails, '4 intervals / cycle');

  // 3. Cycle 5, Focus 3 (Interval 19: (19 - 1) / 4 + 1 = 5, (19 - 1) % 4 + 1 = 3)
  const sw19 = computeActivePomodoroDisplay({
    mode: 'POMODORO_STOPWATCH',
    config,
    state: {
      currentPhase: 'FOCUS',
      currentInterval: 19,
      completedFocusCount: 18,
      phaseStartedAt: Date.now(),
      phaseTargetDurationMinutes: 0,
      phaseTotalPauseMs: 0,
      totalCompletedFocusMinutes: 450,
      accumulatedCoins: 1125,
      accumulatedXp: 3375,
    },
  });
  assert.strictEqual(sw19.intervalBadge, 'FOCUS 3/4');
  assert.strictEqual(sw19.cycleBadge, 'CYCLE 5');
  assert.strictEqual(sw19.cycleDetails, '4 intervals / cycle');
});

// ============================================================================
// 3. POMODORO TOTAL REWARD PREVIEW TESTS
// ============================================================================

test('Pomodoro Countdown Total Reward: calculates total focus minutes x base rates x tier multiplier', () => {
  // 25m x 4 intervals x 3 cycles = 300m -> 2.5x multiplier -> 1125 Coins, 3750 XP
  const r1 = computeCountdownTotalReward({
    focusDurationMinutes: 25,
    focusIntervalDurationMinutes: 25,
    shortBreakDurationMinutes: 5,
    longBreakDurationMinutes: 15,
    targetFocusSessions: 4,
    focusIntervalsPerCycle: 4,
    numberOfCycles: 3,
  });

  assert.strictEqual(r1.label, 'Total Reward');
  assert.strictEqual(r1.totalIntervals, 12);
  assert.strictEqual(r1.totalFocusMinutes, 300);
  assert.strictEqual(r1.previewMultiplier, 2.5);
  assert.strictEqual(r1.estimatedCoins, 1125);
  assert.strictEqual(formatRewardAmount(r1.estimatedCoins), '1125');
  assert.strictEqual(r1.estimatedXp, 3750);
  assert.strictEqual(formatRewardAmount(r1.estimatedXp), '3750');

  // 15m x 2 intervals x 2 cycles = 60m -> 1.4x multiplier -> 126 Coins, 420 XP
  const r2 = computeCountdownTotalReward({
    focusDurationMinutes: 15,
    focusIntervalDurationMinutes: 15,
    shortBreakDurationMinutes: 5,
    longBreakDurationMinutes: 15,
    targetFocusSessions: 2,
    focusIntervalsPerCycle: 2,
    numberOfCycles: 2,
  });

  assert.strictEqual(r2.totalIntervals, 4);
  assert.strictEqual(r2.totalFocusMinutes, 60);
  assert.strictEqual(r2.previewMultiplier, 1.4);
  assert.ok(Math.abs(r2.estimatedCoins - 126) < 1e-9);
  assert.strictEqual(formatRewardAmount(r2.estimatedCoins), '126');
  assert.strictEqual(r2.estimatedXp, 420);
});
