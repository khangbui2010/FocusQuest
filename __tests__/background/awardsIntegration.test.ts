import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStorageAdapter } from '../../src/storage/memoryStorageAdapter.ts';
import { StorageManager } from '../../src/storage/storageManager.ts';
import { STORAGE_KEYS } from '../../src/storage/storageKeys.ts';
import { MigrationRunner } from '../../src/storage/migrations/migrationRunner.ts';
import { ProfileManager } from '../../src/core/profiles/profileManager.ts';
import { BlockingCoordinator } from '../../src/background/blockingCoordinator.ts';
import { SessionCoordinator } from '../../src/background/sessionCoordinator.ts';
import { CivilizationCoordinator } from '../../src/background/civilizationCoordinator.ts';
import { QuestCoordinator } from '../../src/background/questCoordinator.ts';
import { AwardsCoordinator } from '../../src/background/awardsCoordinator.ts';
import { MessageHandler } from '../../src/background/messageHandler.ts';
import {
  MockAlarmsAdapter,
  MockBadgeAdapter,
  MockDNRAdapter,
  MockNotificationsAdapter,
  MockTabsAdapter,
} from '../mocks/chromeMock.ts';
import {
  AwardState,
  GetAwardsStateResponseData,
  MarkAwardsSeenResponseData,
} from '../../src/types/awards.ts';
import { getActiveQuestDefinitions } from '../../src/core/quests/questEngine.ts';
import { createDevBackgroundController } from '../../src/dev/devBackgroundService.ts';

async function withMockedNow<T>(nowProvider: () => number, fn: () => Promise<T>): Promise<T> {
  const originalNow = Date.now;
  Date.now = nowProvider;
  try {
    return await fn();
  } finally {
    Date.now = originalNow;
  }
}

async function createAwardsHarness() {
  const adapter = new MemoryStorageAdapter();
  await new MigrationRunner(adapter).runMigrations();
  const storage = new StorageManager(adapter);
  const profileManager = new ProfileManager(storage);
  const alarms = new MockAlarmsAdapter();
  const notifications = new MockNotificationsAdapter();
  const badge = new MockBadgeAdapter();
  const blocking = new BlockingCoordinator(new MockDNRAdapter(), new MockTabsAdapter([]));
  const sessionCoordinator = new SessionCoordinator(
    storage,
    profileManager,
    alarms,
    notifications,
    badge,
    blocking
  );
  const civCoordinator = new CivilizationCoordinator(storage);
  const questCoordinator = new QuestCoordinator(storage);
  const awardsCoordinator = new AwardsCoordinator(storage);
  const handler = new MessageHandler(
    sessionCoordinator,
    profileManager,
    storage,
    civCoordinator,
    undefined,
    questCoordinator,
    awardsCoordinator
  );
  const devController = createDevBackgroundController({
    storageManager: storage,
    sessionCoordinator,
    civilizationCoordinator: civCoordinator,
    questCoordinator,
  });

  return {
    adapter,
    storage,
    sessionCoordinator,
    civCoordinator,
    questCoordinator,
    awardsCoordinator,
    handler,
    devController,
  };
}

test('Awards Integration: completed focus sessions unlock awards (unseen), while abandoned/short <5m sessions do NOT', async () => {
  let fakeNow = 1770000000000;
  await withMockedNow(() => fakeNow, async () => {
    const { handler, sessionCoordinator, storage } = await createAwardsHarness();
    const profiles = await storage.getProfiles();
    const profileId = profiles[0].id;

    // 1. Abandoned countdown -> must NOT unlock focus_sessions or long_haul
    await sessionCoordinator.startSession('COUNTDOWN', 30, profileId);
    fakeNow += 10 * 60 * 1000;
    await sessionCoordinator.giveUpCountdown();
    let awardsRes = await handler.handleMessage({ action: 'GET_AWARDS_STATE' });
    assert.equal(awardsRes.success, true);
    let data = awardsRes.data as GetAwardsStateResponseData;
    assert.equal(data.awardState.unlocked.focus_sessions?.[1], undefined);
    assert.equal(data.awardState.counters.longestSessionMinutes, 0);

    // 2. Short < 5m Stopwatch -> must NOT unlock focus_sessions or long_haul
    await sessionCoordinator.startSession('STOPWATCH', 0, profileId);
    fakeNow += 3 * 60 * 1000;
    await sessionCoordinator.finishStopwatch();
    awardsRes = await handler.handleMessage({ action: 'GET_AWARDS_STATE' });
    data = awardsRes.data as GetAwardsStateResponseData;
    assert.equal(data.awardState.unlocked.focus_sessions?.[1], undefined);
    assert.equal(data.awardState.counters.longestSessionMinutes, 0);

    // 3. Valid 60-minute Countdown completion -> unlocks focus_sessions I, focus_hours I, long_haul I..III (unseen)
    await sessionCoordinator.startSession('COUNTDOWN', 60, profileId);
    fakeNow += 60 * 60 * 1000;
    await sessionCoordinator.completeCountdown();

    const rawAwards = await storage.getAwards();
    assert.ok(rawAwards.unlocked.focus_sessions?.[1]);
    assert.equal(rawAwards.unlocked.focus_sessions[1].seen, false);
    assert.ok(rawAwards.unlocked.long_haul?.[3]);
    assert.equal(rawAwards.counters.longestSessionMinutes, 60);

    awardsRes = await handler.handleMessage({ action: 'GET_AWARDS_STATE' });
    data = awardsRes.data as GetAwardsStateResponseData;
    assert.ok(data.unseenCount >= 5);

    // 4. MARK_AWARDS_SEEN clears unseen count without changing unlockedAt or Coins/XP
    const econBefore = await storage.getEconomy();
    const markRes = await handler.handleMessage({ action: 'MARK_AWARDS_SEEN' });
    assert.equal(markRes.success, true);
    const markData = markRes.data as MarkAwardsSeenResponseData;
    assert.equal(markData.unseenCount, 0);
    assert.deepStrictEqual(await storage.getEconomy(), econBefore);
  });
});

test('Awards Integration: Campfire instant place + place job completion + quest claim + perfect_day + founder + recruit update Awards', async () => {
  let fakeNow = 1770000000000;
  await withMockedNow(() => fakeNow, async () => {
    const { handler, storage, sessionCoordinator, civCoordinator } = await createAwardsHarness();
    const profiles = await storage.getProfiles();
    const profileId = profiles[0].id;

    // Seed enough Coins for Campfire + Rock Shelter and complete 1st 60m session for 50+ lifetime mins
    await storage.updateEconomy(() => ({ focusCoins: 2000, totalXP: 500, level: 3 }));
    await sessionCoordinator.startSession('COUNTDOWN', 60, profileId);
    fakeNow += 60 * 60 * 1000;
    await sessionCoordinator.completeCountdown();

    // Instant Campfire build -> increments builder (totalBuildingsBuilt = 1)
    await civCoordinator.placeBuilding({
      buildingDefinitionId: 'stone_age_campfire',
      position: { x: 0, y: 0 },
    });
    let awards = await storage.getAwards();
    assert.equal(awards.counters.totalBuildingsBuilt, 1);
    assert.ok(awards.unlocked.builder?.[1]);

    // Select founder (elder) -> tribe metric = 1 -> unlocks tribe I
    await civCoordinator.selectFounder({ role: 'elder' });
    awards = await storage.getAwards();
    assert.ok(awards.unlocked.tribe?.[1]);

    // Place Rock Shelter (async 3600s place job), then finish via 60m focus session
    await civCoordinator.placeBuilding({
      buildingDefinitionId: 'stone_age_study_cave',
      position: { x: 2, y: 0 },
    });
    // While still under construction, totalBuildingsBuilt must remain 1
    awards = await storage.getAwards();
    assert.equal(awards.counters.totalBuildingsBuilt, 1);

    await sessionCoordinator.startSession('COUNTDOWN', 60, profileId);
    fakeNow += 60 * 60 * 1000;
    await sessionCoordinator.completeCountdown();

    awards = await storage.getAwards();
    assert.equal(awards.counters.totalBuildingsBuilt, 2);

    // Cancel an async place job before completion -> totalBuildingsBuilt must NOT increment
    const pendingForagingRes = await civCoordinator.placeBuilding({
      buildingDefinitionId: 'stone_age_foraging_post',
      position: { x: 0, y: 2 },
    });
    assert.ok(pendingForagingRes.job);
    await civCoordinator.cancelConstructionJob({ jobId: pendingForagingRes.job.id });
    awards = await storage.getAwards();
    assert.equal(awards.counters.totalBuildingsBuilt, 2);

    // Upgrade Rock Shelter Lv.1 -> Lv.2 via focus session -> must NOT increment totalBuildingsBuilt
    const civBeforeUpgrade = await storage.getCivilizationState();
    const rockShelter = civBeforeUpgrade.buildings.find(
      (b) => b.definitionId === 'stone_age_study_cave'
    );
    assert.ok(rockShelter);
    await civCoordinator.upgradeBuilding({
      buildingId: rockShelter.id,
      expectedLevel: rockShelter.level,
    });
    await sessionCoordinator.startSession('COUNTDOWN', 60, profileId);
    fakeNow += 60 * 60 * 1000;
    await sessionCoordinator.completeCountdown();
    awards = await storage.getAwards();
    assert.equal(awards.counters.totalBuildingsBuilt, 2);

    // Demolish Campfire -> totalBuildingsBuilt and builder Lv.1 must NEVER decrement/re-lock
    const civBeforeRemove = await storage.getCivilizationState();
    const campfire = civBeforeRemove.buildings.find(
      (b) => b.definitionId === 'stone_age_campfire'
    );
    assert.ok(campfire);
    await civCoordinator.removeBuilding({ buildingInstanceId: campfire.id });
    awards = await storage.getAwards();
    assert.equal(awards.counters.totalBuildingsBuilt, 2);
    assert.ok(awards.unlocked.builder?.[1]);

    // Claim all 3 active daily quests -> quest_keeper + perfect_day
    const questState = await storage.getQuests(fakeNow);
    const activeDaily = getActiveQuestDefinitions('DAILY', questState);
    const updatedDaily = { ...questState.daily };
    for (const def of activeDaily) {
      updatedDaily[def.id] = {
        questId: def.id,
        period: 'DAILY',
        progress: def.target,
        target: def.target,
        completed: true,
        claimed: false,
        claimedAt: null,
      };
    }
    await storage.setQuests({ ...questState, daily: updatedDaily });

    for (const def of activeDaily) {
      const claimRes = await handler.handleMessage({
        action: 'CLAIM_QUEST_REWARD',
        payload: { period: 'DAILY', questId: def.id },
      });
      assert.equal(claimRes.success, true);
    }

    awards = await storage.getAwards();
    assert.equal(awards.counters.totalQuestsClaimed, 3);
    assert.equal(awards.counters.perfectDaysCount, 1);
    assert.ok(awards.unlocked.quest_keeper?.[1]);
    assert.ok(awards.unlocked.perfect_day?.[1]);
  });
});

test('Awards Integration: validates MARK_AWARDS_SEEN payload and rolls back Awards on storage failure', async () => {
  const { handler, adapter, storage } = await createAwardsHarness();

  const badRes = await handler.handleMessage({
    action: 'MARK_AWARDS_SEEN',
    payload: { awardIds: [''] },
  });
  assert.equal(badRes.success, false);
  assert.equal(badRes.errorCode, 'INVALID_AWARDS_PAYLOAD');

  // Rollback check on executeCivilizationTransaction when adapter.setMultiple fails
  const beforeAwards = await storage.getAwards();
  await storage.updateEconomy(() => ({ focusCoins: 500, totalXP: 100, level: 2 }));
  const origSetMultiple = adapter.setMultiple.bind(adapter);
  adapter.setMultiple = async (items) => {
    if (STORAGE_KEYS.AWARDS in items && STORAGE_KEYS.CIVILIZATION in items) {
      throw new Error('Injected write failure');
    }
    return origSetMultiple(items);
  };

  await assert.rejects(
    () =>
      storage.executeCivilizationTransaction((ctx) => ({
        result: null,
        nextEconomy: { focusCoins: 450, totalXP: 100, level: 2 },
        nextCivilization: {
          ...ctx.civilization,
          lastUpdated: Date.now(),
        },
        awardCountersDelta: { buildingsBuilt: 1 },
      })),
    /Injected write failure/
  );
  adapter.setMultiple = origSetMultiple;
  assert.deepStrictEqual(await storage.getAwards(), beforeAwards);
});

test('Dev God Mode: DEV_UNLOCK_ALL_AWARDS and DEV_RESET_AWARDS mutate fq_awards without touching Coins/XP', async () => {
  const { devController, storage } = await createAwardsHarness();
  const econBefore = await storage.getEconomy();

  const unlockRes = await devController.handleMessage({ action: 'DEV_UNLOCK_ALL_AWARDS' });
  assert.ok(unlockRes && unlockRes.success);
  const unlockedAwards = await storage.getAwards();
  assert.ok(unlockedAwards.unlocked.focus_hours?.[5]);
  assert.ok(unlockedAwards.unlocked.era_ready?.[1]);
  assert.deepStrictEqual(await storage.getEconomy(), econBefore);

  const resetRes = await devController.handleMessage({ action: 'DEV_RESET_AWARDS' });
  assert.ok(resetRes && resetRes.success);
  const resetAwards: AwardState = await storage.getAwards();
  assert.deepStrictEqual(resetAwards.unlocked, {});
  assert.deepStrictEqual(await storage.getEconomy(), econBefore);
});
