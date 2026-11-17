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
  ALARM_NAMES,
  SessionCoordinator,
  buildPomodoroStageAlarmName,
  parsePomodoroStageAlarmName,
} from '../../src/background/sessionCoordinator.ts';
import { SessionSnapshot } from '../../src/types/session.ts';

/**
 * Regression suite for the live Chrome error:
 *
 *   [POMODORO] Transition failed: Invalid or forged alarm name for Pomodoro Stopwatch:
 *   'FQ_ALARM_POMODORO_STAGE_<session>_<interval>_SHORT_BREAK_<ts>'
 *
 * The alarm was created by Focus Quest itself. On MV3 the Service Worker is
 * asleep when the break alarm fires; `onAlarm` calls `ensureInitialized()`
 * first, whose lifecycle reconciliation completes the elapsed break and moves
 * to the next FOCUS. The same alarm event is then processed again and the
 * validator saw a mismatch and classified the *stale* alarm as forged.
 *
 * These tests keep the strict identity validation (session/interval/phase/ts)
 * and additionally require stale-but-well-formed alarms to be ignored without
 * throwing, while malformed/foreign alarms remain hard rejections.
 */

const STOPWATCH_CONFIG = {
  focusDurationMinutes: 1,
  focusIntervalDurationMinutes: 1,
  shortBreakDurationMinutes: 1,
  longBreakDurationMinutes: 1,
  focusIntervalsPerCycle: 2,
  targetFocusSessions: 2,
  numberOfCycles: 3,
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

  return { storage, profileManager, alarms, notifications, badge, dnr, tabs, blockingCoordinator, coordinator };
}

async function startStopwatch(h: ReturnType<typeof createTestHarness>) {
  const profile = await h.profileManager.createProfile('Alarm Validation', ['wikipedia.org']);
  const session = await h.coordinator.startSession('POMODORO_STOPWATCH', 1, profile.id, STOPWATCH_CONFIG);
  return session;
}

function focusAlarm(session: SessionSnapshot) {
  const p = session.pomodoroState!;
  return buildPomodoroStageAlarmName(
    session.id,
    p.currentInterval,
    'FOCUS',
    p.phaseStartedAt
  );
}

function breakAlarm(session: SessionSnapshot) {
  const p = session.pomodoroState!;
  return buildPomodoroStageAlarmName(
    session.id,
    p.currentInterval,
    p.currentPhase,
    p.phaseStartedAt
  );
}

async function advanceToLongBreak(h: ReturnType<typeof createTestHarness>) {
  const started = await startStopwatch(h);
  const shortBreak = await h.coordinator.advancePomodoroStage(focusAlarm(started));
  assert.ok(shortBreak);
  const focus2 = await h.coordinator.advancePomodoroStage(breakAlarm(shortBreak));
  assert.ok(focus2);
  const longBreak = await h.coordinator.advancePomodoroStage(focusAlarm(focus2));
  assert.ok(longBreak);
  assert.strictEqual(longBreak.pomodoroState?.currentPhase, 'LONG_BREAK');
  return { started, shortBreak, focus2, longBreak };
}

// ---------------------------------------------------------------------------
// 1-3. Valid Stopwatch Focus / Short Break / Long Break alarms are accepted
// ---------------------------------------------------------------------------
test('Alarm validation 1: valid Stopwatch FOCUS alarm is accepted', async () => {
  const h = createTestHarness();
  const session = await startStopwatch(h);

  const result = await h.coordinator.advancePomodoroStage(focusAlarm(session));
  assert.ok(result);
  assert.strictEqual(result.pomodoroState?.currentPhase, 'SHORT_BREAK');
  assert.strictEqual(result.pomodoroState?.completedFocusCount, 1);
});

test('Alarm validation 2: valid Stopwatch SHORT_BREAK alarm is accepted and transitions to FOCUS', async () => {
  const h = createTestHarness();
  const session = await startStopwatch(h);

  const shortBreak = await h.coordinator.advancePomodoroStage(focusAlarm(session));
  assert.ok(shortBreak);
  const nextFocus = await h.coordinator.advancePomodoroStage(breakAlarm(shortBreak));
  assert.ok(nextFocus);
  assert.strictEqual(nextFocus.pomodoroState?.currentPhase, 'FOCUS');
  assert.strictEqual(nextFocus.pomodoroState?.currentInterval, 2);
  assert.strictEqual(nextFocus.pomodoroState?.currentCycle, 1);
});

test('Alarm validation 3: valid Stopwatch LONG_BREAK alarm is accepted and starts the next cycle', async () => {
  const h = createTestHarness();
  const { longBreak } = await advanceToLongBreak(h);

  const nextCycle = await h.coordinator.advancePomodoroStage(breakAlarm(longBreak));
  assert.ok(nextCycle);
  assert.strictEqual(nextCycle.pomodoroState?.currentPhase, 'FOCUS');
  assert.strictEqual(nextCycle.pomodoroState?.currentCycle, 2);
  assert.strictEqual(nextCycle.pomodoroState?.currentInterval, 1);
});

// ---------------------------------------------------------------------------
// 4-7. Forged identity is still rejected
// ---------------------------------------------------------------------------
test('Alarm validation 4: malformed or forged alarm names are rejected', async () => {
  const h = createTestHarness();
  const session = await startStopwatch(h);

  await assert.rejects(
    async () => h.coordinator.advancePomodoroStage('FORGED_ALARM'),
    /Invalid or forged alarm name for Pomodoro Stopwatch/
  );
  await assert.rejects(
    async () => h.coordinator.advancePomodoroStage('FQ_ALARM_POMODORO_STAGE_malformed'),
    /Invalid or forged alarm name for Pomodoro Stopwatch/
  );

  const stored = await h.storage.getCurrentSession();
  assert.strictEqual(stored?.pomodoroState?.currentPhase, 'FOCUS');
  assert.strictEqual(stored?.pomodoroState?.completedFocusCount, 0);
  assert.strictEqual(stored?.id, session.id);
});

test('Alarm validation 5: an alarm from a different session is rejected', async () => {
  const h = createTestHarness();
  const session = await startStopwatch(h);
  const foreignAlarm = buildPomodoroStageAlarmName(
    'sess_other_session',
    session.pomodoroState!.currentInterval,
    'FOCUS',
    session.pomodoroState!.phaseStartedAt
  );

  await assert.rejects(
    async () => h.coordinator.advancePomodoroStage(foreignAlarm),
    /Invalid or forged alarm name for Pomodoro Stopwatch/
  );

  const stored = await h.storage.getCurrentSession();
  assert.strictEqual(stored?.pomodoroState?.currentPhase, 'FOCUS');
  assert.strictEqual(stored?.pomodoroState?.completedFocusCount, 0);
});

test('Alarm validation 6: an alarm for a different interval is rejected', async () => {
  const h = createTestHarness();
  const session = await startStopwatch(h);
  const wrongIntervalAlarm = buildPomodoroStageAlarmName(
    session.id,
    2,
    'FOCUS',
    session.pomodoroState!.phaseStartedAt
  );

  await assert.rejects(
    async () => h.coordinator.advancePomodoroStage(wrongIntervalAlarm),
    /Invalid or forged alarm name for Pomodoro Stopwatch/
  );

  const stored = await h.storage.getCurrentSession();
  assert.strictEqual(stored?.pomodoroState?.currentPhase, 'FOCUS');
  assert.strictEqual(stored?.pomodoroState?.currentInterval, 1);
});

test('Alarm validation 7: an alarm for a different phase is rejected', async () => {
  const h = createTestHarness();
  const session = await startStopwatch(h);
  const wrongPhaseAlarm = buildPomodoroStageAlarmName(
    session.id,
    session.pomodoroState!.currentInterval,
    'SHORT_BREAK',
    session.pomodoroState!.phaseStartedAt
  );

  await assert.rejects(
    async () => h.coordinator.advancePomodoroStage(wrongPhaseAlarm),
    /Invalid or forged alarm name for Pomodoro Stopwatch/
  );

  const stored = await h.storage.getCurrentSession();
  assert.strictEqual(stored?.pomodoroState?.currentPhase, 'FOCUS');
  assert.strictEqual(stored?.pomodoroState?.completedFocusCount, 0);
});

// ---------------------------------------------------------------------------
// 8. THE LIVE BUG: stale but self-created break alarm after lifecycle recovery
// ---------------------------------------------------------------------------
test('Alarm validation 8: a self-created break alarm already consumed by lifecycle reconciliation is ignored, not reported as forged', async () => {
  const h = createTestHarness();
  const session = await startStopwatch(h);

  const shortBreak = await h.coordinator.advancePomodoroStage(focusAlarm(session));
  assert.ok(shortBreak);
  const breakStartedAt = shortBreak.pomodoroState!.phaseStartedAt;

  // Simulate a 1-minute break that has just elapsed while the Service Worker
  // was asleep. The alarm name keeps the break phaseStartedAt.
  await h.storage.updateCurrentSession((current) => {
    if (!current || !current.pomodoroState) return current;
    return {
      ...current,
      pomodoroState: {
        ...current.pomodoroState,
        phaseStartedAt: Date.now() - 61_000,
      },
    };
  });
  const aged = await h.storage.getCurrentSession();
  assert.ok(aged);
  const staleBreakAlarm = buildPomodoroStageAlarmName(
    aged.id,
    aged.pomodoroState!.currentInterval,
    'SHORT_BREAK',
    aged.pomodoroState!.phaseStartedAt
  );

  // index.ts calls ensureInitialized() before advancePomodoroStage(alarm.name).
  // Lifecycle reconcile already completes the elapsed break here.
  await h.coordinator.ensureInitialized();
  const afterReconcile = await h.storage.getCurrentSession();
  assert.strictEqual(afterReconcile?.pomodoroState?.currentPhase, 'FOCUS');
  assert.strictEqual(afterReconcile?.pomodoroState?.currentInterval, 2);
  // Reconcile sets the new Focus phaseStartedAt to Date.now(), while breakStartedAt
  // was captured just before backdating storage; in fast in-memory runs both calls
  // can fall within the same millisecond (whereas aged.phaseStartedAt is -61s).
  assert.ok(
    afterReconcile!.pomodoroState!.phaseStartedAt >= breakStartedAt,
    'new Focus phase must start at or after the break phase'
  );

  // Chrome then delivers the same (now stale) break alarm to onAlarm.
  // It must be a silent no-op, NOT "Invalid or forged alarm name".
  const result = await h.coordinator.advancePomodoroStage(staleBreakAlarm);
  assert.ok(result);
  assert.strictEqual(result.pomodoroState?.currentPhase, 'FOCUS');
  assert.strictEqual(result.pomodoroState?.currentInterval, 2);
  assert.strictEqual(result.pomodoroState?.currentCycle, 1);
  assert.strictEqual(result.pomodoroState?.completedFocusCount, 1, 'no extra focus completion');
});

// ---------------------------------------------------------------------------
// 9-10. Countdown and Pomodoro Stopwatch alarms cannot cross modes
// ---------------------------------------------------------------------------
test('Alarm validation 9: the Countdown finish alarm cannot impersonate a Stopwatch stage alarm', async () => {
  const h = createTestHarness();
  await startStopwatch(h);

  assert.strictEqual(parsePomodoroStageAlarmName(ALARM_NAMES.COUNTDOWN_FINISH), null);

  await assert.rejects(
    async () => h.coordinator.advancePomodoroStage(ALARM_NAMES.COUNTDOWN_FINISH),
    /Invalid or forged alarm name for Pomodoro Stopwatch/
  );

  const stored = await h.storage.getCurrentSession();
  assert.strictEqual(stored?.pomodoroState?.currentPhase, 'FOCUS');
  assert.strictEqual(stored?.pomodoroState?.completedFocusCount, 0);
});

test('Alarm validation 10: a Stopwatch stage alarm cannot drive a Countdown session', async () => {
  const h = createTestHarness();
  const profile = await h.profileManager.createProfile('Countdown Mode', ['wikipedia.org']);
  const countdown = await h.coordinator.startSession('COUNTDOWN', 1, profile.id);

  const stopwatchStyleAlarm = buildPomodoroStageAlarmName(
    countdown.id,
    1,
    'FOCUS',
    countdown.pomodoroState?.phaseStartedAt ?? Date.now()
  );

  // advancePomodoroStage only operates on POMODORO_* sessions.
  const result = await h.coordinator.advancePomodoroStage(stopwatchStyleAlarm);
  assert.strictEqual(result, null);
  const countdownStillRunning = await h.storage.getCurrentSession();
  assert.strictEqual(countdownStillRunning?.id, countdown.id);
  assert.strictEqual(countdownStillRunning?.mode, 'COUNTDOWN');

  // completeCountdown only operates on COUNTDOWN sessions.
  const h2 = createTestHarness();
  const stopwatchSession = await startStopwatch(h2);
  const noOp = await h2.coordinator.completeCountdown();
  assert.strictEqual(noOp, null);
  const stillRunning = await h2.storage.getCurrentSession();
  assert.strictEqual(stillRunning?.id, stopwatchSession.id);
  assert.strictEqual(stillRunning?.status, 'RUNNING');
  assert.strictEqual(stillRunning?.mode, 'POMODORO_STOPWATCH');
});

// ---------------------------------------------------------------------------
// 11-12. Breaks are not skipped
// ---------------------------------------------------------------------------
test('Alarm validation 11: Short Break is not skipped by a stale FOCUS alarm', async () => {
  const h = createTestHarness();
  const session = await startStopwatch(h);
  const firstFocusAlarm = focusAlarm(session);

  const shortBreak = await h.coordinator.advancePomodoroStage(firstFocusAlarm);
  assert.ok(shortBreak);
  assert.strictEqual(shortBreak.pomodoroState?.currentPhase, 'SHORT_BREAK');

  // Same Focus alarm delivered twice -> stale no-op.
  await h.coordinator.advancePomodoroStage(firstFocusAlarm);
  const stillBreak = await h.storage.getCurrentSession();
  assert.strictEqual(stillBreak?.pomodoroState?.currentPhase, 'SHORT_BREAK');
  assert.strictEqual(stillBreak?.pomodoroState?.currentInterval, 1);

  // Only the actual break alarm ends the break.
  const nextFocus = await h.coordinator.advancePomodoroStage(breakAlarm(shortBreak));
  assert.ok(nextFocus);
  assert.strictEqual(nextFocus.pomodoroState?.currentPhase, 'FOCUS');
  assert.strictEqual(nextFocus.pomodoroState?.currentInterval, 2);
});

test('Alarm validation 12: Long Break is not skipped by stale Focus or Short Break alarms', async () => {
  const h = createTestHarness();
  const { shortBreak, focus2, longBreak } = await advanceToLongBreak(h);

  await h.coordinator.advancePomodoroStage(focusAlarm(focus2)); // stale Focus 2 alarm
  await h.coordinator.advancePomodoroStage(breakAlarm(shortBreak)); // stale Short Break alarm

  const stillLongBreak = await h.storage.getCurrentSession();
  assert.strictEqual(stillLongBreak?.pomodoroState?.currentPhase, 'LONG_BREAK');
  assert.strictEqual(stillLongBreak?.pomodoroState?.currentCycle, 1);

  const nextCycle = await h.coordinator.advancePomodoroStage(breakAlarm(longBreak));
  assert.ok(nextCycle);
  assert.strictEqual(nextCycle.pomodoroState?.currentPhase, 'FOCUS');
  assert.strictEqual(nextCycle.pomodoroState?.currentCycle, 2);
  assert.strictEqual(nextCycle.pomodoroState?.currentInterval, 1);
});

// ---------------------------------------------------------------------------
// 13. Duplicate alarm cannot double reward
// ---------------------------------------------------------------------------
test('Alarm validation 13: duplicate delivery of a valid alarm does not double reward', async () => {
  const h = createTestHarness();
  const session = await startStopwatch(h);
  const validAlarm = focusAlarm(session);

  const first = await h.coordinator.advancePomodoroStage(validAlarm);
  assert.ok(first);
  const breakdown = first.pomodoroState!;
  const firstCoins = breakdown.accumulatedCoins;
  const firstXp = breakdown.accumulatedXp;
  const firstCompleted = breakdown.completedFocusCount;

  const duplicate = await h.coordinator.advancePomodoroStage(validAlarm);
  assert.ok(duplicate);
  assert.strictEqual(duplicate.pomodoroState?.currentPhase, 'SHORT_BREAK');
  assert.strictEqual(duplicate.pomodoroState?.completedFocusCount, firstCompleted);
  assert.strictEqual(duplicate.pomodoroState?.accumulatedCoins, firstCoins);
  assert.strictEqual(duplicate.pomodoroState?.accumulatedXp, firstXp);
  assert.strictEqual(h.notifications.dispatchCount, 1, 'break notification must only fire once');
});

// ---------------------------------------------------------------------------
// 14. Focus alarm identity remains protected before any transition
// ---------------------------------------------------------------------------
test('Alarm validation 14: identity checks run before any state mutation', async () => {
  const h = createTestHarness();
  const session = await startStopwatch(h);
  const p = session.pomodoroState!;

  const forgedCandidates = [
    buildPomodoroStageAlarmName('sess_forged', p.currentInterval, 'FOCUS', p.phaseStartedAt),
    buildPomodoroStageAlarmName(session.id, p.currentInterval + 1, 'FOCUS', p.phaseStartedAt),
    buildPomodoroStageAlarmName(session.id, p.currentInterval, 'LONG_BREAK', p.phaseStartedAt),
    buildPomodoroStageAlarmName(session.id, p.currentInterval, 'FOCUS', p.phaseStartedAt + 60_000),
  ];

  for (const forged of forgedCandidates) {
    await assert.rejects(
      async () => h.coordinator.advancePomodoroStage(forged),
      /Invalid or forged alarm name for Pomodoro Stopwatch/,
      `forged alarm must be rejected: ${forged}`
    );
    const stored = await h.storage.getCurrentSession();
    assert.strictEqual(stored?.pomodoroState?.currentPhase, 'FOCUS');
    assert.strictEqual(stored?.pomodoroState?.completedFocusCount, 0);
    assert.strictEqual(stored?.pomodoroState?.phaseStartedAt, p.phaseStartedAt);
  }
});
