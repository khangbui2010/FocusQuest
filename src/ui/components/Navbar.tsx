import React from 'react';
import { ScrollText, Timer, Map as MapIcon, Trophy, BarChart3 } from 'lucide-react';
import { SessionSnapshot } from '../../types/session.ts';
import { useTranslation } from '../../i18n/I18nContext.tsx';

export type ActiveTab = 'quests' | 'focus' | 'map' | 'awards' | 'stats';

export interface NavbarProps {
  activeTab: ActiveTab;
  onChangeTab: (tab: ActiveTab) => void;
  isSessionActive: boolean;
  session?: SessionSnapshot | null;
  unclaimedQuestCount?: number;
  unseenAwardCount?: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  onChangeTab,
  isSessionActive,
  session,
  unclaimedQuestCount = 0,
  unseenAwardCount = 0,
}) => {
  const { t } = useTranslation();

  const safeUnclaimedCount =
    typeof unclaimedQuestCount === 'number' && Number.isFinite(unclaimedQuestCount)
      ? Math.max(0, Math.floor(unclaimedQuestCount))
      : 0;
  const unclaimedBadgeText = safeUnclaimedCount > 9 ? '9+' : String(safeUnclaimedCount);

  const safeUnseenAwardCount =
    typeof unseenAwardCount === 'number' && Number.isFinite(unseenAwardCount)
      ? Math.max(0, Math.floor(unseenAwardCount))
      : 0;
  const unseenAwardBadgeText = safeUnseenAwardCount > 9 ? '9+' : String(safeUnseenAwardCount);

  const isPaused = session?.status === 'PAUSED';
  const isBreakPhase = Boolean(
    !isPaused &&
      session &&
      (session.mode === 'POMODORO_COUNTDOWN' || session.mode === 'POMODORO_STOPWATCH') &&
      session.pomodoroState &&
      session.pomodoroState.currentPhase !== 'FOCUS'
  );

  const sessionStatusLabel = isPaused
    ? t('nav.sessionStatus.paused')
    : isBreakPhase
    ? t('nav.sessionStatus.rest')
    : t('nav.sessionStatus.focus');

  const statusDotClass = isPaused
    ? 'bg-amber-400 animate-pulse'
    : isBreakPhase
    ? 'bg-cyan-300 animate-pulse'
    : 'bg-emerald-400 animate-pulse';

  const handleSelectTab = (tab: ActiveTab) => {
    if (activeTab === tab) return;
    onChangeTab(tab);
  };

  const tabClassName = (isActive: boolean, isCenterMap = false) =>
    `flex flex-col items-center justify-center gap-0.5 select-none transition-all duration-150 motion-reduce:transition-none cursor-pointer ${
      isCenterMap ? 'h-[48px] px-2' : 'h-[44px] px-1'
    } ${
      isActive
        ? `-translate-y-2 bg-indigo-600 text-white ${
            isCenterMap ? 'rounded-2xl shadow-lg' : 'rounded-xl shadow-md'
          }`
        : 'rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-100/80 dark:hover:bg-slate-800/70 hover:text-slate-900 dark:hover:text-slate-100'
    }`;

  return (
    <nav
      aria-label={t('nav.ariaLabel')}
      data-testid="bottom-navbar"
      className="relative h-[64px] shrink-0 bg-transparent flex flex-col justify-end"
    >
      <div className="h-[56px] w-full border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-1.5 pb-1 grid grid-cols-[1fr_1fr_1.6fr_1fr_1fr] gap-1 items-end">
        {/* 1. Quests */}
        <button
          type="button"
          data-testid="nav-tab-quests"
          data-active={activeTab === 'quests' ? 'true' : 'false'}
          aria-current={activeTab === 'quests' ? 'page' : undefined}
          aria-label={
            safeUnclaimedCount > 0
              ? `${t('nav.quests')} · ${t('nav.questsBadgeAria', { count: safeUnclaimedCount })}`
              : t('nav.quests')
          }
          onClick={() => handleSelectTab('quests')}
          className={tabClassName(activeTab === 'quests')}
        >
          <span className="relative inline-flex items-center justify-center">
            <ScrollText className="w-5 h-5 shrink-0" />
            {safeUnclaimedCount > 0 && (
              <span
                data-testid="quest-unclaimed-badge"
                className="absolute -top-1.5 -right-2.5 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold leading-4 text-center tabular-nums shadow-sm"
              >
                {unclaimedBadgeText}
              </span>
            )}
          </span>
          <span className="text-[10px] font-medium leading-none whitespace-nowrap">
            {t('nav.quests')}
          </span>
        </button>

        {/* 2. Focus */}
        <button
          type="button"
          data-testid="nav-tab-focus"
          data-active={activeTab === 'focus' ? 'true' : 'false'}
          aria-current={activeTab === 'focus' ? 'page' : undefined}
          aria-label={
            isSessionActive
              ? `${t('nav.focus')} · ${sessionStatusLabel}`
              : t('nav.focus')
          }
          title={isSessionActive ? t('nav.sessionStatus.activeTitle') : t('nav.focus')}
          onClick={() => handleSelectTab('focus')}
          className={tabClassName(activeTab === 'focus')}
        >
          {isSessionActive ? (
            <>
              <span
                data-testid="nav-focus-status-dot"
                className={`w-2.5 h-2.5 rounded-full shrink-0 my-1 ${statusDotClass}`}
              />
              <span className="text-[10px] font-semibold leading-none whitespace-nowrap">
                {sessionStatusLabel}
              </span>
            </>
          ) : (
            <>
              <Timer className="w-5 h-5 shrink-0" />
              <span className="text-[10px] font-medium leading-none whitespace-nowrap">
                {t('nav.focus')}
              </span>
            </>
          )}
        </button>

        {/* 3. Map (Default, Centered & Widest 1.6fr) */}
        <button
          type="button"
          data-testid="nav-tab-map"
          data-active={activeTab === 'map' ? 'true' : 'false'}
          aria-current={activeTab === 'map' ? 'page' : undefined}
          onClick={() => handleSelectTab('map')}
          className={tabClassName(activeTab === 'map', true)}
        >
          <MapIcon className="w-6 h-6 shrink-0" />
          <span className="text-[11px] font-bold leading-none whitespace-nowrap">
            {t('nav.map')}
          </span>
        </button>

        {/* 4. Awards */}
        <button
          type="button"
          data-testid="nav-tab-awards"
          data-active={activeTab === 'awards' ? 'true' : 'false'}
          aria-current={activeTab === 'awards' ? 'page' : undefined}
          aria-label={
            safeUnseenAwardCount > 0
              ? `${t('nav.awards')} · ${t('nav.awardsBadgeAria', { count: safeUnseenAwardCount })}`
              : t('nav.awards')
          }
          onClick={() => handleSelectTab('awards')}
          className={tabClassName(activeTab === 'awards')}
        >
          <span className="relative inline-flex items-center justify-center">
            <Trophy className="w-5 h-5 shrink-0" />
            {safeUnseenAwardCount > 0 && (
              <span
                data-testid="awards-unseen-badge"
                className="absolute -top-1.5 -right-2.5 min-w-[16px] h-4 px-1 rounded-full bg-amber-500 text-white text-[10px] font-bold leading-4 text-center tabular-nums shadow-sm"
              >
                {unseenAwardBadgeText}
              </span>
            )}
          </span>
          <span className="text-[10px] font-medium leading-none whitespace-nowrap">
            {t('nav.awards')}
          </span>
        </button>

        {/* 5. Stats */}
        <button
          type="button"
          data-testid="nav-tab-stats"
          data-active={activeTab === 'stats' ? 'true' : 'false'}
          aria-current={activeTab === 'stats' ? 'page' : undefined}
          onClick={() => handleSelectTab('stats')}
          className={tabClassName(activeTab === 'stats')}
        >
          <BarChart3 className="w-5 h-5 shrink-0" />
          <span className="text-[10px] font-medium leading-none whitespace-nowrap">
            {t('nav.stats')}
          </span>
        </button>
      </div>
    </nav>
  );
};
