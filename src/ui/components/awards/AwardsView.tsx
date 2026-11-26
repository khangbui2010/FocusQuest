import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import {
  AwardCategory,
  AwardViewModel,
  GetAwardsStateResponseData,
  MarkAwardsSeenResponseData,
} from '../../../types/awards.ts';
import { useTranslation } from '../../../i18n/I18nContext.tsx';
import { localizeErrorMessage } from '../../../i18n/errorTranslator.ts';
import { TranslationKey } from '../../../i18n/types.ts';
import { getAwardsStateClient, markAwardsSeenClient } from '../../services/extensionClient.ts';
import { formatRewardAmount } from '../../utils/formatters.ts';
import { AwardDetailsModal } from './AwardDetailsModal.tsx';
import { AwardIcon } from './AwardIcon.tsx';
import {
  formatAwardMetricValue,
  getAwardEffectiveLevel,
  getAwardLevelDisplay,
  groupAwardsForDisplay,
  isSingleLevelAward,
  sortAwardsForDisplay,
} from './awardFormatting.ts';

export type AwardFilterTab = 'all' | AwardCategory;

export interface AwardsViewProps {
  refreshTrigger?: number;
  initialData?: GetAwardsStateResponseData | null;
  onUnseenCountChange?: (count: number) => void;
  onMarkedSeen?: (result: MarkAwardsSeenResponseData) => void | Promise<void>;
}

const FILTER_TABS: readonly { id: AwardFilterTab; labelKey: TranslationKey }[] = [
  { id: 'all', labelKey: 'awards.tabs.all' },
  { id: 'focus', labelKey: 'awards.tabs.focus' },
  { id: 'quests', labelKey: 'awards.tabs.quests' },
  { id: 'civilization', labelKey: 'awards.tabs.civilization' },
];

const CATEGORY_HEADING_KEYS: Readonly<Record<AwardCategory, TranslationKey>> = {
  focus: 'awards.tabs.focus',
  quests: 'awards.tabs.quests',
  civilization: 'awards.tabs.civilization',
};

export const AwardsView: React.FC<AwardsViewProps> = ({
  refreshTrigger = 0,
  initialData = null,
  onUnseenCountChange,
  onMarkedSeen,
}) => {
  const { t, locale } = useTranslation();
  const [awardsData, setAwardsData] = useState<GetAwardsStateResponseData | null>(initialData);
  const [isLoading, setIsLoading] = useState<boolean>(initialData === null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<AwardFilterTab>('all');
  const [selectedAwardId, setSelectedAwardId] = useState<string | null>(null);
  const [sessionNewIds, setSessionNewIds] = useState<ReadonlySet<string>>(() => {
    if (!initialData) return new Set();
    return new Set(initialData.awards.filter((a) => a.hasUnseen).map((a) => a.id));
  });

  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const fetchAwards = useCallback(async () => {
    try {
      const res = await getAwardsStateClient();
      if (!isMountedRef.current) return;
      if (!res.success || !res.data) {
        setLoadError(
          res.errorCode || res.error
            ? localizeErrorMessage(locale, res.error ?? t('awards.loadError'), res.errorCode, res.errorParams)
            : t('awards.loadError')
        );
        setIsLoading(false);
        return;
      }

      const data = res.data;
      setAwardsData(data);
      setLoadError(null);
      setIsLoading(false);

      const unseenIds = data.awards.filter((a) => a.hasUnseen).map((a) => a.id);
      if (unseenIds.length > 0) {
        setSessionNewIds((prev) => {
          const next = new Set(prev);
          for (const id of unseenIds) {
            next.add(id);
          }
          return next;
        });

        const markRes = await markAwardsSeenClient();
        if (!isMountedRef.current) return;
        if (markRes.success && markRes.data) {
          onUnseenCountChange?.(markRes.data.unseenCount);
          await onMarkedSeen?.(markRes.data);
        }
      } else {
        onUnseenCountChange?.(data.unseenCount);
      }
    } catch {
      if (!isMountedRef.current) return;
      setLoadError(t('awards.loadError'));
      setIsLoading(false);
    }
  }, [locale, onMarkedSeen, onUnseenCountChange, t]);

  useEffect(() => {
    if (initialData !== null && refreshTrigger === 0) {
      return;
    }
    fetchAwards();
  }, [fetchAwards, initialData, refreshTrigger]);

  const awards = awardsData?.awards ?? [];

  const filteredAwards = useMemo(() => {
    const scoped =
      activeFilter === 'all'
        ? awards
        : awards.filter((item) => item.category === activeFilter);
    return sortAwardsForDisplay(scoped, t, locale);
  }, [activeFilter, awards, locale, t]);

  const groupedAwards = useMemo(() => {
    if (activeFilter !== 'all') {
      return filteredAwards.length > 0
        ? [{ category: activeFilter as AwardCategory, items: filteredAwards }]
        : [];
    }
    return groupAwardsForDisplay(filteredAwards, t, locale);
  }, [activeFilter, filteredAwards, locale, t]);

  const summary = useMemo(() => {
    let unlocked = 0;
    let total = 0;
    for (const item of awards) {
      unlocked += getAwardEffectiveLevel(item);
      total += item.totalAvailableTiers;
    }
    return { unlocked, total };
  }, [awards]);

  const selectedAward: AwardViewModel | null = useMemo(
    () => (selectedAwardId ? awards.find((item) => item.id === selectedAwardId) ?? null : null),
    [awards, selectedAwardId]
  );

  if (isLoading && !awardsData) {
    return (
      <section
        data-testid="awards-loading"
        className="flex-1 flex items-center justify-center p-6 text-xs text-slate-500 dark:text-slate-400"
      >
        {t('awards.loading')}
      </section>
    );
  }

  if (loadError && !awardsData) {
    return (
      <section
        data-testid="awards-error"
        className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-3"
      >
        <AlertCircle className="w-6 h-6 text-rose-500" />
        <p className="text-xs text-slate-700 dark:text-slate-300">{loadError}</p>
        <button
          type="button"
          data-testid="awards-retry-btn"
          onClick={() => {
            setIsLoading(true);
            setLoadError(null);
            fetchAwards();
          }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>{t('awards.retry')}</span>
        </button>
      </section>
    );
  }

  const renderAwardCard = (award: AwardViewModel) => {
    const title = t(award.titleKey as TranslationKey);
    const description = t(award.descriptionKey as TranslationKey);
    const effectiveLevel = getAwardEffectiveLevel(award);
    const singleLevel = isSingleLevelAward(award);
    const levelDisplay = getAwardLevelDisplay(award, t);
    const isNew = award.hasUnseen || sessionNewIds.has(award.id);
    const isUnlocked = effectiveLevel > 0;

    const nextTarget =
      award.nextTier?.threshold ?? (award.tiers[award.tiers.length - 1]?.threshold ?? 1);
    const clampedProgress = Math.max(0, Math.min(nextTarget, award.currentMetric));
    const pct =
      nextTarget > 0 ? Math.min(100, Math.round((clampedProgress / nextTarget) * 100)) : 0;

    const cardSurfaceClass = isNew
      ? 'bg-amber-50/75 dark:bg-amber-950/25 border-amber-300 dark:border-amber-700/80'
      : isUnlocked
      ? 'bg-slate-50 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700/80'
      : 'bg-slate-50/60 dark:bg-slate-900/50 border-slate-200/80 dark:border-slate-800';

    const progressSummaryText = award.isMaxed
      ? singleLevel
        ? t('awards.singleAchieved')
        : t('awards.completedSummary')
      : award.nextTier
      ? singleLevel
        ? t('awards.singleNotAchieved')
        : t('awards.nextTierTarget', {
            level: award.nextTier.tier,
            current: formatAwardMetricValue(award.unit, award.currentMetric, t),
            target: formatAwardMetricValue(award.unit, award.nextTier.threshold, t),
          })
      : formatAwardMetricValue(award.unit, award.currentMetric, t);

    return (
      <button
        key={award.id}
        type="button"
        data-testid={`award-card-${award.id}`}
        data-award-level={effectiveLevel}
        data-highest-tier={award.highestTierUnlocked}
        onClick={() => setSelectedAwardId(award.id)}
        className={`w-full text-left rounded-lg border p-2.5 space-y-2 transition-colors duration-150 motion-reduce:transition-none hover:border-indigo-300 dark:hover:border-indigo-700 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 ${cardSurfaceClass}`}
      >
        <div className="flex items-start gap-2.5">
          <AwardIcon
            icon={award.icon}
            unlocked={isUnlocked}
            level={effectiveLevel}
            isSingleLevel={singleLevel}
            showLevelTag={!singleLevel}
            era={awardsData?.era}
            size={28}
          />

          <div className="min-w-0 flex-1 space-y-0.5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100 leading-snug truncate">
                {title}
              </h3>

              <div className="shrink-0 flex items-center gap-1.5 text-[11px] font-semibold">
                {isNew && (
                  <span
                    data-testid={`award-new-${award.id}`}
                    className="text-amber-700 dark:text-amber-300 whitespace-nowrap"
                  >
                    {t('awards.newBadge')}
                  </span>
                )}
                {isNew && (
                  <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">
                    ·
                  </span>
                )}
                <span
                  data-testid={`award-level-label-${award.id}`}
                  className={`whitespace-nowrap ${
                    award.isMaxed
                      ? 'text-emerald-700 dark:text-emerald-300'
                      : isUnlocked
                      ? 'text-indigo-700 dark:text-indigo-300'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {levelDisplay}
                </span>
              </div>
            </div>

            <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-snug">
              {description}
            </p>
          </div>
        </div>

        {/* Dynamic Level Pips & Progress */}
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
            <div
              data-testid={`award-tiers-${award.id}`}
              className="flex flex-wrap items-center gap-1"
            >
              {award.tiers.map((tier) => (
                <span
                  key={tier.tier}
                  data-testid={`award-tier-pip-${award.id}-${tier.tier}`}
                  data-tier-unlocked={tier.unlocked ? 'true' : 'false'}
                  title={
                    singleLevel
                      ? `${tier.unlocked ? t('awards.singleAchieved') : t('awards.singleNotAchieved')} (${formatAwardMetricValue(award.unit, tier.threshold, t)})`
                      : `${t('awards.levelBadge', { level: tier.tier })} (${formatAwardMetricValue(award.unit, tier.threshold, t)})`
                  }
                  className={`inline-flex items-center justify-center h-4 px-1.5 rounded text-[9px] font-mono tabular-nums font-bold ${
                    tier.unlocked
                      ? 'bg-amber-500/90 text-white dark:bg-amber-500 dark:text-slate-950'
                      : 'bg-slate-200/90 text-slate-500 dark:bg-slate-700/80 dark:text-slate-400'
                  }`}
                >
                  {singleLevel
                    ? tier.unlocked
                      ? t('awards.singleAchieved')
                      : t('awards.singleNotAchieved')
                    : t('awards.levelBadge', { level: tier.tier })}
                </span>
              ))}
            </div>

            <span className="text-[10px] font-mono tabular-nums text-slate-600 dark:text-slate-300 truncate">
              {progressSummaryText}
            </span>
          </div>

          <div
            role="progressbar"
            aria-label={title}
            aria-valuemin={0}
            aria-valuemax={nextTarget}
            aria-valuenow={award.isMaxed ? nextTarget : clampedProgress}
            className="w-full h-1.5 rounded-full bg-slate-200 dark:bg-slate-700/80 overflow-hidden"
          >
            <div
              className={`h-full rounded-full transition-all duration-200 motion-reduce:transition-none ${
                award.isMaxed
                  ? 'bg-emerald-500 dark:bg-emerald-400'
                  : isUnlocked
                  ? 'bg-amber-500 dark:bg-amber-400'
                  : 'bg-indigo-500 dark:bg-indigo-400'
              }`}
              style={{ width: `${award.isMaxed ? 100 : pct}%` }}
            />
          </div>
        </div>
      </button>
    );
  };

  return (
    <section
      data-testid="awards-view"
      className="flex-1 flex flex-col bg-white dark:bg-slate-900"
    >
      {/* Header summary */}
      <div className="px-3 pt-3 pb-2.5 border-b border-slate-200 dark:border-slate-800 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 leading-tight">
              {t('awards.title')}
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug mt-0.5">
              {t('awards.subtitle')}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <span
              data-testid="awards-tiers-summary"
              className="text-[11px] font-mono tabular-nums font-bold text-indigo-700 dark:text-indigo-300 whitespace-nowrap"
            >
              {t('awards.unlockedTiersSummary', {
                unlocked: formatRewardAmount(summary.unlocked),
                total: formatRewardAmount(summary.total),
              })}
            </span>
          </div>
        </div>

        {/* Category Filter Tabs */}
        <div
          role="tablist"
          aria-label={t('awards.tabs.ariaLabel')}
          className="grid grid-cols-4 gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800/90"
        >
          {FILTER_TABS.map((tab) => {
            const isSelected = activeFilter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                data-testid={`awards-filter-${tab.id}`}
                aria-selected={isSelected}
                onClick={() => setActiveFilter(tab.id)}
                className={`px-1.5 py-1.5 rounded-md text-[11px] font-semibold whitespace-nowrap truncate transition-colors duration-150 motion-reduce:transition-none cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-indigo-500 ${
                  isSelected
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                {t(tab.labelKey)}
              </button>
            );
          })}
        </div>

        <p className="text-[10px] text-slate-500 dark:text-slate-400">
          {t('awards.zeroEconomyNote')}
        </p>
      </div>

      {/* Grouped Awards List */}
      <div className="px-3 py-2.5 space-y-3">
        {groupedAwards.length === 0 ? (
          <div
            data-testid="awards-empty-category"
            className="py-8 text-center text-xs text-slate-500 dark:text-slate-400"
          >
            {t('awards.emptyCategory')}
          </div>
        ) : activeFilter === 'all' ? (
          groupedAwards.map((group) => (
            <div
              key={group.category}
              data-testid={`awards-group-${group.category}`}
              className="space-y-1.5"
            >
              <h3 className="text-[11px] font-bold text-slate-600 dark:text-slate-300 px-0.5">
                {t(CATEGORY_HEADING_KEYS[group.category])}
              </h3>
              <div className="space-y-2">{group.items.map(renderAwardCard)}</div>
            </div>
          ))
        ) : (
          <div className="space-y-2">{filteredAwards.map(renderAwardCard)}</div>
        )}
      </div>

      <AwardDetailsModal
        award={selectedAward}
        era={awardsData?.era}
        onClose={() => setSelectedAwardId(null)}
      />
    </section>
  );
};
