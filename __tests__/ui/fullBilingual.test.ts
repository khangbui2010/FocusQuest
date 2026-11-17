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

  // BuildingDetailsModal (must keep Milestone 5C invariant in both locales)
  const detailsProps = {
    building: sampleInstance,
    onClose: () => {},
    onRemove: async () => {},
  };
  const detailsEn = renderWithLocale('en', React.createElement(BuildingDetailsModal, detailsProps));
  const detailsVi = renderWithLocale('vi', React.createElement(BuildingDetailsModal, detailsProps));
  assert.ok(detailsEn.includes('Demolish Building'));
  assert.ok(detailsEn.includes('Milestone 5C'));
  assert.ok(detailsVi.includes('Phá dỡ Công trình'));
  assert.ok(detailsVi.includes('Milestone 5C'));

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
    'Insufficient coins: building "Meditation Cave" costs 120 Coins (current balance: 30)',
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
