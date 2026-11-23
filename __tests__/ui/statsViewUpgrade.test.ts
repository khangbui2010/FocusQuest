import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { StatsView } from '../../src/ui/components/StatsView.tsx';
import { PopupShell } from '../../src/App.tsx';
import {
  STREAK_ANALYSIS_STAT_ID,
  getUnlockingBuildingDefinition,
  hasFocusStatUnlock,
} from '../../src/ui/utils/focusStatUnlock.ts';
import {
  canStepPeriod,
  dayTrendToBars,
  formatMonthPeriodLabel,
  getCurrentKeyForMode,
  monthDaysToBars,
  stepStatsPeriod,
  yearMonthsToBars,
} from '../../src/ui/utils/statsPeriod.ts';
import {
  aggregateDayStats,
  aggregateMonthStats,
  aggregateYearStats,
  calculateFocusStreak,
} from '../../src/core/stats/statsAggregator.ts';
import { I18nProvider } from '../../src/i18n/I18nContext.tsx';
import { translate } from '../../src/i18n/translator.ts';
import { DailyStatRecord } from '../../src/types/storageSchema.ts';
import { BuildingInstance } from '../../src/core/civilization/buildingTypes.ts';
import { buildSimulatedDailyStats, sendExtensionMessage } from '../../src/ui/services/extensionClient.ts';

const enT = (key: Parameters<typeof translate>[1], params?: Parameters<typeof translate>[2]) =>
  translate('en', key, params);
const viT = (key: Parameters<typeof translate>[1], params?: Parameters<typeof translate>[2]) =>
  translate('vi', key, params);

function makeBuilding(definitionId: string, id = 'b-1'): BuildingInstance {
  return {
    id,
    definitionId,
    position: { x: 0, y: 0 },
    level: 1,
    placedAt: 1700000000000,
  };
}

test('Stage 5c Stats Period Navigation: steps across year boundaries, clamps strictly at today, and formats month/year bars', () => {
  const today = '2026-11-18';

  assert.equal(getCurrentKeyForMode('day', today), '2026-11-18');
  assert.equal(getCurrentKeyForMode('month', today), '2026-11');
  assert.equal(getCurrentKeyForMode('year', today), '2026');

  // Clamped at today
  assert.equal(canStepPeriod('day', '2026-11-18', 1, today), false);
  assert.equal(stepStatsPeriod('day', '2026-11-18', 1, today), '2026-11-18');
  assert.equal(canStepPeriod('month', '2026-11', 1, today), false);
  assert.equal(stepStatsPeriod('month', '2026-11', 1, today), '2026-11');
  assert.equal(canStepPeriod('year', '2026', 1, today), false);
  assert.equal(stepStatsPeriod('year', '2026', 1, today), '2026');

  // Stepping backwards & year boundary
  assert.equal(stepStatsPeriod('day', '2026-01-01', -1, today), '2025-12-31');
  assert.equal(stepStatsPeriod('month', '2026-01', -1, today), '2025-12');
  assert.equal(stepStatsPeriod('month', '2025-12', 1, today), '2026-01');
  assert.equal(stepStatsPeriod('year', '2026', -1, today), '2025');

  assert.equal(formatMonthPeriodLabel('2026-11', enT), 'Nov 2026');
  assert.equal(formatMonthPeriodLabel('2026-11', viT), 'Th11 2026');

  // Leap-year February (2024 -> 29 days) vs common-year February (2025 -> 28 days)
  const leapFeb = aggregateMonthStats(
    {
      '2024-02-29': {
        date: '2024-02-29',
        totalFocusMinutes: 50,
        completedSessions: 2,
        abandonedSessions: 0,
        coinsEarned: 75,
        xpEarned: 225,
      },
    },
    '2024-02'
  );
  assert.equal(monthDaysToBars(leapFeb, today).length, 29);

  const commonFeb = aggregateMonthStats({}, '2025-02');
  assert.equal(monthDaysToBars(commonFeb, today).length, 28);

  const daySum = aggregateDayStats(
    {
      '2026-11-18': {
        date: '2026-11-18',
        totalFocusMinutes: 30,
        completedSessions: 1,
        abandonedSessions: 0,
        coinsEarned: 36,
        xpEarned: 108,
      },
    },
    '2026-11-18'
  );
  const bars7 = dayTrendToBars(daySum);
  assert.equal(bars7.length, 7);
  assert.equal(bars7[6].isCurrent, true);

  const yearSum = aggregateYearStats({}, '2026');
  assert.equal(yearMonthsToBars(yearSum, '2026-11', viT).length, 12);
});

test('Stage 5c Focus Stat Unlock: checks FOCUS_STAT_UNLOCK catalog effect for Elder Hut', () => {
  const unlockDef = getUnlockingBuildingDefinition(STREAK_ANALYSIS_STAT_ID);
  assert.ok(unlockDef);
  assert.equal(unlockDef.id, 'stone_age_elder_hut');

  assert.equal(hasFocusStatUnlock([], STREAK_ANALYSIS_STAT_ID), false);
  assert.equal(
    hasFocusStatUnlock([makeBuilding('stone_age_campfire')], STREAK_ANALYSIS_STAT_ID),
    false
  );
  assert.equal(
    hasFocusStatUnlock([makeBuilding('stone_age_elder_hut')], STREAK_ANALYSIS_STAT_ID),
    true
  );
});

test('Stage 5c StatsView SSR: renders Day, Month, Year panels cleanly without NaN and gates Focus Streak by Elder Hut in EN & VI', () => {
  const today = '2026-11-18';
  const records: Record<string, DailyStatRecord> = buildSimulatedDailyStats(today);

  // 1. Day tab with Elder's Hut NOT built (locked streak)
  const dayLockedEn = renderToString(
    React.createElement(
      I18nProvider,
      { locale: 'en' },
      React.createElement(StatsView, {
        todayStats: records[today],
        buildings: [makeBuilding('stone_age_campfire')],
        initialAllDailyStats: records,
        initialPeriod: 'day',
        todayOverride: today,
      })
    )
  );
  assert.ok(dayLockedEn.includes('data-testid="stats-panel-day"'));
  assert.ok(dayLockedEn.includes('Last 7 Days'));
  assert.ok(dayLockedEn.includes('Coins &amp; XP above reflect completed Focus sessions only'));
  assert.ok(dayLockedEn.includes('data-testid="stats-focus-streak-card" data-unlocked="false"'));
  assert.ok(dayLockedEn.includes('Elder&#x27;s Hut'));
  assert.ok(!dayLockedEn.includes('data-testid="stats-focus-streak-current"'));
  assert.ok(!dayLockedEn.includes('NaN'));

  // 2. Day tab in VI with Elder's Hut BUILT (unlocked Focus Streak matching calculateFocusStreak)
  const expectedStreak = calculateFocusStreak(records, today);
  assert.ok(expectedStreak.current >= 5 && expectedStreak.longest >= 16);
  const dayUnlockedVi = renderToString(
    React.createElement(
      I18nProvider,
      { locale: 'vi' },
      React.createElement(StatsView, {
        todayStats: records[today],
        buildings: [makeBuilding('stone_age_elder_hut')],
        initialAllDailyStats: records,
        initialPeriod: 'day',
        todayOverride: today,
      })
    )
  );
  assert.ok(dayUnlockedVi.includes('data-testid="stats-focus-streak-card" data-unlocked="true"'));
  assert.ok(dayUnlockedVi.includes('Chuỗi Tập trung'));
  assert.ok(dayUnlockedVi.includes(`${expectedStreak.current} ngày`));
  assert.ok(dayUnlockedVi.includes(`${expectedStreak.longest} ngày`));

  // 3. Month tab (empty month -> completionRate null must render dash, never NaN)
  const emptyMonthEn = renderToString(
    React.createElement(
      I18nProvider,
      { locale: 'en' },
      React.createElement(StatsView, {
        todayStats: null,
        buildings: [],
        initialAllDailyStats: {},
        initialPeriod: 'month',
        initialPeriodKey: '2026-02',
        todayOverride: today,
      })
    )
  );
  assert.ok(emptyMonthEn.includes('data-testid="stats-panel-month"'));
  assert.ok(emptyMonthEn.includes('0/28'));
  assert.ok(emptyMonthEn.includes('—'));
  assert.ok(!emptyMonthEn.includes('NaN'));

  // 4. Year tab with data (12 bars, Best Month)
  const yearEn = renderToString(
    React.createElement(
      I18nProvider,
      { locale: 'en' },
      React.createElement(StatsView, {
        todayStats: records[today],
        buildings: [makeBuilding('stone_age_elder_hut')],
        initialAllDailyStats: records,
        initialPeriod: 'year',
        initialPeriodKey: '2026',
        todayOverride: today,
      })
    )
  );
  assert.ok(yearEn.includes('data-testid="stats-panel-year"'));
  assert.ok(yearEn.includes('Yearly Focus Summary'));
  assert.ok(yearEn.includes('data-testid="stats-year-best-month"'));
  assert.equal((yearEn.match(/data-bar-key="/g) ?? []).length, 12);

  // 5. Locked VI hint shows localized Lều Trưởng lão
  const lockedVi = renderToString(
    React.createElement(
      I18nProvider,
      { locale: 'vi' },
      React.createElement(StatsView, {
        todayStats: records[today],
        buildings: [],
        initialAllDailyStats: records,
        todayOverride: today,
      })
    )
  );
  assert.ok(lockedVi.includes('Lều Trưởng lão'));
  assert.ok(lockedVi.includes('data-unlocked="false"'));
});

test('Stage 5c PopupShell & Simulator: passes civBuildings to StatsView and GET_DAILY_STATS returns historical map', async () => {
  const res = await sendExtensionMessage<Record<string, DailyStatRecord>>({
    action: 'GET_DAILY_STATS',
  });
  assert.equal(res.success, true);
  assert.ok(res.data && Object.keys(res.data).length >= 250);

  const shellWithElderHut = renderToString(
    React.createElement(PopupShell, {
      onToggleLanguage: async () => {},
      session: null,
      economy: { focusCoins: 100, totalXP: 200, level: 2 },
      activeProfile: null,
      profiles: [],
      todayStats: {
        date: '2026-11-18',
        totalFocusMinutes: 50,
        completedSessions: 2,
        abandonedSessions: 0,
        coinsEarned: 100,
        xpEarned: 250,
      },
      lifetimeFocusMinutes: 100,
      isBlockingActive: false,
      isSessionActive: false,
      civEra: 'STONE_AGE',
      civBuildings: [makeBuilding('stone_age_elder_hut')],
      settings: { soundEnabled: false, notificationsEnabled: true, language: 'en' },
      isLoading: false,
      activeTab: 'stats',
      setActiveTab: () => {},
      isHelpOpen: false,
      setIsHelpOpen: () => {},
      isProfileSheetOpen: false,
      setIsProfileSheetOpen: () => {},
      isMusicExpanded: false,
      onToggleMusicExpanded: async () => {},
      musicState: {
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
      },
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
  );
  assert.ok(shellWithElderHut.includes('data-testid="stats-focus-streak-card" data-unlocked="true"'));
});
