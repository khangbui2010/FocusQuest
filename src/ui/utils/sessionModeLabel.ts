import { DEFAULT_POMODORO_CONFIG, SessionSnapshot } from '../../types/session.ts';
import { TranslationKey, TranslationParams } from '../../i18n/types.ts';

export type ModeTranslateFn = (key: TranslationKey, params?: TranslationParams) => string;

/**
 * Pure formatter for the single compact mode line displayed on the running Focus screen.
 */
export function getSessionModeLabel(session: SessionSnapshot, t: ModeTranslateFn): string {
  if (session.mode === 'COUNTDOWN') {
    return t('timer.modeLabel.countdown');
  }
  if (session.mode === 'STOPWATCH') {
    return t('timer.modeLabel.stopwatch');
  }

  const pConfig = session.pomodoroConfig;
  const pState = session.pomodoroState;

  const intervalsPerCycle =
    pConfig?.focusIntervalsPerCycle ??
    pConfig?.targetFocusSessions ??
    DEFAULT_POMODORO_CONFIG.focusIntervalsPerCycle ??
    4;
  const totalCycles =
    pConfig?.numberOfCycles ?? DEFAULT_POMODORO_CONFIG.numberOfCycles ?? 3;
  const currentInterval = pState?.currentInterval ?? 1;
  const currentCycle = pState?.currentCycle ?? 1;
  const phase = pState?.currentPhase ?? 'FOCUS';

  if (session.mode === 'POMODORO_COUNTDOWN') {
    if (phase === 'SHORT_BREAK') {
      return t('timer.modeLabel.pomodoroShortBreak', {
        cycle: currentCycle,
        totalCycles,
      });
    }
    if (phase === 'LONG_BREAK') {
      return t('timer.modeLabel.pomodoroLongBreak', {
        cycle: currentCycle,
        totalCycles,
      });
    }
    return t('timer.modeLabel.pomodoroFocus', {
      interval: currentInterval,
      intervalsPerCycle,
      cycle: currentCycle,
      totalCycles,
    });
  }

  // POMODORO_STOPWATCH
  if (phase === 'SHORT_BREAK') {
    return t('timer.modeLabel.pomodoroFlowShortBreak', {
      cycle: currentCycle,
    });
  }
  if (phase === 'LONG_BREAK') {
    return t('timer.modeLabel.pomodoroFlowLongBreak', {
      cycle: currentCycle,
    });
  }
  return t('timer.modeLabel.pomodoroFlowFocus', {
    interval: currentInterval,
    intervalsPerCycle,
    cycle: currentCycle,
  });
}
