import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import App from '../../src/App.tsx';
import { Navbar, ActiveTab } from '../../src/ui/components/Navbar.tsx';
import { I18nProvider } from '../../src/i18n/I18nContext.tsx';

test('Bottom Nav 5 Tabs (Stage D): renders exact 5 tabs in order with Map centered, widest, elevated, and 64px nav headroom', () => {
  const html = renderToString(
    React.createElement(Navbar, {
      activeTab: 'map',
      onChangeTab: () => {},
      isSessionActive: false,
    })
  );

  // Height 64px (56px bar + 8px top headroom) and 1fr 1fr 1.6fr 1fr 1fr grid
  assert.ok(html.includes('h-[64px]'), 'Nav outer container must reserve 64px height');
  assert.ok(html.includes('h-[56px]'), 'Nav bar surface must be 56px tall');
  assert.ok(
    html.includes('grid-cols-[1fr_1fr_1.6fr_1fr_1fr]'),
    'Grid must allocate 1.6fr to center Map tab'
  );
  assert.ok(html.includes('aria-label="Primary Navigation"'));
  assert.ok(html.includes('motion-reduce:transition-none'));

  // Exact order left -> right: Quests | Focus | Map | Awards | Stats
  const idxQuests = html.indexOf('data-testid="nav-tab-quests"');
  const idxFocus = html.indexOf('data-testid="nav-tab-focus"');
  const idxMap = html.indexOf('data-testid="nav-tab-map"');
  const idxAwards = html.indexOf('data-testid="nav-tab-awards"');
  const idxStats = html.indexOf('data-testid="nav-tab-stats"');

  assert.ok(
    idxQuests > -1 &&
      idxFocus > idxQuests &&
      idxMap > idxFocus &&
      idxAwards > idxMap &&
      idxStats > idxAwards,
    'Tabs must strictly follow Quests | Focus | Map | Awards | Stats order'
  );

  // Map is active & elevated (-translate-y-2) with data-active="true" & aria-current="page"
  assert.ok(html.includes('data-testid="nav-tab-map" data-active="true" aria-current="page"'));
  assert.ok(html.includes('-translate-y-2'));
  assert.ok(html.includes('data-testid="nav-tab-quests" data-active="false"'));
  assert.ok(html.includes('data-testid="nav-tab-focus" data-active="false"'));
  assert.ok(html.includes('data-testid="nav-tab-awards" data-active="false"'));
  assert.ok(html.includes('data-testid="nav-tab-stats" data-active="false"'));
});

test('Bottom Nav 5 Tabs (Stage D): Vietnamese tab order & labels match spec cleanly', () => {
  const html = renderToString(
    React.createElement(
      I18nProvider,
      { locale: 'vi' },
      React.createElement(Navbar, {
        activeTab: 'awards',
        onChangeTab: () => {},
        isSessionActive: false,
      })
    )
  );

  assert.ok(html.includes('aria-label="Điều hướng chính"'));
  const idxQuests = html.indexOf('Nhiệm vụ');
  const idxFocus = html.indexOf('Tập trung');
  const idxMap = html.indexOf('Bản đồ');
  const idxAwards = html.indexOf('Thành tựu');
  const idxStats = html.indexOf('Thống kê');

  assert.ok(
    idxQuests > -1 &&
      idxFocus > idxQuests &&
      idxMap > idxFocus &&
      idxAwards > idxMap &&
      idxStats > idxAwards,
    'VI tabs must follow Nhiệm vụ | Tập trung | Bản đồ | Thành tựu | Thống kê order'
  );
  assert.ok(html.includes('data-testid="nav-tab-awards" data-active="true" aria-current="page"'));
});

test('Bottom Nav 5 Tabs (Stage D): every tab supports single active elevation and App defaults to Map without <- Map in Header', () => {
  const tabs: ActiveTab[] = ['quests', 'focus', 'map', 'awards', 'stats'];
  for (const active of tabs) {
    const html = renderToString(
      React.createElement(Navbar, {
        activeTab: active,
        onChangeTab: () => {},
        isSessionActive: false,
      })
    );
    const activeMatches = html.match(/data-active="true"/g) ?? [];
    assert.equal(activeMatches.length, 1, `Expected exactly 1 active tab for "${active}"`);
    assert.ok(html.includes(`data-testid="nav-tab-${active}" data-active="true"`));
  }

  const appHtml = renderToString(React.createElement(App));
  assert.ok(appHtml.includes('data-testid="nav-tab-map" data-active="true"'));
  assert.ok(!appHtml.includes('data-testid="back-to-map-btn"'));
});
