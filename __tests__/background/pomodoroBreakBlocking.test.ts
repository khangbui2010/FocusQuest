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
import {
  BlockingCoordinator,
  FOCUS_BLOCK_RULE_BASE_ID,
  BLOCKED_PAGE_PATH,
  isWebsiteBlockingActive,
} from '../../src/background/blockingCoordinator.ts';
import {
  SessionCoordinator,
  buildPomodoroStageAlarmName,
} from '../../src/background/sessionCoordinator.ts';
import { SessionSnapshot } from '../../src/types/session.ts';

/**
 * Priority 2B regression suite: website blocking must follow the authoritative
 * background phase. Focus blocks non-allowlisted sites; every break (short and
 * long) and pause must disable *all* blocking mechanisms (DNR dynamic rules AND
 * the tabs.onUpdated redirect watcher), then Focus must re-arm them.
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

  return { storage, profileManager, alarms, notifications, badge, dnr, tabs, blockingCoordinator, coordinator };
}

async function startStopwatch(h: ReturnType<typeof createTestHarness>) {
  const profile = await h.profileManager.createProfile('Break Blocking', ['wikipedia.org']);
  const session = await h.coordinator.startSession('POMODORO_STOPWATCH', 1, profile.id, POMODORO_CONFIG);
  return { profile, session };
}

function focusAlarmFor(session: SessionSnapshot) {
  const p = session.pomodoroState!;
  return buildPomodoroStageAlarmName(session.id, p.currentInterval, 'FOCUS', p.phaseStartedAt);
}

function breakAlarmFor(session: SessionSnapshot) {
  const p = session.pomodoroState!;
  return buildPomodoroStageAlarmName(session.id, p.currentInterval, p.currentPhase, p.phaseStartedAt);
}

async function currentSession(h: ReturnType<typeof createTestHarness>): Promise<SessionSnapshot> {
  const session = await h.storage.getCurrentSession();
  assert.ok(session, 'a session must exist');
  return session;
}

async function advanceToLongBreak(h: ReturnType<typeof createTestHarness>) {
  const started = await currentSession(h);
  const shortBreak = await h.coordinator.advancePomodoroStage(focusAlarmFor(started));
  assert.ok(shortBreak);
  assert.strictEqual(shortBreak.pomodoroState?.currentPhase, 'SHORT_BREAK');
  const focus2 = await h.coordinator.advancePomodoroStage(breakAlarmFor(shortBreak));
  assert.ok(focus2);
  assert.strictEqual(focus2.pomodoroState?.currentPhase, 'FOCUS');
  const longBreak = await h.coordinator.advancePomodoroStage(focusAlarmFor(focus2));
  assert.ok(longBreak);
  assert.strictEqual(longBreak.pomodoroState?.currentPhase, 'LONG_BREAK');
  return { started, shortBreak, focus2, longBreak };
}

function assertBlockingRuleActive(rules: { id: number; condition: { resourceTypes?: string[]; excludedRequestDomains?: string[] }; action: { type: string; redirect?: { extensionPath?: string } } }[]) {
  assert.strictEqual(rules.length, 1, 'FOCUS must install exactly one DNR rule');
  const rule = rules[0];
  assert.strictEqual(rule.id, FOCUS_BLOCK_RULE_BASE_ID);
  assert.strictEqual(rule.action.type, 'redirect');
  assert.strictEqual(rule.action.redirect?.extensionPath, BLOCKED_PAGE_PATH);
  assert.deepStrictEqual(rule.condition.resourceTypes, ['main_frame']);
  assert.deepStrictEqual(rule.condition.excludedRequestDomains, ['wikipedia.org']);
}

// ---------------------------------------------------------------------------
// 1. FOCUS blocks non-allowlisted websites
// ---------------------------------------------------------------------------
test('Break blocking 1: FOCUS blocks a website outside the allowlist', async () => {
  const h = createTestHarness();
  const { session } = await startStopwatch(h);

  assert.strictEqual(isWebsiteBlockingActive(session), true);
  assertBlockingRuleActive(await h.dnr.getDynamicRules());

  h.tabs.createTab({ id: 7, url: 'https://example.com/video' });
  const redirected = await h.blockingCoordinator.handleTabUpdate(
    7,
    { status: 'loading', url: 'https://example.com/video' },
    { id: 7, url: 'https://example.com/video' },
    await h.profileManager.getActiveProfile(),
    await currentSession(h)
  );
  assert.strictEqual(redirected, true, 'non-allowlisted navigation must be redirected');
  assert.strictEqual(h.tabs.updateHistory.length, 1);
  assert.ok(h.tabs.updateHistory[0].newUrl.endsWith('/blocked.html'));
});

// ---------------------------------------------------------------------------
// 2-3. SHORT_BREAK and LONG_BREAK allow non-allowlisted websites
// ---------------------------------------------------------------------------
test('Break blocking 2: SHORT_BREAK disables DNR and the navigation redirect for non-allowlisted websites', async () => {
  const h = createTestHarness();
  await startStopwatch(h);

  const shortBreak = await h.coordinator.advancePomodoroStage(focusAlarmFor(await currentSession(h)));
  assert.ok(shortBreak);
  assert.strictEqual(shortBreak.pomodoroState?.currentPhase, 'SHORT_BREAK');

  assert.strictEqual((await h.dnr.getDynamicRules()).length, 0, 'Short Break must remove DNR rules');
  assert.strictEqual(isWebsiteBlockingActive(shortBreak), false);

  h.tabs.createTab({ id: 8, url: 'https://example.com' });
  const redirected = await h.blockingCoordinator.handleTabUpdate(
    8,
    { status: 'loading', url: 'https://example.com' },
    { id: 8, url: 'https://example.com' },
    await h.profileManager.getActiveProfile(),
    await currentSession(h)
  );
  assert.strictEqual(redirected, false, 'Short Break must not redirect navigations');
  assert.strictEqual(h.tabs.updateHistory.length, 0);
});

test('Break blocking 3: LONG_BREAK disables DNR and the navigation redirect for non-allowlisted websites', async () => {
  const h = createTestHarness();
  await startStopwatch(h);
  const { longBreak } = await advanceToLongBreak(h);

  assert.strictEqual((await h.dnr.getDynamicRules()).length, 0, 'Long Break must remove DNR rules');
  assert.strictEqual(isWebsiteBlockingActive(longBreak), false);

  h.tabs.createTab({ id: 9, url: 'https://example.com' });
  const redirected = await h.blockingCoordinator.handleTabUpdate(
    9,
    { status: 'loading', url: 'https://example.com' },
    { id: 9, url: 'https://example.com' },
    await h.profileManager.getActiveProfile(),
    await currentSession(h)
  );
  assert.strictEqual(redirected, false, 'Long Break must not redirect navigations');
  assert.strictEqual(h.tabs.updateHistory.length, 0);
});

// ---------------------------------------------------------------------------
// 4. PAUSE allows non-allowlisted websites
// ---------------------------------------------------------------------------
test('Break blocking 4: PAUSE disables DNR/navigation blocking and reports blocking inactive', async () => {
  const h = createTestHarness();
  await startStopwatch(h);

  const paused = await h.coordinator.pauseSession();
  assert.strictEqual(paused.status, 'PAUSED');
  assert.strictEqual((await h.dnr.getDynamicRules()).length, 0, 'PAUSE must remove DNR rules');

  const state = await h.coordinator.getFullState();
  assert.strictEqual(state.isBlockingActive, false, 'popup state must reflect the real pause');
  assert.strictEqual(isWebsiteBlockingActive(paused), false);

  h.tabs.createTab({ id: 10, url: 'https://example.com' });
  const redirected = await h.blockingCoordinator.handleTabUpdate(
    10,
    { status: 'loading', url: 'https://example.com' },
    { id: 10, url: 'https://example.com' },
    await h.profileManager.getActiveProfile(),
    paused
  );
  assert.strictEqual(redirected, false, 'PAUSE must not redirect navigations');
  assert.strictEqual(h.tabs.updateHistory.length, 0);
});

// ---------------------------------------------------------------------------
// 5-6. Break -> FOCUS restores blocking
// ---------------------------------------------------------------------------
test('Break blocking 5: SHORT_BREAK ending restores FOCUS DNR blocking', async () => {
  const h = createTestHarness();
  await startStopwatch(h);

  const shortBreak = await h.coordinator.advancePomodoroStage(focusAlarmFor(await currentSession(h)));
  assert.ok(shortBreak);
  assert.strictEqual((await h.dnr.getDynamicRules()).length, 0);

  const focus2 = await h.coordinator.advancePomodoroStage(breakAlarmFor(shortBreak));
  assert.ok(focus2);
  assert.strictEqual(focus2.pomodoroState?.currentPhase, 'FOCUS');
  assert.strictEqual(focus2.pomodoroState?.currentInterval, 2);
  assertBlockingRuleActive(await h.dnr.getDynamicRules());

  const state = await h.coordinator.getFullState();
  assert.strictEqual(state.isBlockingActive, true, 'popup must report blocking active again');
});

test('Break blocking 6: LONG_BREAK ending restores FOCUS DNR blocking in the next cycle', async () => {
  const h = createTestHarness();
  await startStopwatch(h);
  const { longBreak } = await advanceToLongBreak(h);
  assert.strictEqual((await h.dnr.getDynamicRules()).length, 0);

  const cycle2 = await h.coordinator.advancePomodoroStage(breakAlarmFor(longBreak));
  assert.ok(cycle2);
  assert.strictEqual(cycle2.pomodoroState?.currentPhase, 'FOCUS');
  assert.strictEqual(cycle2.pomodoroState?.currentCycle, 2);
  assertBlockingRuleActive(await h.dnr.getDynamicRules());
});

// ---------------------------------------------------------------------------
// 7. Stale async FOCUS work cannot re-enable blocking during a Break
// ---------------------------------------------------------------------------
class GatedDNRAdapter extends MockDNRAdapter {
  private holdRequested = false;
  private releaseActive: (() => void) | null = null;
  private holdReached!: () => void;
  private holdReachedPromise: Promise<void> = Promise.resolve();

  holdNextRead(): void {
    this.holdRequested = true;
    this.holdReachedPromise = new Promise<void>((resolve) => {
      this.holdReached = resolve;
    });
  }

  async waitForHold(): Promise<void> {
    await this.holdReachedPromise;
  }

  releaseHold(): void {
    this.releaseActive?.();
    this.releaseActive = null;
  }

  async getDynamicRules() {
    if (this.holdRequested) {
      this.holdRequested = false;
      const gate = new Promise<void>((resolve) => {
        this.releaseActive = resolve;
      });
      this.holdReached();
      await gate;
    }
    return super.getDynamicRules();
  }
}

test('Break blocking 7: an in-flight old FOCUS apply cannot re-enable DNR after the break clears it', async () => {
  const dnr = new GatedDNRAdapter();
  const tabs = new MockTabsAdapter();
  const coordinator = new BlockingCoordinator(dnr, tabs);
  const profile = {
    id: 'p1',
    name: 'In-flight',
    allowedDomains: ['wikipedia.org'],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  dnr.holdNextRead();
  const staleFocusApply = coordinator.syncBlocking(true, profile);
  await dnr.waitForHold();

  // Break starts while the old FOCUS apply is still awaiting Chrome.
  const breakClear = coordinator.syncBlocking(false, null);
  dnr.releaseHold();

  await staleFocusApply;
  await breakClear;

  assert.strictEqual(
    (await dnr.getDynamicRules()).length,
    0,
    'late FOCUS apply must not leave blocking rules installed during a break'
  );
});

// ---------------------------------------------------------------------------
// 8. Allowlisted websites stay accessible during FOCUS
// ---------------------------------------------------------------------------
test('Break blocking 8: an allowlisted website is not redirected during FOCUS', async () => {
  const h = createTestHarness();
  await startStopwatch(h);
  const session = await currentSession(h);

  h.tabs.createTab({ id: 11, url: 'https://en.wikipedia.org/wiki/Pomodoro' });
  const redirected = await h.blockingCoordinator.handleTabUpdate(
    11,
    { status: 'loading', url: 'https://en.wikipedia.org/wiki/Pomodoro' },
    { id: 11, url: 'https://en.wikipedia.org/wiki/Pomodoro' },
    await h.profileManager.getActiveProfile(),
    session
  );

  assert.strictEqual(redirected, false);
  assert.strictEqual(h.tabs.updateHistory.length, 0);
});

// ---------------------------------------------------------------------------
// 9. DNR scope stays main_frame
// ---------------------------------------------------------------------------
test('Break blocking 9: DNR blocking scope remains main_frame only', async () => {
  const h = createTestHarness();
  await startStopwatch(h);

  const rules = await h.dnr.getDynamicRules();
  assert.strictEqual(rules.length, 1);
  assert.deepStrictEqual(rules[0].condition.resourceTypes, ['main_frame']);
});

// ---------------------------------------------------------------------------
// 10. Every blocking mechanism is off during a Break
// ---------------------------------------------------------------------------
test('Break blocking 10: Break disables all blocking mechanisms, not just DNR rules', async () => {
  const h = createTestHarness();
  await startStopwatch(h);

  const shortBreak = await h.coordinator.advancePomodoroStage(focusAlarmFor(await currentSession(h)));
  assert.ok(shortBreak);
  const breakSession = await currentSession(h);

  // 1. DNR dynamic rules are gone.
  assert.strictEqual((await h.dnr.getDynamicRules()).length, 0);
  // 2. The authoritative predicate says blocking is inactive.
  assert.strictEqual(isWebsiteBlockingActive(breakSession), false);
  // 3. Popup state agrees.
  assert.strictEqual((await h.coordinator.getFullState()).isBlockingActive, false);
  // 4. The independent tabs.onUpdated redirect path is gated off.
  h.tabs.createTab({ id: 12, url: 'https://example.com' });
  const redirected = await h.blockingCoordinator.handleTabUpdate(
    12,
    { status: 'loading', url: 'https://example.com' },
    { id: 12, url: 'https://example.com' },
    await h.profileManager.getActiveProfile(),
    breakSession
  );
  assert.strictEqual(redirected, false);
  assert.strictEqual(h.tabs.updateHistory.length, 0);
});
