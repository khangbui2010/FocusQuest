import { SessionMode, SessionStatus, SessionSnapshot } from '../../types/session.ts';
import { CoinBonus, RewardCalculationResult } from '../../types/economy.ts';
import { getCoinBonusMultiplier } from '../economy/coinBonus.ts';
import { MultiplierRules } from './multiplierRules.ts';

export interface RewardConfig {
  countdownBaseCoinPerMinute: number;
  countdownBaseXpPerMinute: number;
  stopwatchBaseCoinPerMinute: number;
  stopwatchBaseXpPerMinute: number;
  stopwatchMinMinutesThreshold: number;
}

export const DEFAULT_REWARD_CONFIG: RewardConfig = {
  countdownBaseCoinPerMinute: 1.5, // 1.5 Coins per minute for Countdown
  countdownBaseXpPerMinute: 5.0,   // 5 XP per minute for Countdown
  stopwatchBaseCoinPerMinute: 1.0, // 1 Coin per minute for Stopwatch
  stopwatchBaseXpPerMinute: 3.0,   // 3 XP per minute for Stopwatch
  stopwatchMinMinutesThreshold: 5, // Minimum 5 minutes required for rewards
};

export class RewardEngine {
  constructor(private config: RewardConfig = DEFAULT_REWARD_CONFIG) {}

  /**
   * Pure reward calculation for any session state.
   */
  calculateReward(params: {
    mode: SessionMode;
    status: SessionStatus;
    targetMinutes: number;
    actualFocusMinutes: number;
    lockedMultiplier?: number;
    coinBonuses?: readonly CoinBonus[];
  }): RewardCalculationResult {
    const { mode, status, targetMinutes, actualFocusMinutes, lockedMultiplier, coinBonuses } = params;
    // Civilization bonuses are additive and applied exactly once, on the base rate.
    const coinBonusMultiplier = getCoinBonusMultiplier(coinBonuses);

    // 1. Countdown Mode
    if (mode === 'COUNTDOWN') {
      const multiplier = lockedMultiplier ?? MultiplierRules.getCountdownMultiplier(targetMinutes);

      // If user gave up, was interrupted, or did not complete 100% of target
      const isCompleted = status === 'COMPLETED' || actualFocusMinutes >= targetMinutes;
      if (!isCompleted || status === 'ABANDONED' || status === 'INTERRUPTED') {
        return {
          eligibleMinutes: 0,
          actualFocusMinutes,
          multiplier,
          coinBonusMultiplier,
          rawCoinsEarned: 0,
          coinsEarned: 0,
          rawXpEarned: 0,
          xpEarned: 0,
          isThresholdMet: false,
          isCompleted: false,
        };
      }

      // Completed 100% Countdown: maintain full floating-point precision (no Math.floor/rounding before storage)
      const eligibleMinutes = targetMinutes;
      const coinsEarned =
        this.config.countdownBaseCoinPerMinute * eligibleMinutes * multiplier * coinBonusMultiplier;
      const xpEarned = this.config.countdownBaseXpPerMinute * eligibleMinutes * multiplier;

      return {
        eligibleMinutes,
        actualFocusMinutes,
        multiplier,
        coinBonusMultiplier,
        rawCoinsEarned: coinsEarned,
        coinsEarned,
        rawXpEarned: xpEarned,
        xpEarned,
        isThresholdMet: true,
        isCompleted: true,
      };
    }

    // 2. Stopwatch Mode
    const multiplier = lockedMultiplier ?? MultiplierRules.getStopwatchMultiplier(actualFocusMinutes);

    // Below 5-minute threshold rule
    if (actualFocusMinutes < this.config.stopwatchMinMinutesThreshold) {
      return {
        eligibleMinutes: 0,
        actualFocusMinutes,
        multiplier,
        coinBonusMultiplier,
        rawCoinsEarned: 0,
        coinsEarned: 0,
        rawXpEarned: 0,
        xpEarned: 0,
        isThresholdMet: false,
        isCompleted: status === 'COMPLETED',
      };
    }

    // At or above 5-minute threshold: reward for ALL valid focus minutes without capping or flooring
    const eligibleMinutes = actualFocusMinutes;
    const coinsEarned =
      this.config.stopwatchBaseCoinPerMinute * eligibleMinutes * multiplier * coinBonusMultiplier;
    const xpEarned = this.config.stopwatchBaseXpPerMinute * eligibleMinutes * multiplier;

    return {
      eligibleMinutes,
      actualFocusMinutes,
      multiplier,
      coinBonusMultiplier,
      rawCoinsEarned: coinsEarned,
      coinsEarned,
      rawXpEarned: xpEarned,
      xpEarned,
      isThresholdMet: true,
      isCompleted: true,
    };
  }

  /**
   * Safe guard to process a session's reward only once (Idempotency).
   */
  processRewardWithIdempotencyGuard(
    session: SessionSnapshot,
    coinBonuses?: readonly CoinBonus[]
  ): {
    reward: RewardCalculationResult;
    alreadyProcessed: boolean;
  } {
    if (session.rewardProcessed) {
      // Already awarded previously - prevent double-crediting
      return {
        reward: {
          eligibleMinutes: 0,
          actualFocusMinutes: 0,
          multiplier: session.lockedMultiplier,
          coinBonusMultiplier: getCoinBonusMultiplier(coinBonuses),
          rawCoinsEarned: 0,
          coinsEarned: 0,
          rawXpEarned: 0,
          xpEarned: 0,
          isThresholdMet: false,
          isCompleted: false,
        },
        alreadyProcessed: true,
      };
    }

    // Calculate valid focus minutes from session timestamps
    const elapsedMinutes = Math.floor(
      Math.max(0, (session.completedAt ?? Date.now()) - session.startedAt - session.totalPauseMs) / 60000
    );

    const reward = this.calculateReward({
      mode: session.mode,
      status: session.status,
      targetMinutes: session.targetMinutes,
      actualFocusMinutes: elapsedMinutes,
      lockedMultiplier: session.lockedMultiplier,
      coinBonuses,
    });

    return {
      reward,
      alreadyProcessed: false,
    };
  }

  /**
   * Calculate reward for an interrupted Stopwatch session (e.g. extension disabled).
   * Per official spec (Section 7):
   * When extension is disabled while Stopwatch is running:
   * Session is INTERRUPTED, and reward = 0 (Coins = 0, XP = 0).
   */
  calculateInterruptedStopwatchReward(lastValidFocusMinutes: number): RewardCalculationResult {
    const multiplier = MultiplierRules.getStopwatchMultiplier(lastValidFocusMinutes);
    return {
      eligibleMinutes: 0,
      actualFocusMinutes: lastValidFocusMinutes,
      multiplier,
      rawCoinsEarned: 0,
      coinsEarned: 0,
      rawXpEarned: 0,
      xpEarned: 0,
      isThresholdMet: false,
      isCompleted: false,
    };
  }

  /**
   * Calculate cumulative rewards for Pomodoro sessions based on total valid Focus minutes
   * across all completed intervals.
   * Formula: Reward = Total Focus Minutes x BaseRate x SessionMultiplier
   * - Pomodoro Countdown BaseRate: 1.5 Coins/min, 5.0 XP/min
   * - Pomodoro Stopwatch BaseRate: 1.0 Coin/min, 3.0 XP/min
   * Preserves full IEEE-754 double precision without flooring.
   * Breaks and pauses are strictly excluded.
   */
  calculatePomodoroCumulativeReward(params: {
    mode: 'POMODORO_COUNTDOWN' | 'POMODORO_STOPWATCH';
    totalCompletedFocusMinutes: number;
    coinBonuses?: readonly CoinBonus[];
  }): {
    totalCoins: number;
    totalXp: number;
    multiplier: number;
    coinBonusMultiplier: number;
  } {
    const { mode, totalCompletedFocusMinutes, coinBonuses } = params;
    const baseCoinsPerMinute =
      mode === 'POMODORO_COUNTDOWN'
        ? this.config.countdownBaseCoinPerMinute
        : this.config.stopwatchBaseCoinPerMinute;
    const baseXpPerMinute =
      mode === 'POMODORO_COUNTDOWN'
        ? this.config.countdownBaseXpPerMinute
        : this.config.stopwatchBaseXpPerMinute;

    const multiplier = MultiplierRules.getSessionMultiplier(totalCompletedFocusMinutes);
    const coinBonusMultiplier = getCoinBonusMultiplier(coinBonuses);
    // XP has no civilization bonus until one is explicitly declared for XP.
    const totalCoins = totalCompletedFocusMinutes * baseCoinsPerMinute * multiplier * coinBonusMultiplier;
    const totalXp = totalCompletedFocusMinutes * baseXpPerMinute * multiplier;

    return {
      totalCoins,
      totalXp,
      multiplier,
      coinBonusMultiplier,
    };
  }

  /**
   * Calculate rewards for a single completed Pomodoro focus interval.
   * Backward-compatible helper.
   */
  calculatePomodoroIntervalReward(params: {
    mode: 'POMODORO_COUNTDOWN' | 'POMODORO_STOPWATCH';
    focusMinutes: number;
    targetMinutes: number;
    lockedMultiplier?: number;
    coinBonuses?: readonly CoinBonus[];
  }): {
    coinsEarned: number;
    xpEarned: number;
    multiplier: number;
    isCompleted: boolean;
  } {
    const { mode, focusMinutes, targetMinutes, lockedMultiplier, coinBonuses } = params;
    const coinBonusMultiplier = getCoinBonusMultiplier(coinBonuses);

    if (mode === 'POMODORO_COUNTDOWN') {
      const multiplier = lockedMultiplier ?? MultiplierRules.getCountdownMultiplier(targetMinutes);
      if (focusMinutes < targetMinutes) {
        return {
          coinsEarned: 0,
          xpEarned: 0,
          multiplier,
          isCompleted: false,
        };
      }
      const rawCoins =
        this.config.countdownBaseCoinPerMinute * targetMinutes * multiplier * coinBonusMultiplier;
      const rawXp = this.config.countdownBaseXpPerMinute * targetMinutes * multiplier;
      return {
        coinsEarned: rawCoins,
        xpEarned: rawXp,
        multiplier,
        isCompleted: true,
      };
    }

    // POMODORO_STOPWATCH: rewards based on actual focus minutes achieved
    const multiplier = lockedMultiplier ?? MultiplierRules.getStopwatchMultiplier(focusMinutes);
    if (focusMinutes <= 0) {
      return {
        coinsEarned: 0,
        xpEarned: 0,
        multiplier,
        isCompleted: false,
      };
    }
    const rawCoins =
      this.config.stopwatchBaseCoinPerMinute * focusMinutes * multiplier * coinBonusMultiplier;
    const rawXp = this.config.stopwatchBaseXpPerMinute * focusMinutes * multiplier;
    return {
      coinsEarned: rawCoins,
      xpEarned: rawXp,
      multiplier,
      isCompleted: true,
    };
  }
}
