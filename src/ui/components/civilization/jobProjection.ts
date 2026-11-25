/**
 * Pure UI-only live projection helpers for Construction Jobs (Milestone 5E-1 Stage B).
 *
 * Strictly zero storage writes and zero mutation of persisted state:
 * - While a Focus session is actively RUNNING (and in FOCUS phase for Pomodoro modes),
 *   computes live Focus seconds elapsed in the current session to drive 1-second countdown UI.
 * - While PAUSED or in Pomodoro SHORT_BREAK/LONG_BREAK, freezes at the accumulated focus seconds
 *   so far without ticking.
 * - While IDLE, COMPLETED, ABANDONED, or INTERRUPTED, returns 0 so persisted state is authoritative.
 */

import { BUILDING_DEMOLISH_REFUND_RATE } from '../../../core/civilization/constants.ts';
import { ConstructionJob } from '../../../core/civilization/jobs.ts';
import { SessionSnapshot } from '../../../types/session.ts';

/**
 * Returns true strictly when Focus seconds are actively ticking right now.
 */
export function isLiveFocusTicking(session: SessionSnapshot | null | undefined): boolean {
  if (!session || session.status !== 'RUNNING') {
    return false;
  }
  const isPomodoro =
    session.mode === 'POMODORO_COUNTDOWN' || session.mode === 'POMODORO_STOPWATCH';
  if (isPomodoro && session.pomodoroState && session.pomodoroState.currentPhase !== 'FOCUS') {
    return false;
  }
  return true;
}

/**
 * Computes integer live Focus seconds to project onto queued/active ConstructionJobs.
 * - COMPLETED/ABANDONED/INTERRUPTED/IDLE -> 0 (terminal sessions already settled or forfeited).
 * - RUNNING / PAUSED -> exact focus seconds accumulated up to `nowMs` (or `currentPauseStartedAt` when paused).
 * - Pomodoro BREAK phases -> completed intervals so far (`totalCompletedFocusMinutes * 60`), frozen during break.
 */
export function computeLiveSessionElapsedFocusSeconds(
  session: SessionSnapshot | null | undefined,
  nowMs: number
): number {
  if (!session) {
    return 0;
  }
  if (session.status !== 'RUNNING' && session.status !== 'PAUSED') {
    return 0;
  }

  const effectiveNow =
    session.status === 'PAUSED' &&
    typeof session.currentPauseStartedAt === 'number' &&
    Number.isFinite(session.currentPauseStartedAt)
      ? session.currentPauseStartedAt
      : nowMs;

  if (session.mode === 'POMODORO_COUNTDOWN' || session.mode === 'POMODORO_STOPWATCH') {
    const pState = session.pomodoroState;
    if (!pState) {
      return 0;
    }
    const completedSeconds = Math.max(0, Math.floor(pState.totalCompletedFocusMinutes * 60));
    if (pState.currentPhase !== 'FOCUS') {
      // Strictly exclude break duration; stay frozen on completed focus intervals only.
      return completedSeconds;
    }
    const phaseElapsedMs = Math.max(
      0,
      effectiveNow - pState.phaseStartedAt - (pState.phaseTotalPauseMs ?? 0)
    );
    let phaseSeconds = Math.floor(phaseElapsedMs / 1000);
    if (
      session.mode === 'POMODORO_COUNTDOWN' &&
      pState.phaseTargetDurationMinutes > 0
    ) {
      phaseSeconds = Math.min(phaseSeconds, Math.floor(pState.phaseTargetDurationMinutes * 60));
    }
    return completedSeconds + phaseSeconds;
  }

  const rawElapsedMs = Math.max(
    0,
    effectiveNow - session.startedAt - (session.totalPauseMs ?? 0)
  );
  const rawSeconds = Math.floor(rawElapsedMs / 1000);
  if (session.mode === 'COUNTDOWN' && session.targetMinutes > 0) {
    return Math.min(rawSeconds, Math.floor(session.targetMinutes * 60));
  }
  return rawSeconds;
}

/**
 * Formats integer remaining Focus seconds into crisp countdown display (`H:MM:SS` or `MM:SS`).
 */
export function formatJobCountdown(remainingSeconds: number): string {
  const safe =
    typeof remainingSeconds === 'number' && Number.isFinite(remainingSeconds) && remainingSeconds > 0
      ? Math.ceil(remainingSeconds)
      : 0;
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  if (hours > 0) {
    return `${hours}:${pad(minutes)}:${pad(secs)}`;
  }
  return `${pad(minutes)}:${pad(secs)}`;
}

/**
 * Formats whole-minute construction/upgrade durations concisely for catalog & detail previews.
 */
export function formatJobDurationMinutes(durationSeconds: number): number {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return 0;
  }
  return Math.round(durationSeconds / 60);
}

export interface CancelJobRefundPreview {
  readonly cancelledCount: number;
  readonly refundCoins: number;
  readonly isUnstarted: boolean;
}

/**
 * Mirrors CivilizationCoordinator.cancelConstructionJob refund logic for exact UI previews:
 * - Unstarted job (`remainingSeconds === totalSeconds`): 100% refund
 * - Started job (`remainingSeconds < totalSeconds`): 50% refund
 * - Upgrading cascades to any higher targetLevel upgrade jobs on the same building.
 */
export function getCancelJobRefundPreview(
  targetJob: ConstructionJob,
  allJobs: readonly ConstructionJob[]
): CancelJobRefundPreview {
  const jobsToCancel: readonly ConstructionJob[] =
    targetJob.kind === 'upgrade' &&
    targetJob.buildingId &&
    typeof targetJob.targetLevel === 'number'
      ? allJobs.filter(
          (j) =>
            j.kind === 'upgrade' &&
            j.buildingId === targetJob.buildingId &&
            typeof j.targetLevel === 'number' &&
            j.targetLevel >= targetJob.targetLevel!
        )
      : [targetJob];

  let refundCoins = 0;
  for (const job of jobsToCancel) {
    const rate = job.remainingSeconds === job.totalSeconds ? 1 : BUILDING_DEMOLISH_REFUND_RATE;
    refundCoins += job.paidCoins * rate;
  }

  return {
    cancelledCount: jobsToCancel.length,
    refundCoins,
    isUnstarted: targetJob.remainingSeconds === targetJob.totalSeconds,
  };
}
