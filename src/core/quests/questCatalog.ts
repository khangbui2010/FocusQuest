import { QuestDefinition, QuestPeriod, QuestSlot } from '../../types/quests.ts';

export const DAILY_QUEST_CAP = {
  coins: 40,
  xp: 100,
} as const;

export const WEEKLY_QUEST_CAP = {
  coins: 150,
  xp: 370,
} as const;

export const DAILY_SLOT_REWARDS: Record<
  QuestSlot,
  { readonly rewardCoins: number; readonly rewardXp: number }
> = {
  A: { rewardCoins: 10, rewardXp: 25 },
  B: { rewardCoins: 15, rewardXp: 35 },
  C: { rewardCoins: 15, rewardXp: 40 },
} as const;

export const WEEKLY_SLOT_REWARDS: Record<
  QuestSlot,
  { readonly rewardCoins: number; readonly rewardXp: number }
> = {
  A: { rewardCoins: 50, rewardXp: 120 },
  B: { rewardCoins: 60, rewardXp: 150 },
  C: { rewardCoins: 40, rewardXp: 100 },
} as const;

export const LEGACY_DAILY_QUEST_IDS = [
  'daily_first_spark',
  'daily_steady_rhythm',
  'daily_double_tap',
] as const;

export const LEGACY_WEEKLY_QUEST_IDS = [
  'weekly_habit_builder',
  'weekly_deep_diver',
  'weekly_tenacity_10',
] as const;

/**
 * Daily Quest Pool (Milestone 5D-1):
 * - Slot A ("Starter"): 10 Coins · 25 XP (all completable by 1x60m)
 * - Slot B ("Pace"): 15 Coins · 35 XP (all completable by 1x60m; replaces 2x30m with 1x60m deep hour)
 * - Slot C ("Challenge"): 15 Coins · 40 XP (depth / discipline challenges)
 */
export const DAILY_QUEST_DEFINITIONS: readonly QuestDefinition[] = [
  // Slot A — Starter (10 Coins · 25 XP)
  {
    id: 'daily_first_spark',
    period: 'DAILY',
    slot: 'A',
    metric: 'COMPLETED_SESSIONS',
    target: 1,
    difficulty: 'standard',
    rewardCoins: 10,
    rewardXp: 25,
    titleKey: 'quests.daily.firstSpark.title',
    descriptionKey: 'quests.daily.firstSpark.desc',
  },
  {
    id: 'daily_warm_up',
    period: 'DAILY',
    slot: 'A',
    metric: 'DEEP_SESSIONS',
    target: 1,
    minSessionMinutes: 25,
    difficulty: 'standard',
    rewardCoins: 10,
    rewardXp: 25,
    titleKey: 'quests.daily.warmUp.title',
    descriptionKey: 'quests.daily.warmUp.desc',
  },
  {
    id: 'daily_quick_start',
    period: 'DAILY',
    slot: 'A',
    metric: 'FOCUS_MINUTES',
    target: 25,
    difficulty: 'standard',
    rewardCoins: 10,
    rewardXp: 25,
    titleKey: 'quests.daily.quickStart.title',
    descriptionKey: 'quests.daily.quickStart.desc',
  },

  // Slot B — Pace (15 Coins · 35 XP)
  {
    id: 'daily_steady_rhythm',
    period: 'DAILY',
    slot: 'B',
    metric: 'FOCUS_MINUTES',
    target: 60,
    difficulty: 'standard',
    rewardCoins: 15,
    rewardXp: 35,
    titleKey: 'quests.daily.steadyRhythm.title',
    descriptionKey: 'quests.daily.steadyRhythm.desc',
  },
  {
    id: 'daily_forty_five',
    period: 'DAILY',
    slot: 'B',
    metric: 'FOCUS_MINUTES',
    target: 45,
    difficulty: 'standard',
    rewardCoins: 15,
    rewardXp: 35,
    titleKey: 'quests.daily.fortyFive.title',
    descriptionKey: 'quests.daily.fortyFive.desc',
  },
  {
    id: 'daily_deep_hour',
    period: 'DAILY',
    slot: 'B',
    metric: 'DEEP_SESSIONS',
    target: 1,
    minSessionMinutes: 60,
    difficulty: 'standard',
    rewardCoins: 15,
    rewardXp: 35,
    titleKey: 'quests.daily.deepHour.title',
    descriptionKey: 'quests.daily.deepHour.desc',
  },

  // Slot C — Challenge (15 Coins · 40 XP)
  {
    id: 'daily_double_tap',
    period: 'DAILY',
    slot: 'C',
    metric: 'COMPLETED_SESSIONS',
    target: 2,
    difficulty: 'standard',
    rewardCoins: 15,
    rewardXp: 40,
    titleKey: 'quests.daily.doubleTap.title',
    descriptionKey: 'quests.daily.doubleTap.desc',
  },
  {
    id: 'daily_deep_dive',
    period: 'DAILY',
    slot: 'C',
    metric: 'DEEP_SESSIONS',
    target: 1,
    minSessionMinutes: 45,
    difficulty: 'standard',
    rewardCoins: 15,
    rewardXp: 40,
    titleKey: 'quests.daily.deepDive.title',
    descriptionKey: 'quests.daily.deepDive.desc',
  },
  {
    id: 'daily_pomodoro_pair',
    period: 'DAILY',
    slot: 'C',
    metric: 'POMODORO_FOCUS_INTERVALS',
    target: 2,
    difficulty: 'standard',
    rewardCoins: 15,
    rewardXp: 40,
    titleKey: 'quests.daily.pomodoroPair.title',
    descriptionKey: 'quests.daily.pomodoroPair.desc',
  },
] as const;

/**
 * Weekly Quest Pool (Milestone 5D-1):
 * - Slot A ("Consistency"): 50 Coins · 120 XP (all completable by 1x60m x 7d)
 * - Slot B ("Depth"): 60 Coins · 150 XP (all completable by 1x60m x 7d)
 * - Slot C ("Volume"): 40 Coins · 100 XP (3 standard choices completable by 1x60m x 7d + 1 legacy 'hard' quest)
 */
export const WEEKLY_QUEST_DEFINITIONS: readonly QuestDefinition[] = [
  // Slot A — Consistency (50 Coins · 120 XP)
  {
    id: 'weekly_habit_builder',
    period: 'WEEKLY',
    slot: 'A',
    metric: 'ACTIVE_DAYS',
    target: 4,
    difficulty: 'standard',
    rewardCoins: 50,
    rewardXp: 120,
    titleKey: 'quests.weekly.habitBuilder.title',
    descriptionKey: 'quests.weekly.habitBuilder.desc',
  },
  {
    id: 'weekly_five_days',
    period: 'WEEKLY',
    slot: 'A',
    metric: 'ACTIVE_DAYS',
    target: 5,
    difficulty: 'standard',
    rewardCoins: 50,
    rewardXp: 120,
    titleKey: 'quests.weekly.fiveDays.title',
    descriptionKey: 'quests.weekly.fiveDays.desc',
  },
  {
    id: 'weekly_three_days',
    period: 'WEEKLY',
    slot: 'A',
    metric: 'ACTIVE_DAYS',
    target: 3,
    minDailyMinutes: 25,
    difficulty: 'standard',
    rewardCoins: 50,
    rewardXp: 120,
    titleKey: 'quests.weekly.threeDays.title',
    descriptionKey: 'quests.weekly.threeDays.desc',
  },

  // Slot B — Depth (60 Coins · 150 XP)
  {
    id: 'weekly_deep_diver',
    period: 'WEEKLY',
    slot: 'B',
    metric: 'DEEP_SESSIONS',
    target: 3,
    minSessionMinutes: 45,
    difficulty: 'standard',
    rewardCoins: 60,
    rewardXp: 150,
    titleKey: 'quests.weekly.deepDiver.title',
    descriptionKey: 'quests.weekly.deepDiver.desc',
  },
  {
    id: 'weekly_two_long_60',
    period: 'WEEKLY',
    slot: 'B',
    metric: 'DEEP_SESSIONS',
    target: 2,
    minSessionMinutes: 60,
    difficulty: 'standard',
    rewardCoins: 60,
    rewardXp: 150,
    titleKey: 'quests.weekly.twoLong60.title',
    descriptionKey: 'quests.weekly.twoLong60.desc',
  },
  {
    id: 'weekly_five_half_hour',
    period: 'WEEKLY',
    slot: 'B',
    metric: 'DEEP_SESSIONS',
    target: 5,
    minSessionMinutes: 30,
    difficulty: 'standard',
    rewardCoins: 60,
    rewardXp: 150,
    titleKey: 'quests.weekly.fiveHalfHour.title',
    descriptionKey: 'quests.weekly.fiveHalfHour.desc',
  },

  // Slot C — Volume (40 Coins · 100 XP)
  {
    id: 'weekly_tenacity_10',
    period: 'WEEKLY',
    slot: 'C',
    metric: 'COMPLETED_SESSIONS',
    target: 10,
    difficulty: 'hard',
    rewardCoins: 40,
    rewardXp: 100,
    titleKey: 'quests.weekly.tenacity.title',
    descriptionKey: 'quests.weekly.tenacity.desc',
  },
  {
    id: 'weekly_six_sessions',
    period: 'WEEKLY',
    slot: 'C',
    metric: 'COMPLETED_SESSIONS',
    target: 6,
    difficulty: 'standard',
    rewardCoins: 40,
    rewardXp: 100,
    titleKey: 'quests.weekly.sixSessions.title',
    descriptionKey: 'quests.weekly.sixSessions.desc',
  },
  {
    id: 'weekly_seven_sessions',
    period: 'WEEKLY',
    slot: 'C',
    metric: 'COMPLETED_SESSIONS',
    target: 7,
    difficulty: 'standard',
    rewardCoins: 40,
    rewardXp: 100,
    titleKey: 'quests.weekly.sevenSessions.title',
    descriptionKey: 'quests.weekly.sevenSessions.desc',
  },
  {
    id: 'weekly_three_hundred_minutes',
    period: 'WEEKLY',
    slot: 'C',
    metric: 'FOCUS_MINUTES',
    target: 300,
    difficulty: 'standard',
    rewardCoins: 40,
    rewardXp: 100,
    titleKey: 'quests.weekly.threeHundredMinutes.title',
    descriptionKey: 'quests.weekly.threeHundredMinutes.desc',
  },
] as const;

export const DAILY_QUEST_POOL = DAILY_QUEST_DEFINITIONS;
export const WEEKLY_QUEST_POOL = WEEKLY_QUEST_DEFINITIONS;

export const ALL_QUEST_DEFINITIONS: readonly QuestDefinition[] = [
  ...DAILY_QUEST_DEFINITIONS,
  ...WEEKLY_QUEST_DEFINITIONS,
] as const;

export function getQuestDefinitionsByPeriod(period: QuestPeriod): readonly QuestDefinition[] {
  return period === 'DAILY' ? DAILY_QUEST_DEFINITIONS : WEEKLY_QUEST_DEFINITIONS;
}

export function getSlotDefinitions(
  period: QuestPeriod,
  slot: QuestSlot
): readonly QuestDefinition[] {
  return getQuestDefinitionsByPeriod(period).filter((def) => def.slot === slot);
}

export function getLegacyQuestDefinitionsByPeriod(
  period: QuestPeriod
): readonly QuestDefinition[] {
  const ids: readonly string[] =
    period === 'DAILY' ? LEGACY_DAILY_QUEST_IDS : LEGACY_WEEKLY_QUEST_IDS;
  return ids
    .map((id) => getQuestDefinition(period, id))
    .filter((def): def is QuestDefinition => def !== undefined);
}

export function getQuestDefinition(
  period: QuestPeriod,
  questId: string
): QuestDefinition | undefined {
  return getQuestDefinitionsByPeriod(period).find((def) => def.id === questId);
}
