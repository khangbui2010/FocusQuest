import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TimeCalculator } from '../../src/core/timer/timeCalculator.ts';
import { MultiplierRules } from '../../src/core/reward/multiplierRules.ts';
import { DEFAULT_REWARD_CONFIG } from '../../src/core/reward/rewardEngine.ts';
import { DEFAULT_POMODORO_CONFIG, PomodoroConfig } from '../../src/types/session.ts';
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

// ============================================================================
// CHECKLIST A: Pomodoro Countdown Total Reward
// ============================================================================

test('Checklist A1: Default config displays correct Total Reward (25m x 4 x 3 = 300m -> x2.5 -> 1125 Coins, 3750 XP)', async () => {
  const h = createTestHarness();
  const profile = await h.profileManager.createProfile('Default CD', ['docs.google.com']);

  // Start with default Pomodoro config (25m, 4 intervals, 3 cycles)
  const session = await h.coordinator.startSession(
    'POMODORO_COUNTDOWN',
    DEFAULT_POMODORO_CONFIG.focusDurationMinutes,
    profile.id,
    DEFAULT_POMODORO_CONFIG
  );

  assert.strictEqual(session.lockedMultiplier, 2.5);
  assert.strictEqual(session.pomodoroState?.accumulatedCoins, 1125);
  assert.strictEqual(session.pomodoroState?.accumulatedXp, 3750);
});

test('Checklist A2-A4: Modifying duration, intervals per cycle, or number of cycles recalculates Total Reward preview', () => {
  // Test changes dynamically
  const calc = (focus: number, intervals: number, cycles: number) => {
    const totalMinutes = focus * intervals * cycles;
    const mult = MultiplierRules.getCountdownMultiplier(totalMinutes);
    const coins = totalMinutes * 1.5 * mult;
    const xp = totalMinutes * 5.0 * mult;
    return { totalMinutes, mult, coins, xp };
  };

  // Base: 25m, 4 intervals, 3 cycles -> 300m -> 2.5x
  const base = calc(25, 4, 3);
  assert.strictEqual(base.coins, 1125);

  // Change focus duration to 15m: 15m * 4 * 3 = 180m -> 2.5x -> 180 * 1.5 * 2.5 = 675 Coins
  const durChange = calc(15, 4, 3);
  assert.strictEqual(durChange.totalMinutes, 180);
  assert.strictEqual(durChange.mult, 2.5);
  assert.strictEqual(durChange.coins, 675);

  // Change intervals per cycle to 2: 25m * 2 * 3 = 150m -> 2.0x -> 150 * 1.5 * 2.0 = 450 Coins
  const intChange = calc(25, 2, 3);
  assert.strictEqual(intChange.totalMinutes, 150);
  assert.strictEqual(intChange.mult, 2.0);
  assert.strictEqual(intChange.coins, 450);

  // Change number of cycles to 1: 25m * 4 * 1 = 100m -> 1.6x -> 100 * 1.5 * 1.6 = 240 Coins
  const cycChange = calc(25, 4, 1);
  assert.strictEqual(cycChange.totalMinutes, 100);
  assert.strictEqual(cycChange.mult, 1.6);
  assert.strictEqual(cycChange.coins, 240);
});

test('Checklist A5: Multiplier verified across all official thresholds (5-29, 30-59, 60-89, 90-119, 120-149, 150-179, >=180)', () => {
  assert.strictEqual(MultiplierRules.getCountdownMultiplier(5), 1.0);
  assert.strictEqual(MultiplierRules.getCountdownMultiplier(29), 1.0);
  assert.strictEqual(MultiplierRules.getCountdownMultiplier(30), 1.2);
  assert.strictEqual(MultiplierRules.getCountdownMultiplier(59), 1.2);
  assert.strictEqual(MultiplierRules.getCountdownMultiplier(60), 1.4);
  assert.strictEqual(MultiplierRules.getCountdownMultiplier(89), 1.4);
  assert.strictEqual(MultiplierRules.getCountdownMultiplier(90), 1.6);
  assert.strictEqual(MultiplierRules.getCountdownMultiplier(119), 1.6);
  assert.strictEqual(MultiplierRules.getCountdownMultiplier(120), 1.8);
  assert.strictEqual(MultiplierRules.getCountdownMultiplier(149), 1.8);
  assert.strictEqual(MultiplierRules.getCountdownMultiplier(150), 2.0);
  assert.strictEqual(MultiplierRules.getCountdownMultiplier(179), 2.0);
  assert.strictEqual(MultiplierRules.getCountdownMultiplier(180), 2.5);
  assert.strictEqual(MultiplierRules.getCountdownMultiplier(300), 2.5);
});

test('Checklist A6-A8: Actual settlement matches preview, occurs exactly once, incomplete intervals excluded on give up', async () => {
  const h = createTestHarness();
  const profile = await h.profileManager.createProfile('Settlement CD', ['docs.google.com']);

  const cfg: PomodoroConfig = {
    focusDurationMinutes: 10,
    shortBreakDurationMinutes: 2,
    longBreakDurationMinutes: 5,
    targetFocusSessions: 2,
    numberOfCycles: 1, // 2 intervals = 20m total -> 1.0x -> 30 Coins, 100 XP
  };

  const session = await h.coordinator.startSession('POMODORO_COUNTDOWN', 10, profile.id, cfg);
  assert.strictEqual(session.pomodoroState?.accumulatedCoins, 30);
  assert.strictEqual(session.pomodoroState?.accumulatedXp, 100);

  // Interval 1 completes -> SB
  await h.coordinator.advancePomodoroStage();
  let economy = await h.storage.getEconomy();
  assert.strictEqual(economy.focusCoins, 0, 'No settlement before 100%');

  // SB -> Interval 2
  await h.coordinator.advancePomodoroStage();

  // Interval 2 completes -> 100% quest completion
  const completed = await h.coordinator.advancePomodoroStage();
  assert.strictEqual(completed?.status, 'COMPLETED');

  // Settlement matches preview exactly
  economy = await h.storage.getEconomy();
  assert.strictEqual(economy.focusCoins, 30);
  assert.strictEqual(economy.totalXP, 100);

  // Secondary call cannot double settle
  const reAdvance = await h.coordinator.advancePomodoroStage();
  assert.strictEqual(reAdvance?.status, 'COMPLETED');
  const economy2 = await h.storage.getEconomy();
  assert.strictEqual(economy2.focusCoins, 30);
});

test('Checklist A8: Countdown Give Up (ABANDONED) awards 0 Coins/XP even if some intervals completed', async () => {
  const h = createTestHarness();
  const profile = await h.profileManager.createProfile('GiveUp CD', ['docs.google.com']);

  const cfg: PomodoroConfig = {
    focusDurationMinutes: 25,
    shortBreakDurationMinutes: 5,
    longBreakDurationMinutes: 15,
    targetFocusSessions: 4,
    numberOfCycles: 2,
  };

  await h.coordinator.startSession('POMODORO_COUNTDOWN', 25, profile.id, cfg);
  // Complete Interval 1 -> SB
  await h.coordinator.advancePomodoroStage();
  // SB -> Interval 2
  await h.coordinator.advancePomodoroStage();

  // User gives up during Interval 2
  const givenUp = await h.coordinator.giveUpCountdown();
  assert.strictEqual(givenUp.status, 'ABANDONED');

  const economy = await h.storage.getEconomy();
  assert.strictEqual(economy.focusCoins, 0);
  assert.strictEqual(economy.totalXP, 0);
});

// ============================================================================
// CHECKLIST B: Pomodoro Stopwatch Accumulated Reward
// ============================================================================

test('Checklist B1-B5: Pomodoro Stopwatch starts at 0, does not increase during running Focus, updates only after full interval completes with new multiplier', async () => {
  const h = createTestHarness();
  const profile = await h.profileManager.createProfile('SW Flow', ['wikipedia.org']);

  const session = await h.coordinator.startSession('POMODORO_STOPWATCH', 25, profile.id, {
    focusDurationMinutes: 25,
    shortBreakDurationMinutes: 5,
    longBreakDurationMinutes: 15,
    targetFocusSessions: 4,
  });

  // 1. Starts with 0 reward
  assert.strictEqual(session.pomodoroState?.accumulatedCoins, 0);
  assert.strictEqual(session.pomodoroState?.accumulatedXp, 0);
  assert.strictEqual(session.pomodoroState?.completedFocusCount, 0);

  // 2. While focus is running, economy remains 0
  let economy = await h.storage.getEconomy();
  assert.strictEqual(economy.focusCoins, 0);

  // Complete Interval 1 (25m total -> 1.0x tier)
  const pState1 = session.pomodoroState!;
  const alarm1 = buildPomodoroStageAlarmName(session.id, pState1.currentInterval, 'FOCUS', pState1.phaseStartedAt);
  const step1 = await h.coordinator.advancePomodoroStage(alarm1);

  // 3. Accumulated reward updates after Interval 1 completes (25m * 1.0 * 1.0 = 25 Coins, 75 XP)
  assert.strictEqual(step1?.pomodoroState?.completedFocusCount, 1);
  assert.strictEqual(step1?.pomodoroState?.totalCompletedFocusMinutes, 25);
  assert.strictEqual(step1?.pomodoroState?.accumulatedCoins, 25);
  assert.strictEqual(step1?.pomodoroState?.accumulatedXp, 75);

  // In Break: Skip to next Focus (Interval 2)
  const step2 = await h.coordinator.advancePomodoroStage();
  assert.strictEqual(step2?.pomodoroState?.currentPhase, 'FOCUS');
  assert.strictEqual(step2?.pomodoroState?.currentInterval, 2);

  // Complete Interval 2 (50m total -> 1.2x tier!)
  const pState2 = step2!.pomodoroState!;
  const alarm2 = buildPomodoroStageAlarmName(session.id, pState2.currentInterval, 'FOCUS', pState2.phaseStartedAt);
  const step3 = await h.coordinator.advancePomodoroStage(alarm2);

  // 4-5. Multiplier recalculated on entire completed focus time (50m * 1.0 * 1.2 = 60 Coins, 50 * 3.0 * 1.2 = 180 XP)
  assert.strictEqual(step3?.pomodoroState?.completedFocusCount, 2);
  assert.strictEqual(step3?.pomodoroState?.totalCompletedFocusMinutes, 50);
  assert.strictEqual(step3?.pomodoroState?.accumulatedCoins, 60);
  assert.strictEqual(step3?.pomodoroState?.accumulatedXp, 180);
});

test('Checklist B6-B8: Pause and Break times do NOT count towards Completed Focus Time; single settlement when Finished', async () => {
  const h = createTestHarness();
  const profile = await h.profileManager.createProfile('Pause SW', ['wikipedia.org']);

  const session = await h.coordinator.startSession('POMODORO_STOPWATCH', 25, profile.id, {
    focusDurationMinutes: 25,
    shortBreakDurationMinutes: 5,
    longBreakDurationMinutes: 15,
    targetFocusSessions: 4,
  });

  // Pause session during Focus 1
  await h.coordinator.pauseSession();
  await h.coordinator.resumeSession(false);

  // Complete Interval 1 via legitimate alarm
  const pState = session.pomodoroState!;
  const alarm1 = buildPomodoroStageAlarmName(session.id, pState.currentInterval, 'FOCUS', pState.phaseStartedAt);
  const step1 = await h.coordinator.advancePomodoroStage(alarm1);

  // Only the 25m Focus is counted
  assert.strictEqual(step1?.pomodoroState?.totalCompletedFocusMinutes, 25);
  assert.strictEqual(step1?.pomodoroState?.accumulatedCoins, 25);

  // User finishes session from Short Break
  const finishRes = await h.coordinator.finishStopwatch();
  assert.strictEqual(finishRes.coinsEarned, 25);
  assert.strictEqual(finishRes.xpEarned, 75);

  const economy = await h.storage.getEconomy();
  assert.strictEqual(economy.focusCoins, 25);
  assert.strictEqual(economy.totalXP, 75);
});

// ============================================================================
// CHECKLIST C: Pomodoro Stopwatch Manual Finish
// ============================================================================

test('Checklist C1: Finish in Interval 1 (< 1 interval completed) -> 0 reward', async () => {
  const h = createTestHarness();
  const profile = await h.profileManager.createProfile('Finish Int1', ['wikipedia.org']);

  await h.coordinator.startSession('POMODORO_STOPWATCH', 25, profile.id, {
    focusDurationMinutes: 25,
    shortBreakDurationMinutes: 5,
    longBreakDurationMinutes: 15,
    targetFocusSessions: 4,
  });

  // Finish immediately while still in Focus 1
  const res = await h.coordinator.finishStopwatch();
  assert.strictEqual(res.coinsEarned, 0);
  assert.strictEqual(res.xpEarned, 0);

  const economy = await h.storage.getEconomy();
  assert.strictEqual(economy.focusCoins, 0);
  assert.strictEqual(economy.totalXP, 0);
});

test('Checklist C2: Finish in Interval 2 (in-progress) -> only Interval 1 rewarded', async () => {
  const h = createTestHarness();
  const profile = await h.profileManager.createProfile('Finish Int2', ['wikipedia.org']);

  const session = await h.coordinator.startSession('POMODORO_STOPWATCH', 25, profile.id, {
    focusDurationMinutes: 25,
    shortBreakDurationMinutes: 5,
    longBreakDurationMinutes: 15,
    targetFocusSessions: 4,
  });

  // Complete Focus 1
  const pState = session.pomodoroState!;
  const alarm1 = buildPomodoroStageAlarmName(session.id, pState.currentInterval, 'FOCUS', pState.phaseStartedAt);
  await h.coordinator.advancePomodoroStage(alarm1);
  // Skip Short Break -> Focus 2
  await h.coordinator.advancePomodoroStage();

  // Finish mid-way during Focus 2
  const res = await h.coordinator.finishStopwatch();
  // Only 1 completed interval (25m -> 1.0x -> 25 Coins, 75 XP)
  assert.strictEqual(res.coinsEarned, 25);
  assert.strictEqual(res.xpEarned, 75);

  const economy = await h.storage.getEconomy();
  assert.strictEqual(economy.focusCoins, 25);
  assert.strictEqual(economy.totalXP, 75);
});

test('Checklist C3-C5: Finish in Break or in Cycle 2 awards all completed intervals across cycles', async () => {
  const h = createTestHarness();
  const profile = await h.profileManager.createProfile('Finish Cyc2', ['wikipedia.org']);

  const session = await h.coordinator.startSession('POMODORO_STOPWATCH', 25, profile.id, {
    focusDurationMinutes: 25,
    shortBreakDurationMinutes: 5,
    longBreakDurationMinutes: 15,
    targetFocusSessions: 2, // 2 intervals per cycle
  });

  // Complete Focus 1
  let s = session;
  let alarm = buildPomodoroStageAlarmName(s.id, s.pomodoroState!.currentInterval, 'FOCUS', s.pomodoroState!.phaseStartedAt);
  s = (await h.coordinator.advancePomodoroStage(alarm))!;
  // SB 1 -> Focus 2
  s = (await h.coordinator.advancePomodoroStage())!;
  // Complete Focus 2 (50m total -> Long Break!)
  alarm = buildPomodoroStageAlarmName(s.id, s.pomodoroState!.currentInterval, 'FOCUS', s.pomodoroState!.phaseStartedAt);
  s = (await h.coordinator.advancePomodoroStage(alarm))!;
  assert.strictEqual(s.pomodoroState?.currentPhase, 'LONG_BREAK');

  // Long Break -> Cycle 2 Focus 1!
  s = (await h.coordinator.advancePomodoroStage())!;
  assert.strictEqual(s.pomodoroState?.currentCycle, 2);
  assert.strictEqual(s.pomodoroState?.currentInterval, 1);

  // Complete Cycle 2 Focus 1 (75m total -> 1.4x!)
  alarm = buildPomodoroStageAlarmName(s.id, s.pomodoroState!.currentInterval, 'FOCUS', s.pomodoroState!.phaseStartedAt);
  s = (await h.coordinator.advancePomodoroStage(alarm))!;
  assert.strictEqual(s.pomodoroState?.currentPhase, 'SHORT_BREAK');
  assert.strictEqual(s.pomodoroState?.completedFocusCount, 3);
  assert.strictEqual(s.pomodoroState?.accumulatedCoins, 105); // 75 * 1.0 * 1.4

  // Finish in Short Break of Cycle 2
  const res = await h.coordinator.finishStopwatch();
  assert.strictEqual(res.coinsEarned, 105);
  assert.strictEqual(res.xpEarned, 315);

  const economy = await h.storage.getEconomy();
  assert.strictEqual(economy.focusCoins, 105);
  assert.strictEqual(economy.totalXP, 315);

  // Checklist C6: Duplicate calls to finish cannot double claim
  const dup = await h.coordinator.finishStopwatch();
  assert.strictEqual(dup.coinsEarned, 0);
  assert.strictEqual(dup.xpEarned, 0);
  const economyAfter = await h.storage.getEconomy();
  assert.strictEqual(economyAfter.focusCoins, 105);
});

test('Checklist C7: Extension disabled during Pomodoro Stopwatch yields strictly INTERRUPTED with 0 reward per Section VII.B', async () => {
  const h = createTestHarness();
  const profile = await h.profileManager.createProfile('Disable SW', ['wikipedia.org']);

  const session = await h.coordinator.startSession('POMODORO_STOPWATCH', 25, profile.id, {
    focusDurationMinutes: 25,
    shortBreakDurationMinutes: 5,
    longBreakDurationMinutes: 15,
    targetFocusSessions: 4,
  });

  // Complete Focus 1
  const pState = session.pomodoroState!;
  const alarm1 = buildPomodoroStageAlarmName(session.id, pState.currentInterval, 'FOCUS', pState.phaseStartedAt);
  await h.coordinator.advancePomodoroStage(alarm1);

  // Extension disabled event occurs
  const interrupted = await h.coordinator.handleLifecycleEvent({ reason: 'EXTENSION_RE_ENABLED' });
  assert.strictEqual(interrupted?.status, 'INTERRUPTED');
  assert.strictEqual(interrupted?.interruptedReason, 'EXTENSION_DISABLED');

  // Rewards strictly 0
  const economy = await h.storage.getEconomy();
  assert.strictEqual(economy.focusCoins, 0);
  assert.strictEqual(economy.totalXP, 0);
});

// ============================================================================
// CHECKLIST D: Pomodoro Stopwatch Infinite Cycles
// ============================================================================

test('Checklist D1-D5: Pomodoro Stopwatch seamlessly advances through Cycle 1 -> Cycle 2 -> Cycle 3 without limits, resetting interval to 1 on each new cycle', async () => {
  const h = createTestHarness();
  const profile = await h.profileManager.createProfile('Infinite Cycles', ['github.com']);

  let session = await h.coordinator.startSession('POMODORO_STOPWATCH', 25, profile.id, {
    focusDurationMinutes: 25,
    shortBreakDurationMinutes: 5,
    longBreakDurationMinutes: 15,
    targetFocusSessions: 2, // 2 intervals per cycle
  });

  assert.strictEqual(session.pomodoroState?.currentCycle, 1);
  assert.strictEqual(session.pomodoroState?.currentInterval, 1);

  // --- CYCLE 1 ---
  // Focus 1 -> SB 1
  let alarm = buildPomodoroStageAlarmName(session.id, session.pomodoroState!.currentInterval, 'FOCUS', session.pomodoroState!.phaseStartedAt);
  session = (await h.coordinator.advancePomodoroStage(alarm))!;
  // SB 1 -> Focus 2
  session = (await h.coordinator.advancePomodoroStage())!;
  assert.strictEqual(session.pomodoroState?.currentCycle, 1);
  assert.strictEqual(session.pomodoroState?.currentInterval, 2);

  // Focus 2 -> LB (Cycle 1 complete)
  alarm = buildPomodoroStageAlarmName(session.id, session.pomodoroState!.currentInterval, 'FOCUS', session.pomodoroState!.phaseStartedAt);
  session = (await h.coordinator.advancePomodoroStage(alarm))!;
  assert.strictEqual(session.pomodoroState?.currentPhase, 'LONG_BREAK');
  assert.strictEqual(session.pomodoroState?.currentCycle, 1);

  // --- CYCLE 2 ---
  // LB -> Cycle 2 Focus 1
  session = (await h.coordinator.advancePomodoroStage())!;
  assert.strictEqual(session.pomodoroState?.currentPhase, 'FOCUS');
  assert.strictEqual(session.pomodoroState?.currentCycle, 2, 'Must increment to Cycle 2');
  assert.strictEqual(session.pomodoroState?.currentInterval, 1, 'Interval must reset to 1');

  // Cycle 2 Focus 1 -> SB 1
  alarm = buildPomodoroStageAlarmName(session.id, session.pomodoroState!.currentInterval, 'FOCUS', session.pomodoroState!.phaseStartedAt);
  session = (await h.coordinator.advancePomodoroStage(alarm))!;
  // SB 1 -> Cycle 2 Focus 2
  session = (await h.coordinator.advancePomodoroStage())!;
  assert.strictEqual(session.pomodoroState?.currentCycle, 2);
  assert.strictEqual(session.pomodoroState?.currentInterval, 2);

  // Cycle 2 Focus 2 -> LB (Cycle 2 complete)
  alarm = buildPomodoroStageAlarmName(session.id, session.pomodoroState!.currentInterval, 'FOCUS', session.pomodoroState!.phaseStartedAt);
  session = (await h.coordinator.advancePomodoroStage(alarm))!;
  assert.strictEqual(session.pomodoroState?.currentPhase, 'LONG_BREAK');
  assert.strictEqual(session.pomodoroState?.currentCycle, 2);

  // --- CYCLE 3 ---
  // LB -> Cycle 3 Focus 1
  session = (await h.coordinator.advancePomodoroStage())!;
  assert.strictEqual(session.pomodoroState?.currentPhase, 'FOCUS');
  assert.strictEqual(session.pomodoroState?.currentCycle, 3, 'Must increment to Cycle 3');
  assert.strictEqual(session.pomodoroState?.currentInterval, 1, 'Interval must reset to 1');
  assert.strictEqual(session.pomodoroState?.completedFocusCount, 4);
});

test('Checklist D6: State recovery preserves Cycle and Interval across SW restarts', async () => {
  const h = createTestHarness();
  const profile = await h.profileManager.createProfile('Recovery Cyc', ['github.com']);

  let session = await h.coordinator.startSession('POMODORO_STOPWATCH', 25, profile.id, {
    focusDurationMinutes: 25,
    shortBreakDurationMinutes: 5,
    longBreakDurationMinutes: 15,
    targetFocusSessions: 2,
  });

  // Complete Cycle 1 Focus 1
  let alarm = buildPomodoroStageAlarmName(session.id, session.pomodoroState!.currentInterval, 'FOCUS', session.pomodoroState!.phaseStartedAt);
  session = (await h.coordinator.advancePomodoroStage(alarm))!;
  // SB 1 -> Focus 2
  session = (await h.coordinator.advancePomodoroStage())!;
  // Focus 2 -> LB
  alarm = buildPomodoroStageAlarmName(session.id, session.pomodoroState!.currentInterval, 'FOCUS', session.pomodoroState!.phaseStartedAt);
  session = (await h.coordinator.advancePomodoroStage(alarm))!;
  // LB -> Cycle 2 Focus 1
  session = (await h.coordinator.advancePomodoroStage())!;

  assert.strictEqual(session.pomodoroState?.currentCycle, 2);
  assert.strictEqual(session.pomodoroState?.currentInterval, 1);

  // Simulate Service Worker termination and wake-up
  const recovered = await h.coordinator.recoverSession({ reason: 'SERVICE_WORKER_WAKE' });
  assert.strictEqual(recovered?.status, 'RUNNING');
  assert.strictEqual(recovered?.pomodoroState?.currentCycle, 2, 'Preserves Cycle 2 on recovery');
  assert.strictEqual(recovered?.pomodoroState?.currentInterval, 1, 'Preserves Interval 1 on recovery');
  assert.strictEqual(recovered?.pomodoroState?.currentPhase, 'FOCUS');
});
