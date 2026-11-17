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
  buildPomodoroStageAlarmName,
} from '../../src/background/sessionCoordinator.ts';
import { TimeCalculator } from '../../src/core/timer/timeCalculator.ts';
import { MultiplierRules } from '../../src/core/reward/multiplierRules.ts';

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

test('Pomodoro Stopwatch: Initial FOCUS phase operates strictly as a COUNTDOWN (phaseTargetDurationMinutes > 0, badge shows minutes)', async () => {
  const h = createTestHarness();
  const profile = await h.profileManager.createProfile('Coding', ['github.com']);

  const session = await h.coordinator.startSession('POMODORO_STOPWATCH', 25, profile.id, {
    focusDurationMinutes: 25,
    shortBreakDurationMinutes: 5,
    longBreakDurationMinutes: 15,
    targetFocusSessions: 4,
  });

  assert.strictEqual(session.mode, 'POMODORO_STOPWATCH');
  assert.strictEqual(session.targetMinutes, 25, 'targetMinutes must be set to focus interval duration');
  assert.ok(session.pomodoroState, 'pomodoroState must exist');
  assert.strictEqual(session.pomodoroState.currentPhase, 'FOCUS');
  assert.strictEqual(
    session.pomodoroState.phaseTargetDurationMinutes,
    25,
    'phaseTargetDurationMinutes must be 25m, NOT 0'
  );
  assert.strictEqual(session.pomodoroState.currentInterval, 1);
  assert.strictEqual(session.pomodoroState.currentCycle, 1);

  // Badge must display countdown minutes
  assert.strictEqual(h.badge.text, '25m');
  assert.strictEqual(h.badge.color, '#10B981');

  // Verify TimeCalculator produces countdown remaining time
  const phaseCalc = TimeCalculator.calculatePomodoroPhaseTime({
    phaseStartedAt: session.pomodoroState.phaseStartedAt,
    currentTime: session.pomodoroState.phaseStartedAt + 60 * 1000, // 1 min passed
    phaseTargetMinutes: session.pomodoroState.phaseTargetDurationMinutes,
    phaseTotalPauseMs: 0,
    currentPauseStartedAt: null,
  });

  assert.strictEqual(phaseCalc.remainingPhaseMs, 24 * 60 * 1000, 'Remaining time must count down from 25:00 to 24:00');
  assert.strictEqual(Math.floor(phaseCalc.remainingPhaseMs / 1000), 24 * 60);
});

test('Pomodoro Stopwatch: Auto-progression through full cycle and automatic transition across cycles', async () => {
  const h = createTestHarness();
  const profile = await h.profileManager.createProfile('Deep Work', ['docs.google.com']);

  let session = await h.coordinator.startSession('POMODORO_STOPWATCH', 25, profile.id, {
    focusDurationMinutes: 25,
    shortBreakDurationMinutes: 5,
    longBreakDurationMinutes: 15,
    targetFocusSessions: 4,
  });

  // Cycle 1 - Interval 1 (FOCUS -> SHORT BREAK)
  let pState = session.pomodoroState!;
  let alarmName = buildPomodoroStageAlarmName(session.id, 1, 'FOCUS', pState.phaseStartedAt);
  let advanced = await h.coordinator.advancePomodoroStage(alarmName);
  assert.ok(advanced);
  assert.strictEqual(advanced.pomodoroState?.currentPhase, 'SHORT_BREAK');
  assert.strictEqual(advanced.pomodoroState?.phaseTargetDurationMinutes, 5, 'Short break must be 5m countdown');
  assert.strictEqual(advanced.pomodoroState?.completedFocusCount, 1);
  assert.strictEqual(advanced.pomodoroState?.totalCompletedFocusMinutes, 25);
  // Tier 5-29m: 1.0x -> 25 coins, 75 XP
  assert.strictEqual(advanced.pomodoroState?.accumulatedCoins, 25);
  assert.strictEqual(advanced.pomodoroState?.accumulatedXp, 75);
  assert.strictEqual(h.badge.text, 'REST');

  // Cycle 1 - Short Break 1 ends -> Auto transition to FOCUS 2
  pState = advanced.pomodoroState!;
  alarmName = buildPomodoroStageAlarmName(session.id, 1, 'SHORT_BREAK', pState.phaseStartedAt);
  advanced = await h.coordinator.advancePomodoroStage(alarmName);
  assert.ok(advanced);
  assert.strictEqual(advanced.pomodoroState?.currentPhase, 'FOCUS');
  assert.strictEqual(advanced.pomodoroState?.currentInterval, 2);
  assert.strictEqual(advanced.pomodoroState?.currentCycle, 1);
  assert.strictEqual(advanced.pomodoroState?.phaseTargetDurationMinutes, 25, 'Focus 2 must be 25m countdown');
  assert.strictEqual(h.badge.text, '25m');

  // Cycle 1 - Interval 2 completes -> SHORT BREAK 2
  pState = advanced.pomodoroState!;
  alarmName = buildPomodoroStageAlarmName(session.id, 2, 'FOCUS', pState.phaseStartedAt);
  advanced = await h.coordinator.advancePomodoroStage(alarmName);
  assert.ok(advanced);
  assert.strictEqual(advanced.pomodoroState?.currentPhase, 'SHORT_BREAK');
  assert.strictEqual(advanced.pomodoroState?.completedFocusCount, 2);
  assert.strictEqual(advanced.pomodoroState?.totalCompletedFocusMinutes, 50);
  // Tier 30-59m: 1.2x -> 50 * 1.0 * 1.2 = 60 coins; 50 * 3.0 * 1.2 = 180 XP
  assert.strictEqual(advanced.pomodoroState?.accumulatedCoins, 60);
  assert.strictEqual(advanced.pomodoroState?.accumulatedXp, 180);

  // Cycle 1 - Short Break 2 ends -> FOCUS 3
  pState = advanced.pomodoroState!;
  alarmName = buildPomodoroStageAlarmName(session.id, 2, 'SHORT_BREAK', pState.phaseStartedAt);
  advanced = await h.coordinator.advancePomodoroStage(alarmName);
  assert.ok(advanced);
  assert.strictEqual(advanced.pomodoroState?.currentPhase, 'FOCUS');
  assert.strictEqual(advanced.pomodoroState?.currentInterval, 3);
  assert.strictEqual(advanced.pomodoroState?.phaseTargetDurationMinutes, 25);

  // Cycle 1 - Interval 3 completes -> SHORT BREAK 3
  pState = advanced.pomodoroState!;
  alarmName = buildPomodoroStageAlarmName(session.id, 3, 'FOCUS', pState.phaseStartedAt);
  advanced = await h.coordinator.advancePomodoroStage(alarmName);
  assert.ok(advanced);
  assert.strictEqual(advanced.pomodoroState?.currentPhase, 'SHORT_BREAK');
  assert.strictEqual(advanced.pomodoroState?.completedFocusCount, 3);
  assert.strictEqual(advanced.pomodoroState?.totalCompletedFocusMinutes, 75);
  // Tier 60-89m: 1.4x -> 75 * 1.0 * 1.4 = 105 coins; 75 * 3.0 * 1.4 = 315 XP
  assert.strictEqual(advanced.pomodoroState?.accumulatedCoins, 105);
  assert.strictEqual(advanced.pomodoroState?.accumulatedXp, 315);

  // Cycle 1 - Short Break 3 ends -> FOCUS 4 (Last interval of cycle 1)
  pState = advanced.pomodoroState!;
  alarmName = buildPomodoroStageAlarmName(session.id, 3, 'SHORT_BREAK', pState.phaseStartedAt);
  advanced = await h.coordinator.advancePomodoroStage(alarmName);
  assert.ok(advanced);
  assert.strictEqual(advanced.pomodoroState?.currentPhase, 'FOCUS');
  assert.strictEqual(advanced.pomodoroState?.currentInterval, 4);
  assert.strictEqual(advanced.pomodoroState?.phaseTargetDurationMinutes, 25);

  // Cycle 1 - Interval 4 completes -> LONG BREAK (NOT Short Break!)
  pState = advanced.pomodoroState!;
  alarmName = buildPomodoroStageAlarmName(session.id, 4, 'FOCUS', pState.phaseStartedAt);
  advanced = await h.coordinator.advancePomodoroStage(alarmName);
  assert.ok(advanced);
  assert.strictEqual(advanced.pomodoroState?.currentPhase, 'LONG_BREAK', 'Final interval must enter LONG_BREAK');
  assert.strictEqual(advanced.pomodoroState?.phaseTargetDurationMinutes, 15, 'Long break must be 15m countdown');
  assert.strictEqual(advanced.pomodoroState?.completedFocusCount, 4);
  assert.strictEqual(advanced.pomodoroState?.totalCompletedFocusMinutes, 100);
  // Tier 90-119m: 1.6x -> 100 * 1.0 * 1.6 = 160 coins; 100 * 3.0 * 1.6 = 480 XP
  assert.strictEqual(advanced.pomodoroState?.accumulatedCoins, 160);
  assert.strictEqual(advanced.pomodoroState?.accumulatedXp, 480);
  assert.strictEqual(advanced.lockedMultiplier, 1.6);
  assert.strictEqual(h.badge.text, 'REST');

  // Cycle 1 - Long Break ends -> AUTO-START Cycle 2, Interval 1, FOCUS countdown!
  pState = advanced.pomodoroState!;
  alarmName = buildPomodoroStageAlarmName(session.id, 4, 'LONG_BREAK', pState.phaseStartedAt);
  advanced = await h.coordinator.advancePomodoroStage(alarmName);
  assert.ok(advanced);
  assert.strictEqual(advanced.status, 'RUNNING');
  assert.strictEqual(advanced.pomodoroState?.currentPhase, 'FOCUS', 'Must auto-start FOCUS countdown');
  assert.strictEqual(advanced.pomodoroState?.currentCycle, 2, 'Must increment currentCycle to 2');
  assert.strictEqual(advanced.pomodoroState?.currentInterval, 1, 'Must reset interval to 1');
  assert.strictEqual(
    advanced.pomodoroState?.phaseTargetDurationMinutes,
    25,
    'Cycle 2 Focus 1 must have 25m countdown target'
  );
  assert.strictEqual(h.badge.text, '25m', 'Badge must show 25m countdown for Cycle 2 Focus 1');
  assert.strictEqual(h.badge.color, '#10B981');

  // Verify next stage alarm was automatically scheduled
  const focus2Alarm = buildPomodoroStageAlarmName(
    session.id,
    1,
    'FOCUS',
    advanced.pomodoroState!.phaseStartedAt
  );
  const scheduledAlarm = await h.alarms.get(focus2Alarm);
  assert.ok(scheduledAlarm, 'Stage alarm for Cycle 2 Focus 1 must be scheduled');
});

test('Pomodoro Stopwatch: Manual finish at any time awards rewards strictly based on completed intervals', async () => {
  const h = createTestHarness();
  const profile = await h.profileManager.createProfile('Finish Anywhere', ['docs.google.com']);

  const session = await h.coordinator.startSession('POMODORO_STOPWATCH', 25, profile.id, {
    focusDurationMinutes: 25,
    shortBreakDurationMinutes: 5,
    longBreakDurationMinutes: 15,
    targetFocusSessions: 4,
  });

  // 1. Advance 2 full intervals (50 mins total completed focus)
  let pState = session.pomodoroState!;
  let alarm1 = buildPomodoroStageAlarmName(session.id, 1, 'FOCUS', pState.phaseStartedAt);
  let adv1 = await h.coordinator.advancePomodoroStage(alarm1);

  let breakAlarm1 = buildPomodoroStageAlarmName(session.id, 1, 'SHORT_BREAK', adv1!.pomodoroState!.phaseStartedAt);
  let adv2 = await h.coordinator.advancePomodoroStage(breakAlarm1);

  let alarm2 = buildPomodoroStageAlarmName(session.id, 2, 'FOCUS', adv2!.pomodoroState!.phaseStartedAt);
  let adv3 = await h.coordinator.advancePomodoroStage(alarm2);

  let breakAlarm2 = buildPomodoroStageAlarmName(session.id, 2, 'SHORT_BREAK', adv3!.pomodoroState!.phaseStartedAt);
  let adv4 = await h.coordinator.advancePomodoroStage(breakAlarm2);

  // Now currently in FOCUS 3, 10 minutes into the interval
  assert.strictEqual(adv4?.pomodoroState?.currentInterval, 3);
  assert.strictEqual(adv4?.pomodoroState?.currentPhase, 'FOCUS');

  // User decides to Finish Quest & Claim Reward while in Focus 3
  const finishResult = await h.coordinator.finishStopwatch();
  assert.strictEqual(finishResult.session.status, 'COMPLETED');
  assert.strictEqual(finishResult.session.rewardProcessed, true);

  // Completed focus is exactly 2 completed intervals (50m)
  // Partial interval 3 and break times are strictly excluded
  // 50m tier is 1.2x
  // 50 * 1.0 * 1.2 = 60 coins
  // 50 * 3.0 * 1.2 = 180 XP
  assert.strictEqual(finishResult.coinsEarned, 60);
  assert.strictEqual(finishResult.xpEarned, 180);

  const economy = await h.storage.getEconomy();
  assert.strictEqual(economy.focusCoins, 60);
  assert.strictEqual(economy.totalXP, 180);

  const todayKey = new Date().toISOString().slice(0, 10);
  const dailyStats = await h.storage.getDailyStats();
  assert.strictEqual(dailyStats[todayKey].totalFocusMinutes, 50);
  assert.strictEqual(dailyStats[todayKey].completedSessions, 1);
});

test('Pomodoro Stopwatch: Manual test configuration (Focus=1m, Short=1m, Long=1m, IntervalsPerCycle=2) full progression across cycles', async () => {
  const h = createTestHarness();
  const profile = await h.profileManager.createProfile('Test Profile', ['test.com']);

  // Start with 1m config
  const session = await h.coordinator.startSession('POMODORO_STOPWATCH', 1, profile.id, {
    focusDurationMinutes: 1,
    focusIntervalDurationMinutes: 1,
    shortBreakDurationMinutes: 1,
    longBreakDurationMinutes: 1,
    focusIntervalsPerCycle: 2,
    targetFocusSessions: 2,
  });

  assert.strictEqual(session.targetMinutes, 1);
  assert.strictEqual(session.pomodoroState?.currentPhase, 'FOCUS');
  assert.strictEqual(session.pomodoroState?.phaseTargetDurationMinutes, 1);
  assert.strictEqual(session.pomodoroState?.currentInterval, 1);
  assert.strictEqual(session.pomodoroState?.currentCycle, 1);
  assert.strictEqual(h.badge.text, '1m');

  // Interval 1 (Focus 1m) completes -> SHORT BREAK
  const p1 = session.pomodoroState!;
  const alarm1 = buildPomodoroStageAlarmName(session.id, 1, 'FOCUS', p1.phaseStartedAt);
  const adv1 = await h.coordinator.advancePomodoroStage(alarm1);
  assert.ok(adv1);
  assert.strictEqual(adv1.pomodoroState?.currentPhase, 'SHORT_BREAK');
  assert.strictEqual(adv1.pomodoroState?.completedFocusCount, 1);
  // Total completed focus = 1m -> <30m tier is 1.0x -> 1 * 1.0 * 1.0 = 1 coin, 3 XP
  assert.strictEqual(adv1.pomodoroState?.accumulatedCoins, 1);
  assert.strictEqual(adv1.pomodoroState?.accumulatedXp, 3);
  assert.strictEqual(h.badge.text, 'REST');

  // Short Break 1 (1m) completes -> Interval 2 FOCUS
  const p2 = adv1.pomodoroState!;
  const alarmBreak1 = buildPomodoroStageAlarmName(session.id, 1, 'SHORT_BREAK', p2.phaseStartedAt);
  const adv2 = await h.coordinator.advancePomodoroStage(alarmBreak1);
  assert.ok(adv2);
  assert.strictEqual(adv2.pomodoroState?.currentPhase, 'FOCUS');
  assert.strictEqual(adv2.pomodoroState?.currentInterval, 2);
  assert.strictEqual(adv2.pomodoroState?.currentCycle, 1);
  assert.strictEqual(adv2.pomodoroState?.phaseTargetDurationMinutes, 1);
  assert.strictEqual(h.badge.text, '1m');

  // Interval 2 (Focus 1m) completes -> LONG BREAK (2 intervals per cycle completed)
  const p3 = adv2.pomodoroState!;
  const alarm2 = buildPomodoroStageAlarmName(session.id, 2, 'FOCUS', p3.phaseStartedAt);
  const adv3 = await h.coordinator.advancePomodoroStage(alarm2);
  assert.ok(adv3);
  assert.strictEqual(adv3.pomodoroState?.currentPhase, 'LONG_BREAK');
  assert.strictEqual(adv3.pomodoroState?.completedFocusCount, 2);
  assert.strictEqual(adv3.pomodoroState?.totalCompletedFocusMinutes, 2);
  // Total completed focus = 2m -> <30m tier is 1.0x -> 2 * 1.0 * 1.0 = 2 coins, 6 XP
  assert.strictEqual(adv3.pomodoroState?.accumulatedCoins, 2);
  assert.strictEqual(adv3.pomodoroState?.accumulatedXp, 6);
  assert.strictEqual(h.badge.text, 'REST');

  // Long Break (1m) completes -> Automatically starts Cycle 2, Interval 1, FOCUS
  const p4 = adv3.pomodoroState!;
  const alarmLongBreak = buildPomodoroStageAlarmName(session.id, 2, 'LONG_BREAK', p4.phaseStartedAt);
  const adv4 = await h.coordinator.advancePomodoroStage(alarmLongBreak);
  assert.ok(adv4);
  assert.strictEqual(adv4.pomodoroState?.currentPhase, 'FOCUS');
  assert.strictEqual(adv4.pomodoroState?.currentCycle, 2);
  assert.strictEqual(adv4.pomodoroState?.currentInterval, 1);
  assert.strictEqual(adv4.pomodoroState?.phaseTargetDurationMinutes, 1);
  assert.strictEqual(h.badge.text, '1m');
});

test('Pomodoro Stopwatch: Manual finish at 00:00 reconciles focus completion and awards rewards', async () => {
  const h = createTestHarness();
  const profile = await h.profileManager.createProfile('Reconcile Profile', ['reconcile.com']);

  const session = await h.coordinator.startSession('POMODORO_STOPWATCH', 25, profile.id, {
    focusDurationMinutes: 25,
    focusIntervalDurationMinutes: 25,
    shortBreakDurationMinutes: 5,
    longBreakDurationMinutes: 15,
    focusIntervalsPerCycle: 4,
    targetFocusSessions: 4,
  });

  // Fast forward in memory storage by modifying phaseStartedAt to 26 minutes ago
  const runningSession = (await h.storage.getCurrentSession())!;
  runningSession.pomodoroState!.phaseStartedAt = Date.now() - 26 * 60 * 1000;
  await h.storage.setCurrentSession(runningSession);

  // User presses Finish Quest & Claim Reward while countdown has reached 00:00
  const result = await h.coordinator.finishStopwatch();
  assert.strictEqual(result.session.status, 'COMPLETED');
  assert.strictEqual(result.session.pomodoroState?.completedFocusCount, 1, 'Must reconcile completed focus interval');
  assert.strictEqual(result.session.pomodoroState?.totalCompletedFocusMinutes, 25);
  // 25m tier = 1.0x -> 25 coins, 75 XP
  assert.strictEqual(result.coinsEarned, 25);
  assert.strictEqual(result.xpEarned, 75);
});
