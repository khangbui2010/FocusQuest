import { PauseRecord, PomodoroConfig, DEFAULT_POMODORO_CONFIG } from '../../types/session.ts';

export const MAX_PAUSE_DURATION_MS = 5 * 60 * 1000; // 5 minutes in milliseconds
export const MAX_PAUSES_ALLOWED = 2;

export interface ElapsedTimeCalculation {
  actualFocusMs: number;
  actualFocusMinutes: number; // Floor integer of minutes
  activePauseMs: number;      // Current in-progress pause duration (0 if running)
  totalPauseMs: number;       // All completed + in-progress pause duration
  isAutoResumeDue: boolean;   // True if current pause has reached or exceeded 5 minutes
}

export interface PomodoroPhaseTimeCalculation {
  elapsedPhaseMs: number;
  remainingPhaseMs: number;
  actualPhaseMinutes: number;
  isPhaseCompleted: boolean;
}

export class TimeCalculator {
  /**
   * Validate and sanitize Pomodoro configuration with bounded safety checks.
   * Focus interval duration: 5 to 90 minutes, step 5 (default 25)
   * Short break: 1 to 20 minutes, step 1 (default 5)
   * Long break: 5 to 60 minutes, step 5 (default 15)
   * Focus intervals per cycle: 2 to 10 intervals (default 4)
   * Number of cycles: 1 to 10 cycles (default 3)
   */
  static validatePomodoroConfig(config?: Partial<PomodoroConfig>): {
    valid: boolean;
    config: PomodoroConfig;
    error?: string;
  } {
    const focus =
      config?.focusIntervalDurationMinutes ??
      config?.focusDurationMinutes ??
      DEFAULT_POMODORO_CONFIG.focusDurationMinutes;
    const shortBreak =
      config?.shortBreakDurationMinutes ?? DEFAULT_POMODORO_CONFIG.shortBreakDurationMinutes;
    const longBreak =
      config?.longBreakDurationMinutes ?? DEFAULT_POMODORO_CONFIG.longBreakDurationMinutes;
    const intervalsPerCycle =
      config?.focusIntervalsPerCycle ??
      config?.targetFocusSessions ??
      DEFAULT_POMODORO_CONFIG.targetFocusSessions;
    const numberOfCycles =
      config?.numberOfCycles ?? DEFAULT_POMODORO_CONFIG.numberOfCycles ?? 3;

    const isFocusValid = focus === 1 || (focus >= 5 && focus <= 90 && focus % 5 === 0);
    if (!isFocusValid) {
      return {
        valid: false,
        config: DEFAULT_POMODORO_CONFIG,
        error: 'Focus duration must be between 5 and 90 minutes in steps of 5 (or 1 minute for test mode).',
      };
    }
    if (shortBreak < 1 || shortBreak > 20 || shortBreak % 1 !== 0) {
      return {
        valid: false,
        config: DEFAULT_POMODORO_CONFIG,
        error: 'Short break duration must be between 1 and 20 minutes in steps of 1.',
      };
    }
    const isLongBreakValid = longBreak === 1 || (longBreak >= 5 && longBreak <= 60 && longBreak % 5 === 0);
    if (!isLongBreakValid) {
      return {
        valid: false,
        config: DEFAULT_POMODORO_CONFIG,
        error: 'Long break duration must be between 5 and 60 minutes in steps of 5 (or 1 minute for test mode).',
      };
    }
    if (intervalsPerCycle < 2 || intervalsPerCycle > 10) {
      return {
        valid: false,
        config: DEFAULT_POMODORO_CONFIG,
        error: 'Target focus sessions before long break must be between 2 and 10.',
      };
    }
    if (numberOfCycles < 1 || numberOfCycles > 10) {
      return {
        valid: false,
        config: DEFAULT_POMODORO_CONFIG,
        error: 'Number of cycles must be between 1 and 10.',
      };
    }

    const roundedFocus = Math.round(focus);
    const roundedIntervals = Math.round(intervalsPerCycle);
    const roundedCycles = Math.round(numberOfCycles);

    return {
      valid: true,
      config: {
        focusDurationMinutes: roundedFocus,
        focusIntervalDurationMinutes: roundedFocus,
        shortBreakDurationMinutes: Math.round(shortBreak),
        longBreakDurationMinutes: Math.round(longBreak),
        targetFocusSessions: roundedIntervals,
        focusIntervalsPerCycle: roundedIntervals,
        numberOfCycles: roundedCycles,
      },
    };
  }

  static stepPomodoroFocus(current: number, direction: 1 | -1): number {
    const next = current + direction * 5;
    return Math.max(5, Math.min(90, next));
  }

  static stepPomodoroShortBreak(current: number, direction: 1 | -1): number {
    const next = current + direction * 1;
    return Math.max(1, Math.min(20, next));
  }

  static stepPomodoroLongBreak(current: number, direction: 1 | -1): number {
    const next = current + direction * 5;
    return Math.max(5, Math.min(60, next));
  }

  static stepPomodoroCycles(current: number, direction: 1 | -1): number {
    const next = current + direction * 1;
    return Math.max(1, Math.min(10, next));
  }

  static stepPomodoroIntervalsPerCycle(current: number, direction: 1 | -1): number {
    const next = current + direction * 1;
    return Math.max(2, Math.min(10, next));
  }

  /**
   * Calculate elapsed, remaining, and completion status for a Pomodoro phase.
   * Handles wall-clock timestamps and phase-specific pause deductions.
   */
  static calculatePomodoroPhaseTime(params: {
    phaseStartedAt: number;
    currentTime: number;
    phaseTargetMinutes: number; // 0 for stopwatch focus
    phaseTotalPauseMs: number;
    currentPauseStartedAt: number | null;
  }): PomodoroPhaseTimeCalculation {
    const {
      phaseStartedAt,
      currentTime,
      phaseTargetMinutes,
      phaseTotalPauseMs,
      currentPauseStartedAt,
    } = params;

    const safeCurrentTime = Math.max(phaseStartedAt, currentTime);
    let activePauseMs = 0;
    if (currentPauseStartedAt !== null) {
      const raw = Math.max(0, safeCurrentTime - currentPauseStartedAt);
      activePauseMs = Math.min(raw, MAX_PAUSE_DURATION_MS);
    }

    const allPauseMs = phaseTotalPauseMs + activePauseMs;
    const elapsedPhaseMs = Math.max(0, safeCurrentTime - phaseStartedAt - allPauseMs);
    const actualPhaseMinutes = Math.floor(elapsedPhaseMs / (60 * 1000));

    if (phaseTargetMinutes <= 0) {
      // Stopwatch mode: open-ended
      return {
        elapsedPhaseMs,
        remainingPhaseMs: 0,
        actualPhaseMinutes,
        isPhaseCompleted: false,
      };
    }

    const targetMs = phaseTargetMinutes * 60 * 1000;
    const remainingPhaseMs = Math.max(0, targetMs - elapsedPhaseMs);
    const isPhaseCompleted = remainingPhaseMs === 0;

    return {
      elapsedPhaseMs,
      remainingPhaseMs,
      actualPhaseMinutes,
      isPhaseCompleted,
    };
  }

  /**
   * Calculate exact elapsed focus time based on wall-clock timestamps.
   * Pure function independent of any setInterval or browser execution state.
   */
  static calculateElapsedTime(params: {
    startedAt: number;
    currentTime: number;
    status: 'RUNNING' | 'PAUSED' | 'COMPLETED' | 'ABANDONED' | 'INTERRUPTED' | 'IDLE';
    currentPauseStartedAt: number | null;
    totalCompletedPauseMs: number;
  }): ElapsedTimeCalculation {
    const {
      startedAt,
      currentTime,
      status,
      currentPauseStartedAt,
      totalCompletedPauseMs,
    } = params;

    if (status === 'IDLE' || startedAt <= 0) {
      return {
        actualFocusMs: 0,
        actualFocusMinutes: 0,
        activePauseMs: 0,
        totalPauseMs: 0,
        isAutoResumeDue: false,
      };
    }

    const safeCurrentTime = Math.max(startedAt, currentTime);
    let activePauseMs = 0;
    let isAutoResumeDue = false;

    if (status === 'PAUSED' && currentPauseStartedAt !== null) {
      const rawPauseMs = Math.max(0, safeCurrentTime - currentPauseStartedAt);
      if (rawPauseMs >= MAX_PAUSE_DURATION_MS) {
        // Capped at 5 minutes; auto-resume is triggered
        activePauseMs = MAX_PAUSE_DURATION_MS;
        isAutoResumeDue = true;
      } else {
        activePauseMs = rawPauseMs;
      }
    }

    const allPauseMs = totalCompletedPauseMs + activePauseMs;
    const totalElapsedMs = safeCurrentTime - startedAt;
    const actualFocusMs = Math.max(0, totalElapsedMs - allPauseMs);
    const actualFocusMinutes = Math.floor(actualFocusMs / (60 * 1000));

    return {
      actualFocusMs,
      actualFocusMinutes,
      activePauseMs,
      totalPauseMs: allPauseMs,
      isAutoResumeDue,
    };
  }

  /**
   * Complete an active pause, capping at MAX_PAUSE_DURATION_MS (5 mins)
   */
  static finalizePause(
    pauseStartedAt: number,
    resumedAt: number
  ): PauseRecord {
    const rawDuration = Math.max(0, resumedAt - pauseStartedAt);
    const cappedDuration = Math.min(rawDuration, MAX_PAUSE_DURATION_MS);
    return {
      pausedAt: pauseStartedAt,
      resumedAt: pauseStartedAt + cappedDuration,
      durationMs: cappedDuration,
    };
  }

  /**
   * Determine remaining time for a Countdown session
   */
  static calculateCountdownRemaining(
    targetMinutes: number,
    actualFocusMs: number
  ): { remainingMs: number; isCompleted: boolean } {
    const targetMs = targetMinutes * 60 * 1000;
    const remainingMs = Math.max(0, targetMs - actualFocusMs);
    return {
      remainingMs,
      isCompleted: remainingMs === 0,
    };
  }
}
