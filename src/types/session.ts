/**
 * Core session models and status types
 */

export type SessionMode =
  | 'COUNTDOWN'
  | 'STOPWATCH'
  | 'POMODORO_COUNTDOWN'
  | 'POMODORO_STOPWATCH';

export type PomodoroPhase = 'FOCUS' | 'SHORT_BREAK' | 'LONG_BREAK';

export interface PomodoroConfig {
  focusDurationMinutes: number;              // Backward compat alias (default: 25)
  focusIntervalDurationMinutes?: number;     // Standardized: Focus Interval Duration (default: 25, range 5-90)
  shortBreakDurationMinutes: number;         // Standardized: Short Break Duration (default: 5, range 1-20)
  longBreakDurationMinutes: number;          // Standardized: Long Break Duration (default: 15, range 5-60)
  targetFocusSessions: number;               // Backward compat alias (default: 4)
  focusIntervalsPerCycle?: number;           // Standardized: Focus Intervals per Cycle (default: 4, range 2-10)
  numberOfCycles?: number;                   // Standardized: Number of Cycles for Countdown (default: 3, range 1-10)
}

export const DEFAULT_POMODORO_CONFIG: PomodoroConfig = {
  focusDurationMinutes: 25,
  focusIntervalDurationMinutes: 25,
  shortBreakDurationMinutes: 5,
  longBreakDurationMinutes: 15,
  targetFocusSessions: 4,
  focusIntervalsPerCycle: 4,
  numberOfCycles: 3,
};

export interface PomodoroState {
  currentPhase: PomodoroPhase;
  currentInterval: number;            // 1-indexed (1 to focusIntervalsPerCycle within cycle)
  currentCycle?: number;              // 1-indexed (e.g. 1 for Cycle 1, 2 for Cycle 2...)
  completedFocusCount: number;        // Total number of completed focus intervals
  phaseStartedAt: number;             // Unix timestamp (ms) when current phase started
  phaseTargetDurationMinutes: number; // Target duration of current phase in minutes (0 for stopwatch focus)
  phaseTotalPauseMs: number;          // Accumulated pause ms during current phase specifically
  totalCompletedFocusMinutes: number; // Sum of focus minutes across all completed focus intervals
  accumulatedCoins: number;           // Exact coins earned from completed focus intervals (full double precision)
  accumulatedXp: number;              // Exact XP earned from completed focus intervals (full double precision)
}

export type SessionStatus =
  | 'IDLE'
  | 'RUNNING'
  | 'PAUSED'
  | 'COMPLETED'
  | 'ABANDONED'
  | 'INTERRUPTED';

export interface PauseRecord {
  pausedAt: number;     // Unix timestamp (ms)
  resumedAt: number;    // Unix timestamp (ms)
  durationMs: number;   // Duration of this pause in ms
}

export interface SessionSnapshot {
  id: string;                      // Unique session UUID
  mode: SessionMode;
  profileId: string;               // ID of the active profile
  status: SessionStatus;
  targetMinutes: number;           // Target focus duration in minutes (Countdown only, 0 for Stopwatch)
  lockedMultiplier: number;        // Multiplier determined & locked before Countdown. For Stopwatch, 1.0 initially
  startedAt: number;               // Unix timestamp (ms)
  currentPauseStartedAt: number | null; // Unix timestamp (ms) if currently paused, else null
  pauseCount: number;              // Number of pauses used in this session (max 2)
  totalPauseMs: number;            // Accumulated duration of all completed pauses in ms
  pauseHistory: PauseRecord[];     // History of pauses for audit and stats
  lastHeartbeatAt: number;         // Last recorded activity timestamp for crash/recovery estimation
  completedAt: number | null;      // Unix timestamp when session finished, abandoned, or interrupted
  rewardProcessed: boolean;        // Idempotency flag preventing double-claiming rewards
  notificationSent?: boolean;      // True if finish notification has been dispatched
  pauseExpiresAt?: number | null;  // Unix timestamp (ms) when 5-min pause expires and auto-resumes
  interruptedReason?: 'EXTENSION_DISABLED' | 'EXTENSION_RELOADED' | 'USER_ABANDONED' | 'MANUAL' | 'BROWSER_CLOSED' | 'BROWSER_CRASH' | 'UNKNOWN'; // Diagnostic reason for interruption
  lastKnownValidFocusMinutes?: number; // Focus minutes recorded up to interruption
  finalFocusMinutes?: number;      // Settled/frozen focus minutes recorded at terminal completion/abandonment/interruption
  lastCheckpointAt?: number;       // Unix timestamp (ms) when focus time was last checkpointed
  accumulatedFocusMs?: number;     // Confirmed focus milliseconds accumulated up to lastCheckpointAt
  pomodoroConfig?: PomodoroConfig; // Configuration if session is in Pomodoro mode
  pomodoroState?: PomodoroState;   // Real-time interval/phase state if session is in Pomodoro mode
  assignedJobIds?: readonly string[]; // Pre-session selected construction job IDs in priority order (undefined = Auto FIFO)
  autoContinueJobs?: boolean;         // Whether queued jobs continue FIFO once assigned slots finish (default true)
}
