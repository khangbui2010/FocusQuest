import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MultiplierRules } from '../../src/core/reward/multiplierRules.ts';

test('MultiplierRules: Unified multiplier schedule boundary tests (5, 29, 30, 59, 60, 89, 90, 119, 120, 149, 150, 179, 180, 200, 240, 300)', () => {
  const boundaries = [
    { mins: 5, expected: 1.0 },
    { mins: 29, expected: 1.0 },
    { mins: 30, expected: 1.2 },
    { mins: 59, expected: 1.2 },
    { mins: 60, expected: 1.4 },
    { mins: 89, expected: 1.4 },
    { mins: 90, expected: 1.6 },
    { mins: 119, expected: 1.6 },
    { mins: 120, expected: 1.8 },
    { mins: 149, expected: 1.8 },
    { mins: 150, expected: 2.0 },
    { mins: 179, expected: 2.0 },
    { mins: 180, expected: 2.5 },
    { mins: 200, expected: 2.5 },
    { mins: 240, expected: 2.5 },
    { mins: 300, expected: 2.5 },
    { mins: 500, expected: 2.5 },
  ];

  for (const { mins, expected } of boundaries) {
    assert.strictEqual(
      MultiplierRules.getSessionMultiplier(mins),
      expected,
      `getSessionMultiplier failed for ${mins} mins`
    );
    assert.strictEqual(
      MultiplierRules.getCountdownMultiplier(mins),
      expected,
      `getCountdownMultiplier failed for ${mins} mins`
    );
    assert.strictEqual(
      MultiplierRules.getStopwatchMultiplier(mins),
      expected,
      `getStopwatchMultiplier failed for ${mins} mins`
    );
  }
});

test('MultiplierRules: Stopwatch and Countdown share the exact same multiplier schedule without duration cap', () => {
  // Test Stopwatch at 240 minutes has 2.5x multiplier
  assert.strictEqual(MultiplierRules.getStopwatchMultiplier(240), 2.5);
  // Test Countdown at 200 minutes has 2.5x multiplier
  assert.strictEqual(MultiplierRules.getCountdownMultiplier(200), 2.5);
  // Test resolveMultiplier helper across modes
  assert.strictEqual(
    MultiplierRules.resolveMultiplier({ mode: 'STOPWATCH', targetMinutes: 0, actualFocusMinutes: 240 }),
    2.5
  );
  assert.strictEqual(
    MultiplierRules.resolveMultiplier({ mode: 'COUNTDOWN', targetMinutes: 90, actualFocusMinutes: 90 }),
    1.6
  );
});
