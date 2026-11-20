import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Flame,
  Award,
  Coins,
  Shield,
  ArrowRight,
  Info,
  ChevronUp,
  ChevronDown,
  Coffee,
  Sparkles,
  Repeat,
  SkipForward,
  Bell,
  BellOff,
} from 'lucide-react';
import {
  SessionSnapshot,
  SessionMode,
  PomodoroConfig,
  PomodoroPhase,
  DEFAULT_POMODORO_CONFIG,
} from '../../types/session.ts';
import { FocusProfile } from '../../types/profiles.ts';
import {
  TimeCalculator,
  MAX_PAUSE_DURATION_MS,
  getFrozenSessionFocusMinutes,
  isTerminalSessionStatus,
  resolveSessionEndTimestamp,
} from '../../core/timer/timeCalculator.ts';
import { DEFAULT_REWARD_CONFIG } from '../../core/reward/rewardEngine.ts';
import {
  getSessionRewardPreview,
  getSessionRewardPreviewFromSnapshot,
} from '../../core/reward/rewardPreview.ts';
import { formatRewardAmount } from '../utils/formatters.ts';
import { soundEffects, isChimeEnabled, playPhaseTransitionChime } from '../services/soundEffects.ts';
import { extractBuildingCoinBonuses } from '../../core/civilization/civilizationBonusHelper.ts';
import { aggregateCoinBonus } from '../../core/economy/coinBonus.ts';
import { getCivilizationStateClient, sendExtensionMessage } from '../services/extensionClient.ts';
import { useTranslation } from '../../i18n/I18nContext.tsx';
import { CivilizationEra } from '../../core/civilization/buildingTypes.ts';
import { DurationPresetChips } from './DurationPresetChips.tsx';
import { FocusSceneArea, resolveFocusSceneState } from './FocusSceneArea.tsx';
import { getSessionModeLabel } from '../utils/sessionModeLabel.ts';
import {
  localizeErrorMessage,
  toUiErrorPayload,
  UiErrorPayload,
} from '../../i18n/errorTranslator.ts';

const POMO_CONFIG_STORAGE_KEY = 'fq_pomodoro_config';

const getInitialPomodoroConfig = (): PomodoroConfig => {
  try {
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem(POMO_CONFIG_STORAGE_KEY) : null;
    if (saved) {
      const parsed = JSON.parse(saved);
      const validation = TimeCalculator.validatePomodoroConfig(parsed);
      if (validation.valid) {
        return validation.config;
      }
    }
  } catch {
    // fallback
  }
  return DEFAULT_POMODORO_CONFIG;
};

interface ConfigRowProps {
  icon: React.ReactNode;
  label: string;
  valueDisplay: string;
  onDecrease: () => void;
  onIncrease: () => void;
  isDecreaseDisabled: boolean;
  isIncreaseDisabled: boolean;
  decreaseAriaLabel: string;
  increaseAriaLabel: string;
}

const ConfigRow: React.FC<ConfigRowProps> = ({
  icon,
  label,
  valueDisplay,
  onDecrease,
  onIncrease,
  isDecreaseDisabled,
  isIncreaseDisabled,
  decreaseAriaLabel,
  increaseAriaLabel,
}) => {
  return (
    <div className="flex items-center justify-between py-2 px-3 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700/80 rounded-xl text-xs shadow-2xs hover:border-slate-300 dark:hover:border-slate-600 transition-colors">
      <div className="flex items-center gap-2 min-w-0 pr-2">
        <div className="shrink-0">{icon}</div>
        <span className="font-medium text-slate-700 dark:text-slate-200 truncate">
          {label}
        </span>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          aria-label={decreaseAriaLabel}
          disabled={isDecreaseDisabled}
          onClick={onDecrease}
          className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-95 text-slate-700 dark:text-slate-200 border border-slate-200/60 dark:border-slate-700/60 disabled:opacity-25 disabled:pointer-events-none transition-all flex items-center justify-center font-bold text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500 cursor-pointer disabled:cursor-not-allowed"
        >
          -
        </button>

        <span className="w-10 text-center font-mono font-bold text-slate-900 dark:text-slate-100 text-xs tabular-nums select-none">
          {valueDisplay}
        </span>

        <button
          type="button"
          aria-label={increaseAriaLabel}
          disabled={isIncreaseDisabled}
          onClick={onIncrease}
          className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-95 text-slate-700 dark:text-slate-200 border border-slate-200/60 dark:border-slate-700/60 disabled:opacity-25 disabled:pointer-events-none transition-all flex items-center justify-center font-bold text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500 cursor-pointer disabled:cursor-not-allowed"
        >
          +
        </button>
      </div>
    </div>
  );
};

interface TimerViewProps {
  session: SessionSnapshot | null;
  activeProfile: FocusProfile | null;
  era?: CivilizationEra | string;
  activeBonusRate?: number;
  isBonusLoading?: boolean;
  onStartSession: (
    mode: SessionMode,
    targetMinutes: number,
    pomodoroConfig?: PomodoroConfig
  ) => Promise<void>;
  onPauseSession: () => Promise<void>;
  onResumeSession: () => Promise<void>;
  onGiveUpSession: () => Promise<void>;
  onFinishStopwatch: () => Promise<void>;
  onSkipBreak?: () => Promise<void>;
  onAdvancePomodoroStage?: () => Promise<void>;
  onResetSession: () => Promise<void>;
  onRefreshSession: () => Promise<void>;
  isLoading: boolean;
  initialActionError?: string | null;
  onOpenProfiles: () => void;
  chimeEnabled?: boolean;
  onToggleChime?: (enabled: boolean) => Promise<void> | void;
}

export const TimerView: React.FC<TimerViewProps> = ({
  session,
  activeProfile,
  era = 'STONE_AGE',
  activeBonusRate: propBonusRate,
  isBonusLoading: propBonusLoading,
  onStartSession,
  onPauseSession,
  onResumeSession,
  onGiveUpSession,
  onFinishStopwatch,
  onSkipBreak,
  onAdvancePomodoroStage,
  onResetSession,
  onRefreshSession,
  isLoading,
  initialActionError = null,
  onOpenProfiles,
  chimeEnabled: propChimeEnabled,
  onToggleChime,
}) => {
  const { locale, t } = useTranslation();
  const [localChimeEnabled, setLocalChimeEnabled] = useState<boolean>(
    isChimeEnabled({ chimeEnabled: propChimeEnabled })
  );

  useEffect(() => {
    setLocalChimeEnabled(isChimeEnabled({ chimeEnabled: propChimeEnabled }));
  }, [propChimeEnabled]);

  const effectiveChimeEnabled =
    propChimeEnabled !== undefined ? isChimeEnabled({ chimeEnabled: propChimeEnabled }) : localChimeEnabled;

  useEffect(() => {
    soundEffects.setChimeEnabled(effectiveChimeEnabled);
  }, [effectiveChimeEnabled]);

  const handleToggleChime = async () => {
    const nextEnabled = !effectiveChimeEnabled;
    setLocalChimeEnabled(nextEnabled);
    if (onToggleChime) {
      await onToggleChime(nextEnabled);
    } else {
      await sendExtensionMessage({
        action: 'SET_CHIME_ENABLED',
        payload: { enabled: nextEnabled },
      });
    }
  };
  // Mode selection state: Countdown | Stopwatch | Pomodoro
  const [selectedPrimaryTab, setSelectedPrimaryTab] = useState<'COUNTDOWN' | 'STOPWATCH' | 'POMODORO'>('COUNTDOWN');
  const [pomodoroSubMode, setPomodoroSubMode] = useState<'POMODORO_COUNTDOWN' | 'POMODORO_STOPWATCH'>('POMODORO_COUNTDOWN');
  const [targetMinutes, setTargetMinutes] = useState<number>(25);

  // Civilization CoinBonus state for Timer Setup preview
  const [internalBonusRate, setInternalBonusRate] = useState<number | null>(
    propBonusRate !== undefined ? propBonusRate : null
  );
  const [isBonusLoading, setIsBonusLoading] = useState<boolean>(
    propBonusLoading !== undefined ? propBonusLoading : propBonusRate === undefined
  );

  useEffect(() => {
    if (propBonusRate !== undefined) {
      setInternalBonusRate(propBonusRate);
      setIsBonusLoading(false);
      return;
    }
    let isMounted = true;
    setIsBonusLoading(true);
    getCivilizationStateClient()
      .then((res) => {
        if (isMounted && res.success && res.data) {
          const bonuses = extractBuildingCoinBonuses(res.data.buildings);
          const rate = aggregateCoinBonus(bonuses);
          setInternalBonusRate(rate);
        } else if (isMounted) {
          setInternalBonusRate(0);
        }
      })
      .catch(() => {
        if (isMounted) setInternalBonusRate(0);
      })
      .finally(() => {
        if (isMounted) setIsBonusLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [propBonusRate]);

  const activeBonusRate = internalBonusRate ?? 0;

  // Pomodoro custom config state with persistent restore
  const [pomoConfig, setPomoConfig] = useState<PomodoroConfig>(getInitialPomodoroConfig);

  // Sync with session if active pomodoro session has custom config
  useEffect(() => {
    if (session?.pomodoroConfig) {
      setPomoConfig((prev) => ({
        ...prev,
        ...session.pomodoroConfig,
      }));
    }
  }, [session?.pomodoroConfig]);

  // Persist pomodoro config changes to localStorage
  useEffect(() => {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(POMO_CONFIG_STORAGE_KEY, JSON.stringify(pomoConfig));
      }
    } catch {
      // ignore
    }
  }, [pomoConfig]);

  // Modal confirm states
  const [showGiveUpConfirm, setShowGiveUpConfirm] = useState<boolean>(false);
  const [showStopwatchConfirm, setShowStopwatchConfirm] = useState<boolean>(false);
  const [actionError, setActionError] = useState<UiErrorPayload | null>(() =>
    initialActionError ? { message: initialActionError } : null
  );
  const [isExiting, setIsExiting] = useState<boolean>(false);
  const exitingRef = useRef<boolean>(false);

  useEffect(() => {
    setActionError(initialActionError ? { message: initialActionError } : null);
  }, [initialActionError, session?.id, session?.status]);

  // Periodic 1-second tick ONLY while session is active (RUNNING or PAUSED).
  // Terminal outcomes (COMPLETED / ABANDONED / INTERRUPTED) and IDLE never run a live clock ticker.
  const isActiveTimer = Boolean(
    session && (session.status === 'RUNNING' || session.status === 'PAUSED')
  );
  const isTerminalSession = Boolean(session && isTerminalSessionStatus(session.status));
  const [currentTime, setCurrentTime] = useState<number>(() => Date.now());

  useEffect(() => {
    if (!isActiveTimer) {
      return;
    }
    setCurrentTime(Date.now());
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, [isActiveTimer, session?.id, session?.status]);

  // Track phase transitions for audio cues
  const lastPhaseRef = useRef<PomodoroPhase | null>(null);
  useEffect(() => {
    if (!session || !session.pomodoroState) {
      lastPhaseRef.current = null;
      return;
    }
    const currentPhase = session.pomodoroState.currentPhase;
    if (lastPhaseRef.current && lastPhaseRef.current !== currentPhase) {
      playPhaseTransitionChime(currentPhase, { chimeEnabled: effectiveChimeEnabled }, soundEffects);
    }
    lastPhaseRef.current = currentPhase;
  }, [session?.pomodoroState?.currentPhase, effectiveChimeEnabled]);

  const effectiveCurrentTime = useMemo(() => {
    if (!session || session.status === 'IDLE') {
      return 0;
    }
    if (isTerminalSession) {
      return resolveSessionEndTimestamp(session);
    }
    return currentTime;
  }, [session, isTerminalSession, currentTime]);

  // Compute wall-clock elapsed time (live when active, frozen at completion timestamp when terminal)
  const elapsed = useMemo(() => {
    if (!session || session.status === 'IDLE') {
      return null;
    }
    return TimeCalculator.calculateElapsedTime({
      startedAt: session.startedAt,
      currentTime: effectiveCurrentTime,
      status: session.status,
      currentPauseStartedAt: isTerminalSession ? null : session.currentPauseStartedAt,
      totalCompletedPauseMs: session.totalPauseMs,
      completedAt: session.completedAt,
    });
  }, [session, effectiveCurrentTime, isTerminalSession]);

  // Pomodoro phase time calculation (active phases only)
  const pomodoroPhaseCalc = useMemo(() => {
    if (!session || !session.pomodoroState || !session.pomodoroConfig || isTerminalSession) {
      return null;
    }
    return TimeCalculator.calculatePomodoroPhaseTime({
      phaseStartedAt: session.pomodoroState.phaseStartedAt,
      currentTime: effectiveCurrentTime,
      phaseTargetMinutes: session.pomodoroState.phaseTargetDurationMinutes,
      phaseTotalPauseMs: session.pomodoroState.phaseTotalPauseMs,
      currentPauseStartedAt: session.currentPauseStartedAt,
    });
  }, [session, effectiveCurrentTime, isTerminalSession]);

  // Authoritative background sync when countdown target or break target is reached
  useEffect(() => {
    if (!session) return;
    if (session.status === 'RUNNING') {
      if (session.mode === 'COUNTDOWN') {
        const targetMs = session.targetMinutes * 60 * 1000;
        if (elapsed && elapsed.actualFocusMs >= targetMs) {
          onRefreshSession();
        }
      } else if (
        (session.mode === 'POMODORO_COUNTDOWN' || session.mode === 'POMODORO_STOPWATCH') &&
        pomodoroPhaseCalc?.isPhaseCompleted
      ) {
        if (session.pomodoroState?.currentPhase === 'FOCUS') {
          console.log('[POMODORO] Focus countdown reached zero');
        }
        if (onAdvancePomodoroStage) {
          onAdvancePomodoroStage().catch(() => onRefreshSession());
        } else {
          onRefreshSession();
        }
      }
    } else if (session.status === 'PAUSED' && elapsed?.isAutoResumeDue) {
      onRefreshSession();
    }
  }, [
    session,
    elapsed?.actualFocusMs,
    elapsed?.isAutoResumeDue,
    pomodoroPhaseCalc?.isPhaseCompleted,
    onRefreshSession,
  ]);

  // Format millisecond time to MM:SS or HH:MM:SS
  const formatTime = (ms: number): string => {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const pad = (n: number) => n.toString().padStart(2, '0');
    if (hours > 0) {
      return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    }
    return `${pad(minutes)}:${pad(seconds)}`;
  };

  const handleAction = async (fn: () => Promise<void>) => {
    setActionError(null);
    try {
      await fn();
    } catch (err) {
      setActionError(toUiErrorPayload(err));
    }
  };

  const handleExitClick = async () => {
    if (exitingRef.current || isLoading) return;
    exitingRef.current = true;
    setIsExiting(true);
    setActionError(null);
    try {
      await onResetSession();
    } catch (err) {
      setActionError(toUiErrorPayload(err, 'EXIT_SESSION_FAILED', 'Failed to exit session.'));
    } finally {
      exitingRef.current = false;
      setIsExiting(false);
    }
  };

  // -------------------------------------------------------------
  // STATE 1: COMPLETED, ABANDONED, or INTERRUPTED (Terminal Outcomes)
  // -------------------------------------------------------------
  if (
    session &&
    (session.status === 'COMPLETED' ||
      session.status === 'ABANDONED' ||
      session.status === 'INTERRUPTED')
  ) {
    const isCompleted = session.status === 'COMPLETED';
    const isInterrupted = session.status === 'INTERRUPTED';
    const isCountdown = session.mode === 'COUNTDOWN';
    const isPomoCountdown = session.mode === 'POMODORO_COUNTDOWN';
    const isPomoStopwatch = session.mode === 'POMODORO_STOPWATCH';
    const isPomodoro = isPomoCountdown || isPomoStopwatch;
    const focusMinutes = getFrozenSessionFocusMinutes(session);

    const outcomePreview = getSessionRewardPreviewFromSnapshot(session, {
      actualFocusMinutes: focusMinutes,
      coinBonusRate: activeBonusRate,
    });
    const multiplier = outcomePreview.multiplier;
    const earnedCoins = outcomePreview.coins;
    const earnedXp = outcomePreview.xp;
    const showOutcomeBonusBadge =
      isCompleted && earnedCoins > 0 && activeBonusRate > 0;

    const completedIntervals = session.pomodoroState?.completedFocusCount ?? 0;
    const totalPomoFocusMins = session.pomodoroState?.totalCompletedFocusMinutes ?? focusMinutes;
    const outcomePomoConfig = session.pomodoroConfig;
    const outcomeIntervalsPerCycle =
      outcomePomoConfig?.focusIntervalsPerCycle ?? outcomePomoConfig?.targetFocusSessions;
    const outcomeNumberOfCycles = outcomePomoConfig?.numberOfCycles;
    const totalPlannedIntervals =
      isPomoCountdown &&
      typeof outcomeIntervalsPerCycle === 'number' &&
      outcomeIntervalsPerCycle > 0 &&
      typeof outcomeNumberOfCycles === 'number' &&
      outcomeNumberOfCycles > 0
        ? outcomeIntervalsPerCycle * outcomeNumberOfCycles
        : null;

    return (
      <div
        data-testid="timer-outcome-view"
        data-session-status={session.status}
        className="flex-1 min-h-0 flex flex-col items-center justify-center p-6 text-center overflow-y-auto animate-fade-in"
      >
        <div
          className={`w-14 h-14 rounded-full flex items-center justify-center mb-4 ${
            isCompleted
              ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400'
              : 'bg-amber-100 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400'
          }`}
        >
          {isCompleted ? <CheckCircle2 className="w-8 h-8" /> : <AlertTriangle className="w-8 h-8" />}
        </div>

        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-1">
          {isCompleted ? t('timer.outcome.completedTitle') : t('timer.outcome.endedTitle')}
        </h2>

        <p className="text-xs text-slate-500 dark:text-slate-400 max-w-[280px] mb-5 leading-relaxed">
          {isCompleted
            ? isPomodoro
              ? t('timer.outcome.pomoCompletedDesc', {
                  count: completedIntervals,
                  minutes: totalPomoFocusMins,
                })
              : isCountdown
              ? t('timer.outcome.countdownCompletedDesc', {
                  minutes: session.targetMinutes,
                  multiplier: multiplier.toFixed(1),
                })
              : t('timer.outcome.stopwatchCompletedDesc', {
                  minutes: focusMinutes,
                  multiplier: multiplier.toFixed(1),
                })
            : isPomoCountdown
            ? t('timer.outcome.pomoCountdownIncompleteDesc')
            : isPomoStopwatch &&
              isInterrupted &&
              (session.interruptedReason === 'EXTENSION_DISABLED' ||
                session.interruptedReason === 'EXTENSION_RELOADED')
            ? t('timer.outcome.pomoStopwatchInterruptedForfeitedDesc')
            : isPomoStopwatch && completedIntervals > 0 && (earnedCoins > 0 || earnedXp > 0)
            ? t('timer.outcome.pomoEndedRetainedDesc', { count: completedIntervals })
            : isInterrupted
            ? t('timer.outcome.endedInterruptedDesc')
            : t('timer.outcome.endedEarlyDesc')}
        </p>

        {/* Stats card */}
        <div className="w-full max-w-[280px] bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 rounded-lg p-3.5 mb-5">
          <div className="grid grid-cols-2 gap-3 text-center">
            <div className="border-r border-slate-200 dark:border-slate-700 pr-2">
              <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                {isPomodoro
                  ? t('timer.outcome.completedIntervalsLabel')
                  : t('timer.outcome.focusTimeLabel')}
              </span>
              <span className="text-base font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                {isPomodoro
                  ? !isCompleted && isPomoCountdown && totalPlannedIntervals !== null
                    ? `${completedIntervals} / ${totalPlannedIntervals} (${totalPomoFocusMins}m)`
                    : `${completedIntervals} (${totalPomoFocusMins}m)`
                  : isCountdown && isCompleted
                  ? `${session.targetMinutes}m`
                  : `${focusMinutes}m`}
              </span>
            </div>
            <div>
              <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                {t('timer.outcome.rewardsLabel')}
              </span>
              <div className="flex items-center justify-center flex-wrap gap-2 mt-0.5">
                <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-1 tabular-nums">
                  <Coins className="w-3 h-3 shrink-0" /> +{formatRewardAmount(earnedCoins)}
                  {showOutcomeBonusBadge && (
                    <span
                      data-testid="outcome-coin-bonus-chip"
                      className="text-[10px] text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/60 px-1 py-0.2 rounded font-medium tabular-nums"
                    >
                      +{formatRewardAmount(activeBonusRate * 100)}%
                    </span>
                  )}
                </span>
                <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 flex items-center gap-0.5 tabular-nums">
                  <Award className="w-3 h-3 shrink-0" /> +{formatRewardAmount(earnedXp)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {actionError && (
          <div
            data-testid="outcome-exit-error"
            role="alert"
            className="w-full max-w-[280px] mb-3 px-3 py-2 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 text-xs text-rose-700 dark:text-rose-300"
          >
            {localizeErrorMessage(locale, actionError.message, actionError.code, actionError.params)}
          </div>
        )}

        <button
          type="button"
          data-testid="outcome-exit-btn"
          onClick={() => void handleExitClick()}
          disabled={isLoading || isExiting}
          className="w-full max-w-[280px] py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-xs font-medium rounded-lg transition-colors shadow-sm disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
        >
          {t('timer.outcome.exitSession')}
        </button>
      </div>
    );
  }

  // -------------------------------------------------------------
  // STATE 2: RUNNING or PAUSED (Active Session)
  // -------------------------------------------------------------
  if (session && (session.status === 'RUNNING' || session.status === 'PAUSED')) {
    const isPaused = session.status === 'PAUSED';
    const isPomodoro = session.mode === 'POMODORO_COUNTDOWN' || session.mode === 'POMODORO_STOPWATCH';
    const isCountdown = session.mode === 'COUNTDOWN';
    const pState = session.pomodoroState;
    const pConfig = session.pomodoroConfig;

    let mainDisplayMs = 0;
    let progressPercent = 0;

    if (isPomodoro && pState) {
      const currentTargetMins =
        pState.phaseTargetDurationMinutes > 0
          ? pState.phaseTargetDurationMinutes
          : pState.currentPhase === 'FOCUS'
          ? (pConfig?.focusIntervalDurationMinutes ?? pConfig?.focusDurationMinutes ?? 25)
          : (pState.currentPhase === 'LONG_BREAK'
          ? (pConfig?.longBreakDurationMinutes ?? 15)
          : (pConfig?.shortBreakDurationMinutes ?? 5));

      mainDisplayMs = pomodoroPhaseCalc?.remainingPhaseMs ?? 0;
      const targetMs = currentTargetMins * 60 * 1000;
      progressPercent = targetMs > 0 ? Math.min(100, Math.floor(((targetMs - mainDisplayMs) / targetMs) * 100)) : 0;
    } else if (isCountdown) {
      const countdownInfo = TimeCalculator.calculateCountdownRemaining(
        session.targetMinutes,
        elapsed ? elapsed.actualFocusMs : 0
      );
      mainDisplayMs = countdownInfo.remainingMs;
      const targetMs = session.targetMinutes * 60 * 1000;
      progressPercent = targetMs > 0 ? Math.min(100, Math.floor(((targetMs - mainDisplayMs) / targetMs) * 100)) : 0;
    } else {
      mainDisplayMs = elapsed ? elapsed.actualFocusMs : 0;
    }

    const actualFocusMins = elapsed ? elapsed.actualFocusMinutes : 0;
    const isBreakPhase = isPomodoro && pState && pState.currentPhase !== 'FOCUS';
    const isPomoCountdown = session.mode === 'POMODORO_COUNTDOWN';
    const isPomoStopwatch = session.mode === 'POMODORO_STOPWATCH';

    const livePreview = getSessionRewardPreviewFromSnapshot(session, {
      actualFocusMinutes: actualFocusMins,
      coinBonusRate: activeBonusRate,
    });
    const isStopwatchEligible = livePreview.isEligible;
    const liveCoins = livePreview.coins;
    const liveXp = livePreview.xp;
    const activeMultiplierDisplay = livePreview.multiplier;
    const showLiveBonusBadge = liveCoins > 0 && activeBonusRate > 0;

    const pauseTimeRemainingMs =
      isPaused && session.currentPauseStartedAt
        ? Math.max(0, MAX_PAUSE_DURATION_MS - (currentTime - session.currentPauseStartedAt))
        : 0;

    const pausesLeft = Math.max(0, 2 - session.pauseCount);
    const canPause = session.status === 'RUNNING' && session.pauseCount < 2;

    const pomoCompletedCount = pState?.completedFocusCount ?? 0;
    const pomoCompletedFocusMins = pState?.totalCompletedFocusMinutes ?? 0;

    const isEligibleForFinish = isPomoStopwatch ? pomoCompletedCount > 0 : isStopwatchEligible;
    const modalFinishCoins = liveCoins;
    const modalFinishXp = liveXp;
    const modalFinishMultiplier = activeMultiplierDisplay;

    const sceneState = resolveFocusSceneState(session);
    const sceneStatusLabel = isPaused
      ? t('timer.status.paused')
      : isBreakPhase
      ? t('timer.status.break')
      : t('timer.status.focusing');
    const modeLabel = getSessionModeLabel(session, t);
    const pauseTooltip = !canPause
      ? t('timer.actions.pauseDisabledTitle')
      : t('timer.actions.pauseTooltip', { count: pausesLeft });

    return (
      <div className="flex-1 min-h-0 flex flex-col gap-2.5 p-3 overflow-y-auto animate-fade-in">
        {/* Top Area: Placeholder FocusSceneArea with Status Chip (left) & Chime Toggle (right) */}
        <FocusSceneArea
          era={era}
          sceneState={sceneState}
          statusLabel={sceneStatusLabel}
          chimeEnabled={effectiveChimeEnabled}
          onToggleChime={handleToggleChime}
          chimeAriaLabel={
            effectiveChimeEnabled ? t('timer.chime.toggleAriaOn') : t('timer.chime.toggleAriaOff')
          }
          chimeTitle={
            effectiveChimeEnabled ? t('timer.chime.onLabel') : t('timer.chime.offLabel')
          }
        />

        {/* Compact Pause Auto-Resume Notice (shown only while PAUSED) */}
        {isPaused && (
          <div
            data-testid="pause-auto-resume-banner"
            className="shrink-0 flex items-center justify-center gap-1.5 px-2.5 py-1 bg-amber-50 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-800/60 rounded-lg text-amber-800 dark:text-amber-300 text-[11px] font-medium"
          >
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
            <span>
              {t('timer.pause.autoResumesIn')}{' '}
              <strong className="tabular-nums font-mono">{formatTime(pauseTimeRemainingMs)}</strong>
            </span>
          </div>
        )}

        {/* Compact 3-Row Control Card */}
        <div
          data-testid="running-control-card"
          className="shrink-0 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 rounded-xl px-3 py-2.5 space-y-2"
        >
          {/* Row 1: Mode Line */}
          <div
            data-testid="running-mode-label"
            className="text-[11px] font-medium text-slate-600 dark:text-slate-300 text-center truncate"
          >
            {modeLabel}
          </div>

          {/* Row 2: 3-Column Controls [Left Button | Clock | Right Button] */}
          <div
            data-testid="running-controls-row"
            className="grid grid-cols-[1fr_auto_1fr] items-center gap-2"
          >
            {/* Left Column: Pause / Resume */}
            <div className="justify-self-start">
              {isPaused ? (
                <button
                  type="button"
                  data-testid="running-resume-btn"
                  onClick={() => handleAction(onResumeSession)}
                  disabled={isLoading}
                  aria-label={isBreakPhase ? t('timer.actions.resumeBreak') : t('timer.actions.resumeFocus')}
                  title={isBreakPhase ? t('timer.actions.resumeBreak') : t('timer.actions.resumeFocus')}
                  className="inline-flex items-center justify-center gap-1 px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-medium text-xs rounded-lg transition-colors shadow-xs whitespace-nowrap disabled:opacity-50 cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 fill-current shrink-0" />
                  <span>{t('timer.actions.resumeShort')}</span>
                </button>
              ) : (
                <button
                  type="button"
                  data-testid="running-pause-btn"
                  onClick={() => handleAction(onPauseSession)}
                  disabled={isLoading || !canPause}
                  title={pauseTooltip}
                  aria-label={t('timer.actions.pauseLeft', { count: pausesLeft })}
                  className="inline-flex items-center justify-center gap-1 px-2.5 py-1.5 bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white font-medium text-xs rounded-lg transition-colors shadow-xs whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  <Pause className="w-3.5 h-3.5 fill-current shrink-0" />
                  <span>{t('timer.actions.pauseLeft', { count: pausesLeft })}</span>
                </button>
              )}
            </div>

            {/* Center Column: Digital Clock */}
            <div
              data-testid="running-timer-display"
              className={`justify-self-center text-2xl font-mono font-bold tracking-tight select-none tabular-nums leading-none whitespace-nowrap ${
                isBreakPhase
                  ? 'text-cyan-600 dark:text-cyan-400'
                  : 'text-slate-900 dark:text-slate-100'
              }`}
            >
              {formatTime(mainDisplayMs)}
            </div>

            {/* Right Column: Give Up / End Session */}
            <div className="justify-self-end">
              {isPomoStopwatch || session.mode === 'STOPWATCH' ? (
                <button
                  type="button"
                  data-testid="running-end-btn"
                  onClick={() => setShowStopwatchConfirm(true)}
                  disabled={isLoading}
                  aria-label={t('timer.actions.finishSessionClaim')}
                  title={t('timer.actions.finishSessionClaim')}
                  className="inline-flex items-center justify-center px-2.5 py-1.5 bg-slate-900 dark:bg-slate-100 hover:bg-slate-800 dark:hover:bg-slate-200 text-white dark:text-slate-900 text-xs font-medium rounded-lg transition-colors whitespace-nowrap disabled:opacity-50 cursor-pointer"
                >
                  {t('timer.actions.endSessionShort')}
                </button>
              ) : (
                <button
                  type="button"
                  data-testid="running-giveup-btn"
                  onClick={() => setShowGiveUpConfirm(true)}
                  disabled={isLoading}
                  aria-label={t('timer.actions.giveUpSession')}
                  title={t('timer.actions.giveUpSession')}
                  className="inline-flex items-center justify-center px-2.5 py-1.5 bg-transparent hover:bg-rose-50 dark:hover:bg-rose-950/30 text-rose-600 dark:text-rose-400 text-xs font-medium rounded-lg border border-rose-200 dark:border-rose-900/60 transition-colors whitespace-nowrap disabled:opacity-50 cursor-pointer"
                >
                  {t('timer.actions.giveUpShort')}
                </button>
              )}
            </div>
          </div>

          {/* Row 3: Live Reward & Multiplier Chip */}
          <div
            data-testid="live-reward-display"
            className="pt-1.5 border-t border-slate-200/70 dark:border-slate-700/60 flex items-center justify-center flex-wrap gap-1.5 text-[11px] text-slate-600 dark:text-slate-300 select-none"
          >
            {isPomoCountdown ? (
              <span className="flex items-center gap-1 flex-wrap justify-center">
                <span className="text-slate-500 dark:text-slate-400">{t('timer.liveReward.projectedLabel')}</span>
                <span className="font-semibold text-amber-600 dark:text-amber-400 tabular-nums flex items-center gap-1">
                  <Coins className="w-3 h-3 inline shrink-0" />
                  {formatRewardAmount(liveCoins)} {t('timer.liveReward.coinUnit')}
                  {showLiveBonusBadge && (
                    <span
                      data-testid="live-coin-bonus-chip"
                      className="text-[10px] text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/60 px-1 py-0.2 rounded font-medium tabular-nums"
                    >
                      +{formatRewardAmount(activeBonusRate * 100)}%
                    </span>
                  )}
                </span>
                <span>,</span>
                <span className="font-semibold text-indigo-600 dark:text-indigo-400 tabular-nums flex items-center gap-0.5">
                  <Award className="w-3 h-3 inline shrink-0" />
                  {formatRewardAmount(liveXp)} {t('timer.liveReward.xpUnit')}
                </span>
              </span>
            ) : isPomoStopwatch ? (
              <span className="flex items-center gap-1 flex-wrap justify-center">
                <span className="text-slate-500 dark:text-slate-400">{t('timer.liveReward.accumulatedLabel')}</span>
                <span className="font-semibold text-amber-600 dark:text-amber-400 tabular-nums flex items-center gap-1">
                  <Coins className="w-3 h-3 inline shrink-0" />
                  {formatRewardAmount(liveCoins)} {t('timer.liveReward.coinUnit')}
                  {showLiveBonusBadge && (
                    <span
                      data-testid="live-coin-bonus-chip"
                      className="text-[10px] text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/60 px-1 py-0.2 rounded font-medium tabular-nums"
                    >
                      +{formatRewardAmount(activeBonusRate * 100)}%
                    </span>
                  )}
                </span>
                <span>,</span>
                <span className="font-semibold text-indigo-600 dark:text-indigo-400 tabular-nums flex items-center gap-0.5">
                  <Award className="w-3 h-3 inline shrink-0" />
                  {formatRewardAmount(liveXp)} {t('timer.liveReward.xpUnit')}
                </span>
              </span>
            ) : isCountdown ? (
              <span className="flex items-center gap-1 flex-wrap justify-center">
                <span className="text-slate-500 dark:text-slate-400">{t('timer.liveReward.rewardLabel')}</span>
                <span className="font-semibold text-amber-600 dark:text-amber-400 tabular-nums flex items-center gap-1">
                  <Coins className="w-3 h-3 inline shrink-0" />
                  {formatRewardAmount(liveCoins)} {t('timer.liveReward.coinUnit')}
                  {showLiveBonusBadge && (
                    <span
                      data-testid="live-coin-bonus-chip"
                      className="text-[10px] text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/60 px-1 py-0.2 rounded font-medium tabular-nums"
                    >
                      +{formatRewardAmount(activeBonusRate * 100)}%
                    </span>
                  )}
                </span>
                <span>,</span>
                <span className="font-semibold text-indigo-600 dark:text-indigo-400 tabular-nums flex items-center gap-0.5">
                  <Award className="w-3 h-3 inline shrink-0" />
                  {formatRewardAmount(liveXp)} {t('timer.liveReward.xpUnit')}
                </span>
              </span>
            ) : (
              <span className="flex items-center gap-1 flex-wrap justify-center">
                <span className="text-slate-500 dark:text-slate-400">{t('timer.liveReward.accumulatedLabel')}</span>
                <span className="font-semibold text-amber-600 dark:text-amber-400 tabular-nums flex items-center gap-1">
                  <Coins className="w-3 h-3 inline shrink-0" />
                  {formatRewardAmount(liveCoins)} {t('timer.liveReward.coinUnit')}
                  {showLiveBonusBadge && (
                    <span
                      data-testid="live-coin-bonus-chip"
                      className="text-[10px] text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/60 px-1 py-0.2 rounded font-medium tabular-nums"
                    >
                      +{formatRewardAmount(activeBonusRate * 100)}%
                    </span>
                  )}
                </span>
                <span>,</span>
                <span className="font-semibold text-indigo-600 dark:text-indigo-400 tabular-nums flex items-center gap-0.5">
                  <Award className="w-3 h-3 inline shrink-0" />
                  {formatRewardAmount(liveXp)} {t('timer.liveReward.xpUnit')}
                </span>
                {!isStopwatchEligible && (
                  <span data-testid="stopwatch-min-note" className="text-[10px] text-slate-400 dark:text-slate-500">
                    ({t('timer.liveReward.stopwatchMinNote', {
                      minutes: DEFAULT_REWARD_CONFIG.stopwatchMinMinutesThreshold,
                    })})
                  </span>
                )}
              </span>
            )}

            <span
              data-testid="live-multiplier-chip"
              className="px-1.5 py-0.2 rounded bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200/80 dark:border-indigo-800/60 font-mono text-[10px] font-semibold text-indigo-700 dark:text-indigo-300 tabular-nums"
            >
              {`×${activeMultiplierDisplay.toFixed(1)}`}
            </span>
            {isPomoCountdown && (
              <span
                data-testid="pomo-countdown-all-or-nothing-note"
                className="basis-full text-center text-[10px] text-slate-400 dark:text-slate-500 leading-tight"
              >
                ({t('timer.liveReward.pomoAllOrNothingNote')})
              </span>
            )}
          </div>
        </div>

        {/* Optional Secondary Button Below Card for Pomodoro Break */}
        {isPomodoro && isBreakPhase && (
          <button
            type="button"
            data-testid="skip-break-btn"
            onClick={() =>
              handleAction(() => (onSkipBreak ?? onAdvancePomodoroStage)?.() ?? Promise.resolve())
            }
            disabled={isLoading}
            className="w-full shrink-0 py-1.5 px-3 bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-medium rounded-lg transition-colors shadow-2xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <SkipForward className="w-3.5 h-3.5 shrink-0" />
            <span>{t('timer.actions.skipBreak')}</span>
          </button>
        )}

        {actionError && (
          <div className="shrink-0 text-[11px] text-rose-600 dark:text-rose-400 text-center">
            {localizeErrorMessage(locale, actionError.message, actionError.code, actionError.params)}
          </div>
        )}

        {/* Screen-reader only lock notice (preserves zero visual strip per ĐC-8 and backward compatibility with startFocusView.test.ts) */}
        <div className="sr-only">
          <button
            type="button"
            data-testid="edit-profiles-btn"
            disabled
            tabIndex={-1}
          >
            {t('timer.profile.editProfiles')}
          </button>
          <span data-testid="active-profile-lock-hint">{t('timer.profile.lockedHint')}</span>
        </div>

        {/* Countdown Give Up Dialog */}
        {showGiveUpConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-fade-in">
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 max-w-[320px] w-full shadow-xl text-left">
              <div className="flex items-center gap-2 mb-2 text-rose-600 dark:text-rose-400">
                <AlertTriangle className="w-5 h-5 shrink-0" />
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {t('timer.modal.giveUpTitle')}
                </h3>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 mb-5 leading-relaxed">
                {t('timer.modal.giveUpBodyBefore')}{' '}
                <strong>{t('timer.modal.giveUpBodyZero')}</strong>{' '}
                {t('timer.modal.giveUpBodyAfter')}
              </p>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowGiveUpConfirm(false)}
                  className="px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                >
                  {t('timer.modal.keepFocusing')}
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    setShowGiveUpConfirm(false);
                    await handleAction(onGiveUpSession);
                  }}
                  className="px-3.5 py-2 text-xs font-medium text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition-colors shadow-xs"
                >
                  {t('timer.modal.confirmGiveUp')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Stopwatch Finish Dialog */}
        {showStopwatchConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-fade-in">
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 max-w-[320px] w-full shadow-xl text-left">
              {isEligibleForFinish ? (
                <>
                  <div className="flex items-center gap-2 mb-2 text-indigo-600 dark:text-indigo-400">
                    <Award className="w-5 h-5 shrink-0" />
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {t('timer.modal.finishTitle')}
                    </h3>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300 mb-3 leading-relaxed">
                    {t('timer.modal.finishBody')}
                  </p>
                  <div className="bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-lg p-3 mb-5">
                    <div className="flex items-center justify-around">
                      <div className="flex items-center gap-1.5">
                        <Coins className="w-4 h-4 text-amber-500" />
                        <span className="text-sm font-bold text-amber-600 dark:text-amber-400 tabular-nums flex items-center gap-1">
                          +{formatRewardAmount(modalFinishCoins)} {t('timer.modal.coinsUnit')}
                          {showLiveBonusBadge && (
                            <span className="text-[10px] text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/60 px-1 py-0.2 rounded font-medium tabular-nums">
                              +{formatRewardAmount(activeBonusRate * 100)}%
                            </span>
                          )}
                        </span>
                      </div>
                      <div className="h-4 w-px bg-slate-200 dark:bg-slate-700" />
                      <div className="flex items-center gap-1.5">
                        <Award className="w-4 h-4 text-indigo-500" />
                        <span className="text-sm font-bold text-indigo-600 dark:text-indigo-400 tabular-nums">
                          +{formatRewardAmount(modalFinishXp)} {t('timer.liveReward.xpUnit')}
                        </span>
                      </div>
                    </div>
                    <div className="text-[10px] text-slate-400 dark:text-slate-500 text-center mt-1.5">
                      {isPomoStopwatch
                        ? t('timer.modal.pomoFinishNote', {
                            count: pomoCompletedCount,
                            minutes: pomoCompletedFocusMins,
                            multiplier: modalFinishMultiplier.toFixed(1),
                          })
                        : t('timer.modal.swFinishNote', {
                            minutes: actualFocusMins,
                            multiplier: modalFinishMultiplier.toFixed(1),
                          })}
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowStopwatchConfirm(false)}
                      className="px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                    >
                      {t('timer.modal.keepFocusing')}
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        setShowStopwatchConfirm(false);
                        await handleAction(onFinishStopwatch);
                      }}
                      className="px-3.5 py-2 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-xs"
                    >
                      {t('timer.modal.finishAndClaim')}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2 mb-2 text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="w-5 h-5 shrink-0" />
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {t('timer.modal.finishTitle')}
                    </h3>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300 mb-5 leading-relaxed">
                    {isPomoStopwatch
                      ? t('timer.modal.pomoNoIntervals')
                      : t('timer.modal.swUnderMin')}
                  </p>
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowStopwatchConfirm(false)}
                      className="px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                    >
                      {t('timer.modal.keepFocusing')}
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        setShowStopwatchConfirm(false);
                        await handleAction(onFinishStopwatch);
                      }}
                      className="px-3.5 py-2 text-xs font-medium text-white bg-amber-600 hover:bg-amber-700 rounded-lg transition-colors shadow-xs"
                    >
                      {t('timer.modal.leaveAnyway')}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // -------------------------------------------------------------
  // STATE 3: IDLE (Timer Setup & Start)
  // -------------------------------------------------------------
  const setupMode: SessionMode =
    selectedPrimaryTab === 'COUNTDOWN'
      ? 'COUNTDOWN'
      : selectedPrimaryTab === 'STOPWATCH'
      ? 'STOPWATCH'
      : pomodoroSubMode;
  const setupPreview = getSessionRewardPreview({
    mode: setupMode,
    status: 'IDLE',
    targetMinutes,
    coinBonusRate: activeBonusRate,
    pomodoroConfig: pomoConfig,
  });
  const previewMultiplier = setupPreview.multiplier;
  const estimatedCoins = setupPreview.coins;
  const estimatedXp = setupPreview.xp;

  const allowedCount = activeProfile?.allowedDomains.length || 0;

  const hoursDisplay = String(Math.floor(targetMinutes / 60)).padStart(2, '0');
  const minutesDisplay = String(targetMinutes % 60).padStart(2, '0');

  // Step adjustment handlers for Countdown
  const handleIncreaseHours = () => setTargetMinutes((prev) => Math.min(180, prev + 60));
  const handleDecreaseHours = () => setTargetMinutes((prev) => Math.max(5, prev - 60));
  const handleIncreaseMinutes = () => setTargetMinutes((prev) => Math.min(180, prev + 5));
  const handleDecreaseMinutes = () => setTargetMinutes((prev) => Math.max(5, prev - 5));

  const isHoursIncreaseDisabled = targetMinutes >= 180;
  const isHoursDecreaseDisabled = targetMinutes < 60;
  const isMinutesIncreaseDisabled = targetMinutes >= 180;
  const isMinutesDecreaseDisabled = targetMinutes <= 5;

  return (
    <div className="flex-1 flex flex-col justify-between p-4 space-y-3 overflow-y-auto">
      {/* 3-way Mode Selection Header Tabs + Minimal Chime Toggle */}
      <div className="space-y-3">
        <div className="flex items-center gap-1.5">
          <div className="flex-1 grid grid-cols-3 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg text-center">
            <button
              onClick={() => setSelectedPrimaryTab('COUNTDOWN')}
              className={`py-1.5 px-2 text-xs font-medium rounded-md transition-all ${
                selectedPrimaryTab === 'COUNTDOWN'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              {t('timer.tabs.countdown')}
            </button>
            <button
              onClick={() => setSelectedPrimaryTab('STOPWATCH')}
              className={`py-1.5 px-2 text-xs font-medium rounded-md transition-all ${
                selectedPrimaryTab === 'STOPWATCH'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              {t('timer.tabs.stopwatch')}
            </button>
            <button
              onClick={() => setSelectedPrimaryTab('POMODORO')}
              className={`py-1.5 px-2 text-xs font-medium rounded-md transition-all ${
                selectedPrimaryTab === 'POMODORO'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              {t('timer.tabs.pomodoro')}
            </button>
          </div>
          <button
            type="button"
            data-testid="chime-toggle-btn"
            onClick={handleToggleChime}
            aria-label={effectiveChimeEnabled ? t('timer.chime.toggleAriaOn') : t('timer.chime.toggleAriaOff')}
            aria-pressed={effectiveChimeEnabled}
            title={effectiveChimeEnabled ? t('timer.chime.onLabel') : t('timer.chime.offLabel')}
            className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors shrink-0 cursor-pointer"
          >
            {effectiveChimeEnabled ? <Bell className="w-3.5 h-3.5" /> : <BellOff className="w-3.5 h-3.5 text-slate-400" />}
          </button>
        </div>

        {/* 1. COUNTDOWN MODE SETUP */}
        {selectedPrimaryTab === 'COUNTDOWN' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-slate-700 dark:text-slate-300">
                {t('timer.setup.duration')}
              </span>
              <span className="text-slate-500 dark:text-slate-400">
                {t('timer.setup.rewardLabel')}{' '}
                <strong className="text-indigo-600 dark:text-indigo-400 font-semibold">{previewMultiplier}x</strong>
              </span>
            </div>

            <DurationPresetChips
              selectedMinutes={targetMinutes}
              onSelectMinutes={setTargetMinutes}
              disabled={isLoading}
            />

            {/* Dual Cluster HH : MM Duration Picker */}
            <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 rounded-xl p-4 flex flex-col items-center">
              <div className="grid grid-cols-[auto_auto_auto] items-center justify-center gap-x-4 sm:gap-x-6 gap-y-1.5">
                {/* Row 1: Centered Up Arrows */}
                <div className="flex justify-center">
                  <button
                    type="button"
                    data-testid="hours-increase-btn"
                    aria-label={t('timer.setup.incHoursAria')}
                    disabled={isHoursIncreaseDisabled}
                    onClick={handleIncreaseHours}
                    className="w-12 h-8 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 active:scale-95 disabled:opacity-25 disabled:pointer-events-none transition-all flex items-center justify-center shadow-2xs"
                  >
                    <ChevronUp className="w-5 h-5" />
                  </button>
                </div>
                <div />
                <div className="flex justify-center">
                  <button
                    type="button"
                    data-testid="minutes-increase-btn"
                    aria-label={t('timer.setup.incMinutesAria')}
                    disabled={isMinutesIncreaseDisabled}
                    onClick={handleIncreaseMinutes}
                    className="w-12 h-8 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 active:scale-95 disabled:opacity-25 disabled:pointer-events-none transition-all flex items-center justify-center shadow-2xs"
                  >
                    <ChevronUp className="w-5 h-5" />
                  </button>
                </div>

                {/* Row 2: Digits & Centered Colon */}
                <div className="w-18 h-13 flex items-center justify-center bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-700/90 rounded-lg shadow-2xs">
                  <span
                    data-testid="hours-display"
                    className="text-3xl font-mono font-bold text-slate-900 dark:text-slate-100 tabular-nums select-none tracking-tight"
                  >
                    {hoursDisplay}
                  </span>
                </div>

                <span className="text-3xl font-mono font-bold text-slate-400 dark:text-slate-500 select-none px-1">
                  :
                </span>

                <div className="w-18 h-13 flex items-center justify-center bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-700/90 rounded-lg shadow-2xs">
                  <span
                    data-testid="minutes-display"
                    className="text-3xl font-mono font-bold text-slate-900 dark:text-slate-100 tabular-nums select-none tracking-tight"
                  >
                    {minutesDisplay}
                  </span>
                </div>

                {/* Row 3: Labels */}
                <div className="flex justify-center">
                  <span className="text-[10px] font-bold tracking-wider text-slate-400 dark:text-slate-500 uppercase select-none">
                    {t('timer.setup.hoursLabel')}
                  </span>
                </div>
                <div />
                <div className="flex justify-center">
                  <span className="text-[10px] font-bold tracking-wider text-slate-400 dark:text-slate-500 uppercase select-none">
                    {t('timer.setup.minutesLabel')}
                  </span>
                </div>

                {/* Row 4: Centered Down Arrows */}
                <div className="flex justify-center">
                  <button
                    type="button"
                    data-testid="hours-decrease-btn"
                    aria-label={t('timer.setup.decHoursAria')}
                    disabled={isHoursDecreaseDisabled}
                    onClick={handleDecreaseHours}
                    className="w-12 h-8 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 active:scale-95 disabled:opacity-25 disabled:pointer-events-none transition-all flex items-center justify-center shadow-2xs"
                  >
                    <ChevronDown className="w-5 h-5" />
                  </button>
                </div>
                <div />
                <div className="flex justify-center">
                  <button
                    type="button"
                    data-testid="minutes-decrease-btn"
                    aria-label={t('timer.setup.decMinutesAria')}
                    disabled={isMinutesDecreaseDisabled}
                    onClick={handleDecreaseMinutes}
                    className="w-12 h-8 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 active:scale-95 disabled:opacity-25 disabled:pointer-events-none transition-all flex items-center justify-center shadow-2xs"
                  >
                    <ChevronDown className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="mt-2 text-[11px] text-slate-500 dark:text-slate-400 text-center">
                {t('timer.setup.stepperHint')}
              </div>
            </div>

            {/* Target Rewards Preview */}
            <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 rounded-lg p-2.5 flex items-center justify-between text-xs">
              <span className="text-slate-500 dark:text-slate-400">{t('timer.setup.targetRewards')}</span>
              <div className="flex items-center gap-3">
                {isBonusLoading ? (
                  <span className="text-slate-400 dark:text-slate-500 text-xs italic animate-pulse">
                    {t('timer.setup.calculating')}
                  </span>
                ) : (
                  <>
                    <span className="flex items-center gap-1 font-semibold text-amber-600 dark:text-amber-400 tabular-nums">
                      <Coins className="w-3.5 h-3.5" /> +{formatRewardAmount(estimatedCoins)}
                      {activeBonusRate > 0 && (
                        <span className="text-[10px] text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/60 px-1 py-0.2 rounded font-medium tabular-nums">
                          +{formatRewardAmount(activeBonusRate * 100)}%
                        </span>
                      )}
                    </span>
                    <span className="flex items-center gap-1 font-semibold text-indigo-600 dark:text-indigo-400 tabular-nums">
                      <Award className="w-3.5 h-3.5" /> +{formatRewardAmount(estimatedXp)}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 2. STOPWATCH MODE SETUP */}
        {selectedPrimaryTab === 'STOPWATCH' && (
          <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 rounded-lg p-3 text-xs text-slate-600 dark:text-slate-300 space-y-2">
            <div className="flex items-center gap-1.5 font-medium text-slate-900 dark:text-slate-100">
              <Info className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
              <span>{t('timer.stopwatch.title')}</span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
              {t('timer.stopwatch.descBefore')} <strong>{t('timer.stopwatch.descBold')}</strong>{' '}
              {t('timer.stopwatch.descAfter')}
            </p>
          </div>
        )}

        {/* 3. POMODORO MODE SETUP */}
        {selectedPrimaryTab === 'POMODORO' && (
          <div className="space-y-3">
            {/* Sub-mode selector */}
            <div className="grid grid-cols-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg text-xs">
              <button
                type="button"
                onClick={() => setPomodoroSubMode('POMODORO_COUNTDOWN')}
                className={`py-1 px-2 rounded font-medium transition-all ${
                  pomodoroSubMode === 'POMODORO_COUNTDOWN'
                    ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                {t('timer.pomodoro.subCountdown')}
              </button>
              <button
                type="button"
                onClick={() => setPomodoroSubMode('POMODORO_STOPWATCH')}
                className={`py-1 px-2 rounded font-medium transition-all ${
                  pomodoroSubMode === 'POMODORO_STOPWATCH'
                    ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                {t('timer.pomodoro.subStopwatch')}
              </button>
            </div>

            {/* Inline Configuration Rows */}
            <div className="space-y-1.5">
              <ConfigRow
                icon={<Flame className="w-4 h-4 text-amber-500 shrink-0" />}
                label={t('timer.pomodoro.focusIntervalDuration')}
                valueDisplay={`${pomoConfig.focusIntervalDurationMinutes ?? pomoConfig.focusDurationMinutes ?? 25}m`}
                onDecrease={() => {
                  const currentVal = pomoConfig.focusIntervalDurationMinutes ?? pomoConfig.focusDurationMinutes ?? 25;
                  const nextVal = TimeCalculator.stepPomodoroFocus(currentVal, -1);
                  setPomoConfig((p) => ({
                    ...p,
                    focusDurationMinutes: nextVal,
                    focusIntervalDurationMinutes: nextVal,
                  }));
                }}
                onIncrease={() => {
                  const currentVal = pomoConfig.focusIntervalDurationMinutes ?? pomoConfig.focusDurationMinutes ?? 25;
                  const nextVal = TimeCalculator.stepPomodoroFocus(currentVal, 1);
                  setPomoConfig((p) => ({
                    ...p,
                    focusDurationMinutes: nextVal,
                    focusIntervalDurationMinutes: nextVal,
                  }));
                }}
                isDecreaseDisabled={(pomoConfig.focusIntervalDurationMinutes ?? pomoConfig.focusDurationMinutes ?? 25) <= 1}
                isIncreaseDisabled={(pomoConfig.focusIntervalDurationMinutes ?? pomoConfig.focusDurationMinutes ?? 25) >= 90}
                decreaseAriaLabel={t('timer.pomodoro.decFocusAria')}
                increaseAriaLabel={t('timer.pomodoro.incFocusAria')}
              />

              <ConfigRow
                icon={<Coffee className="w-4 h-4 text-cyan-500 shrink-0" />}
                label={t('timer.pomodoro.shortBreakDuration')}
                valueDisplay={`${pomoConfig.shortBreakDurationMinutes}m`}
                onDecrease={() =>
                  setPomoConfig((p) => ({
                    ...p,
                    shortBreakDurationMinutes: TimeCalculator.stepPomodoroShortBreak(
                      p.shortBreakDurationMinutes,
                      -1
                    ),
                  }))
                }
                onIncrease={() =>
                  setPomoConfig((p) => ({
                    ...p,
                    shortBreakDurationMinutes: TimeCalculator.stepPomodoroShortBreak(
                      p.shortBreakDurationMinutes,
                      1
                    ),
                  }))
                }
                isDecreaseDisabled={pomoConfig.shortBreakDurationMinutes <= 1}
                isIncreaseDisabled={pomoConfig.shortBreakDurationMinutes >= 20}
                decreaseAriaLabel={t('timer.pomodoro.decShortAria')}
                increaseAriaLabel={t('timer.pomodoro.incShortAria')}
              />

              <ConfigRow
                icon={<Sparkles className="w-4 h-4 text-indigo-500 shrink-0" />}
                label={t('timer.pomodoro.longBreakDuration')}
                valueDisplay={`${pomoConfig.longBreakDurationMinutes}m`}
                onDecrease={() =>
                  setPomoConfig((p) => ({
                    ...p,
                    longBreakDurationMinutes: TimeCalculator.stepPomodoroLongBreak(
                      p.longBreakDurationMinutes,
                      -1
                    ),
                  }))
                }
                onIncrease={() =>
                  setPomoConfig((p) => ({
                    ...p,
                    longBreakDurationMinutes: TimeCalculator.stepPomodoroLongBreak(
                      p.longBreakDurationMinutes,
                      1
                    ),
                  }))
                }
                isDecreaseDisabled={pomoConfig.longBreakDurationMinutes <= 1}
                isIncreaseDisabled={pomoConfig.longBreakDurationMinutes >= 60}
                decreaseAriaLabel={t('timer.pomodoro.decLongAria')}
                increaseAriaLabel={t('timer.pomodoro.incLongAria')}
              />

              <ConfigRow
                icon={<RotateCcw className="w-4 h-4 text-emerald-500 shrink-0" />}
                label={t('timer.pomodoro.intervalsPerCycle')}
                valueDisplay={`${pomoConfig.focusIntervalsPerCycle ?? pomoConfig.targetFocusSessions ?? 4}`}
                onDecrease={() => {
                  const currentVal = pomoConfig.focusIntervalsPerCycle ?? pomoConfig.targetFocusSessions ?? 4;
                  const nextVal = TimeCalculator.stepPomodoroIntervalsPerCycle(currentVal, -1);
                  setPomoConfig((p) => ({
                    ...p,
                    targetFocusSessions: nextVal,
                    focusIntervalsPerCycle: nextVal,
                  }));
                }}
                onIncrease={() => {
                  const currentVal = pomoConfig.focusIntervalsPerCycle ?? pomoConfig.targetFocusSessions ?? 4;
                  const nextVal = TimeCalculator.stepPomodoroIntervalsPerCycle(currentVal, 1);
                  setPomoConfig((p) => ({
                    ...p,
                    targetFocusSessions: nextVal,
                    focusIntervalsPerCycle: nextVal,
                  }));
                }}
                isDecreaseDisabled={(pomoConfig.focusIntervalsPerCycle ?? pomoConfig.targetFocusSessions ?? 4) <= 2}
                isIncreaseDisabled={(pomoConfig.focusIntervalsPerCycle ?? pomoConfig.targetFocusSessions ?? 4) >= 10}
                decreaseAriaLabel={t('timer.pomodoro.decIntervalsAria')}
                increaseAriaLabel={t('timer.pomodoro.incIntervalsAria')}
              />

              {pomodoroSubMode === 'POMODORO_COUNTDOWN' && (
                <ConfigRow
                  icon={<Repeat className="w-4 h-4 text-purple-500 shrink-0" />}
                  label={t('timer.pomodoro.numberOfCycles')}
                  valueDisplay={`${pomoConfig.numberOfCycles ?? 3}`}
                  onDecrease={() =>
                    setPomoConfig((p) => ({
                      ...p,
                      numberOfCycles: TimeCalculator.stepPomodoroCycles(p.numberOfCycles ?? 3, -1),
                    }))
                  }
                  onIncrease={() =>
                    setPomoConfig((p) => ({
                      ...p,
                      numberOfCycles: TimeCalculator.stepPomodoroCycles(p.numberOfCycles ?? 3, 1),
                    }))
                  }
                  isDecreaseDisabled={(pomoConfig.numberOfCycles ?? 3) <= 1}
                  isIncreaseDisabled={(pomoConfig.numberOfCycles ?? 3) >= 10}
                  decreaseAriaLabel={t('timer.pomodoro.decCyclesAria')}
                  increaseAriaLabel={t('timer.pomodoro.incCyclesAria')}
                />
              )}
            </div>

            {/* Pomodoro Rewards estimate: Only for Pomodoro Countdown */}
            {pomodoroSubMode === 'POMODORO_COUNTDOWN' && (
              <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 rounded-xl p-2.5 flex items-center justify-between text-xs">
                <span className="text-slate-500 dark:text-slate-400 font-medium">
                  {t('timer.setup.totalReward')}
                </span>
                <div className="flex items-center gap-2">
                  {isBonusLoading ? (
                    <span className="text-slate-400 dark:text-slate-500 text-xs italic animate-pulse">
                      {t('timer.setup.calculating')}
                    </span>
                  ) : (
                    <>
                      <span className="flex items-center gap-1 font-semibold text-amber-600 dark:text-amber-400 tabular-nums">
                        <Coins className="w-3.5 h-3.5" /> +{formatRewardAmount(estimatedCoins)}
                        {activeBonusRate > 0 && (
                          <span className="text-[10px] text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/60 px-1 py-0.2 rounded font-medium tabular-nums">
                            +{formatRewardAmount(activeBonusRate * 100)}%
                          </span>
                        )}
                      </span>
                      <span className="flex items-center gap-1 font-semibold text-indigo-600 dark:text-indigo-400 tabular-nums">
                        <Award className="w-3.5 h-3.5" /> +{formatRewardAmount(estimatedXp)}
                      </span>
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/60 tabular-nums">
                        ×{previewMultiplier.toFixed(1)}
                      </span>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Active Profile blocking notice */}
        <div className="pt-1">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="font-medium text-slate-700 dark:text-slate-300">
              {t('timer.profile.activeLabel')}
            </span>
            <button
              type="button"
              data-testid="edit-profiles-btn"
              onClick={onOpenProfiles}
              className="text-indigo-600 dark:text-indigo-400 hover:underline text-[11px] font-medium cursor-pointer"
            >
              {t('timer.profile.editProfiles')}
            </button>
          </div>

          <div className="flex items-center justify-between p-2.5 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-lg text-xs">
            <div className="flex items-center gap-2 truncate">
              <Shield className="w-4 h-4 text-slate-400 shrink-0" />
              <span className="font-medium text-slate-800 dark:text-slate-200 truncate">
                {activeProfile?.name || t('header.defaultProfile')}
              </span>
            </div>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 shrink-0 pl-2">
              {allowedCount === 0
                ? t('timer.profile.zeroAllowed')
                : t('timer.profile.nAllowed', { count: allowedCount })}
            </span>
          </div>
        </div>
      </div>

      {actionError && (
        <div className="text-xs text-rose-600 dark:text-rose-400 text-center">
          {localizeErrorMessage(locale, actionError.message, actionError.code, actionError.params)}
        </div>
      )}

      {/* Start Button */}
      <button
        type="button"
        data-testid="start-focus-session-btn"
        onClick={() => {
          if (selectedPrimaryTab === 'POMODORO') {
            handleAction(() =>
              onStartSession(pomodoroSubMode, pomoConfig.focusDurationMinutes, pomoConfig)
            );
          } else if (selectedPrimaryTab === 'COUNTDOWN') {
            handleAction(() => onStartSession('COUNTDOWN', targetMinutes));
          } else {
            handleAction(() => onStartSession('STOPWATCH', 0));
          }
        }}
        disabled={isLoading || !activeProfile}
        className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-semibold text-xs tracking-wide rounded-xl shadow-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
      >
        <Play className="w-4 h-4 fill-current" />
        <span>
          {selectedPrimaryTab === 'POMODORO'
            ? t('timer.startButton.pomodoro')
            : t('timer.startButton.focus')}
        </span>
      </button>
    </div>
  );
};
