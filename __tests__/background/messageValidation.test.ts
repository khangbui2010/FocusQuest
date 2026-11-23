import test from 'node:test';
import assert from 'node:assert';
import { MessageHandler } from '../../src/background/messageHandler.ts';
import { StorageManager } from '../../src/storage/storageManager.ts';
import { MemoryStorageAdapter } from '../../src/storage/memoryStorageAdapter.ts';
import { ProfileManager } from '../../src/core/profiles/profileManager.ts';
import { SessionCoordinator } from '../../src/background/sessionCoordinator.ts';
import { CivilizationCoordinator } from '../../src/background/civilizationCoordinator.ts';
import { ChromeAlarmsAdapter } from '../../src/chrome/alarmsAdapter.ts';
import { ChromeNotificationsAdapter } from '../../src/chrome/notificationsAdapter.ts';
import { ChromeBadgeAdapter } from '../../src/chrome/badgeAdapter.ts';
import { ChromeDNRAdapter } from '../../src/chrome/dnrAdapter.ts';
import { ChromeTabsAdapter } from '../../src/chrome/tabsAdapter.ts';
import { BlockingCoordinator } from '../../src/background/blockingCoordinator.ts';

function createHarness() {
  const adapter = new MemoryStorageAdapter();
  const sessionAdapter = new MemoryStorageAdapter();
  const storage = new StorageManager(adapter, sessionAdapter);
  const profileManager = new ProfileManager(storage);
  const alarms = new ChromeAlarmsAdapter();
  const notifs = new ChromeNotificationsAdapter();
  const badge = new ChromeBadgeAdapter();
  const dnr = new ChromeDNRAdapter();
  const tabs = new ChromeTabsAdapter();
  const blocking = new BlockingCoordinator(dnr, tabs);
  const civCoordinator = new CivilizationCoordinator(storage);
  const sessionCoordinator = new SessionCoordinator(
    storage,
    profileManager,
    alarms,
    notifs,
    badge,
    blocking,
    () => civCoordinator.getActiveCoinBonuses()
  );
  const messageHandler = new MessageHandler(sessionCoordinator, profileManager, storage, civCoordinator);

  return { storage, profileManager, sessionCoordinator, civCoordinator, messageHandler };
}

test('Message Validation: Rejects invalid or unknown message actions', async () => {
  const { messageHandler } = createHarness();

  const res1 = await messageHandler.handleMessage(null);
  assert.strictEqual(res1.success, false);
  assert.ok(res1.error?.includes('Invalid message format'));

  const res2 = await messageHandler.handleMessage({ action: 'NON_EXISTENT_ACTION' });
  assert.strictEqual(res2.success, false);
  assert.ok(res2.error?.includes('Unknown action'));
});

test('Message Validation: START_SESSION validates mode, targetMinutes, and profileId', async () => {
  const { messageHandler, profileManager } = createHarness();
  const p = await profileManager.createProfile('Work', []);

  // Missing payload
  const res1 = await messageHandler.handleMessage({ action: 'START_SESSION' });
  assert.strictEqual(res1.success, false);

  // Invalid mode
  const res2 = await messageHandler.handleMessage({
    action: 'START_SESSION',
    payload: { mode: 'INVALID_MODE' as any, targetMinutes: 25, profileId: p.id },
  });
  assert.strictEqual(res2.success, false);
  assert.ok(res2.error?.includes('Invalid session mode'));

  // Invalid targetMinutes for COUNTDOWN
  const res3 = await messageHandler.handleMessage({
    action: 'START_SESSION',
    payload: { mode: 'COUNTDOWN', targetMinutes: -5, profileId: p.id },
  });
  assert.strictEqual(res3.success, false);
  assert.ok(res3.error?.includes('targetMinutes between 1 and 1440'));
});

test('Message Validation: PLACE_BUILDING validates definitionId and position coordinates', async () => {
  const { messageHandler } = createHarness();

  const res1 = await messageHandler.handleMessage({
    action: 'PLACE_BUILDING',
    payload: { buildingDefinitionId: '', position: { x: 0, y: 0 } },
  });
  assert.strictEqual(res1.success, false);
  assert.ok(res1.error?.includes('buildingDefinitionId'));

  const res2 = await messageHandler.handleMessage({
    action: 'PLACE_BUILDING',
    payload: { buildingDefinitionId: 'stone_age_campfire', position: { x: NaN, y: 0 } as any },
  });
  assert.strictEqual(res2.success, false);
  assert.ok(res2.error?.includes('valid position coordinates'));
});

test('Message Validation: REMOVE_BUILDING and EXPAND_LAND validate payloads', async () => {
  const { messageHandler } = createHarness();

  const res1 = await messageHandler.handleMessage({
    action: 'REMOVE_BUILDING',
    payload: { buildingInstanceId: '   ' },
  });
  assert.strictEqual(res1.success, false);

  const res2 = await messageHandler.handleMessage({
    action: 'EXPAND_LAND',
    payload: { direction: 'EAST' } as any,
  });
  assert.strictEqual(res2.success, false);

  const res3 = await messageHandler.handleMessage({
    action: 'EXPAND_LAND',
    payload: { origin: { x: 8, y: 0 }, slotIndex: 0 } as any,
  });
  assert.strictEqual(res3.success, false);

  const res4 = await messageHandler.handleMessage({
    action: 'EXPAND_LAND',
    payload: { origin: { x: 5, y: 0 } },
  });
  assert.strictEqual(res4.success, false);
  assert.ok(res4.error?.includes('INVALID_ORIGIN'));

  const res5 = await messageHandler.handleMessage({
    action: 'EXPAND_LAND',
    payload: { origin: { x: Number.NaN, y: 0 } },
  });
  assert.strictEqual(res5.success, false);
});
