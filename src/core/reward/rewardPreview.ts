import {
  DEFAULT_POMODORO_CONFIG,
  PomodoroConfig,
  PomodoroState,
  SessionMode,
  SessionSnapshot,
  SessionStatus,
} from '../../types/session.ts';
import { MultiplierRules } from './multiplierRules.ts';
import { DEFAULT_REWARD_CONFIG } from './rewardEngine.ts';

export interface SessionRewardPreviewInput {
  mode: SessionMode;
  status?: SessionStatus;
  targetMinutes: number;
  actualFocusMinutes?: number;
  lockedMultiplier?: number;
  /** Additive civilization CoinBonus rate (e.g. 0.05 for +5%). */
  coinBonusRate?: number;
  pomodoroConfig?: Partial<PomodoroConfig> | null;
  pomodoroState?: Partial<PomodoroState> | null;
}

export interface SessionRewardPreviewResult {
  coins: number;
  xp: number;
  multiplier: number;
  bonusRate: number;
  eligibleMinutes: number;
  isEligible: boolean;
  isProjected: boolean;
  isAllOrNothing: boolean;
}

function normalizeBonusRate(rawRate?: number): number {
  if (typeof rawRate !== 'number' || !Number.isFinite(rawRate) || rawRate <= 0) {
    return 0;
  }
  return rawRate;
}

function resolvePomodoroMetrics(config?: Partial<PomodoroConfig> | null): {
  intervalDuration: number;
  intervalsPerCycle: number;
  cycles: number;
  plannedFocusMinutes: number;
} {
  const intervalDuration =
    config?.focusIntervalDurationMinutes ??
    config?.focusDurationMinutes ??
    DEFAULT_POMODORO_CONFIG.focusIntervalDurationMinutes ??
    DEFAULT_POMODORO_CONFIG.focusDurationMinutes;
  const intervalsPerCycle =
    config?.focusIntervalsPerCycle ??
    config?.targetFocusSessions ??
    DEFAULT_POMODORO_CONFIG.focusIntervalsPerCycle ??
    DEFAULT_POMODORO_CONFIG.targetFocusSessions;
  const cycles = config?.numberOfCycles ?? DEFAULT_POMODORO_CONFIG.numberOfCycles ?? 3;
  return {
    intervalDuration,
    intervalsPerCycle,
    cycles,
    plannedFocusMinutes: intervalDuration * intervalsPerCycle * cycles,
  };
}

/**
 * Pure Single Source of Truth for session reward display/preview across:
 * - Setup (IDLE)
 * - Running / Paused (STATE 2 + Finish Confirm modal)
 * - Terminal Outcomes (COMPLETED / ABANDONED / INTERRUPTED)
 *
 * Strictly returns unrounded raw IEEE-754 floating-point values matching RewardEngine
 * and SessionCoordinator. UI components must format values ONLY at render time.
 */
export function getSessionRewardPreview(
  input: SessionRewardPreviewInput
): SessionRewardPreviewResult {
  const status: SessionStatus = input.status ?? 'IDLE';
  const bonusRate = normalizeBonusRate(input.coinBonusRate);
  const bonusFactor = 1 + bonusRate;
  const safeTargetMinutes = Math.max(0, Number.isFinite(input.targetMinutes) ? input.targetMinutes : 0);
  const safeActualMinutes = Math.max(
    0,
    Math.floor(Number.isFinite(input.actualFocusMinutes ?? 0) ? (input.actualFocusMinutes ?? 0) : 0)
  );

  // -------------------------------------------------------------------------
  // 1. IDLE / SETUP
  // -------------------------------------------------------------------------
  if (status === 'IDLE') {
    if (input.mode === 'COUNTDOWN') {
      const multiplier = MultiplierRules.getCountdownMultiplier(safeTargetMinutes);
      return {
        coins:
          DEFAULT_REWARD_CONFIG.countdownBaseCoinPerMinute *
          safeTargetMinutes *
          multiplier *
          bonusFactor,
        xp: DEFAULT_REWARD_CONFIG.countdownBaseXpPerMinute * safeTargetMinutes * multiplier,
        multiplier,
        bonusRate,
        eligibleMinutes: safeTargetMinutes,
        isEligible: safeTargetMinutes > 0,
        isProjected: true,
        isAllOrNothing: true,
      };
    }

    if (input.mode === 'POMODORO_COUNTDOWN') {
      const { plannedFocusMinutes } = resolvePomodoroMetrics(input.pomodoroConfig);
      const multiplier = MultiplierRules.getCountdownMultiplier(plannedFocusMinutes);
      return {
        coins:
          DEFAULT_REWARD_CONFIG.countdownBaseCoinPerMinute *
          plannedFocusMinutes *
          multiplier *
          bonusFactor,
        xp: DEFAULT_REWARD_CONFIG.countdownBaseXpPerMinute * plannedFocusMinutes * multiplier,
        multiplier,
        bonusRate,
        eligibleMinutes: plannedFocusMinutes,
        isEligible: plannedFocusMinutes > 0,
        isProjected: true,
        isAllOrNothing: true,
      };
    }

    if (input.mode === 'POMODORO_STOPWATCH') {
      const { intervalDuration } = resolvePomodoroMetrics(input.pomodoroConfig);
      const multiplier = 1.0;
      return {
        coins:
          DEFAULT_REWARD_CONFIG.stopwatchBaseCoinPerMinute *
          intervalDuration *
          multiplier *
          bonusFactor,
        xp: DEFAULT_REWARD_CONFIG.stopwatchBaseXpPerMinute * intervalDuration * multiplier,
        multiplier,
        bonusRate,
        eligibleMinutes: intervalDuration,
        isEligible: intervalDuration > 0,
        isProjected: true,
        isAllOrNothing: false,
      };
    }

    // STOPWATCH open-ended setup
    return {
      coins: 0,
      xp: 0,
      multiplier: 1.0,
      bonusRate,
      eligibleMinutes: 0,
      isEligible: false,
      isProjected: false,
      isAllOrNothing: false,
    };
  }

  // -------------------------------------------------------------------------
  // 2. RUNNING / PAUSED (LIVE DISPLAY & FINISH CONFIRM)
  // -------------------------------------------------------------------------
  if (status === 'RUNNING' || status === 'PAUSED') {
    if (input.mode === 'COUNTDOWN') {
      const multiplier =
        input.lockedMultiplier && input.lockedMultiplier > 0
          ? input.lockedMultiplier
          : MultiplierRules.getCountdownMultiplier(safeTargetMinutes);
      return {
        coins:
          DEFAULT_REWARD_CONFIG.countdownBaseCoinPerMinute *
          safeTargetMinutes *
          multiplier *
          bonusFactor,
        xp: DEFAULT_REWARD_CONFIG.countdownBaseXpPerMinute * safeTargetMinutes * multiplier,
        multiplier,
        bonusRate,
        eligibleMinutes: safeTargetMinutes,
        isEligible: safeTargetMinutes > 0,
        isProjected: false,
        isAllOrNothing: true,
      };
    }

    if (input.mode === 'STOPWATCH') {
      const multiplier = MultiplierRules.getStopwatchMultiplier(safeActualMinutes);
      const isEligible = safeActualMinutes >= DEFAULT_REWARD_CONFIG.stopwatchMinMinutesThreshold;
      return {
        coins: isEligible
          ? DEFAULT_REWARD_CONFIG.stopwatchBaseCoinPerMinute *
            safeActualMinutes *
            multiplier *
            bonusFactor
          : 0,
        xp: isEligible
          ? DEFAULT_REWARD_CONFIG.stopwatchBaseXpPerMinute * safeActualMinutes * multiplier
          : 0,
        multiplier,
        bonusRate,
        eligibleMinutes: isEligible ? safeActualMinutes : 0,
        isEligible,
        isProjected: false,
        isAllOrNothing: false,
      };
    }

    if (input.mode === 'POMODORO_COUNTDOWN') {
      const { plannedFocusMinutes } = resolvePomodoroMetrics(input.pomodoroConfig);
      const multiplier =
        input.lockedMultiplier && input.lockedMultiplier > 0
          ? input.lockedMultiplier
          : MultiplierRules.getCountdownMultiplier(plannedFocusMinutes);
      // SessionCoordinator settles at 100% completion using live CoinBonusProvider().
      return {
        coins:
          DEFAULT_REWARD_CONFIG.countdownBaseCoinPerMinute *
          plannedFocusMinutes *
          multiplier *
          bonusFactor,
        xp: DEFAULT_REWARD_CONFIG.countdownBaseXpPerMinute * plannedFocusMinutes * multiplier,
        multiplier,
        bonusRate,
        eligibleMinutes: plannedFocusMinutes,
        isEligible: plannedFocusMinutes > 0,
        isProjected: true,
        isAllOrNothing: true,
      };
    }

    // POMODORO_STOPWATCH: settled cumulative completed intervals evaluated with live CoinBonus on finish/advance
    const completedCount = input.pomodoroState?.completedFocusCount ?? 0;
    const completedMins = Math.max(0, input.pomodoroState?.totalCompletedFocusMinutes ?? 0);
    const hasCompletedInterval = completedCount > 0 && completedMins > 0;
    const multiplier = hasCompletedInterval
      ? MultiplierRules.getSessionMultiplier(completedMins)
      : 1.0;
    return {
      coins: hasCompletedInterval
        ? DEFAULT_REWARD_CONFIG.stopwatchBaseCoinPerMinute *
          completedMins *
          multiplier *
          bonusFactor
        : 0,
      xp: hasCompletedInterval
        ? DEFAULT_REWARD_CONFIG.stopwatchBaseXpPerMinute * completedMins * multiplier
        : 0,
      multiplier,
      bonusRate,
      eligibleMinutes: hasCompletedInterval ? completedMins : 0,
      isEligible: hasCompletedInterval,
      isProjected: false,
      isAllOrNothing: false,
    };
  }

  // -------------------------------------------------------------------------
  // 3. TERMINAL OUTCOMES (COMPLETED / ABANDONED / INTERRUPTED)
  // -------------------------------------------------------------------------
  const isCompleted = status === 'COMPLETED';

  if (input.mode === 'POMODORO_COUNTDOWN') {
    if (!isCompleted) {
      // UX-2 All-or-Nothing rule: ABANDONED / INTERRUPTED always earn 0 Coins and 0 XP
      return {
        coins: 0,
        xp: 0,
        multiplier: input.lockedMultiplier || 1.0,
        bonusRate,
        eligibleMinutes: 0,
        isEligible: false,
        isProjected: false,
        isAllOrNothing: true,
      };
    }
    const { plannedFocusMinutes } = resolvePomodoroMetrics(input.pomodoroConfig);
    const multiplier =
      input.lockedMultiplier && input.lockedMultiplier > 0
        ? input.lockedMultiplier
        : MultiplierRules.getCountdownMultiplier(plannedFocusMinutes);
    const settledCoins = input.pomodoroState?.accumulatedCoins;
    const settledXp = input.pomodoroState?.accumulatedXp;
    return {
      coins:
        typeof settledCoins === 'number' && Number.isFinite(settledCoins)
          ? settledCoins
          : DEFAULT_REWARD_CONFIG.countdownBaseCoinPerMinute *
            plannedFocusMinutes *
            multiplier *
            bonusFactor,
      xp:
        typeof settledXp === 'number' && Number.isFinite(settledXp)
          ? settledXp
          : DEFAULT_REWARD_CONFIG.countdownBaseXpPerMinute * plannedFocusMinutes * multiplier,
      multiplier,
      bonusRate,
      eligibleMinutes: plannedFocusMinutes,
      isEligible: true,
      isProjected: false,
      isAllOrNothing: true,
    };
  }

  if (input.mode === 'POMODORO_STOPWATCH') {
    const settledCoins = input.pomodoroState?.accumulatedCoins ?? 0;
    const settledXp = input.pomodoroState?.accumulatedXp ?? 0;
    const completedMins = Math.max(0, input.pomodoroState?.totalCompletedFocusMinutes ?? 0);
    const multiplier =
      input.lockedMultiplier && input.lockedMultiplier > 0
        ? input.lockedMultiplier
        : MultiplierRules.getSessionMultiplier(completedMins);
    return {
      coins: settledCoins,
      xp: settledXp,
      multiplier,
      bonusRate,
      eligibleMinutes: settledCoins > 0 || settledXp > 0 ? completedMins : 0,
      isEligible: settledCoins > 0 || settledXp > 0,
      isProjected: false,
      isAllOrNothing: false,
    };
  }

  if (input.mode === 'COUNTDOWN') {
    const multiplier =
      input.lockedMultiplier && input.lockedMultiplier > 0
        ? input.lockedMultiplier
        : MultiplierRules.getCountdownMultiplier(safeTargetMinutes);
    if (!isCompleted) {
      return {
        coins: 0,
        xp: 0,
        multiplier,
        bonusRate,
        eligibleMinutes: 0,
        isEligible: false,
        isProjected: false,
        isAllOrNothing: true,
      };
    }
    return {
      coins:
        DEFAULT_REWARD_CONFIG.countdownBaseCoinPerMinute *
        safeTargetMinutes *
        multiplier *
        bonusFactor,
      xp: DEFAULT_REWARD_CONFIG.countdownBaseXpPerMinute * safeTargetMinutes * multiplier,
      multiplier,
      bonusRate,
      eligibleMinutes: safeTargetMinutes,
      isEligible: safeTargetMinutes > 0,
      isProjected: false,
      isAllOrNothing: true,
    };
  }

  // STOPWATCH terminal
  const isStopwatchEligible =
    isCompleted && safeActualMinutes >= DEFAULT_REWARD_CONFIG.stopwatchMinMinutesThreshold;
  const swMultiplier =
    input.lockedMultiplier && input.lockedMultiplier > 0
      ? input.lockedMultiplier
      : MultiplierRules.getStopwatchMultiplier(safeActualMinutes);
  return {
    coins: isStopwatchEligible
      ? DEFAULT_REWARD_CONFIG.stopwatchBaseCoinPerMinute *
        safeActualMinutes *
        swMultiplier *
        bonusFactor
      : 0,
    xp: isStopwatchEligible
      ? DEFAULT_REWARD_CONFIG.stopwatchBaseXpPerMinute * safeActualMinutes * swMultiplier
      : 0,
    multiplier: swMultiplier,
    bonusRate,
    eligibleMinutes: isStopwatchEligible ? safeActualMinutes : 0,
    isEligible: isStopwatchEligible,
    isProjected: false,
    isAllOrNothing: false,
  };
}

/**
 * Convenience wrapper operating directly on an authoritative SessionSnapshot.
 */
export function getSessionRewardPreviewFromSnapshot(
  session: SessionSnapshot,
  options?: {
    actualFocusMinutes?: number;
    coinBonusRate?: number;
  }
): SessionRewardPreviewResult {
  return getSessionRewardPreview({
    mode: session.mode,
    status: session.status,
    targetMinutes: session.targetMinutes,
    actualFocusMinutes: options?.actualFocusMinutes,
    lockedMultiplier: session.lockedMultiplier,
    coinBonusRate: options?.coinBonusRate,
    pomodoroConfig: session.pomodoroConfig,
    pomodoroState: session.pomodoroState,
  });
}
