import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TimeCalculator } from '../../src/core/timer/timeCalculator.ts';
import { MultiplierRules } from '../../src/core/reward/multiplierRules.ts';
import { DEFAULT_REWARD_CONFIG, RewardEngine } from '../../src/core/reward/rewardEngine.ts';
import { DEFAULT_POMODORO_CONFIG, PomodoroConfig } from '../../src/types/session.ts';
import { formatRewardAmount } from '../../src/ui/utils/formatters.ts';
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
import { MessageHandler } from '../../src/background/messageHandler.ts';

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

  const messageHandler = new MessageHandler(
    coordinator,
    profileManager,
    storage
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
    messageHandler,
  };
}

// Helper mirroring TimerView preview computation for testing and verification
function computePomodoroPreview(params: {
  subMode: 'POMODORO_COUNTDOWN' | 'POMODORO_STOPWATCH';
  config: Partial<PomodoroConfig>;
}) {
  const validated = TimeCalculator.validatePomodoroConfig(params.config).config;
  const intervalDuration =
    validated.focusIntervalDurationMinutes ?? validated.focusDurationMinutes;
  const intervalsPerCycle =
    validated.focusIntervalsPerCycle ?? validated.targetFocusSessions;
  const cycles = validated.numberOfCycles ?? 3;

  if (params.subMode === 'POMODORO_COUNTDOWN') {
    const totalIntervals = intervalsPerCycle * cycles;
    const totalFocusMinutes = intervalDuration * totalIntervals;
    const previewMultiplier = MultiplierRules.getCountdownMultiplier(totalFocusMinutes);
    const estimatedCoins =
      DEFAULT_REWARD_CONFIG.countdownBaseCoinPerMinute * totalFocusMinutes * previewMultiplier;
    const estimatedXp =
      DEFAULT_REWARD_CONFIG.countdownBaseXpPerMinute * totalFocusMinutes * previewMultiplier;

    return {
      label: 'Total Reward',
      totalIntervals,
      totalFocusMinutes,
      previewMultiplier,
      estimatedCoins,
      estimatedXp,
      hasMultiplierBadge: true,
      badgeText: `×${previewMultiplier.toFixed(1)}`,
    };
  }

  // Pomodoro Stopwatch: Per Interval Reward with 1.0x preview multiplier, using Stopwatch base rate (1.0 Coin/min, 3.0 XP/min)
  const previewMultiplier = 1.0;
  const estimatedCoins =
    DEFAULT_REWARD_CONFIG.stopwatchBaseCoinPerMinute * intervalDuration * previewMultiplier;
  const estimatedXp =
    DEFAULT_REWARD_CONFIG.stopwatchBaseXpPerMinute * intervalDuration * previewMultiplier;

  return {
    label: 'Per Interval Reward',
    totalIntervals: 1,
    totalFocusMinutes: intervalDuration,
    previewMultiplier,
    estimatedCoins,
    estimatedXp,
    hasMultiplierBadge: false,
    badgeText: null,
  };
}

// ============================================================================
// 1. COUNTDOWN PREVIEW TESTS
// ============================================================================
test('Pomodoro Countdown Preview: 5m x 4 intervals x 3 cycles -> 60m total, 1.4x multiplier', () => {
  const preview = computePomodoroPreview({
    subMode: 'POMODORO_COUNTDOWN',
    config: {
      focusDurationMinutes: 5,
      targetFocusSessions: 4,
      numberOfCycles: 3,
    },
  });

  assert.strictEqual(preview.label, 'Total Reward');
  assert.strictEqual(preview.totalIntervals, 12);
  assert.strictEqual(preview.totalFocusMinutes, 60);
  assert.strictEqual(preview.previewMultiplier, 1.4);
  // 60 * 1.5 * 1.4 = 126 Coins (IEEE-754 precision); 60 * 5.0 * 1.4 = 420 XP
  assert.ok(Math.abs(preview.estimatedCoins - 126) < 1e-9);
  assert.strictEqual(formatRewardAmount(preview.estimatedCoins), '126');
  assert.strictEqual(preview.estimatedXp, 420);
  assert.strictEqual(preview.hasMultiplierBadge, true);
  assert.strictEqual(preview.badgeText, '×1.4');
});

test('Pomodoro Countdown Preview: 25m x 4 intervals x 3 cycles -> 300m total, 2.5x multiplier, 1125 Coins, 3750 XP', () => {
  const preview = computePomodoroPreview({
    subMode: 'POMODORO_COUNTDOWN',
    config: {
      focusDurationMinutes: 25,
      targetFocusSessions: 4,
      numberOfCycles: 3,
    },
  });

  assert.strictEqual(preview.label, 'Total Reward');
  assert.strictEqual(preview.totalIntervals, 12);
  assert.strictEqual(preview.totalFocusMinutes, 300);
  assert.strictEqual(preview.previewMultiplier, 2.5);
  // 300 * 1.5 * 2.5 = 1125 Coins; 300 * 5.0 * 2.5 = 3750 XP
  assert.strictEqual(preview.estimatedCoins, 1125);
  assert.strictEqual(preview.estimatedXp, 3750);
  assert.strictEqual(preview.hasMultiplierBadge, true);
  assert.strictEqual(preview.badgeText, '×2.5');

  // Verify exact match with RewardEngine
  const engine = new RewardEngine();
  const cumulative = engine.calculatePomodoroCumulativeReward({
    mode: 'POMODORO_COUNTDOWN',
    totalCompletedFocusMinutes: 300,
  });
  assert.strictEqual(preview.estimatedCoins, cumulative.totalCoins);
  assert.strictEqual(preview.estimatedXp, cumulative.totalXp);
  assert.strictEqual(preview.previewMultiplier, cumulative.multiplier);
});

test('Pomodoro Countdown Preview: dynamically updates when Number of Cycles, Intervals, or Duration changes', () => {
  // Start with 25m, 4 intervals, 1 cycle (100m total -> 1.6x tier)
  const p1 = computePomodoroPreview({
    subMode: 'POMODORO_COUNTDOWN',
    config: { focusDurationMinutes: 25, targetFocusSessions: 4, numberOfCycles: 1 },
  });
  assert.strictEqual(p1.totalFocusMinutes, 100);
  assert.strictEqual(p1.previewMultiplier, 1.6);
  assert.strictEqual(p1.estimatedCoins, 100 * 1.5 * 1.6); // 240
  assert.strictEqual(p1.estimatedXp, 100 * 5 * 1.6);       // 800
  assert.strictEqual(p1.badgeText, '×1.6');

  // Increase Number of Cycles to 2 (200m total -> 2.5x tier)
  const p2 = computePomodoroPreview({
    subMode: 'POMODORO_COUNTDOWN',
    config: { focusDurationMinutes: 25, targetFocusSessions: 4, numberOfCycles: 2 },
  });
  assert.strictEqual(p2.totalFocusMinutes, 200);
  assert.strictEqual(p2.previewMultiplier, 2.5);
  assert.strictEqual(p2.estimatedCoins, 200 * 1.5 * 2.5); // 750
  assert.strictEqual(p2.badgeText, '×2.5');

  // Change Focus Intervals per Cycle to 2 (25m * 2 * 2 = 100m -> 1.6x)
  const p3 = computePomodoroPreview({
    subMode: 'POMODORO_COUNTDOWN',
    config: { focusDurationMinutes: 25, targetFocusSessions: 2, numberOfCycles: 2 },
  });
  assert.strictEqual(p3.totalFocusMinutes, 100);
  assert.strictEqual(p3.previewMultiplier, 1.6);

  // Change Focus Interval Duration to 15m (15m * 2 * 2 = 60m -> 1.4x)
  const p4 = computePomodoroPreview({
    subMode: 'POMODORO_COUNTDOWN',
    config: { focusDurationMinutes: 15, targetFocusSessions: 2, numberOfCycles: 2 },
  });
  assert.strictEqual(p4.totalFocusMinutes, 60);
  assert.strictEqual(p4.previewMultiplier, 1.4);
});

// ============================================================================
// 2. STOPWATCH PREVIEW TESTS
// ============================================================================
test('Pomodoro Stopwatch Preview: retains Per Interval Reward label with Stopwatch base rate (1 Coin/min, 3 XP/min)', () => {
  // 5m Pomodoro Stopwatch
  const p5 = computePomodoroPreview({
    subMode: 'POMODORO_STOPWATCH',
    config: { focusDurationMinutes: 5 },
  });
  assert.strictEqual(p5.label, 'Per Interval Reward');
  assert.strictEqual(p5.previewMultiplier, 1.0);
  assert.strictEqual(p5.estimatedCoins, 5);  // 5 * 1.0
  assert.strictEqual(p5.estimatedXp, 15);    // 5 * 3.0
  assert.strictEqual(p5.hasMultiplierBadge, false, 'Stopwatch must NOT show multiplier badge');
  assert.strictEqual(p5.badgeText, null);

  // 25m Pomodoro Stopwatch
  const p25 = computePomodoroPreview({
    subMode: 'POMODORO_STOPWATCH',
    config: { focusDurationMinutes: 25 },
  });
  assert.strictEqual(p25.label, 'Per Interval Reward');
  assert.strictEqual(p25.previewMultiplier, 1.0);
  assert.strictEqual(p25.estimatedCoins, 25); // 25 * 1.0
  assert.strictEqual(p25.estimatedXp, 75);   // 25 * 3.0
  assert.strictEqual(p25.hasMultiplierBadge, false);
});

// ============================================================================
// 3. STOPWATCH REWARD INTEGRITY & ALARM SECURITY TESTS
// ============================================================================
test('Pomodoro Stopwatch security: manual early interval completion is strictly prohibited without alarm', async () => {
  const h = createTestHarness();
  const profile = await h.profileManager.createProfile('Study Flow', ['wikipedia.org']);

  await h.coordinator.startSession('POMODORO_STOPWATCH', 25, profile.id, {
    focusDurationMinutes: 25,
    shortBreakDurationMinutes: 5,
    longBreakDurationMinutes: 15,
    targetFocusSessions: 4,
  });

  // Attempting to advance stage manually while in FOCUS must be rejected
  await assert.rejects(
    async () => {
      await h.coordinator.advancePomodoroStage(); // called without stage alarm
    },
    /Manual early interval completion is prohibited/
  );
});

test('Pomodoro Stopwatch security: fake or malformed alarm name strings are strictly rejected', async () => {
  const h = createTestHarness();
  const profile = await h.profileManager.createProfile('Security Test', ['wikipedia.org']);

  await h.coordinator.startSession('POMODORO_STOPWATCH', 25, profile.id, {
    focusDurationMinutes: 25,
    shortBreakDurationMinutes: 5,
    longBreakDurationMinutes: 15,
    targetFocusSessions: 4,
  });

  // 1. Plain random string
  await assert.rejects(
    async () => {
      await h.coordinator.advancePomodoroStage('fake');
    },
    /Invalid or forged alarm name for Pomodoro Stopwatch/
  );

  // 2. Alarm prefix but malformed structure
  await assert.rejects(
    async () => {
      await h.coordinator.advancePomodoroStage('FQ_ALARM_POMODORO_STAGE_malformed');
    },
    /Invalid or forged alarm name for Pomodoro Stopwatch/
  );
});

test('Pomodoro Stopwatch security: forged alarms (wrong session/interval/phase) are rejected and stale timestamps are ignored as no-ops', async () => {
  const h = createTestHarness();
  const profile = await h.profileManager.createProfile('Security Test 2', ['wikipedia.org']);

  const session = await h.coordinator.startSession('POMODORO_STOPWATCH', 25, profile.id, {
    focusDurationMinutes: 25,
    shortBreakDurationMinutes: 5,
    longBreakDurationMinutes: 15,
    targetFocusSessions: 4,
  });

  const pState = session.pomodoroState!;

  // 1. Wrong session ID
  const wrongSessionAlarm = buildPomodoroStageAlarmName('sess_other_id', pState.currentInterval, 'FOCUS', pState.phaseStartedAt);
  await assert.rejects(
    async () => {
      await h.coordinator.advancePomodoroStage(wrongSessionAlarm);
    },
    /Invalid or forged alarm name for Pomodoro Stopwatch/
  );

  // 2. Wrong interval (interval 2 instead of 1)
  const wrongIntervalAlarm = buildPomodoroStageAlarmName(session.id, 2, 'FOCUS', pState.phaseStartedAt);
  await assert.rejects(
    async () => {
      await h.coordinator.advancePomodoroStage(wrongIntervalAlarm);
    },
    /Invalid or forged alarm name for Pomodoro Stopwatch/
  );

  // 3. Wrong phase (SHORT_BREAK instead of FOCUS)
  const wrongPhaseAlarm = buildPomodoroStageAlarmName(session.id, pState.currentInterval, 'SHORT_BREAK', pState.phaseStartedAt);
  await assert.rejects(
    async () => {
      await h.coordinator.advancePomodoroStage(wrongPhaseAlarm);
    },
    /Invalid or forged alarm name for Pomodoro Stopwatch/
  );

  // 4. Stale timestamp (phase already superseded) -> ignored no-op, not forged
  const staleTimestampAlarm = buildPomodoroStageAlarmName(session.id, pState.currentInterval, 'FOCUS', pState.phaseStartedAt - 60000);
  const staleResult = await h.coordinator.advancePomodoroStage(staleTimestampAlarm);
  const afterStale = await h.storage.getCurrentSession();
  assert.strictEqual(staleResult?.pomodoroState?.currentPhase, 'FOCUS');
  assert.strictEqual(afterStale?.pomodoroState?.currentPhase, 'FOCUS');
  assert.strictEqual(afterStale?.pomodoroState?.currentInterval, pState.currentInterval);
  assert.strictEqual(afterStale?.pomodoroState?.completedFocusCount, pState.completedFocusCount);
  assert.strictEqual(afterStale?.pomodoroState?.phaseStartedAt, pState.phaseStartedAt);
});

test('Pomodoro Stopwatch security: legitimate stage alarm matching active session, interval, and phase advances successfully', async () => {
  const h = createTestHarness();
  const profile = await h.profileManager.createProfile('Legitimate Alarm Test', ['wikipedia.org']);

  const session = await h.coordinator.startSession('POMODORO_STOPWATCH', 25, profile.id, {
    focusDurationMinutes: 25,
    shortBreakDurationMinutes: 5,
    longBreakDurationMinutes: 15,
    targetFocusSessions: 4,
  });

  const pState = session.pomodoroState!;
  const legitimateAlarmName = buildPomodoroStageAlarmName(
    session.id,
    pState.currentInterval,
    'FOCUS',
    pState.phaseStartedAt
  );

  // Advancing with the exact legitimate alarm created for this stage
  const advanced = await h.coordinator.advancePomodoroStage(legitimateAlarmName);
  assert.ok(advanced !== null);
  assert.strictEqual(advanced.pomodoroState?.currentPhase, 'SHORT_BREAK');
  assert.strictEqual(advanced.pomodoroState?.completedFocusCount, 1);
  assert.strictEqual(advanced.pomodoroState?.accumulatedCoins, 25); // 25m * 1.0 = 25
  assert.strictEqual(advanced.pomodoroState?.accumulatedXp, 75);    // 25m * 3.0 = 75

  // Website blocking must be cleared during break
  const rules = await h.dnr.getDynamicRules();
  assert.strictEqual(rules.length, 0, 'Rules must be cleared in break');
});

test('Pomodoro Stopwatch security: MessageHandler rejects ADVANCE_POMODORO_STAGE from client and ignores client-forged alarm payloads', async () => {
  const h = createTestHarness();
  const profile = await h.profileManager.createProfile('Client Security Test', ['wikipedia.org']);

  const session = await h.coordinator.startSession('POMODORO_STOPWATCH', 25, profile.id, {
    focusDurationMinutes: 25,
    shortBreakDurationMinutes: 5,
    longBreakDurationMinutes: 15,
    targetFocusSessions: 4,
  });

  const pState = session.pomodoroState!;
  const validAlarmString = buildPomodoroStageAlarmName(
    session.id,
    pState.currentInterval,
    'FOCUS',
    pState.phaseStartedAt
  );

  // 1. Client sends ADVANCE_POMODORO_STAGE without payload
  const res1 = await h.messageHandler.handleMessage({ action: 'ADVANCE_POMODORO_STAGE' });
  assert.strictEqual(res1.success, false);
  assert.match(res1.error || '', /Manual early interval completion is prohibited in Pomodoro Stopwatch/);

  // 2. Client attempts to bypass by injecting fromAlarmName in payload
  const res2 = await h.messageHandler.handleMessage({
    action: 'ADVANCE_POMODORO_STAGE',
    payload: { fromAlarmName: validAlarmString } as unknown,
  });
  assert.strictEqual(res2.success, false, 'Client must not be able to bypass via payload');
  assert.match(res2.error || '', /Manual early interval completion is prohibited in Pomodoro Stopwatch/);
});

test('Pomodoro Break security: SKIP_POMODORO_BREAK is prohibited during FOCUS, but succeeds during Break without alarm', async () => {
  const h = createTestHarness();
  const profile = await h.profileManager.createProfile('Break Skip Test', ['wikipedia.org']);

  const session = await h.coordinator.startSession('POMODORO_STOPWATCH', 25, profile.id, {
    focusDurationMinutes: 25,
    shortBreakDurationMinutes: 5,
    longBreakDurationMinutes: 15,
    targetFocusSessions: 4,
  });

  // 1. In FOCUS phase: SKIP_POMODORO_BREAK must be rejected
  const res1 = await h.messageHandler.handleMessage({ action: 'SKIP_POMODORO_BREAK' });
  assert.strictEqual(res1.success, false);
  assert.match(res1.error || '', /Cannot skip break while in Focus phase/);

  // 2. Legitimate alarm completes Focus 1 and enters SHORT_BREAK
  const pState = session.pomodoroState!;
  const legitAlarm = buildPomodoroStageAlarmName(session.id, pState.currentInterval, 'FOCUS', pState.phaseStartedAt);
  await h.coordinator.advancePomodoroStage(legitAlarm);

  const inBreak = await h.storage.getCurrentSession();
  assert.strictEqual(inBreak?.pomodoroState?.currentPhase, 'SHORT_BREAK');

  // 3. In SHORT_BREAK: user clicks "Skip Break & Start Next Focus" via SKIP_POMODORO_BREAK
  const res2 = await h.messageHandler.handleMessage({ action: 'SKIP_POMODORO_BREAK' });
  assert.strictEqual(res2.success, true);

  const backInFocus = await h.storage.getCurrentSession();
  assert.strictEqual(backInFocus?.pomodoroState?.currentPhase, 'FOCUS');
  assert.strictEqual(backInFocus?.pomodoroState?.currentInterval, 2);

  // Blocking must be restored in Focus 2
  const rules = await h.dnr.getDynamicRules();
  assert.ok(rules.length > 0, 'Blocking must be restored when entering next Focus');
});

test('Pomodoro Stopwatch lifecycle recovery: reconcileActiveSession re-schedules stage alarm or advances if duration elapsed', async () => {
  const h = createTestHarness();
  const profile = await h.profileManager.createProfile('Lifecycle Test', ['wikipedia.org']);

  await h.coordinator.startSession('POMODORO_STOPWATCH', 25, profile.id, {
    focusDurationMinutes: 25,
    shortBreakDurationMinutes: 5,
    longBreakDurationMinutes: 15,
    targetFocusSessions: 4,
  });

  // Verify alarm was scheduled on startSession
  const alarmKeys = Array.from(h.alarms.alarms.keys());
  assert.ok(alarmKeys.length > 0);
  assert.ok(alarmKeys[0].startsWith('FQ_ALARM_POMODORO_STAGE_'));

  // Simulate computer slept for 30 minutes (exceeded 25m interval duration)
  const thirtyMinsAgo = Date.now() - 30 * 60 * 1000;
  await h.storage.updateCurrentSession((s) => ({
    ...s!,
    startedAt: thirtyMinsAgo,
    pomodoroState: {
      ...s!.pomodoroState!,
      phaseStartedAt: thirtyMinsAgo,
    },
  }));

  // Reconcile on wake-up
  const recovered = await h.coordinator.recoverSession();
  assert.strictEqual(recovered?.pomodoroState?.currentPhase, 'SHORT_BREAK', 'Must advance to Break upon wake-up');
  assert.strictEqual(recovered?.pomodoroState?.completedFocusCount, 1);
  assert.strictEqual(recovered?.pomodoroState?.accumulatedCoins, 25);
});

test('TimeCalculator: stepper helpers for cycles and intervals per cycle respect bounds', () => {
  // stepPomodoroCycles: 1 to 10
  assert.strictEqual(TimeCalculator.stepPomodoroCycles(1, -1), 1, 'Cannot decrease below 1');
  assert.strictEqual(TimeCalculator.stepPomodoroCycles(3, 1), 4);
  assert.strictEqual(TimeCalculator.stepPomodoroCycles(10, 1), 10, 'Cannot increase above 10');

  // stepPomodoroIntervalsPerCycle: 2 to 10
  assert.strictEqual(TimeCalculator.stepPomodoroIntervalsPerCycle(2, -1), 2, 'Cannot decrease below 2');
  assert.strictEqual(TimeCalculator.stepPomodoroIntervalsPerCycle(4, 1), 5);
  assert.strictEqual(TimeCalculator.stepPomodoroIntervalsPerCycle(10, 1), 10, 'Cannot increase above 10');
});
