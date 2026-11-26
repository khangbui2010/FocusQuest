import { AwardCategory, AwardUnit, AwardViewModel } from '../../../types/awards.ts';
import { SupportedLocale, TranslationKey, TranslationParams } from '../../../i18n/types.ts';
import { formatRewardAmount } from '../../utils/formatters.ts';

type TranslateFn = (key: TranslationKey, params?: TranslationParams) => string;

export const AWARD_CATEGORY_ORDER: readonly AwardCategory[] = [
  'focus',
  'quests',
  'civilization',
];

export type AwardLevelBand =
  | 'locked'
  | 'single'
  | 'lv1-2'
  | 'lv3'
  | 'lv4'
  | 'lv5'
  | 'lv6-plus';

export function formatAwardMetricValue(
  unit: AwardUnit,
  value: number,
  t: TranslateFn
): string {
  const safeVal =
    typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  switch (unit) {
    case 'boolean':
      return safeVal >= 1 ? t('awards.unit.booleanDone') : t('awards.unit.booleanPending');
    case 'minutes':
      return t('awards.unit.minutes', { value: formatRewardAmount(safeVal) });
    case 'sessions':
      return t('awards.unit.sessions', { value: formatRewardAmount(safeVal) });
    case 'days':
      return t('awards.unit.days', { value: formatRewardAmount(safeVal) });
    case 'quests':
      return t('awards.unit.quests', { value: formatRewardAmount(safeVal) });
    case 'levels':
      return t('awards.unit.levels', { value: formatRewardAmount(safeVal) });
    case 'buildings':
      return t('awards.unit.buildings', { value: formatRewardAmount(safeVal) });
    case 'chunks':
      return t('awards.unit.chunks', { value: formatRewardAmount(safeVal) });
    case 'villagers':
      return t('awards.unit.villagers', { value: formatRewardAmount(safeVal) });
    default:
      return formatRewardAmount(safeVal);
  }
}

export function formatAwardUnlockDate(timestampMs: number, locale: SupportedLocale): string {
  try {
    return new Intl.DateTimeFormat(locale === 'vi' ? 'vi-VN' : 'en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(new Date(timestampMs));
  } catch {
    return new Date(timestampMs).toISOString().slice(0, 10);
  }
}

export function isSingleLevelAward(award: Pick<AwardViewModel, 'isSingleLevel' | 'totalAvailableTiers'>): boolean {
  return Boolean(award.isSingleLevel || award.totalAvailableTiers === 1);
}

export function getAwardEffectiveLevel(
  award: Pick<AwardViewModel, 'level' | 'highestTierUnlocked'>
): number {
  return typeof award.level === 'number' ? award.level : award.highestTierUnlocked;
}

export function getAwardLevelBand(level: number, isSingleLevel = false): AwardLevelBand {
  if (level <= 0) return 'locked';
  if (isSingleLevel) return 'single';
  if (level <= 2) return 'lv1-2';
  if (level === 3) return 'lv3';
  if (level === 4) return 'lv4';
  if (level === 5) return 'lv5';
  return 'lv6-plus';
}

export function getAwardLevelFrameClass(level: number, isSingleLevel = false): string {
  const band = getAwardLevelBand(level, isSingleLevel);
  switch (band) {
    case 'locked':
      return 'bg-slate-100 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700';
    case 'single':
      return 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-400 dark:border-emerald-500 ring-1 ring-emerald-200/70 dark:ring-emerald-700/50';
    case 'lv1-2':
      return 'bg-amber-50/85 dark:bg-amber-950/35 border-amber-300 dark:border-amber-700';
    case 'lv3':
      return 'bg-sky-50 dark:bg-sky-950/40 border-sky-400 dark:border-sky-500 ring-1 ring-sky-200/70 dark:ring-sky-700/40';
    case 'lv4':
      return 'bg-indigo-50 dark:bg-indigo-950/45 border-indigo-400 dark:border-indigo-500 ring-1 ring-indigo-200/80 dark:ring-indigo-600/50';
    case 'lv5':
      return 'bg-amber-100/90 dark:bg-amber-900/45 border-2 border-amber-500 dark:border-amber-400 ring-2 ring-amber-300/70 dark:ring-amber-500/40';
    case 'lv6-plus': {
      const cycle = (Math.max(6, Math.floor(level)) - 6) % 3;
      if (cycle === 0) {
        return 'bg-emerald-100/90 dark:bg-emerald-950/55 border-2 border-emerald-500 dark:border-emerald-400 ring-2 ring-emerald-300/80 dark:ring-emerald-500/50';
      }
      if (cycle === 1) {
        return 'bg-violet-100/90 dark:bg-violet-950/55 border-2 border-violet-500 dark:border-violet-400 ring-2 ring-violet-300/80 dark:ring-violet-500/50';
      }
      return 'bg-rose-100/90 dark:bg-rose-950/55 border-2 border-rose-500 dark:border-rose-400 ring-2 ring-rose-300/80 dark:ring-rose-500/50';
    }
  }
}

export function getAwardLevelDisplay(award: AwardViewModel, t: TranslateFn): string {
  const level = getAwardEffectiveLevel(award);
  if (isSingleLevelAward(award)) {
    return level >= 1 ? t('awards.singleAchieved') : t('awards.singleNotAchieved');
  }
  return level >= 1 ? t('awards.levelBadge', { level }) : t('awards.lockedStatus');
}

export function sortAwardsForDisplay(
  awards: readonly AwardViewModel[],
  t: TranslateFn,
  locale: SupportedLocale
): AwardViewModel[] {
  const collatorLocale = locale === 'vi' ? 'vi' : 'en';
  return [...awards].sort((a, b) => {
    const groupDiff =
      AWARD_CATEGORY_ORDER.indexOf(a.category) - AWARD_CATEGORY_ORDER.indexOf(b.category);
    if (groupDiff !== 0) return groupDiff;

    const levelDiff = getAwardEffectiveLevel(b) - getAwardEffectiveLevel(a);
    if (levelDiff !== 0) return levelDiff;

    const aTitle = t(a.titleKey as TranslationKey);
    const bTitle = t(b.titleKey as TranslationKey);
    const nameDiff = aTitle.localeCompare(bTitle, collatorLocale);
    if (nameDiff !== 0) return nameDiff;

    return a.order - b.order;
  });
}

export function groupAwardsForDisplay(
  awards: readonly AwardViewModel[],
  t: TranslateFn,
  locale: SupportedLocale
): Array<{ readonly category: AwardCategory; readonly items: readonly AwardViewModel[] }> {
  const sorted = sortAwardsForDisplay(awards, t, locale);
  const groups: Array<{ category: AwardCategory; items: AwardViewModel[] }> = [];
  for (const cat of AWARD_CATEGORY_ORDER) {
    const items = sorted.filter((a) => a.category === cat);
    if (items.length > 0) {
      groups.push({ category: cat, items });
    }
  }
  return groups;
}
