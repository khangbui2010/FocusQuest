import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStorageAdapter } from '../../src/storage/memoryStorageAdapter.ts';
import { StorageManager } from '../../src/storage/storageManager.ts';
import { ProfileManager } from '../../src/core/profiles/profileManager.ts';
import {
  MockAlarmsAdapter,
  MockNotificationsAdapter,
  MockBadgeAdapter,
  MockDNRAdapter,
  MockTabsAdapter,
} from '../mocks/chromeMock.ts';
import { BlockingCoordinator } from '../../src/background/blockingCoordinator.ts';
import {
  SessionCoordinator,
  ALARM_NAMES,
  buildPauseAlarmName,
} from '../../src/background/sessionCoordinator.ts';

function createIntegrityTestHarness() {
  const localAdapter = new MemoryStorageAdapter();
  const sessionAdapter = new MemoryStorageAdapter();
  const storage = new StorageManager(localAdapter, sessionAdapter);
  const profileManager = new ProfileManager(storage);
  const alarms = new MockAlarmsAdapter();
  const notifications = new MockNotificationsAdapter();
  const badge = new MockBadgeAdapter();
  const dnr = new MockDNRAdapter();
  const tabs = new MockTabsAdapter([
    { id: 10, url: 'https://youtube.com/watch?v=abc' },
    { id: 20, url: 'https://github.com/project' },
  ]);
  const blockingCoordinator = new BlockingCoordinator(dnr, tabs);

  const coordinator = new SessionCoordinator(
    storage,
    profileManager,
    alarms,
    notifications,
    badge,
    blockingCoordinator
  );

  return {
    localAdapter,
    sessionAdapter,
    storage,
    profileManager,
    alarms,
    notifications,
    badge,
    dnr,
    tabs,
    blockingCoordinator,
    coordinator,
  };
}

// =========================================================================
// TEST 1: Không chạy recovery ở top-level evaluation
// =========================================================================
test('Session Integrity [Test 1]: Top-level evaluation does not execute premature recovery', async () => {
  const h = createIntegrityTestHarness();
  const profile = await h.profileManager.createProfile('Study', ['wikipedia.org']);

  // Create an active session and clear session marker to mimic browser launch
  const session = await h.coordinator.startSession('COUNTDOWN', 30, profile.id);
  await h.storage.clearSessionLifecycleMarker();

  // If a coordinator simply exists without an event being dispatched,
  // session must remain unaltered, rules remain active, and no rewards processed
  const current = await h.storage.getCurrentSession();
  assert.strictEqual(current?.status, 'RUNNING');
  assert.strictEqual(current?.id, session.id);
  assert.strictEqual(current?.rewardProcessed, false);
  assert.strictEqual((await h.dnr.getDynamicRules()).length, 1);
});

// =========================================================================
// TEST 2: Browser Startup với marker bị thiếu
// =========================================================================
test('Session Integrity [Test 2]: Browser Startup with missing session marker preserves RUNNING session', async () => {
  const h = createIntegrityTestHarness();
  const profile = await h.profileManager.createProfile('Study', ['wikipedia.org']);

  const session = await h.coordinator.startSession('COUNTDOWN', 30, profile.id);
  // storage.session is cleared on browser exit
  await h.storage.clearSessionLifecycleMarker();
  assert.strictEqual(await h.storage.getSessionLifecycleMarker(), null);

  // Chrome starts up -> dispatches BROWSER_STARTUP
  await h.coordinator.handleLifecycleEvent({ reason: 'BROWSER_STARTUP', isBrowserStartup: true });

  const current = await h.storage.getCurrentSession();
  assert.strictEqual(current?.status, 'RUNNING', 'Session must not be interrupted on startup');
  assert.strictEqual(current?.rewardProcessed, false);

  // Lifecycle marker is re-established in session storage for this browser lifetime
  const newMarker = await h.storage.getSessionLifecycleMarker();
  assert.strictEqual(newMarker, session.id);

  // Website blocking and countdown alarm re-armed
  assert.strictEqual((await h.dnr.getDynamicRules()).length, 1);
  assert.ok(await h.alarms.get(ALARM_NAMES.COUNTDOWN_FINISH));
});

// =========================================================================
// TEST 3: Countdown hoàn tất khi Chrome đóng
// =========================================================================
test('Session Integrity [Test 3]: Countdown target elapsed while browser closed -> interrupted with 0 rewards (downtime not converted to focus)', async () => {
  const h = createIntegrityTestHarness();
  const profile = await h.profileManager.createProfile('Study', ['wikipedia.org']);

  await h.coordinator.startSession('COUNTDOWN', 30, profile.id);
  const now = Date.now();

  // Started 35 minutes ago, target 30 minutes -> browser was closed and target elapsed during downtime
  await h.storage.updateCurrentSession((curr) => ({
    ...curr!,
    startedAt: now - 35 * 60 * 1000,
    lastHeartbeatAt: now - 25 * 60 * 1000,
  }));
  await h.storage.clearSessionLifecycleMarker();

  // Browser launches: onStartup fires
  await h.coordinator.handleLifecycleEvent({ reason: 'BROWSER_STARTUP', isBrowserStartup: true });

  const session = await h.storage.getCurrentSession();
  assert.strictEqual(session?.status, 'INTERRUPTED');
  assert.strictEqual(session?.rewardProcessed, true);

  // Downtime must NEVER award coins or XP!
  const economy = await h.storage.getEconomy();
  assert.strictEqual(economy.focusCoins, 0);
  assert.strictEqual(economy.totalXP, 0);

  // Idempotency: subsequent startup call does not duplicate recovery
  await h.coordinator.handleLifecycleEvent({ reason: 'BROWSER_STARTUP', isBrowserStartup: true });
  const economyAfter = await h.storage.getEconomy();
  assert.strictEqual(economyAfter.focusCoins, 0);
});

// =========================================================================
// TEST 4: Extension Disable / Re-enable
// =========================================================================
test('Session Integrity [Test 4]: Extension Disable/Re-enable interrupts Countdown and Stopwatch with 0 rewards', async () => {
  // A. Countdown: 0 reward
  const h1 = createIntegrityTestHarness();
  const p1 = await h1.profileManager.createProfile('Study', ['wikipedia.org']);
  await h1.coordinator.startSession('COUNTDOWN', 30, p1.id);
  const now = Date.now();

  await h1.storage.updateCurrentSession((curr) => ({
    ...curr!,
    startedAt: now - 12 * 60 * 1000,
    lastHeartbeatAt: now - 2 * 60 * 1000, // 10 valid minutes
  }));
  await h1.storage.clearSessionLifecycleMarker();

  await h1.coordinator.handleLifecycleEvent({ reason: 'EXTENSION_RE_ENABLED' });

  const c1 = await h1.storage.getCurrentSession();
  assert.strictEqual(c1?.status, 'INTERRUPTED');
  assert.strictEqual(c1?.interruptedReason, 'EXTENSION_DISABLED');
  assert.strictEqual(c1?.rewardProcessed, true);
  assert.strictEqual(c1?.lastKnownValidFocusMinutes, 10);

  const eco1 = await h1.storage.getEconomy();
  assert.strictEqual(eco1.focusCoins, 0);
  assert.strictEqual(eco1.totalXP, 0);

  // B. Stopwatch: 0 reward when extension disabled
  const h2 = createIntegrityTestHarness();
  const p2 = await h2.profileManager.createProfile('Work', ['github.com']);
  await h2.coordinator.startSession('STOPWATCH', 0, p2.id);

  // 20 minutes elapsed: Stopwatch disabled -> 0 reward
  await h2.storage.updateCurrentSession((curr) => ({
    ...curr!,
    startedAt: now - 20 * 60 * 1000,
    lastHeartbeatAt: now,
  }));
  await h2.storage.clearSessionLifecycleMarker();

  await h2.coordinator.handleLifecycleEvent({ reason: 'EXTENSION_RE_ENABLED' });

  const s2 = await h2.storage.getCurrentSession();
  assert.strictEqual(s2?.status, 'INTERRUPTED');
  assert.strictEqual(s2?.interruptedReason, 'EXTENSION_DISABLED');
  assert.strictEqual(s2?.rewardProcessed, true);
  assert.strictEqual(s2?.lastKnownValidFocusMinutes, 20);

  const eco2 = await h2.storage.getEconomy();
  assert.strictEqual(eco2.focusCoins, 0, 'Stopwatch disabled earns 0 coins');
  assert.strictEqual(eco2.totalXP, 0, 'Stopwatch disabled earns 0 XP');
});

// =========================================================================
// TEST 5: Service Worker Wake-up
// =========================================================================
test('Session Integrity [Test 5]: Service Worker Wake-up with marker intact preserves session', async () => {
  const h = createIntegrityTestHarness();
  const profile = await h.profileManager.createProfile('Dev', ['github.com']);

  const session = await h.coordinator.startSession('COUNTDOWN', 25, profile.id);
  assert.strictEqual(await h.storage.getSessionLifecycleMarker(), session.id);

  // Service worker wakes up for alarm/message
  await h.coordinator.ensureInitialized();

  const current = await h.storage.getCurrentSession();
  assert.strictEqual(current?.status, 'RUNNING');
  assert.strictEqual(current?.rewardProcessed, false);
});

// =========================================================================
// TEST 6: Startup Event Deduplication
// =========================================================================
test('Session Integrity [Test 6]: Startup Event Deduplication (onStartup + onExtensionLoaded startup)', async () => {
  const h = createIntegrityTestHarness();
  const profile = await h.profileManager.createProfile('Study', ['wikipedia.org']);
  await h.coordinator.startSession('COUNTDOWN', 20, profile.id);
  const now = Date.now();

  await h.storage.updateCurrentSession((curr) => ({
    ...curr!,
    startedAt: now - 25 * 60 * 1000,
    lastHeartbeatAt: now,
  }));
  await h.storage.clearSessionLifecycleMarker();

  // Fire both events concurrently
  await Promise.all([
    h.coordinator.handleLifecycleEvent({ reason: 'BROWSER_STARTUP', isBrowserStartup: true }),
    h.coordinator.handleLifecycleEvent({ reason: 'BROWSER_STARTUP', isBrowserStartup: true }),
  ]);

  const session = await h.storage.getCurrentSession();
  assert.strictEqual(session?.status, 'INTERRUPTED');
  assert.strictEqual(session?.rewardProcessed, true);

  // 0 coins and 0 XP for downtime-interrupted countdown
  const economy = await h.storage.getEconomy();
  assert.strictEqual(economy.focusCoins, 0);
  assert.strictEqual(economy.totalXP, 0);

  const stats = await h.storage.getDailyStats();
  const todayStats = Object.values(stats)[0];
  assert.strictEqual(todayStats?.completedSessions, 0);
  assert.strictEqual(todayStats?.abandonedSessions, 1);
});

// =========================================================================
// TEST 7: Enable Event Deduplication
// =========================================================================
test('Session Integrity [Test 7]: Enable Event Deduplication (onEnabled + onExtensionLoaded enable)', async () => {
  const h = createIntegrityTestHarness();
  const profile = await h.profileManager.createProfile('Work', ['github.com']);
  await h.coordinator.startSession('STOPWATCH', 0, profile.id);
  const now = Date.now();

  await h.storage.updateCurrentSession((curr) => ({
    ...curr!,
    startedAt: now - 20 * 60 * 1000,
    lastHeartbeatAt: now,
  }));
  await h.storage.clearSessionLifecycleMarker();

  // Both events arrive nearly simultaneously
  await Promise.all([
    h.coordinator.handleLifecycleEvent({ reason: 'EXTENSION_RE_ENABLED' }),
    h.coordinator.handleLifecycleEvent({ reason: 'EXTENSION_RE_ENABLED' }),
  ]);

  const economy = await h.storage.getEconomy();
  assert.strictEqual(economy.focusCoins, 0, 'Stopwatch disabled earns 0 coins');
  assert.strictEqual(economy.totalXP, 0, 'Stopwatch disabled earns 0 XP');
});

// =========================================================================
// TEST 8: Marker bị thiếu nhưng lifecycle UNKNOWN
// =========================================================================
test('Session Integrity [Test 8]: Missing marker with UNKNOWN lifecycle does NOT interrupt or penalize', async () => {
  const h = createIntegrityTestHarness();
  const profile = await h.profileManager.createProfile('Dev', ['github.com']);
  const session = await h.coordinator.startSession('COUNTDOWN', 25, profile.id);
  await h.storage.clearSessionLifecycleMarker();

  // Business event / UNKNOWN lifecycle triggered
  await h.coordinator.handleLifecycleEvent({ reason: 'UNKNOWN' });

  const current = await h.storage.getCurrentSession();
  assert.strictEqual(current?.status, 'RUNNING', 'Session must remain RUNNING without penalty');
  assert.strictEqual(current?.rewardProcessed, false);

  // Marker re-established
  assert.strictEqual(await h.storage.getSessionLifecycleMarker(), session.id);

  const economy = await h.storage.getEconomy();
  assert.strictEqual(economy.focusCoins, 0);
});

// =========================================================================
// TEST 9: Extension Reload
// =========================================================================
test('Session Integrity [Test 9]: Extension Reload classifies reason EXTENSION_RELOADED and applies policy', async () => {
  const h = createIntegrityTestHarness();
  const profile = await h.profileManager.createProfile('Dev', ['github.com']);
  await h.coordinator.startSession('COUNTDOWN', 25, profile.id);
  await h.storage.clearSessionLifecycleMarker();

  await h.coordinator.handleLifecycleEvent({ reason: 'EXTENSION_RELOADED' });

  const session = await h.storage.getCurrentSession();
  assert.strictEqual(session?.status, 'INTERRUPTED');
  assert.strictEqual(session?.interruptedReason, 'EXTENSION_RELOADED');
  assert.strictEqual(session?.rewardProcessed, true);
});

// =========================================================================
// TEST 10: Extension Update
// =========================================================================
test('Session Integrity [Test 10]: Extension Update preserves active session and does NOT penalize', async () => {
  const h = createIntegrityTestHarness();
  const profile = await h.profileManager.createProfile('Dev', ['github.com']);
  const session = await h.coordinator.startSession('COUNTDOWN', 25, profile.id);
  await h.storage.clearSessionLifecycleMarker();

  await h.coordinator.handleLifecycleEvent({ reason: 'EXTENSION_UPDATED' });

  const current = await h.storage.getCurrentSession();
  assert.strictEqual(current?.status, 'RUNNING');
  assert.strictEqual(current?.rewardProcessed, false);
  assert.strictEqual(await h.storage.getSessionLifecycleMarker(), session.id);
});

// =========================================================================
// TEST 11: Concurrent Recovery
// =========================================================================
test('Session Integrity [Test 11]: Concurrent recovery calls execute through single transaction', async () => {
  const h = createIntegrityTestHarness();
  const profile = await h.profileManager.createProfile('Study', ['wikipedia.org']);
  await h.coordinator.startSession('COUNTDOWN', 30, profile.id);
  const now = Date.now();

  await h.storage.updateCurrentSession((curr) => ({
    ...curr!,
    startedAt: now - 35 * 60 * 1000,
    lastHeartbeatAt: now - 10 * 60 * 1000,
  }));
  await h.storage.clearSessionLifecycleMarker();

  // 4 concurrent recovery attempts from different entry points
  await Promise.all([
    h.coordinator.handleLifecycleEvent({ reason: 'BROWSER_STARTUP', isBrowserStartup: true }),
    h.coordinator.handleLifecycleEvent({ reason: 'BROWSER_STARTUP', isBrowserStartup: true }),
    h.coordinator.ensureInitialized(),
    h.coordinator.recoverSession({ isBrowserStartup: true }),
  ]);

  const session = await h.storage.getCurrentSession();
  assert.strictEqual(session?.status, 'INTERRUPTED');
  assert.strictEqual(session?.rewardProcessed, true);
  const economy = await h.storage.getEconomy();
  assert.strictEqual(economy.focusCoins, 0);
  assert.strictEqual(economy.totalXP, 0);
});

// =========================================================================
// TEST 12: Pause Browser Startup Recovery
// =========================================================================
test('Session Integrity [Test 12]: Pause on Browser Restart - under 5m restores PAUSED, over 5m auto-resumes', async () => {
  const now = Date.now();

  // Case A: Pause <= 5m (paused for 2m)
  const hA = createIntegrityTestHarness();
  const pA = await hA.profileManager.createProfile('Dev', ['github.com']);
  await hA.coordinator.startSession('COUNTDOWN', 25, pA.id);
  await hA.coordinator.pauseSession();

  await hA.storage.updateCurrentSession((curr) => ({
    ...curr!,
    currentPauseStartedAt: now - 2 * 60 * 1000,
  }));
  await hA.storage.clearSessionLifecycleMarker();

  await hA.coordinator.handleLifecycleEvent({ reason: 'BROWSER_STARTUP', isBrowserStartup: true });
  const currentA = await hA.storage.getCurrentSession();
  assert.strictEqual(currentA?.status, 'PAUSED');
  assert.strictEqual(hA.badge.text, 'PAUSE');

  // Case B: Pause > 5m (paused for 10m -> auto-resumed)
  const hB = createIntegrityTestHarness();
  const pB = await hB.profileManager.createProfile('Dev', ['github.com']);
  await hB.coordinator.startSession('COUNTDOWN', 25, pB.id);
  await hB.coordinator.pauseSession();

  await hB.storage.updateCurrentSession((curr) => ({
    ...curr!,
    currentPauseStartedAt: now - 10 * 60 * 1000,
  }));
  await hB.storage.clearSessionLifecycleMarker();

  await hB.coordinator.handleLifecycleEvent({ reason: 'BROWSER_STARTUP', isBrowserStartup: true });
  const currentB = await hB.storage.getCurrentSession();
  assert.strictEqual(currentB?.status, 'RUNNING');
  assert.strictEqual(currentB?.totalPauseMs, 5 * 60 * 1000); // capped at 5 mins
  assert.strictEqual(currentB?.pauseHistory.length, 1);
  assert.strictEqual((await hB.dnr.getDynamicRules()).length, 1); // blocking restored
});

// =========================================================================
// Additional Safety & Stale Alarm Tests
// =========================================================================
test('Session Integrity: Pause clears blocking immediately; Resume restores blocking and redirects tabs', async () => {
  const h = createIntegrityTestHarness();
  const profile = await h.profileManager.createProfile('Dev', ['github.com']);

  await h.coordinator.startSession('COUNTDOWN', 25, profile.id);
  assert.strictEqual((await h.dnr.getDynamicRules()).length, 1);
  assert.strictEqual((await h.coordinator.getFullState()).isBlockingActive, true);

  const paused = await h.coordinator.pauseSession();
  assert.strictEqual(paused.status, 'PAUSED');
  assert.ok(paused.pauseExpiresAt);

  assert.strictEqual((await h.dnr.getDynamicRules()).length, 0);
  assert.strictEqual((await h.coordinator.getFullState()).isBlockingActive, false);

  const resumed = await h.coordinator.resumeSession(false);
  assert.strictEqual(resumed.status, 'RUNNING');

  assert.strictEqual((await h.dnr.getDynamicRules()).length, 1);
  assert.strictEqual((await h.coordinator.getFullState()).isBlockingActive, true);
  assert.ok(h.tabs.updateHistory.some((u) => u.tabId === 10 && u.newUrl === '/blocked.html'));
});

test('Session Integrity: Stale Pause Alarm from different pause or session is safely ignored', async () => {
  const h = createIntegrityTestHarness();
  const profile = await h.profileManager.createProfile('Dev', ['github.com']);

  await h.coordinator.startSession('COUNTDOWN', 25, profile.id);
  const paused = await h.coordinator.pauseSession();

  const staleAlarm = buildPauseAlarmName(paused.id, 9999999);
  const unchanged = await h.coordinator.resumeSession(true, staleAlarm);

  assert.strictEqual(unchanged.status, 'PAUSED');
  assert.strictEqual(unchanged.pauseCount, 1);
});

// =========================================================================
// LIFECYCLE EVENT PRIORITY & DEDUPLICATION REGRESSION TESTS
// =========================================================================

// Test 1: Sequential Startup Events (onStartup -> onExtensionLoaded(startup))
test('Lifecycle Priority [Sequential]: onStartup then onExtensionLoaded(startup) does not duplicate rewards or daily stats', async () => {
  const h = createIntegrityTestHarness();
  const profile = await h.profileManager.createProfile('Study', ['wikipedia.org']);
  await h.coordinator.startSession('COUNTDOWN', 20, profile.id);
  const now = Date.now();

  await h.storage.updateCurrentSession((curr) => ({
    ...curr!,
    startedAt: now - 25 * 60 * 1000,
    lastHeartbeatAt: now,
  }));
  await h.storage.clearSessionLifecycleMarker();

  // 1. First event completes
  await h.coordinator.handleLifecycleEvent({ reason: 'BROWSER_STARTUP', isBrowserStartup: true });

  const s1 = await h.storage.getCurrentSession();
  assert.strictEqual(s1?.status, 'INTERRUPTED');
  assert.strictEqual(s1?.rewardProcessed, true);
  const eco1 = await h.storage.getEconomy();
  assert.strictEqual(eco1.focusCoins, 0);
  assert.strictEqual(eco1.totalXP, 0);

  // 2. Second event arrives sequentially after first event completed
  await h.coordinator.handleLifecycleEvent({ reason: 'BROWSER_STARTUP', isBrowserStartup: true });

  const s2 = await h.storage.getCurrentSession();
  assert.strictEqual(s2?.status, 'INTERRUPTED');
  const eco2 = await h.storage.getEconomy();
  assert.strictEqual(eco2.focusCoins, 0, 'Coins must not be awarded');
  assert.strictEqual(eco2.totalXP, 0, 'XP must not be awarded');

  const stats = await h.storage.getDailyStats();
  const todayStats = Object.values(stats)[0];
  assert.strictEqual(todayStats?.completedSessions, 0);
  assert.strictEqual(todayStats?.abandonedSessions, 1, 'Abandoned sessions must remain exactly 1');
});

// Test 2: Sequential Startup Events reversed (onExtensionLoaded(startup) -> onStartup)
test('Lifecycle Priority [Sequential]: onExtensionLoaded(startup) then onStartup does not duplicate recovery', async () => {
  const h = createIntegrityTestHarness();
  const profile = await h.profileManager.createProfile('Study', ['wikipedia.org']);
  await h.coordinator.startSession('COUNTDOWN', 20, profile.id);
  const now = Date.now();

  await h.storage.updateCurrentSession((curr) => ({
    ...curr!,
    startedAt: now - 25 * 60 * 1000,
    lastHeartbeatAt: now,
  }));
  await h.storage.clearSessionLifecycleMarker();

  // 1. onExtensionLoaded(startup) completes first
  await h.coordinator.handleLifecycleEvent({ reason: 'BROWSER_STARTUP' });

  // 2. onStartup arrives sequentially
  await h.coordinator.handleLifecycleEvent({ reason: 'BROWSER_STARTUP', isBrowserStartup: true });

  const session = await h.storage.getCurrentSession();
  assert.strictEqual(session?.status, 'INTERRUPTED');
  assert.strictEqual(session?.rewardProcessed, true);

  const eco = await h.storage.getEconomy();
  assert.strictEqual(eco.focusCoins, 0);
  assert.strictEqual(eco.totalXP, 0);

  const stats = await h.storage.getDailyStats();
  const todayStats = Object.values(stats)[0];
  assert.strictEqual(todayStats?.completedSessions, 0);
  assert.strictEqual(todayStats?.abandonedSessions, 1);
});

// Test 3: Sequential Reload vs Update (onInstalled(update) -> onExtensionLoaded(reload))
test('Lifecycle Priority [Sequential]: onInstalled(update) then onExtensionLoaded(reload) overrides update with reload penalty', async () => {
  const h = createIntegrityTestHarness();
  const profile = await h.profileManager.createProfile('Dev', ['github.com']);
  await h.coordinator.startSession('COUNTDOWN', 25, profile.id);
  await h.storage.clearSessionLifecycleMarker();

  // 1. onInstalled(update) finishes first, preserving the session
  await h.coordinator.handleLifecycleEvent({ reason: 'EXTENSION_UPDATED' });
  const midSession = await h.storage.getCurrentSession();
  assert.strictEqual(midSession?.status, 'RUNNING', 'Update must preserve active session initially');

  // 2. onExtensionLoaded(reload) arrives sequentially with higher precision signal
  await h.coordinator.handleLifecycleEvent({ reason: 'EXTENSION_RELOADED' });
  const finalSession = await h.storage.getCurrentSession();
  assert.strictEqual(finalSession?.status, 'INTERRUPTED', 'Reload must take precedence over update');
  assert.strictEqual(finalSession?.interruptedReason, 'EXTENSION_RELOADED');
  assert.strictEqual(finalSession?.rewardProcessed, true);

  const eco = await h.storage.getEconomy();
  assert.strictEqual(eco.focusCoins, 0, 'Countdown interrupted by reload yields 0 reward');
});

// Test 4: Sequential Reload vs Update reversed (onExtensionLoaded(reload) -> onInstalled(update))
test('Lifecycle Priority [Sequential]: onExtensionLoaded(reload) then onInstalled(update) preserves reload result', async () => {
  const h = createIntegrityTestHarness();
  const profile = await h.profileManager.createProfile('Dev', ['github.com']);
  await h.coordinator.startSession('COUNTDOWN', 25, profile.id);
  await h.storage.clearSessionLifecycleMarker();

  // 1. onExtensionLoaded(reload) finishes first
  await h.coordinator.handleLifecycleEvent({ reason: 'EXTENSION_RELOADED' });
  const midSession = await h.storage.getCurrentSession();
  assert.strictEqual(midSession?.status, 'INTERRUPTED');
  assert.strictEqual(midSession?.interruptedReason, 'EXTENSION_RELOADED');

  // 2. onInstalled(update) arrives sequentially after reload has completed
  await h.coordinator.handleLifecycleEvent({ reason: 'EXTENSION_UPDATED' });
  const finalSession = await h.storage.getCurrentSession();
  assert.strictEqual(finalSession?.status, 'INTERRUPTED', 'Update must NOT revive or revert interrupted session');
  assert.strictEqual(finalSession?.interruptedReason, 'EXTENSION_RELOADED');
});

// Test 5: Concurrent Reload vs Update (onInstalled(update) started first, onExtensionLoaded(reload) arrives in-flight)
test('Lifecycle Priority [Concurrent]: onInstalled(update) in-flight does NOT drop incoming onExtensionLoaded(reload)', async () => {
  const h = createIntegrityTestHarness();
  const profile = await h.profileManager.createProfile('Dev', ['github.com']);
  await h.coordinator.startSession('COUNTDOWN', 25, profile.id);
  await h.storage.clearSessionLifecycleMarker();

  // Fire both concurrently with EXTENSION_UPDATED initiated first
  const p1 = h.coordinator.handleLifecycleEvent({ reason: 'EXTENSION_UPDATED' });
  const p2 = h.coordinator.handleLifecycleEvent({ reason: 'EXTENSION_RELOADED' });

  await Promise.all([p1, p2]);

  const finalSession = await h.storage.getCurrentSession();
  assert.strictEqual(finalSession?.status, 'INTERRUPTED', 'Reload must prevail over in-flight update');
  assert.strictEqual(finalSession?.interruptedReason, 'EXTENSION_RELOADED');
  assert.strictEqual(finalSession?.rewardProcessed, true);
});

// Test 6: Concurrent Reload vs Update reversed (onExtensionLoaded(reload) in-flight, onInstalled(update) arrives in-flight)
test('Lifecycle Priority [Concurrent]: onExtensionLoaded(reload) in-flight safely subsumes incoming onInstalled(update)', async () => {
  const h = createIntegrityTestHarness();
  const profile = await h.profileManager.createProfile('Dev', ['github.com']);
  await h.coordinator.startSession('COUNTDOWN', 25, profile.id);
  await h.storage.clearSessionLifecycleMarker();

  // Fire both concurrently with EXTENSION_RELOADED initiated first
  const p1 = h.coordinator.handleLifecycleEvent({ reason: 'EXTENSION_RELOADED' });
  const p2 = h.coordinator.handleLifecycleEvent({ reason: 'EXTENSION_UPDATED' });

  await Promise.all([p1, p2]);

  const finalSession = await h.storage.getCurrentSession();
  assert.strictEqual(finalSession?.status, 'INTERRUPTED');
  assert.strictEqual(finalSession?.interruptedReason, 'EXTENSION_RELOADED');
  assert.strictEqual(finalSession?.rewardProcessed, true);
});

// Test 7: Sequential Disable/Enable Events (onEnabled -> onExtensionLoaded(enable))
test('Lifecycle Priority [Sequential]: onEnabled then onExtensionLoaded(enable) applies penalty exactly once', async () => {
  const h = createIntegrityTestHarness();
  const profile = await h.profileManager.createProfile('Work', ['github.com']);
  await h.coordinator.startSession('STOPWATCH', 0, profile.id);
  const now = Date.now();

  await h.storage.updateCurrentSession((curr) => ({
    ...curr!,
    startedAt: now - 20 * 60 * 1000,
    lastHeartbeatAt: now,
  }));
  await h.storage.clearSessionLifecycleMarker();

  // 1. onEnabled finishes first
  await h.coordinator.handleLifecycleEvent({ reason: 'EXTENSION_RE_ENABLED' });
  const eco1 = await h.storage.getEconomy();
  assert.strictEqual(eco1.focusCoins, 0, 'Stopwatch 20 min disabled = 0 coins');
  assert.strictEqual(eco1.totalXP, 0, 'Stopwatch 20 min disabled = 0 XP');

  // 2. onExtensionLoaded(enable) arrives sequentially
  await h.coordinator.handleLifecycleEvent({ reason: 'EXTENSION_RE_ENABLED' });
  const eco2 = await h.storage.getEconomy();
  assert.strictEqual(eco2.focusCoins, 0, 'Coins must remain 0');
  assert.strictEqual(eco2.totalXP, 0, 'XP must remain 0');

  const session = await h.storage.getCurrentSession();
  assert.strictEqual(session?.status, 'INTERRUPTED');
  assert.strictEqual(session?.interruptedReason, 'EXTENSION_DISABLED');
});

// Test 8: Sequential Disable/Enable Events reversed (onExtensionLoaded(enable) -> onEnabled)
test('Lifecycle Priority [Sequential]: onExtensionLoaded(enable) then onEnabled applies penalty exactly once', async () => {
  const h = createIntegrityTestHarness();
  const profile = await h.profileManager.createProfile('Work', ['github.com']);
  await h.coordinator.startSession('STOPWATCH', 0, profile.id);
  const now = Date.now();

  await h.storage.updateCurrentSession((curr) => ({
    ...curr!,
    startedAt: now - 20 * 60 * 1000,
    lastHeartbeatAt: now,
  }));
  await h.storage.clearSessionLifecycleMarker();

  // 1. onExtensionLoaded(enable) finishes first
  await h.coordinator.handleLifecycleEvent({ reason: 'EXTENSION_RE_ENABLED' });

  // 2. onEnabled arrives sequentially
  await h.coordinator.handleLifecycleEvent({ reason: 'EXTENSION_RE_ENABLED' });

  const eco = await h.storage.getEconomy();
  assert.strictEqual(eco.focusCoins, 0);
  assert.strictEqual(eco.totalXP, 0);

  const session = await h.storage.getCurrentSession();
  assert.strictEqual(session?.status, 'INTERRUPTED');
  assert.strictEqual(session?.interruptedReason, 'EXTENSION_DISABLED');
});
