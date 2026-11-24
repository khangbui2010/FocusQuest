import {
  ClaimQuestResult,
  CURRENT_QUEST_STATE_VERSION,
  MAX_PROCESSED_PERIOD_KEYS,
  MAX_RECENT_CLAIMED_KEYS,
  QUEST_SLOTS,
  QuestDefinition,
  QuestOutcomeDelta,
  QuestPeriod,
  QuestProgress,
  QuestSlot,
  QuestState,
  QuestStreak,
} from '../../types/quests.ts';
import { DEFAULT_POMODORO_CONFIG, SessionSnapshot } from '../../types/session.ts';
import { DEFAULT_REWARD_CONFIG } from '../reward/rewardEngine.ts';
import { isValidDateKey } from '../stats/statsAggregator.ts';
import { TimeCalculator } from '../timer/timeCalculator.ts';
import {
  getLegacyQuestDefinitionsByPeriod,
  getQuestDefinition,
  getSlotDefinitions,
} from './questCatalog.ts';
import {
  diffDateKeys,
  formatLocalDateKey,
  getLocalWeekStartKeyFromDateKey,
} from './questDates.ts';

export interface CreateInitialQuestStateOptions {
  readonly salt?: string;
  readonly rng?: () => number;
  readonly useLegacySelection?: boolean;
}

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

/**
 * Pure 32-bit FNV-1a + Murmur3 finalizer hash for uniform, deterministic Quest Pool seeding.
 * Zero wall-clock or PRNG side effects.
 */
export function hashQuestSeed(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35);
  hash ^= hash >>> 16;
  return hash >>> 0;
}

export function deriveDeterministicSalt(seedSource: string): string {
  const partA = hashQuestSeed(`fq-salt-a:${seedSource}`).toString(16).padStart(8, '0');
  const partB = hashQuestSeed(`fq-salt-b:${seedSource}`).toString(16).padStart(8, '0');
  return `${partA}${partB}`;
}

export function generateSaltWithRng(rng: () => number): string {
  const clampWord = (raw: number): number => {
    if (typeof raw !== 'number' || !Number.isFinite(raw)) return 0;
    const frac = raw - Math.floor(raw);
    return Math.floor(Math.max(0, Math.min(0.999999999, frac)) * 0x100000000) >>> 0;
  };
  const partA = clampWord(rng()).toString(16).padStart(8, '0');
  const partB = clampWord(rng()).toString(16).padStart(8, '0');
  return `${partA}${partB}`;
}

/**
 * Deterministically selects exactly 1 quest per slot (A, B, C) for a given periodKey & install salt.
 * Avoids repeating the immediately preceding period's quest in any slot with >= 2 candidates.
 */
export function selectQuestsForPeriod(
  period: QuestPeriod,
  periodKey: string,
  salt: string,
  previousSelection?: readonly string[]
): readonly QuestDefinition[] {
  const prevSet = new Set(previousSelection ?? []);
  const selected: QuestDefinition[] = [];

  for (const slot of QUEST_SLOTS) {
    const slotPool = getSlotDefinitions(period, slot);
    if (slotPool.length === 0) {
      continue;
    }
    const nonRepeating =
      slotPool.length >= 2 && prevSet.size > 0
        ? slotPool.filter((def) => !prevSet.has(def.id))
        : slotPool;
    const candidates = nonRepeating.length > 0 ? nonRepeating : slotPool;

    const hash = hashQuestSeed(`${salt}|${period}|${periodKey}|slot:${slot}`);
    const chosen = candidates[hash % candidates.length];
    selected.push(chosen);
  }

  return selected;
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

function sanitizePreviousSelection(
  period: QuestPeriod,
  raw: unknown
): readonly string[] | undefined {
  if (!Array.isArray(raw)) {
    return undefined;
  }
  const validIds: string[] = [];
  for (const item of raw) {
    if (typeof item === 'string' && getQuestDefinition(period, item) && !validIds.includes(item)) {
      validIds.push(item);
      if (validIds.length >= QUEST_SLOTS.length) {
        break;
      }
    }
  }
  return validIds;
}

function makeFreshProgress(def: QuestDefinition): QuestProgress {
  return {
    questId: def.id,
    period: def.period,
    progress: 0,
    target: def.target,
    completed: false,
    claimed: false,
    claimedAt: null,
  };
}

export function createPeriodProgressRecordFromDefinitions(
  definitions: readonly QuestDefinition[]
): Record<string, QuestProgress> {
  const result: Record<string, QuestProgress> = {};
  for (const def of definitions) {
    result[def.id] = makeFreshProgress(def);
  }
  return result;
}

export function createPeriodProgressRecord(
  period: QuestPeriod,
  options?: { periodKey?: string; salt?: string; previousSelection?: readonly string[]; legacy?: boolean }
): Record<string, QuestProgress> {
  if (options?.legacy) {
    return createPeriodProgressRecordFromDefinitions(getLegacyQuestDefinitionsByPeriod(period));
  }
  if (options?.periodKey && options?.salt) {
    return createPeriodProgressRecordFromDefinitions(
      selectQuestsForPeriod(period, options.periodKey, options.salt, options.previousSelection)
    );
  }
  return createPeriodProgressRecordFromDefinitions(getLegacyQuestDefinitionsByPeriod(period));
}

function sanitizeProgressEntry(
  def: QuestDefinition,
  rawEntryInput: unknown
): QuestProgress {
  const rawEntry =
    typeof rawEntryInput === 'object' && rawEntryInput !== null && !Array.isArray(rawEntryInput)
      ? (rawEntryInput as Record<string, unknown>)
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

  return {
    questId: def.id,
    period: def.period,
    progress,
    target: def.target,
    completed,
    claimed,
    claimedAt,
  };
}

function sanitizePeriodProgressRecord(
  period: QuestPeriod,
  rawRecord: unknown,
  periodKey: string,
  salt: string,
  previousSelection?: readonly string[]
): Record<string, QuestProgress> {
  const source =
    typeof rawRecord === 'object' && rawRecord !== null && !Array.isArray(rawRecord)
      ? (rawRecord as Record<string, unknown>)
      : {};

  // Pick at most 1 valid active quest per slot (A, B, C) from rawRecord
  const bySlot: Partial<Record<QuestSlot, QuestProgress>> = {};
  for (const key of Object.keys(source)) {
    const def = getQuestDefinition(period, key);
    if (!def) continue;
    if (!bySlot[def.slot]) {
      bySlot[def.slot] = sanitizeProgressEntry(def, source[key]);
    }
  }

  // Fill any missing slots deterministically so active state ALWAYS contains strictly 1 quest per slot (A, B, C)
  const missingNeeded = QUEST_SLOTS.some((slot) => !bySlot[slot]);
  if (missingNeeded) {
    const fallbackSelected = selectQuestsForPeriod(period, periodKey, salt, previousSelection);
    for (const def of fallbackSelected) {
      if (!bySlot[def.slot]) {
        bySlot[def.slot] = makeFreshProgress(def);
      }
    }
  }

  // Emit keys in deterministic slot order A -> B -> C
  const result: Record<string, QuestProgress> = {};
  for (const slot of QUEST_SLOTS) {
    const entry = bySlot[slot];
    if (entry) {
      result[entry.questId] = entry;
    }
  }
  return result;
}

function sanitizeWeeklyDailyMinutes(
  raw: unknown,
  weeklyStartKey: string
): Record<string, number> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return {};
  }
  const source = raw as Record<string, unknown>;
  const cleaned: Record<string, number> = {};
  for (const key of Object.keys(source).sort()) {
    if (!isValidDateKey(key) || getLocalWeekStartKeyFromDateKey(key) !== weeklyStartKey) {
      continue;
    }
    const rawVal = source[key];
    if (typeof rawVal === 'number' && Number.isFinite(rawVal) && rawVal > 0) {
      cleaned[key] = Math.floor(rawVal);
    }
  }
  return cleaned;
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

/**
 * Resolves active QuestDefinitions for a period directly from QuestState keys,
 * sorted strictly in Slot order (A -> B -> C).
 */
export function getActiveQuestDefinitions(
  period: QuestPeriod,
  state: Pick<QuestState, 'daily' | 'weekly'>
): readonly QuestDefinition[] {
  const record = period === 'DAILY' ? state.daily : state.weekly;
  if (!record || typeof record !== 'object') {
    return [];
  }
  const bySlot: Partial<Record<QuestSlot, QuestDefinition>> = {};
  for (const questId of Object.keys(record)) {
    const def = getQuestDefinition(period, questId);
    if (def && !bySlot[def.slot]) {
      bySlot[def.slot] = def;
    }
  }
  const ordered: QuestDefinition[] = [];
  for (const slot of QUEST_SLOTS) {
    const def = bySlot[slot];
    if (def) {
      ordered.push(def);
    }
  }
  return ordered;
}

export function createInitialQuestState(
  nowMs: number,
  options?: CreateInitialQuestStateOptions
): QuestState {
  const dailyDateKey = formatLocalDateKey(nowMs);
  const weeklyStartKey = getLocalWeekStartKeyFromDateKey(dailyDateKey);

  const providedSalt =
    typeof options?.salt === 'string' && options.salt.trim().length > 0
      ? options.salt.trim()
      : undefined;
  const salt = providedSalt
    ? providedSalt
    : options?.rng
    ? generateSaltWithRng(options.rng)
    : deriveDeterministicSalt(`init:${dailyDateKey}:${weeklyStartKey}:${nowMs}`);

  const daily = createPeriodProgressRecord('DAILY', {
    periodKey: dailyDateKey,
    salt,
    legacy: options?.useLegacySelection,
  });
  const weekly = createPeriodProgressRecord('WEEKLY', {
    periodKey: weeklyStartKey,
    salt,
    legacy: options?.useLegacySelection,
  });

  return {
    schemaVersion: CURRENT_QUEST_STATE_VERSION,
    dailyDateKey,
    weeklyStartKey,
    daily,
    weekly,
    weeklyActiveDateKeys: [],
    weeklyDailyMinutes: {},
    salt,
    dailyPreviousSelection: [],
    weeklyPreviousSelection: [],
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

  const lastSettledTimestamp =
    typeof r.lastSettledTimestamp === 'number' &&
    Number.isFinite(r.lastSettledTimestamp) &&
    r.lastSettledTimestamp >= 0
      ? r.lastSettledTimestamp
      : Math.max(0, nowMs);

  const rawSalt =
    typeof r.salt === 'string' && r.salt.trim().length > 0 && r.salt.trim().length <= 64
      ? r.salt.trim()
      : undefined;
  const salt =
    rawSalt ?? deriveDeterministicSalt(`legacy:${dailyDateKey}:${weeklyStartKey}:${lastSettledTimestamp}`);

  const dailyPreviousSelection = sanitizePreviousSelection('DAILY', r.dailyPreviousSelection) ?? [];
  const weeklyPreviousSelection = sanitizePreviousSelection('WEEKLY', r.weeklyPreviousSelection) ?? [];

  const daily = sanitizePeriodProgressRecord(
    'DAILY',
    r.daily,
    dailyDateKey,
    salt,
    dailyPreviousSelection
  );
  const weekly = sanitizePeriodProgressRecord(
    'WEEKLY',
    r.weekly,
    weeklyStartKey,
    salt,
    weeklyPreviousSelection
  );

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

  const weeklyDailyMinutes = sanitizeWeeklyDailyMinutes(r.weeklyDailyMinutes, weeklyStartKey);

  // Keep any active ACTIVE_DAYS weekly quest consistent with sanitized active days / daily minutes
  for (const questId of Object.keys(weekly)) {
    const def = getQuestDefinition('WEEKLY', questId);
    if (!def || def.metric !== 'ACTIVE_DAYS') continue;

    const qualifyingDays =
      def.minDailyMinutes && def.minDailyMinutes > 0
        ? Object.values(weeklyDailyMinutes).filter((m) => m >= def.minDailyMinutes!).length
        : weeklyActiveDateKeys.length;
    const syncedProgress = Math.min(
      def.target,
      Math.max(weekly[questId].progress, qualifyingDays)
    );
    weekly[questId] = {
      ...weekly[questId],
      progress: syncedProgress,
      completed: syncedProgress >= def.target,
    };
  }

  const streak = sanitizeStreak(r.streak);

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
    weeklyDailyMinutes,
    salt,
    dailyPreviousSelection,
    weeklyPreviousSelection,
    streak,
    lastSettledTimestamp,
    processedPeriodKeys,
    recentClaimedKeys,
  };
}

/**
 * Advances daily/weekly periods forward when wall clock enters a new local day or Monday.
 * Selects fresh 1-per-slot quests deterministically from the pool without repeating the previous period's quests.
 * Strictly guards against system clock rollback:
 * - Never resets progress or swaps/rerolls quests on clock rollback or repeated wakeups.
 * - Preserves unclaimed rewards within the active period; expires unclaimed rewards when rolling forward.
 */
export function rolloverQuestState(state: QuestState, nowMs: number): QuestState {
  const safe = sanitizeQuestState(state, nowMs);
  const nowDateKey = formatLocalDateKey(nowMs);
  const nowWeekKey = getLocalWeekStartKeyFromDateKey(nowDateKey);
  const isClockForwardOrSame = nowMs >= safe.lastSettledTimestamp;
  const salt =
    safe.salt ??
    deriveDeterministicSalt(
      `legacy:${safe.dailyDateKey}:${safe.weeklyStartKey}:${safe.lastSettledTimestamp}`
    );

  let nextDailyDateKey = safe.dailyDateKey;
  let nextDaily = safe.daily;
  let nextDailyPreviousSelection = safe.dailyPreviousSelection ?? [];

  let nextWeeklyStartKey = safe.weeklyStartKey;
  let nextWeekly = safe.weekly;
  let nextWeeklyActiveDateKeys = safe.weeklyActiveDateKeys;
  let nextWeeklyDailyMinutes = safe.weeklyDailyMinutes ?? {};
  let nextWeeklyPreviousSelection = safe.weeklyPreviousSelection ?? [];
  let nextProcessedPeriodKeys = safe.processedPeriodKeys;

  const nextDailyPeriodKey = makePeriodKey('DAILY', nowDateKey);
  if (
    isClockForwardOrSame &&
    nowDateKey > safe.dailyDateKey &&
    !safe.processedPeriodKeys.includes(nextDailyPeriodKey)
  ) {
    const previousIds = Object.keys(safe.daily);
    const selectedDaily = selectQuestsForPeriod('DAILY', nowDateKey, salt, previousIds);
    nextDailyDateKey = nowDateKey;
    nextDaily = createPeriodProgressRecordFromDefinitions(selectedDaily);
    nextDailyPreviousSelection = previousIds;
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
    const previousIds = Object.keys(safe.weekly);
    const selectedWeekly = selectQuestsForPeriod('WEEKLY', nowWeekKey, salt, previousIds);
    nextWeeklyStartKey = nowWeekKey;
    nextWeekly = createPeriodProgressRecordFromDefinitions(selectedWeekly);
    nextWeeklyActiveDateKeys = [];
    nextWeeklyDailyMinutes = {};
    nextWeeklyPreviousSelection = previousIds;
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
    salt,
    dailyDateKey: nextDailyDateKey,
    weeklyStartKey: nextWeeklyStartKey,
    daily: nextDaily,
    weekly: nextWeekly,
    dailyPreviousSelection: nextDailyPreviousSelection,
    weeklyPreviousSelection: nextWeeklyPreviousSelection,
    weeklyActiveDateKeys: nextWeeklyActiveDateKeys,
    weeklyDailyMinutes: nextWeeklyDailyMinutes,
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

  const pomodoroIntervals =
    typeof delta.pomodoroCompletedIntervals === 'number' &&
    Number.isFinite(delta.pomodoroCompletedIntervals) &&
    delta.pomodoroCompletedIntervals > 0
      ? Math.floor(delta.pomodoroCompletedIntervals)
      : 0;

  // Daily quest progress applies strictly to currently active daily quests
  let nextDaily = rolled.daily;
  if (completedDateKey === rolled.dailyDateKey) {
    const updatedDaily: Record<string, QuestProgress> = { ...rolled.daily };
    for (const def of getActiveQuestDefinitions('DAILY', rolled)) {
      const current = updatedDaily[def.id] ?? makeFreshProgress(def);
      let increment = 0;
      if (def.metric === 'COMPLETED_SESSIONS') {
        increment = 1;
      } else if (def.metric === 'FOCUS_MINUTES') {
        increment = completedMinutes;
      } else if (def.metric === 'DEEP_SESSIONS') {
        const minMins = def.minSessionMinutes ?? 45;
        if (completedMinutes >= minMins) {
          increment = 1;
        }
      } else if (def.metric === 'POMODORO_FOCUS_INTERVALS') {
        increment = pomodoroIntervals;
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

  // Weekly quest progress applies strictly to currently active weekly quests in the active Monday week
  let nextWeekly = rolled.weekly;
  let nextWeeklyActiveDateKeys = rolled.weeklyActiveDateKeys;
  let nextWeeklyDailyMinutes = rolled.weeklyDailyMinutes ?? {};
  const completedWeekKey = getLocalWeekStartKeyFromDateKey(completedDateKey);
  if (completedWeekKey === rolled.weeklyStartKey) {
    if (!rolled.weeklyActiveDateKeys.includes(completedDateKey)) {
      nextWeeklyActiveDateKeys = [...rolled.weeklyActiveDateKeys, completedDateKey].sort();
    }
    nextWeeklyDailyMinutes = {
      ...nextWeeklyDailyMinutes,
      [completedDateKey]: (nextWeeklyDailyMinutes[completedDateKey] ?? 0) + completedMinutes,
    };

    const updatedWeekly: Record<string, QuestProgress> = { ...rolled.weekly };
    for (const def of getActiveQuestDefinitions('WEEKLY', rolled)) {
      const current = updatedWeekly[def.id] ?? makeFreshProgress(def);
      let progress = current.progress;

      if (def.metric === 'ACTIVE_DAYS') {
        const qualifyingDays =
          def.minDailyMinutes && def.minDailyMinutes > 0
            ? Object.values(nextWeeklyDailyMinutes).filter((m) => m >= def.minDailyMinutes!).length
            : nextWeeklyActiveDateKeys.length;
        progress = Math.min(def.target, Math.max(current.progress, qualifyingDays));
      } else if (def.metric === 'DEEP_SESSIONS') {
        const minMins = def.minSessionMinutes ?? 45;
        if (completedMinutes >= minMins) {
          progress = Math.min(def.target, current.progress + 1);
        }
      } else if (def.metric === 'COMPLETED_SESSIONS') {
        progress = Math.min(def.target, current.progress + 1);
      } else if (def.metric === 'FOCUS_MINUTES') {
        progress = Math.min(def.target, current.progress + completedMinutes);
      } else if (def.metric === 'POMODORO_FOCUS_INTERVALS' && pomodoroIntervals > 0) {
        progress = Math.min(def.target, current.progress + pomodoroIntervals);
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
    weeklyDailyMinutes: nextWeeklyDailyMinutes,
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

  for (const questId of Object.keys(rolled.daily)) {
    if (canClaim(rolled, 'DAILY', questId, nowMs)) {
      count += 1;
    }
  }
  for (const questId of Object.keys(rolled.weekly)) {
    if (canClaim(rolled, 'WEEKLY', questId, nowMs)) {
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
    const mins = Math.floor(
      Math.max(0, Number.isFinite(session.targetMinutes) ? session.targetMinutes : 0)
    );
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

    const pConfig = session.pomodoroConfig;
    const intervalsPerCycle =
      pConfig?.focusIntervalsPerCycle ??
      pConfig?.targetFocusSessions ??
      DEFAULT_POMODORO_CONFIG.focusIntervalsPerCycle ??
      4;
    const cycles = pConfig?.numberOfCycles ?? DEFAULT_POMODORO_CONFIG.numberOfCycles ?? 3;
    const stateIntervals = session.pomodoroState?.completedFocusCount;
    const pomodoroCompletedIntervals =
      typeof stateIntervals === 'number' && Number.isFinite(stateIntervals) && stateIntervals > 0
        ? Math.floor(stateIntervals)
        : Math.max(1, Math.floor(intervalsPerCycle * cycles));

    if (mins <= 0) {
      const intervalDuration =
        pConfig?.focusIntervalDurationMinutes ??
        pConfig?.focusDurationMinutes ??
        DEFAULT_POMODORO_CONFIG.focusIntervalDurationMinutes ??
        25;
      const planned = intervalDuration * intervalsPerCycle * cycles;
      mins = planned > 0 ? Math.floor(planned) : Math.floor(Math.max(0, session.targetMinutes));
    }

    if (mins <= 0) {
      return null;
    }
    return {
      completedDateKey,
      completedFocusMinutes: mins,
      pomodoroCompletedIntervals,
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
    const pomodoroCompletedIntervals = Math.floor(completedCount);
    const completedFocusMinutes = pomodoroCompletedIntervals * Math.floor(intervalDuration);
    if (completedFocusMinutes <= 0) {
      return null;
    }
    return {
      completedDateKey,
      completedFocusMinutes,
      pomodoroCompletedIntervals,
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
