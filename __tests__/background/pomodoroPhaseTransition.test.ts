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
import { MessageHandler } from '../../src/background/messageHandler.ts';
import { SessionSnapshot } from '../../src/types/session.ts';

/**
 * Regression suite for the real Chrome bug: "Short Break bị skip" and
 * "Long Break vẫn block website".
 *
 * Root cause: the popup polled a stale FOCUS snapshot, reached 00:00 and sent
 * ADVANCE_POMODORO_STAGE after the background alarm had already entered a
 * break. MessageHandler only gated the request when the *stored* phase was
 * FOCUS, so a stored BREAK fell through to `advancePomodoroStage()` (no alarm)
 * -> CASE 2 -> break ended instantly and DNR blocking was re-applied.
 *
 * These tests drive the same public entry points (alarms + MessageHandler)
 * instead of bypassing them, and inspect real DNR rule state through the mock
 * adapter that mirrors chrome.declarativeNetRequest dynamic rules.
 */

const POMODORO_CONFIG = {
  focusDurationMinutes: 1,
  focusIntervalDurationMinutes: 1,
  shortBreakDurationMinutes: 1,
  longBreakDurationMinutes: 1,
  focusIntervalsPerCycle: 2,
  targetFocusSessions: 2,
  numberOfCycles: 2,
};

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

  const messageHandler = new MessageHandler(coordinator, profileManager, storage);

  return {
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

async function getSession(h: ReturnType<typeof createTestHarness>): Promise<SessionSnapshot> {
  const session = await h.storage.getCurrentSession();
  assert.ok(session, 'session must exist');
  return session;
}

function focusAlarmFor(session: SessionSnapshot) {
  const p = session.pomodoroState!;
  return buildPomodoroStageAlarmName(session.id, p.currentInterval, 'FOCUS', p.phaseStartedAt);
}

function breakAlarmFor(session: SessionSnapshot) {
  const p = session.pomodoroState!;
  return buildPomodoroStageAlarmName(session.id, p.currentInterval, p.currentPhase, p.phaseStartedAt);
}

function assertBlockingOn(rules: { condition: { resourceTypes: string[] }; action: { type: string; redirect?: { extensionPath?: string } } }[]) {
  assert.strictEqual(rules.length, 1, 'FOCUS must install exactly one blocking rule in Chrome');
  assert.deepStrictEqual(rules[0].condition.resourceTypes, ['main_frame'], 'rule scope must stay main_frame');
  assert.strictEqual(rules[0].action.type, 'redirect');
  assert.strictEqual(rules[0].action.redirect?.extensionPath, '/blocked.html');
}

// ---------------------------------------------------------------------------
// Test A — Focus 1 completion enters a real Short Break (not skipped)
// ---------------------------------------------------------------------------
test('Pomodoro phase transition A: Focus 1 completes into a real Short Break and a stale ADVANCE cannot skip it', async () => {
  const h = createTestHarness();
  const profile = await h.profileManager.createProfile('Regression A', ['wikipedia.org']);

  let session = await h.coordinator.startSession('POMODORO_COUNTDOWN', 1, profile.id, POMODORO_CONFIG);
  const focusAlarm = focusAlarmFor(session);

  // Background alarm completes Focus 1.
  const afterFocus = await h.coordinator.advancePomodoroStage(focusAlarm);
  assert.ok(afterFocus);
  assert.strictEqual(afterFocus.pomodoroState?.currentPhase, 'SHORT_BREAK');
  assert.strictEqual(afterFocus.pomodoroState?.completedFocusCount, 1);
  assert.strictEqual(afterFocus.pomodoroState?.totalCompletedFocusMinutes, 1);
  assert.strictEqual(afterFocus.pomodoroState?.currentInterval, 1, 'break keeps the interval that just finished');
  assert.strictEqual(afterFocus.pomodoroState?.currentCycle, 1);

  // A break alarm must exist for the full 1-minute break.
  const breakAlarm = breakAlarmFor(afterFocus);
  const storedBreakAlarm = await h.alarms.get(breakAlarm);
  assert.ok(storedBreakAlarm, 'Short Break alarm must be scheduled');
  assert.strictEqual(
    storedBreakAlarm.scheduledTime,
    afterFocus.pomodoroState!.phaseStartedAt + 60 * 1000
  );

  // The stale popup still thinks it is in FOCUS and sends ADVANCE at 00:00.
  const staleAdvance = await h.messageHandler.handleMessage({ action: 'ADVANCE_POMODORO_STAGE' });
  assert.strictEqual(staleAdvance.success, true, 'stale advance must be a safe no-op');

  session = await getSession(h);
  assert.strictEqual(session.pomodoroState?.currentPhase, 'SHORT_BREAK', 'Short Break must NOT be skipped');
  assert.strictEqual(session.pomodoroState?.currentInterval, 1, 'must not jump to Focus 2 immediately');
  assert.strictEqual(session.pomodoroState?.completedFocusCount, 1, 'no duplicate focus completion');
  assert.ok(await h.alarms.get(breakAlarm), 'Short Break alarm must survive the stale request');
});

// ---------------------------------------------------------------------------
// Test B — Short Break really ends -> Focus interval 2 with a new alarm
// ---------------------------------------------------------------------------
test('Pomodoro phase transition B: Short Break ending starts Focus interval 2 with a fresh Focus alarm', async () => {
  const h = createTestHarness();
  const profile = await h.profileManager.createProfile('Regression B', ['wikipedia.org']);

  const started = await h.coordinator.startSession('POMODORO_COUNTDOWN', 1, profile.id, POMODORO_CONFIG);
  const inBreak = await h.coordinator.advancePomodoroStage(focusAlarmFor(started));
  assert.ok(inBreak);
  assert.strictEqual(inBreak.pomodoroState?.currentPhase, 'SHORT_BREAK');

  const ended = await h.coordinator.advancePomodoroStage(breakAlarmFor(inBreak));
  assert.ok(ended);
  assert.strictEqual(ended.pomodoroState?.currentPhase, 'FOCUS');
  assert.strictEqual(ended.pomodoroState?.currentInterval, 2);
  assert.strictEqual(ended.pomodoroState?.currentCycle, 1);
  assert.strictEqual(ended.pomodoroState?.phaseTargetDurationMinutes, 1);

  const nextAlarm = await h.alarms.get(focusAlarmFor(ended));
  assert.ok(nextAlarm, 'Focus interval 2 alarm must be scheduled');
  assert.strictEqual(nextAlarm.scheduledTime, ended.pomodoroState!.phaseStartedAt + 60 * 1000);
});

// ---------------------------------------------------------------------------
// Test C — Last Focus of the cycle enters Long Break, cycle not bumped yet
// ---------------------------------------------------------------------------
test('Pomodoro phase transition C: Focus 2 of the cycle enters Long Break without advancing the cycle', async () => {
  const h = createTestHarness();
  const profile = await h.profileManager.createProfile('Regression C', ['wikipedia.org']);

  const started = await h.coordinator.startSession('POMODORO_COUNTDOWN', 1, profile.id, POMODORO_CONFIG);
  const inShortBreak = await h.coordinator.advancePomodoroStage(focusAlarmFor(started));
  assert.ok(inShortBreak);
  const focus2 = await h.coordinator.advancePomodoroStage(breakAlarmFor(inShortBreak));
  assert.ok(focus2);
  assert.strictEqual(focus2.pomodoroState?.currentInterval, 2);

  const inLongBreak = await h.coordinator.advancePomodoroStage(focusAlarmFor(focus2));
  assert.ok(inLongBreak);
  assert.strictEqual(inLongBreak.pomodoroState?.currentPhase, 'LONG_BREAK');
  assert.strictEqual(inLongBreak.pomodoroState?.completedFocusCount, 2);
  assert.strictEqual(inLongBreak.pomodoroState?.totalCompletedFocusMinutes, 2);
  assert.strictEqual(inLongBreak.pomodoroState?.currentCycle, 1, 'cycle must only advance after Long Break ends');

  const longBreakAlarm = await h.alarms.get(breakAlarmFor(inLongBreak));
  assert.ok(longBreakAlarm, 'Long Break alarm must be scheduled');
  assert.strictEqual(longBreakAlarm.scheduledTime, inLongBreak.pomodoroState!.phaseStartedAt + 60 * 1000);

  // Stale UI advance must not cut the Long Break short.
  const staleAdvance = await h.messageHandler.handleMessage({ action: 'ADVANCE_POMODORO_STAGE' });
  assert.strictEqual(staleAdvance.success, true);
  const stillLongBreak = await getSession(h);
  assert.strictEqual(stillLongBreak.pomodoroState?.currentPhase, 'LONG_BREAK');
  assert.strictEqual(stillLongBreak.pomodoroState?.currentCycle, 1);
});

// ---------------------------------------------------------------------------
// Test D — Only after Long Break ends: Cycle 2 / Interval 1 / Focus
// ---------------------------------------------------------------------------
test('Pomodoro phase transition D: Long Break ending starts Cycle 2 at Interval 1 Focus', async () => {
  const h = createTestHarness();
  const profile = await h.profileManager.createProfile('Regression D', ['wikipedia.org']);

  const started = await h.coordinator.startSession('POMODORO_COUNTDOWN', 1, profile.id, POMODORO_CONFIG);
  const inShortBreak = await h.coordinator.advancePomodoroStage(focusAlarmFor(started));
  assert.ok(inShortBreak);
  const focus2 = await h.coordinator.advancePomodoroStage(breakAlarmFor(inShortBreak));
  assert.ok(focus2);
  const inLongBreak = await h.coordinator.advancePomodoroStage(focusAlarmFor(focus2));
  assert.ok(inLongBreak);
  assert.strictEqual(inLongBreak.pomodoroState?.currentPhase, 'LONG_BREAK');

  const cycle2 = await h.coordinator.advancePomodoroStage(breakAlarmFor(inLongBreak));
  assert.ok(cycle2);
  assert.strictEqual(cycle2.pomodoroState?.currentPhase, 'FOCUS');
  assert.strictEqual(cycle2.pomodoroState?.currentCycle, 2);
  assert.strictEqual(cycle2.pomodoroState?.currentInterval, 1);
  assert.ok(await h.alarms.get(focusAlarmFor(cycle2)), 'Cycle 2 Focus alarm must be scheduled');
});

// ---------------------------------------------------------------------------
// Test E — Real DNR rule state follows the phase
// ---------------------------------------------------------------------------
test('Pomodoro blocking E: DNR rules are ON in Focus, OFF in Short/Long Break, ON again in Focus', async () => {
  const h = createTestHarness();
  const profile = await h.profileManager.createProfile('Regression E', ['wikipedia.org']);

  const started = await h.coordinator.startSession('POMODORO_COUNTDOWN', 1, profile.id, POMODORO_CONFIG);
  assertBlockingOn(await h.dnr.getDynamicRules());

  const inShortBreak = await h.coordinator.advancePomodoroStage(focusAlarmFor(started));
  assert.ok(inShortBreak);
  assert.strictEqual((await h.dnr.getDynamicRules()).length, 0, 'Short Break must clear DNR rules');

  const focus2 = await h.coordinator.advancePomodoroStage(breakAlarmFor(inShortBreak));
  assert.ok(focus2);
  assertBlockingOn(await h.dnr.getDynamicRules());

  const inLongBreak = await h.coordinator.advancePomodoroStage(focusAlarmFor(focus2));
  assert.ok(inLongBreak);
  assert.strictEqual(inLongBreak.pomodoroState?.currentPhase, 'LONG_BREAK');
  assert.strictEqual((await h.dnr.getDynamicRules()).length, 0, 'Long Break must clear DNR rules');

  // Stale popup request while in Long Break must not re-enable blocking.
  await h.messageHandler.handleMessage({ action: 'ADVANCE_POMODORO_STAGE' });
  assert.strictEqual(
    (await h.dnr.getDynamicRules()).length,
    0,
    'stale ADVANCE during Long Break must not re-apply DNR blocking'
  );

  const cycle2 = await h.coordinator.advancePomodoroStage(breakAlarmFor(inLongBreak));
  assert.ok(cycle2);
  assert.strictEqual(cycle2.pomodoroState?.currentPhase, 'FOCUS');
  assertBlockingOn(await h.dnr.getDynamicRules());
});

// ---------------------------------------------------------------------------
// Test F — Stale alarms cannot complete a different phase
// ---------------------------------------------------------------------------
test('Pomodoro stale alarm F: an old Focus alarm cannot end a Break and an old Break alarm cannot end a new Focus', async () => {
  const h = createTestHarness();
  const profile = await h.profileManager.createProfile('Regression F', ['wikipedia.org']);

  const started = await h.coordinator.startSession('POMODORO_COUNTDOWN', 1, profile.id, POMODORO_CONFIG);
  const oldFocusAlarm = focusAlarmFor(started);
  const inBreak = await h.coordinator.advancePomodoroStage(oldFocusAlarm);
  assert.ok(inBreak);
  assert.strictEqual(inBreak.pomodoroState?.currentPhase, 'SHORT_BREAK');

  const replayFocusAlarm = await h.coordinator.advancePomodoroStage(oldFocusAlarm);
  assert.ok(replayFocusAlarm);
  assert.strictEqual(replayFocusAlarm.pomodoroState?.currentPhase, 'SHORT_BREAK', 'stale Focus alarm must be ignored');
  assert.strictEqual(replayFocusAlarm.pomodoroState?.currentInterval, 1);

  const oldBreakAlarm = breakAlarmFor(inBreak);
  const focus2 = await h.coordinator.advancePomodoroStage(oldBreakAlarm);
  assert.ok(focus2);
  assert.strictEqual(focus2.pomodoroState?.currentPhase, 'FOCUS');
  assert.strictEqual(focus2.pomodoroState?.currentInterval, 2);

  const replayBreakAlarm = await h.coordinator.advancePomodoroStage(oldBreakAlarm);
  assert.ok(replayBreakAlarm);
  assert.strictEqual(replayBreakAlarm.pomodoroState?.currentPhase, 'FOCUS', 'stale Break alarm must be ignored');
  assert.strictEqual(replayBreakAlarm.pomodoroState?.currentInterval, 2, 'must not skip to Focus 3');
  assert.strictEqual(replayBreakAlarm.pomodoroState?.currentCycle, 1);
});

// ---------------------------------------------------------------------------
// Test G — Duplicate completion cannot award rewards twice
// ---------------------------------------------------------------------------
test('Pomodoro duplicate completion G: replaying completion requests only settles rewards once', async () => {
  const h = createTestHarness();
  const profile = await h.profileManager.createProfile('Regression G', ['wikipedia.org']);

  const started = await h.coordinator.startSession('POMODORO_COUNTDOWN', 1, profile.id, POMODORO_CONFIG);

  // Focus 1 -> Short Break
  const firstCompletionAlarm = focusAlarmFor(started);
  const inBreak = await h.coordinator.advancePomodoroStage(firstCompletionAlarm);
  assert.ok(inBreak);
  assert.strictEqual(inBreak.pomodoroState?.completedFocusCount, 1);
  // Pomodoro Countdown previews the settled reward for the whole mission:
  // 4 planned focus minutes * 1.5 coins = 6 and * 5 XP = 20 at 1.0x.
  assert.strictEqual(inBreak.pomodoroState?.accumulatedCoins, 6);
  assert.strictEqual(inBreak.pomodoroState?.accumulatedXp, 20);

  // Duplicate delivery of the same Focus 1 alarm + stale popup advance.
  await h.coordinator.advancePomodoroStage(firstCompletionAlarm);
  await h.messageHandler.handleMessage({ action: 'ADVANCE_POMODORO_STAGE' });

  const afterDuplicates = await getSession(h);
  assert.strictEqual(afterDuplicates.pomodoroState?.currentPhase, 'SHORT_BREAK');
  assert.strictEqual(afterDuplicates.pomodoroState?.completedFocusCount, 1);
  assert.strictEqual(afterDuplicates.pomodoroState?.accumulatedCoins, 6);
  assert.strictEqual(afterDuplicates.pomodoroState?.accumulatedXp, 20);

  // Finish the whole quest: Focus2 -> LB -> Focus3 -> SB -> Focus4 -> COMPLETED
  const focus2 = await h.coordinator.advancePomodoroStage(breakAlarmFor(afterDuplicates));
  assert.ok(focus2);
  const longBreak = await h.coordinator.advancePomodoroStage(focusAlarmFor(focus2));
  assert.ok(longBreak);
  assert.strictEqual(longBreak.pomodoroState?.currentPhase, 'LONG_BREAK');
  const focus3 = await h.coordinator.advancePomodoroStage(breakAlarmFor(longBreak));
  assert.ok(focus3);
  const shortBreak2 = await h.coordinator.advancePomodoroStage(focusAlarmFor(focus3));
  assert.ok(shortBreak2);
  assert.strictEqual(shortBreak2.pomodoroState?.currentPhase, 'SHORT_BREAK');
  const focus4 = await h.coordinator.advancePomodoroStage(breakAlarmFor(shortBreak2));
  assert.ok(focus4);

  const finalAlarm = focusAlarmFor(focus4);
  const completed = await h.coordinator.advancePomodoroStage(finalAlarm);
  assert.ok(completed);
  assert.strictEqual(completed.status, 'COMPLETED');
  assert.strictEqual(completed.rewardProcessed, true);
  assert.strictEqual(completed.pomodoroState?.completedFocusCount, 4);
  assert.strictEqual(completed.pomodoroState?.totalCompletedFocusMinutes, 4);

  // 4 focus minutes at 1.0x: coins = 4 * 1.5 = 6, xp = 4 * 5 = 20.
  const economyAfterSettlement = await h.storage.getEconomy();
  assert.strictEqual(economyAfterSettlement.focusCoins, 6);
  assert.strictEqual(economyAfterSettlement.totalXP, 20);

  const statsAfterSettlement = await h.storage.getDailyStats();
  const today = Object.values(statsAfterSettlement)[0];
  assert.ok(today);
  assert.strictEqual(today.totalFocusMinutes, 4);
  assert.strictEqual(today.completedSessions, 1);

  // Replay the completed stage: must be a no-op with no extra coins/XP.
  const replay = await h.coordinator.advancePomodoroStage(finalAlarm);
  assert.ok(replay);
  assert.strictEqual(replay.status, 'COMPLETED');

  const economyAfterReplay = await h.storage.getEconomy();
  assert.strictEqual(economyAfterReplay.focusCoins, 6, 'rewards must not be credited twice');
  assert.strictEqual(economyAfterReplay.totalXP, 20, 'XP must not be credited twice');
});
