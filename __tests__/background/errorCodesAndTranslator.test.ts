import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AppError, ErrorCode, ErrorParams } from '../../src/types/errors.ts';
import {
  ALL_KNOWN_ERROR_CODES,
  localizeErrorMessage,
  toUiErrorPayload,
} from '../../src/i18n/errorTranslator.ts';
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
import { CivilizationCoordinator } from '../../src/background/civilizationCoordinator.ts';
import { MessageHandler } from '../../src/background/messageHandler.ts';

const SAFE_GENERIC_EN = 'Something went wrong. Please try again.';
const SAFE_GENERIC_VI = 'Đã xảy ra lỗi. Vui lòng thử lại.';

const SAMPLE_PARAMS_BY_CODE: Partial<Record<ErrorCode, ErrorParams>> = {
  UNKNOWN_ACTION: { action: 'BOGUS_ACTION' },
  INVALID_SESSION_MODE: { mode: 'TURBO' },
  SESSION_ALREADY_ACTIVE: { status: 'RUNNING' },
  SESSION_PROFILE_NOT_FOUND: { profileId: 'prof-404' },
  INVALID_POMODORO_ALARM: { alarmName: 'forged_alarm' },
  SESSION_CANNOT_RESET_ACTIVE: { status: 'PAUSED' },
  PROFILE_DUPLICATE_NAME: { name: 'Study' },
  PROFILE_NOT_FOUND: { profileId: 'p-missing' },
  PROFILE_SET_ACTIVE_NOT_FOUND: { profileId: 'p-active-missing' },
  PROFILE_REPLACEMENT_NOT_FOUND: { profileId: 'p-rep-missing' },
  DOMAIN_PATTERN_TOO_BROAD: { pattern: '*.com' },
  DOMAIN_INVALID_FORMAT: { pattern: 'not a domain!' },
  PROFILE_CREATE_INVALID_DOMAIN: { reasonCode: 'DOMAIN_INVALID_FORMAT', pattern: 'bad domain' },
  PROFILE_ADD_INVALID_DOMAIN: { reasonCode: 'DOMAIN_PATTERN_TOO_BROAD', pattern: '*' },
  PROFILE_UPDATE_INVALID_ALLOWLIST: { reasonCode: 'DOMAIN_EMPTY' },
  CIV_UNKNOWN_BUILDING_DEF: { buildingDefinitionId: 'mega_reactor' },
  CIV_REQUIRES_LEVEL: { buildingName: 'Campfire', requiredLevel: 3, currentLevel: 1 },
  CIV_REQUIRES_FOCUS_MINUTES: { buildingName: 'Library', requiredMinutes: 120, currentMinutes: 45 },
  CIV_REQUIRES_ERA: { buildingName: 'Town Hall', requiredEra: 'BRONZE_AGE', currentEra: 'STONE_AGE' },
  CIV_INSUFFICIENT_BUILDING_COINS: { buildingName: 'Campfire', cost: 100, balance: 20 },
  CIV_CANNOT_PLACE_BUILDING: { reason: 'OCCUPIED' },
  CIV_GRID_PLACEMENT_FAILED: { reason: 'OUT_OF_BOUNDS' },
  CIV_ECONOMY_BUILDING_LIMIT_REACHED: { buildingName: 'Foraging Post', limit: 4, currentCount: 4 },
  CIV_BUILDING_NOT_FOUND: { buildingInstanceId: 'bld_123' },
  CIV_BUILDING_REMOVAL_FAILED: { reason: 'LOCKED' },
  BUILDING_NOT_FOUND: { buildingId: 'bld_404' },
  BUILDING_MAX_LEVEL: { buildingName: 'Foraging Post', maxLevel: 5 },
  UPGRADE_PLAYER_LEVEL_REQUIRED: { buildingName: 'Foraging Post', requiredLevel: 3, currentLevel: 2 },
  BUILDING_LEVEL_MISMATCH: { buildingId: 'bld-1', expectedLevel: 1, currentLevel: 2 },
  CIV_UPGRADE_NOT_SUPPORTED: { buildingName: 'Campfire' },
  CIV_UPGRADE_ERA_LOCKED: { buildingName: 'Foraging Post', requiredEra: 'BRONZE_AGE' },
  CIV_INVALID_EXPAND_ORIGIN_GRID: { chunkWidth: 4, chunkHeight: 4 },
  CIV_EXPAND_REQUIRES_LEVEL: { purchaseIndex: 1, requiredLevel: 2, currentLevel: 1 },
  CIV_INSUFFICIENT_EXPAND_COINS: { purchaseIndex: 1, cost: 200, balance: 50 },
  CIV_LAND_EXPANSION_FAILED: { reason: 'NOT_ADJACENT' },
  CIV_VILLAGER_CAPACITY_REACHED: { capacity: 2 },
  CIV_VILLAGER_INSUFFICIENT_COINS: { cost: 40, balance: 10 },
  CIV_CAVE_HAS_VILLAGERS: { count: 2 },
  CIV_VILLAGE_CAVE_LIMIT_REACHED: { max: 1 },
  UNKNOWN_QUEST: { questId: 'q_daily_99' },
  QUEST_PERIOD_MISMATCH: { questId: 'q1', period: 'DAILY' },
  QUEST_ALREADY_CLAIMED: { questId: 'q1' },
  QUEST_EXPIRED: { questId: 'q1' },
  QUEST_NOT_COMPLETED: { questId: 'q1', progress: 1, target: 3 },
  MUSIC_TRACK_NOT_FOUND: { trackId: 'lofi_01' },
};

test('ErrorCodes: every defined ErrorCode produces explicit EN and VI localization without leaking to generic fallback', () => {
  for (const code of ALL_KNOWN_ERROR_CODES) {
    const params = SAMPLE_PARAMS_BY_CODE[code];
    const en = localizeErrorMessage('en', undefined, code, params);
    const vi = localizeErrorMessage('vi', undefined, code, params);

    assert.ok(en.length > 0, `EN translation empty for ${code}`);
    assert.ok(vi.length > 0, `VI translation empty for ${code}`);
    assert.notEqual(vi, en, `VI translation must differ from EN for ${code}`);

    if (code !== 'ACTION_FAILED') {
      assert.notEqual(en, SAFE_GENERIC_EN, `Code ${code} fell back to generic in EN`);
      assert.notEqual(vi, SAFE_GENERIC_VI, `Code ${code} fell back to generic in VI`);
    } else {
      assert.equal(en, SAFE_GENERIC_EN);
      assert.equal(vi, SAFE_GENERIC_VI);
    }
  }
});

test('ErrorTranslator: interpolates params accurately and supports buildingId/buildingDefinitionId', () => {
  const enCivDef = localizeErrorMessage('en', undefined, 'CIV_UNKNOWN_BUILDING_DEF', {
    buildingDefinitionId: 'ancient_forge',
  });
  const viCivDef = localizeErrorMessage('vi', undefined, 'CIV_UNKNOWN_BUILDING_DEF', {
    buildingDefinitionId: 'ancient_forge',
  });
  assert.ok(enCivDef.includes('ancient_forge'));
  assert.ok(viCivDef.includes('ancient_forge'));

  const enCivId = localizeErrorMessage('en', undefined, 'CIV_UNKNOWN_BUILDING_DEF', {
    buildingId: 'ancient_forge',
  });
  const viCivId = localizeErrorMessage('vi', undefined, 'CIV_UNKNOWN_BUILDING_DEF', {
    buildingId: 'ancient_forge',
  });
  assert.ok(enCivId.includes('ancient_forge'));
  assert.ok(viCivId.includes('ancient_forge'));

  const viQuest = localizeErrorMessage('vi', undefined, 'QUEST_NOT_COMPLETED', {
    questId: 'steady_rhythm',
    progress: 30,
    target: 60,
  });
  assert.ok(viQuest.includes('30/60'));
  assert.ok(viQuest.includes('steady_rhythm'));
});

test('ErrorTranslator: masks unknown internal or raw technical errors behind safe generic message', () => {
  const internalPayloads = [
    toUiErrorPayload(
      new Error('TypeError: Cannot read properties of undefined (reading foo) at bar.ts:91')
    ),
    toUiErrorPayload('ReferenceError: missing symbol at storage/db.ts:12:4'),
    {
      code: 'ACTION_FAILED',
      message: 'TypeError: Sensitive stack trace\n    at foo (src/background/index.ts:12:3)',
    },
    toUiErrorPayload('SyntaxError: Unexpected token < in JSON at position 0'),
  ];

  for (const payload of internalPayloads) {
    assert.equal(localizeErrorMessage('en', payload.message, payload.code, payload.params), SAFE_GENERIC_EN);
    assert.equal(localizeErrorMessage('vi', payload.message, payload.code, payload.params), SAFE_GENERIC_VI);
  }

  // Known AppError translates properly via toUiErrorPayload + localizeErrorMessage
  const coded = new AppError(
    'PROFILE_DELETE_LAST',
    'Cannot delete the only remaining profile in the system.'
  );
  const uiPayload = toUiErrorPayload(coded);
  assert.equal(
    localizeErrorMessage('en', uiPayload.message, uiPayload.code, uiPayload.params),
    'Cannot delete the only remaining profile in the system.'
  );
  assert.equal(
    localizeErrorMessage('vi', uiPayload.message, uiPayload.code, uiPayload.params),
    'Không thể xóa hồ sơ duy nhất còn lại trong hệ thống.'
  );
});

test('MessageHandler + Coordinators propagate errorCode and errorParams cleanly while preserving English .error strings', async () => {
  const storage = new StorageManager(new MemoryStorageAdapter());
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
  const civCoordinator = new CivilizationCoordinator(storage);
  const handler = new MessageHandler(sessionCoordinator, profileManager, storage, civCoordinator);

  const defaultProfile = await profileManager.createProfile('Default Study', []);

  // 1. Delete last profile -> PROFILE_DELETE_LAST
  const delRes = await handler.handleMessage({
    action: 'DELETE_PROFILE',
    payload: { profileId: defaultProfile.id },
  });
  assert.equal(delRes.success, false);
  assert.equal(delRes.errorCode, 'PROFILE_DELETE_LAST');
  assert.equal(delRes.error, 'Cannot delete the only remaining profile in the system.');
  assert.equal(
    localizeErrorMessage('vi', delRes.error, delRes.errorCode, delRes.errorParams),
    'Không thể xóa hồ sơ duy nhất còn lại trong hệ thống.'
  );

  // 2. Invalid countdown duration -> INVALID_TARGET_MINUTES
  const badDurationRes = await handler.handleMessage({
    action: 'START_SESSION',
    payload: { mode: 'COUNTDOWN', targetMinutes: 0, profileId: defaultProfile.id },
  });
  assert.equal(badDurationRes.success, false);
  assert.equal(badDurationRes.errorCode, 'INVALID_TARGET_MINUTES');
  assert.equal(
    localizeErrorMessage(
      'vi',
      badDurationRes.error,
      badDurationRes.errorCode,
      badDurationRes.errorParams
    ),
    'Thời lượng đếm ngược phải nằm trong khoảng 1 đến 1440 phút.'
  );

  // 3. Unknown building definition -> CIV_UNKNOWN_BUILDING_DEF with buildingId param
  const unknownBldRes = await handler.handleMessage({
    action: 'PLACE_BUILDING',
    payload: { buildingDefinitionId: 'nonexistent_tower', position: { x: 0, y: 0 } },
  });
  assert.equal(unknownBldRes.success, false);
  assert.equal(unknownBldRes.errorCode, 'CIV_UNKNOWN_BUILDING_DEF');
  assert.deepEqual(unknownBldRes.errorParams, { buildingId: 'nonexistent_tower' });
  assert.equal(
    localizeErrorMessage(
      'vi',
      unknownBldRes.error,
      unknownBldRes.errorCode,
      unknownBldRes.errorParams
    ),
    'Không nhận diện được công trình "nonexistent_tower".'
  );

  // 4. Unknown action -> UNKNOWN_ACTION
  const unknownActRes = await handler.handleMessage(
    { action: 'DO_SOMETHING_WEIRD' } as unknown as { action: 'GET_SESSION_STATE' }
  );
  assert.equal(unknownActRes.success, false);
  assert.equal(unknownActRes.errorCode, 'UNKNOWN_ACTION');
  assert.equal(
    localizeErrorMessage(
      'vi',
      unknownActRes.error,
      unknownActRes.errorCode,
      unknownActRes.errorParams
    ),
    'Thao tác không được hỗ trợ (DO_SOMETHING_WEIRD).'
  );
});
