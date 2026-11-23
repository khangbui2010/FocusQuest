import { DailyStatRecord } from '../../types/storageSchema.ts';
import type {
  BestMonthStat,
  DayStatsSummary,
  DayTrendPoint,
  FocusStreakSummary,
  MonthDayBarStat,
  MonthStatsSummary,
  PeakDayStat,
  YearMonthBarStat,
  YearStatsSummary,
} from './statsTypes.ts';

export type {
  BestMonthStat,
  DayStatsSummary,
  DayTrendPoint,
  FocusStreakSummary,
  MonthDayBarStat,
  MonthStatsSummary,
  PeakDayStat,
  YearMonthBarStat,
  YearStatsSummary,
};

interface NormalizedDayMetrics {
  focusMinutes: number;
  completed: number;
  abandoned: number;
  sessions: number;
  coins: number;
  xp: number;
}

const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_KEY_PATTERN = /^(\d{4})-(\d{2})$/;
const YEAR_KEY_PATTERN = /^(\d{4})$/;
const DAYS_IN_MONTH_COMMON = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

function sanitizeNonNegative(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function pad4(n: number): string {
  if (n >= 1000) return `${n}`;
  if (n >= 100) return `0${n}`;
  if (n >= 10) return `00${n}`;
  return `000${n}`;
}

export function isLeapYear(year: number): boolean {
  if (!Number.isInteger(year) || year < 1 || year > 9999) {
    return false;
  }
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function getDaysInMonth(year: number, month: number): number {
  if (!Number.isInteger(year) || year < 1 || year > 9999) return 0;
  if (!Number.isInteger(month) || month < 1 || month > 12) return 0;
  if (month === 2 && isLeapYear(year)) return 29;
  return DAYS_IN_MONTH_COMMON[month - 1];
}

export function parseDateKey(
  dateKey: unknown
): { year: number; month: number; day: number } | null {
  if (typeof dateKey !== 'string') return null;
  const match = DATE_KEY_PATTERN.exec(dateKey);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const maxDays = getDaysInMonth(year, month);
  if (maxDays === 0 || day < 1 || day > maxDays) return null;
  return { year, month, day };
}

export function isValidDateKey(dateKey: unknown): dateKey is string {
  return parseDateKey(dateKey) !== null;
}

export function parseMonthKey(
  monthKey: unknown
): { year: number; month: number } | null {
  if (typeof monthKey !== 'string') return null;
  const match = MONTH_KEY_PATTERN.exec(monthKey);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (year < 1 || year > 9999 || month < 1 || month > 12) return null;
  return { year, month };
}

export function isValidMonthKey(monthKey: unknown): monthKey is string {
  return parseMonthKey(monthKey) !== null;
}

export function parseYearKey(yearKey: unknown): number | null {
  if (typeof yearKey !== 'string') return null;
  const match = YEAR_KEY_PATTERN.exec(yearKey);
  if (!match) return null;
  const year = Number(match[1]);
  return year >= 1 && year <= 9999 ? year : null;
}

export function isValidYearKey(yearKey: unknown): yearKey is string {
  return parseYearKey(yearKey) !== null;
}

export function formatDateKey(year: number, month: number, day: number): string {
  return `${pad4(year)}-${pad2(month)}-${pad2(day)}`;
}

/**
 * Pure Gregorian integer calendar -> epoch day conversion (Howard Hinnant algorithm).
 * Zero dependency on Date, local timezone, or DST transitions.
 */
export function datePartsToEpochDay(year: number, month: number, day: number): number {
  const y = year - (month <= 2 ? 1 : 0);
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

export function epochDayToDateParts(epochDay: number): {
  year: number;
  month: number;
  day: number;
} {
  const z = epochDay + 719468;
  const era = Math.floor((z >= 0 ? z : z - 146096) / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor(
    (doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) /
      365
  );
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp + (mp < 10 ? 3 : -9);
  const year = y + (month <= 2 ? 1 : 0);
  return { year, month, day };
}

export function dateKeyToEpochDay(dateKey: string): number | null {
  const parts = parseDateKey(dateKey);
  if (!parts) return null;
  return datePartsToEpochDay(parts.year, parts.month, parts.day);
}

export function epochDayToDateKey(epochDay: number): string {
  const { year, month, day } = epochDayToDateParts(Math.trunc(epochDay));
  return formatDateKey(year, month, day);
}

export function addDaysToDateKey(dateKey: string, deltaDays: number): string | null {
  if (!Number.isInteger(deltaDays)) return null;
  const epochDay = dateKeyToEpochDay(dateKey);
  if (epochDay === null) return null;
  const nextEpoch = epochDay + deltaDays;
  const nextParts = epochDayToDateParts(nextEpoch);
  if (nextParts.year < 1 || nextParts.year > 9999) return null;
  return formatDateKey(nextParts.year, nextParts.month, nextParts.day);
}

function normalizeRecord(raw: unknown): NormalizedDayMetrics {
  if (!raw || typeof raw !== 'object') {
    return { focusMinutes: 0, completed: 0, abandoned: 0, sessions: 0, coins: 0, xp: 0 };
  }
  const rec = raw as Partial<DailyStatRecord>;
  const focusMinutes = sanitizeNonNegative(rec.totalFocusMinutes);
  const completed = sanitizeNonNegative(rec.completedSessions);
  const abandoned = sanitizeNonNegative(rec.abandonedSessions);
  const coins = sanitizeNonNegative(rec.coinsEarned);
  const xp = sanitizeNonNegative(rec.xpEarned);
  return {
    focusMinutes,
    completed,
    abandoned,
    sessions: completed + abandoned,
    coins,
    xp,
  };
}

function readValidRecord(
  dailyStats: Record<string, DailyStatRecord> | null | undefined,
  dateISO: string
): NormalizedDayMetrics {
  if (!dailyStats || typeof dailyStats !== 'object') {
    return { focusMinutes: 0, completed: 0, abandoned: 0, sessions: 0, coins: 0, xp: 0 };
  }
  if (!Object.prototype.hasOwnProperty.call(dailyStats, dateISO)) {
    return { focusMinutes: 0, completed: 0, abandoned: 0, sessions: 0, coins: 0, xp: 0 };
  }
  return normalizeRecord(dailyStats[dateISO]);
}

/**
 * Calculates authoritative cumulative lifetime focus minutes from all daily stat records.
 * Single source of truth across background, civilization unlock gates, and UI stats.
 * Pause and break times are strictly excluded by the timer domain models.
 */
export function calculateLifetimeFocusMinutes(
  dailyStats: Record<string, DailyStatRecord> | null | undefined
): number {
  if (!dailyStats || typeof dailyStats !== 'object') {
    return 0;
  }
  let total = 0;
  for (const record of Object.values(dailyStats)) {
    if (
      record &&
      typeof record.totalFocusMinutes === 'number' &&
      Number.isFinite(record.totalFocusMinutes)
    ) {
      total += Math.max(0, record.totalFocusMinutes);
    }
  }
  return total;
}

/**
 * Aggregates metrics for a single 'YYYY-MM-DD' date and its trailing 7-day trend
 * ending at `dateISO` (always 7 chronological points for valid dates, 0-filled when missing).
 */
export function aggregateDayStats(
  dailyStats: Record<string, DailyStatRecord> | null | undefined,
  dateISO: string
): DayStatsSummary {
  const anchorEpoch = dateKeyToEpochDay(dateISO);
  if (anchorEpoch === null) {
    return {
      dateISO: typeof dateISO === 'string' ? dateISO : '',
      focusMinutes: 0,
      completed: 0,
      abandoned: 0,
      sessions: 0,
      coins: 0,
      xp: 0,
      trend7Days: [],
    };
  }

  const today = readValidRecord(dailyStats, dateISO);
  const trend7Days: DayTrendPoint[] = [];
  for (let offset = -6; offset <= 0; offset++) {
    const pointKey = epochDayToDateKey(anchorEpoch + offset);
    const metrics = readValidRecord(dailyStats, pointKey);
    trend7Days.push({
      dateISO: pointKey,
      focusMinutes: metrics.focusMinutes,
      sessions: metrics.sessions,
      completed: metrics.completed,
      abandoned: metrics.abandoned,
    });
  }

  return {
    dateISO,
    focusMinutes: today.focusMinutes,
    completed: today.completed,
    abandoned: today.abandoned,
    sessions: today.sessions,
    coins: today.coins,
    xp: today.xp,
    trend7Days,
  };
}

/**
 * Aggregates metrics across a full 'YYYY-MM' calendar month.
 */
export function aggregateMonthStats(
  dailyStats: Record<string, DailyStatRecord> | null | undefined,
  monthKey: string
): MonthStatsSummary {
  const parsed = parseMonthKey(monthKey);
  if (!parsed) {
    return {
      monthKey: typeof monthKey === 'string' ? monthKey : '',
      year: 0,
      month: 0,
      daysInMonth: 0,
      totalFocusMinutes: 0,
      averageFocusPerCalendarDay: 0,
      averageFocusPerActiveDay: 0,
      activeDays: 0,
      completed: 0,
      abandoned: 0,
      completionRate: null,
      coins: 0,
      xp: 0,
      peakDay: null,
      days: [],
    };
  }

  const { year, month } = parsed;
  const daysInMonth = getDaysInMonth(year, month);
  const days: MonthDayBarStat[] = [];
  let totalFocusMinutes = 0;
  let activeDays = 0;
  let completed = 0;
  let abandoned = 0;
  let coins = 0;
  let xp = 0;
  let peakDay: PeakDayStat | null = null;

  for (let dayNum = 1; dayNum <= daysInMonth; dayNum++) {
    const dateISO = formatDateKey(year, month, dayNum);
    const metrics = readValidRecord(dailyStats, dateISO);

    days.push({
      dayNumber: dayNum,
      dateISO,
      focusMinutes: metrics.focusMinutes,
      sessions: metrics.sessions,
      completed: metrics.completed,
      abandoned: metrics.abandoned,
      coins: metrics.coins,
      xp: metrics.xp,
    });

    totalFocusMinutes += metrics.focusMinutes;
    if (metrics.focusMinutes > 0) {
      activeDays += 1;
      // Strictly greater ensures chronological earliest day wins ties
      if (!peakDay || metrics.focusMinutes > peakDay.focusMinutes) {
        peakDay = {
          dateISO,
          dayNumber: dayNum,
          focusMinutes: metrics.focusMinutes,
          sessions: metrics.sessions,
        };
      }
    }
    completed += metrics.completed;
    abandoned += metrics.abandoned;
    coins += metrics.coins;
    xp += metrics.xp;
  }

  const totalSessions = completed + abandoned;
  return {
    monthKey,
    year,
    month,
    daysInMonth,
    totalFocusMinutes,
    averageFocusPerCalendarDay: daysInMonth > 0 ? totalFocusMinutes / daysInMonth : 0,
    averageFocusPerActiveDay: activeDays > 0 ? totalFocusMinutes / activeDays : 0,
    activeDays,
    completed,
    abandoned,
    completionRate: totalSessions > 0 ? completed / totalSessions : null,
    coins,
    xp,
    peakDay,
    days,
  };
}

/**
 * Aggregates metrics across all 12 months of a 'YYYY' calendar year.
 */
export function aggregateYearStats(
  dailyStats: Record<string, DailyStatRecord> | null | undefined,
  yearKey: string
): YearStatsSummary {
  const year = parseYearKey(yearKey);
  if (year === null) {
    return {
      yearKey: typeof yearKey === 'string' ? yearKey : '',
      year: 0,
      totalFocusMinutes: 0,
      activeDays: 0,
      completed: 0,
      abandoned: 0,
      completionRate: null,
      coins: 0,
      xp: 0,
      bestMonth: null,
      months: [],
    };
  }

  const months: YearMonthBarStat[] = Array.from({ length: 12 }, (_, idx) => {
    const monthNumber = idx + 1;
    return {
      monthNumber,
      monthKey: `${pad4(year)}-${pad2(monthNumber)}`,
      focusMinutes: 0,
      sessions: 0,
      completed: 0,
      abandoned: 0,
      coins: 0,
      xp: 0,
      activeDays: 0,
    };
  });

  if (dailyStats && typeof dailyStats === 'object') {
    for (const [key, rawRecord] of Object.entries(dailyStats)) {
      const parsed = parseDateKey(key);
      if (!parsed || parsed.year !== year) continue;
      const metrics = normalizeRecord(rawRecord);
      const bucket = months[parsed.month - 1];
      bucket.focusMinutes += metrics.focusMinutes;
      bucket.sessions += metrics.sessions;
      bucket.completed += metrics.completed;
      bucket.abandoned += metrics.abandoned;
      bucket.coins += metrics.coins;
      bucket.xp += metrics.xp;
      if (metrics.focusMinutes > 0) {
        bucket.activeDays += 1;
      }
    }
  }

  let totalFocusMinutes = 0;
  let activeDays = 0;
  let completed = 0;
  let abandoned = 0;
  let coins = 0;
  let xp = 0;
  let bestMonth: BestMonthStat | null = null;

  for (const bucket of months) {
    totalFocusMinutes += bucket.focusMinutes;
    activeDays += bucket.activeDays;
    completed += bucket.completed;
    abandoned += bucket.abandoned;
    coins += bucket.coins;
    xp += bucket.xp;
    // Strictly greater ensures chronological earliest month wins ties
    if (bucket.focusMinutes > 0 && (!bestMonth || bucket.focusMinutes > bestMonth.focusMinutes)) {
      bestMonth = {
        monthKey: bucket.monthKey,
        monthNumber: bucket.monthNumber,
        focusMinutes: bucket.focusMinutes,
        sessions: bucket.sessions,
        activeDays: bucket.activeDays,
      };
    }
  }

  const totalSessions = completed + abandoned;
  return {
    yearKey,
    year,
    totalFocusMinutes,
    activeDays,
    completed,
    abandoned,
    completionRate: totalSessions > 0 ? completed / totalSessions : null,
    coins,
    xp,
    bestMonth,
    months,
  };
}

/**
 * Calculates current consecutive focus streak ending at `todayISO` (or `todayISO - 1`
 * if `todayISO` has no recorded focus yet) and the all-time longest streak.
 * Active day rule: totalFocusMinutes > 0. Ignores dates > todayISO when computing current streak.
 */
export function calculateFocusStreak(
  dailyStats: Record<string, DailyStatRecord> | null | undefined,
  todayISO: string
): FocusStreakSummary {
  const activeEpochDays = new Set<number>();

  if (dailyStats && typeof dailyStats === 'object') {
    for (const [key, rawRecord] of Object.entries(dailyStats)) {
      const epochDay = dateKeyToEpochDay(key);
      if (epochDay === null) continue;
      const metrics = normalizeRecord(rawRecord);
      if (metrics.focusMinutes > 0) {
        activeEpochDays.add(epochDay);
      }
    }
  }

  if (activeEpochDays.size === 0) {
    return { current: 0, longest: 0 };
  }

  const sortedDays = Array.from(activeEpochDays).sort((a, b) => a - b);
  let longest = 0;
  let running = 0;
  let prevDay: number | null = null;

  for (const day of sortedDays) {
    if (prevDay !== null && day === prevDay + 1) {
      running += 1;
    } else {
      running = 1;
    }
    if (running > longest) {
      longest = running;
    }
    prevDay = day;
  }

  const todayEpoch = dateKeyToEpochDay(todayISO);
  if (todayEpoch === null) {
    return { current: 0, longest };
  }

  let cursor: number | null = null;
  if (activeEpochDays.has(todayEpoch)) {
    cursor = todayEpoch;
  } else if (activeEpochDays.has(todayEpoch - 1)) {
    cursor = todayEpoch - 1;
  }

  let current = 0;
  while (cursor !== null && activeEpochDays.has(cursor)) {
    current += 1;
    cursor -= 1;
  }

  return {
    current,
    longest,
  };
}
