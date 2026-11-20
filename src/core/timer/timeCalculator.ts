import {
  PauseRecord,
  PomodoroConfig,
  DEFAULT_POMODORO_CONFIG,
  SessionSnapshot,
  SessionStatus,
} from '../../types/session.ts';

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

export function isTerminalSessionStatus(status: SessionStatus): boolean {
  return status === 'COMPLETED' || status === 'ABANDONED' || status === 'INTERRUPTED';
}

/**
 * Resolve the effective end timestamp for a session.
 * Terminal sessions (COMPLETED / ABANDONED / INTERRUPTED) MUST NEVER evaluate against live Date.now();
 * they freeze at completedAt, falling back safely to lastCheckpointAt / lastHeartbeatAt / startedAt.
 */
export function resolveSessionEndTimestamp(
  session: Pick<
    SessionSnapshot,
    'status' | 'startedAt' | 'completedAt' | 'lastCheckpointAt' | 'lastHeartbeatAt'
  >,
  liveCurrentTime?: number
): number {
  const safeStartedAt = Number.isFinite(session.startedAt) ? session.startedAt : 0;
  if (session.status === 'IDLE' || safeStartedAt <= 0) {
    return safeStartedAt;
  }

  if (isTerminalSessionStatus(session.status)) {
    if (typeof session.completedAt === 'number' && Number.isFinite(session.completedAt)) {
      return Math.max(safeStartedAt, session.completedAt);
    }
    const checkpoint =
      typeof session.lastCheckpointAt === 'number' && Number.isFinite(session.lastCheckpointAt)
        ? session.lastCheckpointAt
        : 0;
    const heartbeat =
      typeof session.lastHeartbeatAt === 'number' && Number.isFinite(session.lastHeartbeatAt)
        ? session.lastHeartbeatAt
        : 0;
    return Math.max(safeStartedAt, checkpoint, heartbeat);
  }

  if (typeof liveCurrentTime === 'number' && Number.isFinite(liveCurrentTime)) {
    return Math.max(safeStartedAt, liveCurrentTime);
  }

  const heartbeat =
    typeof session.lastHeartbeatAt === 'number' && Number.isFinite(session.lastHeartbeatAt)
      ? session.lastHeartbeatAt
      : 0;
  return Math.max(safeStartedAt, heartbeat);
}

/**
 * Pure Single Source of Truth for terminal session focus minutes (COMPLETED / ABANDONED / INTERRUPTED).
 * Strictly frozen at completion/interruption time and never grows with wall-clock Date.now().
 */
export function getFrozenSessionFocusMinutes(session: SessionSnapshot): number {
  if (!isTerminalSessionStatus(session.status) || !Number.isFinite(session.startedAt) || session.startedAt <= 0) {
    return 0;
  }

  if (typeof session.finalFocusMinutes === 'number' && Number.isFinite(session.finalFocusMinutes)) {
    return Math.floor(Math.max(0, session.finalFocusMinutes));
  }

  if (
    session.status === 'INTERRUPTED' &&
    typeof session.lastKnownValidFocusMinutes === 'number' &&
    Number.isFinite(session.lastKnownValidFocusMinutes)
  ) {
    return Math.floor(Math.max(0, session.lastKnownValidFocusMinutes));
  }

  if (session.mode === 'COUNTDOWN' && session.status === 'COMPLETED') {
    const safeTarget = Number.isFinite(session.targetMinutes) ? session.targetMinutes : 0;
    return Math.floor(Math.max(0, safeTarget));
  }

  if (
    typeof session.lastKnownValidFocusMinutes === 'number' &&
    Number.isFinite(session.lastKnownValidFocusMinutes)
  ) {
    return Math.floor(Math.max(0, session.lastKnownValidFocusMinutes));
  }

  const hasCompletedAt =
    typeof session.completedAt === 'number' && Number.isFinite(session.completedAt);
  const frozenEndTime = resolveSessionEndTimestamp(session);

  // Guard for legacy snapshots that persisted a terminal status while currentPauseStartedAt remained set.
  const unfinalizedPauseMs =
    session.currentPauseStartedAt !== null && Number.isFinite(session.currentPauseStartedAt)
      ? Math.min(Math.max(0, frozenEndTime - session.currentPauseStartedAt), MAX_PAUSE_DURATION_MS)
      : 0;

  const basePauseMs = Number.isFinite(session.totalPauseMs) ? Math.max(0, session.totalPauseMs) : 0;
  const elapsed = TimeCalculator.calculateElapsedTime({
    startedAt: session.startedAt,
    currentTime: frozenEndTime,
    status: session.status,
    currentPauseStartedAt: null,
    totalCompletedPauseMs: basePauseMs + unfinalizedPauseMs,
  });

  if (!hasCompletedAt && session.mode === 'COUNTDOWN' && session.targetMinutes > 0) {
    return Math.min(elapsed.actualFocusMinutes, Math.floor(session.targetMinutes));
  }

  return elapsed.actualFocusMinutes;
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
    status: SessionStatus;
    currentPauseStartedAt: number | null;
    totalCompletedPauseMs: number;
    completedAt?: number | null;
  }): ElapsedTimeCalculation {
    const {
      startedAt,
      currentTime,
      status,
      currentPauseStartedAt,
      totalCompletedPauseMs,
      completedAt,
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

    const isTerminal = isTerminalSessionStatus(status);
    const effectiveEndTime =
      isTerminal && typeof completedAt === 'number' && Number.isFinite(completedAt)
        ? completedAt
        : currentTime;

    const safeCurrentTime = Math.max(startedAt, effectiveEndTime);
    let activePauseMs = 0;
    let isAutoResumeDue = false;

    if ((status === 'PAUSED' || isTerminal) && currentPauseStartedAt !== null) {
      const rawPauseMs = Math.max(0, safeCurrentTime - currentPauseStartedAt);
      if (rawPauseMs >= MAX_PAUSE_DURATION_MS) {
        // Capped at 5 minutes; auto-resume is triggered (for PAUSED)
        activePauseMs = MAX_PAUSE_DURATION_MS;
        isAutoResumeDue = status === 'PAUSED';
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
