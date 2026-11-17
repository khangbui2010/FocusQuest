import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import App, { PopupShell } from '../../src/App.tsx';
import { TimerView } from '../../src/ui/components/TimerView.tsx';
import { ProfileBottomSheet } from '../../src/ui/components/ProfileBottomSheet.tsx';
import {
  isInFocusSession,
  resolveEffectiveTab,
  executeExitSessionAction,
} from '../../src/ui/utils/sessionNavigation.ts';
import { sendExtensionMessage } from '../../src/ui/services/extensionClient.ts';
import { MessageHandler } from '../../src/background/messageHandler.ts';
import { SessionCoordinator } from '../../src/background/sessionCoordinator.ts';
import { ProfileManager } from '../../src/core/profiles/profileManager.ts';
import { MemoryStorageAdapter } from '../../src/storage/memoryStorageAdapter.ts';
import { StorageManager } from '../../src/storage/storageManager.ts';
import { BlockingCoordinator } from '../../src/background/blockingCoordinator.ts';
import {
  MockAlarmsAdapter,
  MockBadgeAdapter,
  MockDNRAdapter,
  MockNotificationsAdapter,
  MockTabsAdapter,
} from '../mocks/chromeMock.ts';
import { FocusProfile } from '../../src/types/profiles.ts';
import { DEFAULT_POMODORO_CONFIG, SessionSnapshot } from '../../src/types/session.ts';
import { MusicPlayerState } from '../../src/types/music.ts';
import { I18nProvider } from '../../src/i18n/I18nContext.tsx';
import { EN_MESSAGES } from '../../src/i18n/locales/en.ts';
import { VI_MESSAGES } from '../../src/i18n/locales/vi.ts';
import { localizeErrorMessage } from '../../src/i18n/errorTranslator.ts';

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
    id: 'sess-ux1-1',
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
    lockedMultiplier: 1.0,
    profileId: 'profile-study',
    ...overrides,
  };
}

function makePomodoroSession(
  currentPhase: 'FOCUS' | 'SHORT_BREAK' | 'LONG_BREAK',
  status: SessionSnapshot['status'] = 'RUNNING'
): SessionSnapshot {
  return makeSession({
    id: `sess-ux1-pomo-${currentPhase}-${status}`,
    mode: 'POMODORO_COUNTDOWN',
    status,
    completedAt: status === 'COMPLETED' || status === 'ABANDONED' || status === 'INTERRUPTED' ? 1700001500000 : null,
    rewardProcessed: status === 'COMPLETED' || status === 'ABANDONED' || status === 'INTERRUPTED',
    pomodoroConfig: DEFAULT_POMODORO_CONFIG,
    pomodoroState: {
      currentPhase,
      currentInterval: 2,
      currentCycle: 1,
      completedFocusCount: 1,
      phaseStartedAt: 1700000000000,
      phaseTargetDurationMinutes: currentPhase === 'FOCUS' ? 25 : currentPhase === 'SHORT_BREAK' ? 5 : 15,
      phaseTotalPauseMs: 0,
      totalCompletedFocusMinutes: 25,
      accumulatedCoins: 37.5,
      accumulatedXp: 125,
    },
  });
}

const DEFAULT_MUSIC_STATE: MusicPlayerState = {
  status: 'IDLE',
  currentTrackId: null,
  positionSec: 0,
  durationSec: null,
  volume: 0.7,
  muted: false,
  shuffle: false,
  repeatMode: 'off',
  shuffledOrder: [],
  musicEnabled: false,
  catalogUpdatedAt: null,
  lastUpdatedAt: 0,
  lastError: null,
  lastErrorCode: null,
};

function makePopupShellProps(
  overrides: Partial<React.ComponentProps<typeof PopupShell>> = {}
): React.ComponentProps<typeof PopupShell> {
  const p1 = makeProfile();
  const p2 = makeProfile({
    id: 'profile-coding',
    name: 'Deep Coding',
    allowedDomains: ['localhost'],
    isDefault: false,
  });
  const session = overrides.session ?? null;
  const isSessionActive = Boolean(
    session &&
      session.status !== 'IDLE' &&
      session.status !== 'COMPLETED' &&
      session.status !== 'ABANDONED' &&
      session.status !== 'INTERRUPTED'
  );

  return {
    onToggleLanguage: async () => {},
    session,
    economy: { focusCoins: 120, totalXP: 450, level: 3 },
    activeProfile: p1,
    profiles: [p1, p2],
    todayStats: null,
    lifetimeFocusMinutes: 50,
    isBlockingActive: isSessionActive,
    isSessionActive,
    civEra: 'STONE_AGE',
    settings: { soundEnabled: false, notificationsEnabled: true, language: 'en' },
    isLoading: false,
    activeTab: 'map',
    setActiveTab: () => {},
    isHelpOpen: false,
    setIsHelpOpen: () => {},
    isProfileSheetOpen: false,
    setIsProfileSheetOpen: () => {},
    isMusicExpanded: false,
    onToggleMusicExpanded: async () => {},
    musicState: DEFAULT_MUSIC_STATE,
    musicCatalog: [],
    refreshState: async () => {},
    handleStartSession: async () => {},
    handlePauseSession: async () => {},
    handleResumeSession: async () => {},
    handleGiveUpSession: async () => {},
    handleFinishStopwatch: async () => {},
    handleSkipBreak: async () => {},
    handleResetSession: async () => {},
    handleSwitchProfile: async () => {},
    handleCreateProfile: async () => {},
    handleRenameProfile: async () => {},
    handleDeleteProfile: async () => {},
    handleAddDomain: async () => {},
    handleRemoveDomain: async () => {},
    handleToggleChime: async () => {},
    handlePlayMusicTrack: async () => {},
    handlePauseMusic: async () => {},
    handleResumeMusic: async () => {},
    handleStopMusic: async () => {},
    handleNextMusic: async () => {},
    handlePreviousMusic: async () => {},
    handleSeekMusic: async () => {},
    handleSetMusicVolume: async () => {},
    handleToggleMusicShuffle: async () => {},
    handleCycleMusicRepeat: async () => {},
    handleRefreshMusicCatalog: async () => {},
    ...overrides,
  };
}

function assertNoNestedButtons(htmlFragment: string, contextLabel: string): void {
  const tokenRegex = /<\/?button\b/gi;
  let depth = 0;
  let match: RegExpExecArray | null;
  while ((match = tokenRegex.exec(htmlFragment)) !== null) {
    if (match[0].toLowerCase().startsWith('</')) {
      depth -= 1;
      assert.ok(depth >= 0, `${contextLabel}: unbalanced </button>`);
    } else {
      depth += 1;
      assert.equal(depth, 1, `${contextLabel}: nested <button> detected inside another <button>`);
    }
  }
  assert.equal(depth, 0, `${contextLabel}: unclosed <button> detected`);
}

// ============================================================================
// 1. SESSION SNAPSHOT PRESENCE & TAB LOCKING
// ============================================================================

test('UX-1 Navigation: isInFocusSession & resolveEffectiveTab derive strictly from background snapshot', () => {
  assert.equal(isInFocusSession(null), false);
  assert.equal(isInFocusSession(undefined), false);
  assert.equal(isInFocusSession(makeSession({ status: 'IDLE' })), false);
  assert.equal(resolveEffectiveTab('map', null), 'map');
  assert.equal(resolveEffectiveTab('quests', makeSession({ status: 'IDLE' })), 'quests');

  const inSessionSnapshots: Array<[string, SessionSnapshot]> = [
    ['RUNNING focus', makeSession({ status: 'RUNNING' })],
    ['PAUSED', makeSession({ status: 'PAUSED', currentPauseStartedAt: 1700000010000 })],
    ['SHORT_BREAK', makePomodoroSession('SHORT_BREAK', 'RUNNING')],
    ['LONG_BREAK', makePomodoroSession('LONG_BREAK', 'RUNNING')],
    ['COMPLETED awaiting Exit', makeSession({ status: 'COMPLETED', completedAt: 1700001500000 })],
    ['ABANDONED awaiting Exit', makeSession({ status: 'ABANDONED', completedAt: 1700000500000 })],
    ['INTERRUPTED awaiting Exit', makeSession({ status: 'INTERRUPTED', completedAt: 1700000500000 })],
  ];

  for (const [label, snap] of inSessionSnapshots) {
    assert.equal(isInFocusSession(snap), true, `${label} must count as in focus session`);
    for (const requested of ['map', 'quests', 'awards', 'stats', 'focus'] as const) {
      assert.equal(
        resolveEffectiveTab(requested, snap),
        'focus',
        `${label} must force focus tab instead of '${requested}'`
      );
    }
  }
});

test('UX-1 SSR: PopupShell removes bottom-navbar from DOM and locks to Focus across RUNNING/PAUSED/SHORT_BREAK/LONG_BREAK/COMPLETED/ABANDONED/INTERRUPTED (even with modals open)', () => {
  const states: Array<{ label: string; session: SessionSnapshot; expectedTestId: string }> = [
    { label: 'RUNNING', session: makeSession({ status: 'RUNNING' }), expectedTestId: 'focus-scene-area' },
    {
      label: 'PAUSED',
      session: makeSession({ status: 'PAUSED', currentPauseStartedAt: 1700000010000 }),
      expectedTestId: 'pause-auto-resume-banner',
    },
    {
      label: 'SHORT_BREAK',
      session: makePomodoroSession('SHORT_BREAK', 'RUNNING'),
      expectedTestId: 'skip-break-btn',
    },
    {
      label: 'LONG_BREAK',
      session: makePomodoroSession('LONG_BREAK', 'RUNNING'),
      expectedTestId: 'skip-break-btn',
    },
    {
      label: 'COMPLETED',
      session: makeSession({ status: 'COMPLETED', completedAt: 1700001500000, rewardProcessed: true }),
      expectedTestId: 'outcome-exit-btn',
    },
    {
      label: 'ABANDONED',
      session: makeSession({ status: 'ABANDONED', completedAt: 1700000600000 }),
      expectedTestId: 'outcome-exit-btn',
    },
    {
      label: 'INTERRUPTED',
      session: makeSession({
        status: 'INTERRUPTED',
        completedAt: 1700000600000,
        lastKnownValidFocusMinutes: 12,
      }),
      expectedTestId: 'outcome-exit-btn',
    },
  ];

  for (const { label, session, expectedTestId } of states) {
    const html = renderToString(
      React.createElement(
        PopupShell,
        makePopupShellProps({
          session,
          activeTab: 'map',
          isHelpOpen: true,
          isProfileSheetOpen: true,
          isMusicExpanded: true,
        })
      )
    );

    assert.ok(!html.includes('data-testid="bottom-navbar"'), `${label}: bottom-navbar must not be rendered`);
    assert.ok(!html.includes('data-testid="nav-tab-map"'), `${label}: bottom tabs must not exist in DOM`);
    assert.ok(!html.includes('data-testid="header-brand-home"'), `${label}: Header brand home button must be disabled`);
    assert.ok(!html.includes('Your Civilization'), `${label}: must not render Map view`);
    assert.ok(html.includes(`data-testid="${expectedTestId}"`), `${label}: must render Focus screen element`);
    const isRunningOrPaused = session.status === 'RUNNING' || session.status === 'PAUSED';
    if (isRunningOrPaused) {
      assert.ok(
        html.includes('data-testid="music-mini-player"') &&
          html.includes('data-testid="music-sheet-backdrop"') &&
          !html.includes('pb-[64px]'),
        `${label}: expanded music backdrop should render with pb-0 during active RUNNING/PAUSED session`
      );
    } else {
      assert.ok(
        !html.includes('data-testid="music-mini-player"') &&
          !html.includes('data-testid="music-sheet-backdrop"'),
        `${label}: music mini-player and sheet must NOT render on terminal outcome screen`
      );
    }
  }
});

test('UX-1 SSR: Outside session renders bottom-navbar normally, hides music player, and supports Map/other tabs', () => {
  for (const session of [null, makeSession({ status: 'IDLE' })]) {
    const html = renderToString(
      React.createElement(
        PopupShell,
        makePopupShellProps({
          session,
          activeTab: 'map',
          isMusicExpanded: true,
        })
      )
    );

    assert.ok(html.includes('data-testid="bottom-navbar"'), 'Navbar must render outside session');
    assert.ok(html.includes('data-testid="nav-tab-map" data-active="true"'));
    assert.ok(html.includes('Your Civilization'));
    assert.ok(html.includes('data-testid="header-brand-home"'));
    assert.ok(!html.includes('data-testid="music-mini-player"'), 'Mini-player must NOT render outside focus session');
    assert.ok(!html.includes('data-testid="music-sheet-backdrop"'), 'Expanded music sheet must NOT render outside focus session');
  }
});

test('UX-1 SSR: Booting App with in-session snapshot (active or completed while closed) immediately shows Focus UI without Map flash', () => {
  const runningAppHtml = renderToString(
    React.createElement(App, {
      initialSession: makeSession({ status: 'RUNNING' }),
      initialTab: 'map',
    })
  );
  assert.ok(!runningAppHtml.includes('data-testid="bottom-navbar"'));
  assert.ok(!runningAppHtml.includes('Your Civilization'));
  assert.ok(runningAppHtml.includes('data-testid="focus-scene-area"'));

  const completedWhileClosedHtml = renderToString(
    React.createElement(App, {
      initialSession: makeSession({
        status: 'COMPLETED',
        completedAt: 1700001500000,
        rewardProcessed: true,
      }),
      initialTab: 'map',
    })
  );
  assert.ok(!completedWhileClosedHtml.includes('data-testid="bottom-navbar"'));
  assert.ok(!completedWhileClosedHtml.includes('Your Civilization'));
  assert.ok(completedWhileClosedHtml.includes('data-testid="timer-outcome-view"'));
  assert.ok(completedWhileClosedHtml.includes('data-testid="outcome-exit-btn"'));
  assert.ok(completedWhileClosedHtml.includes('>Exit<'));

  const interruptedWhileClosedViHtml = renderToString(
    React.createElement(App, {
      initialSession: makeSession({
        status: 'INTERRUPTED',
        completedAt: 1700000900000,
        lastKnownValidFocusMinutes: 14,
      }),
      initialTab: 'stats',
      initialLocale: 'vi',
    })
  );
  assert.ok(!interruptedWhileClosedViHtml.includes('data-testid="bottom-navbar"'));
  assert.ok(interruptedWhileClosedViHtml.includes('data-testid="timer-outcome-view"'));
  assert.ok(interruptedWhileClosedViHtml.includes('14m'));
  assert.ok(interruptedWhileClosedViHtml.includes('>Thoát<'));
  assert.ok(!interruptedWhileClosedViHtml.includes('Bắt đầu Phiên Mới'));
});

// ============================================================================
// 2. EXIT BUTTON (EN/VI, LEGACY REMOVAL, RESET FLOW & ERROR RECOVERY)
// ============================================================================

test('UX-1 Exit Button: all terminal outcomes render Exit (EN) / Thoát (VI) and no legacy Start New Session strings remain', () => {
  const outcomes: SessionSnapshot[] = [
    makeSession({ mode: 'COUNTDOWN', status: 'COMPLETED', completedAt: 1700001500000 }),
    makeSession({ mode: 'STOPWATCH', targetMinutes: 0, status: 'COMPLETED', completedAt: 1700001500000 }),
    makePomodoroSession('FOCUS', 'COMPLETED'),
    makeSession({ mode: 'COUNTDOWN', status: 'ABANDONED', completedAt: 1700000500000 }),
    makeSession({ mode: 'COUNTDOWN', status: 'INTERRUPTED', completedAt: 1700000500000, lastKnownValidFocusMinutes: 8 }),
  ];

  const baseProps = {
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
  };

  for (const snap of outcomes) {
    const enHtml = renderToString(
      React.createElement(TimerView, { ...baseProps, session: snap })
    );
    assert.ok(enHtml.includes('data-testid="outcome-exit-btn"'));
    assert.ok(enHtml.includes('>Exit<'));
    assert.ok(!enHtml.includes('Start New Session'));

    const viHtml = renderToString(
      React.createElement(
        I18nProvider,
        { locale: 'vi' },
        React.createElement(TimerView, { ...baseProps, session: snap })
      )
    );
    assert.ok(viHtml.includes('data-testid="outcome-exit-btn"'));
    assert.ok(viHtml.includes('>Thoát<'));
    assert.ok(!viHtml.includes('Bắt đầu Phiên Mới'));
  }

  // Dictionary audit: exact key parity + zero legacy strings
  assert.deepStrictEqual(Object.keys(VI_MESSAGES).sort(), Object.keys(EN_MESSAGES).sort());
  assert.equal(EN_MESSAGES['timer.outcome.exitSession'], 'Exit');
  assert.equal(VI_MESSAGES['timer.outcome.exitSession'], 'Thoát');
  assert.equal('timer.outcome.startNewSession' in EN_MESSAGES, false);
  assert.equal('profiles.useBtn' in EN_MESSAGES, false);
  for (const val of Object.values(EN_MESSAGES)) {
    assert.ok(!val.includes('Start New Session'), `Legacy string found in EN_MESSAGES: ${val}`);
  }
  for (const val of Object.values(VI_MESSAGES)) {
    assert.ok(!val.includes('Bắt đầu Phiên Mới'), `Legacy string found in VI_MESSAGES: ${val}`);
  }
});

test('UX-1 Exit Flow: calls reset then refreshes state and navigates to Map; error skips navigation and allows retry', async () => {
  const order: string[] = [];
  await executeExitSessionAction({
    sendReset: async () => {
      order.push('RESET_SESSION');
      return { success: true };
    },
    refreshState: async () => {
      order.push('REFRESH_STATE');
    },
    onNavigateToMap: () => {
      order.push('NAVIGATE_MAP');
    },
  });
  assert.deepStrictEqual(order, ['RESET_SESSION', 'REFRESH_STATE', 'NAVIGATE_MAP']);

  // Failure case: RESET_SESSION returns { success: false }
  let navigated = false;
  let refreshed = false;
  await assert.rejects(
    async () => {
      await executeExitSessionAction({
        sendReset: async () => ({
          success: false,
          error: 'Background worker unreachable.',
        }),
        refreshState: async () => {
          refreshed = true;
        },
        onNavigateToMap: () => {
          navigated = true;
        },
      });
    },
    /Background worker unreachable\./
  );
  assert.equal(navigated, false, 'Must NOT navigate to Map when reset fails');
  assert.equal(refreshed, false);

  // Bilingual error display & Exit button remains enabled for retry
  assert.equal(
    localizeErrorMessage('vi', 'Background worker unreachable.'),
    'Không thể kết nối tiến trình nền. Vui lòng thử lại.'
  );
  const errorOutcomeHtml = renderToString(
    React.createElement(
      I18nProvider,
      { locale: 'vi' },
      React.createElement(TimerView, {
        session: makeSession({ status: 'COMPLETED', completedAt: 1700001500000 }),
        activeProfile: makeProfile(),
        onStartSession: async () => {},
        onPauseSession: async () => {},
        onResumeSession: async () => {},
        onGiveUpSession: async () => {},
        onFinishStopwatch: async () => {},
        onResetSession: async () => {},
        onRefreshSession: async () => {},
        isLoading: false,
        initialActionError: 'Background worker unreachable.',
        onOpenProfiles: () => {},
      })
    )
  );
  assert.ok(errorOutcomeHtml.includes('data-testid="outcome-exit-error"'));
  assert.ok(errorOutcomeHtml.includes('Không thể kết nối tiến trình nền. Vui lòng thử lại.'));
  assert.doesNotMatch(errorOutcomeHtml, /data-testid="outcome-exit-btn"[^>]*\sdisabled(?:=|>|\s)/);
});

// ============================================================================
// 3. ONE-TAP PROFILE SELECTION (NO USE BUTTON, ACCESSIBILITY, ISOLATION)
// ============================================================================

test('UX-1 Profile Selection: removes Use/Dùng button, uses separate <button> with bilingual aria-label, 36x36 rounded action buttons, and updated tip', () => {
  const p1 = makeProfile({ id: 'profile-study', name: 'Study & Research' });
  const p2 = makeProfile({ id: 'profile-coding', name: 'Deep Coding', isDefault: false });
  const baseProfileProps = {
    isOpen: true,
    onClose: () => {},
    profiles: [p1, p2],
    activeProfile: p1,
    isSessionActive: false,
    isLoading: false,
    onSwitchProfile: async () => {},
    onCreateProfile: async () => {},
    onRenameProfile: async () => {},
    onDeleteProfile: async () => {},
    onAddDomain: async () => {},
    onRemoveDomain: async () => {},
  };

  const enHtml = renderToString(React.createElement(ProfileBottomSheet, baseProfileProps));
  assertNoNestedButtons(enHtml, 'ProfileBottomSheet EN');

  assert.ok(!enHtml.includes('>Use<'), 'Legacy Use button must be removed');
  assert.ok(enHtml.includes('aria-label="Select profile Study &amp; Research"'));
  assert.ok(enHtml.includes('aria-label="Select profile Deep Coding"'));
  assert.ok(enHtml.includes('aria-pressed="true"'));
  assert.ok(enHtml.includes('aria-pressed="false"'));
  assert.ok(enHtml.includes('bg-emerald-500'));
  assert.ok(enHtml.includes('>Active<'));
  assert.ok(enHtml.includes('border-indigo-300'));
  assert.ok(enHtml.includes('Tip: Tap any profile to activate it immediately.'));

  // Edit & Delete are sibling buttons in 36x36px (~w-9 h-9), rounded-10px, 1px bordered boxes outside selection button
  const selectEndIdx = enHtml.indexOf('</button>', enHtml.indexOf('data-testid="switch-profile-profile-coding"'));
  const renameIdx = enHtml.indexOf('data-testid="rename-profile-profile-coding"');
  const deleteIdx = enHtml.indexOf('data-testid="delete-profile-profile-coding"');
  assert.ok(selectEndIdx > -1 && renameIdx > selectEndIdx && deleteIdx > renameIdx);
  assert.match(enHtml, /data-testid="rename-profile-profile-coding"[^>]*aria-label="Rename Deep Coding"/);
  assert.match(enHtml, /data-testid="delete-profile-profile-coding"[^>]*aria-label="Delete Deep Coding"/);
  assert.match(enHtml, /data-testid="rename-profile-profile-coding"[^>]*class="[^"]*w-9 h-9 rounded-\[10px\] border/);
  assert.match(enHtml, /data-testid="delete-profile-profile-coding"[^>]*class="[^"]*w-9 h-9 rounded-\[10px\] border/);

  // Vietnamese parity check
  const viHtml = renderToString(
    React.createElement(
      I18nProvider,
      { locale: 'vi' },
      React.createElement(ProfileBottomSheet, baseProfileProps)
    )
  );
  assertNoNestedButtons(viHtml, 'ProfileBottomSheet VI');
  assert.ok(!viHtml.includes('>Dùng<'), 'Nút Dùng cũ phải bị xóa hoàn toàn');
  assert.ok(viHtml.includes('aria-label="Chọn hồ sơ Study &amp; Research"'));
  assert.ok(viHtml.includes('aria-label="Chọn hồ sơ Deep Coding"'));
  assert.ok(viHtml.includes('>Đang dùng<'));
  assert.ok(viHtml.includes('Chạm vào một hồ sơ để chọn và kích hoạt ngay.'));
  assert.ok(!viHtml.includes('nút Dùng'));
  // Locked state during active session (all constraints & reasons preserved)
  const lockedViHtml = renderToString(
    React.createElement(
      I18nProvider,
      { locale: 'vi' },
      React.createElement(ProfileBottomSheet, { ...baseProfileProps, isSessionActive: true })
    )
  );
  assertNoNestedButtons(lockedViHtml, 'ProfileBottomSheet Locked VI');
  assert.ok(lockedViHtml.includes('data-testid="profile-sheet-lock-banner"'));
  assert.match(lockedViHtml, /data-testid="switch-profile-profile-coding"[^>]*\sdisabled(?:=|>|\s)/);
  assert.match(lockedViHtml, /data-testid="rename-profile-profile-coding"[^>]*\sdisabled(?:=|>|\s)/);
  assert.match(lockedViHtml, /data-testid="delete-profile-profile-coding"[^>]*\sdisabled(?:=|>|\s)/);
});

test('UX-1 Profile Selection & Reset Backend Messages: SWITCH_PROFILE switches when idle, blocks during session, and RESET_SESSION returns to idle', async () => {
  const storage = new StorageManager(new MemoryStorageAdapter());
  const profileManager = new ProfileManager(storage);
  const p1 = await profileManager.createProfile('Study');
  const p2 = await profileManager.createProfile('Deep Coding');
  await profileManager.setActiveProfile(p1.id);

  const blocking = new BlockingCoordinator(new MockDNRAdapter(), new MockTabsAdapter());
  const sessionCoord = new SessionCoordinator(
    storage,
    profileManager,
    new MockAlarmsAdapter(),
    new MockNotificationsAdapter(),
    new MockBadgeAdapter(),
    blocking
  );
  const handler = new MessageHandler(sessionCoord, profileManager, storage);

  const switchRes = await handler.handleMessage({
    action: 'SWITCH_PROFILE',
    payload: { profileId: p2.id },
  });
  assert.equal(switchRes.success, true);
  assert.equal((await profileManager.getActiveProfile()).id, p2.id);

  // Start -> Give Up (terminal ABANDONED) -> Reset via RESET_SESSION
  const startRes = await handler.handleMessage({
    action: 'START_SESSION',
    payload: { mode: 'COUNTDOWN', targetMinutes: 25, profileId: p2.id },
  });
  assert.equal(startRes.success, true);

  const lockedSwitchRes = await handler.handleMessage({
    action: 'SWITCH_PROFILE',
    payload: { profileId: p1.id },
  });
  assert.equal(lockedSwitchRes.success, false);

  const giveUpRes = await handler.handleMessage({ action: 'GIVE_UP_SESSION' });
  assert.equal(giveUpRes.success, true);
  assert.equal(isInFocusSession((giveUpRes.data as SessionSnapshot) ?? null), true);

  const resetRes = await handler.handleMessage({ action: 'RESET_SESSION' });
  assert.equal(resetRes.success, true);
  const postResetState = await handler.handleMessage({ action: 'GET_SESSION_STATE' });
  assert.equal(postResetState.success, true);
  assert.equal(isInFocusSession((postResetState.data as { currentSession: SessionSnapshot | null }).currentSession), false);

  // Also check web preview client simulator parity (restoring default active profile afterwards)
  try {
    const simRes = await sendExtensionMessage<FocusProfile>({
      action: 'SWITCH_PROFILE',
      payload: { profileId: 'profile-deep-work-coding' },
    });
    assert.equal(simRes.success, true);
    assert.equal(simRes.data?.id, 'profile-deep-work-coding');
  } finally {
    await sendExtensionMessage({
      action: 'SWITCH_PROFILE',
      payload: { profileId: 'profile-study-research' },
    });
  }
});
