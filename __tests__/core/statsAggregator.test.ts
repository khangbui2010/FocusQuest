import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  addDaysToDateKey,
  aggregateDayStats,
  aggregateMonthStats,
  aggregateYearStats,
  calculateFocusStreak,
  calculateLifetimeFocusMinutes,
  getDaysInMonth,
  isLeapYear,
  isValidDateKey,
  isValidMonthKey,
  isValidYearKey,
} from '../../src/core/stats/statsAggregator.ts';
import { DailyStatRecord } from '../../src/types/storageSchema.ts';

function makeRec(
  date: string,
  totalFocusMinutes: number,
  completedSessions = 1,
  abandonedSessions = 0,
  coinsEarned = totalFocusMinutes * 2,
  xpEarned = totalFocusMinutes * 5
): DailyStatRecord {
  return {
    date,
    totalFocusMinutes,
    completedSessions,
    abandonedSessions,
    coinsEarned,
    xpEarned,
  };
}

test('StatsAggregator: pure implementation uses zero Date, Date.now(), or Math.random()', () => {
  const srcPath = path.resolve(import.meta.dirname, '../../src/core/stats/statsAggregator.ts');
  const src = fs.readFileSync(srcPath, 'utf8');
  assert.equal(/Date\.now\s*\(/.test(src), false, 'statsAggregator.ts must never call Date.now()');
  assert.equal(/\bnew\s+Date\b/.test(src), false, 'statsAggregator.ts must never construct Date');
  assert.equal(/Math\.random\s*\(/.test(src), false, 'statsAggregator.ts must never call Math.random()');
});

test('StatsAggregator: calendar helpers handle leap years, month lengths, validation & boundary arithmetic', () => {
  assert.equal(isLeapYear(2024), true);
  assert.equal(isLeapYear(2000), true);
  assert.equal(isLeapYear(1900), false);
  assert.equal(isLeapYear(2025), false);

  assert.equal(getDaysInMonth(2024, 2), 29);
  assert.equal(getDaysInMonth(2025, 2), 28);
  assert.equal(getDaysInMonth(2026, 4), 30);
  assert.equal(getDaysInMonth(2026, 12), 31);
  assert.equal(getDaysInMonth(2026, 13), 0);

  assert.equal(isValidDateKey('2024-02-29'), true);
  assert.equal(isValidDateKey('2025-02-29'), false);
  assert.equal(isValidDateKey('2026-04-31'), false);
  assert.equal(isValidDateKey('2026-1-1'), false);
  assert.equal(isValidDateKey('bad'), false);
  assert.equal(isValidMonthKey('2026-11'), true);
  assert.equal(isValidMonthKey('2026-13'), false);
  assert.equal(isValidYearKey('2026'), true);
  assert.equal(isValidYearKey('26'), false);

  assert.equal(addDaysToDateKey('2024-02-28', 1), '2024-02-29');
  assert.equal(addDaysToDateKey('2024-02-29', 1), '2024-03-01');
  assert.equal(addDaysToDateKey('2025-02-28', 1), '2025-03-01');
  assert.equal(addDaysToDateKey('2025-12-31', 1), '2026-01-01');
  assert.equal(addDaysToDateKey('2026-01-01', -1), '2025-12-31');
});

test('StatsAggregator: preserves calculateLifetimeFocusMinutes exact invariant', () => {
  const stats: Record<string, DailyStatRecord> = {
    '2026-01-01': makeRec('2026-01-01', 25, 1, 0, 12.5, 37.5),
    '2026-01-02': makeRec('2026-01-02', -5, 0, 1, 0, 0),
    '2026-01-03': makeRec('2026-01-03', 40, 1, 0, 40, 100),
  };
  assert.equal(calculateLifetimeFocusMinutes(stats), 65);
  assert.equal(calculateLifetimeFocusMinutes(null), 0);
  assert.equal(calculateLifetimeFocusMinutes(undefined), 0);
});

test('StatsAggregator: aggregateDayStats returns day KPIs and exact 7-day trailing trend crossing leap/month/year', () => {
  const stats: Record<string, DailyStatRecord> = {
    '2024-02-26': makeRec('2024-02-26', 30, 1, 0),
    '2024-02-29': makeRec('2024-02-29', 60, 2, 1),
    '2024-03-01': makeRec('2024-03-01', 45, 1, 1, 55.25, 165.75),
  };

  const summary = aggregateDayStats(stats, '2024-03-01');
  assert.equal(summary.dateISO, '2024-03-01');
  assert.equal(summary.focusMinutes, 45);
  assert.equal(summary.completed, 1);
  assert.equal(summary.abandoned, 1);
  assert.equal(summary.sessions, 2);
  assert.equal(summary.coins, 55.25);
  assert.equal(summary.xp, 165.75);

  assert.equal(summary.trend7Days.length, 7);
  assert.deepEqual(
    summary.trend7Days.map((p) => p.dateISO),
    [
      '2024-02-24',
      '2024-02-25',
      '2024-02-26',
      '2024-02-27',
      '2024-02-28',
      '2024-02-29',
      '2024-03-01',
    ]
  );
  assert.equal(summary.trend7Days[0].focusMinutes, 0);
  assert.equal(summary.trend7Days[2].focusMinutes, 30);
  assert.equal(summary.trend7Days[5].focusMinutes, 60);
  assert.equal(summary.trend7Days[5].sessions, 3);
  assert.equal(summary.trend7Days[6].focusMinutes, 45);

  // Common year 2025 skips Feb 29
  const commonYear = aggregateDayStats({}, '2025-03-01');
  assert.deepEqual(
    commonYear.trend7Days.map((p) => p.dateISO),
    [
      '2025-02-23',
      '2025-02-24',
      '2025-02-25',
      '2025-02-26',
      '2025-02-27',
      '2025-02-28',
      '2025-03-01',
    ]
  );
});

test('StatsAggregator: aggregateMonthStats handles 28/29/30/31 days, dual averages, completionRate & tie-breaking peakDay', () => {
  const stats: Record<string, DailyStatRecord> = {
    '2024-02-01': makeRec('2024-02-01', 90, 3, 1),
    '2024-02-15': makeRec('2024-02-15', 0, 0, 1), // not an active day (focus === 0), still counts toward abandoned
    '2024-02-29': makeRec('2024-02-29', 90, 2, 0), // tie with Feb 01 -> earliest wins
  };

  const febLeap = aggregateMonthStats(stats, '2024-02');
  assert.equal(febLeap.daysInMonth, 29);
  assert.equal(febLeap.days.length, 29);
  assert.equal(febLeap.totalFocusMinutes, 180);
  assert.equal(febLeap.activeDays, 2);
  assert.equal(febLeap.completed, 5);
  assert.equal(febLeap.abandoned, 2);
  assert.ok(Math.abs(febLeap.averageFocusPerCalendarDay - 180 / 29) < 1e-12);
  assert.equal(febLeap.averageFocusPerActiveDay, 90);
  assert.ok(Math.abs((febLeap.completionRate ?? 0) - 5 / 7) < 1e-12);
  assert.deepEqual(febLeap.peakDay, {
    dateISO: '2024-02-01',
    dayNumber: 1,
    focusMinutes: 90,
    sessions: 4,
  });

  // 28, 30, 31 days & empty month (denominator 0 -> avg 0, completionRate null, peakDay null)
  const febCommon = aggregateMonthStats({}, '2025-02');
  assert.equal(febCommon.daysInMonth, 28);
  assert.equal(febCommon.days.length, 28);
  assert.equal(febCommon.averageFocusPerCalendarDay, 0);
  assert.equal(febCommon.averageFocusPerActiveDay, 0);
  assert.equal(febCommon.completionRate, null);
  assert.equal(febCommon.peakDay, null);

  assert.equal(aggregateMonthStats({}, '2026-04').daysInMonth, 30);
  assert.equal(aggregateMonthStats({}, '2026-07').daysInMonth, 31);
});

test('StatsAggregator: aggregateYearStats returns 12 chronological months, bestMonth earliest tie-break & empty null', () => {
  const stats: Record<string, DailyStatRecord> = {
    '2025-12-31': makeRec('2025-12-31', 999, 5, 0), // prior year must be excluded
    '2026-02-10': makeRec('2026-02-10', 120, 2, 0),
    '2026-02-11': makeRec('2026-02-11', 60, 1, 1),
    '2026-09-05': makeRec('2026-09-05', 180, 3, 0), // tie 180 mins -> Feb wins
  };

  const y2026 = aggregateYearStats(stats, '2026');
  assert.equal(y2026.months.length, 12);
  assert.equal(y2026.months[0].monthKey, '2026-01');
  assert.equal(y2026.months[11].monthKey, '2026-12');
  assert.equal(y2026.totalFocusMinutes, 360);
  assert.equal(y2026.activeDays, 3);
  assert.equal(y2026.completed, 6);
  assert.equal(y2026.abandoned, 1);
  assert.ok(Math.abs((y2026.completionRate ?? 0) - 6 / 7) < 1e-12);
  assert.deepEqual(y2026.bestMonth, {
    monthKey: '2026-02',
    monthNumber: 2,
    focusMinutes: 180,
    sessions: 4,
    activeDays: 2,
  });

  const emptyYear = aggregateYearStats(stats, '2027');
  assert.equal(emptyYear.months.length, 12);
  assert.equal(emptyYear.totalFocusMinutes, 0);
  assert.equal(emptyYear.completionRate, null);
  assert.equal(emptyYear.bestMonth, null);
});

test('StatsAggregator: calculateFocusStreak handles today/yesterday anchor, future dates, month/year/leap boundaries', () => {
  // 1. Streak active today (3 days) vs historical 4-day streak across leap Feb 29
  const stats: Record<string, DailyStatRecord> = {
    '2024-02-28': makeRec('2024-02-28', 25),
    '2024-02-29': makeRec('2024-02-29', 30),
    '2024-03-01': makeRec('2024-03-01', 45),
    '2024-03-02': makeRec('2024-03-02', 20),
    // Year boundary active run
    '2025-12-30': makeRec('2025-12-30', 30),
    '2025-12-31': makeRec('2025-12-31', 35),
    '2026-01-01': makeRec('2026-01-01', 40),
    // Abandoned day with 0 focus minutes breaks streak even if completedSessions=0
    '2026-01-02': makeRec('2026-01-02', 0, 1, 0),
    // Future date relative to 2026-01-01 must NOT inflate current streak
    '2026-01-05': makeRec('2026-01-05', 50),
  };

  assert.deepEqual(calculateFocusStreak(stats, '2026-01-01'), {
    current: 3,
    longest: 4,
  });

  // 2. If todayISO ('2026-01-02') has 0 focus minutes, yesterday ('2026-01-01') streak stays alive
  assert.deepEqual(calculateFocusStreak(stats, '2026-01-02'), {
    current: 3,
    longest: 4,
  });

  // 3. Two days without focus resets current to 0, keeps longest = 4
  assert.deepEqual(calculateFocusStreak(stats, '2026-01-03'), {
    current: 0,
    longest: 4,
  });

  // 4. Current streak > historical automatically updates longest so current <= longest
  const ongoing: Record<string, DailyStatRecord> = {
    '2026-05-01': makeRec('2026-05-01', 15),
    '2026-05-02': makeRec('2026-05-02', 20),
    '2026-05-03': makeRec('2026-05-03', 25),
    '2026-05-04': makeRec('2026-05-04', 30),
    '2026-05-05': makeRec('2026-05-05', 35),
  };
  const streak = calculateFocusStreak(ongoing, '2026-05-05');
  assert.deepEqual(streak, { current: 5, longest: 5 });
  assert.ok(streak.current <= streak.longest);
});

test('StatsAggregator: rejects dirty keys & clamps negative/NaN/Infinity safely without crashing', () => {
  const dirty = {
    'not-a-date': makeRec('not-a-date', 100),
    '2025-02-29': makeRec('2025-02-29', 80), // non-leap invalid day
    '2026-06-15': {
      date: '2026-06-15',
      totalFocusMinutes: -40,
      completedSessions: Number.NaN,
      abandonedSessions: Number.POSITIVE_INFINITY,
      coinsEarned: -12.5,
      xpEarned: Number.NEGATIVE_INFINITY,
    },
    '2026-06-16': null as unknown as DailyStatRecord,
    '2026-06-17': makeRec('2026-06-17', 30, 1, 0, 18.75, 45.25),
  } as Record<string, DailyStatRecord>;

  const day = aggregateDayStats(dirty, '2026-06-15');
  assert.equal(day.focusMinutes, 0);
  assert.equal(day.completed, 0);
  assert.equal(day.abandoned, 0);
  assert.equal(day.coins, 0);
  assert.equal(day.xp, 0);

  const month = aggregateMonthStats(dirty, '2026-06');
  assert.equal(month.totalFocusMinutes, 30);
  assert.equal(month.activeDays, 1);
  assert.equal(month.coins, 18.75);
  assert.equal(month.xp, 45.25);

  const year = aggregateYearStats(dirty, '2026');
  assert.equal(year.totalFocusMinutes, 30);
  assert.equal(year.activeDays, 1);

  assert.deepEqual(calculateFocusStreak(dirty, '2026-06-17'), { current: 1, longest: 1 });
  assert.equal(aggregateDayStats(dirty, '2025-02-29').trend7Days.length, 0);
  assert.equal(aggregateMonthStats(dirty, '2026-13').days.length, 0);
  assert.equal(aggregateYearStats(dirty, 'abcd').months.length, 0);
});

test('StatsAggregator: completely immune to machine timezone / DST shifts', () => {
  const prevTz = process.env.TZ;
  const dataset: Record<string, DailyStatRecord> = {
    '2026-03-07': makeRec('2026-03-07', 40, 1, 0),
    '2026-03-08': makeRec('2026-03-08', 50, 2, 0), // US DST spring-forward day
    '2026-03-09': makeRec('2026-03-09', 60, 2, 1),
  };

  try {
    process.env.TZ = 'America/Los_Angeles';
    const laDay = aggregateDayStats(dataset, '2026-03-09');
    const laMonth = aggregateMonthStats(dataset, '2026-03');
    const laStreak = calculateFocusStreak(dataset, '2026-03-09');

    process.env.TZ = 'Asia/Ho_Chi_Minh';
    const vnDay = aggregateDayStats(dataset, '2026-03-09');
    const vnMonth = aggregateMonthStats(dataset, '2026-03');
    const vnStreak = calculateFocusStreak(dataset, '2026-03-09');

    assert.deepEqual(laDay, vnDay);
    assert.deepEqual(laMonth, vnMonth);
    assert.deepEqual(laStreak, vnStreak);
  } finally {
    if (prevTz === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = prevTz;
    }
  }
});

test('StatsAggregator: handles 10 years (~3,650 daily records) within tight performance budget', () => {
  const records: Record<string, DailyStatRecord> = {};
  for (let i = 0; i < 3660; i++) {
    const key = addDaysToDateKey('2016-11-17', i)!;
    records[key] = makeRec(key, i % 7 === 0 ? 0 : 45, i % 7 === 0 ? 0 : 2, 0);
  }

  const startMs = performance.now();
  const y = aggregateYearStats(records, '2024');
  const m = aggregateMonthStats(records, '2024-02');
  const d = aggregateDayStats(records, '2024-03-01');
  const s = calculateFocusStreak(records, '2026-11-17');
  const elapsedMs = performance.now() - startMs;

  assert.equal(y.months.length, 12);
  assert.equal(m.daysInMonth, 29);
  assert.equal(d.trend7Days.length, 7);
  assert.equal(s.longest, 6);
  assert.ok(elapsedMs < 150, `Expected < 150ms for 3,660 records, took ${elapsedMs.toFixed(2)}ms`);
});
