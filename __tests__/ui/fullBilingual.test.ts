import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { I18nProvider } from '../../src/i18n/I18nContext.tsx';
import { RewardHelpModal } from '../../src/ui/components/RewardHelpModal.tsx';
import { StatsView } from '../../src/ui/components/StatsView.tsx';
import { CivilizationHeader } from '../../src/ui/components/civilization/CivilizationHeader.tsx';
import { BuildingCatalogPanel } from '../../src/ui/components/civilization/BuildingCatalogPanel.tsx';
import { BuildingDetailsModal } from '../../src/ui/components/civilization/BuildingDetailsModal.tsx';
import { CivilizationScreen } from '../../src/ui/components/civilization/CivilizationScreen.tsx';
import {
  getLocalizedBuildingDescription,
  getLocalizedBuildingName,
  getLocalizedEraName,
} from '../../src/ui/utils/buildingI18n.ts';
import { STONE_AGE_BUILDING_DEFINITIONS } from '../../src/core/civilization/buildingCatalog.ts';
import { CIVILIZATION_ERAS } from '../../src/core/civilization/buildingTypes.ts';
import { localizeErrorMessage } from '../../src/i18n/errorTranslator.ts';
import {
  applyBlockedTranslations,
  initBlockedPage,
  BlockedStorageLike,
} from '../../src/blocked/blocked.ts';
import { STORAGE_KEYS } from '../../src/storage/storageKeys.ts';
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
  SessionCoordinator,
  buildPomodoroStageAlarmName,
} from '../../src/background/sessionCoordinator.ts';

function renderWithLocale(locale: 'en' | 'vi', element: React.ReactElement): string {
  return renderToString(React.createElement(I18nProvider, { locale }, element));
}

test('Stage E UI SSR: RewardHelpModal, StatsView, CivilizationHeader, BuildingCatalogPanel, BuildingDetailsModal & CivilizationScreen render EN and VI', () => {
  const sampleDef = STONE_AGE_BUILDING_DEFINITIONS[0];
  const sampleInstance = {
    id: 'b_1',
    definitionId: sampleDef.id,
    position: { x: 0, y: 0 },
    level: 1,
    placedAt: 1700000000000,
  };

  // RewardHelpModal
  const helpEn = renderWithLocale(
    'en',
    React.createElement(RewardHelpModal, { isOpen: true, onClose: () => {} })
  );
  const helpVi = renderWithLocale(
    'vi',
    React.createElement(RewardHelpModal, { isOpen: true, onClose: () => {} })
  );
  assert.ok(helpEn.includes('Reward &amp; Multiplier Guide'));
  assert.ok(helpEn.includes('180 minutes is not a session duration cap'));
  assert.ok(helpVi.includes('Hướng dẫn Thưởng &amp; Hệ số'));
  assert.ok(helpVi.includes('180 phút không phải giới hạn thời lượng phiên'));

  // StatsView
  const statsData = {
    date: '2026-04-01',
    totalFocusMinutes: 45,
    completedSessions: 2,
    abandonedSessions: 0,
    coinsEarned: 54,
    xpEarned: 162,
  };
  const statsEn = renderWithLocale(
    'en',
    React.createElement(StatsView, { todayStats: statsData })
  );
  const statsVi = renderWithLocale(
    'vi',
    React.createElement(StatsView, { todayStats: statsData })
  );
  assert.ok(statsEn.includes('Today&#x27;s Focus Summary'));
  assert.ok(statsEn.includes('Focus Time'));
  assert.ok(statsVi.includes('Tổng kết Tập trung Hôm nay'));
  assert.ok(statsVi.includes('Thời gian Tập trung'));

  // CivilizationHeader
  const headerProps = {
    era: 'STONE_AGE',
    focusCoins: 120,
    lifetimeFocusMinutes: 90,
    activeBonusRate: 0.05,
    isPlacementMode: false,
    selectedBuildingDef: null,
    onCancelPlacement: () => {},
    onOpenCatalog: () => {},
    onOpenExpansion: () => {},
  };
  const headerEn = renderWithLocale('en', React.createElement(CivilizationHeader, headerProps));
  const headerVi = renderWithLocale('vi', React.createElement(CivilizationHeader, headerProps));
  assert.ok(headerEn.includes('Stone Age'));
  assert.ok(headerEn.includes('Build'));
  assert.ok(headerEn.includes('Expand'));
  assert.ok(headerVi.includes('Thời đại Đồ Đá'));
  assert.ok(headerVi.includes('Xây dựng'));
  assert.ok(headerVi.includes('Mở đất'));

  // BuildingCatalogPanel
  const catalogProps = {
    isOpen: true,
    onClose: () => {},
    playerLevel: 3,
    playerCoins: 200,
    lifetimeFocusMinutes: 120,
    currentEra: 'STONE_AGE' as const,
    onSelectBuilding: () => {},
  };
  const catalogEn = renderWithLocale('en', React.createElement(BuildingCatalogPanel, catalogProps));
  const catalogVi = renderWithLocale('vi', React.createElement(BuildingCatalogPanel, catalogProps));
  assert.ok(catalogEn.includes('Building Catalog'));
  assert.ok(catalogEn.includes('Campfire'));
  assert.ok(catalogVi.includes('Danh Mục Công Trình'));
  assert.ok(catalogVi.includes('Lửa trại'));

  // BuildingDetailsModal (Stage 5C-1: fixed for Decor/Focus Support, upgradeable for Economy)
  const detailsProps = {
    building: sampleInstance,
    onClose: () => {},
    onRemove: async () => {},
  };
  const detailsEn = renderWithLocale('en', React.createElement(BuildingDetailsModal, detailsProps));
  const detailsVi = renderWithLocale('vi', React.createElement(BuildingDetailsModal, detailsProps));
  assert.ok(detailsEn.includes('Demolish Building'));
  assert.ok(detailsEn.includes('Fixed effect · Cannot be upgraded'));
  assert.ok(detailsVi.includes('Phá dỡ Công trình'));
  assert.ok(detailsVi.includes('Hiệu ứng cố định · Không nâng cấp'));

  const econDetailsProps = {
    building: {
      id: 'b_econ',
      definitionId: 'stone_age_foraging_post',
      position: { x: 0, y: 0 },
      level: 1,
      placedAt: 1700000000000,
    },
    playerLevel: 2,
    playerCoins: 150,
    onUpgrade: async () => {},
    onClose: () => {},
    onRemove: async () => {},
  };
  const econEn = renderWithLocale('en', React.createElement(BuildingDetailsModal, econDetailsProps));
  const econVi = renderWithLocale('vi', React.createElement(BuildingDetailsModal, econDetailsProps));
  assert.ok(econEn.includes('Upgrade Building'));
  assert.ok(econEn.includes('+2% → +4% CoinBonus'));
  assert.ok(econVi.includes('Nâng Cấp Công Trình'));
  assert.ok(econVi.includes('+2% → +4% CoinBonus'));

  // CivilizationScreen loading state
  const screenEn = renderWithLocale('en', React.createElement(CivilizationScreen));
  const screenVi = renderWithLocale('vi', React.createElement(CivilizationScreen));
  assert.ok(screenEn.includes('Loading territory map...'));
  assert.ok(screenVi.includes('Đang tải bản đồ lãnh thổ...'));
});

test('Stage E i18n helpers: buildingI18n covers all 6 Stone Age buildings and all 8 CivilizationEra entries', () => {
  for (const def of STONE_AGE_BUILDING_DEFINITIONS) {
    const enName = getLocalizedBuildingName('en', def);
    const viName = getLocalizedBuildingName('vi', def);
    const enDesc = getLocalizedBuildingDescription('en', def);
    const viDesc = getLocalizedBuildingDescription('vi', def);

    assert.equal(enName, def.name);
    assert.ok(viName.length > 0 && viName !== enName, `VI name missing for ${def.id}`);
    assert.equal(enDesc, def.description);
    assert.ok(viDesc.length > 0 && viDesc !== enDesc, `VI desc missing for ${def.id}`);
  }

  for (const era of CIVILIZATION_ERAS) {
    const enEra = getLocalizedEraName('en', era);
    const viEra = getLocalizedEraName('vi', era);
    assert.ok(enEra.length > 0);
    assert.ok(viEra.length > 0 && viEra !== enEra, `VI era missing for ${era}`);
  }
});

test('Stage E errorTranslator: preserves EN raw errors and translates exact/parameterized errors in VI', () => {
  const sampleErrors = [
    'Profile name cannot be empty or whitespace.',
    "Pattern '*' is too broad and would disable website blocking protection.",
    'Building "Ancient Totem" requires Player Level 2 (current: 1)',
    'Insufficient coins: building "Rock Shelter" costs 120 Coins (current balance: 30)',
    'Land expansion #1 requires Player Level 3 (current: 1)',
    'Insufficient coins: chunk expansion #1 costs 75 Coins (current balance: 20)',
    'Cannot place building: CELL_OCCUPIED',
    'No active session to pause.',
  ];

  for (const raw of sampleErrors) {
    assert.equal(localizeErrorMessage('en', raw), raw);
    const vi = localizeErrorMessage('vi', raw);
    assert.notEqual(vi, raw, `Expected VI translation for: ${raw}`);
  }

  assert.ok(
    localizeErrorMessage('vi', 'Building "Ancient Totem" requires Player Level 2 (current: 1)').includes('Vật tổ Cổ đại')
  );
  assert.ok(
    localizeErrorMessage(
      'vi',
      'Land expansion #1 requires Player Level 3 (current: 1)'
    ).includes('Mở rộng đất lần #1')
  );
});

test('Stage E blocked.ts: applies EN/VI DOM translations, sets data-ready, and reacts to storage.onChanged', async () => {
  const elements: Record<string, { textContent: string | null; attrs: Record<string, string>; setAttribute: (k: string, v: string) => void }> = {
    'blocked-card': {
      textContent: null,
      attrs: {},
      setAttribute(k: string, v: string) {
        this.attrs[k] = v;
      },
    },
    'blocked-title': { textContent: '', attrs: {}, setAttribute() {} },
    'blocked-desc': { textContent: '', attrs: {}, setAttribute() {} },
    'blocked-badge': { textContent: '', attrs: {}, setAttribute() {} },
  };

  const mockDoc = {
    title: '',
    documentElement: { lang: 'en' },
    getElementById(id: string) {
      return elements[id] ?? null;
    },
  } as unknown as Document;

  // Direct apply check
  applyBlockedTranslations('vi', mockDoc);
  assert.equal(mockDoc.documentElement.lang, 'vi');
  assert.ok(mockDoc.title.includes('Focus Quest'));
  assert.ok(elements['blocked-title'].textContent!.includes('Focus Quest Đang Hoạt Động'));
  assert.ok(elements['blocked-badge'].textContent!.includes('Allowlist'));

  // initBlockedPage + storage.onChanged reactive switch
  const changeListeners: Array<
    (changes: Record<string, { newValue?: unknown }>, areaName: string) => void
  > = [];
  const mockStorage: BlockedStorageLike = {
    local: {
      get(_keys, cb) {
        const data = { [STORAGE_KEYS.SETTINGS]: { language: 'en' } };
        if (cb) cb(data);
        return Promise.resolve(data);
      },
    },
    onChanged: {
      addListener(cb) {
        changeListeners.push(cb);
      },
      removeListener(cb) {
        const idx = changeListeners.indexOf(cb);
        if (idx !== -1) changeListeners.splice(idx, 1);
      },
    },
  };

  const cleanup = initBlockedPage(mockDoc, mockStorage);
  assert.equal(elements['blocked-card'].attrs['data-ready'], 'true');
  assert.equal(mockDoc.documentElement.lang, 'en');
  assert.ok(elements['blocked-title'].textContent!.includes('Focus Quest Active'));

  assert.equal(changeListeners.length, 1, 'onChanged listener must be registered');
  changeListeners[0]({ [STORAGE_KEYS.SETTINGS]: { newValue: { language: 'vi' } } }, 'local');
  assert.equal(mockDoc.documentElement.lang, 'vi');
  assert.ok(elements['blocked-title'].textContent!.includes('Focus Quest Đang Hoạt Động'));

  cleanup();
});

test('Stage E notifications: SessionCoordinator dispatches EN and VI notifications based on settings.language', async () => {
  async function runScenario(language: 'en' | 'vi') {
    const adapter = new MemoryStorageAdapter();
    const storage = new StorageManager(adapter);
    await storage.updateSettings({ language });

    const profileManager = new ProfileManager(storage);
    const alarms = new MockAlarmsAdapter();
    const dispatched: Array<{ id: string; title: string; message: string }> = [];
    const notifications = new MockNotificationsAdapter();
    const origCreate = notifications.create.bind(notifications);
    notifications.create = async (id, options) => {
      dispatched.push({ id, title: options.title, message: options.message });
      return origCreate(id, options);
    };
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

    const profile = await profileManager.createProfile('NotifyTest', ['example.com']);

    // 1. Countdown completion notification
    await coordinator.startSession('COUNTDOWN', 10, profile.id);
    await coordinator.completeCountdown();

    // 2. Pomodoro break & focus resume notifications
    const pSession = await coordinator.startSession('POMODORO_COUNTDOWN', 1, profile.id, {
      focusDurationMinutes: 1,
      focusIntervalDurationMinutes: 1,
      shortBreakDurationMinutes: 1,
      longBreakDurationMinutes: 1,
      focusIntervalsPerCycle: 2,
      targetFocusSessions: 2,
      numberOfCycles: 1,
    });
    const focusAlarm = buildPomodoroStageAlarmName(
      pSession.id,
      pSession.pomodoroState!.currentInterval,
      'FOCUS',
      pSession.pomodoroState!.phaseStartedAt
    );
    const breakSession = await coordinator.advancePomodoroStage(focusAlarm);
    assert.ok(breakSession);
    const breakAlarm = buildPomodoroStageAlarmName(
      breakSession.id,
      breakSession.pomodoroState!.currentInterval,
      breakSession.pomodoroState!.currentPhase,
      breakSession.pomodoroState!.phaseStartedAt
    );
    await coordinator.advancePomodoroStage(breakAlarm);

    return dispatched;
  }

  const enNotifs = await runScenario('en');
  const viNotifs = await runScenario('vi');

  assert.equal(enNotifs.length, 3);
  assert.equal(viNotifs.length, 3);

  assert.ok(enNotifs[0].title.includes('Focus Quest — Mission Complete!'));
  assert.ok(enNotifs[1].title.includes('Short Break Time!'));
  assert.ok(enNotifs[2].title.includes('Break Ended!'));

  assert.ok(viNotifs[0].title.includes('Focus Quest — Hoàn thành Phiên!'));
  assert.ok(viNotifs[1].title.includes('Giờ Nghỉ Ngắn!'));
  assert.ok(viNotifs[2].title.includes('Hết Giờ Nghỉ!'));
});

test('Stage 6 errorTranslator: table-driven EN/VI check across ALL_KNOWN_ERROR_CODES, music codes & technical error sanitization', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const { ALL_KNOWN_ERROR_CODES } = await import('../../src/i18n/errorTranslator.ts');
  const { EN_MESSAGES } = await import('../../src/i18n/locales/en.ts');
  const { VI_MESSAGES } = await import('../../src/i18n/locales/vi.ts');

  // Verify ALL_KNOWN_ERROR_CODES covers every member of ErrorCode union in src/types/errors.ts
  const errorsSrc = fs.readFileSync(
    path.resolve(import.meta.dirname, '../../src/types/errors.ts'),
    'utf8'
  );
  const unionSectionMatch = errorsSrc.match(/export type ErrorCode =([\s\S]*?);/);
  assert.ok(unionSectionMatch, 'Expected ErrorCode union in src/types/errors.ts');
  const declaredCodes = Array.from(unionSectionMatch[1].matchAll(/'([A-Z0-9_]+)'/g)).map((m) => m[1]);
  assert.deepStrictEqual(
    [...ALL_KNOWN_ERROR_CODES].sort(),
    [...new Set(declaredCodes)].sort(),
    'ALL_KNOWN_ERROR_CODES must match ErrorCode union 100%'
  );

  const sampleParamsByCode: Record<string, Record<string, string | number>> = {
    UNKNOWN_ACTION: { action: 'BOGUS_ACTION' },
    INVALID_SESSION_MODE: { mode: 'TURBO' },
    SESSION_ALREADY_ACTIVE: { status: 'RUNNING' },
    SESSION_PROFILE_NOT_FOUND: { profileId: 'p-missing' },
    SESSION_CANNOT_RESET_ACTIVE: { status: 'RUNNING' },
    PROFILE_DUPLICATE_NAME: { name: 'Study' },
    PROFILE_NOT_FOUND: { profileId: 'p-404' },
    PROFILE_SET_ACTIVE_NOT_FOUND: { profileId: 'p-404' },
    PROFILE_REPLACEMENT_NOT_FOUND: { profileId: 'p-404' },
    DOMAIN_PATTERN_TOO_BROAD: { pattern: '*' },
    DOMAIN_INVALID_FORMAT: { pattern: 'not a domain!' },
    PROFILE_CREATE_INVALID_DOMAIN: { reasonCode: 'DOMAIN_INVALID_FORMAT', pattern: 'bad domain' },
    PROFILE_ADD_INVALID_DOMAIN: { reasonCode: 'DOMAIN_PATTERN_TOO_BROAD', pattern: '*' },
    PROFILE_UPDATE_INVALID_ALLOWLIST: { reasonCode: 'DOMAIN_EMPTY' },
    CIV_UNKNOWN_BUILDING_DEF: { buildingDefinitionId: 'unknown_hut' },
    CIV_REQUIRES_LEVEL: { buildingName: 'Ancient Totem', requiredLevel: 2, currentLevel: 1 },
    CIV_REQUIRES_FOCUS_MINUTES: { buildingName: 'Rock Shelter', requiredMinutes: 60, currentMinutes: 10 },
    CIV_REQUIRES_ERA: { buildingName: 'Campfire', requiredEra: 'BRONZE_AGE', currentEra: 'STONE_AGE' },
    CIV_INSUFFICIENT_BUILDING_COINS: { buildingName: 'Rock Shelter', cost: 120, balance: 30 },
    CIV_CANNOT_PLACE_BUILDING: { reason: 'CELL_OCCUPIED' },
    CIV_GRID_PLACEMENT_FAILED: { reason: 'OUT_OF_BOUNDS' },
    CIV_ECONOMY_BUILDING_LIMIT_REACHED: { buildingName: 'Foraging Post', limit: 4, currentCount: 4 },
    CIV_BUILDING_NOT_FOUND: { buildingInstanceId: 'bld-404' },
    CIV_BUILDING_REMOVAL_FAILED: { reason: 'NOT_FOUND' },
    BUILDING_NOT_FOUND: { buildingId: 'bld-404' },
    BUILDING_MAX_LEVEL: { buildingName: 'Foraging Post', maxLevel: 5 },
    UPGRADE_PLAYER_LEVEL_REQUIRED: { buildingName: 'Foraging Post', requiredLevel: 3, currentLevel: 2 },
    BUILDING_LEVEL_MISMATCH: { buildingId: 'bld-1', expectedLevel: 1, currentLevel: 2 },
    CIV_UPGRADE_NOT_SUPPORTED: { buildingName: 'Campfire' },
    CIV_UPGRADE_ERA_LOCKED: { buildingName: 'Foraging Post', requiredEra: 'BRONZE_AGE' },
    CIV_INVALID_EXPAND_ORIGIN_GRID: { chunkWidth: 4, chunkHeight: 4 },
    CIV_EXPAND_REQUIRES_LEVEL: { purchaseIndex: 1, requiredLevel: 3, currentLevel: 1 },
    CIV_INSUFFICIENT_EXPAND_COINS: { purchaseIndex: 1, cost: 30, balance: 15 },
    CIV_LAND_EXPANSION_FAILED: { reason: 'NOT_ADJACENT' },
    CIV_INVALID_FOUNDER_PAYLOAD: { role: 'wizard' },
    CIV_FOUNDER_ALREADY_SELECTED: {},
    CIV_FOUNDER_NOT_SELECTED: {},
    MUSIC_TRACK_NOT_FOUND: { trackId: 'track-404' },
    UNKNOWN_QUEST: { questId: 'daily_first_spark' },
    QUEST_PERIOD_MISMATCH: { questId: 'daily_first_spark', period: 'WEEKLY' },
    QUEST_ALREADY_CLAIMED: { questId: 'daily_first_spark' },
    QUEST_EXPIRED: { questId: 'daily_first_spark' },
    QUEST_NOT_COMPLETED: { questId: 'daily_first_spark', progress: 0, target: 1 },
  };

  for (const code of [...ALL_KNOWN_ERROR_CODES, 'autoplay_blocked', 'network', 'decode', 'unknown']) {
    const params = sampleParamsByCode[code];
    const enMsg = localizeErrorMessage('en', undefined, code, params);
    const viMsg = localizeErrorMessage('vi', undefined, code, params);
    assert.ok(enMsg.trim().length > 0, `Empty EN message for ${code}`);
    assert.ok(viMsg.trim().length > 0, `Empty VI message for ${code}`);
    assert.notEqual(viMsg, enMsg, `VI translation missing or identical to EN for ${code}`);
    assert.equal(enMsg.includes('undefined') || enMsg.includes('NaN'), false, `Leak in EN for ${code}: ${enMsg}`);
    assert.equal(viMsg.includes('undefined') || viMsg.includes('NaN'), false, `Leak in VI for ${code}: ${viMsg}`);
  }

  // Technical errors & stack traces must be sanitized cleanly
  const technicalSamples = [
    "TypeError: Cannot read properties of undefined (reading 'id')\n    at foo (/app/src/background/sessionCoordinator.ts:123:45)",
    'ReferenceError: xyz is not defined',
    'Error at handleMessage (src/background/messageHandler.ts:99:12)',
  ];
  for (const tech of technicalSamples) {
    const enSafe = localizeErrorMessage('en', tech);
    const viSafe = localizeErrorMessage('vi', tech);
    assert.equal(enSafe, 'Something went wrong. Please try again.');
    assert.equal(viSafe, 'Đã xảy ra lỗi. Vui lòng thử lại.');
    const enCoded = localizeErrorMessage('en', tech, 'ACTION_FAILED');
    const viCoded = localizeErrorMessage('vi', tech, 'ACTION_FAILED');
    assert.equal(enCoded, 'Something went wrong. Please try again.');
    assert.equal(viCoded, 'Đã xảy ra lỗi. Vui lòng thử lại.');
  }

  // Verify 100% EN/VI dictionary key parity & non-empty strings
  const enKeys = Object.keys(EN_MESSAGES).sort();
  const viKeys = Object.keys(VI_MESSAGES).sort();
  assert.deepStrictEqual(viKeys, enKeys, 'EN_MESSAGES and VI_MESSAGES keys must match 100%');
  for (const key of enKeys) {
    const k = key as keyof typeof EN_MESSAGES;
    assert.ok(EN_MESSAGES[k].trim().length > 0, `Empty EN value for key ${key}`);
    assert.ok(VI_MESSAGES[k].trim().length > 0, `Empty VI value for key ${key}`);
  }
});

test('Stage 6 i18n static audit: src/ui/ (excluding SpriteGallery.tsx) has zero hardcoded visible copy or accessibility attributes', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');

  const uiDir = path.resolve(import.meta.dirname, '../../src/ui');
  const tsxFiles: string[] = [];
  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.name.endsWith('.tsx') && entry.name !== 'SpriteGallery.tsx') {
        tsxFiles.push(fullPath);
      }
    }
  }
  walk(uiDir);
  assert.ok(tsxFiles.length >= 10, `Expected at least 10 UI TSX files, found ${tsxFiles.length}`);

  const attrFindings: string[] = [];
  const textFindings: string[] = [];
  const allowedTextTokens = new Set(['FQ', 'zZ']);
  const punctOnlyRe = /^[\s\d.,:%+\-×x\/|·•⚡⚠️()[\]{}?!✓✕‹›'"`~@#&*→←↑↓▶⏸⏹mhd]+$/;

  for (const filePath of tsxFiles) {
    const rel = path.relative(path.resolve(import.meta.dirname, '../..'), filePath).replace(/\\/g, '/');
    const code = fs.readFileSync(filePath, 'utf8');
    const lines = code.split('\n');

    lines.forEach((line, idx) => {
      const attrLiteralRe = /\b(aria-label|title|placeholder|alt)="([^"]+)"/g;
      let am: RegExpExecArray | null;
      while ((am = attrLiteralRe.exec(line)) !== null) {
        attrFindings.push(`${rel}:${idx + 1} ${am[1]}="${am[2]}"`);
      }

      if (
        /\b(aria-label|title|placeholder|alt)=\{[^{}]*['"`][A-Za-zÀ-ỹ]{2,}/.test(line) &&
        !line.includes('t(') &&
        !line.includes('localize') &&
        !line.includes('getLocalized')
      ) {
        attrFindings.push(`${rel}:${idx + 1} expr-attr: ${line.trim()}`);
      }
    });

    const noComments = code.replace(/\/\*[\s\S]*?\*\//g, '');
    const jsxTextRe = />([^<>{}]+)</g;
    let tm: RegExpExecArray | null;
    while ((tm = jsxTextRe.exec(noComments)) !== null) {
      const text = tm[1].replace(/\s+/g, ' ').trim();
      if (!text) continue;
      if (/[=&|;]/.test(text)) continue; // JS/TS expressions like `) : (`, `a > 0 && b < 1`
      if (/^\)\s*:\s*/.test(text)) continue; // TSX ternary continuation like `) : isCountdown ? (`
      if (text === 'Promise') continue; // `Promise<void>`
      if (punctOnlyRe.test(text) || allowedTextTokens.has(text)) continue;
      textFindings.push(`${rel}: ${JSON.stringify(text)}`);
    }
  }

  assert.deepStrictEqual(attrFindings, [], `Hardcoded UI attributes found:\n${attrFindings.join('\n')}`);
  assert.deepStrictEqual(textFindings, [], `Hardcoded JSX text literals found:\n${textFindings.join('\n')}`);
});
