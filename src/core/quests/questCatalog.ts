import { QuestDefinition, QuestPeriod } from '../../types/quests.ts';

export const DAILY_QUEST_CAP = {
  coins: 40,
  xp: 100,
} as const;

export const WEEKLY_QUEST_CAP = {
  coins: 150,
  xp: 370,
} as const;

export const DAILY_QUEST_DEFINITIONS: readonly QuestDefinition[] = [
  {
    id: 'daily_first_spark',
    period: 'DAILY',
    metric: 'COMPLETED_SESSIONS',
    target: 1,
    rewardCoins: 10,
    rewardXp: 25,
    titleKey: 'quests.daily.firstSpark.title',
    descriptionKey: 'quests.daily.firstSpark.desc',
  },
  {
    id: 'daily_steady_rhythm',
    period: 'DAILY',
    metric: 'FOCUS_MINUTES',
    target: 60,
    rewardCoins: 15,
    rewardXp: 35,
    titleKey: 'quests.daily.steadyRhythm.title',
    descriptionKey: 'quests.daily.steadyRhythm.desc',
  },
  {
    id: 'daily_double_tap',
    period: 'DAILY',
    metric: 'COMPLETED_SESSIONS',
    target: 2,
    rewardCoins: 15,
    rewardXp: 40,
    titleKey: 'quests.daily.doubleTap.title',
    descriptionKey: 'quests.daily.doubleTap.desc',
  },
] as const;

export const WEEKLY_QUEST_DEFINITIONS: readonly QuestDefinition[] = [
  {
    id: 'weekly_habit_builder',
    period: 'WEEKLY',
    metric: 'ACTIVE_DAYS',
    target: 4,
    rewardCoins: 50,
    rewardXp: 120,
    titleKey: 'quests.weekly.habitBuilder.title',
    descriptionKey: 'quests.weekly.habitBuilder.desc',
  },
  {
    id: 'weekly_deep_diver',
    period: 'WEEKLY',
    metric: 'DEEP_SESSIONS',
    target: 3,
    minSessionMinutes: 45,
    rewardCoins: 60,
    rewardXp: 150,
    titleKey: 'quests.weekly.deepDiver.title',
    descriptionKey: 'quests.weekly.deepDiver.desc',
  },
  {
    id: 'weekly_tenacity_10',
    period: 'WEEKLY',
    metric: 'COMPLETED_SESSIONS',
    target: 10,
    rewardCoins: 40,
    rewardXp: 100,
    titleKey: 'quests.weekly.tenacity.title',
    descriptionKey: 'quests.weekly.tenacity.desc',
  },
] as const;

export const ALL_QUEST_DEFINITIONS: readonly QuestDefinition[] = [
  ...DAILY_QUEST_DEFINITIONS,
  ...WEEKLY_QUEST_DEFINITIONS,
] as const;

export function getQuestDefinitionsByPeriod(period: QuestPeriod): readonly QuestDefinition[] {
  return period === 'DAILY' ? DAILY_QUEST_DEFINITIONS : WEEKLY_QUEST_DEFINITIONS;
}

export function getQuestDefinition(
  period: QuestPeriod,
  questId: string
): QuestDefinition | undefined {
  return getQuestDefinitionsByPeriod(period).find((def) => def.id === questId);
}
