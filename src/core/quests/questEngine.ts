import {
  ClaimQuestResult,
  CURRENT_QUEST_STATE_VERSION,
  MAX_PROCESSED_PERIOD_KEYS,
  MAX_RECENT_CLAIMED_KEYS,
  QuestOutcomeDelta,
  QuestPeriod,
  QuestProgress,
  QuestState,
  QuestStreak,
} from '../../types/quests.ts';
import { DEFAULT_POMODORO_CONFIG, SessionSnapshot } from '../../types/session.ts';
import { DEFAULT_REWARD_CONFIG } from '../reward/rewardEngine.ts';
import { isValidDateKey } from '../stats/statsAggregator.ts';
import { TimeCalculator } from '../timer/timeCalculator.ts';
import { getQuestDefinition, getQuestDefinitionsByPeriod } from './questCatalog.ts';
import {
  diffDateKeys,
  formatLocalDateKey,
  getLocalWeekStartKeyFromDateKey,
} from './questDates.ts';

function makePeriodKey(period: QuestPeriod, dateKey: string): string {
  return `${period.toLowerCase()}:${dateKey}`;
}

export function makeClaimLedgerKey(
  period: QuestPeriod,
  periodDateKey: string,
  questId: string
): string {
  return `${period.toLowerCase()}:${periodDateKey}:${questId}`;
}

function appendBoundedUnique(
  list: readonly string[],
  value: string,
  maxLength: number
): readonly string[] {
  const filtered = list.filter((item) => item !== value);
  filtered.push(value);
  return filtered.length > maxLength ? filtered.slice(filtered.length - maxLength) : filtered;
}

function sanitizeBoundedUnique(raw: unknown, maxLength: number): readonly string[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const deduped: string[] = [];
  for (const item of raw) {
    if (typeof item === 'string' && item.length > 0 && item.length <= 128) {
      if (!deduped.includes(item)) {
        deduped.push(item);
      }
    }
  }
  return deduped.length > maxLength ? deduped.slice(deduped.length - maxLength) : deduped;
}

export function createPeriodProgressRecord(period: QuestPeriod): Record<string, QuestProgress> {
  const result: Record<string, QuestProgress> = {};
  for (const def of getQuestDefinitionsByPeriod(period)) {
    result[def.id] = {
      questId: def.id,
      period: def.period,
      progress: 0,
      target: def.target,
      completed: false,
      claimed: false,
      claimedAt: null,
    };
  }
  return result;
}

function sanitizePeriodProgressRecord(
  period: QuestPeriod,
  rawRecord: unknown
): Record<string, QuestProgress> {
  const source =
    typeof rawRecord === 'object' && rawRecord !== null && !Array.isArray(rawRecord)
      ? (rawRecord as Record<string, unknown>)
      : {};

  const result: Record<string, QuestProgress> = {};
  for (const def of getQuestDefinitionsByPeriod(period)) {
    const rawEntry =
      typeof source[def.id] === 'object' && source[def.id] !== null && !Array.isArray(source[def.id])
        ? (source[def.id] as Record<string, unknown>)
        : {};

    const rawProgress =
      typeof rawEntry.progress === 'number' && Number.isFinite(rawEntry.progress)
        ? Math.max(0, Math.floor(rawEntry.progress))
        : 0;
    const progress = Math.min(def.target, rawProgress);
    const completed = progress >= def.target;
    const claimed = typeof rawEntry.claimed === 'boolean' ? rawEntry.claimed : false;
    const claimedAt =
      claimed &&
      typeof rawEntry.claimedAt === 'number' &&
      Number.isFinite(rawEntry.claimedAt) &&
      rawEntry.claimedAt >= 0
        ? rawEntry.claimedAt
        : null;

    result[def.id] = {
      questId: def.id,
      period: def.period,
      progress,
      target: def.target,
      completed,
      claimed,
      claimedAt,
    };
  }
  return result;
}

function sanitizeStreak(raw: unknown): QuestStreak {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return {
      currentDays: 0,
      longestDays: 0,
      lastCompletedDateKey: null,
    };
  }
  const s = raw as Record<string, unknown>;
  const lastCompletedDateKey = isValidDateKey(s.lastCompletedDateKey)
    ? s.lastCompletedDateKey
    : null;
  const rawCurrent =
    lastCompletedDateKey !== null &&
    typeof s.currentDays === 'number' &&
    Number.isFinite(s.currentDays)
      ? Math.max(0, Math.floor(s.currentDays))
      : 0;
  const rawLongest =
    typeof s.longestDays === 'number' && Number.isFinite(s.longestDays)
      ? Math.max(0, Math.floor(s.longestDays))
      : 0;

  return {
    currentDays: rawCurrent,
    longestDays: Math.max(rawCurrent, rawLongest),
    lastCompletedDateKey,
  };
}

export function createInitialQuestState(nowMs: number): QuestState {
  const dailyDateKey = formatLocalDateKey(nowMs);
  const weeklyStartKey = getLocalWeekStartKeyFromDateKey(dailyDateKey);

  return {
    schemaVersion: CURRENT_QUEST_STATE_VERSION,
    dailyDateKey,
    weeklyStartKey,
    daily: createPeriodProgressRecord('DAILY'),
    weekly: createPeriodProgressRecord('WEEKLY'),
    weeklyActiveDateKeys: [],
    streak: {
      currentDays: 0,
      longestDays: 0,
      lastCompletedDateKey: null,
    },
    lastSettledTimestamp: Math.max(0, nowMs),
    processedPeriodKeys: [
      makePeriodKey('DAILY', dailyDateKey),
      makePeriodKey('WEEKLY', weeklyStartKey),
    ],
    recentClaimedKeys: [],
  };
}

export function sanitizeQuestState(raw: unknown, nowMs: number): QuestState {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return createInitialQuestState(nowMs);
  }

  const r = raw as Record<string, unknown>;
  const nowDateKey = formatLocalDateKey(nowMs);

  const dailyDateKey = isValidDateKey(r.dailyDateKey) ? r.dailyDateKey : nowDateKey;
  const weeklyStartKey = isValidDateKey(r.weeklyStartKey)
    ? getLocalWeekStartKeyFromDateKey(r.weeklyStartKey)
    : getLocalWeekStartKeyFromDateKey(dailyDateKey);

  const schemaVersion =
    typeof r.schemaVersion === 'number' && Number.isInteger(r.schemaVersion) && r.schemaVersion >= 1
      ? r.schemaVersion
      : CURRENT_QUEST_STATE_VERSION;

  const daily = sanitizePeriodProgressRecord('DAILY', r.daily);
  const weekly = sanitizePeriodProgressRecord('WEEKLY', r.weekly);

  const weeklyActiveDateKeysRaw = Array.isArray(r.weeklyActiveDateKeys)
    ? r.weeklyActiveDateKeys
    : [];
  const weeklyActiveSet = new Set<string>();
  for (const d of weeklyActiveDateKeysRaw) {
    if (isValidDateKey(d) && getLocalWeekStartKeyFromDateKey(d) === weeklyStartKey) {
      weeklyActiveSet.add(d);
    }
  }
  const weeklyActiveDateKeys = Array.from(weeklyActiveSet).sort();

  // Keep weekly_habit_builder progress consistent with sanitized active days
  const habitDef = getQuestDefinition('WEEKLY', 'weekly_habit_builder');
  if (habitDef && weekly.weekly_habit_builder) {
    const habitProgress = Math.min(habitDef.target, weeklyActiveDateKeys.length);
    weekly.weekly_habit_builder = {
      ...weekly.weekly_habit_builder,
      progress: Math.max(weekly.weekly_habit_builder.progress, habitProgress),
      completed: Math.max(weekly.weekly_habit_builder.progress, habitProgress) >= habitDef.target,
    };
  }

  const streak = sanitizeStreak(r.streak);
  const lastSettledTimestamp =
    typeof r.lastSettledTimestamp === 'number' &&
    Number.isFinite(r.lastSettledTimestamp) &&
    r.lastSettledTimestamp >= 0
      ? r.lastSettledTimestamp
      : Math.max(0, nowMs);

  const recentClaimedKeys = sanitizeBoundedUnique(r.recentClaimedKeys, MAX_RECENT_CLAIMED_KEYS);
  let processedPeriodKeys = sanitizeBoundedUnique(
    r.processedPeriodKeys,
    MAX_PROCESSED_PERIOD_KEYS
  );
  processedPeriodKeys = appendBoundedUnique(
    processedPeriodKeys,
    makePeriodKey('DAILY', dailyDateKey),
    MAX_PROCESSED_PERIOD_KEYS
  );
  processedPeriodKeys = appendBoundedUnique(
    processedPeriodKeys,
    makePeriodKey('WEEKLY', weeklyStartKey),
    MAX_PROCESSED_PERIOD_KEYS
  );

  return {
    schemaVersion,
    dailyDateKey,
    weeklyStartKey,
    daily,
    weekly,
    weeklyActiveDateKeys,
    streak,
    lastSettledTimestamp,
    processedPeriodKeys,
    recentClaimedKeys,
  };
}

/**
 * Advances daily/weekly periods forward when wall clock enters a new local day or Monday.
 * Strictly guards against system clock rollback:
 * - Never resets progress back to an earlier date/week or an already processed period key.
 * - Preserves unclaimed rewards within the active period; expires unclaimed rewards when rolling forward.
 */
export function rolloverQuestState(state: QuestState, nowMs: number): QuestState {
  const safe = sanitizeQuestState(state, nowMs);
  const nowDateKey = formatLocalDateKey(nowMs);
  const nowWeekKey = getLocalWeekStartKeyFromDateKey(nowDateKey);
  const isClockForwardOrSame = nowMs >= safe.lastSettledTimestamp;

  let nextDailyDateKey = safe.dailyDateKey;
  let nextDaily = safe.daily;
  let nextWeeklyStartKey = safe.weeklyStartKey;
  let nextWeekly = safe.weekly;
  let nextWeeklyActiveDateKeys = safe.weeklyActiveDateKeys;
  let nextProcessedPeriodKeys = safe.processedPeriodKeys;

  const nextDailyPeriodKey = makePeriodKey('DAILY', nowDateKey);
  if (
    isClockForwardOrSame &&
    nowDateKey > safe.dailyDateKey &&
    !safe.processedPeriodKeys.includes(nextDailyPeriodKey)
  ) {
    nextDailyDateKey = nowDateKey;
    nextDaily = createPeriodProgressRecord('DAILY');
    nextProcessedPeriodKeys = appendBoundedUnique(
      nextProcessedPeriodKeys,
      nextDailyPeriodKey,
      MAX_PROCESSED_PERIOD_KEYS
    );
  }

  const nextWeeklyPeriodKey = makePeriodKey('WEEKLY', nowWeekKey);
  if (
    isClockForwardOrSame &&
    nowWeekKey > safe.weeklyStartKey &&
    !safe.processedPeriodKeys.includes(nextWeeklyPeriodKey)
  ) {
    nextWeeklyStartKey = nowWeekKey;
    nextWeekly = createPeriodProgressRecord('WEEKLY');
    nextWeeklyActiveDateKeys = [];
    nextProcessedPeriodKeys = appendBoundedUnique(
      nextProcessedPeriodKeys,
      nextWeeklyPeriodKey,
      MAX_PROCESSED_PERIOD_KEYS
    );
  }

  const nextLastSettled = Math.max(safe.lastSettledTimestamp, nowMs);

  if (
    nextDailyDateKey === safe.dailyDateKey &&
    nextWeeklyStartKey === safe.weeklyStartKey &&
    nextLastSettled === safe.lastSettledTimestamp &&
    nextProcessedPeriodKeys === safe.processedPeriodKeys
  ) {
    return safe;
  }

  return {
    ...safe,
    dailyDateKey: nextDailyDateKey,
    weeklyStartKey: nextWeeklyStartKey,
    daily: nextDaily,
    weekly: nextWeekly,
    weeklyActiveDateKeys: nextWeeklyActiveDateKeys,
    lastSettledTimestamp: nextLastSettled,
    processedPeriodKeys: nextProcessedPeriodKeys,
  };
}

function updateStreakForCompletedDate(
  streak: QuestStreak,
  completedDateKey: string
): QuestStreak {
  if (!isValidDateKey(completedDateKey)) {
    return streak;
  }

  if (streak.lastCompletedDateKey === null) {
    return {
      currentDays: 1,
      longestDays: Math.max(streak.longestDays, 1),
      lastCompletedDateKey: completedDateKey,
    };
  }

  const gapDays = diffDateKeys(completedDateKey, streak.lastCompletedDateKey);
  if (gapDays === null || gapDays < 0) {
    // Clock rollback protection: never regress streak backwards
    return streak;
  }

  if (gapDays === 0) {
    return {
      currentDays: streak.currentDays,
      longestDays: Math.max(streak.longestDays, streak.currentDays),
      lastCompletedDateKey: streak.lastCompletedDateKey,
    };
  }

  if (gapDays === 1) {
    const nextCurrent = streak.currentDays + 1;
    return {
      currentDays: nextCurrent,
      longestDays: Math.max(streak.longestDays, nextCurrent),
      lastCompletedDateKey: completedDateKey,
    };
  }

  // Gap >= 2 days resets current streak to 1 while preserving longestDays
  return {
    currentDays: 1,
    longestDays: Math.max(streak.longestDays, 1),
    lastCompletedDateKey: completedDateKey,
  };
}

export function applyCompletedSession(
  state: QuestState,
  delta: QuestOutcomeDelta,
  nowMs: number
): QuestState {
  const rolled = rolloverQuestState(state, nowMs);

  if (
    !delta ||
    !isValidDateKey(delta.completedDateKey) ||
    typeof delta.completedFocusMinutes !== 'number' ||
    !Number.isFinite(delta.completedFocusMinutes) ||
    delta.completedFocusMinutes <= 0
  ) {
    return rolled;
  }

  const completedDateKey = delta.completedDateKey;
  const completedMinutes = Math.floor(delta.completedFocusMinutes);
  if (completedMinutes <= 0) {
    return rolled;
  }

  // Daily quest progress applies only to the active daily period (ignores rolled-back past dates)
  let nextDaily = rolled.daily;
  if (completedDateKey === rolled.dailyDateKey) {
    const updatedDaily: Record<string, QuestProgress> = { ...rolled.daily };
    for (const def of getQuestDefinitionsByPeriod('DAILY')) {
      const current = updatedDaily[def.id] ?? {
        questId: def.id,
        period: 'DAILY' as const,
        progress: 0,
        target: def.target,
        completed: false,
        claimed: false,
        claimedAt: null,
      };
      let increment = 0;
      if (def.metric === 'COMPLETED_SESSIONS') {
        increment = 1;
      } else if (def.metric === 'FOCUS_MINUTES') {
        increment = completedMinutes;
      }
      if (increment > 0) {
        const progress = Math.min(def.target, current.progress + increment);
        updatedDaily[def.id] = {
          ...current,
          progress,
          completed: progress >= def.target,
        };
      }
    }
    nextDaily = updatedDaily;
  }

  // Weekly quest progress applies only to the active Monday-starting week
  let nextWeekly = rolled.weekly;
  let nextWeeklyActiveDateKeys = rolled.weeklyActiveDateKeys;
  const completedWeekKey = getLocalWeekStartKeyFromDateKey(completedDateKey);
  if (completedWeekKey === rolled.weeklyStartKey) {
    if (!rolled.weeklyActiveDateKeys.includes(completedDateKey)) {
      nextWeeklyActiveDateKeys = [...rolled.weeklyActiveDateKeys, completedDateKey].sort();
    }

    const updatedWeekly: Record<string, QuestProgress> = { ...rolled.weekly };
    for (const def of getQuestDefinitionsByPeriod('WEEKLY')) {
      const current = updatedWeekly[def.id] ?? {
        questId: def.id,
        period: 'WEEKLY' as const,
        progress: 0,
        target: def.target,
        completed: false,
        claimed: false,
        claimedAt: null,
      };

      let progress = current.progress;
      if (def.metric === 'ACTIVE_DAYS') {
        progress = Math.min(def.target, Math.max(current.progress, nextWeeklyActiveDateKeys.length));
      } else if (def.metric === 'DEEP_SESSIONS') {
        const minMins = def.minSessionMinutes ?? 45;
        if (completedMinutes >= minMins) {
          progress = Math.min(def.target, current.progress + 1);
        }
      } else if (def.metric === 'COMPLETED_SESSIONS') {
        progress = Math.min(def.target, current.progress + 1);
      }

      updatedWeekly[def.id] = {
        ...current,
        progress,
        completed: progress >= def.target,
      };
    }
    nextWeekly = updatedWeekly;
  }

  const nextStreak = updateStreakForCompletedDate(rolled.streak, completedDateKey);

  return {
    ...rolled,
    daily: nextDaily,
    weekly: nextWeekly,
    weeklyActiveDateKeys: nextWeeklyActiveDateKeys,
    streak: nextStreak,
  };
}

export function canClaim(
  state: QuestState,
  period: QuestPeriod,
  questId: string,
  nowMs: number
): boolean {
  const def = getQuestDefinition(period, questId);
  if (!def) {
    return false;
  }

  const rolled = rolloverQuestState(state, nowMs);
  const periodMap = period === 'DAILY' ? rolled.daily : rolled.weekly;
  const entry = periodMap[questId];
  if (!entry) {
    return false;
  }

  const periodDateKey = period === 'DAILY' ? rolled.dailyDateKey : rolled.weeklyStartKey;
  const ledgerKey = makeClaimLedgerKey(period, periodDateKey, questId);
  if (rolled.recentClaimedKeys.includes(ledgerKey)) {
    return false;
  }

  return entry.progress >= entry.target && !entry.claimed;
}

export function claimQuest(
  state: QuestState,
  period: QuestPeriod,
  questId: string,
  nowMs: number
): ClaimQuestResult {
  const rolled = rolloverQuestState(state, nowMs);
  const def = getQuestDefinition(period, questId);
  if (!def) {
    return {
      state: rolled,
      claimed: false,
      coins: 0,
      xp: 0,
      error: `Unknown quest "${questId}" for period ${period}`,
    };
  }

  const periodMap = period === 'DAILY' ? rolled.daily : rolled.weekly;
  const entry = periodMap[questId];
  if (!entry) {
    return {
      state: rolled,
      claimed: false,
      coins: 0,
      xp: 0,
      error: `Quest progress entry not found for "${questId}"`,
    };
  }

  const periodDateKey = period === 'DAILY' ? rolled.dailyDateKey : rolled.weeklyStartKey;
  const ledgerKey = makeClaimLedgerKey(period, periodDateKey, questId);

  if (entry.claimed || rolled.recentClaimedKeys.includes(ledgerKey)) {
    return {
      state: rolled,
      claimed: false,
      coins: 0,
      xp: 0,
      error: `Quest "${questId}" reward has already been claimed`,
    };
  }

  if (entry.progress < entry.target) {
    return {
      state: rolled,
      claimed: false,
      coins: 0,
      xp: 0,
      error: `Quest "${questId}" target not yet reached (${entry.progress}/${entry.target})`,
    };
  }

  const updatedEntry: QuestProgress = {
    ...entry,
    completed: true,
    claimed: true,
    claimedAt: nowMs,
  };

  const nextRecentClaimedKeys = appendBoundedUnique(
    rolled.recentClaimedKeys,
    ledgerKey,
    MAX_RECENT_CLAIMED_KEYS
  );

  const nextState: QuestState =
    period === 'DAILY'
      ? {
          ...rolled,
          daily: { ...rolled.daily, [questId]: updatedEntry },
          recentClaimedKeys: nextRecentClaimedKeys,
        }
      : {
          ...rolled,
          weekly: { ...rolled.weekly, [questId]: updatedEntry },
          recentClaimedKeys: nextRecentClaimedKeys,
        };

  return {
    state: nextState,
    claimed: true,
    coins: def.rewardCoins,
    xp: def.rewardXp,
  };
}

export function countUnclaimed(state: QuestState, nowMs: number): number {
  const rolled = rolloverQuestState(state, nowMs);
  let count = 0;

  for (const def of getQuestDefinitionsByPeriod('DAILY')) {
    if (canClaim(rolled, 'DAILY', def.id, nowMs)) {
      count += 1;
    }
  }
  for (const def of getQuestDefinitionsByPeriod('WEEKLY')) {
    if (canClaim(rolled, 'WEEKLY', def.id, nowMs)) {
      count += 1;
    }
  }
  return count;
}

/**
 * Pure mapper from an authoritative SessionSnapshot to a QuestOutcomeDelta.
 * Strictly follows All-or-Nothing Quest progress rules (completed sessions only):
 * - Countdown / Pomodoro Countdown: ONLY COMPLETED qualifies; ABANDONED / INTERRUPTED -> null.
 * - Stopwatch: ONLY COMPLETED AND >= 5 valid focus minutes qualifies; < 5m / INTERRUPTED -> null.
 * - Pomodoro Stopwatch: ONLY COMPLETED AND completedFocusCount > 0 qualifies,
 *   counting strictly (completedFocusCount * intervalDuration) and excluding partial/in-progress intervals.
 *   INTERRUPTED (including BROWSER_CLOSED/EXTENSION_DISABLED) -> null.
 */
export function toQuestOutcomeDelta(
  session: SessionSnapshot | null | undefined,
  completedDateKey: string
): QuestOutcomeDelta | null {
  if (!session || !isValidDateKey(completedDateKey)) {
    return null;
  }

  if (session.status !== 'COMPLETED') {
    return null;
  }

  if (session.mode === 'COUNTDOWN') {
    const mins = Math.floor(Math.max(0, Number.isFinite(session.targetMinutes) ? session.targetMinutes : 0));
    if (mins <= 0) {
      return null;
    }
    return {
      completedDateKey,
      completedFocusMinutes: mins,
    };
  }

  if (session.mode === 'POMODORO_COUNTDOWN') {
    const stateMins = session.pomodoroState?.totalCompletedFocusMinutes;
    let mins =
      typeof stateMins === 'number' && Number.isFinite(stateMins) && stateMins > 0
        ? Math.floor(stateMins)
        : 0;

    if (mins <= 0) {
      const pConfig = session.pomodoroConfig;
      const intervalDuration =
        pConfig?.focusIntervalDurationMinutes ??
        pConfig?.focusDurationMinutes ??
        DEFAULT_POMODORO_CONFIG.focusIntervalDurationMinutes ??
        25;
      const intervalsPerCycle =
        pConfig?.focusIntervalsPerCycle ??
        pConfig?.targetFocusSessions ??
        DEFAULT_POMODORO_CONFIG.focusIntervalsPerCycle ??
        4;
      const cycles = pConfig?.numberOfCycles ?? DEFAULT_POMODORO_CONFIG.numberOfCycles ?? 3;
      const planned = intervalDuration * intervalsPerCycle * cycles;
      mins = planned > 0 ? Math.floor(planned) : Math.floor(Math.max(0, session.targetMinutes));
    }

    if (mins <= 0) {
      return null;
    }
    return {
      completedDateKey,
      completedFocusMinutes: mins,
    };
  }

  if (session.mode === 'POMODORO_STOPWATCH') {
    const completedCount = session.pomodoroState?.completedFocusCount ?? 0;
    if (!Number.isFinite(completedCount) || completedCount <= 0) {
      return null;
    }
    const pConfig = session.pomodoroConfig;
    const intervalDuration =
      pConfig?.focusIntervalDurationMinutes ??
      pConfig?.focusDurationMinutes ??
      DEFAULT_POMODORO_CONFIG.focusIntervalDurationMinutes ??
      DEFAULT_POMODORO_CONFIG.focusDurationMinutes ??
      25;
    if (!Number.isFinite(intervalDuration) || intervalDuration <= 0) {
      return null;
    }
    const completedFocusMinutes = Math.floor(completedCount) * Math.floor(intervalDuration);
    if (completedFocusMinutes <= 0) {
      return null;
    }
    return {
      completedDateKey,
      completedFocusMinutes,
    };
  }

  // STOPWATCH
  let validFocusMinutes = 0;
  if (
    typeof session.lastKnownValidFocusMinutes === 'number' &&
    Number.isFinite(session.lastKnownValidFocusMinutes)
  ) {
    validFocusMinutes = Math.floor(Math.max(0, session.lastKnownValidFocusMinutes));
  } else {
    const endTime = session.completedAt ?? session.lastHeartbeatAt;
    const elapsed = TimeCalculator.calculateElapsedTime({
      startedAt: session.startedAt,
      currentTime: endTime,
      status: 'COMPLETED',
      currentPauseStartedAt: null,
      totalCompletedPauseMs: session.totalPauseMs,
    });
    const checkpointMins =
      session.accumulatedFocusMs !== undefined
        ? Math.floor(
            (session.accumulatedFocusMs +
              Math.max(0, endTime - (session.lastCheckpointAt ?? session.startedAt))) /
              60000
          )
        : 0;
    validFocusMinutes = Math.max(elapsed.actualFocusMinutes, checkpointMins);
  }

  if (validFocusMinutes < DEFAULT_REWARD_CONFIG.stopwatchMinMinutesThreshold) {
    return null;
  }

  return {
    completedDateKey,
    completedFocusMinutes: validFocusMinutes,
  };
}
