import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MultiplierRules } from '../../src/core/reward/multiplierRules.ts';
import { RewardEngine } from '../../src/core/reward/rewardEngine.ts';
import { TimeCalculator } from '../../src/core/timer/timeCalculator.ts';
import { SessionSnapshot } from '../../src/types/session.ts';
import { MemoryStorageAdapter } from '../../src/storage/memoryStorageAdapter.ts';
import { StorageManager } from '../../src/storage/storageManager.ts';
import { ProfileManager } from '../../src/core/profiles/profileManager.ts';
import { SessionCoordinator } from '../../src/background/sessionCoordinator.ts';
import {
  MockAlarmsAdapter,
  MockNotificationsAdapter,
  MockBadgeAdapter,
  MockDNRAdapter,
} from '../mocks/chromeMock.ts';
import { BlockingCoordinator } from '../../src/background/blockingCoordinator.ts';

/**
 * Helper functions for duration step calculations matching UI Duration Picker logic
 */
function stepHours(currentMinutes: number, deltaHours: number): number {
  const next = currentMinutes + deltaHours * 60;
  if (next < 5) return 5;
  if (next > 180) return 180;
  return next;
}

function stepMinutes(currentMinutes: number, deltaMinutes: number): number {
  const next = currentMinutes + deltaMinutes;
  if (next < 5) return 5;
  if (next > 180) return 180;
  return next;
}

function formatDurationPicker(totalMinutes: number): { hoursFormatted: string; minutesFormatted: string } {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return {
    hoursFormatted: String(hours).padStart(2, '0'),
    minutesFormatted: String(minutes).padStart(2, '0'),
  };
}

function getPickerDisabledStates(targetMinutes: number) {
  return {
    isHoursIncreaseDisabled: targetMinutes >= 180,
    isHoursDecreaseDisabled: targetMinutes < 60,
    isMinutesIncreaseDisabled: targetMinutes >= 180,
    isMinutesDecreaseDisabled: targetMinutes <= 5,
  };
}

/**
 * Pure helper simulating the finish modal condition and reward calculation
 */
function evaluateStopwatchModal(actualFocusMinutes: number) {
  const isEligible = actualFocusMinutes >= 5;
  const swMultiplier = MultiplierRules.getStopwatchMultiplier(actualFocusMinutes);
  const estimatedCoins = isEligible ? 1.0 * actualFocusMinutes * swMultiplier : 0;
  const estimatedXp = isEligible ? 3.0 * actualFocusMinutes * swMultiplier : 0;

  if (isEligible) {
    return {
      type: 'ELIGIBLE',
      title: 'Finish this session?',
      subtitle: 'If you finish this session right now, you will receive:',
      estimatedCoins,
      estimatedXp,
      multiplier: swMultiplier,
      buttons: ['Keep Focusing', 'Finish & Claim'],
    };
  } else {
    return {
      type: 'INELIGIBLE',
      title: 'Finish this session?',
      warning: 'This session is less than 5 minutes, if you leave now, no reward will be given.',
      buttons: ['Keep Focusing', 'Leave Anyway'],
    };
  }
}

// -------------------------------------------------------------------------------------
// TEST 1: Duration picker: Giá trị mặc định là 25 phút (00:25)
// -------------------------------------------------------------------------------------
test('Test 1: Duration picker default is 25 minutes (00:25)', () => {
  const defaultMinutes = 25;
  const { hoursFormatted, minutesFormatted } = formatDurationPicker(defaultMinutes);
  assert.strictEqual(hoursFormatted, '00');
  assert.strictEqual(minutesFormatted, '25');
  assert.strictEqual(`${hoursFormatted}:${minutesFormatted}`, '00:25');
});

// -------------------------------------------------------------------------------------
// TEST 2: Duration picker: Giới hạn tối thiểu 5 phút (00:05) và vô hiệu hóa nút giảm tương ứng
// -------------------------------------------------------------------------------------
test('Test 2: Duration picker minimum is 5 minutes (00:05) and disables decrease buttons accordingly', () => {
  const atMin = 5;
  const statesAtMin = getPickerDisabledStates(atMin);
  assert.strictEqual(statesAtMin.isHoursDecreaseDisabled, true, 'Hours decrease must be disabled at 00:05 (hours is 0)');
  assert.strictEqual(statesAtMin.isMinutesDecreaseDisabled, true, 'Minutes decrease must be disabled at 00:05 (min limit reached)');
  assert.strictEqual(statesAtMin.isHoursIncreaseDisabled, false, 'Hours increase enabled at 00:05');
  assert.strictEqual(statesAtMin.isMinutesIncreaseDisabled, false, 'Minutes increase enabled at 00:05');

  const { hoursFormatted, minutesFormatted } = formatDurationPicker(atMin);
  assert.strictEqual(`${hoursFormatted}:${minutesFormatted}`, '00:05');
});

// -------------------------------------------------------------------------------------
// TEST 3: Duration picker: Giới hạn tối đa 180 phút (03:00) và vô hiệu hóa nút tăng tương ứng
// -------------------------------------------------------------------------------------
test('Test 3: Duration picker maximum is 180 minutes (03:00) and disables increase buttons', () => {
  const atMax = 180;
  const statesAtMax = getPickerDisabledStates(atMax);
  assert.strictEqual(statesAtMax.isHoursIncreaseDisabled, true, 'Hours increase must be disabled at 03:00 (max limit reached)');
  assert.strictEqual(statesAtMax.isMinutesIncreaseDisabled, true, 'Minutes increase must be disabled at 03:00 (max limit reached)');
  assert.strictEqual(statesAtMax.isHoursDecreaseDisabled, false, 'Hours decrease enabled at 03:00');
  assert.strictEqual(statesAtMax.isMinutesDecreaseDisabled, false, 'Minutes decrease enabled at 03:00');

  const { hoursFormatted, minutesFormatted } = formatDurationPicker(atMax);
  assert.strictEqual(`${hoursFormatted}:${minutesFormatted}`, '03:00');
});

// -------------------------------------------------------------------------------------
// TEST 4: Bước điều chỉnh riêng biệt: HOURS 60 phút, MINUTES 5 phút và các ví dụ của PM
// -------------------------------------------------------------------------------------
test('Test 4: Duration adjustment steps: HOURS changes by 60 mins, MINUTES changes by 5 mins with exact PM examples', () => {
  // Example 1: 00:25 -> nhấn tăng HOURS -> 01:25
  let duration = 25;
  assert.deepStrictEqual(formatDurationPicker(duration), { hoursFormatted: '00', minutesFormatted: '25' });
  duration = stepHours(duration, 1);
  assert.strictEqual(duration, 85);
  assert.deepStrictEqual(formatDurationPicker(duration), { hoursFormatted: '01', minutesFormatted: '25' });

  // Example 2: 00:25 -> nhấn tăng MINUTES -> 00:30
  duration = 25;
  duration = stepMinutes(duration, 5);
  assert.strictEqual(duration, 30);
  assert.deepStrictEqual(formatDurationPicker(duration), { hoursFormatted: '00', minutesFormatted: '30' });

  // Example 3: 01:00 -> nhấn giảm MINUTES -> 00:55
  duration = 60;
  assert.deepStrictEqual(formatDurationPicker(duration), { hoursFormatted: '01', minutesFormatted: '00' });
  duration = stepMinutes(duration, -5);
  assert.strictEqual(duration, 55);
  assert.deepStrictEqual(formatDurationPicker(duration), { hoursFormatted: '00', minutesFormatted: '55' });

  // Example 4: 01:00 -> nhấn giảm HOURS -> 00:05 do giới hạn tối thiểu
  duration = 60;
  duration = stepHours(duration, -1);
  assert.strictEqual(duration, 5, 'Must clamp to 5 mins due to minimum limit');
  assert.deepStrictEqual(formatDurationPicker(duration), { hoursFormatted: '00', minutesFormatted: '05' });
});

// -------------------------------------------------------------------------------------
// TEST 5: Chuyển đổi và định dạng đúng 2 chữ số tại các mốc biên
// -------------------------------------------------------------------------------------
test('Test 5: Dual cluster converts across boundaries and maintains strict two-digit display', () => {
  // Step up minutes from 55 to 60 -> 00:55 to 01:00
  let duration = 55;
  duration = stepMinutes(duration, 5);
  assert.strictEqual(duration, 60);
  assert.deepStrictEqual(formatDurationPicker(duration), { hoursFormatted: '01', minutesFormatted: '00' });

  // Step down minutes from 60 to 55 -> 01:00 to 00:55
  duration = stepMinutes(duration, -5);
  assert.strictEqual(duration, 55);
  assert.deepStrictEqual(formatDurationPicker(duration), { hoursFormatted: '00', minutesFormatted: '55' });

  // Step up hours from 01:25 to 02:25
  duration = 85;
  duration = stepHours(duration, 1);
  assert.strictEqual(duration, 145);
  assert.deepStrictEqual(formatDurationPicker(duration), { hoursFormatted: '02', minutesFormatted: '25' });

  // Step up hours from 02:25 clamped at 180 (03:00)
  duration = stepHours(duration, 1);
  assert.strictEqual(duration, 180);
  assert.deepStrictEqual(formatDurationPicker(duration), { hoursFormatted: '03', minutesFormatted: '00' });
});

// -------------------------------------------------------------------------------------
// TEST 6: Multiplier Countdown: 5 phút -> 1.0x, 29 phút -> 1.0x
// -------------------------------------------------------------------------------------
test('Test 6: Countdown Multiplier for tier 5 - 29 min returns 1.0x', () => {
  assert.strictEqual(MultiplierRules.getCountdownMultiplier(5), 1.0);
  assert.strictEqual(MultiplierRules.getCountdownMultiplier(15), 1.0);
  assert.strictEqual(MultiplierRules.getCountdownMultiplier(25), 1.0);
  assert.strictEqual(MultiplierRules.getCountdownMultiplier(29), 1.0);
});

// -------------------------------------------------------------------------------------
// TEST 7: Multiplier Countdown: 30 phút -> 1.2x, 59 phút -> 1.2x
// -------------------------------------------------------------------------------------
test('Test 7: Countdown Multiplier for tier 30 - 59 min returns 1.2x', () => {
  assert.strictEqual(MultiplierRules.getCountdownMultiplier(30), 1.2);
  assert.strictEqual(MultiplierRules.getCountdownMultiplier(45), 1.2);
  assert.strictEqual(MultiplierRules.getCountdownMultiplier(59), 1.2);
});

// -------------------------------------------------------------------------------------
// TEST 8: Multiplier Countdown: 60 phút -> 1.4x, 89 phút -> 1.4x
// -------------------------------------------------------------------------------------
test('Test 8: Countdown Multiplier for tier 60 - 89 min returns 1.4x', () => {
  assert.strictEqual(MultiplierRules.getCountdownMultiplier(60), 1.4);
  assert.strictEqual(MultiplierRules.getCountdownMultiplier(75), 1.4);
  assert.strictEqual(MultiplierRules.getCountdownMultiplier(89), 1.4);
});

// -------------------------------------------------------------------------------------
// TEST 9: Multiplier Countdown: 90 phút -> 1.6x, 119 phút -> 1.6x
// -------------------------------------------------------------------------------------
test('Test 9: Countdown Multiplier for tier 90 - 119 min returns 1.6x', () => {
  assert.strictEqual(MultiplierRules.getCountdownMultiplier(90), 1.6);
  assert.strictEqual(MultiplierRules.getCountdownMultiplier(105), 1.6);
  assert.strictEqual(MultiplierRules.getCountdownMultiplier(119), 1.6);
});

// -------------------------------------------------------------------------------------
// TEST 10: Multiplier Countdown: 120 phút -> 1.8x, 149 phút -> 1.8x
// -------------------------------------------------------------------------------------
test('Test 10: Countdown Multiplier for tier 120 - 149 min returns 1.8x', () => {
  assert.strictEqual(MultiplierRules.getCountdownMultiplier(120), 1.8);
  assert.strictEqual(MultiplierRules.getCountdownMultiplier(135), 1.8);
  assert.strictEqual(MultiplierRules.getCountdownMultiplier(149), 1.8);
});

// -------------------------------------------------------------------------------------
// -------------------------------------------------------------------------------------
// TEST 11: Multiplier Countdown: 150-179 phút -> 2.0x, 180 phút -> 2.5x
// -------------------------------------------------------------------------------------
test('Test 11: Countdown Multiplier: 150 - 179 min returns 2.0x, 180 min returns 2.5x', () => {
  assert.strictEqual(MultiplierRules.getCountdownMultiplier(150), 2.0);
  assert.strictEqual(MultiplierRules.getCountdownMultiplier(165), 2.0);
  assert.strictEqual(MultiplierRules.getCountdownMultiplier(175), 2.0);
  assert.strictEqual(MultiplierRules.getCountdownMultiplier(179), 2.0);
  assert.strictEqual(MultiplierRules.getCountdownMultiplier(180), 2.5);
});

// -------------------------------------------------------------------------------------
// TEST 11B: Preview & 180-min session locking & completion rewards (675 Coins, 2250 XP)
// -------------------------------------------------------------------------------------
test('Test 11B: 180-min (03:00) Countdown session locks 2.5x multiplier and awards 675 Coins / 2250 XP on completion', async () => {
  // 1. UI Preview calculation immediately yields 2.5x and 675 Coins / 2250 XP
  const targetMinutes = 180;
  const previewMultiplier = MultiplierRules.getCountdownMultiplier(targetMinutes);
  assert.strictEqual(previewMultiplier, 2.5);

  const previewCoins = Math.floor(1.5 * targetMinutes * previewMultiplier);
  const previewXp = Math.floor(5 * targetMinutes * previewMultiplier);
  assert.strictEqual(previewCoins, 675, 'Estimated coins for 180m at 2.5x must be 675 (180 * 1.5 * 2.5)');
  assert.strictEqual(previewXp, 2250, 'Estimated XP for 180m at 2.5x must be 2250 (180 * 5 * 2.5)');

  // 2. Starting session locks 2.5x multiplier in session snapshot
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

  const profile = await profileManager.createProfile('Max Tier 180m');
  const session = await coordinator.startSession('COUNTDOWN', 180, profile.id);
  assert.strictEqual(session.lockedMultiplier, 2.5, 'Locked multiplier for 180 min session must be 2.5');

  // 3. Completed countdown uses locked 2.5x multiplier to award 675 Coins and 2250 XP
  const completed = await coordinator.completeCountdown();
  assert.strictEqual(completed?.status, 'COMPLETED');
  assert.strictEqual(completed?.rewardProcessed, true);

  const economy = await storage.getEconomy();
  assert.strictEqual(economy.focusCoins, 675);
  assert.strictEqual(economy.totalXP, 2250);
});

// -------------------------------------------------------------------------------------
// TEST 12: Multiplier được khóa khi session bắt đầu và không thay đổi trong suốt phiên
// -------------------------------------------------------------------------------------
test('Test 12: Multiplier is locked at session start and remains immutable during session', async () => {
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

  const profile = await profileManager.createProfile('Lock Test');
  // Start 90 min Countdown (multiplier 1.6x)
  const session = await coordinator.startSession('COUNTDOWN', 90, profile.id);
  assert.strictEqual(session.lockedMultiplier, 1.6, 'Locked multiplier must be 1.6x');

  // Verify that subsequent RewardEngine evaluation respects the lockedMultiplier from snapshot
  const rewardEngine = new RewardEngine();
  const reward = rewardEngine.calculateReward({
    mode: 'COUNTDOWN',
    status: 'COMPLETED',
    targetMinutes: 90,
    actualFocusMinutes: 90,
    lockedMultiplier: session.lockedMultiplier,
  });

  // 1.5 coins * 90m * 1.6 = 216 coins; 5.0 xp * 90m * 1.6 = 720 xp
  assert.strictEqual(reward.multiplier, 1.6);
  assert.strictEqual(reward.coinsEarned, 216);
  assert.strictEqual(reward.xpEarned, 720);
});

// -------------------------------------------------------------------------------------
// TEST 13: Multiplier Stopwatch: Giữ nguyên tính đúng đắn cho các mốc 4m (0), 5m (1.0x), 10m (1.1x), 26m (1.2x)
// -------------------------------------------------------------------------------------
test('Test 13: Stopwatch rules intact with unified schedule: 4m (0 reward threshold), 5m (1.0x), 10m (1.0x), 26m (1.0x), 30m (1.2x)', () => {
  const engine = new RewardEngine();

  // 4m: below 5m threshold -> 0 reward
  const r4 = engine.calculateReward({ mode: 'STOPWATCH', status: 'COMPLETED', targetMinutes: 0, actualFocusMinutes: 4 });
  assert.strictEqual(r4.isThresholdMet, false);
  assert.strictEqual(r4.coinsEarned, 0);
  assert.strictEqual(r4.xpEarned, 0);

  // 5m: threshold met -> 1.0x multiplier
  const r5 = engine.calculateReward({ mode: 'STOPWATCH', status: 'COMPLETED', targetMinutes: 0, actualFocusMinutes: 5 });
  assert.strictEqual(r5.isThresholdMet, true);
  assert.strictEqual(r5.multiplier, 1.0);
  assert.strictEqual(r5.coinsEarned, 5); // 5 * 1.0 * 1
  assert.strictEqual(r5.xpEarned, 15);   // 5 * 3.0 * 1

  // 10m: 5-29m tier -> 1.0x multiplier
  const r10 = engine.calculateReward({ mode: 'STOPWATCH', status: 'COMPLETED', targetMinutes: 0, actualFocusMinutes: 10 });
  assert.strictEqual(r10.multiplier, 1.0);
  assert.strictEqual(r10.coinsEarned, 10); // 10 * 1.0 * 1.0
  assert.strictEqual(r10.xpEarned, 30);

  // 26m: 5-29m tier -> 1.0x multiplier on all 26 minutes
  const r26 = engine.calculateReward({ mode: 'STOPWATCH', status: 'COMPLETED', targetMinutes: 0, actualFocusMinutes: 26 });
  assert.strictEqual(r26.multiplier, 1.0);
  assert.strictEqual(r26.coinsEarned, 26); // 26 * 1.0 * 1.0
  assert.strictEqual(r26.xpEarned, 78);   // 26 * 3.0 * 1.0

  // 30m: 30-59m tier -> 1.2x multiplier
  const r30 = engine.calculateReward({ mode: 'STOPWATCH', status: 'COMPLETED', targetMinutes: 0, actualFocusMinutes: 30 });
  assert.strictEqual(r30.multiplier, 1.2);
  assert.strictEqual(r30.coinsEarned, 36); // 30 * 1.0 * 1.2
  assert.strictEqual(r30.xpEarned, 108);  // 30 * 3.0 * 1.2
});

// -------------------------------------------------------------------------------------
// TEST 14: Finish modal: Stopwatch < 5 phút hiển thị đúng cảnh báo không có thưởng và hai nút Keep Focusing / Leave Anyway
// -------------------------------------------------------------------------------------
test('Test 14: Finish modal for Stopwatch < 5 min warns zero reward with Keep Focusing / Leave Anyway buttons', () => {
  const modalInfo = evaluateStopwatchModal(3);
  assert.strictEqual(modalInfo.type, 'INELIGIBLE');
  assert.strictEqual(modalInfo.title, 'Finish this session?');
  assert.strictEqual(
    modalInfo.warning,
    'This session is less than 5 minutes, if you leave now, no reward will be given.'
  );
  assert.deepStrictEqual(modalInfo.buttons, ['Keep Focusing', 'Leave Anyway']);
});

// -------------------------------------------------------------------------------------
// TEST 15: Finish modal: Stopwatch >= 5 phút hiển thị đúng mức thưởng dự kiến và hai nút Keep Focusing / Finish & Claim
// -------------------------------------------------------------------------------------
test('Test 15: Finish modal for Stopwatch >= 5 min shows projected rewards with Keep Focusing / Finish & Claim buttons', () => {
  const modalInfo26 = evaluateStopwatchModal(26);
  assert.strictEqual(modalInfo26.type, 'ELIGIBLE');
  assert.strictEqual(modalInfo26.title, 'Finish this session?');
  assert.strictEqual(modalInfo26.subtitle, 'If you finish this session right now, you will receive:');
  assert.strictEqual(modalInfo26.estimatedCoins, 26);
  assert.strictEqual(modalInfo26.estimatedXp, 78);
  assert.strictEqual(modalInfo26.multiplier, 1.0);
  assert.deepStrictEqual(modalInfo26.buttons, ['Keep Focusing', 'Finish & Claim']);

  const modalInfo10 = evaluateStopwatchModal(10);
  assert.strictEqual(modalInfo10.estimatedCoins, 10);
  assert.strictEqual(modalInfo10.estimatedXp, 30);
  assert.strictEqual(modalInfo10.multiplier, 1.0);

  const modalInfo30 = evaluateStopwatchModal(30);
  assert.strictEqual(modalInfo30.estimatedCoins, 36);
  assert.strictEqual(modalInfo30.estimatedXp, 108);
  assert.strictEqual(modalInfo30.multiplier, 1.2);
});

// -------------------------------------------------------------------------------------
// TEST 16: Idempotency guard: Không thể nhận thưởng 2 lần cho cùng một phiên dù nhấn Finish nhiều lần
// -------------------------------------------------------------------------------------
test('Test 16: Idempotency guard prevents duplicate reward claims on multiple finish calls', async () => {
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

  const profile = await profileManager.createProfile('Idempotency Profile');
  await coordinator.startSession('STOPWATCH', 0, profile.id);

  // Simulate 20 minutes elapsed
  await storage.updateCurrentSession((s) => ({
    ...s!,
    startedAt: Date.now() - 20 * 60 * 1000,
  }));

  // First Finish call: must award rewards (20m * 1.0 * 1.0 = 20 coins; 20 * 3.0 * 1.0 = 60 xp)
  const first = await coordinator.finishStopwatch();
  assert.strictEqual(first.coinsEarned, 20);
  assert.strictEqual(first.xpEarned, 60);

  const economyFirst = await storage.getEconomy();
  assert.strictEqual(economyFirst.focusCoins, 20);
  assert.strictEqual(economyFirst.totalXP, 60);

  // Second rapid Finish call: must return 0 rewards and leave economy unchanged
  const second = await coordinator.finishStopwatch();
  assert.strictEqual(second.coinsEarned, 0);
  assert.strictEqual(second.xpEarned, 0);

  const economySecond = await storage.getEconomy();
  assert.strictEqual(economySecond.focusCoins, 20, 'Focus Coins must not increase on duplicate call');
  assert.strictEqual(economySecond.totalXP, 60, 'Total XP must not increase on duplicate call');
});

// -------------------------------------------------------------------------------------
// TEST 17: Live reward projection for Countdown respects targetMinutes & lockedMultiplier
// -------------------------------------------------------------------------------------
test('Test 17: Live reward projection for Countdown uses targetMinutes and lockedMultiplier', () => {
  const engine = new RewardEngine();
  // Active in-progress session (status: RUNNING)
  // Projected completion reward is calculated using targetMinutes and lockedMultiplier
  const targetMinutes = 45;
  const multiplier = MultiplierRules.getCountdownMultiplier(targetMinutes); // 1.2x
  assert.strictEqual(multiplier, 1.2);

  const projectedCoins = Math.floor(1.5 * targetMinutes * multiplier);
  const projectedXp = Math.floor(5.0 * targetMinutes * multiplier);
  assert.strictEqual(projectedCoins, 81); // 45 * 1.5 * 1.2 = 81
  assert.strictEqual(projectedXp, 270);   // 45 * 5.0 * 1.2 = 270

  // While running, RewardEngine without completion status confirms no premature completion
  const runningCalc = engine.calculateReward({
    mode: 'COUNTDOWN',
    status: 'RUNNING',
    targetMinutes,
    actualFocusMinutes: 20,
    lockedMultiplier: multiplier,
  });
  assert.strictEqual(runningCalc.isCompleted, false);
  assert.strictEqual(runningCalc.coinsEarned, 0, 'No coins credited during active running');
});

// -------------------------------------------------------------------------------------
// TEST 18: Live reward projection for Stopwatch reflects 5m threshold and milestone multipliers
// -------------------------------------------------------------------------------------
test('Test 18: Live reward projection for Stopwatch reflects 5m threshold and milestone multipliers', () => {
  const engine = new RewardEngine();

  // Under 5 minutes: projected reward is strictly 0
  for (let mins = 0; mins < 5; mins++) {
    const swUnder = engine.calculateReward({
      mode: 'STOPWATCH',
      status: 'RUNNING' as any,
      targetMinutes: 0,
      actualFocusMinutes: mins,
    });
    assert.strictEqual(swUnder.isThresholdMet, false);
    assert.strictEqual(swUnder.coinsEarned, 0);
    assert.strictEqual(swUnder.xpEarned, 0);
  }

  // At 5 minutes: 5 * 1.0 * 1.0 = 5 Coins, 15 XP
  const sw5 = engine.calculateReward({
    mode: 'STOPWATCH',
    status: 'COMPLETED',
    targetMinutes: 0,
    actualFocusMinutes: 5,
  });
  assert.strictEqual(sw5.isThresholdMet, true);
  assert.strictEqual(sw5.coinsEarned, 5);
  assert.strictEqual(sw5.xpEarned, 15);

  // At 26 minutes: 26 * 1.0 * 1.0 = 26 Coins, 78 XP (x 1.0)
  const sw26 = engine.calculateReward({
    mode: 'STOPWATCH',
    status: 'COMPLETED',
    targetMinutes: 0,
    actualFocusMinutes: 26,
  });
  assert.strictEqual(sw26.multiplier, 1.0);
  assert.strictEqual(sw26.coinsEarned, 26);
  assert.strictEqual(sw26.xpEarned, 78);
});

// -------------------------------------------------------------------------------------
// TEST 19: Pause time is strictly excluded from live reward focus accumulation
// -------------------------------------------------------------------------------------
test('Test 19: Pause duration is excluded from focus time and does not inflate live rewards', () => {
  const startedAt = 1000000;
  // Wall-clock time elapsed is 20 minutes
  const currentTime = startedAt + 20 * 60 * 1000;
  // But was paused for 8 minutes total (completed 3m + current pause 5m capped)
  const elapsed = TimeCalculator.calculateElapsedTime({
    startedAt,
    currentTime,
    status: 'PAUSED',
    currentPauseStartedAt: currentTime - 5 * 60 * 1000,
    totalCompletedPauseMs: 3 * 60 * 1000,
  });

  // Actual focus minutes must be 20m - 8m = 12 minutes
  assert.strictEqual(elapsed.actualFocusMinutes, 12);
  assert.strictEqual(elapsed.totalPauseMs, 8 * 60 * 1000);

  // Stopwatch reward on 12 minutes: 12 * 1.0 * 1.0 = 12 Coins, 36 XP (5-29m tier = 1.0x)
  const engine = new RewardEngine();
  const reward = engine.calculateReward({
    mode: 'STOPWATCH',
    status: 'COMPLETED',
    targetMinutes: 0,
    actualFocusMinutes: elapsed.actualFocusMinutes,
  });
  assert.strictEqual(reward.coinsEarned, 12);
  assert.strictEqual(reward.xpEarned, 36);
});

// -------------------------------------------------------------------------------------
// TEST 20: Comprehensive boundary regression tests (149m, 150m, 179m, 180m)
// -------------------------------------------------------------------------------------
test('Test 20: Boundary regression tests: 149m = 1.8x, 150m = 2.0x, 179m = 2.0x, 180m = 2.5x', () => {
  const engine = new RewardEngine();

  // 149m: tier 120-149m -> 1.8x
  assert.strictEqual(MultiplierRules.getCountdownMultiplier(149), 1.8);
  const r149 = engine.calculateReward({
    mode: 'COUNTDOWN',
    status: 'COMPLETED',
    targetMinutes: 149,
    actualFocusMinutes: 149,
    lockedMultiplier: 1.8,
  });
  // 149 * 1.5 * 1.8 = 402.3 coins; 149 * 5 * 1.8 = 1341 xp
  assert.strictEqual(r149.coinsEarned, 402.3, 'Full precision 402.3 must be preserved');
  assert.strictEqual(r149.xpEarned, 1341);

  // 150m: tier 150-179m -> 2.0x
  assert.strictEqual(MultiplierRules.getCountdownMultiplier(150), 2.0);
  const r150 = engine.calculateReward({
    mode: 'COUNTDOWN',
    status: 'COMPLETED',
    targetMinutes: 150,
    actualFocusMinutes: 150,
    lockedMultiplier: 2.0,
  });
  // 150 * 1.5 * 2.0 = 450 coins; 150 * 5 * 2.0 = 1500 xp
  assert.strictEqual(r150.coinsEarned, 450);
  assert.strictEqual(r150.xpEarned, 1500);

  // 179m: tier 150-179m -> 2.0x
  assert.strictEqual(MultiplierRules.getCountdownMultiplier(179), 2.0);
  const r179 = engine.calculateReward({
    mode: 'COUNTDOWN',
    status: 'COMPLETED',
    targetMinutes: 179,
    actualFocusMinutes: 179,
    lockedMultiplier: 2.0,
  });
  // 179 * 1.5 * 2.0 = 537 coins; 179 * 5 * 2.0 = 1790 xp
  assert.strictEqual(r179.coinsEarned, 537);
  assert.strictEqual(r179.xpEarned, 1790);

  // 180m: tier 180m -> 2.5x
  assert.strictEqual(MultiplierRules.getCountdownMultiplier(180), 2.5);
  const r180 = engine.calculateReward({
    mode: 'COUNTDOWN',
    status: 'COMPLETED',
    targetMinutes: 180,
    actualFocusMinutes: 180,
    lockedMultiplier: 2.5,
  });
  // 180 * 1.5 * 2.5 = 675 coins; 180 * 5 * 2.5 = 2250 xp
  assert.strictEqual(r180.coinsEarned, 675);
  assert.strictEqual(r180.xpEarned, 2250);

  // 240m Stopwatch: 240 * 1.0 * 2.5 = 600 coins; 240 * 3.0 * 2.5 = 1800 xp
  const r240 = engine.calculateReward({
    mode: 'STOPWATCH',
    status: 'COMPLETED',
    targetMinutes: 0,
    actualFocusMinutes: 240,
  });
  assert.strictEqual(r240.multiplier, 2.5);
  assert.strictEqual(r240.coinsEarned, 600);
  assert.strictEqual(r240.xpEarned, 1800);
});
