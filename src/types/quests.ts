/**
 * Domain types for Focus Quest Daily & Weekly Quest system (Milestone 5B.5 + Milestone 5D-1 Quest Pool).
 * Pure domain schema only; rewards are flat (unaffected by Multiplier or CoinBonus).
 */

export type QuestPeriod = 'DAILY' | 'WEEKLY';

export type QuestSlot = 'A' | 'B' | 'C';

export const QUEST_SLOTS: readonly QuestSlot[] = ['A', 'B', 'C'] as const;

export type QuestDifficulty = 'standard' | 'hard';

export type QuestMetric =
  | 'COMPLETED_SESSIONS'
  | 'FOCUS_MINUTES'
  | 'ACTIVE_DAYS'
  | 'DEEP_SESSIONS'
  | 'POMODORO_FOCUS_INTERVALS';

export const CURRENT_QUEST_STATE_VERSION = 2;
export const MAX_RECENT_CLAIMED_KEYS = 14;
export const MAX_PROCESSED_PERIOD_KEYS = 14;

export interface QuestDefinition {
  readonly id: string;
  readonly period: QuestPeriod;
  readonly slot: QuestSlot;
  readonly metric: QuestMetric;
  readonly target: number;
  readonly minSessionMinutes?: number;
  readonly minDailyMinutes?: number;
  readonly difficulty?: QuestDifficulty;
  readonly rewardCoins: number;
  readonly rewardXp: number;
  readonly titleKey: string;
  readonly descriptionKey: string;
}

export interface QuestProgress {
  readonly questId: string;
  readonly period: QuestPeriod;
  readonly progress: number;
  readonly target: number;
  readonly completed: boolean;
  readonly claimed: boolean;
  readonly claimedAt: number | null;
}

export interface QuestStreak {
  readonly currentDays: number;
  readonly longestDays: number;
  readonly lastCompletedDateKey: string | null;
}

export interface QuestState {
  readonly schemaVersion: number;
  readonly dailyDateKey: string;
  readonly weeklyStartKey: string;
  readonly daily: Record<string, QuestProgress>;
  readonly weekly: Record<string, QuestProgress>;
  readonly weeklyActiveDateKeys: readonly string[];
  readonly weeklyDailyMinutes?: Readonly<Record<string, number>>;
  readonly salt?: string;
  readonly dailyPreviousSelection?: readonly string[];
  readonly weeklyPreviousSelection?: readonly string[];
  readonly streak: QuestStreak;
  readonly lastSettledTimestamp: number;
  readonly processedPeriodKeys: readonly string[];
  readonly recentClaimedKeys: readonly string[];
}

export interface QuestOutcomeDelta {
  readonly completedDateKey: string;
  readonly completedFocusMinutes: number;
  readonly pomodoroCompletedIntervals?: number;
}

export interface QuestResetCountdown {
  readonly dailyResetInMs: number;
  readonly weeklyResetInMs: number;
  readonly nextDailyDateKey: string;
  readonly nextWeeklyStartKey: string;
}

export interface ClaimQuestResult {
  readonly state: QuestState;
  readonly claimed: boolean;
  readonly coins: number;
  readonly xp: number;
  readonly error?: string;
}

export type QuestErrorCode =
  | 'INVALID_QUEST_PAYLOAD'
  | 'UNKNOWN_QUEST'
  | 'QUEST_PERIOD_MISMATCH'
  | 'QUEST_NOT_COMPLETED'
  | 'QUEST_ALREADY_CLAIMED'
  | 'QUEST_EXPIRED';
