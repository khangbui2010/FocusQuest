import { SessionStatus } from '../../types/session.ts';
import { ERROR_CODES, ErrorCode, ErrorParams } from '../../i18n/errorCodes.ts';

export type TimerEvent =
  | 'START'
  | 'PAUSE'
  | 'RESUME'
  | 'AUTO_RESUME'
  | 'FINISH'
  | 'GIVE_UP'
  | 'INTERRUPT'
  | 'RESET';

export interface StateTransitionResult {
  success: boolean;
  nextStatus: SessionStatus;
  error?: string;
  errorCode?: ErrorCode;
  errorParams?: ErrorParams;
}

export class TimerStateMachine {
  /**
   * Determine whether a transition from currentStatus via event is valid,
   * returning the next status or an explanatory error.
   */
  static transition(
    currentStatus: SessionStatus,
    event: TimerEvent,
    context?: { pauseCount?: number }
  ): StateTransitionResult {
    switch (currentStatus) {
      case 'IDLE':
        if (event === 'START') {
          return { success: true, nextStatus: 'RUNNING' };
        }
        return {
          success: false,
          nextStatus: 'IDLE',
          error: `Invalid transition: cannot perform '${event}' while in 'IDLE' status.`,
          errorCode: ERROR_CODES.TIMER_INVALID_TRANSITION,
          errorParams: { event, status: 'IDLE' },
        };

      case 'RUNNING':
        if (event === 'PAUSE') {
          const pauseCount = context?.pauseCount ?? 0;
          if (pauseCount >= 2) {
            return {
              success: false,
              nextStatus: 'RUNNING',
              error: `Maximum pause limit reached (2 pauses allowed per session).`,
              errorCode: ERROR_CODES.TIMER_MAX_PAUSES_REACHED,
            };
          }
          return { success: true, nextStatus: 'PAUSED' };
        }
        if (event === 'FINISH') {
          return { success: true, nextStatus: 'COMPLETED' };
        }
        if (event === 'GIVE_UP') {
          return { success: true, nextStatus: 'ABANDONED' };
        }
        if (event === 'INTERRUPT') {
          return { success: true, nextStatus: 'INTERRUPTED' };
        }
        return {
          success: false,
          nextStatus: 'RUNNING',
          error: `Invalid transition: cannot perform '${event}' while in 'RUNNING' status.`,
          errorCode: ERROR_CODES.TIMER_INVALID_TRANSITION,
          errorParams: { event, status: 'RUNNING' },
        };

      case 'PAUSED':
        if (event === 'RESUME' || event === 'AUTO_RESUME') {
          return { success: true, nextStatus: 'RUNNING' };
        }
        if (event === 'FINISH') {
          return { success: true, nextStatus: 'COMPLETED' };
        }
        if (event === 'GIVE_UP') {
          return { success: true, nextStatus: 'ABANDONED' };
        }
        if (event === 'INTERRUPT') {
          return { success: true, nextStatus: 'INTERRUPTED' };
        }
        return {
          success: false,
          nextStatus: 'PAUSED',
          error: `Invalid transition: cannot perform '${event}' while in 'PAUSED' status.`,
          errorCode: ERROR_CODES.TIMER_INVALID_TRANSITION,
          errorParams: { event, status: 'PAUSED' },
        };

      case 'COMPLETED':
      case 'ABANDONED':
      case 'INTERRUPTED':
        if (event === 'RESET') {
          return { success: true, nextStatus: 'IDLE' };
        }
        return {
          success: false,
          nextStatus: currentStatus,
          error: `Terminal status '${currentStatus}' cannot perform '${event}'. Must 'RESET' to 'IDLE'.`,
          errorCode: ERROR_CODES.TIMER_TERMINAL_STATUS_ACTION,
          errorParams: { event, status: currentStatus },
        };

      default:
        return {
          success: false,
          nextStatus: currentStatus,
          error: `Unknown session status: '${currentStatus}'.`,
          errorCode: ERROR_CODES.TIMER_UNKNOWN_STATUS,
          errorParams: { status: String(currentStatus) },
        };
    }
  }

  /**
   * Helper checking if a state is active (in-progress)
   */
  static isActive(status: SessionStatus): boolean {
    return status === 'RUNNING' || status === 'PAUSED';
  }

  /**
   * Helper checking if a state is terminal
   */
  static isTerminal(status: SessionStatus): boolean {
    return status === 'COMPLETED' || status === 'ABANDONED' || status === 'INTERRUPTED';
  }
}
