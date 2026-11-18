import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { TimerView } from '../../src/ui/components/TimerView.tsx';
import { DurationPresetChips } from '../../src/ui/components/DurationPresetChips.tsx';
import { FocusProfile } from '../../src/types/profiles.ts';
import { SessionSnapshot } from '../../src/types/session.ts';
import { I18nProvider } from '../../src/i18n/I18nContext.tsx';

type TimerViewProps = React.ComponentProps<typeof TimerView>;

function makeProfile(overrides: Partial<FocusProfile> = {}): FocusProfile {
  return {
    id: 'profile-study',
    name: 'Study & Research',
    allowedDomains: ['github.com', 'wikipedia.org'],
    isDefault: true,
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
    ...overrides,
  };
}

function makeTimerProps(overrides: Partial<TimerViewProps> = {}): TimerViewProps {
  return {
    session: null,
    activeProfile: makeProfile(),
    onStartSession: async () => {},
    onPauseSession: async () => {},
    onResumeSession: async () => {},
    onGiveUpSession: async () => {},
    onFinishStopwatch: async () => {},
    onResetSession: async () => {},
    onRefreshSession: async () => {},
    isLoading: false,
    onOpenProfiles: () => {},
    chimeEnabled: true,
    onToggleChime: async () => {},
    ...overrides,
  };
}

function makeSession(overrides: Partial<SessionSnapshot> = {}): SessionSnapshot {
  return {
    id: 'sess-5b-1',
    mode: 'COUNTDOWN',
    status: 'RUNNING',
    targetMinutes: 25,
    startedAt: 1700000000000,
    currentPauseStartedAt: null,
    totalPauseMs: 0,
    pauseCount: 0,
    pauseHistory: [],
    lastHeartbeatAt: 1700000000000,
    completedAt: null,
    rewardProcessed: false,
    lockedMultiplier: 1.2,
    profileId: 'profile-study',
    ...overrides,
  };
}

test('Start Focus View (5b): renders 3 mode tabs, quick preset chips 15m/25m/45m/60m, and HH:MM stepper', () => {
  const html = renderToString(React.createElement(TimerView, makeTimerProps()));

  const countdownIdx = html.indexOf('Countdown');
  const stopwatchIdx = html.indexOf('Stopwatch');
  const pomodoroIdx = html.indexOf('Pomodoro');
  assert.ok(countdownIdx > -1 && stopwatchIdx > countdownIdx && pomodoroIdx > stopwatchIdx,
    'Mode tabs must appear in order Countdown | Stopwatch | Pomodoro');

  assert.ok(html.includes('data-testid="duration-preset-chips"'));
  assert.ok(html.includes('data-testid="duration-preset-15"'));
  assert.ok(html.includes('data-testid="duration-preset-25"'));
  assert.ok(html.includes('data-testid="duration-preset-45"'));
  assert.ok(html.includes('data-testid="duration-preset-60"'));
  assert.ok(html.includes('15m'));
  assert.ok(html.includes('25m'));
  assert.ok(html.includes('45m'));
  assert.ok(html.includes('60m'));
  assert.ok(html.includes('Min: 00:05 · Max: 03:00'));
});

test('Start Focus View (5b): renders Target Rewards, compact Active Profile card with Edit Profiles, and START FOCUS SESSION', () => {
  const html = renderToString(React.createElement(TimerView, makeTimerProps()));

  assert.ok(html.includes('Target Rewards'));
  assert.ok(html.includes('Active Profile'));
  assert.ok(html.includes('2 domains allowed'));
  assert.ok(html.includes('data-testid="edit-profiles-btn"'));
  assert.ok(html.includes('Edit Profiles'));
  assert.ok(!html.includes('>Change<'), 'Legacy Change link text must be replaced by Edit Profiles');
  assert.ok(html.includes('START FOCUS SESSION'));
  assert.ok(html.includes('data-testid="chime-toggle-btn"'));

  const strictHtml = renderToString(
    React.createElement(
      TimerView,
      makeTimerProps({ activeProfile: makeProfile({ allowedDomains: [] }) })
    )
  );
  assert.ok(strictHtml.includes('0 domains allowed (Strict block)'));
});

test('Start Focus View (5b): removes Quest session terminology in idle, active, and terminal views', () => {
  const idleHtml = renderToString(React.createElement(TimerView, makeTimerProps()));
  const activeHtml = renderToString(
    React.createElement(TimerView, makeTimerProps({ session: makeSession({ status: 'RUNNING' }) }))
  );
  const completedHtml = renderToString(
    React.createElement(
      TimerView,
      makeTimerProps({
        session: makeSession({
          status: 'COMPLETED',
          completedAt: 1700001500000,
          rewardProcessed: true,
        }),
      })
    )
  );
  const abandonedHtml = renderToString(
    React.createElement(
      TimerView,
      makeTimerProps({
        session: makeSession({
          status: 'ABANDONED',
          completedAt: 1700000600000,
        }),
      })
    )
  );

  for (const [label, html] of [
    ['idle', idleHtml],
    ['active', activeHtml],
    ['completed', completedHtml],
    ['abandoned', abandonedHtml],
  ] as const) {
    assert.ok(!html.includes('Quest'), `${label} view must not use Quest for session wording`);
  }

  assert.ok(activeHtml.includes('Give Up Session'));
  assert.ok(completedHtml.includes('Focus Session Completed!'));
  assert.ok(completedHtml.includes('data-testid="outcome-exit-btn"'));
  assert.ok(completedHtml.includes('>Exit<'));
  assert.ok(!completedHtml.includes('Start New Session'));
  assert.ok(abandonedHtml.includes('Session Ended'));
});

test('Start Focus View (5b): locks Edit Profiles with explanation during RUNNING and PAUSED sessions without unlock button', () => {
  for (const status of ['RUNNING', 'PAUSED'] as const) {
    const html = renderToString(
      React.createElement(
        TimerView,
        makeTimerProps({ session: makeSession({ status }) })
      )
    );

    assert.match(html, /data-testid="edit-profiles-btn"[^>]*disabled/);
    assert.ok(html.includes('data-testid="active-profile-lock-hint"'));
    assert.ok(html.includes('Locked during an active focus session.'));
    assert.ok(!html.includes('Unlock'));
  }
});

test('Start Focus View (5b): preserves exact English live reward headings and translates to Vietnamese cleanly', () => {
  const swHtml = renderToString(
    React.createElement(
      TimerView,
      makeTimerProps({ session: makeSession({ mode: 'STOPWATCH' }) })
    )
  );
  assert.ok(swHtml.includes('Accumulated Reward:'));

  const pomoHtml = renderToString(
    React.createElement(
      TimerView,
      makeTimerProps({
        session: makeSession({
          mode: 'POMODORO_COUNTDOWN',
          pomodoroConfig: {
            focusDurationMinutes: 25,
            shortBreakDurationMinutes: 5,
            longBreakDurationMinutes: 15,
            targetFocusSessions: 4,
            focusIntervalsPerCycle: 4,
            numberOfCycles: 1,
          },
          pomodoroState: {
            currentPhase: 'FOCUS',
            currentInterval: 1,
            currentCycle: 1,
            completedFocusCount: 0,
            phaseStartedAt: 1700000000000,
            phaseTargetDurationMinutes: 25,
            phaseTotalPauseMs: 0,
            totalCompletedFocusMinutes: 0,
            accumulatedCoins: 0,
            accumulatedXp: 0,
          },
        }),
      })
    )
  );
  assert.ok(pomoHtml.includes('Projected Reward:'));
  assert.ok(pomoHtml.includes('data-testid="pomo-countdown-all-or-nothing-note"'));

  const viHtml = renderToString(
    React.createElement(
      I18nProvider,
      { locale: 'vi', children: React.createElement(TimerView, makeTimerProps()) }
    )
  );
  assert.ok(viHtml.includes('Đếm ngược'));
  assert.ok(viHtml.includes('Bấm giờ'));
  assert.ok(viHtml.includes('Chọn nhanh'));
  assert.ok(viHtml.includes('Chỉnh sửa Hồ sơ'));
  assert.ok(viHtml.includes('BẮT ĐẦU PHIÊN TẬP TRUNG'));
});

test('DurationPresetChips (5b): highlights selected chip via aria-pressed', () => {
  const html = renderToString(
    React.createElement(DurationPresetChips, {
      selectedMinutes: 45,
      onSelectMinutes: () => {},
    })
  );

  assert.match(html, /data-testid="duration-preset-45"[^>]*aria-pressed="true"/);
  assert.match(html, /data-testid="duration-preset-25"[^>]*aria-pressed="false"/);
});
