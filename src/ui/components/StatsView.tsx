import React from 'react';
import { Clock, CheckCircle2, Coins, Award, Calendar } from 'lucide-react';
import { DailyStatRecord } from '../../types/storageSchema.ts';
import { formatRewardAmount } from '../utils/formatters.ts';
import { useTranslation } from '../../i18n/I18nContext.tsx';

interface StatsViewProps {
  todayStats: DailyStatRecord | null;
}

export const StatsView: React.FC<StatsViewProps> = ({ todayStats }) => {
  const { t } = useTranslation();
  const dateStr = todayStats?.date || new Date().toISOString().slice(0, 10);
  const totalMinutes = todayStats?.totalFocusMinutes || 0;
  const completed = todayStats?.completedSessions || 0;
  const abandoned = todayStats?.abandonedSessions || 0;
  const coins = todayStats?.coinsEarned || 0;
  const xp = todayStats?.xpEarned || 0;

  return (
    <div className="flex-1 flex flex-col p-4 space-y-4">
      {/* Date header */}
      <div className="flex items-center justify-between text-xs pb-2 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-1.5 font-semibold text-slate-800 dark:text-slate-200">
          <Calendar className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
          <span>{t('stats.todaySummaryTitle')}</span>
        </div>
        <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400 tabular-nums">
          {dateStr}
        </span>
      </div>

      {/* Main KPI Grid */}
      <div className="grid grid-cols-2 gap-2.5">
        {/* Total Focus Time */}
        <div className="p-3 bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 rounded-lg">
          <div className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400 mb-1">
            <Clock className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
            <span>{t('stats.focusTimeLabel')}</span>
          </div>
          <div className="text-xl font-bold font-mono text-slate-900 dark:text-slate-100 tabular-nums">
            {totalMinutes}{' '}
            <span className="text-xs font-normal text-slate-500 font-sans">
              {t('stats.minsUnit')}
            </span>
          </div>
        </div>

        {/* Sessions Completed vs Abandoned */}
        <div className="p-3 bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 rounded-lg">
          <div className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400 mb-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>{t('stats.questsFinishedLabel')}</span>
          </div>
          <div className="text-xl font-bold font-mono text-slate-900 dark:text-slate-100 tabular-nums flex items-baseline gap-2">
            <span>{completed}</span>
            {abandoned > 0 && (
              <span className="text-xs font-normal text-rose-500 dark:text-rose-400 font-sans">
                {t('stats.forfeitedCount', { count: abandoned })}
              </span>
            )}
          </div>
        </div>

        {/* Coins Earned Today */}
        <div className="p-3 bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 rounded-lg">
          <div className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400 mb-1">
            <Coins className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
            <span>{t('stats.coinsEarnedLabel')}</span>
          </div>
          <div className="text-xl font-bold font-mono text-amber-600 dark:text-amber-400 tabular-nums">
            +{formatRewardAmount(coins)}
          </div>
        </div>

        {/* XP Earned Today */}
        <div className="p-3 bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 rounded-lg">
          <div className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400 mb-1">
            <Award className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
            <span>{t('stats.xpEarnedLabel')}</span>
          </div>
          <div className="text-xl font-bold font-mono text-indigo-600 dark:text-indigo-400 tabular-nums">
            +{formatRewardAmount(xp)}
          </div>
        </div>
      </div>

      {/* Persistence Note */}
      <div className="p-3 bg-slate-50/60 dark:bg-slate-900/40 border border-slate-200/60 dark:border-slate-800 rounded-lg text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
        {t('stats.persistenceNote')}
      </div>
    </div>
  );
};
