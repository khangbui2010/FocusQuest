import test from 'node:test';
import assert from 'node:assert';
import { getLocalDateKey } from '../../src/core/utils/dateUtils.ts';
import { calculateLifetimeFocusMinutes } from '../../src/core/stats/statsAggregator.ts';
import { DailyStatRecord } from '../../src/types/storageSchema.ts';

test('Date Consistency: getLocalDateKey formats YYYY-MM-DD using local timezone', () => {
  const d = new Date(2026, 10, 6, 3, 30, 0); // Month is 0-indexed: 10 is November
  const key = getLocalDateKey(d);
  assert.strictEqual(key, '2026-11-06');
});

test('Stats Consistency: calculateLifetimeFocusMinutes sums focus across all records accurately', () => {
  const records: Record<string, DailyStatRecord> = {
    '2026-11-01': {
      date: '2026-11-01',
      totalFocusMinutes: 60,
      completedSessions: 2,
      abandonedSessions: 0,
      coinsEarned: 100,
      xpEarned: 300,
    },
    '2026-11-02': {
      date: '2026-11-02',
      totalFocusMinutes: 45,
      completedSessions: 1,
      abandonedSessions: 1,
      coinsEarned: 50,
      xpEarned: 150,
    },
    '2026-11-03': {
      date: '2026-11-03',
      totalFocusMinutes: 90,
      completedSessions: 3,
      abandonedSessions: 0,
      coinsEarned: 160,
      xpEarned: 450,
    },
  };

  const total = calculateLifetimeFocusMinutes(records);
  assert.strictEqual(total, 195, 'Lifetime focus minutes must equal 60 + 45 + 90 = 195');
});

test('Stats Consistency: calculateLifetimeFocusMinutes handles empty or invalid daily stats gracefully', () => {
  assert.strictEqual(calculateLifetimeFocusMinutes(null), 0);
  assert.strictEqual(calculateLifetimeFocusMinutes(undefined), 0);
  assert.strictEqual(calculateLifetimeFocusMinutes({}), 0);
});
