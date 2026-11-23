import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { TimerView } from '../../src/ui/components/TimerView.tsx';
import { PopupShell } from '../../src/App.tsx';
import {
  TimeCalculator,
  getFrozenSessionFocusMinutes,
  isTerminalSessionStatus,
  resolveSessionEndTimestamp,
} from '../../src/core/timer/timeCalculator.ts';
import { getSessionRewardPreviewFromSnapshot } from '../../src/core/reward/rewardPreview.ts';
import { formatRewardAmount } from '../../src/ui/utils/formatters.ts';
import { I18nProvider } from '../../src/i18n/I18nContext.tsx';
import { SupportedLocale } from '../../src/i18n/types.ts';
import { FocusProfile } from '../../src/types/profiles.ts';
import { DEFAULT_POMODORO_CONFIG, PomodoroConfig, SessionSnapshot } from '../../src/types/session.ts';
import { MusicPlayerState } from '../../src/types/music.ts';
import { MemoryStorageAdapter } from '../../src/storage/memoryStorageAdapter.ts';
import { StorageManager } from '../../src/storage/storageManager.ts';
import { ProfileManager } from '../../src/core/profiles/profileManager.ts';
import { BlockingCoordinator } from '../../src/background/blockingCoordinator.ts';
import {
  SessionCoordinator,
  buildPomodoroStageAlarmName,
} from '../../src/background/sessionCoordinator.ts';
import { sendExtensionMessage } from '../../src/ui/services/extensionClient.ts';
import {
  MockAlarmsAdapter,
  MockBadgeAdapter,
  MockDNRAdapter,
  MockNotificationsAdapter,
  MockTabsAdapter,
} from '../mocks/chromeMock.ts';

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

function stripHtml(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

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

type TimerViewProps = React.ComponentProps<typeof TimerView>;

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

function renderTimer(
  overrides: Partial<TimerViewProps> = {},
  locale: SupportedLocale = 'en'
): { html: string; text: string } {
  const el = React.createElement(TimerView, makeTimerProps(overrides));
  const html = renderToString(
    locale === 'en' ? el : React.createElement(I18nProvider, { locale }, el)
  );
  return { html, text: stripHtml(html) };
}

function createBackendHarness() {
  const storage = new StorageManager(new MemoryStorageAdapter(), new MemoryStorageAdapter());
  const profileManager = new ProfileManager(storage);
  const alarms = new MockAlarmsAdapter();
  const notifications = new MockNotificationsAdapter();
  const badge = new MockBadgeAdapter();
  const dnr = new MockDNRAdapter();
  const tabs = new MockTabsAdapter();
  const blockingCoordinator = new BlockingCoordinator(dnr, tabs);

  const coordinator = new SessionCoordinator(
    storage,
    profileManager,
    alarms,
    notifications,
    badge,
    blockingCoordinator
  );

  return { storage, profileManager, alarms, notifications, badge, coordinator };
}

function makePopupProps(
  session: SessionSnapshot | null,
  overrides: Partial<React.ComponentProps<typeof PopupShell>> = {}
): React.ComponentProps<typeof PopupShell> {
  const p1 = makeProfile();
  return {
    onToggleLanguage: async () => {},
    session,
    economy: { focusCoins: 100, totalXP: 200, level: 2 },
    activeProfile: p1,
    profiles: [p1],
    todayStats: null,
    lifetimeFocusMinutes: 50,
    isBlockingActive: false,
    isSessionActive: false,
    civEra: 'STONE_AGE',
    settings: { soundEnabled: false, notificationsEnabled: true, language: 'en' },
    isLoading: false,
    activeTab: 'focus',
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

// ============================================================================
// 1. REPRO BUG: GIVE UP + MACHINE SLEEP (RUNNING & PAUSED)
// ============================================================================

test('UX-6 Repro: Countdown Give Up left open across 4h machine sleep stays frozen at exact focus minutes (RUNNING & PAUSED)', async () => {
  const realDateNow = Date.now;
  let fakeNow = 1_700_000_000_000;
  Date.now = () => fakeNow;

  try {
    // Case A: RUNNING -> 5 minutes elapsed -> Give Up -> 4 hours sleep -> reopen popup
    const h1 = createBackendHarness();
    const p1 = await h1.profileManager.createProfile('Study', []);
    await h1.coordinator.startSession('COUNTDOWN', 25, p1.id);
    fakeNow += 5 * 60 * 1000;
    const abandonedRunning = await h1.coordinator.giveUpCountdown();
    assert.strictEqual(abandonedRunning.status, 'ABANDONED');
    assert.strictEqual(abandonedRunning.finalFocusMinutes, 5);

    const beforeSleepRender = renderTimer({ session: abandonedRunning }, 'vi');
    assert.ok(beforeSleepRender.text.includes('5m'), `Expected 5m before sleep: ${beforeSleepRender.text}`);

    // Simulate 4-hour machine sleep before reopening popup without clicking Exit
    fakeNow += 4 * 60 * 60 * 1000;

    assert.strictEqual(getFrozenSessionFocusMinutes(abandonedRunning), 5);
    const afterSleepRenderEn = renderTimer({ session: abandonedRunning }, 'en');
    const afterSleepRenderVi = renderTimer({ session: abandonedRunning }, 'vi');
    assert.ok(afterSleepRenderEn.text.includes('5m'), `EN must stay 5m after sleep: ${afterSleepRenderEn.text}`);
    assert.ok(!afterSleepRenderEn.text.includes('245m'), 'Must NEVER show 245m');
    assert.ok(afterSleepRenderEn.text.includes('+0'));
    assert.ok(afterSleepRenderEn.html.includes('data-testid="outcome-exit-btn"'));

    assert.ok(afterSleepRenderVi.text.includes('5m'), `VI must stay 5m after sleep: ${afterSleepRenderVi.text}`);
    assert.ok(!afterSleepRenderVi.text.includes('245m'));
    assert.ok(afterSleepRenderVi.text.includes('>Thoát<') || afterSleepRenderVi.html.includes('>Thoát<'));

    // PopupShell preserves UX-1 locked Focus screen without Navbar
    const shellHtml = renderToString(React.createElement(PopupShell, makePopupProps(abandonedRunning)));
    assert.ok(!shellHtml.includes('data-testid="bottom-navbar"'));
    assert.ok(shellHtml.includes('5m'));
    assert.ok(!shellHtml.includes('245m'));

    // Case B: PAUSED -> 7m focused, 2m paused -> Give Up -> 5 hours sleep
    const h2 = createBackendHarness();
    const p2 = await h2.profileManager.createProfile('StudyPause', []);
    await h2.coordinator.startSession('COUNTDOWN', 30, p2.id);
    fakeNow += 7 * 60 * 1000;
    await h2.coordinator.pauseSession();
    fakeNow += 2 * 60 * 1000;
    const abandonedPaused = await h2.coordinator.giveUpCountdown();
    assert.strictEqual(abandonedPaused.finalFocusMinutes, 7);

    fakeNow += 5 * 60 * 60 * 1000;
    const afterPausedSleep = renderTimer({ session: abandonedPaused }, 'en');
    assert.ok(afterPausedSleep.text.includes('7m'), `Expected 7m after sleep: ${afterPausedSleep.text}`);
    assert.ok(!afterPausedSleep.text.includes('307m') && !afterPausedSleep.text.includes('309m'));
  } finally {
    Date.now = realDateNow;
  }
});

// ============================================================================
// 2. ALL 4 MODES TERMINAL FREEZE (COMPLETED, ABANDONED, INTERRUPTED + SLEEP)
// ============================================================================

test('UX-6 All 4 Modes: STOPWATCH COMPLETED, COUNTDOWN COMPLETED, POMODORO_COUNTDOWN & POMODORO_STOPWATCH stay frozen across +6h sleep', async () => {
  const realDateNow = Date.now;
  let fakeNow = 1_700_100_000_000;
  Date.now = () => fakeNow;

  try {
    // 1) STOPWATCH COMPLETED: 30m -> x1.2 -> 36 Coins, 108 XP
    {
      const h = createBackendHarness();
      const profile = await h.profileManager.createProfile('SW', []);
      await h.coordinator.startSession('STOPWATCH', 0, profile.id);
      fakeNow += 30 * 60 * 1000;
      const finished = await h.coordinator.finishStopwatch();
      assert.strictEqual(finished.coinsEarned, 36);
      assert.strictEqual(finished.xpEarned, 108);

      // Advance clock +6 hours (360m)
      fakeNow += 6 * 60 * 60 * 1000;

      const preview = getSessionRewardPreviewFromSnapshot(finished.session);
      assert.strictEqual(preview.coins, 36);
      assert.strictEqual(preview.xp, 108);
      assert.strictEqual(preview.multiplier, 1.2);

      const view = renderTimer({ session: finished.session }, 'en');
      assert.ok(view.text.includes('30m'), `Stopwatch outcome must stay 30m: ${view.text}`);
      assert.ok(!view.text.includes('390m'), 'Stopwatch outcome must NEVER inflate to 390m');
      assert.ok(view.text.includes('+36') && view.text.includes('+108'));
      assert.ok(view.text.includes('1.2x'));
    }

    // 2) COUNTDOWN COMPLETED late after wake (+3m past target)
    {
      const h = createBackendHarness();
      const profile = await h.profileManager.createProfile('CD', []);
      await h.coordinator.startSession('COUNTDOWN', 25, profile.id);
      fakeNow += 28 * 60 * 1000; // Woke 3 minutes late
      const completed = await h.coordinator.completeCountdown();
      assert.ok(completed);
      assert.strictEqual(completed.finalFocusMinutes, 25);

      fakeNow += 6 * 60 * 60 * 1000;
      const view = renderTimer({ session: completed }, 'en');
      assert.ok(view.text.includes('25m') && !view.text.includes('388m') && !view.text.includes('28m'));
      assert.ok(view.text.includes(`+${formatRewardAmount(25 * 1.5 * 1.0)}`));
      assert.ok(view.text.includes('+125'));
    }

    // 3) POMODORO_COUNTDOWN ABANDONED after 2 intervals + 8m partial -> sleep 6h
    {
      const h = createBackendHarness();
      const profile = await h.profileManager.createProfile('PCD', []);
      const cfg: PomodoroConfig = { ...DEFAULT_POMODORO_CONFIG };
      let s: SessionSnapshot | null = await h.coordinator.startSession('POMODORO_COUNTDOWN', 25, profile.id, cfg);
      for (let i = 0; i < 2; i++) {
        fakeNow += 25 * 60 * 1000;
        s = await h.coordinator.advancePomodoroStage(
          buildPomodoroStageAlarmName(s!.id, s!.pomodoroState!.currentInterval, 'FOCUS', s!.pomodoroState!.phaseStartedAt)
        );
        fakeNow += 5 * 60 * 1000;
        s = await h.coordinator.advancePomodoroStage(
          buildPomodoroStageAlarmName(s!.id, s!.pomodoroState!.currentInterval, s!.pomodoroState!.currentPhase, s!.pomodoroState!.phaseStartedAt)
        );
      }
      fakeNow += 8 * 60 * 1000;
      const abandonedPomoCd = await h.coordinator.giveUpCountdown();
      assert.strictEqual(abandonedPomoCd.finalFocusMinutes, 58);

      fakeNow += 6 * 60 * 60 * 1000;
      const view = renderTimer({ session: abandonedPomoCd }, 'en');
      assert.ok(view.text.includes('2 / 12 (50m)'), `Expected 2 / 12 (50m): ${view.text}`);
      assert.ok(view.text.includes('+0') && !view.text.includes('418m'));
    }

    // 4) POMODORO_STOPWATCH COMPLETED after 1 interval + 10m partial -> sleep 6h
    {
      const h = createBackendHarness();
      const profile = await h.profileManager.createProfile('PSW', []);
      const cfg: PomodoroConfig = { ...DEFAULT_POMODORO_CONFIG };
      let s: SessionSnapshot | null = await h.coordinator.startSession('POMODORO_STOPWATCH', 25, profile.id, cfg);
      fakeNow += 25 * 60 * 1000;
      s = await h.coordinator.advancePomodoroStage(
        buildPomodoroStageAlarmName(s!.id, s!.pomodoroState!.currentInterval, 'FOCUS', s!.pomodoroState!.phaseStartedAt)
      );
      fakeNow += 5 * 60 * 1000;
      s = await h.coordinator.advancePomodoroStage(
        buildPomodoroStageAlarmName(s!.id, s!.pomodoroState!.currentInterval, s!.pomodoroState!.currentPhase, s!.pomodoroState!.phaseStartedAt)
      );
      fakeNow += 10 * 60 * 1000;
      const finished = await h.coordinator.finishStopwatch();
      assert.strictEqual(finished.session.finalFocusMinutes, 35);

      fakeNow += 6 * 60 * 60 * 1000;
      const view = renderTimer({ session: finished.session }, 'en');
      assert.ok(view.text.includes('1 (25m)'), `Expected 1 (25m): ${view.text}`);
      assert.ok(view.text.includes('+25') && view.text.includes('+75'));
      assert.ok(!view.text.includes('395m'));
    }
  } finally {
    Date.now = realDateNow;
  }
});

// ============================================================================
// 3. INTERRUPTED WITH DOWNTIME & LEGACY FALLBACKS (NO DATE.NOW LEAK)
// ============================================================================

test('UX-6 Interrupted & Legacy Fallbacks: handles BROWSER_CLOSED downtime, missing finalFocusMinutes, unfinalized pause, and missing completedAt without Date.now()', () => {
  const realDateNow = Date.now;
  let fakeNow = 1_700_500_000_000;
  Date.now = () => fakeNow;

  try {
    // 1) BROWSER_CLOSED where completedAt - startedAt is 120m, but lastKnownValidFocusMinutes is 12m
    const browserClosedInterrupted: SessionSnapshot = {
      id: 'sess-int-downtime',
      mode: 'COUNTDOWN',
      profileId: 'profile-study',
      status: 'INTERRUPTED',
      targetMinutes: 60,
      lockedMultiplier: 1.0,
      startedAt: fakeNow - 120 * 60 * 1000,
      currentPauseStartedAt: null,
      pauseCount: 0,
      totalPauseMs: 0,
      pauseHistory: [],
      lastHeartbeatAt: fakeNow - 108 * 60 * 1000,
      completedAt: fakeNow,
      rewardProcessed: true,
      interruptedReason: 'BROWSER_CLOSED',
      lastKnownValidFocusMinutes: 12,
    };
    fakeNow += 4 * 60 * 60 * 1000;
    assert.strictEqual(getFrozenSessionFocusMinutes(browserClosedInterrupted), 12);
    const intRender = renderTimer({ session: browserClosedInterrupted }, 'en');
    assert.ok(intRender.text.includes('12m') && !intRender.text.includes('120m') && !intRender.text.includes('360m'));

    // 2) Legacy ABANDONED snapshot (NO finalFocusMinutes) frozen at completedAt
    const legacyStarted = 1_700_200_000_000;
    const legacyCompletedAt = legacyStarted + 9 * 60 * 1000;
    const legacyAbandoned: SessionSnapshot = {
      id: 'sess-legacy-abandoned',
      mode: 'COUNTDOWN',
      profileId: 'profile-study',
      status: 'ABANDONED',
      targetMinutes: 45,
      lockedMultiplier: 1.4,
      startedAt: legacyStarted,
      currentPauseStartedAt: null,
      pauseCount: 0,
      totalPauseMs: 0,
      pauseHistory: [],
      lastHeartbeatAt: legacyCompletedAt,
      completedAt: legacyCompletedAt,
      rewardProcessed: true,
    };
    assert.strictEqual(getFrozenSessionFocusMinutes(legacyAbandoned), 9);
    const legacyRender = renderTimer({ session: legacyAbandoned }, 'en');
    assert.ok(legacyRender.text.includes('9m'));

    // 3) Legacy terminal snapshot with unfinalized currentPauseStartedAt (e.g., paused for 2m before Give Up)
    const unfinalizedPausedAbandoned: SessionSnapshot = {
      ...legacyAbandoned,
      id: 'sess-legacy-paused-abandoned',
      startedAt: legacyStarted,
      currentPauseStartedAt: legacyStarted + 6 * 60 * 1000,
      completedAt: legacyStarted + 8 * 60 * 1000,
      totalPauseMs: 0,
    };
    assert.strictEqual(getFrozenSessionFocusMinutes(unfinalizedPausedAbandoned), 6);

    // 4) Legacy COMPLETED Stopwatch without finalFocusMinutes, frozen at completedAt (never Date.now())
    const legacyStopwatch: SessionSnapshot = {
      id: 'sess-legacy-sw',
      mode: 'STOPWATCH',
      profileId: 'profile-study',
      status: 'COMPLETED',
      targetMinutes: 0,
      lockedMultiplier: 1.2,
      startedAt: legacyStarted,
      currentPauseStartedAt: null,
      pauseCount: 0,
      totalPauseMs: 0,
      pauseHistory: [],
      lastHeartbeatAt: legacyStarted + 30 * 60 * 1000,
      completedAt: legacyStarted + 30 * 60 * 1000,
      rewardProcessed: true,
    };
    assert.strictEqual(getFrozenSessionFocusMinutes(legacyStopwatch), 30);
    const swPreview = getSessionRewardPreviewFromSnapshot(legacyStopwatch);
    assert.strictEqual(swPreview.coins, 36);
    assert.strictEqual(swPreview.xp, 108);

    // 5) Corrupted legacy terminal snapshot missing BOTH finalFocusMinutes AND completedAt
    const corruptedCountdownMissingEnd: SessionSnapshot = {
      ...legacyAbandoned,
      id: 'sess-corrupted-no-end',
      completedAt: null,
      lastCheckpointAt: legacyStarted + 11 * 60 * 1000,
      lastHeartbeatAt: legacyStarted + 11 * 60 * 1000,
    };
    assert.strictEqual(resolveSessionEndTimestamp(corruptedCountdownMissingEnd), legacyStarted + 11 * 60 * 1000);
    assert.strictEqual(getFrozenSessionFocusMinutes(corruptedCountdownMissingEnd), 11);

    // Helper contract: TimeCalculator.calculateElapsedTime with completedAt ignores live currentTime
    const directElapsed = TimeCalculator.calculateElapsedTime({
      startedAt: legacyStarted,
      currentTime: fakeNow,
      status: 'ABANDONED',
      currentPauseStartedAt: null,
      totalCompletedPauseMs: 0,
      completedAt: legacyCompletedAt,
    });
    assert.strictEqual(directElapsed.actualFocusMinutes, 9);
    assert.strictEqual(isTerminalSessionStatus('ABANDONED'), true);
    assert.strictEqual(isTerminalSessionStatus('RUNNING'), false);
  } finally {
    Date.now = realDateNow;
  }
});

// ============================================================================
// 4. RE-ENTRY & WAKE IDEMPOTENCY + SIMULATOR GIVE-UP PARITY
// ============================================================================

test('UX-6 Re-entry & Wake Safety: lifecycle wake/startup/getFullState hours after ABANDONED or COMPLETED never double-commits or alters terminal session', async () => {
  const realDateNow = Date.now;
  let fakeNow = 1_700_800_000_000;
  Date.now = () => fakeNow;

  try {
    const h = createBackendHarness();
    const profile = await h.profileManager.createProfile('WakeSafe', []);

    await h.coordinator.startSession('COUNTDOWN', 25, profile.id);
    fakeNow += 5 * 60 * 1000;
    const abandoned = await h.coordinator.giveUpCountdown();
    const ecoBefore = await h.storage.getEconomy();
    const statsBefore = await h.storage.getDailyStats();

    // Advance 6 hours (Sleep/Wake) and trigger SW wake, browser startup, and getFullState
    fakeNow += 6 * 60 * 60 * 1000;
    await h.coordinator.handleLifecycleEvent({ reason: 'SERVICE_WORKER_WAKE' });
    await h.coordinator.handleLifecycleEvent({ reason: 'BROWSER_STARTUP', isBrowserStartup: true });
    const full = await h.coordinator.getFullState();

    assert.strictEqual(full.currentSession?.status, 'ABANDONED');
    assert.strictEqual(full.currentSession?.completedAt, abandoned.completedAt);
    assert.strictEqual(full.currentSession?.finalFocusMinutes, 5);
    assert.deepStrictEqual(await h.storage.getEconomy(), ecoBefore);
    assert.deepStrictEqual(await h.storage.getDailyStats(), statsBefore);

    // Simulator parity check: PAUSE -> GIVE_UP_SESSION clears currentPauseStartedAt & sets finalFocusMinutes
    await sendExtensionMessage({
      action: 'START_SESSION',
      payload: { mode: 'COUNTDOWN', targetMinutes: 25, profileId: 'profile-study-research' },
    });
    fakeNow += 4 * 60 * 1000;
    await sendExtensionMessage({ action: 'PAUSE_SESSION' });
    fakeNow += 2 * 60 * 1000;
    const simGiveUp = await sendExtensionMessage<SessionSnapshot>({ action: 'GIVE_UP_SESSION' });
    assert.strictEqual(simGiveUp.success, true);
    assert.strictEqual(simGiveUp.data?.status, 'ABANDONED');
    assert.strictEqual(simGiveUp.data?.currentPauseStartedAt, null);
    assert.strictEqual(simGiveUp.data?.finalFocusMinutes, 4);

    fakeNow += 5 * 60 * 60 * 1000;
    assert.strictEqual(getFrozenSessionFocusMinutes(simGiveUp.data!), 4);

    await sendExtensionMessage({ action: 'RESET_SESSION' });
  } finally {
    Date.now = realDateNow;
  }
});
