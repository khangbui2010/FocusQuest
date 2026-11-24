import {
  DAILY_QUEST_CAP,
  WEEKLY_QUEST_CAP,
} from '../../core/quests/questCatalog.ts';
import { getActiveQuestDefinitions } from '../../core/quests/questEngine.ts';
import { TranslationKey, TranslationParams } from '../../i18n/types.ts';
import {
  QuestDefinition,
  QuestPeriod,
  QuestProgress,
  QuestSlot,
  QuestState,
} from '../../types/quests.ts';

export type QuestVisualStatus = 'IN_PROGRESS' | 'READY' | 'CLAIMED' | 'EXPIRED';

export interface PeriodClaimedSummary {
  readonly claimedCoins: number;
  readonly claimedXp: number;
  readonly maxCoins: number;
  readonly maxXp: number;
  readonly readyCount: number;
  readonly claimedCount: number;
  readonly totalCount: number;
}

export type TranslateFn = (key: TranslationKey, params?: TranslationParams) => string;

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const SLOT_LABEL_KEYS: Record<`${QuestPeriod}:${QuestSlot}`, TranslationKey> = {
  'DAILY:A': 'quests.slot.DAILY.A',
  'DAILY:B': 'quests.slot.DAILY.B',
  'DAILY:C': 'quests.slot.DAILY.C',
  'WEEKLY:A': 'quests.slot.WEEKLY.A',
  'WEEKLY:B': 'quests.slot.WEEKLY.B',
  'WEEKLY:C': 'quests.slot.WEEKLY.C',
};

export function getQuestSlotLabelKey(period: QuestPeriod, slot: QuestSlot): TranslationKey {
  return SLOT_LABEL_KEYS[`${period}:${slot}`];
}

function padTwo(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

export function formatDailyResetCountdown(remainingMs: number): string {
  if (typeof remainingMs !== 'number' || !Number.isFinite(remainingMs) || remainingMs <= 0) {
    return '00:00:00';
  }
  const totalSeconds = Math.floor(remainingMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${padTwo(hours)}:${padTwo(minutes)}:${padTwo(seconds)}`;
}

export function formatWeeklyResetCountdown(
  remainingMs: number,
  t: TranslateFn
): string {
  if (typeof remainingMs !== 'number' || !Number.isFinite(remainingMs) || remainingMs <= 0) {
    return '00:00:00';
  }
  if (remainingMs >= ONE_DAY_MS) {
    const days = Math.floor(remainingMs / ONE_DAY_MS);
    const hours = Math.floor((remainingMs % ONE_DAY_MS) / (60 * 60 * 1000));
    return t('quests.countdown.daysHours', { days, hours });
  }
  return formatDailyResetCountdown(remainingMs);
}

export function resolveQuestVisualStatus(
  entry: Pick<QuestProgress, 'progress' | 'target' | 'claimed'> | undefined,
  options?: { isExpired?: boolean }
): QuestVisualStatus {
  if (entry?.claimed) {
    return 'CLAIMED';
  }
  if (options?.isExpired) {
    return 'EXPIRED';
  }
  if (entry && entry.target > 0 && entry.progress >= entry.target) {
    return 'READY';
  }
  return 'IN_PROGRESS';
}

export function computePeriodClaimedSummary(
  period: QuestPeriod,
  questState: QuestState
): PeriodClaimedSummary {
  const definitions = getActiveQuestDefinitions(period, questState);
  const cap = period === 'DAILY' ? DAILY_QUEST_CAP : WEEKLY_QUEST_CAP;
  const record = period === 'DAILY' ? questState.daily : questState.weekly;

  let claimedCoins = 0;
  let claimedXp = 0;
  let readyCount = 0;
  let claimedCount = 0;

  for (const def of definitions) {
    const entry = record[def.id];
    const status = resolveQuestVisualStatus(entry);
    if (status === 'CLAIMED') {
      claimedCoins += def.rewardCoins;
      claimedXp += def.rewardXp;
      claimedCount += 1;
    } else if (status === 'READY') {
      readyCount += 1;
    }
  }

  return {
    claimedCoins,
    claimedXp,
    maxCoins: cap.coins,
    maxXp: cap.xp,
    readyCount,
    claimedCount,
    totalCount: definitions.length,
  };
}

export function formatQuestProgressLabel(
  def: QuestDefinition,
  rawProgress: number,
  t: TranslateFn
): string {
  const safeProgress =
    typeof rawProgress === 'number' && Number.isFinite(rawProgress)
      ? Math.max(0, Math.min(def.target, Math.floor(rawProgress)))
      : 0;

  if (def.metric === 'FOCUS_MINUTES') {
    return t('quests.progressUnit.minutes', { progress: safeProgress, target: def.target });
  }
  if (def.metric === 'ACTIVE_DAYS') {
    return t('quests.progressUnit.days', { progress: safeProgress, target: def.target });
  }
  if (def.metric === 'POMODORO_FOCUS_INTERVALS') {
    return t('quests.progressUnit.intervals', { progress: safeProgress, target: def.target });
  }
  return t('quests.progressUnit.sessions', { progress: safeProgress, target: def.target });
}
