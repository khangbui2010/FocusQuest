import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { TimerView } from '../../src/ui/components/TimerView.tsx';
import { FocusSceneArea, FOCUS_SCENES } from '../../src/ui/components/FocusSceneArea.tsx';
import { sendExtensionMessage } from '../../src/ui/services/extensionClient.ts';
import { skipPomodoroBreakAction } from '../../src/ui/services/sessionActions.ts';
import { FocusProfile } from '../../src/types/profiles.ts';
import { DEFAULT_POMODORO_CONFIG, PomodoroConfig, SessionSnapshot } from '../../src/types/session.ts';
import { FullSessionStateResponse } from '../../src/types/messages.ts';

type TimerViewProps = React.ComponentProps<typeof TimerView>;

function makeProfile(): FocusProfile {
  return {
    id: 'profile-study-research',
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
    onResetSession: async () => {},
    onRefreshSession: async () => {},
    isLoading: false,
    onOpenProfiles: () => {},
    chimeEnabled: true,
    onToggleChime: async () => {},
    ...overrides,
  };
}

// ============================================================================
// BUG 1: SKIP POMODORO BREAK ACTION & SIMULATOR PARITY
// ============================================================================

test('5b-3 Bug 1: skipPomodoroBreakAction sends SKIP_POMODORO_BREAK and refreshes state on success', async () => {
  const sentActions: string[] = [];
  let refreshCount = 0;

  await skipPomodoroBreakAction(
    async () => {
      refreshCount += 1;
    },
    async (msg) => {
      sentActions.push(msg.action);
      return { success: true };
    }
  );

  assert.deepStrictEqual(sentActions, ['SKIP_POMODORO_BREAK']);
  assert.strictEqual(refreshCount, 1);
});

test('5b-3 Bug 1: skipPomodoroBreakAction refreshes state and throws backend error when !res.success', async () => {
  let refreshCount = 0;

  await assert.rejects(
    async () => {
      await skipPomodoroBreakAction(
        async () => {
          refreshCount += 1;
        },
        async () => ({
          success: false,
          error: 'Cannot skip break while in Focus phase.',
        })
      );
    },
    /Cannot skip break while in Focus phase\./
  );

  assert.strictEqual(refreshCount, 1, 'State must still refresh to recover if break alarm raced ahead');
});

test('5b-3 Bug 1: simulator rejects SKIP_POMODORO_BREAK during FOCUS and advances SHORT_BREAK -> next FOCUS interval', async () => {
  try {
    const startRes = await sendExtensionMessage<SessionSnapshot>({
      action: 'START_SESSION',
      payload: {
        mode: 'POMODORO_COUNTDOWN',
        targetMinutes: 25,
        profileId: 'profile-study-research',
        pomodoroConfig: DEFAULT_POMODORO_CONFIG,
      },
    });
    assert.strictEqual(startRes.success, true);
    assert.strictEqual(startRes.data?.pomodoroState?.currentPhase, 'FOCUS');

    // Cannot skip break while in FOCUS
    const invalidSkip = await sendExtensionMessage<SessionSnapshot>({
      action: 'SKIP_POMODORO_BREAK',
    });
    assert.strictEqual(invalidSkip.success, false);
    assert.match(invalidSkip.error || '', /Cannot skip break while in Focus phase/);

    // Advance FOCUS -> SHORT_BREAK
    const breakRes = await sendExtensionMessage<SessionSnapshot>({
      action: 'ADVANCE_POMODORO_STAGE',
    });
    assert.strictEqual(breakRes.success, true);
    assert.strictEqual(breakRes.data?.pomodoroState?.currentPhase, 'SHORT_BREAK');
    assert.strictEqual(breakRes.data?.pomodoroState?.currentInterval, 1);

    // Skip break -> immediately enters interval 2 FOCUS and restores blocking
    const skipRes = await sendExtensionMessage<SessionSnapshot>({
      action: 'SKIP_POMODORO_BREAK',
    });
    assert.strictEqual(skipRes.success, true);
    assert.strictEqual(skipRes.data?.pomodoroState?.currentPhase, 'FOCUS');
    assert.strictEqual(skipRes.data?.pomodoroState?.currentInterval, 2);

    const stateRes = await sendExtensionMessage<FullSessionStateResponse>({
      action: 'GET_SESSION_STATE',
    });
    assert.strictEqual(stateRes.data?.isBlockingActive, true);
  } finally {
    await sendExtensionMessage({ action: 'RESET_SESSION' });
  }
});

// ============================================================================
// BUG 2: POMODORO COUNTDOWN TOTAL REWARD (DEFAULT & CUSTOM + FALLBACK)
// ============================================================================

test('5b-3 Bug 2: simulator initializes default Pomodoro Countdown (25m x 4 x 3 = 300m) with 1,125 Coin, 3,750 XP and ×2.5', async () => {
  try {
    const startRes = await sendExtensionMessage<SessionSnapshot>({
      action: 'START_SESSION',
      payload: {
        mode: 'POMODORO_COUNTDOWN',
        targetMinutes: 25,
        profileId: 'profile-study-research',
        pomodoroConfig: DEFAULT_POMODORO_CONFIG,
      },
    });
    assert.strictEqual(startRes.success, true);
    const session = startRes.data!;

    assert.strictEqual(session.lockedMultiplier, 2.5);
    assert.strictEqual(session.pomodoroState?.accumulatedCoins, 1125); // 300 * 1.5 * 2.5
    assert.strictEqual(session.pomodoroState?.accumulatedXp, 3750);   // 300 * 5.0 * 2.5

    // Even after advancing Focus 1 -> SHORT_BREAK, planned Total Reward remains 1,125 / 3,750
    const breakRes = await sendExtensionMessage<SessionSnapshot>({
      action: 'ADVANCE_POMODORO_STAGE',
    });
    assert.strictEqual(breakRes.data?.pomodoroState?.accumulatedCoins, 1125);
    assert.strictEqual(breakRes.data?.pomodoroState?.accumulatedXp, 3750);

    const text = renderToString(React.createElement(TimerView, makeTimerProps({ session }))).replace(
      /<[^>]+>/g,
      ''
    );
    assert.ok(text.includes('Projected Reward:'));
    assert.ok(text.includes('earned only upon completing all phases &amp; cycles') || text.includes('earned only upon completing all phases & cycles'));
    assert.ok(text.includes('1125 Coin'), `Expected 1125 Coin in text: ${text}`);
    assert.ok(text.includes('3750 XP'));
    assert.ok(text.includes('×2.5'));
  } finally {
    await sendExtensionMessage({ action: 'RESET_SESSION' });
  }
});

test('5b-3 Bug 2: custom Pomodoro Countdown config (15m x 2 x 2 = 60m) computes and renders 126 Coin, 420 XP, ×1.4', async () => {
  const customConfig: PomodoroConfig = {
    focusDurationMinutes: 15,
    focusIntervalDurationMinutes: 15,
    shortBreakDurationMinutes: 5,
    longBreakDurationMinutes: 15,
    targetFocusSessions: 2,
    focusIntervalsPerCycle: 2,
    numberOfCycles: 2,
  };

  try {
    const startRes = await sendExtensionMessage<SessionSnapshot>({
      action: 'START_SESSION',
      payload: {
        mode: 'POMODORO_COUNTDOWN',
        targetMinutes: 15,
        profileId: 'profile-study-research',
        pomodoroConfig: customConfig,
      },
    });
    assert.strictEqual(startRes.success, true);
    const session = startRes.data!;

    // 15 * 2 * 2 = 60m -> x1.4 tier -> 60 * 1.5 * 1.4 = 126 Coins, 60 * 5.0 * 1.4 = 420 XP
    assert.strictEqual(session.lockedMultiplier, 1.4);
    assert.ok(Math.abs((session.pomodoroState?.accumulatedCoins ?? 0) - 126) < 1e-9);
    assert.ok(Math.abs((session.pomodoroState?.accumulatedXp ?? 0) - 420) < 1e-9);

    const text = renderToString(React.createElement(TimerView, makeTimerProps({ session }))).replace(
      /<[^>]+>/g,
      ''
    );
    assert.ok(text.includes('Projected Reward:'));
    assert.ok(text.includes('126 Coin'), `Expected 126 Coin in text: ${text}`);
    assert.ok(text.includes('420 XP'));
    assert.ok(text.includes('×1.4'));
  } finally {
    await sendExtensionMessage({ action: 'RESET_SESSION' });
  }
});

test('5b-3 Bug 2: TimerView falls back cleanly when active Pomodoro Countdown snapshot has stale 0 accumulatedCoins/Xp', () => {
  const staleZeroSession: SessionSnapshot = {
    id: 'sess-stale-zero',
    mode: 'POMODORO_COUNTDOWN',
    profileId: 'profile-study-research',
    status: 'RUNNING',
    targetMinutes: 25,
    lockedMultiplier: 2.5,
    startedAt: 1700000000000,
    currentPauseStartedAt: null,
    totalPauseMs: 0,
    pauseCount: 0,
    pauseHistory: [],
    lastHeartbeatAt: 1700000000000,
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
      accumulatedCoins: 0,
      accumulatedXp: 0,
    },
  };

  const text = renderToString(
    React.createElement(TimerView, makeTimerProps({ session: staleZeroSession }))
  ).replace(/<[^>]+>/g, '');
  assert.ok(text.includes('Projected Reward:'));
  assert.ok(text.includes('1125 Coin'), `Expected 1125 Coin in text: ${text}`);
  assert.ok(text.includes('3750 XP'));
  assert.ok(text.includes('×2.5'));
});

// ============================================================================
// BUG 3: FOCUSSCENEAREA FULL-BLEED COVERAGE & NO CONTROL REGRESSION
// ============================================================================

test('5b-3 Bug 3: FocusSceneArea renders full-bleed absolute inset-0 SVG reaching bottom edge y=220 across all 3 states', () => {
  assert.ok(FOCUS_SCENES.STONE_AGE);

  for (const [sceneState, label] of [
    ['working', 'FOCUSING'],
    ['paused', 'PAUSED'],
    ['resting', 'BREAK'],
  ] as const) {
    const html = renderToString(
      React.createElement(FocusSceneArea, {
        era: 'STONE_AGE',
        sceneState,
        statusLabel: label,
        chimeEnabled: true,
        onToggleChime: () => {},
        chimeAriaLabel: 'Disable chime',
        chimeTitle: 'Sound On',
        civilizationState: {
          era: 'STONE_AGE',
          buildings: [
            {
              id: 'b-fire',
              definitionId: 'stone_age_campfire',
              position: { x: 2, y: 2 },
              level: 1,
              placedAt: 100,
            },
          ],
          villagers: [{ id: 'v-crafter', role: 'crafter', recruitedAt: 200 }],
        },
      })
    );

    assert.ok(html.includes('data-testid="focus-scene-area"'));
    assert.ok(html.includes(`data-scene-state="${sceneState}"`));
    assert.ok(html.includes('data-era="STONE_AGE"'));
    assert.ok(html.includes('flex-1 min-h-[160px] flex flex-col'));
    assert.ok(html.includes('absolute inset-0 w-full h-full block'));
    assert.ok(html.includes('viewBox="0 0 360 220"'));
    assert.ok(html.includes('preserveAspectRatio="xMidYMax slice"'));
    assert.ok(html.includes('L360 220 L0 220 Z'), `${sceneState} terrain paths must extend to bottom y=220`);
    assert.ok(html.includes('data-testid="focus-scene-status-chip"'));
    assert.ok(html.includes('data-testid="chime-toggle-btn"'));
    assert.ok(html.includes('/assets/sprites/villagers/crafter.png'));
  }
});

test('5b-3 Regression Guard: Pomodoro break renders full-bleed FocusSceneArea, 3-column controls, and Skip Break button', () => {
  const breakSession: SessionSnapshot = {
    id: 'sess-break-guard',
    mode: 'POMODORO_STOPWATCH',
    profileId: 'profile-study-research',
    status: 'RUNNING',
    targetMinutes: 25,
    lockedMultiplier: 1.0,
    startedAt: 1700000000000,
    currentPauseStartedAt: null,
    totalPauseMs: 0,
    pauseCount: 0,
    pauseHistory: [],
    lastHeartbeatAt: 1700000000000,
    completedAt: null,
    rewardProcessed: false,
    pomodoroConfig: DEFAULT_POMODORO_CONFIG,
    pomodoroState: {
      currentPhase: 'SHORT_BREAK',
      currentInterval: 1,
      currentCycle: 1,
      completedFocusCount: 1,
      phaseStartedAt: 1700000000000,
      phaseTargetDurationMinutes: 5,
      phaseTotalPauseMs: 0,
      totalCompletedFocusMinutes: 25,
      accumulatedCoins: 25,
      accumulatedXp: 75,
    },
  };

  const html = renderToString(React.createElement(TimerView, makeTimerProps({ session: breakSession })));
  assert.ok(html.includes('data-scene-state="resting"'));
  assert.ok(html.includes('absolute inset-0 w-full h-full block'));
  assert.ok(html.includes('data-testid="running-controls-row"'));
  assert.ok(html.includes('data-testid="running-pause-btn"'));
  assert.ok(html.includes('data-testid="running-timer-display"'));
  assert.ok(html.includes('data-testid="running-end-btn"'));
  assert.ok(html.includes('data-testid="skip-break-btn"'));
  assert.ok(html.includes('Accumulated Reward:'));
});
