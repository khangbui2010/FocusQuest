import {
  AwardCounters,
  AwardState,
  AwardTierUnlock,
  CURRENT_AWARDS_STATE_VERSION,
} from '../../types/awards.ts';
import { isValidDateKey } from '../stats/statsAggregator.ts';

export const MAX_STORED_PERFECT_DAY_KEYS = 90;

function toNonNegativeInt(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0) {
    return 0;
  }
  return Math.floor(raw);
}

function sanitizePerfectDayDateKeys(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const unique = new Set<string>();
  for (const item of raw) {
    if (isValidDateKey(item)) {
      unique.add(item);
    }
  }
  const sorted = Array.from(unique).sort();
  if (sorted.length > MAX_STORED_PERFECT_DAY_KEYS) {
    return sorted.slice(sorted.length - MAX_STORED_PERFECT_DAY_KEYS);
  }
  return sorted;
}

export function createInitialAwardCounters(): AwardCounters {
  return {
    longestSessionMinutes: 0,
    maxFocusStreakDays: 0,
    totalQuestsClaimed: 0,
    perfectDaysCount: 0,
    perfectDayDateKeys: [],
    totalBuildingsBuilt: 0,
  };
}

export function createInitialAwardState(): AwardState {
  return {
    version: CURRENT_AWARDS_STATE_VERSION,
    unlocked: {},
    counters: createInitialAwardCounters(),
  };
}

export function normalizeAwardCounters(raw: unknown): AwardCounters {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return createInitialAwardCounters();
  }
  const rec = raw as Partial<AwardCounters>;
  const perfectDayDateKeys = sanitizePerfectDayDateKeys(rec.perfectDayDateKeys);
  const rawPerfectDays = toNonNegativeInt(rec.perfectDaysCount);
  return {
    longestSessionMinutes: toNonNegativeInt(rec.longestSessionMinutes),
    maxFocusStreakDays: toNonNegativeInt(rec.maxFocusStreakDays),
    totalQuestsClaimed: toNonNegativeInt(rec.totalQuestsClaimed),
    perfectDaysCount: Math.max(rawPerfectDays, perfectDayDateKeys.length),
    perfectDayDateKeys,
    totalBuildingsBuilt: toNonNegativeInt(rec.totalBuildingsBuilt),
  };
}

export function sanitizeAwardState(raw: unknown): AwardState {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return createInitialAwardState();
  }

  const candidate = raw as Partial<AwardState>;
  const unlocked: Record<string, Record<number, AwardTierUnlock>> = {};

  if (
    candidate.unlocked &&
    typeof candidate.unlocked === 'object' &&
    !Array.isArray(candidate.unlocked)
  ) {
    for (const [awardId, tiersMap] of Object.entries(candidate.unlocked)) {
      if (
        typeof awardId !== 'string' ||
        awardId.trim().length === 0 ||
        !tiersMap ||
        typeof tiersMap !== 'object' ||
        Array.isArray(tiersMap)
      ) {
        continue;
      }

      const cleanTiers: Record<number, AwardTierUnlock> = {};
      for (const [rawTierKey, rawUnlock] of Object.entries(tiersMap)) {
        const tierNum = Number(rawTierKey);
        if (
          !Number.isInteger(tierNum) ||
          tierNum < 1 ||
          !rawUnlock ||
          typeof rawUnlock !== 'object' ||
          Array.isArray(rawUnlock)
        ) {
          continue;
        }
        const entry = rawUnlock as Partial<AwardTierUnlock>;
        const unlockedAt =
          typeof entry.unlockedAt === 'number' &&
          Number.isFinite(entry.unlockedAt) &&
          entry.unlockedAt >= 0
            ? Math.floor(entry.unlockedAt)
            : 0;
        cleanTiers[tierNum] = {
          unlockedAt,
          seen: Boolean(entry.seen),
        };
      }

      if (Object.keys(cleanTiers).length > 0) {
        unlocked[awardId] = cleanTiers;
      }
    }
  }

  return {
    version:
      typeof candidate.version === 'number' &&
      Number.isInteger(candidate.version) &&
      candidate.version >= 1
        ? candidate.version
        : CURRENT_AWARDS_STATE_VERSION,
    unlocked,
    counters: normalizeAwardCounters(candidate.counters),
  };
}

export function recordPerfectDayInCounters(
  counters: AwardCounters,
  dateKey: string
): AwardCounters {
  if (!isValidDateKey(dateKey)) {
    return counters;
  }
  if (counters.perfectDayDateKeys.includes(dateKey)) {
    return counters;
  }
  const nextKeys = sanitizePerfectDayDateKeys([...counters.perfectDayDateKeys, dateKey]);
  return {
    ...counters,
    perfectDaysCount: counters.perfectDaysCount + 1,
    perfectDayDateKeys: nextKeys,
  };
}
