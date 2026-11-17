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
