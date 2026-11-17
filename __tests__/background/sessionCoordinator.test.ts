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
import { SessionCoordinator, ALARM_NAMES, buildPauseAlarmName } from '../../src/background/sessionCoordinator.ts';

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

test('SessionCoordinator: completes full Countdown lifecycle with alarms, rewards, stats, and notification', async () => {
  const h = createTestHarness();
  const profile = await h.profileManager.createProfile('Study Target', ['wikipedia.org']);

  // 1. Start Countdown 25 mins (under unified tier table, 5-29m gets 1.0x)
  const session = await h.coordinator.startSession('COUNTDOWN', 25, profile.id);
  assert.strictEqual(session.status, 'RUNNING');
  assert.strictEqual(session.targetMinutes, 25);
  assert.strictEqual(session.lockedMultiplier, 1.0);

  // Verify alarm created
  const finishAlarm = await h.alarms.get(ALARM_NAMES.COUNTDOWN_FINISH);
  assert.ok(finishAlarm);
  assert.strictEqual(finishAlarm.scheduledTime, session.startedAt + 25 * 60 * 1000);

  // Verify DNR rules active
  const rules = await h.dnr.getDynamicRules();
  assert.strictEqual(rules.length, 1);

  // Verify badge
  assert.strictEqual(h.badge.text, '25m');

  // 2. Complete Countdown
  const completed = await h.coordinator.completeCountdown();
  assert.ok(completed);
  assert.strictEqual(completed.status, 'COMPLETED');
  assert.strictEqual(completed.rewardProcessed, true);

  // Verify economy rewarded: full precision 1.5 coins * 25m * 1.0 = 37.5 coins; 5.0 xp * 25m * 1.0 = 125 xp
  const economy = await h.storage.getEconomy();
  assert.strictEqual(economy.focusCoins, 37.5);
  assert.strictEqual(economy.totalXP, 125);

  // Verify daily stats
  const todayKey = new Date().toISOString().slice(0, 10);
  const dailyStats = await h.storage.getDailyStats();
  assert.strictEqual(dailyStats[todayKey].totalFocusMinutes, 25);
  assert.strictEqual(dailyStats[todayKey].completedSessions, 1);

  // Verify notification sent exactly once
  assert.strictEqual(h.notifications.dispatchCount, 1);

  // Verify infrastructure cleanup
  assert.strictEqual(h.alarms.alarms.size, 0);
  assert.strictEqual((await h.dnr.getDynamicRules()).length, 0);
  assert.strictEqual(h.badge.text, '');

  // 3. Duplicate completion attempt (Idempotency) -> Must not re-reward or dispatch notification
  await h.coordinator.completeCountdown();
  const economyAfterDuplicate = await h.storage.getEconomy();
  assert.strictEqual(economyAfterDuplicate.focusCoins, 37.5, 'Must not duplicate coins');
  assert.strictEqual(h.notifications.dispatchCount, 1, 'Must not duplicate notification');
});

test('SessionCoordinator: handles Pause, Resume, limit of 2, and Auto-Resume after 5 mins', async () => {
  const h = createTestHarness();
  const profile = await h.profileManager.createProfile('Coding', ['github.com']);
  await h.coordinator.startSession('COUNTDOWN', 25, profile.id);

  // Pause 1
  const p1 = await h.coordinator.pauseSession();
  assert.strictEqual(p1.status, 'PAUSED');
  assert.strictEqual(p1.pauseCount, 1);
  assert.strictEqual(h.badge.text, 'PAUSE');
  const dynamicAlarm1 = buildPauseAlarmName(p1.id, p1.currentPauseStartedAt!);
  assert.ok(await h.alarms.get(dynamicAlarm1));

  // Resume 1
  const r1 = await h.coordinator.resumeSession(false);
  assert.strictEqual(r1.status, 'RUNNING');
  assert.strictEqual(await h.alarms.get(dynamicAlarm1), undefined);

  // Pause 2
  const p2 = await h.coordinator.pauseSession();
  assert.strictEqual(p2.pauseCount, 2);

  // Resume 2 via Auto-Resume
  const r2 = await h.coordinator.resumeSession(true);
  assert.strictEqual(r2.status, 'RUNNING');

  // Pause 3 -> Rejects!
  await assert.rejects(
    async () => h.coordinator.pauseSession(),
    /Maximum pause limit reached/
  );
});

test('SessionCoordinator: Countdown Give Up awards 0 Coins/XP but records actual focus minutes in stats', async () => {
  const h = createTestHarness();
  const profile = await h.profileManager.createProfile('Research', ['scholar.google.com']);
  const session = await h.coordinator.startSession('COUNTDOWN', 45, profile.id);

  // Simulate 15 minutes elapsed before giving up
  await h.storage.updateCurrentSession((curr) => {
    return {
      ...curr!,
      startedAt: Date.now() - 15 * 60 * 1000,
    };
  });

  const abandoned = await h.coordinator.giveUpCountdown();
  assert.strictEqual(abandoned.status, 'ABANDONED');
  assert.strictEqual(abandoned.rewardProcessed, true);

  // Economy must remain 0
  const economy = await h.storage.getEconomy();
  assert.strictEqual(economy.focusCoins, 0);
  assert.strictEqual(economy.totalXP, 0);

  // Daily stats must record 15 focus minutes
  const todayKey = new Date().toISOString().slice(0, 10);
  const dailyStats = await h.storage.getDailyStats();
  assert.strictEqual(dailyStats[todayKey].totalFocusMinutes, 15);
  assert.strictEqual(dailyStats[todayKey].abandonedSessions, 1);

  // Rules and badge cleared
  assert.strictEqual((await h.dnr.getDynamicRules()).length, 0);
  assert.strictEqual(h.badge.text, '');
});

test('SessionCoordinator: Stopwatch below 5 minutes awards 0 coins, but Stopwatch at 30 minutes awards 1.2x tier and 240 mins awards 2.5x tier', async () => {
  const h = createTestHarness();
  const profile = await h.profileManager.createProfile('Writing', ['medium.com']);

  // Case A: Stopwatch under 5 minutes (e.g. 4 minutes) -> 0 reward
  await h.coordinator.startSession('STOPWATCH', 0, profile.id);
  await h.storage.updateCurrentSession((curr) => ({
    ...curr!,
    startedAt: Date.now() - 4 * 60 * 1000,
  }));

  const finishShort = await h.coordinator.finishStopwatch();
  assert.strictEqual(finishShort.coinsEarned, 0);
  assert.strictEqual(finishShort.xpEarned, 0);

  let dailyStats = await h.storage.getDailyStats();
  const todayKey = new Date().toISOString().slice(0, 10);
  assert.strictEqual(dailyStats[todayKey].totalFocusMinutes, 4);

  // Case B: Stopwatch at 30 minutes (30-59m tier -> 1.2x)
  await h.coordinator.startSession('STOPWATCH', 0, profile.id);
  await h.storage.updateCurrentSession((curr) => ({
    ...curr!,
    startedAt: Date.now() - 30 * 60 * 1000,
  }));

  const finish30 = await h.coordinator.finishStopwatch();
  // 30 minutes * 1.0 * 1.2 = 36 coins; 30 * 3.0 * 1.2 = 108 xp
  assert.strictEqual(finish30.coinsEarned, 36);
  assert.strictEqual(finish30.xpEarned, 108);

  const economy = await h.storage.getEconomy();
  assert.strictEqual(economy.focusCoins, 36);
  assert.strictEqual(economy.totalXP, 108);

  // Case C: Stopwatch at 240 minutes (180+ tier -> 2.5x on full 240 minutes)
  await h.coordinator.startSession('STOPWATCH', 0, profile.id);
  await h.storage.updateCurrentSession((curr) => ({
    ...curr!,
    startedAt: Date.now() - 240 * 60 * 1000,
  }));

  const finish240 = await h.coordinator.finishStopwatch();
  // 240 minutes * 1.0 * 2.5 = 600 coins; 240 * 3.0 * 2.5 = 1800 xp
  assert.strictEqual(finish240.coinsEarned, 600);
  assert.strictEqual(finish240.xpEarned, 1800);
});

test('SessionCoordinator: Service Worker rehydration catches up Countdown completed during sleep', async () => {
  const h = createTestHarness();
  const profile = await h.profileManager.createProfile('Offline Study', ['wikipedia.org']);

  // Start 15 min session
  await h.coordinator.startSession('COUNTDOWN', 15, profile.id);

  // Simulate computer slept and 20 minutes passed (exceeded 15 min target)
  await h.storage.updateCurrentSession((curr) => ({
    ...curr!,
    startedAt: Date.now() - 20 * 60 * 1000,
  }));

  // SW restarts and calls recoverSession
  await h.coordinator.recoverSession();

  const session = await h.storage.getCurrentSession();
  assert.strictEqual(session?.status, 'COMPLETED', 'Must catch up and mark completed');
  assert.strictEqual(session?.rewardProcessed, true);

  const economy = await h.storage.getEconomy();
  assert.ok(economy.focusCoins > 0, 'Must have awarded coins on catchup');
});

test('SessionCoordinator: duplicate finishStopwatch calls do not duplicate rewards (idempotent)', async () => {
  const h = createTestHarness();
  const profile = await h.profileManager.createProfile('Reading', ['wikipedia.org']);

  await h.coordinator.startSession('STOPWATCH', 0, profile.id);
  await h.storage.updateCurrentSession((curr) => ({
    ...curr!,
    startedAt: Date.now() - 10 * 60 * 1000,
  }));

  const firstFinish = await h.coordinator.finishStopwatch();
  // 10 minutes is in the 5-29m tier (1.0x): 10 * 1.0 * 1.0 = 10 coins; 10 * 3.0 * 1.0 = 30 xp
  assert.strictEqual(firstFinish.coinsEarned, 10);
  assert.strictEqual(firstFinish.xpEarned, 30);

  const economyFirst = await h.storage.getEconomy();
  assert.strictEqual(economyFirst.focusCoins, 10);
  assert.strictEqual(economyFirst.totalXP, 30);

  // Rapid duplicate call (e.g. double click)
  const secondFinish = await h.coordinator.finishStopwatch();
  assert.strictEqual(secondFinish.coinsEarned, 0);
  assert.strictEqual(secondFinish.xpEarned, 0);

  const economySecond = await h.storage.getEconomy();
  assert.strictEqual(economySecond.focusCoins, 10, 'Coins must not be duplicated');
  assert.strictEqual(economySecond.totalXP, 30, 'XP must not be duplicated');
});
