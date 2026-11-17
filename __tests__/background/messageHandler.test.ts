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
import { SessionCoordinator } from '../../src/background/sessionCoordinator.ts';
import { MessageHandler } from '../../src/background/messageHandler.ts';

function createMessageHandlerHarness() {
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

  const handler = new MessageHandler(sessionCoordinator, profileManager, storage);

  return { handler, storage, profileManager, sessionCoordinator, dnr };
}

test('MessageHandler: handles profile lifecycle messages cleanly', async () => {
  const { handler } = createMessageHandlerHarness();

  // 1. Create Profile
  const rCreate = await handler.handleMessage({
    action: 'CREATE_PROFILE',
    payload: { name: 'Deep Work' },
  });
  assert.strictEqual(rCreate.success, true);
  const pId = (rCreate.data as { id: string }).id;

  // 2. Add Domain
  const rAddDomain = await handler.handleMessage({
    action: 'ADD_DOMAIN',
    payload: { profileId: pId, domainPattern: 'github.com' },
  });
  assert.strictEqual(rAddDomain.success, true);
  assert.deepStrictEqual((rAddDomain.data as { allowedDomains: string[] }).allowedDomains, ['github.com']);

  // 3. Rename Profile
  const rRename = await handler.handleMessage({
    action: 'RENAME_PROFILE',
    payload: { profileId: pId, newName: 'Deep Work / Coding' },
  });
  assert.strictEqual(rRename.success, true);
  assert.strictEqual((rRename.data as { name: string }).name, 'Deep Work / Coding');

  // 4. Get Profiles
  const rGet = await handler.handleMessage({ action: 'GET_PROFILES' });
  assert.strictEqual(rGet.success, true);
  assert.strictEqual((rGet.data as unknown[]).length, 1);

  // 5. Remove Domain
  const rRemoveDomain = await handler.handleMessage({
    action: 'REMOVE_DOMAIN',
    payload: { profileId: pId, domainPattern: 'github.com' },
  });
  assert.strictEqual(rRemoveDomain.success, true);
  assert.deepStrictEqual((rRemoveDomain.data as { allowedDomains: string[] }).allowedDomains, []);
});

test('MessageHandler: handles session messages and rejects invalid payloads safely', async () => {
  const { handler, profileManager } = createMessageHandlerHarness();
  const p = await profileManager.createProfile('Maths');

  // 1. Missing action format
  const rInvalid = await handler.handleMessage(null);
  assert.strictEqual(rInvalid.success, false);
  assert.ok(rInvalid.error?.includes('Invalid message format'));

  // 2. Unknown action
  const rUnknown = await handler.handleMessage({ action: 'NON_EXISTENT_ACTION' });
  assert.strictEqual(rUnknown.success, false);
  assert.ok(rUnknown.error?.includes('Unknown action'));

  // 3. Missing payload in START_SESSION
  const rMissingPayload = await handler.handleMessage({ action: 'START_SESSION' });
  assert.strictEqual(rMissingPayload.success, false);

  // 4. Valid START_SESSION
  const rStart = await handler.handleMessage({
    action: 'START_SESSION',
    payload: { mode: 'COUNTDOWN', targetMinutes: 25, profileId: p.id },
  });
  assert.strictEqual(rStart.success, true);

  // 5. GET_SESSION_STATE
  const rState = await handler.handleMessage({ action: 'GET_SESSION_STATE' });
  assert.strictEqual(rState.success, true);
  const data = rState.data as { currentSession: { status: string }; isBlockingActive: boolean };
  assert.strictEqual(data.currentSession.status, 'RUNNING');
  assert.strictEqual(data.isBlockingActive, true);

  // 6. PAUSE_SESSION & RESUME_SESSION
  const rPause = await handler.handleMessage({ action: 'PAUSE_SESSION' });
  assert.strictEqual(rPause.success, true);

  const rResume = await handler.handleMessage({ action: 'RESUME_SESSION' });
  assert.strictEqual(rResume.success, true);

  // 7. GIVE_UP_SESSION
  const rGiveUp = await handler.handleMessage({ action: 'GIVE_UP_SESSION' });
  assert.strictEqual(rGiveUp.success, true);

  // 8. GET_ECONOMY & GET_DAILY_STATS
  const rEconomy = await handler.handleMessage({ action: 'GET_ECONOMY' });
  assert.strictEqual(rEconomy.success, true);

  const rStats = await handler.handleMessage({ action: 'GET_DAILY_STATS' });
  assert.strictEqual(rStats.success, true);
});

// -------------------------------------------------------------------------------------
// FOCUS QUEST ALLOWLIST PROTECTION DURING ACTIVE SESSIONS (TESTS 1 - 13)
// -------------------------------------------------------------------------------------

test('Allowlist Protection: 1. No active session -> adding and removing domain succeeds', async () => {
  const { handler, profileManager } = createMessageHandlerHarness();
  const profile = await profileManager.createProfile('Study Mode');

  // Add website
  const rAdd = await handler.handleMessage({
    action: 'ADD_DOMAIN',
    payload: { profileId: profile.id, domainPattern: 'wikipedia.org' },
  });
  assert.strictEqual(rAdd.success, true);
  assert.deepStrictEqual((rAdd.data as { allowedDomains: string[] }).allowedDomains, ['wikipedia.org']);

  // Remove website
  const rRemove = await handler.handleMessage({
    action: 'REMOVE_DOMAIN',
    payload: { profileId: profile.id, domainPattern: 'wikipedia.org' },
  });
  assert.strictEqual(rRemove.success, true);
  assert.deepStrictEqual((rRemove.data as { allowedDomains: string[] }).allowedDomains, []);
});

test('Allowlist Protection: 2. Countdown RUNNING -> ADD_DOMAIN and REMOVE_DOMAIN are strictly rejected', async () => {
  const { handler, profileManager, sessionCoordinator, dnr, storage } = createMessageHandlerHarness();
  const profile = await profileManager.createProfile('Coding', ['github.com']);

  // Start 25-min Countdown
  await sessionCoordinator.startSession('COUNTDOWN', 25, profile.id);
  const initialDnrRules = await dnr.getDynamicRules();

  // 3. Countdown running: add domain rejected
  const rAdd = await handler.handleMessage({
    action: 'ADD_DOMAIN',
    payload: { profileId: profile.id, domainPattern: 'youtube.com' },
  });
  assert.strictEqual(rAdd.success, false);
  assert.strictEqual(
    rAdd.error,
    'Allowlist cannot be modified during a focus session. Finish your session first.'
  );

  // 4. Countdown running: remove domain rejected
  const rRemove = await handler.handleMessage({
    action: 'REMOVE_DOMAIN',
    payload: { profileId: profile.id, domainPattern: 'github.com' },
  });
  assert.strictEqual(rRemove.success, false);
  assert.strictEqual(
    rRemove.error,
    'Allowlist cannot be modified during a focus session. Finish your session first.'
  );

  // 12. Rejected requests do not modify storage or DNR
  const storedProfile = await profileManager.getProfileById(profile.id);
  assert.deepStrictEqual(storedProfile?.allowedDomains, ['github.com'], 'Storage must remain unchanged');
  const postDnrRules = await dnr.getDynamicRules();
  assert.deepStrictEqual(postDnrRules, initialDnrRules, 'DNR rules must remain unchanged');
});

test('Allowlist Protection: 3. Stopwatch RUNNING -> ADD_DOMAIN and REMOVE_DOMAIN are strictly rejected', async () => {
  const { handler, profileManager, sessionCoordinator, dnr } = createMessageHandlerHarness();
  const profile = await profileManager.createProfile('Reading', ['books.google.com']);

  // Start Stopwatch
  await sessionCoordinator.startSession('STOPWATCH', 0, profile.id);
  const initialDnrRules = await dnr.getDynamicRules();

  // 5. Stopwatch running: add domain rejected
  const rAdd = await handler.handleMessage({
    action: 'ADD_DOMAIN',
    payload: { profileId: profile.id, domainPattern: 'reddit.com' },
  });
  assert.strictEqual(rAdd.success, false);
  assert.strictEqual(
    rAdd.error,
    'Allowlist cannot be modified during a focus session. Finish your session first.'
  );

  // 6. Stopwatch running: remove domain rejected
  const rRemove = await handler.handleMessage({
    action: 'REMOVE_DOMAIN',
    payload: { profileId: profile.id, domainPattern: 'books.google.com' },
  });
  assert.strictEqual(rRemove.success, false);
  assert.strictEqual(
    rRemove.error,
    'Allowlist cannot be modified during a focus session. Finish your session first.'
  );

  const storedProfile = await profileManager.getProfileById(profile.id);
  assert.deepStrictEqual(storedProfile?.allowedDomains, ['books.google.com']);
  const postDnrRules = await dnr.getDynamicRules();
  assert.deepStrictEqual(postDnrRules, initialDnrRules);
});

test('Allowlist Protection: 4. Countdown PAUSED -> Allowlist modification rejected & domain manager throws', async () => {
  const { handler, profileManager, sessionCoordinator } = createMessageHandlerHarness();
  const profile = await profileManager.createProfile('Research', ['arxiv.org']);

  await sessionCoordinator.startSession('COUNTDOWN', 30, profile.id);
  await sessionCoordinator.pauseSession();

  // 7. Countdown paused: add domain rejected
  const rAdd = await handler.handleMessage({
    action: 'ADD_DOMAIN',
    payload: { profileId: profile.id, domainPattern: 'netflix.com' },
  });
  assert.strictEqual(rAdd.success, false);
  assert.strictEqual(
    rAdd.error,
    'Allowlist cannot be modified during a focus session. Finish your session first.'
  );

  // Direct ProfileManager call during pause also rejects
  await assert.rejects(
    async () => profileManager.addDomainToProfile(profile.id, 'netflix.com'),
    /Allowlist cannot be modified during a focus session/
  );
});

test('Allowlist Protection: 5. Stopwatch PAUSED -> Allowlist modification rejected', async () => {
  const { handler, profileManager, sessionCoordinator } = createMessageHandlerHarness();
  const profile = await profileManager.createProfile('Study', ['khanacademy.org']);

  await sessionCoordinator.startSession('STOPWATCH', 0, profile.id);
  await sessionCoordinator.pauseSession();

  // 8. Stopwatch paused: remove domain rejected
  const rRemove = await handler.handleMessage({
    action: 'REMOVE_DOMAIN',
    payload: { profileId: profile.id, domainPattern: 'khanacademy.org' },
  });
  assert.strictEqual(rRemove.success, false);
  assert.strictEqual(
    rRemove.error,
    'Allowlist cannot be modified during a focus session. Finish your session first.'
  );
});

test('Allowlist Protection: 6. SWITCH_PROFILE during active session is strictly rejected', async () => {
  const { handler, profileManager, sessionCoordinator } = createMessageHandlerHarness();
  const p1 = await profileManager.createProfile('Profile A', ['sitea.com']);
  const p2 = await profileManager.createProfile('Profile B', ['siteb.com']);

  // Start session with Profile A
  await sessionCoordinator.startSession('COUNTDOWN', 25, p1.id);

  // 10. Attempt to switch to Profile B during session
  const rSwitch = await handler.handleMessage({
    action: 'SWITCH_PROFILE',
    payload: { profileId: p2.id },
  });
  assert.strictEqual(rSwitch.success, false);
  assert.strictEqual(
    rSwitch.error,
    'Cannot switch active profile during a focus session. Finish your session first.'
  );

  // Verify active profile was NOT switched
  const active = await profileManager.getActiveProfile();
  assert.strictEqual(active.id, p1.id, 'Active profile must remain Profile A');
});

test('Allowlist Protection: 7. After session completion / give up -> allowlist editing unlocks normally', async () => {
  const { handler, profileManager, sessionCoordinator } = createMessageHandlerHarness();
  const profile = await profileManager.createProfile('Writing', ['docs.google.com']);

  await sessionCoordinator.startSession('COUNTDOWN', 25, profile.id);

  // During session: rejected
  const rDuring = await handler.handleMessage({
    action: 'ADD_DOMAIN',
    payload: { profileId: profile.id, domainPattern: 'grammarly.com' },
  });
  assert.strictEqual(rDuring.success, false);

  // 11. Complete/Give up session
  await sessionCoordinator.giveUpCountdown();
  await sessionCoordinator.resetSession();

  // After session: add and remove domain succeed cleanly
  const rAfter = await handler.handleMessage({
    action: 'ADD_DOMAIN',
    payload: { profileId: profile.id, domainPattern: 'grammarly.com' },
  });
  assert.strictEqual(rAfter.success, true);
  assert.deepStrictEqual((rAfter.data as { allowedDomains: string[] }).allowedDomains, [
    'docs.google.com',
    'grammarly.com',
  ]);

  const rRemoveAfter = await handler.handleMessage({
    action: 'REMOVE_DOMAIN',
    payload: { profileId: profile.id, domainPattern: 'grammarly.com' },
  });
  assert.strictEqual(rRemoveAfter.success, true);
  assert.deepStrictEqual((rRemoveAfter.data as { allowedDomains: string[] }).allowedDomains, [
    'docs.google.com',
  ]);
});

test('Allowlist Protection: 8. Background Service Worker restart during active session preserves allowlist protection', async () => {
  const adapter = new MemoryStorageAdapter();
  const storage = new StorageManager(adapter);
  const profileManager = new ProfileManager(storage);
  const alarms = new MockAlarmsAdapter();
  const notifications = new MockNotificationsAdapter();
  const badge = new MockBadgeAdapter();
  const dnr = new MockDNRAdapter();
  const blockingCoordinator = new BlockingCoordinator(dnr);

  const coordinator1 = new SessionCoordinator(
    storage,
    profileManager,
    alarms,
    notifications,
    badge,
    blockingCoordinator
  );

  const profile = await profileManager.createProfile('SW Restart Test', ['work.com']);
  await coordinator1.startSession('COUNTDOWN', 45, profile.id);

  // Simulate Service Worker termination and restart with a new coordinator and message handler
  // reading from the same persistent storage
  const coordinator2 = new SessionCoordinator(
    storage,
    profileManager,
    alarms,
    notifications,
    badge,
    blockingCoordinator
  );
  const handler2 = new MessageHandler(coordinator2, profileManager, storage);

  // Even after restart, modifying allowlist or switching profile must remain strictly blocked
  const rAdd = await handler2.handleMessage({
    action: 'ADD_DOMAIN',
    payload: { profileId: profile.id, domainPattern: 'facebook.com' },
  });
  assert.strictEqual(rAdd.success, false);
  assert.strictEqual(
    rAdd.error,
    'Allowlist cannot be modified during a focus session. Finish your session first.'
  );

  const rSwitch = await handler2.handleMessage({
    action: 'SWITCH_PROFILE',
    payload: { profileId: 'some_other_id' },
  });
  assert.strictEqual(rSwitch.success, false);
  assert.strictEqual(
    rSwitch.error,
    'Cannot switch active profile during a focus session. Finish your session first.'
  );
});
