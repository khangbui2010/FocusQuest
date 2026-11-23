import { QuestResetCountdown, QuestState } from '../../types/quests.ts';
import {
  addDaysToDateKey,
  dateKeyToEpochDay,
  epochDayToDateKey,
  formatDateKey,
  isValidDateKey,
  parseDateKey,
} from '../stats/statsAggregator.ts';

/**
 * Pure Gregorian calendar and local reset helpers for Quests.
 * Uses only explicit timestamps/dateKeys supplied by callers (no ambient clock or RNG).
 */

export function formatLocalDateKey(nowMs: number): string {
  if (typeof nowMs !== 'number' || !Number.isFinite(nowMs)) {
    throw new Error(`Invalid timestamp for formatLocalDateKey: ${String(nowMs)}`);
  }
  const d = new Date(nowMs);
  return formatDateKey(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

/**
 * Epoch day 0 (1970-01-01) was a Thursday (offset 3 when Monday = 0 .. Sunday = 6).
 */
export function getMondayOffsetFromEpochDay(epochDay: number): number {
  return (((epochDay + 3) % 7) + 7) % 7;
}

/**
 * Computes the Monday ('YYYY-MM-DD') start-of-week key for a given 'YYYY-MM-DD' date key
 * using pure Gregorian calendar arithmetic (immune to year-boundary ISO-week and DST edge cases).
 */
export function getLocalWeekStartKeyFromDateKey(dateKey: string): string {
  const epochDay = dateKeyToEpochDay(dateKey);
  if (epochDay === null) {
    throw new Error(`Invalid dateKey for getLocalWeekStartKeyFromDateKey: ${String(dateKey)}`);
  }
  const mondayOffset = getMondayOffsetFromEpochDay(epochDay);
  return epochDayToDateKey(epochDay - mondayOffset);
}

/**
 * Computes the local Monday ('YYYY-MM-DD') start-of-week key for a given timestamp.
 */
export function getLocalWeekStartKey(nowMs: number): string {
  return getLocalWeekStartKeyFromDateKey(formatLocalDateKey(nowMs));
}

export function diffDateKeys(laterDateKey: string, earlierDateKey: string): number | null {
  const laterEpoch = dateKeyToEpochDay(laterDateKey);
  const earlierEpoch = dateKeyToEpochDay(earlierDateKey);
  if (laterEpoch === null || earlierEpoch === null) {
    return null;
  }
  return laterEpoch - earlierEpoch;
}

export function getNextDailyDateKey(dateKey: string): string {
  const next = addDaysToDateKey(dateKey, 1);
  if (!next) {
    throw new Error(`Unable to compute next daily dateKey from ${String(dateKey)}`);
  }
  return next;
}

export function getNextWeeklyStartKey(weekStartOrDateKey: string): string {
  const monday = getLocalWeekStartKeyFromDateKey(weekStartOrDateKey);
  const next = addDaysToDateKey(monday, 7);
  if (!next) {
    throw new Error(`Unable to compute next weekly start key from ${String(weekStartOrDateKey)}`);
  }
  return next;
}

export function getLocalMidnightTimestamp(dateKey: string): number {
  const parts = parseDateKey(dateKey);
  if (!parts) {
    throw new Error(`Invalid dateKey for getLocalMidnightTimestamp: ${String(dateKey)}`);
  }
  return new Date(parts.year, parts.month - 1, parts.day, 0, 0, 0, 0).getTime();
}

export function getResetCountdown(
  nowMs: number,
  state?: Pick<QuestState, 'dailyDateKey' | 'weeklyStartKey'>
): QuestResetCountdown {
  const nowDateKey = formatLocalDateKey(nowMs);
  const nowWeekKey = getLocalWeekStartKeyFromDateKey(nowDateKey);

  const activeDailyKey =
    state && isValidDateKey(state.dailyDateKey) && state.dailyDateKey > nowDateKey
      ? state.dailyDateKey
      : nowDateKey;

  const activeWeekKey =
    state && isValidDateKey(state.weeklyStartKey) && state.weeklyStartKey > nowWeekKey
      ? getLocalWeekStartKeyFromDateKey(state.weeklyStartKey)
      : nowWeekKey;

  const nextDailyDateKey = getNextDailyDateKey(activeDailyKey);
  const nextWeeklyStartKey = getNextWeeklyStartKey(activeWeekKey);

  const dailyResetInMs = Math.max(0, getLocalMidnightTimestamp(nextDailyDateKey) - nowMs);
  const weeklyResetInMs = Math.max(0, getLocalMidnightTimestamp(nextWeeklyStartKey) - nowMs);

  return {
    dailyResetInMs,
    weeklyResetInMs,
    nextDailyDateKey,
    nextWeeklyStartKey,
  };
}
