import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TimeCalculator,
  MAX_PAUSE_DURATION_MS,
} from '../../src/core/timer/timeCalculator.ts';

test('TimeCalculator calculates running focus time without pauses accurately', () => {
  const startedAt = 1000000;
  // 25 minutes later
  const currentTime = startedAt + 25 * 60 * 1000;

  const result = TimeCalculator.calculateElapsedTime({
    startedAt,
    currentTime,
    status: 'RUNNING',
    currentPauseStartedAt: null,
    totalCompletedPauseMs: 0,
  });

  assert.strictEqual(result.actualFocusMs, 25 * 60 * 1000);
  assert.strictEqual(result.actualFocusMinutes, 25);
  assert.strictEqual(result.totalPauseMs, 0);
  assert.strictEqual(result.isAutoResumeDue, false);
});

test('TimeCalculator subtracts completed pauses and active pauses correctly', () => {
  const startedAt = 1000000;
  // Total elapsed wall-clock time: 30 minutes
  const currentTime = startedAt + 30 * 60 * 1000;
  // Previous completed pause: 3 minutes
  const totalCompletedPauseMs = 3 * 60 * 1000;
  // Currently paused for 2 minutes
  const currentPauseStartedAt = currentTime - 2 * 60 * 1000;

  const result = TimeCalculator.calculateElapsedTime({
    startedAt,
    currentTime,
    status: 'PAUSED',
    currentPauseStartedAt,
    totalCompletedPauseMs,
  });

  // Total pause: 3m + 2m = 5m
  // Actual focus: 30m - 5m = 25 minutes
  assert.strictEqual(result.totalPauseMs, 5 * 60 * 1000);
  assert.strictEqual(result.actualFocusMs, 25 * 60 * 1000);
  assert.strictEqual(result.actualFocusMinutes, 25);
  assert.strictEqual(result.isAutoResumeDue, false);
});

test('TimeCalculator triggers isAutoResumeDue when pause reaches 5 minutes and caps pause time', () => {
  const startedAt = 1000000;
  const currentPauseStartedAt = startedAt + 10 * 60 * 1000; // paused at minute 10
  // Current time is 6 minutes after pause began (exceeded 5 mins)
  const currentTime = currentPauseStartedAt + 6 * 60 * 1000;

  const result = TimeCalculator.calculateElapsedTime({
    startedAt,
    currentTime,
    status: 'PAUSED',
    currentPauseStartedAt,
    totalCompletedPauseMs: 0,
  });

  // Active pause should be capped at MAX_PAUSE_DURATION_MS (5 mins)
  assert.strictEqual(result.activePauseMs, MAX_PAUSE_DURATION_MS);
  assert.strictEqual(result.isAutoResumeDue, true);
  // Focus time before pause was 10 mins; extra 1 min unresumed elapsed is considered focus or pending resume
  assert.strictEqual(result.actualFocusMs, 11 * 60 * 1000);
});

test('TimeCalculator.finalizePause caps pause duration to exactly 5 minutes', () => {
  const pauseStart = 1000;
  // Resumed 7 minutes later
  const resumeTime = pauseStart + 7 * 60 * 1000;

  const record = TimeCalculator.finalizePause(pauseStart, resumeTime);
  assert.strictEqual(record.durationMs, MAX_PAUSE_DURATION_MS);
  assert.strictEqual(record.resumedAt, pauseStart + MAX_PAUSE_DURATION_MS);
});

test('TimeCalculator computes Countdown remaining time correctly', () => {
  const targetMinutes = 25;
  const actualFocusMs = 20 * 60 * 1000;

  const r1 = TimeCalculator.calculateCountdownRemaining(targetMinutes, actualFocusMs);
  assert.strictEqual(r1.remainingMs, 5 * 60 * 1000);
  assert.strictEqual(r1.isCompleted, false);

  const r2 = TimeCalculator.calculateCountdownRemaining(targetMinutes, 25 * 60 * 1000);
  assert.strictEqual(r2.remainingMs, 0);
  assert.strictEqual(r2.isCompleted, true);

  // Over-focused
  const r3 = TimeCalculator.calculateCountdownRemaining(targetMinutes, 30 * 60 * 1000);
  assert.strictEqual(r3.remainingMs, 0);
  assert.strictEqual(r3.isCompleted, true);
});

test('TimeCalculator handles abnormal clock drift safely without negative numbers', () => {
  const startedAt = 1000000;
  // Clock moved backwards
  const currentTime = startedAt - 50000;

  const result = TimeCalculator.calculateElapsedTime({
    startedAt,
    currentTime,
    status: 'RUNNING',
    currentPauseStartedAt: null,
    totalCompletedPauseMs: 0,
  });

  assert.strictEqual(result.actualFocusMs, 0, 'Must never be negative');
  assert.strictEqual(result.actualFocusMinutes, 0);
});

test('TimeCalculator correctly accumulates multiple completed pauses', () => {
  const startedAt = 1000000;
  // Pause 1: 3 minutes
  const pause1 = TimeCalculator.finalizePause(startedAt + 5 * 60 * 1000, startedAt + 8 * 60 * 1000);
  // Pause 2: 4 minutes
  const pause2 = TimeCalculator.finalizePause(startedAt + 15 * 60 * 1000, startedAt + 19 * 60 * 1000);

  const totalCompletedPauseMs = pause1.durationMs + pause2.durationMs; // 7 minutes
  const currentTime = startedAt + 25 * 60 * 1000; // 25 minutes elapsed

  const result = TimeCalculator.calculateElapsedTime({
    startedAt,
    currentTime,
    status: 'RUNNING',
    currentPauseStartedAt: null,
    totalCompletedPauseMs,
  });

  // Focus time: 25m - 7m = 18 minutes
  assert.strictEqual(result.totalPauseMs, 7 * 60 * 1000);
  assert.strictEqual(result.actualFocusMs, 18 * 60 * 1000);
  assert.strictEqual(result.actualFocusMinutes, 18);
});
