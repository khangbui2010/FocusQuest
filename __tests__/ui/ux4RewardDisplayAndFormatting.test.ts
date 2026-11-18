import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToString } from 'react-dom/server';
import {
  formatRewardAmount,
  formatCoinAmount,
  formatXpAmount,
  formatDecimalMax2,
} from '../../src/ui/utils/formatters.ts';
import {
  getSessionRewardPreview,
  getSessionRewardPreviewFromSnapshot,
} from '../../src/core/reward/rewardPreview.ts';
import { TimerView } from '../../src/ui/components/TimerView.tsx';
import { Header } from '../../src/ui/components/Header.tsx';
import { PopupShell } from '../../src/App.tsx';
import { BuildingCatalogPanel } from '../../src/ui/components/civilization/BuildingCatalogPanel.tsx';
import { I18nProvider } from '../../src/i18n/I18nContext.tsx';
import { SupportedLocale } from '../../src/i18n/types.ts';
import { FocusProfile } from '../../src/types/profiles.ts';
import { CoinBonus } from '../../src/types/economy.ts';
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

function createBackendHarness(bonusProvider: () => readonly CoinBonus[] = () => []) {
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
    blockingCoordinator,
    bonusProvider
  );

  return { storage, profileManager, alarms, notifications, badge, coordinator };
}

// ============================================================================
// 1. FORMATTER SUITE (DECIMAL HALF-UP, TRAILING ZEROS, EDGE CASES)
// ============================================================================

test('UX-4 Formatter: formatRewardAmount rounds decimal half-up to max 2 decimals, strips trailing zeros, handles edge cases', () => {
  const cases: readonly [number, string][] = [
    [7.875, '7.88'],
    [7.5, '7.5'],
    [34.5, '34.5'],
    [55, '55'],
    [63.375, '63.38'],
    [1.005, '1.01'],
    [10.005, '10.01'],
    [0.004, '0'],
    [0.005, '0.01'],
    [0, '0'],
    [-0, '0'],
    [-0.004, '0'],
    [-1.005, '-1.01'],
    [NaN, '0'],
    [Infinity, '0'],
    [-Infinity, '0'],
    [1234567.891, '1234567.89'],
    [35437.5, '35437.5'],
    [112500, '112500'],
    [1.2000000001, '1.2'],
    [7.7250000000000005, '7.73'],
    [9.999, '10'],
    [1e-5, '0'],
    [5e-3, '0.01'],
    [1.23e4, '12300'],
  ];

  for (const [input, expected] of cases) {
    assert.strictEqual(
      formatRewardAmount(input),
      expected,
      `formatRewardAmount(${String(input)}) expected "${expected}"`
    );
    assert.ok(!formatRewardAmount(input).includes(','), 'Must always use "." decimal separator');
  }

  assert.strictEqual(formatCoinAmount(7.875), '7.88');
  assert.strictEqual(formatXpAmount(25), '25');
  assert.strictEqual(formatDecimalMax2(1.005), '1.01');
  assert.strictEqual(formatRewardAmount(7.875, 0), '8');
  assert.strictEqual(formatRewardAmount(7.875, 3), '7.875');
});

// ============================================================================
// 2. OBSERVED SCENARIO: 55.5 + 5m COUNTDOWN @ +5% (HEADER, SETUP, RUNNING, COMPLETED, CATALOG)
// ============================================================================

test('UX-4 Observed Bug Scenario: 5m Countdown with +5% CoinBonus credits 55.5 -> 63.375 exact; Header 63.38; Setup/Running/Completed +7.88 & +5% & +25 XP', async () => {
  const bonuses: CoinBonus[] = [{ id: 'b-granary', source: 'BUILDING', rate: 0.05 }];
  const h = createBackendHarness(() => bonuses);
  const profile = await h.profileManager.createProfile('Study', ['github.com']);

  await h.storage.updateEconomy(() => ({
    focusCoins: 55.5,
    totalXP: 100,
    level: 2,
  }));
  await h.storage.updateSettings({ language: 'en', notificationsEnabled: true });

  const started = await h.coordinator.startSession('COUNTDOWN', 5, profile.id);
  const completed = await h.coordinator.completeCountdown();

  // Exact IEEE-754 storage precision preserved
  const afterEco = await h.storage.getEconomy();
  assert.strictEqual(afterEco.focusCoins, 63.375);
  assert.strictEqual(afterEco.totalXP, 125);

  // Header shows rounded 63.38 (NEVER 63.375)
  const headerHtml = stripHtml(
    renderToString(
      React.createElement(Header, {
        economy: afterEco,
        activeProfile: profile,
        era: 'STONE_AGE',
      })
    )
  );
  assert.ok(headerHtml.includes('63.38'), `Header must show 63.38: ${headerHtml}`);
  assert.ok(!headerHtml.includes('63.375'), `Header must not leak raw 63.375: ${headerHtml}`);

  // BuildingCatalogPanel also formats wallet 63.38 (NEVER 63.375)
  const catalogText = stripHtml(
    renderToString(
      React.createElement(BuildingCatalogPanel, {
        isOpen: true,
        onClose: () => {},
        playerLevel: afterEco.level,
        playerCoins: afterEco.focusCoins,
        lifetimeFocusMinutes: 5,
        currentEra: 'STONE_AGE',
        onSelectBuilding: () => {},
      })
    )
  );
  assert.ok(catalogText.includes('63.38'), `Catalog must format wallet to 63.38: ${catalogText}`);
  assert.ok(!catalogText.includes('63.375'), `Catalog must not leak raw 63.375: ${catalogText}`);

  // Notification formatted via notificationFormatter (outside SessionCoordinator)
  const allNotifications = Array.from(h.notifications.notifications.values());
  assert.strictEqual(allNotifications.length, 1);
  assert.ok(
    allNotifications[0].message.includes('7.88'),
    `Notification message should format 7.875 -> 7.88: ${allNotifications[0].message}`
  );
  assert.ok(
    allNotifications[0].message.includes('25'),
    `Notification message should contain 25 XP: ${allNotifications[0].message}`
  );

  // Setup preview via Single Source of Truth
  const setupPreview5m = getSessionRewardPreview({
    mode: 'COUNTDOWN',
    status: 'IDLE',
    targetMinutes: 5,
    coinBonusRate: 0.05,
  });
  assert.strictEqual(setupPreview5m.coins, 7.875);
  assert.strictEqual(setupPreview5m.xp, 25);

  // Running screen for the 5m Countdown with +5%
  const runningView = renderTimer({ session: started, activeBonusRate: 0.05 });
  assert.ok(
    runningView.text.includes('7.88') && runningView.text.includes('+5%') && runningView.text.includes('25 XP'),
    `Running must show 7.88 Coin, +5%, 25 XP: ${runningView.text}`
  );
  assert.ok(runningView.html.includes('data-testid="live-coin-bonus-chip"'));
  assert.ok(!runningView.text.includes('7.5 Coin'), `Must NOT show bonus-less 7.5 Coin: ${runningView.text}`);

  // Completed screen for the 5m Countdown with +5%
  const completedView = renderTimer({ session: completed, activeBonusRate: 0.05 });
  assert.ok(
    completedView.text.includes('+7.88') && completedView.text.includes('+5%') && completedView.text.includes('+25'),
    `Completed must show +7.88, +5%, +25: ${completedView.text}`
  );
  assert.ok(completedView.html.includes('data-testid="outcome-coin-bonus-chip"'));
  assert.ok(!completedView.text.includes('+7.5'), `Completed must NOT show +7.5: ${completedView.text}`);
});

// ============================================================================
// 3. TABLE-DRIVEN 4-MODE PARITY: SETUP == RUNNING == COMPLETED == COORDINATOR
// ============================================================================

test('UX-4 4-Mode Parity: Setup, Running, Finish Modal, Completed, and SessionCoordinator settlement agree at 0% and +5%', async () => {
  const realDateNow = Date.now;
  let fakeNow = 1700000000000;
  Date.now = () => fakeNow;

  try {
    for (const bonusRate of [0, 0.05] as const) {
      const bonusTag = bonusRate > 0 ? `+${formatRewardAmount(bonusRate * 100)}%` : '';
      const activeBonuses: CoinBonus[] =
        bonusRate > 0 ? [{ id: 'b-1', source: 'BUILDING', rate: bonusRate }] : [];

      // --- Mode A: COUNTDOWN 25m (default Setup duration) ---
      {
        const h = createBackendHarness(() => activeBonuses);
        const profile = await h.profileManager.createProfile('CD', []);
        const setupPreview = getSessionRewardPreview({
          mode: 'COUNTDOWN',
          status: 'IDLE',
          targetMinutes: 25,
          coinBonusRate: bonusRate,
        });
        const setupRender = renderTimer({ session: null, activeBonusRate: bonusRate });
        const expCoins = formatRewardAmount(setupPreview.coins);
        const expXp = formatRewardAmount(setupPreview.xp);
        assert.ok(setupRender.text.includes(`+${expCoins}`));
        assert.ok(setupRender.text.includes(`+${expXp}`));
        if (bonusTag) assert.ok(setupRender.text.includes(bonusTag));

        const runningSession = await h.coordinator.startSession('COUNTDOWN', 25, profile.id);
        const runningRender = renderTimer({ session: runningSession, activeBonusRate: bonusRate });
        assert.ok(runningRender.text.includes(`${expCoins} Coin`));
        assert.ok(runningRender.text.includes(`${expXp} XP`));
        if (bonusTag) assert.ok(runningRender.text.includes(bonusTag));

        fakeNow += 25 * 60 * 1000;
        const completedSession = await h.coordinator.completeCountdown();
        const afterEco = await h.storage.getEconomy();
        assert.strictEqual(afterEco.focusCoins, setupPreview.coins);
        assert.strictEqual(afterEco.totalXP, setupPreview.xp);

        const completedRender = renderTimer({ session: completedSession, activeBonusRate: bonusRate });
        assert.ok(completedRender.text.includes(`+${expCoins}`));
        assert.ok(completedRender.text.includes(`+${expXp}`));
        if (bonusTag) assert.ok(completedRender.text.includes(bonusTag));
      }

      // --- Mode B: STOPWATCH 30m (x1.2 tier) ---
      {
        const h = createBackendHarness(() => activeBonuses);
        const profile = await h.profileManager.createProfile('SW', []);
        const swSession = await h.coordinator.startSession('STOPWATCH', 0, profile.id);
        fakeNow += 30 * 60 * 1000;

        const livePreview = getSessionRewardPreviewFromSnapshot(swSession, {
          actualFocusMinutes: 30,
          coinBonusRate: bonusRate,
        });
        const expCoins = formatRewardAmount(livePreview.coins);
        const expXp = formatRewardAmount(livePreview.xp);

        const runningRender = renderTimer({ session: swSession, activeBonusRate: bonusRate });
        assert.ok(runningRender.text.includes(`${expCoins} Coin`));
        assert.ok(runningRender.text.includes(`${expXp} XP`));
        assert.ok(runningRender.text.includes('×1.2'));
        if (bonusTag) assert.ok(runningRender.text.includes(bonusTag));

        const completedSw = await h.coordinator.finishStopwatch();
        const afterEco = await h.storage.getEconomy();
        assert.strictEqual(afterEco.focusCoins, livePreview.coins);
        assert.strictEqual(afterEco.totalXP, livePreview.xp);

        const completedRender = renderTimer({ session: completedSw.session, activeBonusRate: bonusRate });
        assert.ok(completedRender.text.includes(`+${expCoins}`));
        assert.ok(completedRender.text.includes(`+${expXp}`));
        if (bonusTag) assert.ok(completedRender.text.includes(bonusTag));
      }

      // --- Mode C: POMODORO_COUNTDOWN (default 25*4*3 = 300m -> x2.5) ---
      {
        const h = createBackendHarness(() => activeBonuses);
        const profile = await h.profileManager.createProfile('PC', []);
        const cfg: PomodoroConfig = { ...DEFAULT_POMODORO_CONFIG };
        const setupPreview = getSessionRewardPreview({
          mode: 'POMODORO_COUNTDOWN',
          status: 'IDLE',
          targetMinutes: 25,
          coinBonusRate: bonusRate,
          pomodoroConfig: cfg,
        });
        const expCoins = formatRewardAmount(setupPreview.coins);
        const expXp = formatRewardAmount(setupPreview.xp);

        const runningPomoCd = await h.coordinator.startSession('POMODORO_COUNTDOWN', 25, profile.id, cfg);
        const runningRender = renderTimer({ session: runningPomoCd, activeBonusRate: bonusRate });
        assert.ok(runningRender.text.includes(`${expCoins} Coin`));
        assert.ok(runningRender.text.includes(`${expXp} XP`));
        assert.ok(runningRender.text.includes('×2.5'));
        if (bonusTag) assert.ok(runningRender.text.includes(bonusTag));

        // Simulate 100% completion across all 12 focus intervals
        let s: SessionSnapshot | null = runningPomoCd;
        for (let i = 1; i <= 12; i++) {
          assert.ok(s?.pomodoroState);
          fakeNow += 25 * 60 * 1000;
          const focusAlarm = buildPomodoroStageAlarmName(
            s.id,
            s.pomodoroState.currentInterval,
            'FOCUS',
            s.pomodoroState.phaseStartedAt
          );
          s = await h.coordinator.advancePomodoroStage(focusAlarm);
          assert.ok(s);
          if (s.status !== 'COMPLETED') {
            fakeNow += (s.pomodoroState!.phaseTargetDurationMinutes || 5) * 60 * 1000;
            const breakAlarm = buildPomodoroStageAlarmName(
              s.id,
              s.pomodoroState!.currentInterval,
              s.pomodoroState!.currentPhase,
              s.pomodoroState!.phaseStartedAt
            );
            s = await h.coordinator.advancePomodoroStage(breakAlarm);
          }
        }
        assert.strictEqual(s?.status, 'COMPLETED');
        const afterEco = await h.storage.getEconomy();
        assert.strictEqual(afterEco.focusCoins, setupPreview.coins);
        assert.strictEqual(afterEco.totalXP, setupPreview.xp);

        const completedRender = renderTimer({ session: s!, activeBonusRate: bonusRate });
        assert.ok(completedRender.text.includes(`+${expCoins}`));
        assert.ok(completedRender.text.includes(`+${expXp}`));
        if (bonusTag) assert.ok(completedRender.text.includes(bonusTag));
      }

      // --- Mode D: POMODORO_STOPWATCH (finish after 2 intervals = 50m -> x1.2) ---
      {
        const h = createBackendHarness(() => activeBonuses);
        const profile = await h.profileManager.createProfile('PSW', []);
        const cfg: PomodoroConfig = { ...DEFAULT_POMODORO_CONFIG };
        let s: SessionSnapshot | null = await h.coordinator.startSession('POMODORO_STOPWATCH', 25, profile.id, cfg);
        for (let i = 1; i <= 2; i++) {
          assert.ok(s?.pomodoroState);
          fakeNow += 25 * 60 * 1000;
          const focusAlarm = buildPomodoroStageAlarmName(
            s.id,
            s.pomodoroState.currentInterval,
            'FOCUS',
            s.pomodoroState.phaseStartedAt
          );
          s = await h.coordinator.advancePomodoroStage(focusAlarm);
          assert.ok(s?.pomodoroState);
          fakeNow += 5 * 60 * 1000;
          const breakAlarm = buildPomodoroStageAlarmName(
            s.id,
            s.pomodoroState.currentInterval,
            s.pomodoroState.currentPhase,
            s.pomodoroState.phaseStartedAt
          );
          s = await h.coordinator.advancePomodoroStage(breakAlarm);
        }
        assert.ok(s);

        const livePreview = getSessionRewardPreviewFromSnapshot(s, { coinBonusRate: bonusRate });
        const expCoins = formatRewardAmount(livePreview.coins);
        const expXp = formatRewardAmount(livePreview.xp);
        assert.strictEqual(livePreview.coins, 50 * 1.0 * 1.2 * (1 + bonusRate));
        assert.strictEqual(livePreview.xp, 50 * 3.0 * 1.2);

        const runningRender = renderTimer({ session: s, activeBonusRate: bonusRate });
        assert.ok(runningRender.text.includes(`${expCoins} Coin`));
        assert.ok(runningRender.text.includes(`${expXp} XP`));
        if (bonusTag) assert.ok(runningRender.text.includes(bonusTag));

        const completedSw = await h.coordinator.finishStopwatch();
        const afterEco = await h.storage.getEconomy();
        assert.strictEqual(afterEco.focusCoins, livePreview.coins);
        assert.strictEqual(afterEco.totalXP, livePreview.xp);

        const completedRender = renderTimer({ session: completedSw.session, activeBonusRate: bonusRate });
        assert.ok(completedRender.text.includes(`+${expCoins}`));
        assert.ok(completedRender.text.includes(`+${expXp}`));
        if (bonusTag) assert.ok(completedRender.text.includes(bonusTag));
      }
    }
  } finally {
    Date.now = realDateNow;
  }
});

// ============================================================================
// 4. EDGE CASES: STOPWATCH < 5m COMPLETED, MID-SESSION BUILDING BONUS SYNC, PRECISION ACCUMULATION
// ============================================================================

test('UX-4 Stopwatch < 5m Completed parity: shows +0 Coin and +0 XP matching RewardEngine', async () => {
  const realDateNow = Date.now;
  let fakeNow = 1700000000000;
  Date.now = () => fakeNow;

  try {
    const h = createBackendHarness(() => [{ id: 'b-1', source: 'BUILDING', rate: 0.05 }]);
    const profile = await h.profileManager.createProfile('Short SW', []);
    const started = await h.coordinator.startSession('STOPWATCH', 0, profile.id);
    fakeNow += 3 * 60 * 1000;

    // Running under threshold (< 5m)
    const runningRender = renderTimer({ session: started, activeBonusRate: 0.05 });
    assert.ok(runningRender.text.includes('0 Coin') && runningRender.text.includes('0 XP'));
    assert.ok(!runningRender.html.includes('data-testid="live-coin-bonus-chip"'));

    // Completed under threshold (< 5m)
    const completed = await h.coordinator.finishStopwatch();
    const afterEco = await h.storage.getEconomy();
    assert.strictEqual(afterEco.focusCoins, 0);
    assert.strictEqual(afterEco.totalXP, 0);

    const completedRender = renderTimer({ session: completed.session, activeBonusRate: 0.05 });
    assert.ok(completedRender.text.includes('3m'));
    assert.ok(completedRender.text.includes('+0'));
    assert.ok(!completedRender.text.includes('+3.15'));
    assert.ok(!completedRender.html.includes('data-testid="outcome-coin-bonus-chip"'));
  } finally {
    Date.now = realDateNow;
  }
});

test('UX-4 Mid-Session Building Bonus Sync: PopupShell propagates live civBonusRate to Running TimerView and final settlement matches', async () => {
  let activeBonuses: CoinBonus[] = [];
  const h = createBackendHarness(() => activeBonuses);
  const profile = await h.profileManager.createProfile('MidSession', []);

  // 1. Start 5m Countdown with 0% bonus
  const running = await h.coordinator.startSession('COUNTDOWN', 5, profile.id);
  const render0 = stripHtml(
    renderToString(
      React.createElement(PopupShell, {
        onToggleLanguage: async () => {},
        session: running,
        economy: { focusCoins: 100, totalXP: 200, level: 2 },
        activeProfile: profile,
        profiles: [profile],
        todayStats: null,
        lifetimeFocusMinutes: 0,
        isBlockingActive: true,
        isSessionActive: true,
        civEra: 'STONE_AGE',
        civBonusRate: 0,
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
      })
    )
  );
  assert.ok(render0.includes('7.5 Coin') && !render0.includes('+5%'));

  // 2. Place +5% building mid-session -> PopupShell updates live display to 7.88 [+5%]
  activeBonuses = [{ id: 'b-mid', source: 'BUILDING', rate: 0.05 }];
  const render5 = stripHtml(
    renderToString(
      React.createElement(PopupShell, {
        onToggleLanguage: async () => {},
        session: running,
        economy: { focusCoins: 40, totalXP: 200, level: 2 },
        activeProfile: profile,
        profiles: [profile],
        todayStats: null,
        lifetimeFocusMinutes: 0,
        isBlockingActive: true,
        isSessionActive: true,
        civEra: 'STONE_AGE',
        civBonusRate: 0.05,
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
      })
    )
  );
  assert.ok(render5.includes('7.88 Coin') && render5.includes('+5%'));

  // 3. Complete Countdown -> backend credits 7.875 exact, Header shows rounded 47.88 (40 + 7.875 = 47.875)
  await h.storage.updateEconomy((e) => ({ ...e, focusCoins: 40 }));
  await h.coordinator.completeCountdown();
  const ecoAfter = await h.storage.getEconomy();
  assert.strictEqual(ecoAfter.focusCoins, 47.875);

  // 4. If bonus dropped back to 0% before another session starts, preview drops back too
  activeBonuses = [];
  const previewRemoved = getSessionRewardPreview({
    mode: 'COUNTDOWN',
    status: 'IDLE',
    targetMinutes: 5,
    coinBonusRate: 0,
  });
  assert.strictEqual(previewRemoved.coins, 7.5);
});

test('UX-4 Storage Precision Preservation: 8 consecutive 5m Countdowns (+7.875 each) accumulate to EXACT 63 Coins in economy and dailyStats', async () => {
  const h = createBackendHarness(() => [{ id: 'b-food', source: 'BUILDING', rate: 0.05 }]);
  const profile = await h.profileManager.createProfile('Precision', []);

  for (let i = 0; i < 8; i++) {
    await h.coordinator.startSession('COUNTDOWN', 5, profile.id);
    await h.coordinator.completeCountdown();
    await h.coordinator.resetSession();
  }

  const finalEco = await h.storage.getEconomy();
  assert.strictEqual(finalEco.focusCoins, 63, 'Must equal exact 8 * 7.875 = 63 without cumulative rounding drift');
  assert.strictEqual(finalEco.totalXP, 200);

  const stats = await h.storage.getDailyStats();
  const todayRecord = Object.values(stats)[0];
  assert.ok(todayRecord);
  assert.strictEqual(todayRecord.coinsEarned, 63);
  assert.strictEqual(todayRecord.xpEarned, 200);
});

// ============================================================================
// 5. ARCHITECTURAL BOUNDARY CHECK (STATIC IMPORT VERIFICATION)
// ============================================================================

test('UX-4 Architecture Boundary: core/reward, core/economy, storage NEVER import UI/notification formatters; sessionCoordinator NEVER imports ui/utils/formatters', () => {
  const rootDir = process.cwd();
  const coordinatorPath = path.join(rootDir, 'src', 'background', 'sessionCoordinator.ts');

  const coreAndStorageFiles: string[] = [];
  for (const dir of [
    path.join(rootDir, 'src', 'core', 'reward'),
    path.join(rootDir, 'src', 'core', 'economy'),
    path.join(rootDir, 'src', 'storage'),
  ]) {
    for (const entry of fs.readdirSync(dir)) {
      if (entry.endsWith('.ts')) {
        coreAndStorageFiles.push(path.join(dir, entry));
      }
    }
  }

  const forbiddenCorePatterns = [
    /ui\/utils\/formatters/,
    /notificationFormatter/,
    /\bformatRewardAmount\b/,
    /\bformatCoinAmount\b/,
    /\bformatXpAmount\b/,
    /\bformatDecimalMax2\b/,
  ];

  for (const filePath of coreAndStorageFiles) {
    const content = fs.readFileSync(filePath, 'utf8');
    for (const pattern of forbiddenCorePatterns) {
      assert.ok(
        !pattern.test(content),
        `Architectural boundary violation in ${path.relative(rootDir, filePath)}: matched ${pattern}`
      );
    }
  }

  const coordinatorContent = fs.readFileSync(coordinatorPath, 'utf8');
  const forbiddenCoordinatorPatterns = [
    /ui\/utils\/formatters/,
    /\bformatRewardAmount\b/,
    /\bformatCoinAmount\b/,
    /\bformatXpAmount\b/,
    /\bformatDecimalMax2\b/,
  ];
  for (const pattern of forbiddenCoordinatorPatterns) {
    assert.ok(
      !pattern.test(coordinatorContent),
      `Architectural boundary violation in sessionCoordinator.ts: matched ${pattern}`
    );
  }
});
