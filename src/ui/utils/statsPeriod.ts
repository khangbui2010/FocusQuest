import {
  addDaysToDateKey,
  isValidDateKey,
  parseMonthKey,
  parseYearKey,
} from '../../core/stats/statsAggregator.ts';
import {
  DayStatsSummary,
  MonthStatsSummary,
  YearStatsSummary,
} from '../../core/stats/statsTypes.ts';
import { TranslationKey, TranslationParams } from '../../i18n/types.ts';
import { StatsBarDatum } from '../components/StatsBarChart.tsx';

export type StatsPeriodMode = 'day' | 'month' | 'year';

export type StatsTranslateFn = (key: TranslationKey, params?: TranslationParams) => string;

const MONTH_SHORT_KEYS: readonly TranslationKey[] = [
  'stats.monthShort.1',
  'stats.monthShort.2',
  'stats.monthShort.3',
  'stats.monthShort.4',
  'stats.monthShort.5',
  'stats.monthShort.6',
  'stats.monthShort.7',
  'stats.monthShort.8',
  'stats.monthShort.9',
  'stats.monthShort.10',
  'stats.monthShort.11',
  'stats.monthShort.12',
] as const;

export function getMonthShortLabel(monthNumber: number, t: StatsTranslateFn): string {
  if (!Number.isInteger(monthNumber) || monthNumber < 1 || monthNumber > 12) {
    return String(monthNumber);
  }
  return t(MONTH_SHORT_KEYS[monthNumber - 1]);
}

export function formatMonthPeriodLabel(monthKey: string, t: StatsTranslateFn): string {
  const parsed = parseMonthKey(monthKey);
  if (!parsed) return monthKey;
  return `${getMonthShortLabel(parsed.month, t)} ${parsed.year}`;
}

export function getPeriodKeysFromToday(todayDateKey: string): {
  todayDateKey: string;
  todayMonthKey: string;
  todayYearKey: string;
} {
  const validToday = isValidDateKey(todayDateKey) ? todayDateKey : '1970-01-01';
  return {
    todayDateKey: validToday,
    todayMonthKey: validToday.slice(0, 7),
    todayYearKey: validToday.slice(0, 4),
  };
}

export function getCurrentKeyForMode(mode: StatsPeriodMode, todayDateKey: string): string {
  const keys = getPeriodKeysFromToday(todayDateKey);
  if (mode === 'day') return keys.todayDateKey;
  if (mode === 'month') return keys.todayMonthKey;
  return keys.todayYearKey;
}

export function canStepPeriod(
  mode: StatsPeriodMode,
  currentKey: string,
  delta: -1 | 1,
  todayDateKey: string
): boolean {
  const next = stepStatsPeriod(mode, currentKey, delta, todayDateKey);
  return next !== currentKey;
}

export function stepStatsPeriod(
  mode: StatsPeriodMode,
  currentKey: string,
  delta: -1 | 1,
  todayDateKey: string
): string {
  const { todayDateKey: maxDay, todayMonthKey: maxMonth, todayYearKey: maxYear } =
    getPeriodKeysFromToday(todayDateKey);

  if (mode === 'day') {
    const valid = isValidDateKey(currentKey) ? currentKey : maxDay;
    const clamped = valid > maxDay ? maxDay : valid;
    const candidate = addDaysToDateKey(clamped, delta);
    if (!candidate) return clamped;
    if (candidate > maxDay) return clamped;
    return candidate;
  }

  if (mode === 'month') {
    const parsed = parseMonthKey(currentKey) ?? parseMonthKey(maxMonth)!;
    const clampedMonth = `${String(parsed.year).padStart(4, '0')}-${String(parsed.month).padStart(2, '0')}`;
    const safeCurrent = clampedMonth > maxMonth ? maxMonth : clampedMonth;
    const safeParsed = parseMonthKey(safeCurrent)!;

    let nextYear = safeParsed.year;
    let nextMonth = safeParsed.month + delta;
    if (nextMonth < 1) {
      nextMonth = 12;
      nextYear -= 1;
    } else if (nextMonth > 12) {
      nextMonth = 1;
      nextYear += 1;
    }
    if (nextYear < 1 || nextYear > 9999) {
      return safeCurrent;
    }
    const candidate = `${String(nextYear).padStart(4, '0')}-${String(nextMonth).padStart(2, '0')}`;
    if (candidate > maxMonth) return safeCurrent;
    return candidate;
  }

  const yearNum = parseYearKey(currentKey) ?? parseYearKey(maxYear)!;
  const maxYearNum = parseYearKey(maxYear)!;
  const safeYear = yearNum > maxYearNum ? maxYearNum : yearNum;
  const nextYear = safeYear + delta;
  if (nextYear < 1 || nextYear > 9999 || nextYear > maxYearNum) {
    return String(safeYear).padStart(4, '0');
  }
  return String(nextYear).padStart(4, '0');
}

export function dayTrendToBars(summary: DayStatsSummary): StatsBarDatum[] {
  return summary.trend7Days.map((point) => ({
    key: point.dateISO,
    label: point.dateISO,
    axisLabel: point.dateISO.slice(5),
    value: point.focusMinutes,
    sessions: point.sessions,
    isCurrent: point.dateISO === summary.dateISO,
  }));
}

export function monthDaysToBars(
  summary: MonthStatsSummary,
  todayDateKey: string
): StatsBarDatum[] {
  return summary.days.map((day) => ({
    key: day.dateISO,
    label: day.dateISO,
    axisLabel: String(day.dayNumber),
    value: day.focusMinutes,
    sessions: day.sessions,
    isCurrent: day.dateISO === todayDateKey,
  }));
}

export function yearMonthsToBars(
  summary: YearStatsSummary,
  todayMonthKey: string,
  t: StatsTranslateFn
): StatsBarDatum[] {
  return summary.months.map((m) => {
    const shortLabel = getMonthShortLabel(m.monthNumber, t);
    return {
      key: m.monthKey,
      label: `${shortLabel} ${summary.year}`,
      axisLabel: shortLabel,
      value: m.focusMinutes,
      sessions: m.sessions,
      isCurrent: m.monthKey === todayMonthKey,
    };
  });
}
