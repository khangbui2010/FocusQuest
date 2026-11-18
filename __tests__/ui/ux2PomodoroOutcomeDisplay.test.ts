import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { TimerView } from '../../src/ui/components/TimerView.tsx';
import { FocusProfile } from '../../src/types/profiles.ts';
import { DEFAULT_POMODORO_CONFIG, PomodoroConfig, SessionSnapshot } from '../../src/types/session.ts';
import { I18nProvider } from '../../src/i18n/I18nContext.tsx';
import { EN_MESSAGES } from '../../src/i18n/locales/en.ts';
import { VI_MESSAGES } from '../../src/i18n/locales/vi.ts';
import { SupportedLocale } from '../../src/i18n/types.ts';

type TimerViewProps = React.ComponentProps<typeof TimerView>;

function makeProfile(): FocusProfile {
  return {
    id: 'profile-study',
    name: 'Study & Research',
    allowedDomains: ['github.com'],
    isDefault: true,
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
  };
}

function makeTimerProps(overrides: Partial<TimerViewProps> = {}): TimerViewProps {
  return {
    session: null,
    activeProfile: makeProfile(),
    era: 'STONE_AGE',
    activeBonusRate: 0,
    isBonusLoading: false,
    onStartSession: async () => {},
    onPauseSession: async () => {},
    onResumeSession: async () => {},
    onGiveUpSession: async () => {},
    onFinishStopwatch: async () => {},
    onSkipBreak: async () => {},
    onAdvancePomodoroStage: async () => {},
    onResetSession: async () => {},
    onRefreshSession: async () => {},
    isLoading: false,
    onOpenProfiles: () => {},
    chimeEnabled: true,
    onToggleChime: async () => {},
    ...overrides,
  };
}

function makePomoCountdownSession(overrides: Partial<SessionSnapshot> = {}): SessionSnapshot {
  return {
    id: 'sess-ux2-pomo-cd',
    mode: 'POMODORO_COUNTDOWN',
    profileId: 'profile-study',
    status: 'ABANDONED',
    targetMinutes: 90,
    lockedMultiplier: 2.5,
    startedAt: 1700000000000,
    currentPauseStartedAt: null,
    totalPauseMs: 0,
    pauseCount: 0,
    pauseHistory: [],
    lastHeartbeatAt: 1700000000000,
    completedAt: 1700010800000,
    rewardProcessed: true,
    pomodoroConfig: {
      focusDurationMinutes: 90,
      focusIntervalDurationMinutes: 90,
      shortBreakDurationMinutes: 15,
      longBreakDurationMinutes: 30,
      targetFocusSessions: 5,
      focusIntervalsPerCycle: 5,
      numberOfCycles: 2,
    },
    pomodoroState: {
      currentPhase: 'FOCUS',
      currentInterval: 3,
      currentCycle: 1,
      completedFocusCount: 2,
      phaseStartedAt: 1700010800000,
      phaseTargetDurationMinutes: 90,
      phaseTotalPauseMs: 0,
      totalCompletedFocusMinutes: 180,
      // Stale projected total left intact by giveUpCountdown()
      accumulatedCoins: 35437.5,
      accumulatedXp: 112500,
    },
    ...overrides,
  };
}

function renderTimer(session: SessionSnapshot, locale: SupportedLocale = 'en'): string {
  const el = React.createElement(TimerView, makeTimerProps({ session }));
  return renderToString(
    locale === 'en' ? el : React.createElement(I18nProvider, { locale }, el)
  )
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ');
}

function renderTimerRaw(session: SessionSnapshot, locale: SupportedLocale = 'en'): string {
  const el = React.createElement(TimerView, makeTimerProps({ session }));
  return renderToString(
    locale === 'en' ? el : React.createElement(I18nProvider, { locale }, el)
  );
}

// ============================================================================
// 1. POMODORO COUNTDOWN ABANDONED & INTERRUPTED (ZERO REWARD + ACCURATE COPY)
// ============================================================================

test('UX-2 Outcome: POMODORO_COUNTDOWN ABANDONED after N intervals shows +0/+0, N / total (Xm), and non-retained description (EN & VI)', () => {
  const abandonedWith2Phases = makePomoCountdownSession({ status: 'ABANDONED' });

  const enText = renderTimer(abandonedWith2Phases, 'en');
  assert.ok(enText.includes('2 / 10 (180m)'), `Expected '2 / 10 (180m)' in EN: ${enText}`);
  assert.ok(enText.includes('+0') && !enText.includes('35437.5') && !enText.includes('112500'),
    `Must show 0 rewards and NEVER projected values: ${enText}`);
  assert.ok(enText.includes(EN_MESSAGES['timer.outcome.pomoCountdownIncompleteDesc']));
  assert.ok(!enText.includes('safely retained in your wallet'));
  assert.ok(!enText.includes('Quest'));

  const viText = renderTimer(abandonedWith2Phases, 'vi');
  assert.ok(viText.includes('2 / 10 (180m)'), `Expected '2 / 10 (180m)' in VI: ${viText}`);
  assert.ok(viText.includes('+0') && !viText.includes('35437.5') && !viText.includes('112500'));
  assert.ok(viText.includes(VI_MESSAGES['timer.outcome.pomoCountdownIncompleteDesc']));
  assert.ok(!viText.includes('được lưu an toàn vào ví'));
});

test('UX-2 Outcome: POMODORO_COUNTDOWN ABANDONED at 0 intervals and INTERRUPTED after N intervals both show +0/+0 and incomplete explanation (never retained-in-wallet)', () => {
  // ABANDONED at 0 completed intervals (still carrying projected initialCoins in pomodoroState)
  const abandonedZero = makePomoCountdownSession({
    status: 'ABANDONED',
    pomodoroConfig: DEFAULT_POMODORO_CONFIG,
    pomodoroState: {
      currentPhase: 'FOCUS',
      currentInterval: 1,
      currentCycle: 1,
      completedFocusCount: 0,
      phaseStartedAt: 1700000000000,
      phaseTargetDurationMinutes: 25,
      phaseTotalPauseMs: 0,
      totalCompletedFocusMinutes: 0,
      accumulatedCoins: 1125,
      accumulatedXp: 3750,
    },
  });

  const enZero = renderTimer(abandonedZero, 'en');
  assert.ok(enZero.includes('0 / 12 (0m)'), `Expected '0 / 12 (0m)' in EN: ${enZero}`);
  assert.ok(enZero.includes('+0') && !enZero.includes('1125') && !enZero.includes('3750'));
  assert.ok(enZero.includes(EN_MESSAGES['timer.outcome.pomoCountdownIncompleteDesc']));
  assert.ok(!enZero.includes('safely retained in your wallet'));

  // INTERRUPTED after 2 completed intervals (even if accumulatedCoins wasn't zeroed in snapshot)
  const interruptedWith2 = makePomoCountdownSession({
    status: 'INTERRUPTED',
    interruptedReason: 'BROWSER_CLOSED',
    lastKnownValidFocusMinutes: 185,
  });

  const viInt = renderTimer(interruptedWith2, 'vi');
  assert.ok(viInt.includes('2 / 10 (180m)'), `Expected '2 / 10 (180m)' in VI: ${viInt}`);
  assert.ok(viInt.includes('+0') && !viInt.includes('35437.5') && !viInt.includes('112500'));
  assert.ok(viInt.includes(VI_MESSAGES['timer.outcome.pomoCountdownIncompleteDesc']));
  assert.ok(!viInt.includes('được lưu an toàn vào ví'));

  // Fallback when pomodoroConfig omits numberOfCycles: displays N (Xm) without '/ total'
  const withoutCyclesConfig = makePomoCountdownSession({
    status: 'ABANDONED',
    pomodoroConfig: {
      focusDurationMinutes: 25,
      shortBreakDurationMinutes: 5,
      longBreakDurationMinutes: 15,
      targetFocusSessions: 4,
    },
  });
  const fallbackText = renderTimer(withoutCyclesConfig, 'en');
  assert.ok(fallbackText.includes('2 (180m)') && !fallbackText.includes('2 /'));
});

// ============================================================================
// 2. COUNTDOWN OUTCOMES & COMPLETED PRESERVATION & POMODORO STOPWATCH UNCHANGED
// ============================================================================

test('UX-2 Outcome: standard COUNTDOWN ABANDONED & INTERRUPTED show 0 rewards; COMPLETED outcomes and POMODORO_STOPWATCH remain unchanged', () => {
  const cdAbandoned: SessionSnapshot = {
    id: 'sess-cd-ab',
    mode: 'COUNTDOWN',
    profileId: 'profile-study',
    status: 'ABANDONED',
    targetMinutes: 60,
    lockedMultiplier: 1.4,
    startedAt: 1700000000000,
    currentPauseStartedAt: null,
    totalPauseMs: 0,
    pauseCount: 0,
    pauseHistory: [],
    lastHeartbeatAt: 1700000600000,
    completedAt: 1700000600000,
    rewardProcessed: true,
  };
  const cdAbText = renderTimer(cdAbandoned, 'en');
  assert.ok(cdAbText.includes('+0') && cdAbText.includes(EN_MESSAGES['timer.outcome.endedEarlyDesc']));

  const cdInterrupted: SessionSnapshot = {
    ...cdAbandoned,
    id: 'sess-cd-int',
    status: 'INTERRUPTED',
    lastKnownValidFocusMinutes: 15,
  };
  const cdIntText = renderTimer(cdInterrupted, 'vi');
  assert.ok(cdIntText.includes('15m') && cdIntText.includes('+0'));
  assert.ok(cdIntText.includes(VI_MESSAGES['timer.outcome.endedInterruptedDesc']));

  // COMPLETED POMODORO_COUNTDOWN keeps full settlement & N (Xm) format
  const pomoCdCompleted = makePomoCountdownSession({
    status: 'COMPLETED',
    pomodoroState: {
      currentPhase: 'FOCUS',
      currentInterval: 5,
      currentCycle: 2,
      completedFocusCount: 10,
      phaseStartedAt: 1700010800000,
      phaseTargetDurationMinutes: 90,
      phaseTotalPauseMs: 0,
      totalCompletedFocusMinutes: 900,
      accumulatedCoins: 3375,
      accumulatedXp: 11250,
    },
  });
  const completedText = renderTimer(pomoCdCompleted, 'en');
  assert.ok(completedText.includes('Focus Session Completed!'));
  assert.ok(completedText.includes('10 (900m)'));
  assert.ok(completedText.includes('+3375'));
  assert.ok(completedText.includes('+11250'));

  // POMODORO_STOPWATCH INTERRUPTED (BROWSER_CLOSED) with completed interval keeps retained reward & message
  const pomoSwInterrupted: SessionSnapshot = {
    ...cdAbandoned,
    id: 'sess-psw-int',
    mode: 'POMODORO_STOPWATCH',
    status: 'INTERRUPTED',
    lastKnownValidFocusMinutes: 35,
    pomodoroConfig: DEFAULT_POMODORO_CONFIG,
    pomodoroState: {
      currentPhase: 'FOCUS',
      currentInterval: 2,
      currentCycle: 1,
      completedFocusCount: 1,
      phaseStartedAt: 1700000000000,
      phaseTargetDurationMinutes: 25,
      phaseTotalPauseMs: 0,
      totalCompletedFocusMinutes: 25,
      accumulatedCoins: 25,
      accumulatedXp: 75,
    },
  };
  const pswText = renderTimer(pomoSwInterrupted, 'en');
  assert.ok(pswText.includes('1 (25m)'));
  assert.ok(pswText.includes('+25') && pswText.includes('+75'));
  assert.ok(pswText.includes('safely retained in your wallet'));
});

// ============================================================================
// 3. RUNNING POMODORO COUNTDOWN LIVE REWARD LABEL & EN/VI KEY PARITY
// ============================================================================

test('UX-2 Running Live Reward: POMODORO_COUNTDOWN shows Projected Reward / Thưởng dự kiến and all-or-nothing note in EN & VI', () => {
  const runningPomoCd = makePomoCountdownSession({
    status: 'RUNNING',
    completedAt: null,
    rewardProcessed: false,
    pomodoroConfig: DEFAULT_POMODORO_CONFIG,
    pomodoroState: {
      currentPhase: 'FOCUS',
      currentInterval: 1,
      currentCycle: 1,
      completedFocusCount: 0,
      phaseStartedAt: 1700000000000,
      phaseTargetDurationMinutes: 25,
      phaseTotalPauseMs: 0,
      totalCompletedFocusMinutes: 0,
      accumulatedCoins: 1125,
      accumulatedXp: 3750,
    },
  });

  const enHtml = renderTimerRaw(runningPomoCd, 'en');
  assert.ok(enHtml.includes('Projected Reward:'));
  assert.ok(enHtml.includes('data-testid="pomo-countdown-all-or-nothing-note"'));
  assert.ok(enHtml.includes('earned only upon completing all phases &amp; cycles'));
  assert.ok(!enHtml.includes('Total Reward:'));

  const viHtml = renderTimerRaw(runningPomoCd, 'vi');
  assert.ok(viHtml.includes('Thưởng dự kiến:'));
  assert.ok(viHtml.includes('data-testid="pomo-countdown-all-or-nothing-note"'));
  assert.ok(viHtml.includes('nhận khi hoàn thành tất cả pha và chu kỳ'));
  assert.ok(!viHtml.includes('Tổng thưởng:'));

  // Key parity check
  assert.deepStrictEqual(Object.keys(VI_MESSAGES).sort(), Object.keys(EN_MESSAGES).sort());
});
