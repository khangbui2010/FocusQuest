import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStorageAdapter } from '../../src/storage/memoryStorageAdapter.ts';
import { StorageManager } from '../../src/storage/storageManager.ts';
import { ProfileManager } from '../../src/core/profiles/profileManager.ts';
import {
  MockAlarmsAdapter,
  MockBadgeAdapter,
  MockDNRAdapter,
  MockNotificationsAdapter,
  MockTabsAdapter,
} from '../mocks/chromeMock.ts';
import { BlockingCoordinator } from '../../src/background/blockingCoordinator.ts';
import {
  SessionCoordinator,
  buildPomodoroStageAlarmName,
} from '../../src/background/sessionCoordinator.ts';
import { PomodoroConfig } from '../../src/types/session.ts';

function createHarness() {
  const storage = new StorageManager(new MemoryStorageAdapter(), new MemoryStorageAdapter());
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

  return { storage, profileManager, alarms, notifications, badge, dnr, blockingCoordinator, coordinator };
}

test('UX-2 Backend Regression: POMODORO_COUNTDOWN Give Up after 2 completed intervals leaves economy unchanged and logs focus minutes', async () => {
  const h = createHarness();
  const profile = await h.profileManager.createProfile('Deep Focus', ['github.com']);

  // Seed existing non-zero wallet matching realistic user state
  await h.storage.updateEconomy(() => ({
    focusCoins: 55.5,
    totalXP: 1035,
    level: 5,
  }));

  const config: PomodoroConfig = {
    focusDurationMinutes: 90,
    focusIntervalDurationMinutes: 90,
    shortBreakDurationMinutes: 15,
    longBreakDurationMinutes: 30,
    targetFocusSessions: 5,
    focusIntervalsPerCycle: 5,
    numberOfCycles: 2,
  };

  let session = await h.coordinator.startSession('POMODORO_COUNTDOWN', 90, profile.id, config);
  assert.ok((session.pomodoroState?.accumulatedCoins ?? 0) > 0, 'accumulatedCoins holds projected quest total');

  // Complete interval 1 -> SHORT_BREAK -> SKIP_BREAK -> interval 2 -> SHORT_BREAK
  for (let i = 1; i <= 2; i++) {
    const pState = session.pomodoroState!;
    const focusAlarm = buildPomodoroStageAlarmName(session.id, pState.currentInterval, 'FOCUS', pState.phaseStartedAt);
    const onBreak = await h.coordinator.advancePomodoroStage(focusAlarm);
    assert.ok(onBreak);
    assert.strictEqual(onBreak.pomodoroState?.completedFocusCount, i);

    // Economy must NOT have been credited yet during intermediate breaks
    const midEco = await h.storage.getEconomy();
    assert.strictEqual(midEco.focusCoins, 55.5);
    assert.strictEqual(midEco.totalXP, 1035);
    assert.strictEqual(midEco.level, 5);

    const breakState = onBreak.pomodoroState!;
    const breakAlarm = buildPomodoroStageAlarmName(
      onBreak.id,
      breakState.currentInterval,
      breakState.currentPhase,
      breakState.phaseStartedAt
    );
    const nextFocus = await h.coordinator.advancePomodoroStage(breakAlarm);
    assert.ok(nextFocus);
    session = nextFocus;
  }

  // Now Give Up during interval 3
  const abandoned = await h.coordinator.giveUpCountdown();
  assert.strictEqual(abandoned.status, 'ABANDONED');
  assert.strictEqual(abandoned.pomodoroState?.completedFocusCount, 2);
  assert.strictEqual(abandoned.pomodoroState?.totalCompletedFocusMinutes, 180);

  // Economy MUST remain strictly unchanged (0 Coins, 0 XP awarded)
  const finalEco = await h.storage.getEconomy();
  assert.strictEqual(finalEco.focusCoins, 55.5);
  assert.strictEqual(finalEco.totalXP, 1035);
  assert.strictEqual(finalEco.level, 5);

  // Daily stats MUST record 180 focus minutes, 0 coins, 0 xp, 1 abandoned session
  const stats = await h.storage.getDailyStats();
  const todayStats = Object.values(stats)[0];
  assert.ok(todayStats);
  assert.strictEqual(todayStats.totalFocusMinutes, 180);
  assert.strictEqual(todayStats.coinsEarned, 0);
  assert.strictEqual(todayStats.xpEarned, 0);
  assert.strictEqual(todayStats.abandonedSessions, 1);
  assert.strictEqual(todayStats.completedSessions, 0);
});

test('UX-2 Backend Regression: POMODORO_COUNTDOWN interrupted (EXTENSION_RE_ENABLED) after N intervals leaves economy unchanged; 100% completion credits ONCE', async () => {
  // Part A: Extension disabled/reloaded after 1 completed interval
  const h1 = createHarness();
  const p1 = await h1.profileManager.createProfile('Study', []);
  await h1.storage.updateEconomy(() => ({
    focusCoins: 100,
    totalXP: 300,
    level: 3,
  }));

  const cfg: PomodoroConfig = {
    focusDurationMinutes: 15,
    focusIntervalDurationMinutes: 15,
    shortBreakDurationMinutes: 5,
    longBreakDurationMinutes: 15,
    targetFocusSessions: 2,
    focusIntervalsPerCycle: 2,
    numberOfCycles: 1,
  };

  const s1 = await h1.coordinator.startSession('POMODORO_COUNTDOWN', 15, p1.id, cfg);
  const f1Alarm = buildPomodoroStageAlarmName(s1.id, 1, 'FOCUS', s1.pomodoroState!.phaseStartedAt);
  await h1.coordinator.advancePomodoroStage(f1Alarm);

  const interrupted = await h1.coordinator.handleLifecycleEvent({ reason: 'EXTENSION_RE_ENABLED' });
  assert.strictEqual(interrupted?.status, 'INTERRUPTED');
  assert.strictEqual(interrupted?.pomodoroState?.completedFocusCount, 1);

  const ecoAfterInt = await h1.storage.getEconomy();
  assert.strictEqual(ecoAfterInt.focusCoins, 100);
  assert.strictEqual(ecoAfterInt.totalXP, 300);
  assert.strictEqual(ecoAfterInt.level, 3);

  const statsAfterInt = Object.values(await h1.storage.getDailyStats())[0];
  assert.strictEqual(statsAfterInt.totalFocusMinutes, 15);
  assert.strictEqual(statsAfterInt.coinsEarned, 0);
  assert.strictEqual(statsAfterInt.xpEarned, 0);

  // Part B: 100% completion (2/2 intervals = 30m -> x1.2 -> 54 Coins, 180 XP) credits ONCE
  const h2 = createHarness();
  const p2 = await h2.profileManager.createProfile('Study', []);
  let s2 = await h2.coordinator.startSession('POMODORO_COUNTDOWN', 15, p2.id, cfg);

  const a1 = buildPomodoroStageAlarmName(s2.id, 1, 'FOCUS', s2.pomodoroState!.phaseStartedAt);
  s2 = (await h2.coordinator.advancePomodoroStage(a1))!;
  // Economy still 0 after interval 1
  assert.strictEqual((await h2.storage.getEconomy()).focusCoins, 0);

  const aBreak = buildPomodoroStageAlarmName(
    s2.id,
    s2.pomodoroState!.currentInterval,
    s2.pomodoroState!.currentPhase,
    s2.pomodoroState!.phaseStartedAt
  );
  s2 = (await h2.coordinator.advancePomodoroStage(aBreak))!;

  const a2 = buildPomodoroStageAlarmName(
    s2.id,
    s2.pomodoroState!.currentInterval,
    'FOCUS',
    s2.pomodoroState!.phaseStartedAt
  );
  const completed = (await h2.coordinator.advancePomodoroStage(a2))!;
  assert.strictEqual(completed.status, 'COMPLETED');
  assert.strictEqual(completed.rewardProcessed, true);

  const finalEco = await h2.storage.getEconomy();
  assert.ok(Math.abs(finalEco.focusCoins - 54) < 1e-9);
  assert.strictEqual(finalEco.totalXP, 180);

  // Re-invoking advance after COMPLETED must not double-credit
  await h2.coordinator.advancePomodoroStage(a2);
  const ecoAfterReplay = await h2.storage.getEconomy();
  assert.ok(Math.abs(ecoAfterReplay.focusCoins - 54) < 1e-9);
  assert.strictEqual(ecoAfterReplay.totalXP, 180);
});
