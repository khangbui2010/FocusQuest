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
} from '../../src/background/sessionCoordinator.ts';

function createLifecycleTestHarness() {
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
// TEST 1: Periodic Heartbeat Alarm Creation & Deduplication
// =========================================================================
test('Lifecycle Recovery: Heartbeat alarm is scheduled with 1-min period and deduplicated', async () => {
  const h = createLifecycleTestHarness();
  const profile = await h.profileManager.createProfile('Study', ['wikipedia.org']);

  const session = await h.coordinator.startSession('STOPWATCH', 0, profile.id);
  assert.strictEqual(session.status, 'RUNNING');
  assert.strictEqual(session.accumulatedFocusMs, 0);
  assert.ok(session.lastCheckpointAt);

  // Heartbeat alarm must be present with periodInMinutes: 1
  const heartbeatAlarm = await h.alarms.get(ALARM_NAMES.HEARTBEAT);
  assert.ok(heartbeatAlarm, 'Heartbeat alarm must be registered');
  assert.strictEqual(heartbeatAlarm?.periodInMinutes, 1);

  // Calling ensureHeartbeatAlarm again should be idempotent
  await h.coordinator.ensureHeartbeatAlarm();
  const heartbeatAlarm2 = await h.alarms.get(ALARM_NAMES.HEARTBEAT);
  assert.ok(heartbeatAlarm2);
});

// =========================================================================
// TEST 2: Case A — Service Worker Suspend while Chrome is OPEN
// =========================================================================
test('Lifecycle Recovery [Case A]: SW suspend while Chrome is open preserves wall-clock elapsed focus', async () => {
  const h = createLifecycleTestHarness();
  const profile = await h.profileManager.createProfile('Code', ['github.com']);
  const session = await h.coordinator.startSession('STOPWATCH', 0, profile.id);

  // Marker remains in session storage because Chrome stayed open
  const marker = await h.storage.getSessionLifecycleMarker();
  assert.strictEqual(marker, session.id);

  // Advance time by 15 minutes
  const now = Date.now();
  await h.storage.updateCurrentSession((s) => ({
    ...s!,
    startedAt: now - 15 * 60 * 1000,
    lastCheckpointAt: now - 15 * 60 * 1000,
    lastHeartbeatAt: now - 15 * 60 * 1000,
  }));

  // SW wakes up due to event
  await h.coordinator.handleLifecycleEvent({ reason: 'SERVICE_WORKER_WAKE' });

  const current = await h.storage.getCurrentSession();
  assert.strictEqual(current?.status, 'RUNNING');
  assert.strictEqual(current?.id, session.id);

  // Process heartbeat alarm to checkpoint time
  await h.coordinator.processHeartbeat();

  const checkpointed = await h.storage.getCurrentSession();
  assert.strictEqual(checkpointed?.status, 'RUNNING');
  assert.ok((checkpointed?.accumulatedFocusMs ?? 0) >= 14 * 60 * 1000);

  // Finish stopwatch: reward should be awarded for full elapsed time
  const finishRes = await h.coordinator.finishStopwatch();
  assert.strictEqual(finishRes.session.status, 'COMPLETED');
  assert.ok(finishRes.coinsEarned > 0);
  assert.ok(finishRes.xpEarned > 0);
});

// =========================================================================
// TEST 3: Case B — Browser Closed / Crash during STOPWATCH (Downtime NEVER counted)
// =========================================================================
test('Lifecycle Recovery [Case B]: Browser crash/shutdown during STOPWATCH interrupts with 0 rewards and saves verified minutes', async () => {
  const h = createLifecycleTestHarness();
  const profile = await h.profileManager.createProfile('Study', ['wikipedia.org']);
  await h.coordinator.startSession('STOPWATCH', 0, profile.id);

  const now = Date.now();
  // Simulate 20 minutes of valid focus, checkpointed at minute 20
  // Then browser was closed for 3 hours (180 minutes of downtime)
  const validMs = 20 * 60 * 1000;
  await h.storage.updateCurrentSession((s) => ({
    ...s!,
    startedAt: now - 200 * 60 * 1000,
    lastCheckpointAt: now - 180 * 60 * 1000,
    lastHeartbeatAt: now - 180 * 60 * 1000,
    accumulatedFocusMs: validMs,
  }));

  // Browser exit wipes storage.session
  await h.storage.clearSessionLifecycleMarker();

  // Browser restarts!
  const recovered = await h.coordinator.handleLifecycleEvent({
    reason: 'BROWSER_STARTUP',
    isBrowserStartup: true,
  });

  assert.strictEqual(recovered?.status, 'INTERRUPTED');
  assert.strictEqual(recovered?.interruptedReason, 'BROWSER_CLOSED');
  assert.strictEqual(recovered?.lastKnownValidFocusMinutes, 20);
  assert.strictEqual(recovered?.rewardProcessed, true);

  // Economy must NOT receive coins or XP for downtime!
  const economy = await h.storage.getEconomy();
  assert.strictEqual(economy.focusCoins, 0, 'Downtime must never award coins');
  assert.strictEqual(economy.totalXP, 0, 'Downtime must never award XP');

  // Daily stats must log verified focus minutes (20 min)
  const stats = await h.storage.getDailyStats();
  const todayStats = stats[Object.keys(stats)[0]];
  assert.strictEqual(todayStats.totalFocusMinutes, 20, 'Verified focus minutes must be preserved in Daily Stats');
  assert.strictEqual(todayStats.completedSessions, 0);
  assert.strictEqual(todayStats.abandonedSessions, 1);
});

// =========================================================================
// TEST 4: Case B — Browser Closed during POMODORO STOPWATCH
// =========================================================================
test('Lifecycle Recovery [Case B]: Browser crash during POMODORO_STOPWATCH awards completed intervals and logs partial minutes', async () => {
  const h = createLifecycleTestHarness();
  const profile = await h.profileManager.createProfile('Work', ['github.com']);
  const pomoConfig = {
    focusDurationMinutes: 25,
    focusIntervalDurationMinutes: 25,
    shortBreakDurationMinutes: 5,
    longBreakDurationMinutes: 15,
    targetFocusSessions: 4,
    focusIntervalsPerCycle: 4,
    numberOfCycles: 3,
  };

  const started = await h.coordinator.startSession('POMODORO_STOPWATCH', 0, profile.id, pomoConfig);
  assert.strictEqual(started.status, 'RUNNING');

  const now = Date.now();
  // Simulate: 1 interval was completed (25 min, 25 coins, 75 XP)
  // Currently in Interval 2 FOCUS with 10 verified minutes checkpointed before browser crashed
  await h.storage.updateCurrentSession((s) => ({
    ...s!,
    startedAt: now - 120 * 60 * 1000,
    lastCheckpointAt: now - 60 * 60 * 1000,
    lastHeartbeatAt: now - 60 * 60 * 1000,
    accumulatedFocusMs: 35 * 60 * 1000,
    pomodoroState: {
      currentPhase: 'FOCUS',
      currentInterval: 2,
      currentCycle: 1,
      completedFocusCount: 1,
      phaseStartedAt: now - 70 * 60 * 1000,
      phaseTargetDurationMinutes: 25,
      phaseTotalPauseMs: 0,
      totalCompletedFocusMinutes: 25,
      accumulatedCoins: 25,
      accumulatedXp: 75,
    },
  }));

  // Browser closed -> storage.session wiped
  await h.storage.clearSessionLifecycleMarker();

  // Browser restarts
  const recovered = await h.coordinator.handleLifecycleEvent({
    reason: 'BROWSER_STARTUP',
    isBrowserStartup: true,
  });

  assert.strictEqual(recovered?.status, 'INTERRUPTED');
  assert.strictEqual(recovered?.interruptedReason, 'BROWSER_CLOSED');
  assert.strictEqual(recovered?.lastKnownValidFocusMinutes, 35); // 25 + 10 partial
  assert.strictEqual(recovered?.rewardProcessed, true);

  // Economy must receive rewards for completed interval (25 coins, 75 XP), but NOT for the incomplete interval or downtime!
  const economy = await h.storage.getEconomy();
  assert.strictEqual(economy.focusCoins, 25);
  assert.strictEqual(economy.totalXP, 75);

  // Daily stats must record total actual focus minutes (35 min)
  const stats = await h.storage.getDailyStats();
  const todayStats = stats[Object.keys(stats)[0]];
  assert.strictEqual(todayStats.totalFocusMinutes, 35);
  assert.strictEqual(todayStats.completedSessions, 1);
});

// =========================================================================
// TEST 5: Case C — Pause Duration Excluded from Checkpointing
// =========================================================================
test('Lifecycle Recovery [Case C]: Pause duration is excluded from focus checkpoints', async () => {
  const h = createLifecycleTestHarness();
  const profile = await h.profileManager.createProfile('Study', ['wikipedia.org']);
  await h.coordinator.startSession('STOPWATCH', 0, profile.id);

  const now = Date.now();
  // 5 minutes of focus
  await h.storage.updateCurrentSession((s) => ({
    ...s!,
    startedAt: now - 5 * 60 * 1000,
    lastCheckpointAt: now - 5 * 60 * 1000,
  }));

  // Pause session
  const paused = await h.coordinator.pauseSession();
  assert.strictEqual(paused.status, 'PAUSED');
  assert.ok((paused.accumulatedFocusMs ?? 0) >= 4.9 * 60 * 1000);
  const accumulatedAtPause = paused.accumulatedFocusMs;

  // Fire periodic heartbeat while paused
  await h.coordinator.processHeartbeat();

  const stillPaused = await h.storage.getCurrentSession();
  assert.strictEqual(stillPaused?.status, 'PAUSED');
  assert.strictEqual(
    stillPaused?.accumulatedFocusMs,
    accumulatedAtPause,
    'Heartbeat during pause must NOT increment accumulatedFocusMs'
  );
});

// =========================================================================
// TEST 6: Case D — Pomodoro Break Excluded from Checkpointing
// =========================================================================
test('Lifecycle Recovery [Case D]: Pomodoro break duration is excluded from focus checkpoints', async () => {
  const h = createLifecycleTestHarness();
  const profile = await h.profileManager.createProfile('Study', ['wikipedia.org']);
  const pomoConfig = {
    focusDurationMinutes: 25,
    focusIntervalDurationMinutes: 25,
    shortBreakDurationMinutes: 5,
    longBreakDurationMinutes: 15,
    targetFocusSessions: 4,
    focusIntervalsPerCycle: 4,
    numberOfCycles: 3,
  };

  await h.coordinator.startSession('POMODORO_STOPWATCH', 0, profile.id, pomoConfig);
  const now = Date.now();

  // Simulate currently in SHORT_BREAK with 25 minutes completed focus
  await h.storage.updateCurrentSession((s) => ({
    ...s!,
    accumulatedFocusMs: 25 * 60 * 1000,
    lastCheckpointAt: now - 3 * 60 * 1000,
    pomodoroState: {
      currentPhase: 'SHORT_BREAK',
      currentInterval: 1,
      currentCycle: 1,
      completedFocusCount: 1,
      phaseStartedAt: now - 3 * 60 * 1000,
      phaseTargetDurationMinutes: 5,
      phaseTotalPauseMs: 0,
      totalCompletedFocusMinutes: 25,
      accumulatedCoins: 25,
      accumulatedXp: 75,
    },
  }));

  // Heartbeat fires during break
  await h.coordinator.processHeartbeat();

  const sessionAfterBreakHeartbeat = await h.storage.getCurrentSession();
  assert.strictEqual(sessionAfterBreakHeartbeat?.status, 'RUNNING');
  assert.strictEqual(sessionAfterBreakHeartbeat?.pomodoroState?.currentPhase, 'SHORT_BREAK');
  assert.strictEqual(
    sessionAfterBreakHeartbeat?.accumulatedFocusMs,
    25 * 60 * 1000,
    'Break time must not be added to accumulatedFocusMs'
  );
});

// =========================================================================
// TEST 7: Idempotency of Startup Recovery
// =========================================================================
test('Lifecycle Recovery: Duplicate startup events do not duplicate stats or recovery processing', async () => {
  const h = createLifecycleTestHarness();
  const profile = await h.profileManager.createProfile('Study', ['wikipedia.org']);
  await h.coordinator.startSession('STOPWATCH', 0, profile.id);

  const now = Date.now();
  await h.storage.updateCurrentSession((s) => ({
    ...s!,
    startedAt: now - 60 * 60 * 1000,
    lastCheckpointAt: now - 50 * 60 * 1000,
    accumulatedFocusMs: 10 * 60 * 1000,
  }));
  await h.storage.clearSessionLifecycleMarker();

  // Event 1: chrome.runtime.onStartup
  const rec1 = await h.coordinator.handleLifecycleEvent({
    reason: 'BROWSER_STARTUP',
    isBrowserStartup: true,
  });
  assert.strictEqual(rec1?.status, 'INTERRUPTED');

  // Event 2: concurrent/sequential onExtensionLoaded(startup)
  const rec2 = await h.coordinator.handleLifecycleEvent({
    reason: 'BROWSER_STARTUP',
    isBrowserStartup: true,
  });
  assert.strictEqual(rec2?.status, 'INTERRUPTED');

  // Verify daily stats were logged exactly once
  const stats = await h.storage.getDailyStats();
  const todayStats = stats[Object.keys(stats)[0]];
  assert.strictEqual(todayStats.totalFocusMinutes, 10);
  assert.strictEqual(todayStats.abandonedSessions, 1);
});

// =========================================================================
// TEST 8: Pomodoro Countdown — Interrupted after 1/4 intervals completed
// =========================================================================
test('Lifecycle Recovery [P0]: Pomodoro Countdown closed after 1/4 intervals awards 0 Coins/XP and logs 25m to Daily Stats', async () => {
  const h = createLifecycleTestHarness();
  const profile = await h.profileManager.createProfile('Study', ['wikipedia.org']);
  const pomoConfig = {
    focusDurationMinutes: 25,
    focusIntervalDurationMinutes: 25,
    shortBreakDurationMinutes: 5,
    longBreakDurationMinutes: 15,
    targetFocusSessions: 4,
    focusIntervalsPerCycle: 4,
    numberOfCycles: 1,
  };

  await h.coordinator.startSession('POMODORO_COUNTDOWN', 100, profile.id, pomoConfig);
  const now = Date.now();

  // 1 of 4 intervals was completed (25 min focus). In Short Break or Interval 2 when browser closes.
  await h.storage.updateCurrentSession((s) => ({
    ...s!,
    startedAt: now - 35 * 60 * 1000,
    lastCheckpointAt: now - 10 * 60 * 1000,
    lastHeartbeatAt: now - 10 * 60 * 1000,
    accumulatedFocusMs: 25 * 60 * 1000,
    pomodoroState: {
      currentPhase: 'SHORT_BREAK',
      currentInterval: 1,
      currentCycle: 1,
      completedFocusCount: 1,
      phaseStartedAt: now - 10 * 60 * 1000,
      phaseTargetDurationMinutes: 5,
      phaseTotalPauseMs: 0,
      totalCompletedFocusMinutes: 25,
      accumulatedCoins: 37.5,
      accumulatedXp: 125,
    },
  }));
  await h.storage.clearSessionLifecycleMarker();

  // Browser startup recovery
  const recovered = await h.coordinator.handleLifecycleEvent({
    reason: 'BROWSER_STARTUP',
    isBrowserStartup: true,
  });

  assert.strictEqual(recovered?.status, 'INTERRUPTED');
  assert.strictEqual(recovered?.interruptedReason, 'BROWSER_CLOSED');
  assert.strictEqual(recovered?.rewardProcessed, true);

  // CRITICAL SPEC: Must be 0 Coins and 0 XP!
  const economy = await h.storage.getEconomy();
  assert.strictEqual(economy.focusCoins, 0, 'Incomplete Pomodoro Countdown must award 0 coins');
  assert.strictEqual(economy.totalXP, 0, 'Incomplete Pomodoro Countdown must award 0 XP');

  // Daily stats must log completed 25 focus minutes, but NOT marked as completed quest
  const stats = await h.storage.getDailyStats();
  const todayStats = stats[Object.keys(stats)[0]];
  assert.strictEqual(todayStats.totalFocusMinutes, 25);
  assert.strictEqual(todayStats.completedSessions, 0);
  assert.strictEqual(todayStats.abandonedSessions, 1);
  assert.strictEqual(todayStats.coinsEarned, 0);
  assert.strictEqual(todayStats.xpEarned, 0);
});

// =========================================================================
// TEST 9: Pomodoro Countdown — Interrupted after 3/4 intervals completed
// =========================================================================
test('Lifecycle Recovery [P0]: Pomodoro Countdown closed after 3/4 intervals awards 0 Coins/XP and logs 75m to Daily Stats', async () => {
  const h = createLifecycleTestHarness();
  const profile = await h.profileManager.createProfile('Study', ['wikipedia.org']);
  const pomoConfig = {
    focusDurationMinutes: 25,
    focusIntervalDurationMinutes: 25,
    shortBreakDurationMinutes: 5,
    longBreakDurationMinutes: 15,
    targetFocusSessions: 4,
    focusIntervalsPerCycle: 4,
    numberOfCycles: 1,
  };

  await h.coordinator.startSession('POMODORO_COUNTDOWN', 100, profile.id, pomoConfig);
  const now = Date.now();

  // 3 of 4 intervals completed (75 min focus).
  await h.storage.updateCurrentSession((s) => ({
    ...s!,
    startedAt: now - 90 * 60 * 1000,
    lastCheckpointAt: now - 15 * 60 * 1000,
    lastHeartbeatAt: now - 15 * 60 * 1000,
    accumulatedFocusMs: 75 * 60 * 1000,
    pomodoroState: {
      currentPhase: 'SHORT_BREAK',
      currentInterval: 3,
      currentCycle: 1,
      completedFocusCount: 3,
      phaseStartedAt: now - 15 * 60 * 1000,
      phaseTargetDurationMinutes: 5,
      phaseTotalPauseMs: 0,
      totalCompletedFocusMinutes: 75,
      accumulatedCoins: 112.5,
      accumulatedXp: 375,
    },
  }));
  await h.storage.clearSessionLifecycleMarker();

  const recovered = await h.coordinator.handleLifecycleEvent({
    reason: 'BROWSER_STARTUP',
    isBrowserStartup: true,
  });

  assert.strictEqual(recovered?.status, 'INTERRUPTED');
  assert.strictEqual(recovered?.rewardProcessed, true);

  const economy = await h.storage.getEconomy();
  assert.strictEqual(economy.focusCoins, 0);
  assert.strictEqual(economy.totalXP, 0);

  const stats = await h.storage.getDailyStats();
  const todayStats = stats[Object.keys(stats)[0]];
  assert.strictEqual(todayStats.totalFocusMinutes, 75);
  assert.strictEqual(todayStats.completedSessions, 0);
  assert.strictEqual(todayStats.abandonedSessions, 1);
});

// =========================================================================
// TEST 10: Pomodoro Countdown — Browser closed mid-interval
// =========================================================================
test('Lifecycle Recovery [P0]: Pomodoro Countdown closed mid-interval awards 0 Coins/XP and preserves verified minutes without downtime', async () => {
  const h = createLifecycleTestHarness();
  const profile = await h.profileManager.createProfile('Study', ['wikipedia.org']);
  const pomoConfig = {
    focusDurationMinutes: 25,
    focusIntervalDurationMinutes: 25,
    shortBreakDurationMinutes: 5,
    longBreakDurationMinutes: 15,
    targetFocusSessions: 4,
    focusIntervalsPerCycle: 4,
    numberOfCycles: 1,
  };

  await h.coordinator.startSession('POMODORO_COUNTDOWN', 100, profile.id, pomoConfig);
  const now = Date.now();

  // 1 interval completed (25m), Interval 2 in FOCUS: started 15 min ago, checkpointed at minute 10, then browser closed for 1 hour
  await h.storage.updateCurrentSession((s) => ({
    ...s!,
    startedAt: now - 90 * 60 * 1000,
    lastCheckpointAt: now - 60 * 60 * 1000,
    lastHeartbeatAt: now - 60 * 60 * 1000,
    accumulatedFocusMs: 35 * 60 * 1000,
    pomodoroState: {
      currentPhase: 'FOCUS',
      currentInterval: 2,
      currentCycle: 1,
      completedFocusCount: 1,
      phaseStartedAt: now - 70 * 60 * 1000,
      phaseTargetDurationMinutes: 25,
      phaseTotalPauseMs: 0,
      totalCompletedFocusMinutes: 25,
      accumulatedCoins: 37.5,
      accumulatedXp: 125,
    },
  }));
  await h.storage.clearSessionLifecycleMarker();

  const recovered = await h.coordinator.handleLifecycleEvent({
    reason: 'BROWSER_STARTUP',
    isBrowserStartup: true,
  });

  assert.strictEqual(recovered?.status, 'INTERRUPTED');
  assert.strictEqual(recovered?.lastKnownValidFocusMinutes, 35); // 25 + 10 verified

  const economy = await h.storage.getEconomy();
  assert.strictEqual(economy.focusCoins, 0);
  assert.strictEqual(economy.totalXP, 0);

  const stats = await h.storage.getDailyStats();
  const todayStats = stats[Object.keys(stats)[0]];
  assert.strictEqual(todayStats.totalFocusMinutes, 35);
  assert.strictEqual(todayStats.completedSessions, 0);
  assert.strictEqual(todayStats.abandonedSessions, 1);
});

// =========================================================================
// TEST 11: Pomodoro Countdown — Target time of final interval passed during downtime
// =========================================================================
test('Lifecycle Recovery [P0]: Target time passing during downtime does NOT award completion for Pomodoro Countdown', async () => {
  const h = createLifecycleTestHarness();
  const profile = await h.profileManager.createProfile('Study', ['wikipedia.org']);
  const pomoConfig = {
    focusDurationMinutes: 25,
    focusIntervalDurationMinutes: 25,
    shortBreakDurationMinutes: 5,
    longBreakDurationMinutes: 15,
    targetFocusSessions: 4,
    focusIntervalsPerCycle: 4,
    numberOfCycles: 1,
  };

  await h.coordinator.startSession('POMODORO_COUNTDOWN', 100, profile.id, pomoConfig);
  const now = Date.now();

  // 3 completed intervals, currently in interval 4. Target elapsed 2 hours ago while browser was closed!
  await h.storage.updateCurrentSession((s) => ({
    ...s!,
    startedAt: now - 180 * 60 * 1000,
    lastCheckpointAt: now - 130 * 60 * 1000,
    lastHeartbeatAt: now - 130 * 60 * 1000,
    accumulatedFocusMs: 75 * 60 * 1000,
    pomodoroState: {
      currentPhase: 'FOCUS',
      currentInterval: 4,
      currentCycle: 1,
      completedFocusCount: 3,
      phaseStartedAt: now - 140 * 60 * 1000,
      phaseTargetDurationMinutes: 25,
      phaseTotalPauseMs: 0,
      totalCompletedFocusMinutes: 75,
      accumulatedCoins: 112.5,
      accumulatedXp: 375,
    },
  }));
  await h.storage.clearSessionLifecycleMarker();

  const recovered = await h.coordinator.handleLifecycleEvent({
    reason: 'BROWSER_STARTUP',
    isBrowserStartup: true,
  });

  assert.strictEqual(recovered?.status, 'INTERRUPTED');
  assert.strictEqual(recovered?.rewardProcessed, true);

  const economy = await h.storage.getEconomy();
  assert.strictEqual(economy.focusCoins, 0);
  assert.strictEqual(economy.totalXP, 0);

  const stats = await h.storage.getDailyStats();
  const todayStats = stats[Object.keys(stats)[0]];
  assert.strictEqual(todayStats.completedSessions, 0);
  assert.strictEqual(todayStats.abandonedSessions, 1);
});

// =========================================================================
// TEST 12: Pomodoro Countdown — Duplicate recovery calls are idempotent
// =========================================================================
test('Lifecycle Recovery [P0]: Duplicate recovery calls for Pomodoro Countdown are strictly idempotent', async () => {
  const h = createLifecycleTestHarness();
  const profile = await h.profileManager.createProfile('Study', ['wikipedia.org']);
  const pomoConfig = {
    focusDurationMinutes: 25,
    focusIntervalDurationMinutes: 25,
    shortBreakDurationMinutes: 5,
    longBreakDurationMinutes: 15,
    targetFocusSessions: 4,
    focusIntervalsPerCycle: 4,
    numberOfCycles: 1,
  };

  await h.coordinator.startSession('POMODORO_COUNTDOWN', 100, profile.id, pomoConfig);
  const now = Date.now();

  await h.storage.updateCurrentSession((s) => ({
    ...s!,
    startedAt: now - 60 * 60 * 1000,
    lastCheckpointAt: now - 30 * 60 * 1000,
    lastHeartbeatAt: now - 30 * 60 * 1000,
    accumulatedFocusMs: 25 * 60 * 1000,
    pomodoroState: {
      currentPhase: 'SHORT_BREAK',
      currentInterval: 1,
      currentCycle: 1,
      completedFocusCount: 1,
      phaseStartedAt: now - 30 * 60 * 1000,
      phaseTargetDurationMinutes: 5,
      phaseTotalPauseMs: 0,
      totalCompletedFocusMinutes: 25,
      accumulatedCoins: 37.5,
      accumulatedXp: 125,
    },
  }));
  await h.storage.clearSessionLifecycleMarker();

  // Call 1
  const rec1 = await h.coordinator.handleLifecycleEvent({
    reason: 'BROWSER_STARTUP',
    isBrowserStartup: true,
  });
  assert.strictEqual(rec1?.status, 'INTERRUPTED');

  // Call 2
  const rec2 = await h.coordinator.handleLifecycleEvent({
    reason: 'BROWSER_STARTUP',
    isBrowserStartup: true,
  });
  assert.strictEqual(rec2?.status, 'INTERRUPTED');

  const stats = await h.storage.getDailyStats();
  const todayStats = stats[Object.keys(stats)[0]];
  assert.strictEqual(todayStats.totalFocusMinutes, 25);
  assert.strictEqual(todayStats.abandonedSessions, 1);
});

// =========================================================================
// TEST 13: Pomodoro Countdown — Full 100% completion awards full rewards
// =========================================================================
test('Lifecycle Recovery [P0]: Pomodoro Countdown completing 100% of intervals awards full planned rewards', async () => {
  const h = createLifecycleTestHarness();
  const profile = await h.profileManager.createProfile('Study', ['wikipedia.org']);
  const pomoConfig = {
    focusDurationMinutes: 25,
    focusIntervalDurationMinutes: 25,
    shortBreakDurationMinutes: 5,
    longBreakDurationMinutes: 15,
    targetFocusSessions: 2,
    focusIntervalsPerCycle: 2,
    numberOfCycles: 1,
  };

  const session = await h.coordinator.startSession('POMODORO_COUNTDOWN', 50, profile.id, pomoConfig);
  assert.strictEqual(session.status, 'RUNNING');

  // Complete interval 1
  const alarm1 = `FQ_ALARM_POMODORO_STAGE_${session.id}_1_FOCUS_${session.pomodoroState!.phaseStartedAt}`;
  const after1 = await h.coordinator.advancePomodoroStage(alarm1);
  assert.strictEqual(after1?.pomodoroState?.currentPhase, 'SHORT_BREAK');
  assert.strictEqual(after1?.pomodoroState?.completedFocusCount, 1);

  // Advance break to interval 2
  const alarmBreak = `FQ_ALARM_POMODORO_STAGE_${session.id}_1_SHORT_BREAK_${after1!.pomodoroState!.phaseStartedAt}`;
  const afterBreak = await h.coordinator.advancePomodoroStage(alarmBreak);
  assert.strictEqual(afterBreak?.pomodoroState?.currentPhase, 'FOCUS');
  assert.strictEqual(afterBreak?.pomodoroState?.currentInterval, 2);

  // Complete interval 2 (100% of planned quest completed!)
  const alarm2 = `FQ_ALARM_POMODORO_STAGE_${session.id}_2_FOCUS_${afterBreak!.pomodoroState!.phaseStartedAt}`;
  const completed = await h.coordinator.advancePomodoroStage(alarm2);

  assert.strictEqual(completed?.status, 'COMPLETED');
  assert.strictEqual(completed?.rewardProcessed, true);

  // 50 minutes planned focus at 1.2x multiplier (30 - 59 min tier: 1.2x)
  // Coins = 50 * 1.5 * 1.2 = 90; XP = 50 * 5.0 * 1.2 = 300
  const economy = await h.storage.getEconomy();
  assert.strictEqual(economy.focusCoins, 90);
  assert.strictEqual(economy.totalXP, 300);

  const stats = await h.storage.getDailyStats();
  const todayStats = stats[Object.keys(stats)[0]];
  assert.strictEqual(todayStats.totalFocusMinutes, 50);
  assert.strictEqual(todayStats.completedSessions, 1);
});

// =========================================================================
// TESTS 14-18: Downtime Accounting Verification (1m, 3m, 4m59s, 5m, >5m)
// =========================================================================
const downtimeCases = [
  { label: '1 minute', downtimeMs: 1 * 60 * 1000 },
  { label: '3 minutes', downtimeMs: 3 * 60 * 1000 },
  { label: '4 minutes 59 seconds', downtimeMs: (4 * 60 + 59) * 1000 },
  { label: '5 minutes', downtimeMs: 5 * 60 * 1000 },
  { label: '15 minutes (> 5m)', downtimeMs: 15 * 60 * 1000 },
];

for (const tc of downtimeCases) {
  test(`Lifecycle Recovery [P1]: Countdown with ${tc.label} downtime interrupts and counts 0 downtime as focus`, async () => {
    const h = createLifecycleTestHarness();
    const profile = await h.profileManager.createProfile('Study', ['wikipedia.org']);
    await h.coordinator.startSession('COUNTDOWN', 30, profile.id);
    const now = Date.now();

    // 10 minutes of valid focus before browser close
    const validFocusMs = 10 * 60 * 1000;
    await h.storage.updateCurrentSession((s) => ({
      ...s!,
      startedAt: now - validFocusMs - tc.downtimeMs,
      lastCheckpointAt: now - tc.downtimeMs,
      lastHeartbeatAt: now - tc.downtimeMs,
      accumulatedFocusMs: validFocusMs,
    }));
    await h.storage.clearSessionLifecycleMarker();

    const recovered = await h.coordinator.handleLifecycleEvent({
      reason: 'BROWSER_STARTUP',
      isBrowserStartup: true,
    });

    assert.strictEqual(recovered?.status, 'INTERRUPTED');
    assert.strictEqual(recovered?.interruptedReason, 'BROWSER_CLOSED');
    assert.strictEqual(recovered?.rewardProcessed, true);
    assert.strictEqual(
      recovered?.lastKnownValidFocusMinutes,
      10,
      `Verified focus duration must be strictly 10 minutes without adding ${tc.label} downtime`
    );

    const economy = await h.storage.getEconomy();
    assert.strictEqual(economy.focusCoins, 0, 'Downtime must never award coins');
    assert.strictEqual(economy.totalXP, 0, 'Downtime must never award XP');

    const stats = await h.storage.getDailyStats();
    const todayStats = stats[Object.keys(stats)[0]];
    assert.strictEqual(todayStats.totalFocusMinutes, 10, 'Daily stats must record exactly 10 verified focus minutes');
    assert.strictEqual(todayStats.completedSessions, 0);
    assert.strictEqual(todayStats.abandonedSessions, 1);
  });
}

// =========================================================================
// TEST 19: Concurrency — Heartbeat running concurrently with Pause
// =========================================================================
test('Lifecycle Concurrency: Heartbeat running concurrently with Pause does not corrupt PAUSED state', async () => {
  const h = createLifecycleTestHarness();
  const profile = await h.profileManager.createProfile('Work', ['github.com']);
  await h.coordinator.startSession('STOPWATCH', 0, profile.id);

  // Run pauseSession and processHeartbeat concurrently
  await Promise.all([
    h.coordinator.pauseSession(),
    h.coordinator.processHeartbeat(),
  ]);

  const session = await h.storage.getCurrentSession();
  assert.strictEqual(session?.status, 'PAUSED', 'Status must remain PAUSED');
  assert.strictEqual(session?.pauseCount, 1);
});

// =========================================================================
// TEST 20: Concurrency — Concurrent Finish and Recovery
// =========================================================================
test('Lifecycle Concurrency: Concurrent finish and recovery serialize safely without duplicate rewards', async () => {
  const h = createLifecycleTestHarness();
  const profile = await h.profileManager.createProfile('Work', ['github.com']);
  await h.coordinator.startSession('STOPWATCH', 0, profile.id);

  const now = Date.now();
  await h.storage.updateCurrentSession((s) => ({
    ...s!,
    startedAt: now - 20 * 60 * 1000,
    lastCheckpointAt: now - 5 * 60 * 1000,
    lastHeartbeatAt: now - 5 * 60 * 1000,
    accumulatedFocusMs: 15 * 60 * 1000,
  }));
  await h.storage.clearSessionLifecycleMarker();

  // Run finishStopwatch and handleLifecycleEvent concurrently
  await Promise.allSettled([
    h.coordinator.finishStopwatch(),
    h.coordinator.handleLifecycleEvent({ reason: 'BROWSER_STARTUP', isBrowserStartup: true }),
  ]);

  const session = await h.storage.getCurrentSession();
  assert.ok(session?.rewardProcessed);
  assert.ok(session?.status === 'COMPLETED' || session?.status === 'INTERRUPTED');

  // Verify daily stats were logged at most once
  const stats = await h.storage.getDailyStats();
  const todayStats = stats[Object.keys(stats)[0]];
  assert.ok(todayStats.completedSessions + todayStats.abandonedSessions === 1);
});
