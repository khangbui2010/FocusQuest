import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { TimerView } from '../../src/ui/components/TimerView.tsx';
import {
  FocusSceneArea,
  FOCUS_SCENES,
  getFocusSceneConfig,
  resolveFocusSceneEra,
  resolveFocusSceneState,
} from '../../src/ui/components/FocusSceneArea.tsx';
import { getSessionModeLabel } from '../../src/ui/utils/sessionModeLabel.ts';
import { FocusProfile } from '../../src/types/profiles.ts';
import { SessionSnapshot } from '../../src/types/session.ts';
import { I18nProvider } from '../../src/i18n/I18nContext.tsx';
import { translate } from '../../src/i18n/translator.ts';
import { TranslationKey, TranslationParams } from '../../src/i18n/types.ts';
import { isSupportedLocale } from '../../src/i18n/locale.ts';
import { EN_MESSAGES } from '../../src/i18n/locales/en.ts';
import { VI_MESSAGES } from '../../src/i18n/locales/vi.ts';

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

function makeSession(overrides: Partial<SessionSnapshot> = {}): SessionSnapshot {
  return {
    id: 'sess-5b2-1',
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

function makePomodoroSession(overrides: Partial<SessionSnapshot> = {}): SessionSnapshot {
  return makeSession({
    mode: 'POMODORO_COUNTDOWN',
    pomodoroConfig: {
      focusDurationMinutes: 25,
      focusIntervalDurationMinutes: 25,
      shortBreakDurationMinutes: 5,
      longBreakDurationMinutes: 15,
      targetFocusSessions: 4,
      focusIntervalsPerCycle: 4,
      numberOfCycles: 3,
    },
    pomodoroState: {
      currentPhase: 'FOCUS',
      currentInterval: 2,
      currentCycle: 1,
      completedFocusCount: 1,
      phaseStartedAt: 1700000000000,
      phaseTargetDurationMinutes: 25,
      phaseTotalPauseMs: 0,
      totalCompletedFocusMinutes: 25,
      accumulatedCoins: 37.5,
      accumulatedXp: 125,
    },
    ...overrides,
  });
}

function makeTimerProps(overrides: Partial<TimerViewProps> = {}): TimerViewProps {
  return {
    session: makeSession(),
    activeProfile: makeProfile(),
    era: 'STONE_AGE',
    activeBonusRate: 0,
    isBonusLoading: false,
    onStartSession: async () => {},
    onPauseSession: async () => {},
    onResumeSession: async () => {},
    onGiveUpSession: async () => {},
    onFinishStopwatch: async () => {},
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

// ============================================================================
// 1. PURE MODE LABEL FORMATTER TESTS (EN & VI)
// ============================================================================

test('Focus Running (5b-2): getSessionModeLabel formats Countdown and Stopwatch cleanly in EN & VI', () => {
  const tEn = (key: TranslationKey, params?: TranslationParams) => translate('en', key, params);
  const tVi = (key: TranslationKey, params?: TranslationParams) => translate('vi', key, params);

  const cd = makeSession({ mode: 'COUNTDOWN' });
  const sw = makeSession({ mode: 'STOPWATCH', targetMinutes: 0 });

  assert.strictEqual(getSessionModeLabel(cd, tEn), 'Countdown');
  assert.strictEqual(getSessionModeLabel(sw, tEn), 'Stopwatch');

  assert.strictEqual(getSessionModeLabel(cd, tVi), 'Đếm ngược');
  assert.strictEqual(getSessionModeLabel(sw, tVi), 'Bấm giờ');
});

test('Focus Running (5b-2): getSessionModeLabel formats Pomodoro Countdown & Stopwatch Focus/Short Break/Long Break with bullet separator', () => {
  const tEn = (key: TranslationKey, params?: TranslationParams) => translate('en', key, params);
  const tVi = (key: TranslationKey, params?: TranslationParams) => translate('vi', key, params);

  const pomoCdFocus = makePomodoroSession({ mode: 'POMODORO_COUNTDOWN' });
  assert.strictEqual(getSessionModeLabel(pomoCdFocus, tEn), 'Pomodoro • 2/4 • Cycle 1/3');
  assert.strictEqual(getSessionModeLabel(pomoCdFocus, tVi), 'Pomodoro • 2/4 • Chu kỳ 1/3');

  const pomoSwFocus = makePomodoroSession({ mode: 'POMODORO_STOPWATCH' });
  assert.strictEqual(getSessionModeLabel(pomoSwFocus, tEn), 'Pomodoro • 2/4 • Cycle 1');
  assert.strictEqual(getSessionModeLabel(pomoSwFocus, tVi), 'Pomodoro • 2/4 • Chu kỳ 1');

  const pomoCdShort = makePomodoroSession({
    mode: 'POMODORO_COUNTDOWN',
    pomodoroState: {
      ...makePomodoroSession().pomodoroState!,
      currentPhase: 'SHORT_BREAK',
      currentCycle: 2,
    },
  });
  assert.strictEqual(getSessionModeLabel(pomoCdShort, tEn), 'Pomodoro • Short Break • Cycle 2/3');
  assert.strictEqual(getSessionModeLabel(pomoCdShort, tVi), 'Pomodoro • Nghỉ ngắn • Chu kỳ 2/3');

  const pomoCdLong = makePomodoroSession({
    mode: 'POMODORO_COUNTDOWN',
    pomodoroState: {
      ...makePomodoroSession().pomodoroState!,
      currentPhase: 'LONG_BREAK',
      currentCycle: 1,
    },
  });
  assert.strictEqual(getSessionModeLabel(pomoCdLong, tEn), 'Pomodoro • Long Break • Cycle 1/3');
  assert.strictEqual(getSessionModeLabel(pomoCdLong, tVi), 'Pomodoro • Nghỉ dài • Chu kỳ 1/3');

  const pomoSwShort = makePomodoroSession({
    mode: 'POMODORO_STOPWATCH',
    pomodoroState: {
      ...makePomodoroSession().pomodoroState!,
      currentPhase: 'SHORT_BREAK',
      currentCycle: 2,
    },
  });
  assert.strictEqual(getSessionModeLabel(pomoSwShort, tEn), 'Pomodoro • Short Break • Cycle 2');

  const pomoSwLong = makePomodoroSession({
    mode: 'POMODORO_STOPWATCH',
    pomodoroState: {
      ...makePomodoroSession().pomodoroState!,
      currentPhase: 'LONG_BREAK',
      currentCycle: 3,
    },
  });
  assert.strictEqual(getSessionModeLabel(pomoSwLong, tVi), 'Pomodoro • Nghỉ dài • Chu kỳ 3');
});

test('Focus Running (5b-2): getSessionModeLabel falls back safely to DEFAULT_POMODORO_CONFIG defaults when config fields are omitted', () => {
  const tEn = (key: TranslationKey, params?: TranslationParams) => translate('en', key, params);
  const minimalPomo = makeSession({
    mode: 'POMODORO_COUNTDOWN',
    pomodoroConfig: undefined,
    pomodoroState: undefined,
  });
  assert.strictEqual(getSessionModeLabel(minimalPomo, tEn), 'Pomodoro • 1/4 • Cycle 1/3');
});

// ============================================================================
// 2. FOCUSSCENEAREA & STATE / ERA MAPPING TESTS
// ============================================================================

test('FocusSceneArea (5b-2): resolveFocusSceneState maps RUNNING focus -> working, PAUSED -> paused, and break -> resting', () => {
  assert.strictEqual(resolveFocusSceneState(makeSession({ status: 'RUNNING' })), 'working');
  assert.strictEqual(resolveFocusSceneState(makeSession({ status: 'PAUSED' })), 'paused');

  const breakSession = makePomodoroSession({
    status: 'RUNNING',
    pomodoroState: {
      ...makePomodoroSession().pomodoroState!,
      currentPhase: 'SHORT_BREAK',
    },
  });
  assert.strictEqual(resolveFocusSceneState(breakSession), 'resting');

  const pausedBreakSession = makePomodoroSession({
    status: 'PAUSED',
    currentPauseStartedAt: 1700000030000,
    pomodoroState: {
      ...makePomodoroSession().pomodoroState!,
      currentPhase: 'LONG_BREAK',
    },
  });
  assert.strictEqual(resolveFocusSceneState(pausedBreakSession), 'paused');
});

test('FocusSceneArea (5b-2): era registry resolves STONE_AGE and falls back safely for future eras', () => {
  assert.ok(FOCUS_SCENES.STONE_AGE);
  assert.strictEqual(resolveFocusSceneEra('STONE_AGE'), 'STONE_AGE');
  assert.strictEqual(resolveFocusSceneEra('FUTURE_BRONZE_AGE'), 'STONE_AGE');
  assert.strictEqual(resolveFocusSceneEra(undefined), 'STONE_AGE');
  assert.strictEqual(getFocusSceneConfig('UNKNOWN_ERA').era, 'STONE_AGE');
});

test('FocusSceneArea (5b-2 -> V4): renders animated Stone Age SVG + dynamic sprites with left status chip and right chime toggle', () => {
  const html = renderToString(
    React.createElement(FocusSceneArea, {
      era: 'STONE_AGE',
      sceneState: 'working',
      statusLabel: 'FOCUSING',
      chimeEnabled: true,
      onToggleChime: () => {},
      chimeAriaLabel: 'Disable phase chime',
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
  assert.ok(html.includes('data-scene-state="working"'));
  assert.ok(html.includes('data-era="STONE_AGE"'));
  assert.ok(html.includes('min-h-[160px]'));
  assert.ok(html.includes('data-testid="focus-scene-status-chip"'));
  assert.ok(html.includes('FOCUSING'));
  assert.ok(html.includes('data-testid="chime-toggle-btn"'));
  assert.ok(html.includes('<svg'));
  assert.ok(html.includes('/assets/sprites/villagers/crafter.png'), 'V4 renders recruited VillagerSprite sheet');
  assert.ok(html.includes('/assets/sprites/era/tool_skins_16.png'), '5G uses Era tool_skins_16.png sprite when working');
  assert.ok(html.includes('data-tool-kind="hammer"'), 'Crafter uses hammer tool skin when working');
  assert.ok(html.includes('fq-villager-anim-'), 'V4 applies deterministic CSS sprite animation');
});

// ============================================================================
// 3. RUNNING SCREEN LAYOUT (3-ROW COMPACT CARD & 3-COLUMN CONTROLS)
// ============================================================================

test('Focus Running (5b-2): Countdown renders FocusSceneArea + 3-row card with [Pause | clock | Give Up] in exact column order', () => {
  const html = renderToString(
    React.createElement(TimerView, makeTimerProps({ session: makeSession({ mode: 'COUNTDOWN', lockedMultiplier: 1.2 }) }))
  );

  assert.ok(html.includes('data-testid="focus-scene-area"'));
  assert.ok(html.includes('data-scene-state="working"'));
  assert.ok(html.includes('data-testid="running-control-card"'));
  assert.ok(html.includes('data-testid="running-mode-label"'));
  assert.ok(html.includes('>Countdown<'));
  assert.ok(html.includes('data-testid="running-controls-row"'));

  const pauseIdx = html.indexOf('data-testid="running-pause-btn"');
  const clockIdx = html.indexOf('data-testid="running-timer-display"');
  const giveUpIdx = html.indexOf('data-testid="running-giveup-btn"');

  assert.ok(pauseIdx > -1 && clockIdx > pauseIdx && giveUpIdx > clockIdx,
    '3-column control row must order Pause | Clock | Give Up');
  assert.ok(html.includes('Pause (2 left)'));
  assert.ok(html.includes('>Give Up<'));
  assert.ok(html.includes('aria-label="Give Up Session"'));
  assert.ok(html.includes('Reward:'));
  assert.ok(html.includes('data-testid="live-multiplier-chip"'));
  assert.ok(html.includes('×1.2'));
  assert.ok(!html.includes('data-testid="skip-break-btn"'));
});

test('Focus Running (5b-2): Stopwatch renders [Pause | clock | End Session] with Accumulated Reward & min 5m note when under threshold', () => {
  const html = renderToString(
    React.createElement(
      TimerView,
      makeTimerProps({
        session: makeSession({
          mode: 'STOPWATCH',
          targetMinutes: 0,
          lockedMultiplier: 1.0,
          startedAt: Date.now() - 60_000,
        }),
      })
    )
  );

  assert.ok(html.includes('>Stopwatch<'));
  const pauseIdx = html.indexOf('data-testid="running-pause-btn"');
  const clockIdx = html.indexOf('data-testid="running-timer-display"');
  const endIdx = html.indexOf('data-testid="running-end-btn"');

  assert.ok(pauseIdx > -1 && clockIdx > pauseIdx && endIdx > clockIdx,
    '3-column control row must order Pause | Clock | End Session for Stopwatch');
  assert.ok(html.includes('>End Session<'));
  assert.ok(html.includes('aria-label="Finish Session &amp; Claim Reward"'));
  assert.ok(html.includes('Accumulated Reward:'));
  assert.ok(html.includes('data-testid="stopwatch-min-note"'));
  assert.ok(html.includes('min 5m'));
  assert.ok(html.includes('×1.0'));
});

test('Focus Running (5b-2): Pomodoro Countdown and Pomodoro Stopwatch render appropriate right action and mode label', () => {
  const pomoCdHtml = renderToString(
    React.createElement(TimerView, makeTimerProps({ session: makePomodoroSession({ mode: 'POMODORO_COUNTDOWN' }) }))
  );
  assert.ok(pomoCdHtml.includes('Pomodoro • 2/4 • Cycle 1/3'));
  assert.ok(pomoCdHtml.includes('data-testid="running-giveup-btn"'));
  assert.ok(pomoCdHtml.includes('Projected Reward:'));
  assert.ok(pomoCdHtml.includes('data-testid="pomo-countdown-all-or-nothing-note"'));
  assert.ok(!pomoCdHtml.includes('data-testid="skip-break-btn"'));

  const pomoSwHtml = renderToString(
    React.createElement(TimerView, makeTimerProps({ session: makePomodoroSession({ mode: 'POMODORO_STOPWATCH' }) }))
  );
  assert.ok(pomoSwHtml.includes('Pomodoro • 2/4 • Cycle 1'));
  assert.ok(pomoSwHtml.includes('data-testid="running-end-btn"'));
  assert.ok(pomoSwHtml.includes('Accumulated Reward:'));
});

test('Focus Running (5b-2): PAUSED state renders Resume in left column, pause banner, and disables Pause after 2 pauses', () => {
  const pausedHtml = renderToString(
    React.createElement(
      TimerView,
      makeTimerProps({
        session: makeSession({
          status: 'PAUSED',
          currentPauseStartedAt: Date.now() - 10_000,
          pauseCount: 1,
        }),
      })
    )
  );
  assert.ok(pausedHtml.includes('data-scene-state="paused"'));
  assert.ok(pausedHtml.includes('PAUSED'));
  assert.ok(pausedHtml.includes('data-testid="pause-auto-resume-banner"'));
  assert.ok(pausedHtml.includes('data-testid="running-resume-btn"'));
  assert.ok(pausedHtml.includes('>Resume<'));
  assert.ok(pausedHtml.includes('aria-label="Resume Focus"'));

  const maxPauseHtml = renderToString(
    React.createElement(
      TimerView,
      makeTimerProps({
        session: makeSession({
          status: 'RUNNING',
          pauseCount: 2,
        }),
      })
    )
  );
  assert.match(maxPauseHtml, /data-testid="running-pause-btn"[^>]*disabled/);
  assert.ok(maxPauseHtml.includes('Pause (0 left)'));
  assert.ok(maxPauseHtml.includes('Maximum 2 pauses reached for this session'));
});

test('Focus Running (5b-2): Pomodoro Break renders BREAK status chip, resting scene, and Skip Break button below card', () => {
  const breakHtml = renderToString(
    React.createElement(
      TimerView,
      makeTimerProps({
        session: makePomodoroSession({
          mode: 'POMODORO_STOPWATCH',
          pomodoroState: {
            ...makePomodoroSession().pomodoroState!,
            currentPhase: 'SHORT_BREAK',
            currentCycle: 1,
            phaseTargetDurationMinutes: 5,
          },
        }),
      })
    )
  );

  assert.ok(breakHtml.includes('data-scene-state="resting"'));
  assert.ok(breakHtml.includes('BREAK'));
  assert.ok(breakHtml.includes('Pomodoro • Short Break • Cycle 1'));
  assert.ok(breakHtml.includes('data-testid="skip-break-btn"'));
  assert.ok(breakHtml.includes('Skip Break &amp; Start Next Focus'));

  const cardEndIdx = breakHtml.indexOf('data-testid="live-reward-display"');
  const skipIdx = breakHtml.indexOf('data-testid="skip-break-btn"');
  assert.ok(skipIdx > cardEndIdx, 'Skip Break button must appear below the 3-row card');
});

test('Focus Running (5b-2): removes Target/pauses-available clutter and keeps idle Start Focus view untouched', () => {
  const runningHtml = renderToString(
    React.createElement(TimerView, makeTimerProps({ session: makeSession() }))
  );
  assert.ok(!runningHtml.includes('Target:'), 'Target progress subtitle must be removed');
  assert.ok(!runningHtml.includes('pauses available'), 'Footer pauses available text must be removed');
  assert.ok(!runningHtml.includes('github.com') && !runningHtml.includes('Study &amp; Research'),
    'Running screen must not show allowlist/profile card');

  const idleHtml = renderToString(
    React.createElement(TimerView, makeTimerProps({ session: null }))
  );
  assert.ok(!idleHtml.includes('data-testid="focus-scene-area"'), 'Idle view must remain Setup UI');
  assert.ok(idleHtml.includes('START FOCUS SESSION'));
  assert.ok(idleHtml.includes('data-testid="duration-preset-chips"'));
});

test('Focus Running (5b-2): Vietnamese locale renders compact short controls and mode labels without Quest leakage', () => {
  const viRunningHtml = renderToString(
    React.createElement(
      I18nProvider,
      {
        locale: 'vi',
        children: React.createElement(
          TimerView,
          makeTimerProps({
            session: makePomodoroSession({
              mode: 'POMODORO_STOPWATCH',
              pomodoroState: {
                ...makePomodoroSession().pomodoroState!,
                currentPhase: 'SHORT_BREAK',
                currentCycle: 2,
              },
            }),
          })
        ),
      }
    )
  );

  assert.ok(viRunningHtml.includes('NGHỈ NGƠI'));
  assert.ok(viRunningHtml.includes('Pomodoro • Nghỉ ngắn • Chu kỳ 2'));
  assert.ok(viRunningHtml.includes('Tạm dừng (2)'));
  assert.ok(viRunningHtml.includes('>Kết thúc<'));
  assert.ok(viRunningHtml.includes('Thưởng tích lũy:'));
  assert.ok(!viRunningHtml.includes('Quest'));
});

test('Focus Running (5b-2): EN/VI dictionaries stay in exact key parity and locale validator stays dictionary-free', () => {
  const enKeys = Object.keys(EN_MESSAGES).sort();
  const viKeys = Object.keys(VI_MESSAGES).sort();
  assert.deepStrictEqual(viKeys, enKeys, 'EN and VI dictionaries must have identical keys');

  assert.strictEqual(isSupportedLocale('en'), true);
  assert.strictEqual(isSupportedLocale('vi'), true);
  assert.strictEqual(isSupportedLocale('fr'), false);
});
