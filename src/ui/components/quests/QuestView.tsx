import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Award,
  CheckCircle2,
  Clock,
  Coins,
  Flame,
  RefreshCw,
  ScrollText,
  TimerOff,
  X,
} from 'lucide-react';
import {
  DAILY_QUEST_CAP,
  WEEKLY_QUEST_CAP,
  getQuestDefinitionsByPeriod,
} from '../../../core/quests/questCatalog.ts';
import { countUnclaimed } from '../../../core/quests/questEngine.ts';
import { useTranslation } from '../../../i18n/I18nContext.tsx';
import { localizeErrorMessage } from '../../../i18n/errorTranslator.ts';
import { TranslationKey } from '../../../i18n/types.ts';
import {
  ClaimQuestRewardResponseData,
  GetQuestStateResponseData,
} from '../../../types/messages.ts';
import { QuestDefinition, QuestPeriod, QuestProgress } from '../../../types/quests.ts';
import {
  claimQuestRewardClient,
  getQuestStateClient,
} from '../../services/extensionClient.ts';
import { formatRewardAmount } from '../../utils/formatters.ts';
import {
  computePeriodClaimedSummary,
  formatDailyResetCountdown,
  formatQuestProgressLabel,
  formatWeeklyResetCountdown,
  resolveQuestVisualStatus,
} from '../../utils/questFormatting.ts';

export interface QuestViewProps {
  refreshTrigger?: number;
  initialData?: GetQuestStateResponseData | null;
  expiredQuestKeys?: readonly string[];
  onUnclaimedCountChange?: (count: number) => void;
  onQuestClaimed?: (result: ClaimQuestRewardResponseData) => void | Promise<void>;
}

interface ClaimBanner {
  coins: number;
  xp: number;
}

interface QuestCardProps {
  def: QuestDefinition;
  entry: QuestProgress | undefined;
  isClaiming: boolean;
  isExpired: boolean;
  onClaim: (period: QuestPeriod, questId: string) => void;
}

const QuestCard: React.FC<QuestCardProps> = ({
  def,
  entry,
  isClaiming,
  isExpired,
  onClaim,
}) => {
  const { t } = useTranslation();
  const status = resolveQuestVisualStatus(entry, { isExpired });
  const title = t(def.titleKey as TranslationKey);
  const description = t(def.descriptionKey as TranslationKey);
  const rawProgress = entry?.progress ?? 0;
  const clampedProgress = Math.max(0, Math.min(def.target, Math.floor(rawProgress)));
  const pct = def.target > 0 ? Math.min(100, Math.round((clampedProgress / def.target) * 100)) : 0;

  const progressText = formatQuestProgressLabel(def, clampedProgress, t);

  const cardSurfaceClass =
    status === 'READY'
      ? 'bg-emerald-50/70 dark:bg-emerald-950/25 border-emerald-300 dark:border-emerald-700/80'
      : status === 'CLAIMED'
      ? 'bg-slate-50/70 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 opacity-85'
      : status === 'EXPIRED'
      ? 'bg-amber-50/50 dark:bg-amber-950/20 border-amber-200/80 dark:border-amber-800/60 opacity-85'
      : 'bg-slate-50 dark:bg-slate-800/80 border-slate-200/90 dark:border-slate-700/80';

  const barFillClass =
    status === 'CLAIMED'
      ? 'bg-slate-400 dark:bg-slate-500'
      : status === 'READY'
      ? 'bg-emerald-500 dark:bg-emerald-400'
      : status === 'EXPIRED'
      ? 'bg-amber-400 dark:bg-amber-500'
      : 'bg-indigo-500 dark:bg-indigo-400';

  return (
    <article
      data-testid={`quest-card-${def.id}`}
      data-quest-status={status}
      className={`rounded-lg border p-3 space-y-2 transition-colors duration-150 motion-reduce:transition-none ${cardSurfaceClass}`}
    >
      <div className="flex items-start justify-between gap-2.5">
        <div className="min-w-0 flex-1 space-y-0.5">
          <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100 leading-snug">
            {title}
          </h3>
          <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
            {description}
          </p>
        </div>

        <div className="shrink-0 flex flex-col items-end gap-1">
          {status === 'READY' && (
            <button
              type="button"
              data-testid={`quest-claim-btn-${def.id}`}
              disabled={isClaiming}
              aria-label={t('quests.action.claimAria', {
                coins: formatRewardAmount(def.rewardCoins),
                xp: formatRewardAmount(def.rewardXp),
                title,
              })}
              onClick={() => onClaim(def.period, def.id)}
              className="whitespace-nowrap shrink-0 px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white text-xs font-semibold shadow-sm transition-colors duration-150 motion-reduce:transition-none cursor-pointer disabled:cursor-wait focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500"
            >
              {isClaiming ? t('quests.action.claiming') : t('quests.action.claim')}
            </button>
          )}

          {status === 'CLAIMED' && (
            <span
              data-testid={`quest-status-${def.id}`}
              className="inline-flex items-center gap-1 whitespace-nowrap shrink-0 px-2 py-1 rounded-md bg-slate-200/80 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[11px] font-semibold"
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>{t('quests.status.claimed')}</span>
            </span>
          )}

          {status === 'EXPIRED' && (
            <span
              data-testid={`quest-status-${def.id}`}
              className="inline-flex items-center gap-1 whitespace-nowrap shrink-0 px-2 py-1 rounded-md bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 text-[11px] font-semibold"
            >
              <TimerOff className="w-3.5 h-3.5 shrink-0" />
              <span>{t('quests.status.expired')}</span>
            </span>
          )}

          {status === 'IN_PROGRESS' && (
            <span
              data-testid={`quest-status-${def.id}`}
              className="inline-flex items-center gap-1 whitespace-nowrap shrink-0 text-[11px] font-medium text-slate-500 dark:text-slate-400"
            >
              <Clock className="w-3 h-3 shrink-0" />
              <span>{t('quests.status.inProgress')}</span>
            </span>
          )}
        </div>
      </div>

      {/* Progress track + Flat reward */}
      <div className="space-y-1.5">
        <div
          role="progressbar"
          aria-label={title}
          aria-valuemin={0}
          aria-valuemax={def.target}
          aria-valuenow={clampedProgress}
          className="w-full h-1.5 rounded-full bg-slate-200 dark:bg-slate-700/80 overflow-hidden"
        >
          <div
            className={`h-full rounded-full transition-all duration-200 motion-reduce:transition-none ${barFillClass}`}
            style={{ width: `${pct}%` }}
          />
        </div>

        <div className="flex items-center justify-between gap-2 text-[11px]">
          <span className="font-mono tabular-nums font-medium text-slate-600 dark:text-slate-300">
            {progressText}
          </span>
          <span className="inline-flex items-center gap-2 font-mono tabular-nums font-semibold text-slate-700 dark:text-slate-200">
            <span className="inline-flex items-center gap-0.5 text-amber-700 dark:text-amber-300">
              <Coins className="w-3 h-3 shrink-0" />
              +{formatRewardAmount(def.rewardCoins)}
            </span>
            <span className="inline-flex items-center gap-0.5 text-indigo-600 dark:text-indigo-300">
              <Award className="w-3 h-3 shrink-0" />
              +{formatRewardAmount(def.rewardXp)} {t('header.xpLabel')}
            </span>
          </span>
        </div>
      </div>
    </article>
  );
};

export const QuestView: React.FC<QuestViewProps> = ({
  refreshTrigger = 0,
  initialData = null,
  expiredQuestKeys = [],
  onUnclaimedCountChange,
  onQuestClaimed,
}) => {
  const { t, locale } = useTranslation();
  const [questData, setQuestData] = useState<GetQuestStateResponseData | null>(initialData);
  const [isLoading, setIsLoading] = useState<boolean>(initialData === null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [claimBanner, setClaimBanner] = useState<ClaimBanner | null>(null);
  const [claimingKeys, setClaimingKeys] = useState<Record<string, boolean>>({});

  const [syncedAtMs, setSyncedAtMs] = useState<number>(() => Date.now());
  const [elapsedSinceSyncMs, setElapsedSinceSyncMs] = useState<number>(0);

  const isMountedRef = useRef(true);
  const inFlightKeysRef = useRef<Set<string>>(new Set());
  const zeroRefetchedRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const fetchQuestState = useCallback(async () => {
    try {
      const res = await getQuestStateClient();
      if (!isMountedRef.current) return;
      if (res.success && res.data) {
        setQuestData(res.data);
        setSyncedAtMs(Date.now());
        setElapsedSinceSyncMs(0);
        zeroRefetchedRef.current = false;
        setLoadError(null);
        onUnclaimedCountChange?.(res.data.unclaimedCount);
      } else {
        setLoadError(
          localizeErrorMessage(locale, res.error, res.errorCode, res.errorParams) ||
            t('quests.loadError')
        );
      }
    } catch {
      if (isMountedRef.current) {
        setLoadError(t('quests.loadError'));
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [locale, onUnclaimedCountChange, t]);

  useEffect(() => {
    if (initialData !== null && refreshTrigger === 0) {
      return;
    }
    void fetchQuestState();
  }, [fetchQuestState, initialData, refreshTrigger]);

  // 1-second display countdown tick + single-flight rollover refetch when reaching 0
  useEffect(() => {
    if (!questData || typeof window === 'undefined') {
      return;
    }

    const baseDaily = questData.resetCountdown.dailyResetInMs;
    const baseWeekly = questData.resetCountdown.weeklyResetInMs;

    const timer = window.setInterval(() => {
      const elapsed = Math.max(0, Date.now() - syncedAtMs);
      setElapsedSinceSyncMs(elapsed);

      const nextDaily = Math.max(0, baseDaily - elapsed);
      const nextWeekly = Math.max(0, baseWeekly - elapsed);
      const hitDailyZero = baseDaily > 0 && nextDaily === 0;
      const hitWeeklyZero = baseWeekly > 0 && nextWeekly === 0;

      if ((hitDailyZero || hitWeeklyZero) && !zeroRefetchedRef.current) {
        zeroRefetchedRef.current = true;
        void fetchQuestState();
      }
    }, 1000);

    return () => window.clearInterval(timer);
  }, [fetchQuestState, questData, syncedAtMs]);

  const handleClaim = async (period: QuestPeriod, questId: string) => {
    const lockKey = `${period}:${questId}`;
    if (inFlightKeysRef.current.has(lockKey)) {
      return;
    }

    inFlightKeysRef.current.add(lockKey);
    setClaimingKeys((prev) => ({ ...prev, [lockKey]: true }));
    setClaimError(null);

    try {
      const res = await claimQuestRewardClient({ period, questId });
      if (!isMountedRef.current) return;

      if (res.success && res.data) {
        const claimedResult = res.data;
        const now = Date.now();
        const nextUnclaimed = countUnclaimed(claimedResult.questState, now);

        setQuestData((prev) =>
          prev
            ? {
                ...prev,
                questState: claimedResult.questState,
                unclaimedCount: nextUnclaimed,
              }
            : prev
        );
        setClaimBanner({
          coins: claimedResult.claimedCoins,
          xp: claimedResult.claimedXp,
        });
        onUnclaimedCountChange?.(nextUnclaimed);
        await onQuestClaimed?.(claimedResult);
      } else {
        const localized =
          localizeErrorMessage(locale, res.error, res.errorCode, res.errorParams) ||
          t('quests.claimError');
        setClaimError(localized);
        if (
          res.errorCode === 'QUEST_ALREADY_CLAIMED' ||
          res.errorCode === 'QUEST_EXPIRED'
        ) {
          await fetchQuestState();
        }
      }
    } catch {
      if (isMountedRef.current) {
        setClaimError(t('quests.claimError'));
      }
    } finally {
      inFlightKeysRef.current.delete(lockKey);
      if (isMountedRef.current) {
        setClaimingKeys((prev) => {
          const next = { ...prev };
          delete next[lockKey];
          return next;
        });
      }
    }
  };

  if (isLoading && !questData) {
    return (
      <section
        data-testid="quest-view-loading"
        className="flex-1 flex flex-col p-4 space-y-3"
      >
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
          <ScrollText className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          <span>{t('quests.loading')}</span>
        </div>
        {[0, 1, 2].map((idx) => (
          <div
            key={idx}
            className="h-20 rounded-lg bg-slate-100 dark:bg-slate-800/70 border border-slate-200/70 dark:border-slate-800 animate-pulse motion-reduce:animate-none"
          />
        ))}
      </section>
    );
  }

  if (loadError && !questData) {
    return (
      <section
        data-testid="quest-view-error"
        role="alert"
        className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-3"
      >
        <AlertCircle className="w-8 h-8 text-rose-500" />
        <p className="text-xs font-medium text-slate-700 dark:text-slate-300 max-w-[260px]">
          {loadError}
        </p>
        <button
          type="button"
          data-testid="quest-retry-btn"
          onClick={() => {
            setIsLoading(true);
            setLoadError(null);
            void fetchQuestState();
          }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>{t('quests.action.retry')}</span>
        </button>
      </section>
    );
  }

  if (!questData) {
    return (
      <section
        data-testid="quest-view-empty"
        className="flex-1 flex items-center justify-center p-6 text-xs text-slate-500 dark:text-slate-400"
      >
        {t('quests.empty')}
      </section>
    );
  }

  const { questState, resetCountdown, unclaimedCount } = questData;
  const dailyDefs = getQuestDefinitionsByPeriod('DAILY');
  const weeklyDefs = getQuestDefinitionsByPeriod('WEEKLY');

  const dailySummary = computePeriodClaimedSummary('DAILY', questState);
  const weeklySummary = computePeriodClaimedSummary('WEEKLY', questState);

  const liveDailyResetMs = Math.max(0, resetCountdown.dailyResetInMs - elapsedSinceSyncMs);
  const liveWeeklyResetMs = Math.max(0, resetCountdown.weeklyResetInMs - elapsedSinceSyncMs);

  const dailyCountdownText = formatDailyResetCountdown(liveDailyResetMs);
  const weeklyCountdownText = formatWeeklyResetCountdown(liveWeeklyResetMs, t);

  const expiredSet = new Set(expiredQuestKeys);

  return (
    <section
      data-testid="quest-view"
      className="flex-1 flex flex-col p-3.5 space-y-3.5"
    >
      {/* Top header */}
      <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-1.5 min-w-0">
          <ScrollText className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
          <h1 className="text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100 truncate">
            {t('quests.pageTitle')}
          </h1>
        </div>
        <span
          data-testid="quest-unclaimed-summary"
          className={`text-[11px] font-semibold whitespace-nowrap shrink-0 ${
            unclaimedCount > 0
              ? 'text-emerald-700 dark:text-emerald-300'
              : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          {unclaimedCount > 0
            ? t('quests.unclaimedSummary', { count: unclaimedCount })
            : t('quests.allClaimedSummary')}
        </span>
      </div>

      {/* Claim success banner */}
      {claimBanner && (
        <div
          role="status"
          data-testid="quest-claim-feedback"
          className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-xs font-semibold text-emerald-800 dark:text-emerald-200"
        >
          <span className="tabular-nums">
            {t('quests.claimSuccessBanner', {
              coins: formatRewardAmount(claimBanner.coins),
              xp: formatRewardAmount(claimBanner.xp),
            })}
          </span>
          <button
            type="button"
            aria-label={t('quests.action.dismissAria')}
            onClick={() => setClaimBanner(null)}
            className="p-0.5 rounded hover:bg-emerald-100 dark:hover:bg-emerald-900/60 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Claim error alert */}
      {claimError && (
        <div
          role="alert"
          data-testid="quest-error-banner"
          className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-xs font-medium text-rose-800 dark:text-rose-200"
        >
          <span className="flex items-center gap-1.5 min-w-0">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{claimError}</span>
          </span>
          <button
            type="button"
            aria-label={t('quests.action.dismissAria')}
            onClick={() => setClaimError(null)}
            className="p-0.5 rounded hover:bg-rose-100 dark:hover:bg-rose-900/60 cursor-pointer shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Quest Streak Card (separate from StatsView Focus Streak, zero passive Coins) */}
      <div
        data-testid="quest-streak-card"
        className="rounded-lg bg-slate-50 dark:bg-slate-800/70 border border-slate-200/90 dark:border-slate-700/80 p-3 space-y-1.5"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900 dark:text-slate-100">
            <Flame className="w-4 h-4 text-amber-500 shrink-0" />
            <span>{t('quests.streak.title')}</span>
          </div>
          <div className="flex items-center gap-3 text-xs font-mono tabular-nums">
            <span className="text-slate-600 dark:text-slate-300">
              {t('quests.streak.currentLabel')}:{' '}
              <strong className="text-slate-900 dark:text-slate-100">
                {t('quests.streak.daysValue', { count: questState.streak.currentDays })}
              </strong>
            </span>
            <span className="text-slate-600 dark:text-slate-300">
              {t('quests.streak.longestLabel')}:{' '}
              <strong className="text-slate-900 dark:text-slate-100">
                {t('quests.streak.daysValue', { count: questState.streak.longestDays })}
              </strong>
            </span>
          </div>
        </div>
        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          {t('quests.streak.noPassiveNote')}
        </p>
      </div>

      {/* Daily Quests Section */}
      <section data-testid="quests-section-daily" className="space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-xs font-bold uppercase tracking-wide text-slate-700 dark:text-slate-300">
            {t('quests.section.daily')}
          </h2>
          <span
            data-testid="quest-daily-countdown"
            className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400"
          >
            {t('quests.resetInDaily', { time: dailyCountdownText })}
          </span>
        </div>
        <p
          data-testid="quest-daily-cap"
          className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400"
        >
          {t('quests.cap.dailySummary', {
            claimedCoins: formatRewardAmount(dailySummary.claimedCoins),
            maxCoins: formatRewardAmount(DAILY_QUEST_CAP.coins),
            claimedXp: formatRewardAmount(dailySummary.claimedXp),
            maxXp: formatRewardAmount(DAILY_QUEST_CAP.xp),
          })}
        </p>
        <div className="space-y-2">
          {dailyDefs.map((def) => (
            <QuestCard
              key={def.id}
              def={def}
              entry={questState.daily[def.id]}
              isClaiming={Boolean(claimingKeys[`DAILY:${def.id}`])}
              isExpired={expiredSet.has(`DAILY:${def.id}`) || expiredSet.has(def.id)}
              onClaim={handleClaim}
            />
          ))}
        </div>
      </section>

      {/* Weekly Quests Section */}
      <section data-testid="quests-section-weekly" className="space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-xs font-bold uppercase tracking-wide text-slate-700 dark:text-slate-300">
            {t('quests.section.weekly')}
          </h2>
          <span
            data-testid="quest-weekly-countdown"
            className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400"
          >
            {t('quests.resetInWeekly', { time: weeklyCountdownText })}
          </span>
        </div>
        <p
          data-testid="quest-weekly-cap"
          className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400"
        >
          {t('quests.cap.weeklySummary', {
            claimedCoins: formatRewardAmount(weeklySummary.claimedCoins),
            maxCoins: formatRewardAmount(WEEKLY_QUEST_CAP.coins),
            claimedXp: formatRewardAmount(weeklySummary.claimedXp),
            maxXp: formatRewardAmount(WEEKLY_QUEST_CAP.xp),
          })}
        </p>
        <div className="space-y-2">
          {weeklyDefs.map((def) => (
            <QuestCard
              key={def.id}
              def={def}
              entry={questState.weekly[def.id]}
              isClaiming={Boolean(claimingKeys[`WEEKLY:${def.id}`])}
              isExpired={expiredSet.has(`WEEKLY:${def.id}`) || expiredSet.has(def.id)}
              onClaim={handleClaim}
            />
          ))}
        </div>
      </section>

      {/* All-or-Nothing footnote */}
      <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed pt-1">
        {t('quests.allOrNothingNote')}
      </p>
    </section>
  );
};
