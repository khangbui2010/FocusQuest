import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
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
import { QuestCoordinator } from '../../src/background/questCoordinator.ts';
import { MessageHandler } from '../../src/background/messageHandler.ts';
import { createInitialCivilizationState } from '../../src/core/civilization/civilizationState.ts';
import { getBuildingDefinition } from '../../src/core/civilization/buildingCatalog.ts';
import {
  FOUNDER_VILLAGER_ID,
  getEffectiveVillagersForDisplay,
} from '../../src/core/civilization/villager.ts';
import {
  sendExtensionMessage,
  seedMockCivilizationForTest,
  selectFounderClient,
} from '../../src/ui/services/extensionClient.ts';
import { I18nProvider } from '../../src/i18n/I18nContext.tsx';
import { SupportedLocale } from '../../src/i18n/types.ts';
import { localizeErrorMessage } from '../../src/i18n/errorTranslator.ts';
import { FounderPickerModal } from '../../src/ui/components/civilization/FounderPickerModal.tsx';
import { MapGridView } from '../../src/ui/components/civilization/MapGridView.tsx';
import { FocusSceneArea } from '../../src/ui/components/FocusSceneArea.tsx';
import { buildFocusSceneModel } from '../../src/ui/utils/focusSceneModel.ts';

function setupHandler() {
  const storage = new StorageManager(new MemoryStorageAdapter());
  const profileManager = new ProfileManager(storage);
  const alarms = new MockAlarmsAdapter();
  const notifications = new MockNotificationsAdapter();
  const badge = new MockBadgeAdapter();
  const blocking = new BlockingCoordinator(new MockDNRAdapter());
  const civ = new CivilizationCoordinator(storage);
  const quest = new QuestCoordinator(storage);
  const session = new SessionCoordinator(
    storage,
    profileManager,
    alarms,
    notifications,
    badge,
    blocking,
    () => civ.getActiveCoinBonuses(),
    undefined,
    undefined,
    (civState) => {
      civ.refreshCachedBonuses(civState);
    }
  );
  const handler = new MessageHandler(
    session,
    profileManager,
    storage,
    civ,
    undefined,
    quest
  );
  return { storage, civ, handler };
}

function renderWithLocale(locale: SupportedLocale, element: React.ReactElement): string {
  return renderToString(
    React.createElement(
      I18nProvider,
      { locale, onChangeLocale: async () => {} },
      element
    )
  );
}

test('Chặng D Backend: SELECT_FOUNDER persists role once, unlocks 1-crew builds, rejects duplicate selection & bad roles', async () => {
  const { storage, handler } = setupHandler();
  await storage.setEconomy({ focusCoins: 200, totalXP: 1000, level: 5 });
  await storage.setDailyStats({
    '2026-11-25': {
      date: '2026-11-25',
      totalFocusMinutes: 60,
      completedSessions: 1,
      abandonedSessions: 0,
      coinsEarned: 60,
      xpEarned: 150,
    },
  });

  // Before selecting Founder: Rock Shelter placement fails with CIV_NOT_ENOUGH_VILLAGERS
  const prePlace = await handler.handleMessage({
    action: 'PLACE_BUILDING',
    payload: { buildingDefinitionId: 'stone_age_study_cave', position: { x: 0, y: 0 } },
  });
  assert.equal(prePlace.success, false);
  assert.equal(prePlace.errorCode, 'CIV_NOT_ENOUGH_VILLAGERS');

  // Invalid founder payload rejected
  const badRole = await handler.handleMessage({
    action: 'SELECT_FOUNDER',
    payload: { role: 'wizard' as 'elder' },
  });
  assert.equal(badRole.success, false);
  assert.equal(badRole.errorCode, 'CIV_INVALID_FOUNDER_PAYLOAD');

  // Valid Founder selection persists and grants +1 crew immediately
  const selectRes = await handler.handleMessage({
    action: 'SELECT_FOUNDER',
    payload: { role: 'crafter' },
  });
  assert.equal(selectRes.success, true);
  assert.equal((selectRes.data as { founderRole: string }).founderRole, 'crafter');

  const storedCiv = await storage.getCivilizationState();
  assert.equal(storedCiv?.founderRole, 'crafter');
  assert.equal(storedCiv?.villagers?.length ?? 0, 0);

  // Duplicate Founder selection rejected permanently
  const dupRes = await handler.handleMessage({
    action: 'SELECT_FOUNDER',
    payload: { role: 'elder' },
  });
  assert.equal(dupRes.success, false);
  assert.equal(dupRes.errorCode, 'CIV_FOUNDER_ALREADY_SELECTED');

  // With 1 Founder crew, placing Rock Shelter succeeds cleanly (queued as 3600s ACTIVE job)
  const postPlace = await handler.handleMessage({
    action: 'PLACE_BUILDING',
    payload: { buildingDefinitionId: 'stone_age_study_cave', position: { x: 0, y: 0 } },
  });
  assert.equal(postPlace.success, true);

  // Finish the Rock Shelter job directly to verify Cave recruitment cost = 34 (n = 1) while capacity used = 0/2
  const current = (await storage.getCivilizationState())!;
  await storage.setCivilizationState({
    ...current,
    jobs: [],
  });

  const recruitRes = await handler.handleMessage({
    action: 'RECRUIT_VILLAGER',
    payload: { role: 'elder' },
  });
  assert.equal(recruitRes.success, true);
  assert.equal((recruitRes.data as { cost: number }).cost, 34); // round(25 * 1.35^1)
  assert.equal(
    (recruitRes.data as { civilizationState: { villagers: unknown[] } }).civilizationState.villagers
      .length,
    1
  );
});

test('Chặng D Simulator: extensionClient supports SELECT_FOUNDER & duplicate rejection consistently', async () => {
  const init = createInitialCivilizationState();
  seedMockCivilizationForTest(init, { focusCoins: 150, totalXP: 500, level: 3 });

  const bad = await sendExtensionMessage({
    action: 'SELECT_FOUNDER',
    payload: { role: 'bogus' as 'crafter' },
  });
  assert.equal(bad.success, false);
  assert.equal(bad.errorCode, 'CIV_INVALID_FOUNDER_PAYLOAD');

  const ok = await selectFounderClient({ role: 'woodworker' });
  assert.equal(ok.success, true);
  assert.equal(ok.data?.founderRole, 'woodworker');
  assert.equal(ok.data?.civilizationState.founderRole, 'woodworker');

  const second = await selectFounderClient({ role: 'elder' });
  assert.equal(second.success, false);
  assert.equal(second.errorCode, 'CIV_FOUNDER_ALREADY_SELECTED');
});

test('Chặng D Display & Rename: Founder renders on MapGridView & FocusSceneArea, and Rock Shelter/Hang trú ẩn rename preserves ID', () => {
  const caveDef = getBuildingDefinition('stone_age_study_cave');
  assert.ok(caveDef);
  assert.equal(caveDef.name, 'Rock Shelter');

  // Error translator EN & VI both use Rock Shelter / Hang trú ẩn
  assert.ok(localizeErrorMessage('en', undefined, 'CIV_NO_VILLAGE_CAVE').includes('Rock Shelter'));
  assert.ok(localizeErrorMessage('vi', undefined, 'CIV_NO_VILLAGE_CAVE').includes('Hang trú ẩn'));
  assert.ok(
    localizeErrorMessage('en', undefined, 'CIV_FOUNDER_ALREADY_SELECTED').includes('already been selected')
  );
  assert.ok(
    localizeErrorMessage('vi', undefined, 'CIV_FOUNDER_ALREADY_SELECTED').includes('không thể thay đổi')
  );

  // Pure helper prepends FOUNDER_VILLAGER_ID without mutating base list
  const effective = getEffectiveVillagersForDisplay([], 'elder');
  assert.equal(effective.length, 1);
  assert.equal(effective[0].id, FOUNDER_VILLAGER_ID);
  assert.equal(effective[0].role, 'elder');

  // FocusSceneModel & FocusSceneArea display Founder even with villagers: []
  const civWithFounder = {
    ...createInitialCivilizationState(),
    founderRole: 'crafter' as const,
  };
  const sceneModel = buildFocusSceneModel(civWithFounder);
  assert.equal(sceneModel.villagers.length, 1);
  assert.equal(sceneModel.villagers[0].id, FOUNDER_VILLAGER_ID);
  assert.equal(sceneModel.villagers[0].role, 'crafter');
  assert.equal(sceneModel.isEmpty, false);

  const sceneHtml = renderWithLocale(
    'en',
    React.createElement(FocusSceneArea, {
      era: 'STONE_AGE',
      sceneState: 'working',
      statusLabel: 'Focusing',
      chimeEnabled: false,
      onToggleChime: () => {},
      chimeAriaLabel: 'Toggle chime',
      chimeTitle: 'Chime',
      civilizationState: civWithFounder,
    })
  );
  assert.ok(sceneHtml.includes(`data-testid="scene-villager-${FOUNDER_VILLAGER_ID}"`));

  // MapGridView SSR displays Founder villager on grid
  const mapHtml = renderWithLocale(
    'vi',
    React.createElement(MapGridView, {
      civilizationState: civWithFounder,
      placementDef: null,
      onPlaceBuilding: () => {},
      onInspectBuilding: () => {},
    })
  );
  assert.ok(mapHtml.includes('data-testid="map-villagers-layer"'));
  assert.ok(mapHtml.includes(`data-testid="map-villager-${FOUNDER_VILLAGER_ID}"`));

  // FounderPickerModal renders cleanly in both EN and VI
  const modalEn = renderWithLocale(
    'en',
    React.createElement(FounderPickerModal, {
      isOpen: true,
      onSelectFounder: async () => {},
    })
  );
  assert.ok(modalEn.includes('data-testid="founder-picker-modal"'));
  assert.ok(modalEn.includes('Choose Your Starting Villager'));
  assert.ok(modalEn.includes('data-testid="founder-role-elder"'));
  assert.ok(modalEn.includes('data-testid="founder-role-crafter"'));
  assert.ok(modalEn.includes('data-testid="founder-role-woodworker"'));

  const modalVi = renderWithLocale(
    'vi',
    React.createElement(FounderPickerModal, {
      isOpen: true,
      onSelectFounder: async () => {},
    })
  );
  assert.ok(modalVi.includes('Chọn Dân Làng Khởi Đầu'));
  assert.ok(modalVi.includes('Xác nhận Dân làng'));
});
