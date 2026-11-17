import { SessionMode } from '../../types/session.ts';

export class MultiplierRules {
  /**
   * Unified official multiplier schedule applied across all modes:
   * - Countdown
   * - Stopwatch
   * - Pomodoro Countdown
   * - Pomodoro Stopwatch
   *
   * Schedule:
   * - 5 - 29 min:   x1.0
   * - 30 - 59 min:  x1.2
   * - 60 - 89 min:  x1.4
   * - 90 - 119 min: x1.6
   * - 120 - 149 min: x1.8
   * - 150 - 179 min: x2.0
   * - 180+ min:     x2.5
   *
   * 180 minutes is NOT a session limit. It is the beginning of the highest multiplier tier.
   * Focus times of 200, 240, 300+ minutes receive 2.5x on ALL actual minutes.
   */
  static getSessionMultiplier(focusMinutes: number): number {
    if (focusMinutes < 30) {
      return 1.0;
    }
    if (focusMinutes < 60) {
      return 1.2;
    }
    if (focusMinutes < 90) {
      return 1.4;
    }
    if (focusMinutes < 120) {
      return 1.6;
    }
    if (focusMinutes < 150) {
      return 1.8;
    }
    if (focusMinutes < 180) {
      return 2.0;
    }
    return 2.5;
  }

  /**
   * Countdown multiplier based on target duration (locked at start).
   */
  static getCountdownMultiplier(targetMinutes: number): number {
    return this.getSessionMultiplier(targetMinutes);
  }

  /**
   * Stopwatch multiplier based on actual focus minutes achieved at finish.
   * Uses the exact same multiplier table as Countdown.
   */
  static getStopwatchMultiplier(actualFocusMinutes: number): number {
    return this.getSessionMultiplier(actualFocusMinutes);
  }

  /**
   * Mode classification helpers
   */
  static isCountdownMode(mode: SessionMode): boolean {
    return mode === 'COUNTDOWN' || mode === 'POMODORO_COUNTDOWN';
  }

  static isStopwatchMode(mode: SessionMode): boolean {
    return mode === 'STOPWATCH' || mode === 'POMODORO_STOPWATCH';
  }

  /**
   * Generic multiplier resolver
   */
  static resolveMultiplier(params: {
    mode: SessionMode;
    targetMinutes: number;
    actualFocusMinutes: number;
    lockedMultiplier?: number;
  }): number {
    if (this.isCountdownMode(params.mode)) {
      return params.lockedMultiplier ?? this.getCountdownMultiplier(params.targetMinutes);
    }
    return this.getStopwatchMultiplier(params.actualFocusMinutes);
  }
}

