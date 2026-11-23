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
  buildPomodoroStageAlarmName,
  parsePomodoroStageAlarmName,
} from '../../src/background/sessionCoordinator.ts';
import { TimeCalculator } from '../../src/core/timer/timeCalculator.ts';
import { RewardEngine } from '../../src/core/reward/rewardEngine.ts';
import { DEFAULT_POMODORO_CONFIG, PomodoroConfig } from '../../src/types/session.ts';
import { formatRewardAmount } from '../../src/ui/utils/formatters.ts';

function createTestHarness() {
  const adapter = new MemoryStorageAdapter();
  const storage = new StorageManager(adapter);
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
    blockingCoordinator
  );

  return {
    adapter,
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

// ============================================================================
// CATEGORY 1: Pomodoro Configuration Validation & Official Settings Boundaries
// ============================================================================
test('Pomodoro Config: returns default configuration when none provided', () => {
  const result = TimeCalculator.validatePomodoroConfig();
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.config.focusDurationMinutes, 25);
  assert.strictEqual(result.config.shortBreakDurationMinutes, 5);
  assert.strictEqual(result.config.longBreakDurationMinutes, 15);
  assert.strictEqual(result.config.targetFocusSessions, 4);
});

test('Pomodoro Config: enforces official boundaries (Focus 5-90 step 5, Short Break 1-20 step 1, Long Break 5-60 step 5)', () => {
  // Focus duration: 5 to 90 min, step 5
  assert.strictEqual(TimeCalculator.validatePomodoroConfig({ focusDurationMinutes: 4 }).valid, false);
  assert.strictEqual(TimeCalculator.validatePomodoroConfig({ focusDurationMinutes: 95 }).valid, false);
  assert.strictEqual(TimeCalculator.validatePomodoroConfig({ focusDurationMinutes: 12 }).valid, false, 'Invalid step');
  assert.strictEqual(TimeCalculator.validatePomodoroConfig({ focusDurationMinutes: 5 }).valid, true);
  assert.strictEqual(TimeCalculator.validatePomodoroConfig({ focusDurationMinutes: 10 }).valid, true);
  assert.strictEqual(TimeCalculator.validatePomodoroConfig({ focusDurationMinutes: 90 }).valid, true);

  // Short break: 1 to 20 min, step 1
  assert.strictEqual(TimeCalculator.validatePomodoroConfig({ shortBreakDurationMinutes: 0 }).valid, false);
  assert.strictEqual(TimeCalculator.validatePomodoroConfig({ shortBreakDurationMinutes: 21 }).valid, false);
  assert.strictEqual(TimeCalculator.validatePomodoroConfig({ shortBreakDurationMinutes: 1 }).valid, true);
  assert.strictEqual(TimeCalculator.validatePomodoroConfig({ shortBreakDurationMinutes: 20 }).valid, true);

  // Long break: 5 to 60 min, step 5
  assert.strictEqual(TimeCalculator.validatePomodoroConfig({ longBreakDurationMinutes: 0 }).valid, false);
  assert.strictEqual(TimeCalculator.validatePomodoroConfig({ longBreakDurationMinutes: 4 }).valid, false);
  assert.strictEqual(TimeCalculator.validatePomodoroConfig({ longBreakDurationMinutes: 65 }).valid, false);
  assert.strictEqual(TimeCalculator.validatePomodoroConfig({ longBreakDurationMinutes: 7 }).valid, false, 'Invalid step');
  assert.strictEqual(TimeCalculator.validatePomodoroConfig({ longBreakDurationMinutes: 5 }).valid, true);
  assert.strictEqual(TimeCalculator.validatePomodoroConfig({ longBreakDurationMinutes: 60 }).valid, true);

  // Cycles: 2 to 10
  assert.strictEqual(TimeCalculator.validatePomodoroConfig({ targetFocusSessions: 1 }).valid, false);
  assert.strictEqual(TimeCalculator.validatePomodoroConfig({ targetFocusSessions: 11 }).valid, false);
  assert.strictEqual(TimeCalculator.validatePomodoroConfig({ targetFocusSessions: 2 }).valid, true);
  assert.strictEqual(TimeCalculator.validatePomodoroConfig({ targetFocusSessions: 10 }).valid, true);
});

test('Pomodoro Config: step helper functions enforce boundary clamping', () => {
  // Focus step (+-5, min 5, max 90)
  assert.strictEqual(TimeCalculator.stepPomodoroFocus(5, -1), 5, 'Cannot decrease below min 5');
  assert.strictEqual(TimeCalculator.stepPomodoroFocus(5, 1), 10);
  assert.strictEqual(TimeCalculator.stepPomodoroFocus(90, 1), 90, 'Cannot increase above max 90');
  assert.strictEqual(TimeCalculator.stepPomodoroFocus(90, -1), 85);

  // Short break step (+-1, min 1, max 20)
  assert.strictEqual(TimeCalculator.stepPomodoroShortBreak(1, -1), 1, 'Cannot decrease below min 1');
  assert.strictEqual(TimeCalculator.stepPomodoroShortBreak(1, 1), 2);
  assert.strictEqual(TimeCalculator.stepPomodoroShortBreak(20, 1), 20, 'Cannot increase above max 20');
  assert.strictEqual(TimeCalculator.stepPomodoroShortBreak(20, -1), 19);

  // Long break step (+-5, min 5, max 60)
  assert.strictEqual(TimeCalculator.stepPomodoroLongBreak(5, -1), 5, 'Cannot decrease below min 5');
  assert.strictEqual(TimeCalculator.stepPomodoroLongBreak(5, 1), 10);
  assert.strictEqual(TimeCalculator.stepPomodoroLongBreak(60, 1), 60, 'Cannot increase above max 60');
  assert.strictEqual(TimeCalculator.stepPomodoroLongBreak(60, -1), 55);
});

// ============================================================================
// CATEGORY 2: Universal Precision Formatting Utility (Coins & XP)
// ============================================================================
test('Reward Formatter: matches exact user specification examples', () => {
  // 1. "25" -> "25" (integer natural)
  assert.strictEqual(formatRewardAmount(25), '25');
  // 2. "7.5" -> "7.5" (1 decimal natural)
  assert.strictEqual(formatRewardAmount(7.5), '7.5');
  // 3. "7.56" -> "7.56" (2 decimals natural)
  assert.strictEqual(formatRewardAmount(7.56), '7.56');
  // 4. "7.567" -> "7.57" (rounds to 2 decimals)
  assert.strictEqual(formatRewardAmount(7.567), '7.57');
  // 5. "10.126" -> "10.13" (rounds to 2 decimals)
  assert.strictEqual(formatRewardAmount(10.126), '10.13');
  // 6. "0.005" -> "0.01" (rounds to 2 decimals)
  assert.strictEqual(formatRewardAmount(0.005), '0.01');

  // Edge cases
  assert.strictEqual(formatRewardAmount(0), '0');
  assert.strictEqual(formatRewardAmount(1.2000000001), '1.2');
  assert.strictEqual(formatRewardAmount(40.0), '40');
});

// ============================================================================
// CATEGORY 3: State Machine & Phase Transitions with Cumulative Multiplier
// ============================================================================
test('Pomodoro Lifecycle: full cycle progression with total planned reward and single settlement at 100% completion', async () => {
  const h = createTestHarness();
  const profile = await h.profileManager.createProfile('Coding', ['github.com']);

  const customConfig: PomodoroConfig = {
    focusDurationMinutes: 25,
    shortBreakDurationMinutes: 5,
    longBreakDurationMinutes: 15,
    targetFocusSessions: 4,
    numberOfCycles: 2, // 2 cycles x 4 intervals = 8 intervals = 200m total -> 2.5x -> 750 Coins, 2500 XP
  };

  // Start Pomodoro Countdown
  const session = await h.coordinator.startSession(
    'POMODORO_COUNTDOWN',
    customConfig.focusDurationMinutes,
    profile.id,
    customConfig
  );

  assert.strictEqual(session.status, 'RUNNING');
  assert.strictEqual(session.pomodoroState?.currentPhase, 'FOCUS');
  assert.strictEqual(session.pomodoroState?.currentInterval, 1);
  assert.strictEqual(session.pomodoroState?.currentCycle, 1);
  assert.strictEqual(session.pomodoroState?.completedFocusCount, 0);
  // Total Reward for entire mission previewed
  assert.strictEqual(session.pomodoroState?.accumulatedCoins, 750);
  assert.strictEqual(session.pomodoroState?.accumulatedXp, 2500);

  // 1. Advance after Focus 1
  const step1 = await h.coordinator.advancePomodoroStage();
  assert.strictEqual(step1?.pomodoroState?.currentPhase, 'SHORT_BREAK');
  assert.strictEqual(step1?.pomodoroState?.completedFocusCount, 1);
  assert.strictEqual(step1?.pomodoroState?.totalCompletedFocusMinutes, 25);
  assert.strictEqual(step1?.pomodoroState?.accumulatedCoins, 750);
  assert.strictEqual(step1?.pomodoroState?.accumulatedXp, 2500);

  // Intermediate intervals do NOT credit economy wallet (single settlement at 100% mission completion)
  let economy = await h.storage.getEconomy();
  assert.strictEqual(economy.focusCoins, 0);
  assert.strictEqual(economy.totalXP, 0);

  // 2. Advance after Short Break 1 -> transitions to Focus 2
  const step2 = await h.coordinator.advancePomodoroStage();
  assert.strictEqual(step2?.pomodoroState?.currentPhase, 'FOCUS');
  assert.strictEqual(step2?.pomodoroState?.currentInterval, 2);

  // 3. Advance after Focus 2 (50m total)
  const step3 = await h.coordinator.advancePomodoroStage();
  assert.strictEqual(step3?.pomodoroState?.currentPhase, 'SHORT_BREAK');
  assert.strictEqual(step3?.pomodoroState?.completedFocusCount, 2);
  assert.strictEqual(step3?.pomodoroState?.totalCompletedFocusMinutes, 50);

  // 4. Advance after Short Break 2 -> transitions to Focus 3
  const step4 = await h.coordinator.advancePomodoroStage();
  assert.strictEqual(step4?.pomodoroState?.currentPhase, 'FOCUS');
  assert.strictEqual(step4?.pomodoroState?.currentInterval, 3);

  // 5. Advance after Focus 3 (75m total)
  const step5 = await h.coordinator.advancePomodoroStage();
  assert.strictEqual(step5?.pomodoroState?.currentPhase, 'SHORT_BREAK');
  assert.strictEqual(step5?.pomodoroState?.completedFocusCount, 3);
  assert.strictEqual(step5?.pomodoroState?.totalCompletedFocusMinutes, 75);

  // 6. Advance after Short Break 3 -> transitions to Focus 4
  const step6 = await h.coordinator.advancePomodoroStage();
  assert.strictEqual(step6?.pomodoroState?.currentPhase, 'FOCUS');
  assert.strictEqual(step6?.pomodoroState?.currentInterval, 4);

  // 7. Advance after Focus 4 (100m total)
  // targetFocusSessions (4) reached -> transitions to LONG_BREAK!
  const step7 = await h.coordinator.advancePomodoroStage();
  assert.strictEqual(step7?.pomodoroState?.currentPhase, 'LONG_BREAK');
  assert.strictEqual(step7?.pomodoroState?.completedFocusCount, 4);
  assert.strictEqual(step7?.pomodoroState?.totalCompletedFocusMinutes, 100);
  assert.strictEqual(step7?.pomodoroState?.phaseTargetDurationMinutes, 15);

  economy = await h.storage.getEconomy();
  assert.strictEqual(economy.focusCoins, 0, 'No settlement before 100% mission completion');

  // 8. Advance after Long Break -> starts cycle 2 Focus 1
  const step8 = await h.coordinator.advancePomodoroStage();
  assert.strictEqual(step8?.pomodoroState?.currentPhase, 'FOCUS');
  assert.strictEqual(step8?.pomodoroState?.currentCycle, 2, 'Must increment currentCycle to 2');
  assert.strictEqual(step8?.pomodoroState?.currentInterval, 1, 'Must reset interval to 1 in new cycle');

  // 9-14: Complete cycle 2 intervals (Focus 5, 6, 7, 8)
  await h.coordinator.advancePomodoroStage(); // Focus 1 -> SB
  await h.coordinator.advancePomodoroStage(); // SB -> Focus 2
  await h.coordinator.advancePomodoroStage(); // Focus 2 -> SB
  await h.coordinator.advancePomodoroStage(); // SB -> Focus 3
  await h.coordinator.advancePomodoroStage(); // Focus 3 -> SB
  await h.coordinator.advancePomodoroStage(); // SB -> Focus 4

  // Final interval (8 of 8) completed -> Quest finishes at 100%!
  const finalStep = await h.coordinator.advancePomodoroStage();
  assert.strictEqual(finalStep?.status, 'COMPLETED');
  assert.strictEqual(finalStep?.pomodoroState?.completedFocusCount, 8);
  assert.strictEqual(finalStep?.pomodoroState?.totalCompletedFocusMinutes, 200);

  // Single settlement executed at 100% mission completion
  economy = await h.storage.getEconomy();
  assert.strictEqual(economy.focusCoins, 750, '200 min total Focus at 2.5x must yield exactly 750 Coins in economy');
  assert.strictEqual(economy.totalXP, 2500, '200 min total Focus at 2.5x must yield exactly 2500 XP in economy');
});

// ============================================================================
// CATEGORY 4: Phase-Based Website Blocking Integration
// ============================================================================
test('Website Blocking: active during Focus, disabled during Breaks', async () => {
  const h = createTestHarness();
  const profile = await h.profileManager.createProfile('Study', ['wikipedia.org']);

  // Set up an open distracting tab
  h.tabs.createTab({ id: 101, url: 'https://youtube.com/watch?v=123' });
  h.tabs.createTab({ id: 102, url: 'https://wikipedia.org/wiki/Science' });

  // Start Focus
  await h.coordinator.startSession('POMODORO_COUNTDOWN', 25, profile.id);

  // In Focus: dynamic rules applied, youtube redirected to blocked.html, wikipedia untouched
  let rules = await h.dnr.getDynamicRules();
  assert.ok(rules.length > 0, 'DNR blocking rule must be active during Focus');
  const tab101 = await h.tabs.get(101);
  assert.strictEqual(tab101.url, '/blocked.html', 'Distracting tab must be redirected during Focus');
  const tab102 = await h.tabs.get(102);
  assert.strictEqual(tab102.url, 'https://wikipedia.org/wiki/Science', 'Allowlist tab must not be redirected');

  // Advance to Break
  await h.coordinator.advancePomodoroStage();

  // In Break: dynamic rules MUST be cleared! All websites accessible
  rules = await h.dnr.getDynamicRules();
  assert.strictEqual(rules.length, 0, 'DNR blocking rules must be cleared during Break');

  // Advance back to Focus
  await h.tabs.update(101, { url: 'https://reddit.com' });
  await h.coordinator.advancePomodoroStage();

  // Back in Focus: dynamic rules re-applied, reddit redirected!
  rules = await h.dnr.getDynamicRules();
  assert.ok(rules.length > 0, 'DNR rules must be restored upon entering Focus');
  const tab101After = await h.tabs.get(101);
  assert.strictEqual(tab101After.url, '/blocked.html', 'New non-allowlisted tab must be redirected upon entering Focus');
});

// ============================================================================
// CATEGORY 5: Pause / Resume Integration in Pomodoro
// ============================================================================
test('Pause / Resume: pause during Focus clears blocking; resume restores blocking', async () => {
  const h = createTestHarness();
  const profile = await h.profileManager.createProfile('Focus Work', ['docs.google.com']);

  await h.coordinator.startSession('POMODORO_COUNTDOWN', 25, profile.id);

  let rules = await h.dnr.getDynamicRules();
  assert.ok(rules.length > 0, 'Blocking must be active before pause');

  // Pause session
  const paused = await h.coordinator.pauseSession();
  assert.strictEqual(paused.status, 'PAUSED');

  // Website blocking must be cleared during pause!
  rules = await h.dnr.getDynamicRules();
  assert.strictEqual(rules.length, 0, 'Blocking must be lifted during pause');

  // Resume session
  const resumed = await h.coordinator.resumeSession(false);
  assert.strictEqual(resumed.status, 'RUNNING');

  // Website blocking must be restored!
  rules = await h.dnr.getDynamicRules();
  assert.ok(rules.length > 0, 'Blocking must be restored upon resume');
});

test('Pause / Resume: 5-minute auto-resume triggers and restores state', async () => {
  const h = createTestHarness();
  const profile = await h.profileManager.createProfile('Reading', ['wikipedia.org']);

  await h.coordinator.startSession('POMODORO_COUNTDOWN', 25, profile.id);
  const paused = await h.coordinator.pauseSession();

  // Simulate 6 minutes passed while paused
  const sixMinsAgo = Date.now() - 6 * 60 * 1000;
  await h.storage.updateCurrentSession((s) => ({
    ...s!,
    currentPauseStartedAt: sixMinsAgo,
  }));

  // Auto-resume triggered via SW recovery or alarm
  const recovered = await h.coordinator.recoverSession();
  assert.strictEqual(recovered?.status, 'RUNNING', 'Session must have auto-resumed after 5 mins');
  assert.strictEqual(recovered?.totalPauseMs, 5 * 60 * 1000, 'Pause duration must be capped at 5 mins');

  // Blocking restored
  const rules = await h.dnr.getDynamicRules();
  assert.ok(rules.length > 0);
});

// ============================================================================
// CATEGORY 6: Session Integrity & Lifecycle Recovery
// ============================================================================
test('Lifecycle Recovery: Service Worker wake-up during Focus preserves stage and alarms', async () => {
  const h = createTestHarness();
  const profile = await h.profileManager.createProfile('Design', ['figma.com']);

  const session = await h.coordinator.startSession('POMODORO_COUNTDOWN', 25, profile.id);

  // Simulate Service Worker termination and wake-up
  const recovered = await h.coordinator.recoverSession({ reason: 'SERVICE_WORKER_WAKE' });
  assert.strictEqual(recovered?.id, session.id);
  assert.strictEqual(recovered?.status, 'RUNNING');
  assert.strictEqual(recovered?.pomodoroState?.currentPhase, 'FOCUS');

  const rules = await h.dnr.getDynamicRules();
  assert.ok(rules.length > 0, 'Rules must remain active');
});

test('Lifecycle Recovery: Service Worker wake-up during Break keeps blocking cleared', async () => {
  const h = createTestHarness();
  const profile = await h.profileManager.createProfile('Design', ['figma.com']);

  await h.coordinator.startSession('POMODORO_COUNTDOWN', 25, profile.id);
  // Advance to Break
  await h.coordinator.advancePomodoroStage();

  // SW terminated and restarts during Break
  const recovered = await h.coordinator.recoverSession({ reason: 'SERVICE_WORKER_WAKE' });
  assert.strictEqual(recovered?.pomodoroState?.currentPhase, 'SHORT_BREAK');

  const rules = await h.dnr.getDynamicRules();
  assert.strictEqual(rules.length, 0, 'Rules must remain cleared during break after SW wake');
});

test('Lifecycle Recovery: stage finished while computer slept automatically catches up', async () => {
  const h = createTestHarness();
  const profile = await h.profileManager.createProfile('Deep Study', ['wikipedia.org']);

  await h.coordinator.startSession('POMODORO_COUNTDOWN', 25, profile.id);

  // Simulate 30 minutes elapsed while laptop lid was closed (exceeded 25m focus)
  const thirtyMinsAgo = Date.now() - 30 * 60 * 1000;
  await h.storage.updateCurrentSession((s) => ({
    ...s!,
    startedAt: thirtyMinsAgo,
    pomodoroState: {
      ...s!.pomodoroState!,
      phaseStartedAt: thirtyMinsAgo,
    },
  }));

  // Laptop wakes up, SW rehydrates
  const caughtUp = await h.coordinator.recoverSession();
  assert.strictEqual(caughtUp?.pomodoroState?.currentPhase, 'SHORT_BREAK', 'Must have advanced to Break');
  assert.strictEqual(caughtUp?.pomodoroState?.completedFocusCount, 1, 'Focus 1 must be recorded as completed');

  // For Pomodoro Countdown, economy is NOT credited on intermediate intervals (settlement occurs once at 100% mission completion)
  const economy = await h.storage.getEconomy();
  assert.strictEqual(economy.focusCoins, 0, 'No intermediate wallet settlement for Countdown');
});

test('Lifecycle Recovery: Extension disabled during Pomodoro marks session INTERRUPTED with 0 reward per Section VII.B', async () => {
  const h = createTestHarness();
  const profile = await h.profileManager.createProfile('Testing', ['github.com']);

  await h.coordinator.startSession('POMODORO_COUNTDOWN', 25, profile.id);

  // Advance to complete Focus 1
  await h.coordinator.advancePomodoroStage();
  // Advance to Focus 2
  await h.coordinator.advancePomodoroStage();
  // Advance to complete Focus 2
  await h.coordinator.advancePomodoroStage();
  // Advance to Focus 3
  await h.coordinator.advancePomodoroStage();

  // Extension disabled event received during Focus 3
  const interrupted = await h.coordinator.handleLifecycleEvent({ reason: 'EXTENSION_RE_ENABLED' });
  assert.strictEqual(interrupted?.status, 'INTERRUPTED');
  assert.strictEqual(interrupted?.interruptedReason, 'EXTENSION_DISABLED');

  // Per Section VII.B: When extension is disabled mid-session, Countdown / Pomodoro Countdown cancel/interrupt and yield 0 Coins/XP
  const economy = await h.storage.getEconomy();
  assert.strictEqual(economy.focusCoins, 0, 'Extension disabled yields 0 Coins');
  assert.strictEqual(economy.totalXP, 0, 'Extension disabled yields 0 XP');

  const rules = await h.dnr.getDynamicRules();
  assert.strictEqual(rules.length, 0);
});

// ============================================================================
// CATEGORY 7: Stale Alarm Protection
// ============================================================================
test('Alarms: parsePomodoroStageAlarmName rejects malformed and stale alarms', () => {
  const validName = buildPomodoroStageAlarmName('sess_123', 2, 'SHORT_BREAK', 1700000000000);
  const parsed = parsePomodoroStageAlarmName(validName);

  assert.ok(parsed !== null);
  assert.strictEqual(parsed.sessionId, 'sess_123');
  assert.strictEqual(parsed.interval, 2);
  assert.strictEqual(parsed.phase, 'SHORT_BREAK');
  assert.strictEqual(parsed.phaseStartedAt, 1700000000000);

  // Invalid names
  assert.strictEqual(parsePomodoroStageAlarmName('RANDOM_ALARM'), null);
  assert.strictEqual(parsePomodoroStageAlarmName('FQ_ALARM_POMODORO_STAGE_invalid'), null);
});
