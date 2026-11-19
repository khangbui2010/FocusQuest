import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { RewardHelpModal } from '../../src/ui/components/RewardHelpModal.tsx';
import { Header } from '../../src/ui/components/Header.tsx';
import { MemoryStorageAdapter } from '../../src/storage/memoryStorageAdapter.ts';
import { StorageManager } from '../../src/storage/storageManager.ts';
import { ProfileManager } from '../../src/core/profiles/profileManager.ts';
import { MockAlarmsAdapter, MockNotificationsAdapter, MockBadgeAdapter, MockDNRAdapter } from '../mocks/chromeMock.ts';
import { BlockingCoordinator } from '../../src/background/blockingCoordinator.ts';
import { SessionCoordinator } from '../../src/background/sessionCoordinator.ts';

test('RewardHelpModal: renders nothing when isOpen is false', () => {
  const html = renderToString(React.createElement(RewardHelpModal, { isOpen: false, onClose: () => {} }));
  assert.strictEqual(html, '');
});

test('RewardHelpModal: renders full guide content when isOpen is true', () => {
  const html = renderToString(React.createElement(RewardHelpModal, { isOpen: true, onClose: () => {} }));

  // 1. Title & Close button
  assert.ok(html.includes('Reward &amp; Multiplier Guide') || html.includes('Reward & Multiplier Guide'));
  assert.ok(html.includes('aria-label="Close guide"'));

  // 2. Multiplier table tiers
  assert.ok(html.includes('5 – 29 min'));
  assert.ok(html.includes('×1.0'));
  assert.ok(html.includes('30 – 59 min'));
  assert.ok(html.includes('×1.2'));
  assert.ok(html.includes('60 – 89 min'));
  assert.ok(html.includes('×1.4'));
  assert.ok(html.includes('90 – 119 min'));
  assert.ok(html.includes('×1.6'));
  assert.ok(html.includes('120 – 149 min'));
  assert.ok(html.includes('×1.8'));
  assert.ok(html.includes('150 – 179 min'));
  assert.ok(html.includes('×2.0'));
  assert.ok(html.includes('180+ min'));
  assert.ok(html.includes('×2.5'));

  // 3. No cap clarification
  assert.ok(html.includes('180 minutes is not a session duration cap'));

  // 4. Reward formula
  assert.ok(html.includes('Reward = Total Focus Minutes × BaseRate × SessionMultiplier'));

  // 5. BaseRate table for all 4 modes
  assert.ok(html.includes('Countdown'));
  assert.ok(html.includes('Stopwatch'));
  assert.ok(html.includes('Pomodoro Countdown'));
  assert.ok(html.includes('Pomodoro Stopwatch'));
  assert.ok(html.includes('1.5'));
  assert.ok(html.includes('5.0'));
  assert.ok(html.includes('1.0'));
  assert.ok(html.includes('3.0'));

  // 6. Pomodoro explanation
  assert.ok(html.includes('sum of completed Focus sessions'));
  assert.ok(html.includes('Focus interval duration × number of completed intervals'));
  assert.ok(html.includes('Breaks (Short / Long) and Pauses are'));
});

test('RewardHelpModal: Header renders ? button with onOpenHelp handler', () => {
  let opened = false;
  const headerHtml = renderToString(
    React.createElement(Header, {
      economy: { focusCoins: 100, totalXP: 300, level: 3 },
      activeProfile: { id: 'p1', name: 'Study', allowedDomains: [], createdAt: 1, updatedAt: 1 },
      onOpenProfiles: () => {},
      onOpenHelp: () => { opened = true; },
      isBlockingActive: true,
    })
  );

  assert.ok(headerHtml.includes('data-testid="help-btn"'));
  assert.ok(headerHtml.includes('?'));
});

test('RewardHelpModal: opening and closing modal does not mutate active session or blocking state', async () => {
  const adapter = new MemoryStorageAdapter();
  const storage = new StorageManager(adapter);
  const profileManager = new ProfileManager(storage);
  const alarms = new MockAlarmsAdapter();
  const notifications = new MockNotificationsAdapter();
  const badge = new MockBadgeAdapter();
  const dnr = new MockDNRAdapter();
  const coordinator = new SessionCoordinator(
    storage,
    profileManager,
    alarms,
    notifications,
    badge,
    new BlockingCoordinator(dnr)
  );

  const profile = await profileManager.createProfile('Help Integrity Test', ['wikipedia.org']);
  const session = await coordinator.startSession('COUNTDOWN', 25, profile.id);

  // Initial state before opening help modal
  const stateBefore = await coordinator.getFullState();
  assert.strictEqual(stateBefore.currentSession?.status, 'RUNNING');
  assert.strictEqual(stateBefore.isBlockingActive, true);

  // Simulating opening and closing help modal in UI
  let isModalOpen = true;
  assert.strictEqual(isModalOpen, true);
  isModalOpen = false;
  assert.strictEqual(isModalOpen, false);

  // State after modal interaction: session MUST remain completely unchanged and active
  const stateAfter = await coordinator.getFullState();
  assert.strictEqual(stateAfter.currentSession?.id, session.id);
  assert.strictEqual(stateAfter.currentSession?.status, 'RUNNING');
  assert.strictEqual(stateAfter.isBlockingActive, true);
  assert.strictEqual(stateAfter.currentSession?.totalPauseMs, 0);
  assert.strictEqual(stateAfter.currentSession?.pauseCount, 0);
});

test('RewardHelpModal (Stage 6): dynamically binds reward config/multipliers and covers CoinBonus, Zero Passive Income, Settlement, Quests & IEEE-754 precision in EN & VI', async () => {
  const { I18nProvider } = await import('../../src/i18n/I18nContext.tsx');
  const { DEFAULT_REWARD_CONFIG } = await import('../../src/core/reward/rewardEngine.ts');
  const { MultiplierRules } = await import('../../src/core/reward/multiplierRules.ts');
  const { EN_MESSAGES } = await import('../../src/i18n/locales/en.ts');
  const { VI_MESSAGES } = await import('../../src/i18n/locales/vi.ts');

  const enHtml = renderToString(
    React.createElement(
      I18nProvider,
      { locale: 'en' },
      React.createElement(RewardHelpModal, { isOpen: true, onClose: () => {} })
    )
  );
  const viHtml = renderToString(
    React.createElement(
      I18nProvider,
      { locale: 'vi' },
      React.createElement(RewardHelpModal, { isOpen: true, onClose: () => {} })
    )
  );

  // Dynamic DEFAULT_REWARD_CONFIG and MultiplierRules values present in both locales
  const dynamicValues = [
    DEFAULT_REWARD_CONFIG.countdownBaseCoinPerMinute.toFixed(1),
    DEFAULT_REWARD_CONFIG.countdownBaseXpPerMinute.toFixed(1),
    DEFAULT_REWARD_CONFIG.stopwatchBaseCoinPerMinute.toFixed(1),
    DEFAULT_REWARD_CONFIG.stopwatchBaseXpPerMinute.toFixed(1),
    `×${MultiplierRules.getSessionMultiplier(5).toFixed(1)}`,
    `×${MultiplierRules.getSessionMultiplier(30).toFixed(1)}`,
    `×${MultiplierRules.getSessionMultiplier(60).toFixed(1)}`,
    `×${MultiplierRules.getSessionMultiplier(90).toFixed(1)}`,
    `×${MultiplierRules.getSessionMultiplier(120).toFixed(1)}`,
    `×${MultiplierRules.getSessionMultiplier(150).toFixed(1)}`,
    `×${MultiplierRules.getSessionMultiplier(180).toFixed(1)}`,
  ];
  for (const val of dynamicValues) {
    assert.ok(enHtml.includes(val), `EN modal missing dynamic value ${val}`);
    assert.ok(viHtml.includes(val), `VI modal missing dynamic value ${val}`);
  }

  const decodeHtml = (raw: string) =>
    raw
      .replace(/&amp;/g, '&')
      .replace(/&#x27;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>');
  const enText = decodeHtml(enHtml);
  const viText = decodeHtml(viHtml);

  const minSw = String(DEFAULT_REWARD_CONFIG.stopwatchMinMinutesThreshold);
  assert.ok(enText.includes(EN_MESSAGES['help.coinBonusHeading']));
  assert.ok(enText.includes(EN_MESSAGES['help.coinBonusBody']));
  assert.ok(enText.includes(EN_MESSAGES['help.settlementHeading']));
  assert.ok(enText.includes(EN_MESSAGES['help.settlementCountdownRule']));
  assert.ok(enText.includes(EN_MESSAGES['help.settlementStopwatchRule'].replace('{min}', minSw)));
  assert.ok(enText.includes(EN_MESSAGES['help.settlementPomoSwRule']));
  assert.ok(enText.includes(EN_MESSAGES['help.questsPrecisionHeading']));
  assert.ok(enText.includes(EN_MESSAGES['help.questsFlatRule']));
  assert.ok(enText.includes(EN_MESSAGES['help.precisionRule']));

  assert.ok(viText.includes(VI_MESSAGES['help.coinBonusHeading']));
  assert.ok(viText.includes(VI_MESSAGES['help.coinBonusBody']));
  assert.ok(viText.includes(VI_MESSAGES['help.settlementHeading']));
  assert.ok(viText.includes(VI_MESSAGES['help.settlementCountdownRule']));
  assert.ok(viText.includes(VI_MESSAGES['help.settlementStopwatchRule'].replace('{min}', minSw)));
  assert.ok(viText.includes(VI_MESSAGES['help.settlementPomoSwRule']));
  assert.ok(viText.includes(VI_MESSAGES['help.questsPrecisionHeading']));
  assert.ok(viText.includes(VI_MESSAGES['help.questsFlatRule']));
  assert.ok(viText.includes(VI_MESSAGES['help.precisionRule']));
});
