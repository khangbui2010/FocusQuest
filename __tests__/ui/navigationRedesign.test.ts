import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import App from '../../src/App.tsx';
import { Header } from '../../src/ui/components/Header.tsx';
import { Navbar } from '../../src/ui/components/Navbar.tsx';
import { I18nProvider } from '../../src/i18n/I18nContext.tsx';
import { EN_MESSAGES } from '../../src/i18n/locales/en.ts';
import { VI_MESSAGES } from '../../src/i18n/locales/vi.ts';
import { SessionSnapshot } from '../../src/types/session.ts';

function makeSession(overrides: Partial<SessionSnapshot> = {}): SessionSnapshot {
  return {
    id: 'sess-nav-1',
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
    profileId: 'p1',
    ...overrides,
  };
}

test('Navigation Redesign (Stage D): App defaults to Your Civilization Map with 5 bottom tabs', () => {
  const html = renderToString(React.createElement(App));

  assert.ok(html.includes('Your Civilization'), 'Home heading must render immediately');
  assert.ok(html.includes('data-testid="bottom-navbar"'), 'Bottom navbar must be rendered');
  assert.ok(html.includes('data-testid="nav-tab-quests"'), 'Quests tab must be present');
  assert.ok(html.includes('data-testid="nav-tab-focus"'), 'Focus tab must be present');
  assert.ok(html.includes('data-testid="nav-tab-map"'), 'Map tab must be present');
  assert.ok(html.includes('data-testid="nav-tab-awards"'), 'Awards tab must be present');
  assert.ok(html.includes('data-testid="nav-tab-stats"'), 'Stats tab must be present');
  assert.ok(html.includes('Stone Age'), 'Header must default to Stone Age era badge');
  assert.ok(!html.includes('Daily Stats'), 'Legacy top-nav label Daily Stats must be removed');
  assert.ok(!html.includes('Allowlist'), 'Legacy top-nav label Allowlist must not appear on Map');
});

test('Navigation Redesign (Stage D): Compact Header shows EN/VI toggle, help-btn, Era badge, and omits idle profile chip and <- Map', () => {
  const html = renderToString(
    React.createElement(Header, {
      economy: { focusCoins: 120, totalXP: 450, level: 3 },
      activeProfile: { id: 'p1', name: 'Study & Research', allowedDomains: [], createdAt: 1, updatedAt: 1 },
      isBlockingActive: false,
      isSessionActive: false,
      era: 'STONE_AGE',
      activeView: 'map',
      onNavigateHome: () => {},
      onOpenHelp: () => {},
      onToggleLanguage: () => {},
    })
  );

  assert.ok(html.includes('data-testid="compact-header"'));
  assert.ok(html.includes('data-testid="header-era-badge"'));
  assert.ok(html.includes('Stone Age'));
  assert.ok(html.includes('data-testid="help-btn"'));
  assert.ok(html.includes('data-testid="language-toggle-btn"'));
  assert.ok(!html.includes('data-testid="back-to-map-btn"'), 'Back to Map button must not exist in Header');
  assert.ok(!html.includes('Study &amp; Research') && !html.includes('Study & Research'), 'Idle profile chip must be hidden from Header');
});

test('Navigation Redesign (Stage D): Header keeps brand home link without <- Map on sub-views and shows Shield when session active', () => {
  const html = renderToString(
    React.createElement(Header, {
      economy: { focusCoins: 200, totalXP: 600, level: 4 },
      activeProfile: { id: 'p1', name: 'Deep Work', allowedDomains: ['github.com'], createdAt: 1, updatedAt: 1 },
      isBlockingActive: true,
      isSessionActive: true,
      era: 'STONE_AGE',
      activeView: 'stats',
      onNavigateHome: () => {},
      onOpenProfiles: () => {},
      onOpenHelp: () => {},
    })
  );

  assert.ok(!html.includes('data-testid="back-to-map-btn"'), '<- Map button removed in Stage D 5-tab nav');
  assert.ok(html.includes('data-testid="header-brand-home"'), 'Brand home shortcut preserved');
  assert.ok(html.includes('data-testid="header-shield-badge"'));
  assert.ok(html.includes('Deep Work'));
});

test('Navigation Redesign (Stage D): Navbar displays status dot and i18n labels for Focus, Paused, and Rest states', () => {
  const runningHtml = renderToString(
    React.createElement(Navbar, {
      activeTab: 'map',
      onChangeTab: () => {},
      isSessionActive: true,
      session: makeSession({ status: 'RUNNING' }),
    })
  );
  assert.ok(runningHtml.includes('data-testid="nav-focus-status-dot"'));
  assert.ok(runningHtml.includes('Focus'));

  const pausedHtml = renderToString(
    React.createElement(Navbar, {
      activeTab: 'focus',
      onChangeTab: () => {},
      isSessionActive: true,
      session: makeSession({ status: 'PAUSED' }),
    })
  );
  assert.ok(pausedHtml.includes('data-testid="nav-focus-status-dot"'));
  assert.ok(pausedHtml.includes('Paused'));

  const restHtml = renderToString(
    React.createElement(Navbar, {
      activeTab: 'map',
      onChangeTab: () => {},
      isSessionActive: true,
      session: makeSession({
        mode: 'POMODORO_COUNTDOWN',
        status: 'RUNNING',
        pomodoroState: {
          currentCycle: 1,
          currentInterval: 1,
          currentPhase: 'SHORT_BREAK',
          phaseStartedAt: 1700000000000,
          phaseTargetDurationMinutes: 5,
          phaseTotalPauseMs: 0,
          completedFocusCount: 1,
          totalCompletedFocusMinutes: 25,
          accumulatedCoins: 37.5,
          accumulatedXp: 125,
        },
      }),
    })
  );
  assert.ok(restHtml.includes('data-testid="nav-focus-status-dot"'));
  assert.ok(restHtml.includes('Rest'));
});

test('Navigation Redesign (Stage D): Vietnamese localization renders translated Header and 5-tab Navbar labels with 100% EN/VI key parity', () => {
  assert.deepEqual(
    Object.keys(EN_MESSAGES).sort(),
    Object.keys(VI_MESSAGES).sort(),
    'EN and VI translation dictionaries must stay in 100% key parity'
  );

  const viHtml = renderToString(
    React.createElement(
      I18nProvider,
      { locale: 'vi' },
      React.createElement(
        React.Fragment,
        null,
        React.createElement(Header, {
          economy: { focusCoins: 50, totalXP: 100, level: 2 },
          era: 'STONE_AGE',
          activeView: 'quests',
          onNavigateHome: () => {},
          onOpenHelp: () => {},
        }),
        React.createElement(Navbar, {
          activeTab: 'quests',
          onChangeTab: () => {},
          isSessionActive: false,
        })
      )
    )
  );

  assert.ok(viHtml.includes('Thời đại Đồ Đá'));
  assert.ok(!viHtml.includes('← Bản đồ'));
  assert.ok(viHtml.includes('Nhiệm vụ'));
  assert.ok(viHtml.includes('Tập trung'));
  assert.ok(viHtml.includes('Bản đồ'));
  assert.ok(viHtml.includes('Thành tựu'));
  assert.ok(viHtml.includes('Thống kê'));
});

test('Navigation Redesign (Stage D): Navbar marks active tab aria-current and omits Quest unclaimed badge', () => {
  const questsHtml = renderToString(
    React.createElement(Navbar, {
      activeTab: 'quests',
      onChangeTab: () => {},
      isSessionActive: false,
    })
  );
  assert.ok(questsHtml.includes('aria-current="page"'));
  assert.ok(!questsHtml.includes('quest-unclaimed-badge'), 'Must not display unclaimed badge yet');

  const awardsHtml = renderToString(
    React.createElement(Navbar, {
      activeTab: 'awards',
      onChangeTab: () => {},
      isSessionActive: false,
    })
  );
  assert.ok(awardsHtml.includes('aria-current="page"'));
});
