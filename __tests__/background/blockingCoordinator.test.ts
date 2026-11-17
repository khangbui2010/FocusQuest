import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BlockingCoordinator, FOCUS_BLOCK_RULE_BASE_ID, BLOCKED_PAGE_PATH } from '../../src/background/blockingCoordinator.ts';
import { MockDNRAdapter } from '../mocks/chromeMock.ts';
import { FocusProfile } from '../../src/types/profiles.ts';

test('BlockingCoordinator: empty allowlist creates rule blocking all external web pages', async () => {
  const dnr = new MockDNRAdapter();
  const coordinator = new BlockingCoordinator(dnr);

  const emptyProfile: FocusProfile = {
    id: 'p1',
    name: 'Empty Profile',
    allowedDomains: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  await coordinator.applyAllowlistRules(emptyProfile);

  const rules = await dnr.getDynamicRules();
  assert.strictEqual(rules.length, 1);
  assert.strictEqual(rules[0].id, FOCUS_BLOCK_RULE_BASE_ID);
  assert.strictEqual(rules[0].action.redirect?.extensionPath, BLOCKED_PAGE_PATH);
  assert.strictEqual(rules[0].condition.excludedRequestDomains, undefined, 'No domains excluded when allowlist is empty');
});

test('BlockingCoordinator: allowlist with domains populates excludedRequestDomains properly', async () => {
  const dnr = new MockDNRAdapter();
  const coordinator = new BlockingCoordinator(dnr);

  const studyProfile: FocusProfile = {
    id: 'p2',
    name: 'Study',
    allowedDomains: ['wikipedia.org', '*.github.com', 'coursera.org'],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  await coordinator.applyAllowlistRules(studyProfile);

  const rules = await dnr.getDynamicRules();
  assert.strictEqual(rules.length, 1);
  const excluded = rules[0].condition.excludedRequestDomains;
  assert.ok(Array.isArray(excluded));
  assert.deepStrictEqual(excluded, ['wikipedia.org', 'github.com', 'coursera.org']);
});

test('BlockingCoordinator: clearBlockingRules removes all active DNR rules', async () => {
  const dnr = new MockDNRAdapter();
  const coordinator = new BlockingCoordinator(dnr);

  const profile: FocusProfile = {
    id: 'p3',
    name: 'Test',
    allowedDomains: ['wikipedia.org'],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  await coordinator.applyAllowlistRules(profile);
  assert.strictEqual((await dnr.getDynamicRules()).length, 1);

  await coordinator.clearBlockingRules();
  assert.strictEqual((await dnr.getDynamicRules()).length, 0);
});

test('BlockingCoordinator: reconcile activates rules for RUNNING and clears for PAUSED/idle/completed', async () => {
  const dnr = new MockDNRAdapter();
  const coordinator = new BlockingCoordinator(dnr);

  const profile: FocusProfile = {
    id: 'p4',
    name: 'Test',
    allowedDomains: ['stackoverflow.com'],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  // When RUNNING -> rules applied
  await coordinator.reconcile('RUNNING', profile);
  assert.strictEqual((await dnr.getDynamicRules()).length, 1);

  // When PAUSED -> rules cleared (pause allows full website access)
  await coordinator.reconcile('PAUSED', profile);
  assert.strictEqual((await dnr.getDynamicRules()).length, 0);

  // When COMPLETED -> rules cleared
  await coordinator.reconcile('COMPLETED', profile);
  assert.strictEqual((await dnr.getDynamicRules()).length, 0);

  // When null / IDLE -> rules cleared
  await coordinator.reconcile(null, profile);
  assert.strictEqual((await dnr.getDynamicRules()).length, 0);
});

import { MockTabsAdapter } from '../mocks/chromeMock.ts';

test('BlockingCoordinator: redirectAlreadyOpenBlockedTabs redirects non-allowlisted tabs and leaves allowlisted tabs alone', async () => {
  const dnr = new MockDNRAdapter();
  const tabs = new MockTabsAdapter([
    { id: 1, url: 'https://en.wikipedia.org/wiki/Science' }, // Allowlisted
    { id: 2, url: 'https://www.youtube.com/watch?v=123' },   // Blocked
    { id: 3, url: 'https://reddit.com/r/programming' },      // Blocked
    { id: 4, url: 'chrome://extensions' },                   // Internal Chrome page -> MUST NOT TOUCH
    { id: 5, url: 'about:blank' },                           // Internal page -> MUST NOT TOUCH
  ]);
  const coordinator = new BlockingCoordinator(dnr, tabs);

  const profile: FocusProfile = {
    id: 'p-study',
    name: 'Study',
    allowedDomains: ['wikipedia.org'],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const redirectedCount = await coordinator.redirectAlreadyOpenBlockedTabs(profile);

  // Exactly 2 tabs (youtube, reddit) should be redirected
  assert.strictEqual(redirectedCount, 2);
  assert.strictEqual(tabs.updateHistory.length, 2);
  assert.deepStrictEqual(tabs.updateHistory.map((u) => u.tabId), [2, 3]);

  // Tab 1 remains on wikipedia
  assert.strictEqual(tabs.tabs.find((t) => t.id === 1)?.url, 'https://en.wikipedia.org/wiki/Science');
  // Tab 2 and Tab 3 redirected to blocked.html
  assert.strictEqual(tabs.tabs.find((t) => t.id === 2)?.url, BLOCKED_PAGE_PATH);
  assert.strictEqual(tabs.tabs.find((t) => t.id === 3)?.url, BLOCKED_PAGE_PATH);
  // Tab 4 and 5 remain unchanged
  assert.strictEqual(tabs.tabs.find((t) => t.id === 4)?.url, 'chrome://extensions');
  assert.strictEqual(tabs.tabs.find((t) => t.id === 5)?.url, 'about:blank');
});

test('BlockingCoordinator: redirectAlreadyOpenBlockedTabs handles empty allowlist by redirecting all external tabs', async () => {
  const dnr = new MockDNRAdapter();
  const tabs = new MockTabsAdapter([
    { id: 10, url: 'https://github.com' },
    { id: 11, url: 'https://news.ycombinator.com' },
    { id: 12, url: 'chrome://settings' },
  ]);
  const coordinator = new BlockingCoordinator(dnr, tabs);

  const emptyProfile: FocusProfile = {
    id: 'p-strict',
    name: 'Strict Block',
    allowedDomains: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const count = await coordinator.redirectAlreadyOpenBlockedTabs(emptyProfile);
  assert.strictEqual(count, 2);
  assert.strictEqual(tabs.tabs.find((t) => t.id === 10)?.url, BLOCKED_PAGE_PATH);
  assert.strictEqual(tabs.tabs.find((t) => t.id === 11)?.url, BLOCKED_PAGE_PATH);
  assert.strictEqual(tabs.tabs.find((t) => t.id === 12)?.url, 'chrome://settings');
});

test('BlockingCoordinator: DNR rule condition specifies strictly main_frame, preserving embedded content (iframes, audio, media, CDN)', async () => {
  const dnr = new MockDNRAdapter();
  const coordinator = new BlockingCoordinator(dnr);
  const profile: FocusProfile = {
    id: 'p-main-frame-only',
    name: 'Main Frame Only',
    allowedDomains: ['perplexity.ai'],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  await coordinator.applyAllowlistRules(profile);
  const rules = await dnr.getDynamicRules();
  assert.strictEqual(rules.length, 1);
  // Strictly main_frame only: does NOT block sub_frame, media, audio, images, or CDNs
  assert.deepStrictEqual(rules[0].condition.resourceTypes, ['main_frame']);
  assert.strictEqual(rules[0].condition.resourceTypes.includes('sub_frame' as any), false, 'sub_frame must NOT be blocked by DNR');
});

test('BlockingCoordinator: handleTabUpdate redirects non-allowlisted tab and preserves allowlisted and internal tabs', async () => {
  const dnr = new MockDNRAdapter();
  const tabs = new MockTabsAdapter([
    { id: 20, url: 'https://www.perplexity.ai' },
    { id: 21, url: 'https://www.facebook.com' },
    { id: 22, url: 'chrome://extensions' },
  ]);
  const coordinator = new BlockingCoordinator(dnr, tabs);

  const profile: FocusProfile = {
    id: 'p-research',
    name: 'Research Profile',
    allowedDomains: ['perplexity.ai'],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  // Case 1: Tab navigates to Facebook (from Perplexity search link) -> MUST REDIRECT
  const redirected1 = await coordinator.handleTabUpdate(
    21,
    { status: 'loading', url: 'https://www.facebook.com/watch' },
    tabs.tabs.find((t) => t.id === 21)!,
    profile
  );
  assert.strictEqual(redirected1, true);
  assert.strictEqual(tabs.tabs.find((t) => t.id === 21)?.url, BLOCKED_PAGE_PATH);

  // Case 2: Tab navigates to another page on Perplexity (allowlisted) -> MUST NOT REDIRECT
  const redirected2 = await coordinator.handleTabUpdate(
    20,
    { status: 'loading', url: 'https://www.perplexity.ai/search?q=quantum' },
    tabs.tabs.find((t) => t.id === 20)!,
    profile
  );
  assert.strictEqual(redirected2, false);
  assert.strictEqual(tabs.tabs.find((t) => t.id === 20)?.url, 'https://www.perplexity.ai');

  // Case 3: Tab navigates to internal page chrome:// -> MUST NOT REDIRECT
  const redirected3 = await coordinator.handleTabUpdate(
    22,
    { status: 'loading', url: 'chrome://extensions' },
    tabs.tabs.find((t) => t.id === 22)!,
    profile
  );
  assert.strictEqual(redirected3, false);
  assert.strictEqual(tabs.tabs.find((t) => t.id === 22)?.url, 'chrome://extensions');

  // Case 4: Tab navigates to YouTube (not in allowlist) -> MUST REDIRECT
  tabs.tabs.push({ id: 23, url: 'about:blank' });
  const redirected4 = await coordinator.handleTabUpdate(
    23,
    { status: 'loading', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
    tabs.tabs.find((t) => t.id === 23)!,
    profile
  );
  assert.strictEqual(redirected4, true);
  assert.strictEqual(tabs.tabs.find((t) => t.id === 23)?.url, BLOCKED_PAGE_PATH);

  // Case 5: Tab is already on blocked page -> MUST NOT REDIRECT AGAIN (no redirect loop)
  const redirected5 = await coordinator.handleTabUpdate(
    23,
    { status: 'complete', url: BLOCKED_PAGE_PATH },
    tabs.tabs.find((t) => t.id === 23)!,
    profile
  );
  assert.strictEqual(redirected5, false);
});

test('BlockingCoordinator: Embedded content preservation guarantees', async () => {
  const dnr = new MockDNRAdapter();
  const coordinator = new BlockingCoordinator(dnr);

  const profile: FocusProfile = {
    id: 'p-study-media',
    name: 'Study with Media',
    allowedDomains: ['studyhub.io', 'perplexity.ai'],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  await coordinator.applyAllowlistRules(profile);
  const rules = await dnr.getDynamicRules();
  assert.strictEqual(rules.length, 1);
  const rule = rules[0];

  // 1. Condition only intercepts main_frame standalone page loads
  assert.deepStrictEqual(rule.condition.resourceTypes, ['main_frame']);

  // 2. Embedded iframe (sub_frame) like a YouTube embed on studyhub.io is NOT targeted
  assert.strictEqual(rule.condition.resourceTypes.includes('sub_frame' as any), false);

  // 3. External media/audio (e.g. lofi music audio stream or CDN images) is NOT targeted
  assert.strictEqual(rule.condition.resourceTypes.includes('media' as any), false);
  assert.strictEqual(rule.condition.resourceTypes.includes('image' as any), false);
  assert.strictEqual(rule.condition.resourceTypes.includes('stylesheet' as any), false);
  assert.strictEqual(rule.condition.resourceTypes.includes('script' as any), false);
});
