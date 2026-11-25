import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStorageAdapter } from '../../src/storage/memoryStorageAdapter.ts';
import { StorageManager } from '../../src/storage/storageManager.ts';
import { STORAGE_KEYS } from '../../src/storage/storageKeys.ts';
import { MigrationRunner, CURRENT_SCHEMA_VERSION } from '../../src/storage/migrations/migrationRunner.ts';
import { ProfileManager } from '../../src/core/profiles/profileManager.ts';
import { BlockingCoordinator } from '../../src/background/blockingCoordinator.ts';
import { SessionCoordinator } from '../../src/background/sessionCoordinator.ts';
import { CivilizationCoordinator } from '../../src/background/civilizationCoordinator.ts';
import { QuestCoordinator } from '../../src/background/questCoordinator.ts';
import { MessageHandler } from '../../src/background/messageHandler.ts';
import {
  MockAlarmsAdapter,
  MockBadgeAdapter,
  MockDNRAdapter,
  MockNotificationsAdapter,
  MockTabsAdapter,
} from '../mocks/chromeMock.ts';
import { validateCivilizationState } from '../../src/core/civilization/civilizationState.ts';
import { evaluateEraAdvance } from '../../src/core/civilization/eraRules.ts';
import { calculatePlayerLevel } from '../../src/core/economy/levelSystem.ts';
import { INITIAL_CHUNK_COUNT } from '../../src/core/civilization/constants.ts';
import { getActiveTimeScale } from '../../src/ui/services/devRuntimeBridge.ts';
import { createDevBackgroundController } from '../../src/dev/devBackgroundService.ts';
import { DevExportBundle, DevSnapshotData } from '../../src/dev/devTypes.ts';

async function createDevHarness() {
  const adapter = new MemoryStorageAdapter();
  await new MigrationRunner(adapter).runMigrations();
  const storage = new StorageManager(adapter);
  const profileManager = new ProfileManager(storage);

  const alarms = new MockAlarmsAdapter();
  const notifications = new MockNotificationsAdapter();
  const badge = new MockBadgeAdapter();
  const blocking = new BlockingCoordinator(new MockDNRAdapter(), new MockTabsAdapter([]));
  const civilizationCoordinator = new CivilizationCoordinator(storage);
  await civilizationCoordinator.ensureInitialized();
  const questCoordinator = new QuestCoordinator(storage);

  const sessionCoordinator = new SessionCoordinator(
    storage,
    profileManager,
    alarms,
    notifications,
    badge,
    blocking,
    () => civilizationCoordinator.getActiveCoinBonuses(),
    undefined,
    undefined,
    (civState) => civilizationCoordinator.refreshCachedBonuses(civState)
  );
  await sessionCoordinator.ensureInitialized();

  const messageHandler = new MessageHandler(
    sessionCoordinator,
    profileManager,
    storage,
    civilizationCoordinator,
    undefined,
    questCoordinator
  );

  const devController = createDevBackgroundController({
    storageManager: storage,
    sessionCoordinator,
    civilizationCoordinator,
    questCoordinator,
  });

  return {
    adapter,
    storage,
    profileManager,
    sessionCoordinator,
    civilizationCoordinator,
    questCoordinator,
    messageHandler,
    devController,
  };
}

test('5E-2b Part B Security: Production MessageHandler rejects DEV_* actions and default time scale is 1x', async () => {
  assert.strictEqual(getActiveTimeScale(), 1);
  const { messageHandler } = await createDevHarness();

  for (const action of [
    'DEV_SET_COINS',
    'DEV_SKIP_FOCUS_WAIT',
    'DEV_MEET_ERA_REQUIREMENTS',
    'DEV_RESET_ALL_DATA',
  ]) {
    const res = await messageHandler.handleMessage({ action } as unknown as Parameters<
      MessageHandler['handleMessage']
    >[0]);
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.errorCode, 'UNKNOWN_ACTION');
  }
});

test('5E-2b Part B Economy, Buildings, Land, Villagers & Era Readiness preserve all invariants', async () => {
  const { devController, civilizationCoordinator, storage } = await createDevHarness();

  const coinsRes = await devController.handleMessage({
    action: 'DEV_SET_COINS',
    payload: { amount: 2500 },
  });
  assert.strictEqual(coinsRes?.success, true);
  assert.strictEqual((coinsRes?.data as DevSnapshotData).economy.focusCoins, 2500);

  const lvRes = await devController.handleMessage({
    action: 'DEV_SET_LEVEL',
    payload: { level: 12 },
  });
  assert.strictEqual(lvRes?.success, true);
  assert.strictEqual((lvRes?.data as DevSnapshotData).economy.level, 12);
  assert.strictEqual(
    calculatePlayerLevel((lvRes?.data as DevSnapshotData).economy.totalXP),
    12
  );

  const minsRes = await devController.handleMessage({
    action: 'DEV_SET_FOCUS_MINUTES',
    payload: { minutes: 180 },
  });
  assert.strictEqual(minsRes?.success, true);
  assert.strictEqual((minsRes?.data as DevSnapshotData).todayFocusMinutes, 180);

  // Recruit villager without Cave yet -> automatically provisions valid Cave + villager
  const recruitRes = await devController.handleMessage({
    action: 'DEV_RECRUIT_FREE',
    payload: { role: 'elder' },
  });
  assert.strictEqual(recruitRes?.success, true);
  let snap = recruitRes?.data as DevSnapshotData;
  assert.strictEqual(validateCivilizationState(snap.civ).isValid, true);
  assert.strictEqual(snap.civ.villagers?.length, 1);

  // Fill all 3 roles + unlock land + place building + max buildings
  await devController.handleMessage({ action: 'DEV_FILL_ALL_ROLES' });
  await devController.handleMessage({ action: 'DEV_UNLOCK_LAND', payload: { chunks: 1 } });
  await devController.handleMessage({
    action: 'DEV_PLACE_FREE_BUILDING',
    payload: { definitionId: 'stone_age_foraging_post' },
  });
  const maxRes = await devController.handleMessage({ action: 'DEV_MAX_BUILDINGS' });
  snap = maxRes?.data as DevSnapshotData;
  assert.strictEqual(validateCivilizationState(snap.civ).isValid, true);
  assert.ok(civilizationCoordinator.getActiveCoinBonuses().length > 0);

  // Meet Era Requirements -> eligible: true AND era MUST remain STONE_AGE
  const eraRes = await devController.handleMessage({ action: 'DEV_MEET_ERA_REQUIREMENTS' });
  assert.strictEqual(eraRes?.success, true);
  snap = eraRes?.data as DevSnapshotData;
  assert.strictEqual(snap.civ.era, 'STONE_AGE');
  assert.strictEqual(validateCivilizationState(snap.civ).isValid, true);
  assert.strictEqual(snap.eraEvaluation.eligible, true);
  const directEval = evaluateEraAdvance({
    era: snap.civ.era,
    buildings: snap.civ.buildings,
    villagers: snap.civ.villagers,
    jobs: snap.civ.jobs,
    founderRole: snap.civ.founderRole,
    landExpansions: snap.civ.grid.chunks.length - INITIAL_CHUNK_COUNT,
    playerLevel: snap.economy.level,
    totalFocusMinutes: snap.lifetimeFocusMinutes,
    coins: snap.economy.focusCoins,
  });
  assert.strictEqual(directEval.eligible, true);
  assert.strictEqual((await storage.getCivilizationState()).era, 'STONE_AGE');
});

test('5E-2b Part B Speed, Skip Focus Wait, Complete Jobs & Give Up still grants 0 Coins/XP', async () => {
  const { devController, sessionCoordinator, storage, profileManager } = await createDevHarness();
  const profile = await profileManager.getActiveProfile();

  // Queue an expansion job first
  await storage.updateEconomy((e) => ({ ...e, focusCoins: 500, totalXP: 3600, level: 9 }));
  const badSpeed = await devController.handleMessage({
    action: 'DEV_SET_TIME_SPEED',
    payload: { speed: 99 },
  });
  assert.strictEqual(badSpeed?.success, false);

  const okSpeed = await devController.handleMessage({
    action: 'DEV_SET_TIME_SPEED',
    payload: { speed: 60 },
  });
  assert.strictEqual(okSpeed?.success, true);
  assert.strictEqual(devController.getTimeSpeed(), 60);

  // 1. Start COUNTDOWN 25m and skip via DEV_SKIP_FOCUS_WAIT -> real SessionCoordinator settlement
  await sessionCoordinator.startSession('COUNTDOWN', 25, profile.id);
  const ecoBeforeSkip = await storage.getEconomy();
  const skipCdRes = await devController.handleMessage({ action: 'DEV_SKIP_FOCUS_WAIT' });
  assert.strictEqual(skipCdRes?.success, true);
  const snapCd = skipCdRes?.data as DevSnapshotData;
  assert.strictEqual(snapCd.session?.status, 'COMPLETED');
  assert.ok(snapCd.economy.focusCoins > ecoBeforeSkip.focusCoins);
  assert.ok(snapCd.economy.totalXP > ecoBeforeSkip.totalXP);

  // 2. Start COUNTDOWN and Give Up -> STILL 0 reward
  await sessionCoordinator.resetSession();
  const ecoBeforeGiveUp = await storage.getEconomy();
  await sessionCoordinator.startSession('COUNTDOWN', 25, profile.id);
  await sessionCoordinator.giveUpCountdown();
  const ecoAfterGiveUp = await storage.getEconomy();
  assert.strictEqual(ecoAfterGiveUp.focusCoins, ecoBeforeGiveUp.focusCoins);
  assert.strictEqual(ecoAfterGiveUp.totalXP, ecoBeforeGiveUp.totalXP);

  // 3. Start POMODORO_COUNTDOWN -> Skip settles all intervals cleanly
  await sessionCoordinator.resetSession();
  await sessionCoordinator.startSession('POMODORO_COUNTDOWN', 25, profile.id, {
    focusDurationMinutes: 25,
    focusIntervalsPerCycle: 2,
    numberOfCycles: 1,
    shortBreakDurationMinutes: 5,
    longBreakDurationMinutes: 15,
    targetFocusSessions: 2,
  });
  const skipPomoRes = await devController.handleMessage({ action: 'DEV_SKIP_FOCUS_WAIT' });
  assert.strictEqual(skipPomoRes?.success, true);
  assert.strictEqual((skipPomoRes?.data as DevSnapshotData).session?.status, 'COMPLETED');

  // 4. Advance active COUNTDOWN via DEV_ADVANCE_ACTIVE_SESSION_MS
  await sessionCoordinator.resetSession();
  await sessionCoordinator.startSession('COUNTDOWN', 1, profile.id);
  const advRes = await devController.handleMessage({
    action: 'DEV_ADVANCE_ACTIVE_SESSION_MS',
    payload: { deltaMs: 65_000 },
  });
  assert.strictEqual(advRes?.success, true);
  assert.strictEqual((advRes?.data as DevSnapshotData).session?.status, 'COMPLETED');

  // 5. Complete all construction jobs via DEV_COMPLETE_ALL_JOBS (even with 0 crew if queued manually)
  await devController.handleMessage({ action: 'DEV_FILL_ALL_ROLES' });
  await sessionCoordinator.resetSession();
  await devController.handleMessage({ action: 'DEV_SEED_DEMO_DATA' });
  const doneJobsRes = await devController.handleMessage({ action: 'DEV_COMPLETE_ALL_JOBS' });
  assert.strictEqual(doneJobsRes?.success, true);
  const doneSnap = doneJobsRes?.data as DevSnapshotData;
  assert.strictEqual(doneSnap.civ.jobs?.length ?? 0, 0);
  assert.strictEqual(validateCivilizationState(doneSnap.civ).isValid, true);
});

test('5E-2b Part B Quests, Calendar Rollover, Export/Import JSON & Reset All Data', async () => {
  const { adapter, devController, questCoordinator } = await createDevHarness();

  // Complete all quests -> must keep claimed=false so manual Claim works
  const qRes = await devController.handleMessage({ action: 'DEV_COMPLETE_ALL_QUESTS' });
  assert.strictEqual(qRes?.success, true);
  const qSnap = qRes?.data as DevSnapshotData;
  const firstDailyId = Object.keys(qSnap.questState.daily)[0];
  assert.strictEqual(qSnap.questState.daily[firstDailyId].completed, true);
  assert.strictEqual(qSnap.questState.daily[firstDailyId].claimed, false);

  const claimRes = await questCoordinator.claimQuestReward({
    period: 'DAILY',
    questId: firstDailyId,
  });
  assert.ok(claimRes.claimedCoins > 0);

  // Rollover daily & fast forward 1 day
  const rollRes = await devController.handleMessage({
    action: 'DEV_ROLLOVER_QUESTS',
    payload: { period: 'DAILY' },
  });
  assert.strictEqual(rollRes?.success, true);
  const rolledIds = Object.keys((rollRes?.data as DevSnapshotData).questState.daily);
  assert.strictEqual(rolledIds.length, 3);

  const ffRes = await devController.handleMessage({
    action: 'DEV_FAST_FORWARD_DAY',
    payload: { days: 1 },
  });
  assert.strictEqual(ffRes?.success, true);

  // Seed -> Export -> Reset -> Import -> verifies roundtrip parity
  await devController.handleMessage({ action: 'DEV_SEED_DEMO_DATA' });
  const expRes = await devController.handleMessage({ action: 'DEV_EXPORT_STATE' });
  assert.strictEqual(expRes?.success, true);
  const bundle = expRes?.data as DevExportBundle;
  assert.strictEqual(bundle.schemaVersion, CURRENT_SCHEMA_VERSION);
  assert.strictEqual(bundle.economy.focusCoins, 1850);

  const resetRes = await devController.handleMessage({ action: 'DEV_RESET_ALL_DATA' });
  assert.strictEqual(resetRes?.success, true);
  assert.strictEqual((resetRes?.data as DevSnapshotData).economy.focusCoins, 0);
  assert.strictEqual((resetRes?.data as DevSnapshotData).economy.level, 1);

  const impRes = await devController.handleMessage({
    action: 'DEV_IMPORT_STATE',
    payload: { bundle: JSON.stringify(bundle) },
  });
  assert.strictEqual(impRes?.success, true);
  assert.strictEqual((impRes?.data as DevSnapshotData).economy.focusCoins, 1850);
  assert.strictEqual(await adapter.get<number>(STORAGE_KEYS.SCHEMA_VERSION), CURRENT_SCHEMA_VERSION);
});
