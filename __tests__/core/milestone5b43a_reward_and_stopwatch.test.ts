import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MultiplierRules } from '../../src/core/reward/multiplierRules.ts';
import { RewardEngine, DEFAULT_REWARD_CONFIG } from '../../src/core/reward/rewardEngine.ts';
import { MemoryStorageAdapter } from '../../src/storage/memoryStorageAdapter.ts';
import { StorageManager } from '../../src/storage/storageManager.ts';
import { ProfileManager } from '../../src/core/profiles/profileManager.ts';
import {
  MockAlarmsAdapter,
  MockNotificationsAdapter,
  MockBadgeAdapter,
  MockDNRAdapter,
} from '../mocks/chromeMock.ts';
import { BlockingCoordinator } from '../../src/background/blockingCoordinator.ts';
import { SessionCoordinator } from '../../src/background/sessionCoordinator.ts';
import { sendExtensionMessage } from '../../src/ui/services/extensionClient.ts';
import { SessionSnapshot, PomodoroConfig, DEFAULT_POMODORO_CONFIG } from '../../src/types/session.ts';
import { FullSessionStateResponse } from '../../src/types/messages.ts';
import { getLocalDateKey } from '../../src/core/utils/dateUtils.ts';

function createTestHarness() {
  const adapter = new MemoryStorageAdapter();
  const storage = new StorageManager(adapter);
  const profileManager = new ProfileManager(storage);
  const alarms = new MockAlarmsAdapter();
  const notifications = new MockNotificationsAdapter();
  const badge = new MockBadgeAdapter();
  const dnr = new MockDNRAdapter();
  const blockingCoordinator = new BlockingCoordinator(dnr);

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
    blockingCoordinator,
    coordinator,
  };
}

// -------------------------------------------------------------
// 1. ISS-09: MultiplierRules.resolveMultiplier with POMODORO_COUNTDOWN
// -------------------------------------------------------------
test('MultiplierRules.resolveMultiplier: correctly resolves POMODORO_COUNTDOWN and STOPWATCH thresholds', () => {
  // POMODORO_COUNTDOWN uses locked targetMinutes (totalQuestMinutes)
  assert.strictEqual(
    MultiplierRules.resolveMultiplier({ mode: 'POMODORO_COUNTDOWN', targetMinutes: 25, actualFocusMinutes: 0 }),
    1.0
  );
  assert.strictEqual(
    MultiplierRules.resolveMultiplier({ mode: 'POMODORO_COUNTDOWN', targetMinutes: 60, actualFocusMinutes: 0 }),
    1.4
  );
  assert.strictEqual(
    MultiplierRules.resolveMultiplier({ mode: 'POMODORO_COUNTDOWN', targetMinutes: 150, actualFocusMinutes: 0 }),
    2.0
  );
  assert.strictEqual(
    MultiplierRules.resolveMultiplier({ mode: 'POMODORO_COUNTDOWN', targetMinutes: 180, actualFocusMinutes: 0 }),
    2.5
  );
  assert.strictEqual(
    MultiplierRules.resolveMultiplier({ mode: 'POMODORO_COUNTDOWN', targetMinutes: 300, actualFocusMinutes: 0 }),
    2.5
  );

  // POMODORO_STOPWATCH uses actualFocusMinutes
  assert.strictEqual(
    MultiplierRules.resolveMultiplier({ mode: 'POMODORO_STOPWATCH', targetMinutes: 0, actualFocusMinutes: 25 }),
    1.0
  );
  assert.strictEqual(
    MultiplierRules.resolveMultiplier({ mode: 'POMODORO_STOPWATCH', targetMinutes: 0, actualFocusMinutes: 60 }),
    1.4
  );
  assert.strictEqual(
    MultiplierRules.resolveMultiplier({ mode: 'POMODORO_STOPWATCH', targetMinutes: 0, actualFocusMinutes: 180 }),
    2.5
  );

  // Exact threshold boundary values
  assert.strictEqual(MultiplierRules.getSessionMultiplier(29.9), 1.0);
  assert.strictEqual(MultiplierRules.getSessionMultiplier(30.0), 1.2);
  assert.strictEqual(MultiplierRules.getSessionMultiplier(59.9), 1.2);
  assert.strictEqual(MultiplierRules.getSessionMultiplier(60.0), 1.4);
  assert.strictEqual(MultiplierRules.getSessionMultiplier(89.9), 1.4);
  assert.strictEqual(MultiplierRules.getSessionMultiplier(90.0), 1.6);
  assert.strictEqual(MultiplierRules.getSessionMultiplier(119.9), 1.6);
  assert.strictEqual(MultiplierRules.getSessionMultiplier(120.0), 1.8);
  assert.strictEqual(MultiplierRules.getSessionMultiplier(149.9), 1.8);
  assert.strictEqual(MultiplierRules.getSessionMultiplier(150.0), 2.0);
  assert.strictEqual(MultiplierRules.getSessionMultiplier(179.9), 2.0);
  assert.strictEqual(MultiplierRules.getSessionMultiplier(180.0), 2.5);
  assert.strictEqual(MultiplierRules.getSessionMultiplier(200.0), 2.5);
});

// -------------------------------------------------------------
// 2. ISS-01 & ISS-05: SessionCoordinator Pomodoro Stopwatch paused finish & stats
// -------------------------------------------------------------
test('SessionCoordinator: finishStopwatch while paused in Pomodoro Stopwatch does NOT award incomplete interval, but logs actual minutes to daily stats', async () => {
  const h = createTestHarness();
  const profile = await h.profileManager.createProfile('Study Test', ['test.com']);

  const pomoConfig: PomodoroConfig = {
    ...DEFAULT_POMODORO_CONFIG,
    focusIntervalDurationMinutes: 25,
    shortBreakDurationMinutes: 5,
    longBreakDurationMinutes: 15,
    focusIntervalsPerCycle: 4,
    numberOfCycles: 1,
  };

  // 1. Start Pomodoro Stopwatch
  const session = await h.coordinator.startSession('POMODORO_STOPWATCH', 0, profile.id, pomoConfig);
  assert.strictEqual(session.status, 'RUNNING');
  assert.strictEqual(session.mode, 'POMODORO_STOPWATCH');

  // Fast-forward 10 minutes (focusing for 10 minutes)
  const tenMinutesMs = 10 * 60 * 1000;
  const startedAt = session.startedAt - tenMinutesMs;
  const s1 = await h.storage.getCurrentSession();
  await h.storage.setCurrentSession({
    ...s1!,
    startedAt,
    pomodoroState: {
      ...s1!.pomodoroState!,
      phaseStartedAt: startedAt,
    },
  });

  // Now PAUSE the session
  const pauseTime = Date.now();
  await h.coordinator.pauseSession();

  // Fast-forward 3 minutes while paused
  const threeMinutesMs = 3 * 60 * 1000;
  const currentSession = await h.storage.getCurrentSession();
  const pauseRecord = currentSession!.pauseHistory[0];
  await h.storage.setCurrentSession({
    ...currentSession!,
    pauseHistory: [
      {
        ...pauseRecord,
        pausedAt: pauseTime - threeMinutesMs,
      },
    ],
  });

  // Finish stopwatch while PAUSED
  const result1 = await h.coordinator.finishStopwatch();
  assert.strictEqual(result1.session.status, 'COMPLETED');

  // Verify Rewards: 0 completed intervals -> 0 Coins and 0 XP
  const economy = await h.storage.getEconomy();
  assert.strictEqual(economy.focusCoins, 0, 'No coins awarded for 0 completed focus intervals');
  assert.strictEqual(economy.totalXP, 0, 'No XP awarded for 0 completed focus intervals');

  // Verify Daily Stats: actualFocusMinutes should be 10 minutes (not 0 and not 25!)
  const dailyStats = await h.storage.getDailyStats();
  const todayKey = getLocalDateKey();
  const today = dailyStats[todayKey];
  assert.ok(today, 'Today daily stats should exist');
  assert.strictEqual(today.totalFocusMinutes, 10, 'Daily stats should record the 10 actual focus minutes');
});

test('SessionCoordinator: finishStopwatch with 1 completed interval + 15m in-progress interval while paused awards 1 interval and logs total 40m', async () => {
  const h = createTestHarness();
  const profile = await h.profileManager.createProfile('Study Test', ['test.com']);

  const pomoConfig: PomodoroConfig = {
    ...DEFAULT_POMODORO_CONFIG,
    focusIntervalDurationMinutes: 25,
    shortBreakDurationMinutes: 5,
    longBreakDurationMinutes: 15,
    focusIntervalsPerCycle: 4,
    numberOfCycles: 1,
  };

  // Start Pomodoro Stopwatch
  const session = await h.coordinator.startSession('POMODORO_STOPWATCH', 0, profile.id, pomoConfig);

  // Simulate that Interval 1 was completed (25m), and current state is in Interval 2
  const fifteenMinutesMs = 15 * 60 * 1000;
  const interval2StartedAt = Date.now() - fifteenMinutesMs;
  const s2 = await h.storage.getCurrentSession();
  await h.storage.setCurrentSession({
    ...s2!,
    pomodoroState: {
      ...s2!.pomodoroState!,
      completedFocusCount: 1,
      totalCompletedFocusMinutes: 25,
      currentInterval: 2,
      currentPhase: 'FOCUS',
      phaseStartedAt: interval2StartedAt,
      phaseTotalPauseMs: 0,
    },
  });

  // Pause session for 2 minutes
  await h.coordinator.pauseSession();
  const pausedSession = await h.storage.getCurrentSession();
  const pauseRecord = pausedSession!.pauseHistory[0];
  const twoMinutesMs = 2 * 60 * 1000;
  await h.storage.setCurrentSession({
    ...pausedSession!,
    pauseHistory: [
      {
        ...pauseRecord,
        pausedAt: Date.now() - twoMinutesMs,
      },
    ],
  });

  // Finish stopwatch while paused
  const result2 = await h.coordinator.finishStopwatch();
  assert.strictEqual(result2.session.status, 'COMPLETED');

  // Reward calculation: exactly 1 completed interval = 25 minutes
  // 25 mins * 1.0 Coins/min * 1.0x = 25 Coins
  // 25 mins * 3.0 XP/min * 1.0x = 75 XP
  const economy = await h.storage.getEconomy();
  assert.strictEqual(economy.focusCoins, 25, 'Awarded 25 Coins for 1 completed interval');
  assert.strictEqual(economy.totalXP, 75, 'Awarded 75 XP for 1 completed interval');

  // Daily stats: 25m completed + 15m in-progress = 40m
  const dailyStats2 = await h.storage.getDailyStats();
  const todayKey2 = getLocalDateKey();
  const today2 = dailyStats2[todayKey2];
  assert.ok(today2, 'Today daily stats should exist');
  assert.strictEqual(today2.totalFocusMinutes, 40, 'Daily stats should record 40 actual focus minutes');
});

// -------------------------------------------------------------
// 3. ISS-04: ExtensionClient Preview Simulation Pomodoro Countdown Multiplier
// -------------------------------------------------------------
test('ExtensionClient Simulation: POMODORO_COUNTDOWN locks multiplier based on totalQuestMinutes', async () => {
  // Reset session
  await sendExtensionMessage({ action: 'RESET_SESSION' });

  // Start a Pomodoro Countdown: 25m intervals, 4 intervals per cycle, 3 cycles = 12 intervals * 25m = 300m (2.5x)
  const pomoConfig: PomodoroConfig = {
    ...DEFAULT_POMODORO_CONFIG,
    focusIntervalDurationMinutes: 25,
    shortBreakDurationMinutes: 5,
    longBreakDurationMinutes: 15,
    focusIntervalsPerCycle: 4,
    numberOfCycles: 3,
  };

  const startRes = await sendExtensionMessage<SessionSnapshot>({
    action: 'START_SESSION',
    payload: {
      mode: 'POMODORO_COUNTDOWN',
      targetMinutes: 25,
      profileId: 'profile-study-research',
      pomodoroConfig: pomoConfig,
    },
  });

  assert.strictEqual(startRes.success, true);
  assert.strictEqual(startRes.data?.mode, 'POMODORO_COUNTDOWN');
  assert.strictEqual(
    startRes.data?.lockedMultiplier,
    2.5,
    'Locked multiplier must be 2.5x for 300m total focus duration'
  );

  // Clean up
  await sendExtensionMessage({ action: 'RESET_SESSION' });
});

// -------------------------------------------------------------
// 4. ISS-03: ExtensionClient Preview Simulation Dynamic Stopwatch Rewards
// -------------------------------------------------------------
test('ExtensionClient Simulation: FINISH_STOPWATCH calculates dynamic rewards with RewardEngine, not hardcoded 15/45', async () => {
  await sendExtensionMessage({ action: 'RESET_SESSION' });

  // Start Stopwatch
  await sendExtensionMessage<SessionSnapshot>({
    action: 'START_SESSION',
    payload: {
      mode: 'STOPWATCH',
      targetMinutes: 0,
      profileId: 'profile-study-research',
    },
  });

  // Get initial state
  const stateBefore = await sendExtensionMessage<FullSessionStateResponse>({ action: 'GET_SESSION_STATE' });
  const initialCoins = stateBefore.data!.economy.focusCoins;
  const initialXp = stateBefore.data!.economy.totalXP;

  // Finish stopwatch immediately (< 5 mins elapsed in simulated real time)
  const finishRes = await sendExtensionMessage<SessionSnapshot>({
    action: 'FINISH_STOPWATCH',
  });
  assert.strictEqual(finishRes.success, true);

  // Under 5 minutes -> 0 Coins, 0 XP
  const stateAfter = await sendExtensionMessage<FullSessionStateResponse>({ action: 'GET_SESSION_STATE' });
  assert.strictEqual(
    stateAfter.data!.economy.focusCoins,
    initialCoins,
    'No coins awarded for stopwatch under 5 minutes'
  );
  assert.strictEqual(
    stateAfter.data!.economy.totalXP,
    initialXp,
    'No XP awarded for stopwatch under 5 minutes'
  );

  await sendExtensionMessage({ action: 'RESET_SESSION' });
});

// -------------------------------------------------------------
// 5. Canonical RewardEngine calculation verification table
// -------------------------------------------------------------
test('RewardEngine: Unified Session Multiplier and Additive CoinBonus verification table', () => {
  const engine = new RewardEngine(DEFAULT_REWARD_CONFIG);

  // Cases at 5, 15, 30, 60, 90, 120, 150, 180, 200 minutes
  const testCases = [
    // [minutes, expectedMultiplier, baseRateCoins, baseRateXp]
    { mins: 5, mult: 1.0, cBase: 1.5, xBase: 5 },
    { mins: 15, mult: 1.0, cBase: 1.5, xBase: 5 },
    { mins: 30, mult: 1.2, cBase: 1.5, xBase: 5 },
    { mins: 60, mult: 1.4, cBase: 1.5, xBase: 5 },
    { mins: 90, mult: 1.6, cBase: 1.5, xBase: 5 },
    { mins: 120, mult: 1.8, cBase: 1.5, xBase: 5 },
    { mins: 150, mult: 2.0, cBase: 1.5, xBase: 5 },
    { mins: 180, mult: 2.5, cBase: 1.5, xBase: 5 },
    { mins: 200, mult: 2.5, cBase: 1.5, xBase: 5 },
  ];

  for (const tc of testCases) {
    // 1. Without CoinBonus (B = 0)
    const rewardNoBonus = engine.calculateReward({
      mode: 'COUNTDOWN',
      status: 'COMPLETED',
      targetMinutes: tc.mins,
      actualFocusMinutes: tc.mins,
      coinBonuses: [],
    });
    const expectedCoinsNoBonus = tc.mins * tc.cBase * tc.mult * 1.0;
    const expectedXp = tc.mins * tc.xBase * tc.mult;
    assert.strictEqual(rewardNoBonus.multiplier, tc.mult);
    assert.strictEqual(rewardNoBonus.coinsEarned, expectedCoinsNoBonus);
    assert.strictEqual(rewardNoBonus.xpEarned, expectedXp);

    // 2. With CoinBonus (e.g. B = 0.15 = +15%)
    const rewardWithBonus = engine.calculateReward({
      mode: 'COUNTDOWN',
      status: 'COMPLETED',
      targetMinutes: tc.mins,
      actualFocusMinutes: tc.mins,
      coinBonuses: [
        {
          id: 'bonus_granary',
          source: 'BUILDING',
          rate: 0.15,
        },
      ],
    });
    const expectedCoinsBonus = tc.mins * tc.cBase * tc.mult * 1.15;
    assert.strictEqual(rewardWithBonus.multiplier, tc.mult);
    assert.strictEqual(rewardWithBonus.coinsEarned, expectedCoinsBonus);
    assert.strictEqual(rewardWithBonus.xpEarned, expectedXp, 'XP must be strictly independent of CoinBonus');
  }
});
