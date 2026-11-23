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
} from '../mocks/chromeMock.ts';
import { BlockingCoordinator } from '../../src/background/blockingCoordinator.ts';
import { SessionCoordinator, ALARM_NAMES } from '../../src/background/sessionCoordinator.ts';
import { MessageHandler } from '../../src/background/messageHandler.ts';

function createIntegrationHarness() {
  const adapter = new MemoryStorageAdapter();
  const storage = new StorageManager(adapter);
  const profileManager = new ProfileManager(storage);
  const alarms = new MockAlarmsAdapter();
  const notifications = new MockNotificationsAdapter();
  const badge = new MockBadgeAdapter();
  const dnr = new MockDNRAdapter();
  const blockingCoordinator = new BlockingCoordinator(dnr);

  const sessionCoordinator = new SessionCoordinator(
    storage,
    profileManager,
    alarms,
    notifications,
    badge,
    blockingCoordinator
  );

  const messageHandler = new MessageHandler(
    sessionCoordinator,
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
    blockingCoordinator,
    sessionCoordinator,
    messageHandler,
  };
}

test('Integration: Concurrent START_SESSION requests only allow exactly one session to start', async () => {
  const h = createIntegrationHarness();
  const profile = await h.profileManager.createProfile('Research Profile');

  const startPayload = {
    action: 'START_SESSION' as const,
    payload: {
      mode: 'COUNTDOWN' as const,
      targetMinutes: 25,
      profileId: profile.id,
    },
  };

  // Dispatch two concurrent START_SESSION messages
  const [res1, res2] = await Promise.all([
    h.messageHandler.handleMessage(startPayload),
    h.messageHandler.handleMessage(startPayload),
  ]);

  // One must succeed, one must fail with status collision error
  const successes = [res1, res2].filter((r) => r.success);
  const failures = [res1, res2].filter((r) => !r.success);

  assert.strictEqual(successes.length, 1, 'Only one session must start');
  assert.strictEqual(failures.length, 1, 'Second concurrent start must be rejected');
  assert.ok(failures[0].error?.includes('already in status'));
});

test('Integration: Concurrent PAUSE_SESSION requests only consume 1 pause count', async () => {
  const h = createIntegrationHarness();
  const profile = await h.profileManager.createProfile('Coding Profile');

  await h.messageHandler.handleMessage({
    action: 'START_SESSION',
    payload: { mode: 'COUNTDOWN', targetMinutes: 25, profileId: profile.id },
  });

  // Dispatch two concurrent PAUSE_SESSION messages
  const [res1, res2] = await Promise.all([
    h.messageHandler.handleMessage({ action: 'PAUSE_SESSION' }),
    h.messageHandler.handleMessage({ action: 'PAUSE_SESSION' }),
  ]);

  const successes = [res1, res2].filter((r) => r.success);
  assert.strictEqual(successes.length, 1, 'Only one pause request can transition from RUNNING');

  const session = await h.storage.getCurrentSession();
  assert.strictEqual(session?.pauseCount, 1, 'Pause count must be exactly 1, not 2');
  assert.strictEqual(session?.status, 'PAUSED');
});

test('Integration: Concurrent completion requests guarantee exactly-once reward processing', async () => {
  const h = createIntegrationHarness();
  const profile = await h.profileManager.createProfile('Pomodoro Profile');

  await h.sessionCoordinator.startSession('COUNTDOWN', 25, profile.id);

  // Dispatch two concurrent completeCountdown calls
  const [res1, res2] = await Promise.all([
    h.sessionCoordinator.completeCountdown(),
    h.sessionCoordinator.completeCountdown(),
  ]);

  assert.ok(res1);
  assert.ok(res2);
  assert.strictEqual(res1?.rewardProcessed, true);
  assert.strictEqual(res2?.rewardProcessed, true);

  // Economy must only be credited once (37.5 coins, 125 xp under 1.0x tier)
  const economy = await h.storage.getEconomy();
  assert.strictEqual(economy.focusCoins, 37.5, 'Coins must not be credited twice');
  assert.strictEqual(economy.totalXP, 125, 'XP must not be credited twice');

  // Daily stats must record exactly 1 completed session
  const todayKey = new Date().toISOString().slice(0, 10);
  const stats = await h.storage.getDailyStats();
  assert.strictEqual(stats[todayKey].completedSessions, 1);
});

test('Integration: Full end-to-end flow via MessageHandler', async () => {
  const h = createIntegrationHarness();

  // 1. Create Profile
  const rProfile = await h.messageHandler.handleMessage({
    action: 'CREATE_PROFILE',
    payload: { name: 'Full Flow Test', initialDomains: ['wikipedia.org'] },
  });
  assert.strictEqual(rProfile.success, true);
  const profileId = (rProfile.data as { id: string }).id;

  // 2. Start Stopwatch
  const rStart = await h.messageHandler.handleMessage({
    action: 'START_SESSION',
    payload: { mode: 'STOPWATCH', targetMinutes: 0, profileId },
  });
  assert.strictEqual(rStart.success, true);

  // Check DNR rules activated
  assert.strictEqual((await h.dnr.getDynamicRules()).length, 1);

  // Simulate 26 minutes elapsed
  await h.storage.updateCurrentSession((curr) => ({
    ...curr!,
    startedAt: Date.now() - 26 * 60 * 1000,
  }));

  // 3. Finish Stopwatch (26m in 5-29m tier = 1.0x -> 26 Coins, 78 XP)
  const rFinish = await h.messageHandler.handleMessage({ action: 'FINISH_STOPWATCH' });
  assert.strictEqual(rFinish.success, true);
  const finishData = rFinish.data as { coinsEarned: number; xpEarned: number };
  assert.strictEqual(finishData.coinsEarned, 26);
  assert.strictEqual(finishData.xpEarned, 78);

  // 4. Verify DNR rules cleared
  assert.strictEqual((await h.dnr.getDynamicRules()).length, 0);

  // 5. Query Full Session State via MessageHandler
  const rState = await h.messageHandler.handleMessage({ action: 'GET_SESSION_STATE' });
  assert.strictEqual(rState.success, true);
  const stateData = rState.data as {
    currentSession: { status: string };
    economy: { focusCoins: number; totalXP: number };
    isBlockingActive: boolean;
  };
  assert.strictEqual(stateData.currentSession.status, 'COMPLETED');
  assert.strictEqual(stateData.economy.focusCoins, 26);
  assert.strictEqual(stateData.economy.totalXP, 78);
  assert.strictEqual(stateData.isBlockingActive, false);
});
