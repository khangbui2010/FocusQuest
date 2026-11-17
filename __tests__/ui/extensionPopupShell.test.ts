import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import App from '../../src/App.tsx';

/**
 * Regression: the AI Studio demo shell (marketing header, "Khung Chrome" /
 * "Popup 400px" toggles, install guide) must not be rendered inside the real
 * Chrome extension popup. Only the functional 400px popup UI belongs there.
 *
 * `isChromeExtension()` detects the live extension through
 * `chrome.runtime.sendMessage`, so a minimal stub is enough for SSR.
 */
test('Extension popup: live extension renders only the functional popup UI', () => {
  const globalWithChrome = globalThis as unknown as { chrome?: unknown };
  const previousChrome = globalWithChrome.chrome;
  globalWithChrome.chrome = { runtime: { sendMessage: () => {} } };

  try {
    const html = renderToString(React.createElement(App));

    // Demo/marketing shell must be absent.
    assert.ok(!html.includes('Khung Chrome'), 'demo view toggle must not be rendered');
    assert.ok(!html.includes('Popup 400px'), 'demo view toggle must not be rendered');
    assert.ok(!html.includes('Cài vào Chrome'), 'install guide must not be rendered');
    assert.ok(!html.includes('Interactive Preview'), 'preview badge must not be rendered');
    assert.ok(!html.includes('Manifest V3'), 'marketing header must not be rendered');

    // Functional popup UI must still be present.
    assert.ok(html.includes('Focus Quest'), 'popup header must remain');
    assert.ok(html.includes('Your Civilization'), 'default Map title must remain');
    assert.ok(html.includes('Quests'), 'Quests bottom tab must remain');
    assert.ok(html.includes('Focus'), 'Focus bottom tab must remain');
    assert.ok(html.includes('Map'), 'Map center bottom tab must remain');
    assert.ok(html.includes('Awards'), 'Awards bottom tab must remain');
    assert.ok(html.includes('Stats'), 'Stats bottom tab must remain');
    assert.ok(html.includes('data-testid="help-btn"'), 'reward help button must remain');
    assert.ok(html.includes('data-testid="music-mini-player"'), 'persistent music mini-player must render');
    assert.ok(!html.includes('data-testid="music-player-open-btn"'), 'Header music toggle button must not exist');
  } finally {
    if (previousChrome === undefined) {
      Reflect.deleteProperty(globalWithChrome, 'chrome');
    } else {
      globalWithChrome.chrome = previousChrome;
    }
  }
});
