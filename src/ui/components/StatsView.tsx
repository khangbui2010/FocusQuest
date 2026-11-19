import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Award,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Coins,
  Flame,
  Lock,
  RefreshCw,
} from 'lucide-react';
import { BuildingInstance } from '../../core/civilization/buildingTypes.ts';
import {
  aggregateDayStats,
  aggregateMonthStats,
  aggregateYearStats,
  calculateFocusStreak,
  isValidDateKey,
} from '../../core/stats/statsAggregator.ts';
import { getLocalDateKey } from '../../core/utils/dateUtils.ts';
import { useTranslation } from '../../i18n/I18nContext.tsx';
import { localizeErrorMessage } from '../../i18n/errorTranslator.ts';
import { DailyStatRecord } from '../../types/storageSchema.ts';
import {
  getCivilizationStateClient,
  getDailyStatsClient,
} from '../services/extensionClient.ts';
import { getLocalizedBuildingName } from '../utils/buildingI18n.ts';
import {
  STREAK_ANALYSIS_STAT_ID,
  getUnlockingBuildingDefinition,
  hasFocusStatUnlock,
} from '../utils/focusStatUnlock.ts';
import { formatRewardAmount } from '../utils/formatters.ts';
import {
  StatsPeriodMode,
  canStepPeriod,
  dayTrendToBars,
  formatMonthPeriodLabel,
  getCurrentKeyForMode,
  getMonthShortLabel,
  getPeriodKeysFromToday,
  monthDaysToBars,
  stepStatsPeriod,
  yearMonthsToBars,
} from '../utils/statsPeriod.ts';
import { StatsBarChart, StatsBarDatum } from './StatsBarChart.tsx';

export interface StatsViewProps {
  todayStats: DailyStatRecord | null;
  buildings?: readonly BuildingInstance[];
  initialAllDailyStats?: Record<string, DailyStatRecord> | null;
  initialPeriod?: StatsPeriodMode;
  initialPeriodKey?: string;
  todayOverride?: string;
}

export const StatsView: React.FC<StatsViewProps> = ({
  todayStats,
  buildings,
  initialAllDailyStats = null,
  initialPeriod = 'day',
  initialPeriodKey,
  todayOverride,
}) => {
  const { t, locale } = useTranslation();

  const todayDateKey = useMemo(() => {
    if (todayOverride && isValidDateKey(todayOverride)) {
      return todayOverride;
    }
    return getLocalDateKey();
  }, [todayOverride]);

  const { todayMonthKey, todayYearKey } = useMemo(
    () => getPeriodKeysFromToday(todayDateKey),
    [todayDateKey]
  );

  const [period, setPeriod] = useState<StatsPeriodMode>(initialPeriod);
  const [selectedDayKey, setSelectedDayKey] = useState<string>(() =>
    initialPeriod === 'day' && initialPeriodKey && isValidDateKey(initialPeriodKey)
      ? initialPeriodKey
      : todayDateKey
  );
  const [selectedMonthKey, setSelectedMonthKey] = useState<string>(() =>
    initialPeriod === 'month' && initialPeriodKey
      ? initialPeriodKey
      : todayMonthKey
  );
  const [selectedYearKey, setSelectedYearKey] = useState<string>(() =>
    initialPeriod === 'year' && initialPeriodKey
      ? initialPeriodKey
      : todayYearKey
  );

  const [allDailyStats, setAllDailyStats] = useState<Record<string, DailyStatRecord> | null>(
    initialAllDailyStats
  );
  const [fetchedBuildings, setFetchedBuildings] = useState<readonly BuildingInstance[]>(
    buildings ?? []
  );
  const [isLoading, setIsLoading] = useState<boolean>(initialAllDailyStats === null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const loadHistoricalStats = useCallback(async () => {
    try {
      const statsRes = await getDailyStatsClient();
      if (!isMountedRef.current) return;
      if (statsRes.success && statsRes.data) {
        setAllDailyStats(statsRes.data);
        setLoadError(null);
      } else {
        setLoadError(
          localizeErrorMessage(locale, statsRes.error, statsRes.errorCode, statsRes.errorParams) ||
            t('stats.loadError')
        );
      }

      if (buildings === undefined) {
        const civRes = await getCivilizationStateClient();
        if (isMountedRef.current && civRes.success && civRes.data) {
          setFetchedBuildings(civRes.data.buildings);
        }
      }
    } catch {
      if (isMountedRef.current) {
        setLoadError(t('stats.loadError'));
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [buildings, locale, t]);

  useEffect(() => {
    if (initialAllDailyStats !== null) {
      return;
    }
    void loadHistoricalStats();
  }, [initialAllDailyStats, loadHistoricalStats, todayStats]);

  // Merge live todayStats so active day always reflects latest settled session
  const effectiveDailyStats = useMemo<Record<string, DailyStatRecord>>(() => {
    const base = allDailyStats ? { ...allDailyStats } : {};
    if (todayStats) {
      const key = isValidDateKey(todayStats.date) ? todayStats.date : todayDateKey;
      if (!allDailyStats) {
        // SSR / pre-fetch fallback: bind passed todayStats onto active anchor too if dates differ
        base[key] = todayStats;
        base[todayDateKey] = todayStats;
      } else if (todayStats.date && isValidDateKey(todayStats.date)) {
        base[todayStats.date] = todayStats;
      }
    }
    return base;
  }, [allDailyStats, todayDateKey, todayStats]);

  const effectiveBuildings = buildings !== undefined ? buildings : fetchedBuildings;
  const isStreakUnlocked = hasFocusStatUnlock(effectiveBuildings, STREAK_ANALYSIS_STAT_ID);
  const unlockingBuildingDef = getUnlockingBuildingDefinition(STREAK_ANALYSIS_STAT_ID);
  const unlockingBuildingName = getLocalizedBuildingName(
    locale,
    unlockingBuildingDef ?? 'stone_age_elder_hut'
  );
  const focusStreak = useMemo(
    () => calculateFocusStreak(effectiveDailyStats, todayDateKey),
    [effectiveDailyStats, todayDateKey]
  );

  const activeKey =
    period === 'day'
      ? selectedDayKey
      : period === 'month'
      ? selectedMonthKey
      : selectedYearKey;

  const currentDefaultKey = getCurrentKeyForMode(period, todayDateKey);
  const isCurrentPeriod = activeKey === currentDefaultKey;
  const canPrev = canStepPeriod(period, activeKey, -1, todayDateKey);
  const canNext = canStepPeriod(period, activeKey, 1, todayDateKey);

  const handleStep = (delta: -1 | 1) => {
    if (period === 'day') {
      setSelectedDayKey((prev) => stepStatsPeriod('day', prev, delta, todayDateKey));
    } else if (period === 'month') {
      setSelectedMonthKey((prev) => stepStatsPeriod('month', prev, delta, todayDateKey));
    } else {
      setSelectedYearKey((prev) => stepStatsPeriod('year', prev, delta, todayDateKey));
    }
  };

  const handleJumpCurrent = () => {
    if (period === 'day') {
      setSelectedDayKey(todayDateKey);
    } else if (period === 'month') {
      setSelectedMonthKey(todayMonthKey);
    } else {
      setSelectedYearKey(todayYearKey);
    }
  };

  const daySummary = useMemo(
    () => aggregateDayStats(effectiveDailyStats, selectedDayKey),
    [effectiveDailyStats, selectedDayKey]
  );

  const monthSummary = useMemo(
    () => aggregateMonthStats(effectiveDailyStats, selectedMonthKey),
    [effectiveDailyStats, selectedMonthKey]
  );

  const yearSummary = useMemo(
    () => aggregateYearStats(effectiveDailyStats, selectedYearKey),
    [effectiveDailyStats, selectedYearKey]
  );

  const chartTooltipFormatter = useCallback(
    (bar: StatsBarDatum) =>
      t('stats.chart.tooltip', {
        minutes: formatRewardAmount(bar.value),
        sessions: bar.sessions ?? 0,
      }),
    [t]
  );

  const periodDisplayLabel =
    period === 'day'
      ? selectedDayKey
      : period === 'month'
      ? formatMonthPeriodLabel(selectedMonthKey, t)
      : selectedYearKey;

  const jumpCurrentLabel =
    period === 'day'
      ? t('stats.nav.today')
      : period === 'month'
      ? t('stats.nav.thisMonth')
      : t('stats.nav.thisYear');

  return (
    <div data-testid="stats-view" className="flex-1 flex flex-col p-3.5 space-y-3.5">
      {/* Period Selector Tabs (Day / Month / Year) */}
      <div className="space-y-2">
        <div
          role="tablist"
          aria-label={t('stats.period.tablistAria')}
          className="grid grid-cols-3 gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80"
        >
          {(['day', 'month', 'year'] as const).map((mode) => {
            const selected = period === mode;
            const label =
              mode === 'day'
                ? t('stats.period.day')
                : mode === 'month'
                ? t('stats.period.month')
                : t('stats.period.year');
            return (
              <button
                key={mode}
                type="button"
                role="tab"
                data-testid={`stats-tab-${mode}`}
                aria-selected={selected}
                onClick={() => setPeriod(mode)}
                className={`py-1.5 px-2 rounded-md text-xs font-semibold whitespace-nowrap transition-colors duration-150 motion-reduce:transition-none cursor-pointer ${
                  selected
                    ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* Period Navigation Row (< Label > Today) */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <button
              type="button"
              data-testid="stats-prev-btn"
              aria-label={t('stats.nav.prevPeriodAria')}
              disabled={!canPrev}
              onClick={() => handleStep(-1)}
              className="p-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span
              data-testid="stats-period-label"
              className="px-2 text-xs font-mono font-semibold text-slate-800 dark:text-slate-200 tabular-nums"
            >
              {periodDisplayLabel}
            </span>
            <button
              type="button"
              data-testid="stats-next-btn"
              aria-label={t('stats.nav.nextPeriodAria')}
              disabled={!canNext}
              onClick={() => handleStep(1)}
              className="p-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {!isCurrentPeriod && (
            <button
              type="button"
              data-testid="stats-jump-current-btn"
              onClick={handleJumpCurrent}
              className="px-2 py-1 rounded-md border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/60 text-[11px] font-semibold text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 whitespace-nowrap cursor-pointer"
            >
              {jumpCurrentLabel}
            </button>
          )}
        </div>
      </div>

      {/* Inline load error banner if historical stats failed */}
      {loadError && (
        <div
          role="alert"
          data-testid="stats-load-error"
          className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-xs text-rose-800 dark:text-rose-200"
        >
          <span className="flex items-center gap-1.5 min-w-0">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{loadError}</span>
          </span>
          <button
            type="button"
            data-testid="stats-retry-btn"
            onClick={() => {
              setIsLoading(true);
              setLoadError(null);
              void loadHistoricalStats();
            }}
            className="inline-flex items-center gap-1 px-2 py-1 rounded bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-semibold whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RefreshCw className="w-3 h-3" />
            <span>{t('stats.retryBtn')}</span>
          </button>
        </div>
      )}

      {/* Optional lightweight loading hint before first historical fetch */}
      {isLoading && !allDailyStats && !todayStats && (
        <div
          data-testid="stats-loading"
          className="text-xs text-slate-500 dark:text-slate-400"
        >
          {t('stats.loading')}
        </div>
      )}

      {/* DAY TAB */}
      {period === 'day' && (
        <section data-testid="stats-panel-day" className="space-y-3">
          <div className="flex items-center justify-between text-xs pb-1.5 border-b border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-1.5 font-semibold text-slate-800 dark:text-slate-200">
              <Calendar className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              <span>
                {selectedDayKey === todayDateKey
                  ? t('stats.todaySummaryTitle')
                  : t('stats.daySummaryTitle')}
              </span>
            </div>
            <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400 tabular-nums">
              {todayStats && !allDailyStats ? todayStats.date || selectedDayKey : selectedDayKey}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div className="p-3 bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 rounded-lg">
              <div className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                <Clock className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                <span>{t('stats.focusTimeLabel')}</span>
              </div>
              <div className="text-xl font-bold font-mono text-slate-900 dark:text-slate-100 tabular-nums">
                {daySummary.focusMinutes}{' '}
                <span className="text-xs font-normal text-slate-500 font-sans">
                  {t('stats.minsUnit')}
                </span>
              </div>
            </div>

            <div className="p-3 bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 rounded-lg">
              <div className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>{t('stats.questsFinishedLabel')}</span>
              </div>
              <div className="text-xl font-bold font-mono text-slate-900 dark:text-slate-100 tabular-nums flex items-baseline gap-2">
                <span>{daySummary.completed}</span>
                {daySummary.abandoned > 0 && (
                  <span className="text-xs font-normal text-rose-500 dark:text-rose-400 font-sans">
                    {t('stats.forfeitedCount', { count: daySummary.abandoned })}
                  </span>
                )}
              </div>
            </div>

            <div className="p-3 bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 rounded-lg">
              <div className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                <Coins className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                <span>{t('stats.coinsEarnedLabel')}</span>
              </div>
              <div className="text-xl font-bold font-mono text-amber-600 dark:text-amber-400 tabular-nums">
                +{formatRewardAmount(daySummary.coins)}
              </div>
            </div>

            <div className="p-3 bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 rounded-lg">
              <div className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                <Award className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                <span>{t('stats.xpEarnedLabel')}</span>
              </div>
              <div className="text-xl font-bold font-mono text-indigo-600 dark:text-indigo-400 tabular-nums">
                +{formatRewardAmount(daySummary.xp)}
              </div>
            </div>
          </div>

          {daySummary.focusMinutes === 0 && daySummary.sessions === 0 && (
            <p
              data-testid="stats-day-empty"
              className="text-[11px] text-slate-500 dark:text-slate-400"
            >
              {t('stats.day.emptyDay')}
            </p>
          )}

          <div className="space-y-1.5">
            <h2 className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              {t('stats.day.trendTitle')}
            </h2>
            <StatsBarChart
              bars={dayTrendToBars(daySummary)}
              highlightKey={selectedDayKey}
              ariaLabel={t('stats.chart.ariaLabel')}
              emptyLabel={t('stats.chart.empty')}
              tooltipFormatter={chartTooltipFormatter}
            />
          </div>
        </section>
      )}

      {/* MONTH TAB */}
      {period === 'month' && (
        <section data-testid="stats-panel-month" className="space-y-3">
          <div className="flex items-center justify-between text-xs pb-1.5 border-b border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-1.5 font-semibold text-slate-800 dark:text-slate-200">
              <Calendar className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              <span>{t('stats.month.summaryTitle')}</span>
            </div>
            <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400 tabular-nums">
              {formatMonthPeriodLabel(selectedMonthKey, t)}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div className="p-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 rounded-lg">
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                {t('stats.focusTimeLabel')}
              </div>
              <div className="text-lg font-bold font-mono text-slate-900 dark:text-slate-100 tabular-nums">
                {monthSummary.totalFocusMinutes}{' '}
                <span className="text-xs font-normal text-slate-500 font-sans">
                  {t('stats.minsUnit')}
                </span>
              </div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400 tabular-nums">
                {t('stats.sessionsCompletedSub', {
                  completed: monthSummary.completed,
                  abandoned: monthSummary.abandoned,
                })}
              </div>
            </div>

            <div className="p-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 rounded-lg">
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                {t('stats.month.activeDaysLabel')}
              </div>
              <div className="text-lg font-bold font-mono text-slate-900 dark:text-slate-100 tabular-nums">
                {t('stats.month.activeDaysValue', {
                  active: monthSummary.activeDays,
                  total: monthSummary.daysInMonth,
                })}
              </div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400 tabular-nums">
                {t('stats.month.completionRateLabel')}:{' '}
                {monthSummary.completionRate === null
                  ? t('stats.noRateValue')
                  : `${Math.round(monthSummary.completionRate * 100)}%`}
              </div>
            </div>

            <div className="p-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 rounded-lg">
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                {t('stats.month.avgPerDayLabel')}
              </div>
              <div className="text-lg font-bold font-mono text-slate-900 dark:text-slate-100 tabular-nums">
                {formatRewardAmount(monthSummary.averageFocusPerActiveDay)}{' '}
                <span className="text-xs font-normal text-slate-500 font-sans">
                  {t('stats.minsUnit')}
                </span>
              </div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400 tabular-nums">
                {t('stats.month.avgCalendarLabel', {
                  mins: formatRewardAmount(monthSummary.averageFocusPerCalendarDay),
                })}
              </div>
            </div>

            <div className="p-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 rounded-lg">
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                {t('stats.month.peakDayLabel')}
              </div>
              <div
                data-testid="stats-month-peak"
                className="text-xs font-bold font-mono text-slate-900 dark:text-slate-100 tabular-nums mt-1"
              >
                {monthSummary.peakDay
                  ? t('stats.month.peakDayValue', {
                      date: monthSummary.peakDay.dateISO.slice(5),
                      mins: monthSummary.peakDay.focusMinutes,
                    })
                  : t('stats.noRateValue')}
              </div>
              <div className="text-[10px] font-mono text-amber-600 dark:text-amber-400 tabular-nums mt-0.5">
                +{formatRewardAmount(monthSummary.coins)} C · +{formatRewardAmount(monthSummary.xp)}{' '}
                {t('header.xpLabel')}
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <h2 className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              {t('stats.month.chartTitle')}
            </h2>
            <StatsBarChart
              bars={monthDaysToBars(monthSummary, todayDateKey)}
              highlightKey={todayDateKey}
              ariaLabel={t('stats.chart.ariaLabel')}
              emptyLabel={t('stats.chart.empty')}
              tooltipFormatter={chartTooltipFormatter}
            />
          </div>
        </section>
      )}

      {/* YEAR TAB */}
      {period === 'year' && (
        <section data-testid="stats-panel-year" className="space-y-3">
          <div className="flex items-center justify-between text-xs pb-1.5 border-b border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-1.5 font-semibold text-slate-800 dark:text-slate-200">
              <Calendar className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              <span>{t('stats.year.summaryTitle')}</span>
            </div>
            <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400 tabular-nums">
              {selectedYearKey}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div className="p-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 rounded-lg">
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                {t('stats.focusTimeLabel')}
              </div>
              <div className="text-lg font-bold font-mono text-slate-900 dark:text-slate-100 tabular-nums">
                {yearSummary.totalFocusMinutes}{' '}
                <span className="text-xs font-normal text-slate-500 font-sans">
                  {t('stats.minsUnit')}
                </span>
              </div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400 tabular-nums">
                {t('stats.sessionsCompletedSub', {
                  completed: yearSummary.completed,
                  abandoned: yearSummary.abandoned,
                })}
              </div>
            </div>

            <div className="p-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 rounded-lg">
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                {t('stats.month.activeDaysLabel')}
              </div>
              <div className="text-lg font-bold font-mono text-slate-900 dark:text-slate-100 tabular-nums">
                {yearSummary.activeDays}
              </div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400 tabular-nums">
                {t('stats.month.completionRateLabel')}:{' '}
                {yearSummary.completionRate === null
                  ? t('stats.noRateValue')
                  : `${Math.round(yearSummary.completionRate * 100)}%`}
              </div>
            </div>

            <div className="p-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 rounded-lg">
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                {t('stats.year.bestMonthLabel')}
              </div>
              <div
                data-testid="stats-year-best-month"
                className="text-xs font-bold font-mono text-slate-900 dark:text-slate-100 tabular-nums mt-1"
              >
                {yearSummary.bestMonth
                  ? t('stats.year.bestMonthValue', {
                      month: getMonthShortLabel(yearSummary.bestMonth.monthNumber, t),
                      mins: yearSummary.bestMonth.focusMinutes,
                    })
                  : t('stats.noRateValue')}
              </div>
            </div>

            <div className="p-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 rounded-lg">
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                {t('stats.coinsEarnedLabel')} · {t('stats.xpEarnedLabel')}
              </div>
              <div className="text-xs font-bold font-mono tabular-nums mt-1">
                <span className="text-amber-600 dark:text-amber-400">
                  +{formatRewardAmount(yearSummary.coins)} C
                </span>
                <span className="mx-1 text-slate-400">·</span>
                <span className="text-indigo-600 dark:text-indigo-400">
                  +{formatRewardAmount(yearSummary.xp)} {t('header.xpLabel')}
                </span>
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <h2 className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              {t('stats.year.chartTitle')}
            </h2>
            <StatsBarChart
              bars={yearMonthsToBars(yearSummary, todayMonthKey, t)}
              highlightKey={todayMonthKey}
              ariaLabel={t('stats.chart.ariaLabel')}
              emptyLabel={t('stats.chart.empty')}
              tooltipFormatter={chartTooltipFormatter}
            />
          </div>
        </section>
      )}

      {/* Focus Streak Card (Elder's Hut FOCUS_STAT_UNLOCK gate) */}
      <section
        data-testid="stats-focus-streak-card"
        data-unlocked={isStreakUnlocked ? 'true' : 'false'}
        className={`rounded-lg border p-3 space-y-1.5 ${
          isStreakUnlocked
            ? 'bg-slate-50 dark:bg-slate-800/80 border-slate-200/90 dark:border-slate-700/80'
            : 'bg-slate-100/70 dark:bg-slate-900/60 border-slate-200/70 dark:border-slate-800 opacity-85'
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-200">
            {isStreakUnlocked ? (
              <Flame className="w-4 h-4 text-amber-500 shrink-0" />
            ) : (
              <Lock className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            )}
            <span>{t('stats.streak.title')}</span>
          </div>
          <span
            className={`text-[11px] font-semibold ${
              isStreakUnlocked
                ? 'text-emerald-700 dark:text-emerald-400'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            {isStreakUnlocked
              ? t('stats.streak.unlockedBadge')
              : t('stats.streak.lockedBadge')}
          </span>
        </div>

        {isStreakUnlocked ? (
          <div className="grid grid-cols-2 gap-2 pt-0.5">
            <div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                {t('stats.streak.currentLabel')}
              </div>
              <div
                data-testid="stats-focus-streak-current"
                className="text-base font-bold font-mono text-slate-900 dark:text-slate-100 tabular-nums"
              >
                {t('stats.streak.daysCount', { count: focusStreak.current })}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                {t('stats.streak.longestLabel')}
              </div>
              <div
                data-testid="stats-focus-streak-longest"
                className="text-base font-bold font-mono text-slate-900 dark:text-slate-100 tabular-nums"
              >
                {t('stats.streak.daysCount', { count: focusStreak.longest })}
              </div>
            </div>
          </div>
        ) : (
          <p
            data-testid="stats-focus-streak-locked-hint"
            className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed"
          >
            {t('stats.streak.lockedHint', { building: unlockingBuildingName })}
          </p>
        )}
      </section>

      {/* Boundary & Persistence Notes */}
      <div className="p-2.5 bg-slate-50/60 dark:bg-slate-900/40 border border-slate-200/60 dark:border-slate-800 rounded-lg text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed space-y-1">
        <p>{t('stats.focusRewardsNote')}</p>
        <p>{t('stats.persistenceNote')}</p>
      </div>
    </div>
  );
};
