import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStorageAdapter } from '../../src/storage/memoryStorageAdapter.ts';
import { StorageManager } from '../../src/storage/storageManager.ts';
import { STORAGE_KEYS } from '../../src/storage/storageKeys.ts';
import { ProfileManager } from '../../src/core/profiles/profileManager.ts';
import {
  MockAlarmsAdapter,
  MockBadgeAdapter,
  MockDNRAdapter,
  MockNotificationsAdapter,
} from '../mocks/chromeMock.ts';
import { BlockingCoordinator } from '../../src/background/blockingCoordinator.ts';
import { SessionCoordinator } from '../../src/background/sessionCoordinator.ts';
import { CivilizationCoordinator } from '../../src/background/civilizationCoordinator.ts';
import { MessageHandler } from '../../src/background/messageHandler.ts';
import {
  ERA_ADVANCE_ENABLED,
} from '../../src/core/civilization/constants.ts';
import {
  applyEraAdvance,
  getNextEra,
  STONE_TO_BRONZE_ADVANCE_REQUIREMENTS,
} from '../../src/core/civilization/eraRules.ts';
import { createInitialCivilizationState } from '../../src/core/civilization/civilizationState.ts';
import { applyDevMeetEraRequirements } from '../../src/dev/devStateHelpers.ts';
import { AppError } from '../../src/types/errors.ts';
import { localizeErrorMessage } from '../../src/i18n/errorTranslator.ts';
import {
  advanceEraClient,
  getEraAdvanceStatusClient,
  seedMockCivilizationForTest,
  sendExtensionMessage,
  setMockEraAdvanceEnabledForTest,
} from '../../src/ui/services/extensionClient.ts';
import type { IStorageAdapter } from '../../src/storage/storageInterface.ts';
import type { PlayerEconomy } from '../../src/types/economy.ts';
import type { DailyStatRecord } from '../../src/types/storageSchema.ts';
import {
  AdvanceEraPayload,
  AdvanceEraResponseData,
  EraAdvanceStatusResponseData,
} from '../../src/types/messages.ts';

function buildEligibleFixture(coins = 500) {
  const baseCiv = {
    ...createInitialCivilizationState(),
    founderRole: 'crafter' as const,
  };
  const baseEconomy: PlayerEconomy = {
    focusCoins: 0,
    totalXP: 0,
    level: 1,
  };
  const baseDailyStats: Record<string, DailyStatRecord> = {};
  const seeded = applyDevMeetEraRequirements({
    civ: baseCiv,
    economy: baseEconomy,
    dailyStats: baseDailyStats,
    nowMs: 1_760_000_000_000,
  });
  return {
    civ: seeded.civ,
    economy: {
      ...seeded.economy,
      focusCoins: coins,
    },
    dailyStats: seeded.dailyStats,
  };
}

class SpyMemoryStorageAdapter extends MemoryStorageAdapter implements IStorageAdapter {
  public setMultipleCalls: Array<Record<string, unknown>> = [];
  public failNextSetMultiple = false;

  override async setMultiple(items: Record<string, unknown>): Promise<void> {
    this.setMultipleCalls.push(JSON.parse(JSON.stringify(items)) as Record<string, unknown>);
    if (this.failNextSetMultiple) {
      this.failNextSetMultiple = false;
      throw new Error('Simulated storage write failure');
    }
    await super.setMultiple(items);
  }
}

function createHarness(
  adapter: IStorageAdapter,
  options?: { allowEraAdvance?: boolean }
) {
  const storage = new StorageManager(adapter);
  const profileManager = new ProfileManager(storage);
  const alarms = new MockAlarmsAdapter();
  const notifications = new MockNotificationsAdapter();
  const badge = new MockBadgeAdapter();
  const blocking = new BlockingCoordinator(new MockDNRAdapter());
  const sessionCoordinator = new SessionCoordinator(
    storage,
    profileManager,
    alarms,
    notifications,
    badge,
    blocking
  );
  const civCoordinator = new CivilizationCoordinator(storage, options);
  const handler = new MessageHandler(
    sessionCoordinator,
    profileManager,
    storage,
    civCoordinator
  );
  return { storage, civCoordinator, handler };
}

test('5C-2a kill switch: ERA_ADVANCE_ENABLED constant defaults to false', () => {
  assert.equal(ERA_ADVANCE_ENABLED, false);
});

test('5C-2a pure core: getNextEra & applyEraAdvance transition STONE_AGE -> BRONZE_AGE deterministically without touching other fields', () => {
  assert.equal(getNextEra('STONE_AGE'), 'BRONZE_AGE');
  assert.equal(getNextEra('INTERPLANETARY'), null);

  const fixture = buildEligibleFixture(600);
  const beforeSnapshot = JSON.stringify(fixture.civ);

  const advanced = applyEraAdvance(fixture.civ, 'STONE_AGE', 'BRONZE_AGE');

  // Input untouched
  assert.equal(JSON.stringify(fixture.civ), beforeSnapshot);
  assert.equal(fixture.civ.era, 'STONE_AGE');

  // Only `era` changed
  assert.equal(advanced.era, 'BRONZE_AGE');
  assert.deepStrictEqual(advanced.buildings, fixture.civ.buildings);
  assert.deepStrictEqual(advanced.grid, fixture.civ.grid);
  assert.deepStrictEqual(advanced.villagers, fixture.civ.villagers);
  assert.deepStrictEqual(advanced.jobs, fixture.civ.jobs);
  assert.equal(advanced.founderRole, fixture.civ.founderRole);
  assert.equal(advanced.schemaVersion, fixture.civ.schemaVersion);
  assert.equal(advanced.lastUpdated, fixture.civ.lastUpdated);

  // Validation errors
  assert.throws(
    () => applyEraAdvance(fixture.civ, 'BRONZE_AGE', 'IRON_AGE'),
    (err: unknown) => err instanceof AppError && err.code === 'ERA_FROM_MISMATCH'
  );
  assert.throws(
    () => applyEraAdvance(fixture.civ, 'STONE_AGE', 'IRON_AGE'),
    (err: unknown) => err instanceof AppError && err.code === 'ERA_TARGET_INVALID'
  );
  assert.throws(
    () => applyEraAdvance(advanced, 'STONE_AGE', 'BRONZE_AGE'),
    (err: unknown) => err instanceof AppError && err.code === 'ERA_ALREADY_ADVANCED'
  );
});

test('5C-2a coordinator: default switch OFF blocks ADVANCE_ERA with ERA_ADVANCE_DISABLED and keeps state untouched', async () => {
  const adapter = new SpyMemoryStorageAdapter();
  const { storage, handler } = createHarness(adapter);
  const fixture = buildEligibleFixture(750);

  await adapter.setMultiple({
    [STORAGE_KEYS.CIVILIZATION]: fixture.civ,
    [STORAGE_KEYS.ECONOMY]: fixture.economy,
    [STORAGE_KEYS.DAILY_STATS]: fixture.dailyStats,
  });

  const statusRes = await handler.handleMessage({ action: 'GET_ERA_ADVANCE_STATUS' });
  assert.equal(statusRes.success, true);
  const statusData = statusRes.data as EraAdvanceStatusResponseData;
  assert.equal(statusData.enabled, false);
  assert.equal(statusData.currentEra, 'STONE_AGE');
  assert.equal(statusData.nextEra, 'BRONZE_AGE');
  assert.equal(statusData.eligible, true);
  assert.equal(statusData.feeCoins, STONE_TO_BRONZE_ADVANCE_REQUIREMENTS.feeCoins);

  const advRes = await handler.handleMessage({
    action: 'ADVANCE_ERA',
    payload: { fromEra: 'STONE_AGE', targetEra: 'BRONZE_AGE' },
  });
  assert.equal(advRes.success, false);
  assert.equal(advRes.errorCode, 'ERA_ADVANCE_DISABLED');

  const persistedCiv = await storage.getCivilizationState();
  const persistedEconomy = await storage.getEconomy();
  assert.equal(persistedCiv?.era, 'STONE_AGE');
  assert.equal(persistedEconomy.focusCoins, 750);
});

test('5C-2a coordinator: validates unmet requirements, coins-only shortfall, IEEE-754 exact deduction, strict 2-key write, rollback, and concurrency', async () => {
  const adapter = new SpyMemoryStorageAdapter();
  const { storage, civCoordinator, handler } = createHarness(adapter, {
    allowEraAdvance: true,
  });

  // 1. Unmet multi-requirements -> ERA_REQUIREMENTS_NOT_MET
  const initialCiv = createInitialCivilizationState();
  await adapter.setMultiple({
    [STORAGE_KEYS.CIVILIZATION]: initialCiv,
    [STORAGE_KEYS.ECONOMY]: { focusCoins: 0, totalXP: 0, level: 1 },
    [STORAGE_KEYS.DAILY_STATS]: {},
  });
  const missingRes = await handler.handleMessage({
    action: 'ADVANCE_ERA',
    payload: { fromEra: 'STONE_AGE', targetEra: 'BRONZE_AGE' },
  });
  assert.equal(missingRes.success, false);
  assert.equal(missingRes.errorCode, 'ERA_REQUIREMENTS_NOT_MET');
  assert.ok(Number(missingRes.errorParams?.missingCount) >= 5);

  // 2. Coins-only shortfall -> CIV_INSUFFICIENT_BUILDING_COINS with eraName
  const shortCoinsFixture = buildEligibleFixture(499.99);
  await adapter.setMultiple({
    [STORAGE_KEYS.CIVILIZATION]: shortCoinsFixture.civ,
    [STORAGE_KEYS.ECONOMY]: shortCoinsFixture.economy,
    [STORAGE_KEYS.DAILY_STATS]: shortCoinsFixture.dailyStats,
  });
  const coinShortRes = await handler.handleMessage({
    action: 'ADVANCE_ERA',
    payload: { fromEra: 'STONE_AGE', targetEra: 'BRONZE_AGE' },
  });
  assert.equal(coinShortRes.success, false);
  assert.equal(coinShortRes.errorCode, 'CIV_INSUFFICIENT_BUILDING_COINS');
  assert.equal(coinShortRes.errorParams?.eraName, 'BRONZE_AGE');
  const viShort = localizeErrorMessage(
    'vi',
    coinShortRes.error,
    coinShortRes.errorCode,
    coinShortRes.errorParams
  );
  const enShort = localizeErrorMessage(
    'en',
    coinShortRes.error,
    coinShortRes.errorCode,
    coinShortRes.errorParams
  );
  assert.ok(viShort.includes('Thời đại Đồ Đồng'), `Expected Bronze Age in VI: ${viShort}`);
  assert.ok(enShort.includes('Bronze Age'), `Expected Bronze Age in EN: ${enShort}`);

  // 3. Rollback on storage failure preserves STONE_AGE and exact balance
  const exactFixture = buildEligibleFixture(542.375);
  await adapter.setMultiple({
    [STORAGE_KEYS.CIVILIZATION]: exactFixture.civ,
    [STORAGE_KEYS.ECONOMY]: exactFixture.economy,
    [STORAGE_KEYS.DAILY_STATS]: exactFixture.dailyStats,
  });
  adapter.failNextSetMultiple = true;
  const failedWriteRes = await handler.handleMessage({
    action: 'ADVANCE_ERA',
    payload: { fromEra: 'STONE_AGE', targetEra: 'BRONZE_AGE' },
  });
  assert.equal(failedWriteRes.success, false);
  assert.equal((await storage.getCivilizationState())?.era, 'STONE_AGE');
  assert.equal((await storage.getEconomy()).focusCoins, 542.375);

  // 4. Concurrent double-advance -> exactly 1 succeeds, IEEE-754 exact 542.375 -> 42.375, strict 2-key write
  adapter.setMultipleCalls = [];
  const [resA, resB] = await Promise.all([
    civCoordinator
      .advanceEra({ fromEra: 'STONE_AGE', targetEra: 'BRONZE_AGE' })
      .then((data) => ({ ok: true as const, data }))
      .catch((err: unknown) => ({ ok: false as const, err })),
    civCoordinator
      .advanceEra({ fromEra: 'STONE_AGE', targetEra: 'BRONZE_AGE' })
      .then((data) => ({ ok: true as const, data }))
      .catch((err: unknown) => ({ ok: false as const, err })),
  ]);
  const successes = [resA, resB].filter((r) => r.ok);
  const failures = [resA, resB].filter((r) => !r.ok);
  assert.equal(successes.length, 1);
  assert.equal(failures.length, 1);
  if (successes[0].ok) {
    assert.equal(successes[0].data.previousEra, 'STONE_AGE');
    assert.equal(successes[0].data.newEra, 'BRONZE_AGE');
    assert.equal(successes[0].data.cost, 500);
    assert.equal(successes[0].data.economy.focusCoins, 42.375);
  }
  if (!failures[0].ok) {
    assert.ok(failures[0].err instanceof AppError);
    assert.equal(failures[0].err.code, 'ERA_ALREADY_ADVANCED');
  }

  // Strictly fq_civilization and fq_economy written (never dailyStats, quests, awards)
  assert.equal(adapter.setMultipleCalls.length, 1);
  assert.deepStrictEqual(
    Object.keys(adapter.setMultipleCalls[0]).sort(),
    [STORAGE_KEYS.CIVILIZATION, STORAGE_KEYS.ECONOMY].sort()
  );
});

test('5C-2a MessageHandler & extensionClient simulator parity', async () => {
  const adapter = new MemoryStorageAdapter();
  const { handler } = createHarness(adapter, { allowEraAdvance: true });

  // Invalid payload rejections in MessageHandler
  const badPayload = await handler.handleMessage({
    action: 'ADVANCE_ERA',
    payload: { fromEra: '', targetEra: 'BRONZE_AGE' },
  });
  assert.equal(badPayload.success, false);
  assert.equal(badPayload.errorCode, 'ERA_FROM_MISMATCH');

  const missingPayload = await handler.handleMessage({ action: 'ADVANCE_ERA' });
  assert.equal(missingPayload.success, false);
  assert.equal(missingPayload.errorCode, 'ERA_TARGET_INVALID');

  // Simulator parity: default OFF -> ERA_ADVANCE_DISABLED, then enable for test -> BRONZE_AGE
  const fixture = buildEligibleFixture(615.25);
  const previousCiv = fixture.civ;
  setMockEraAdvanceEnabledForTest(false);
  try {
    seedMockCivilizationForTest(fixture.civ, {
      ...fixture.economy,
      focusCoins: 615.25,
    });
    // Ensure simulated lifetime focus >= 500 by running a status check after seeding
    const offStatus = await getEraAdvanceStatusClient();
    assert.equal(offStatus.success, true);
    assert.equal(offStatus.data?.enabled, false);
    assert.equal(offStatus.data?.currentEra, 'STONE_AGE');
    assert.equal(offStatus.data?.nextEra, 'BRONZE_AGE');

    const offAdvance = await advanceEraClient({
      fromEra: 'STONE_AGE',
      targetEra: 'BRONZE_AGE',
    });
    assert.equal(offAdvance.success, false);
    assert.equal(offAdvance.errorCode, 'ERA_ADVANCE_DISABLED');

    setMockEraAdvanceEnabledForTest(true);
    // Re-seed via Message-level check or seed enough focus minutes if needed:
    const simStatus = await getEraAdvanceStatusClient();
    assert.equal(simStatus.success, true);
    assert.equal(simStatus.data?.enabled, true);
    // Note: simulator lifetimeFocusMinutes starts at 0 unless sessions ran; check checks structure
    assert.ok(Array.isArray(simStatus.data?.checks));
    assert.equal(simStatus.data?.checks.length, 13);

    // Non-eligible simulator advance rejects cleanly without advancing
    if (!simStatus.data?.eligible) {
      const notEligibleRes = await advanceEraClient({
        fromEra: 'STONE_AGE',
        targetEra: 'BRONZE_AGE',
      });
      assert.equal(notEligibleRes.success, false);
      assert.equal(notEligibleRes.errorCode, 'ERA_REQUIREMENTS_NOT_MET');
    }

    // Also ensure sendExtensionMessage invalid payload matches MessageHandler
    const badSim = await sendExtensionMessage<AdvanceEraResponseData>({
      action: 'ADVANCE_ERA',
      payload: { fromEra: 'STONE_AGE', targetEra: '' } as unknown as AdvanceEraPayload,
    });
    assert.equal(badSim.success, false);
    assert.equal(badSim.errorCode, 'ERA_TARGET_INVALID');

    // Happy-path simulator advance after earning >= 500 focus minutes
    const realDateNow = Date.now;
    let fakeNow = 1_760_000_100_000;
    Date.now = () => fakeNow;
    try {
      await sendExtensionMessage({
        action: 'START_SESSION',
        payload: {
          mode: 'COUNTDOWN',
          targetMinutes: 500,
          profileId: 'profile-study-research',
        },
      });
      fakeNow += 501 * 60 * 1000;
      await sendExtensionMessage({ action: 'GET_SESSION_STATE' });
      await sendExtensionMessage({ action: 'RESET_SESSION' });

      seedMockCivilizationForTest(fixture.civ, {
        ...fixture.economy,
        focusCoins: 615.25,
      });

      const readyStatus = await getEraAdvanceStatusClient();
      assert.equal(readyStatus.success, true);
      assert.equal(readyStatus.data?.eligible, true);

      const simAdvance = await advanceEraClient({
        fromEra: 'STONE_AGE',
        targetEra: 'BRONZE_AGE',
      });
      assert.equal(simAdvance.success, true);
      assert.equal(simAdvance.data?.previousEra, 'STONE_AGE');
      assert.equal(simAdvance.data?.newEra, 'BRONZE_AGE');
      assert.equal(simAdvance.data?.cost, 500);
      assert.equal(simAdvance.data?.economy.focusCoins, 115.25);

      const postStatus = await getEraAdvanceStatusClient();
      assert.equal(postStatus.data?.currentEra, 'BRONZE_AGE');
      assert.equal(postStatus.data?.nextEra, null);
    } finally {
      Date.now = realDateNow;
    }
  } finally {
    setMockEraAdvanceEnabledForTest(false);
    seedMockCivilizationForTest(previousCiv, { focusCoins: 0, totalXP: 0, level: 1 });
  }
});
