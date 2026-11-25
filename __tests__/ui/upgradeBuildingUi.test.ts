import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';

import { I18nProvider } from '../../src/i18n/I18nContext.tsx';
import { localizeErrorMessage } from '../../src/i18n/errorTranslator.ts';
import { BuildingDetailsModal } from '../../src/ui/components/civilization/BuildingDetailsModal.tsx';
import { BuildingCatalogPanel } from '../../src/ui/components/civilization/BuildingCatalogPanel.tsx';
import { MapGridView } from '../../src/ui/components/civilization/MapGridView.tsx';
import { createInitialCivilizationState } from '../../src/core/civilization/civilizationState.ts';
import { GridMap } from '../../src/core/civilization/gridMap.ts';
import { BuildingInstance } from '../../src/core/civilization/buildingTypes.ts';
import {
  placeBuildingClient,
  removeBuildingClient,
  upgradeBuildingClient,
  seedMockCivilizationForTest,
  sendExtensionMessage,
} from '../../src/ui/services/extensionClient.ts';
import { PlayerEconomy } from '../../src/types/economy.ts';

function renderLocale(locale: 'en' | 'vi', element: React.ReactElement): string {
  return renderToString(React.createElement(I18nProvider, { locale }, element));
}

test('Stage 5C-1 Simulator Parity: upgradeBuildingClient, L1->L2 CoinBonus session boost, 50% demolish refund, and Campfire guard', async () => {
  const realDateNow = Date.now;
  let mockNow = 1732000000000;
  Date.now = () => mockNow;

  try {
    // Seed Cave at (5, 5) + 1 woodworker villager + woodworker founder (2 crew, 0% CoinBonus, 0% upgrade discount)
    const baseCiv = createInitialCivilizationState();
    const gm = GridMap.fromSnapshot(baseCiv.grid);
    gm.placeBuilding('cave_ub_seed', { x: 5, y: 5 }, { width: 3, height: 3 });
    seedMockCivilizationForTest({
      ...baseCiv,
      grid: gm.toSnapshot(),
      buildings: [
        {
          id: 'cave_ub_seed',
          definitionId: 'stone_age_study_cave',
          position: { x: 5, y: 5 },
          level: 1,
          placedAt: 1,
        },
      ],
      villagers: [{ id: 'v_ub_seed', role: 'woodworker', recruitedAt: 1 }],
      founderRole: 'woodworker',
    });

    // Invalid payload in simulator
    const badRes = await upgradeBuildingClient({ buildingId: '', expectedLevel: 1 });
    assert.equal(badRes.success, false);
    assert.equal(badRes.errorCode, 'CIV_INVALID_UPGRADE_PAYLOAD');

    // Complete a 30m Countdown session (+30m -> 80 lifetime mins >= 60m unlock, +54 Coins -> 174 Coins, +180 XP -> 630 XP -> Lv.4)
    const start1 = await sendExtensionMessage({
      action: 'START_SESSION',
      payload: { mode: 'COUNTDOWN', targetMinutes: 30, profileId: 'profile-study-research' },
    });
    assert.equal(start1.success, true);
    mockNow += 31 * 60 * 1000;
    await sendExtensionMessage({ action: 'GET_SESSION_STATE' });
    await sendExtensionMessage({ action: 'RESET_SESSION' });

    const econBeforePlace = await sendExtensionMessage<PlayerEconomy>({ action: 'GET_ECONOMY' });
    assert.equal(econBeforePlace.data?.focusCoins, 174);

    // Place Foraging Post (cost 15 -> 159 Coins left, 60m build job)
    const p1 = await placeBuildingClient({
      buildingDefinitionId: 'stone_age_foraging_post',
      position: { x: 0, y: 0 },
    });
    assert.equal(p1.success, true, `Expected placement to succeed, got ${p1.error}`);
    const b1 = p1.data!.building;
    assert.equal(p1.data!.economy.focusCoins, 159);

    // Cannot upgrade while under construction
    const underConsUp = await upgradeBuildingClient({ buildingId: b1.id, expectedLevel: 1 });
    assert.equal(underConsUp.success, false);
    assert.equal(underConsUp.errorCode, 'CIV_BUILDING_UNDER_CONSTRUCTION');

    // Finish 60m Foraging Post construction (60 * 1.5 * 1.4 = +126 Coins -> 285 Coins)
    await sendExtensionMessage({
      action: 'START_SESSION',
      payload: { mode: 'COUNTDOWN', targetMinutes: 60, profileId: 'profile-study-research' },
    });
    mockNow += 61 * 60 * 1000;
    await sendExtensionMessage({ action: 'GET_SESSION_STATE' });
    await sendExtensionMessage({ action: 'RESET_SESSION' });
    assert.equal((await sendExtensionMessage<PlayerEconomy>({ action: 'GET_ECONOMY' })).data?.focusCoins, 285);

    // Queue upgrades L1->L2 (24), L2->L3 (38), L3->L4 (61) -> total 123 Coins -> 162 Coins left
    const upRes = await upgradeBuildingClient({ buildingId: b1.id, expectedLevel: 1 });
    assert.equal(upRes.success, true, `Expected upgrade L1->L2 to succeed, got ${upRes.error}`);
    assert.equal(upRes.data!.newLevel, 2);
    assert.equal(upRes.data!.cost, 24);
    assert.equal(upRes.data!.economy.focusCoins, 261);

    const upRes3 = await upgradeBuildingClient({ buildingId: b1.id, expectedLevel: 2 });
    assert.equal(upRes3.success, true, `Expected upgrade L2->L3 to succeed, got ${upRes3.error}`);
    assert.equal(upRes3.data!.newLevel, 3);
    assert.equal(upRes3.data!.cost, 38);
    assert.equal(upRes3.data!.economy.focusCoins, 223);

    const upRes4 = await upgradeBuildingClient({ buildingId: b1.id, expectedLevel: 3 });
    assert.equal(upRes4.success, true, `Expected upgrade L3->L4 to succeed, got ${upRes4.error}`);
    assert.equal(upRes4.data!.newLevel, 4);
    assert.equal(upRes4.data!.cost, 61);
    assert.equal(upRes4.data!.economy.focusCoins, 162);

    // Complete 30m Focus session (5+10+15=30m) to advance all 3 queued upgrades to Lv.4!
    // During this 30m session, coinBonus was still +2% (Lv.1 at start): 30 * 1.5 * 1.2 * 1.02 = 55.08 Coins -> 217.08 Coins
    await sendExtensionMessage({
      action: 'START_SESSION',
      payload: { mode: 'COUNTDOWN', targetMinutes: 30, profileId: 'profile-study-research' },
    });
    mockNow += 31 * 60 * 1000;
    await sendExtensionMessage({ action: 'GET_SESSION_STATE' });
    await sendExtensionMessage({ action: 'RESET_SESSION' });

    // Place temporary Foraging Post & check insufficient coins when coins are set to 36
    const civNow = (await sendExtensionMessage<ReturnType<typeof createInitialCivilizationState>>({ action: 'GET_CIVILIZATION_STATE' })).data!;
    assert.equal(civNow.buildings.find((b) => b.id === b1.id)?.level, 4);
    seedMockCivilizationForTest(civNow, { focusCoins: 36 });

    const pTemp = await placeBuildingClient({
      buildingDefinitionId: 'stone_age_foraging_post',
      position: { x: 2, y: 0 },
    });
    assert.equal(pTemp.success, true, `Expected temporary Foraging Post placement to succeed, got ${pTemp.error}`);
    const remTemp = await removeBuildingClient({ buildingInstanceId: pTemp.data!.building.id });
    assert.equal(remTemp.success, true);
    assert.equal(remTemp.data?.economy?.focusCoins, 28.5);

    // Next 25m Countdown session earns 25 * 1.5 * 1.0 * 1.08 (+8% from Lv.4 Foraging Post) = 40.5 Coins -> 69 Coins
    await sendExtensionMessage({
      action: 'START_SESSION',
      payload: { mode: 'COUNTDOWN', targetMinutes: 25, profileId: 'profile-study-research' },
    });
    mockNow += 26 * 60 * 1000;
    await sendExtensionMessage({ action: 'GET_SESSION_STATE' });
    await sendExtensionMessage({ action: 'RESET_SESSION' });

    const econAfterSession = await sendExtensionMessage<PlayerEconomy>({ action: 'GET_ECONOMY' });
    assert.equal(econAfterSession.data?.focusCoins, 69);

    // Remove Lv.4 Foraging Post -> 50% refund of (15 + 24 + 38 + 61) = +69 Coins -> 138 Coins
    const rem1 = await removeBuildingClient({ buildingInstanceId: b1.id });
    assert.equal(rem1.success, true);
    assert.equal(rem1.data?.refundedCoins, 69);
    assert.equal(rem1.data?.economy?.focusCoins, 138);

    // Place campfire (4 -> 134 Coins left), verify decorative upgrade returns CIV_UPGRADE_NOT_SUPPORTED
    const camp = await placeBuildingClient({
      buildingDefinitionId: 'stone_age_campfire',
      position: { x: 0, y: 0 },
    });
    assert.equal(camp.success, true);
    const campUp = await upgradeBuildingClient({
      buildingId: camp.data!.building.id,
      expectedLevel: 1,
    });
    assert.equal(campUp.success, false);
    assert.equal(campUp.errorCode, 'CIV_UPGRADE_NOT_SUPPORTED');

    // Earn Coins via 2 x 60m Countdown sessions, place 4 Foraging Posts, verify 5th hits CIV_ECONOMY_BUILDING_LIMIT_REACHED while Granary still succeeds
    for (let i = 0; i < 2; i += 1) {
      await sendExtensionMessage({
        action: 'START_SESSION',
        payload: { mode: 'COUNTDOWN', targetMinutes: 60, profileId: 'profile-study-research' },
      });
      mockNow += 61 * 60 * 1000;
      await sendExtensionMessage({ action: 'GET_SESSION_STATE' });
      await sendExtensionMessage({ action: 'RESET_SESSION' });
    }
    for (const x of [0, 2, 4, 6]) {
      const res = await placeBuildingClient({
        buildingDefinitionId: 'stone_age_foraging_post',
        position: { x, y: 2 },
      });
      assert.equal(res.success, true, `Simulator placement #${x} failed: ${res.error}`);
    }
    const fifthForage = await placeBuildingClient({
      buildingDefinitionId: 'stone_age_foraging_post',
      position: { x: 0, y: 4 },
    });
    assert.equal(fifthForage.success, false);
    assert.equal(fifthForage.errorCode, 'CIV_ECONOMY_BUILDING_LIMIT_REACHED');

    const independentGranary = await placeBuildingClient({
      buildingDefinitionId: 'stone_age_food_cache',
      position: { x: 0, y: 4 },
    });
    assert.equal(independentGranary.success, true, `Granary should have independent Build Limit: ${independentGranary.error}`);
  } finally {
    Date.now = realDateNow;
  }
});

test('Stage 5C-1 UI SSR (BuildingDetailsModal): renders all upgrade states, inline error, success banner, and 50% refund copy in EN/VI', () => {
  const foragingLv1: BuildingInstance = {
    id: 'b_forage_1',
    definitionId: 'stone_age_foraging_post',
    position: { x: 0, y: 0 },
    level: 1,
    placedAt: 1700000000000,
  };
  const foragingLv2: BuildingInstance = { ...foragingLv1, level: 2 };
  const foragingLv5: BuildingInstance = { ...foragingLv1, level: 5 };
  const elderHut: BuildingInstance = {
    id: 'b_elder',
    definitionId: 'stone_age_elder_hut',
    position: { x: 4, y: 0 },
    level: 1,
    placedAt: 1700000000000,
  };

  // 1. Eligible upgrade + success highlight after reaching Lv.2
  const okEn = renderLocale(
    'en',
    React.createElement(BuildingDetailsModal, {
      building: foragingLv2,
      playerLevel: 3,
      playerCoins: 500,
      founderRole: 'crafter',
      upgradeSuccessLevel: 2,
      onClose: () => {},
      onRemove: async () => {},
      onUpgrade: async () => {},
    })
  );
  assert.ok(okEn.includes('Next Lv. 3 · Cost: 38 Coins'));
  assert.ok(okEn.includes('+4% → +6% CoinBonus'));
  assert.ok(okEn.includes('data-testid="building-upgrade-success"'));
  assert.ok(okEn.includes('Upgraded to Lv. 2!'));

  // 2. Insufficient Coins shortfall
  const lowCoinsVi = renderLocale(
    'vi',
    React.createElement(BuildingDetailsModal, {
      building: foragingLv1,
      playerLevel: 3,
      playerCoins: 16,
      founderRole: 'crafter',
      onClose: () => {},
      onRemove: async () => {},
      onUpgrade: async () => {},
    })
  );
  assert.ok(lowCoinsVi.includes('Thiếu 8 Coin'));
  assert.ok(lowCoinsVi.includes('Cần 24 Coin'));

  // 3. Player Level gate
  const lowLvEn = renderLocale(
    'en',
    React.createElement(BuildingDetailsModal, {
      building: foragingLv1,
      playerLevel: 1,
      playerCoins: 500,
      onClose: () => {},
      onRemove: async () => {},
      onUpgrade: async () => {},
    })
  );
  assert.ok(lowLvEn.includes('Requires Player Level 2'));
  assert.ok(lowLvEn.includes('Need Lv. 2'));

  // 4. Max level state
  const maxVi = renderLocale(
    'vi',
    React.createElement(BuildingDetailsModal, {
      building: foragingLv5,
      playerLevel: 10,
      playerCoins: 5000,
      onClose: () => {},
      onRemove: async () => {},
      onUpgrade: async () => {},
    })
  );
  assert.ok(maxVi.includes('Đã đạt cấp tối đa'));
  assert.ok(maxVi.includes('Tối đa'));

  // 5. Focus Support non-upgradeable note + Can't Upgrade badge
  const elderEn = renderLocale(
    'en',
    React.createElement(BuildingDetailsModal, {
      building: elderHut,
      playerLevel: 10,
      playerCoins: 5000,
      onClose: () => {},
      onRemove: async () => {},
      onUpgrade: async () => {},
    })
  );
  assert.ok(elderEn.includes('Fixed effect · Cannot be upgraded'));
  assert.ok(elderEn.includes('Can&#x27;t Upgrade') || elderEn.includes("Can't Upgrade"));
  const elderVi = renderLocale(
    'vi',
    React.createElement(BuildingDetailsModal, {
      building: elderHut,
      playerLevel: 10,
      playerCoins: 5000,
      onClose: () => {},
      onRemove: async () => {},
      onUpgrade: async () => {},
    })
  );
  assert.ok(elderVi.includes('Không thể nâng cấp'));

  // 6. Inline localized upgradeError alert (keeps modal open for retry)
  const errVi = renderLocale(
    'vi',
    React.createElement(BuildingDetailsModal, {
      building: foragingLv1,
      playerLevel: 3,
      playerCoins: 500,
      upgradeError: {
        code: 'BUILDING_LEVEL_MISMATCH',
        message: 'Level mismatch',
        params: { expectedLevel: 1, currentLevel: 2 },
      },
      onClose: () => {},
      onRemove: async () => {},
      onUpgrade: async () => {},
    })
  );
  assert.ok(errVi.includes('data-testid="building-upgrade-error"'));
  assert.ok(errVi.includes('Cấp công trình đã thay đổi'));
});

test('Stage 5C-1 UI SSR (BuildingCatalogPanel & MapGridView): shows per-building Build Limit, Can\'t Upgrade on non-upgradeable catalog items, and Lv badges', () => {
  const placedBuildings: BuildingInstance[] = [
    { id: 'f1', definitionId: 'stone_age_foraging_post', position: { x: 0, y: 0 }, level: 2, placedAt: 1 },
    { id: 'g1', definitionId: 'stone_age_food_cache', position: { x: 2, y: 0 }, level: 3, placedAt: 1 },
    { id: 'g2', definitionId: 'stone_age_food_cache', position: { x: 4, y: 0 }, level: 1, placedAt: 1 },
    { id: 'g3', definitionId: 'stone_age_food_cache', position: { x: 6, y: 0 }, level: 1, placedAt: 1 },
    { id: 'g4', definitionId: 'stone_age_food_cache', position: { x: 0, y: 4 }, level: 1, placedAt: 1 },
    { id: 'c1', definitionId: 'stone_age_campfire', position: { x: 7, y: 3 }, level: 1, placedAt: 1 },
  ];

  const catalogEn = renderLocale(
    'en',
    React.createElement(BuildingCatalogPanel, {
      isOpen: true,
      onClose: () => {},
      playerLevel: 6,
      playerCoins: 1000,
      lifetimeFocusMinutes: 500,
      placedBuildings,
      onSelectBuilding: () => {},
    })
  );
  assert.ok(catalogEn.includes('data-testid="catalog-economy-cap"'));
  // Per-building Build Limit: Foraging Post 1/4 vs Granary 4/4
  assert.ok(catalogEn.includes('Build Limit: 1/4'));
  assert.ok(catalogEn.includes('Build Limit: 4/4'));
  assert.ok(catalogEn.includes('Limit 4/4'));
  // Non-upgradeable buildings show Can't Upgrade instead of Max Lv. 3; Economy still shows Max Lv. 5
  assert.ok(catalogEn.includes('Can&#x27;t Upgrade') || catalogEn.includes("Can't Upgrade"));
  assert.ok(!catalogEn.includes('Max Lv. 3'));
  assert.ok(catalogEn.includes('Max Lv. 5'));

  const catalogVi = renderLocale(
    'vi',
    React.createElement(BuildingCatalogPanel, {
      isOpen: true,
      onClose: () => {},
      playerLevel: 6,
      playerCoins: 1000,
      lifetimeFocusMinutes: 500,
      placedBuildings,
      onSelectBuilding: () => {},
    })
  );
  assert.ok(catalogVi.includes('Giới hạn xây dựng: 1/4'));
  assert.ok(catalogVi.includes('Giới hạn xây dựng: 4/4'));
  assert.ok(catalogVi.includes('Giới hạn 4/4'));
  assert.ok(catalogVi.includes('Không thể nâng cấp'));
  assert.ok(!catalogVi.includes('Tối đa Lv. 3'));
  assert.ok(catalogVi.includes('Tối đa Lv. 5'));

  // MapGridView renders level badges on upgraded buildings
  const baseCiv = createInitialCivilizationState();
  const mapHtml = renderLocale(
    'en',
    React.createElement(MapGridView, {
      civilizationState: {
        ...baseCiv,
        buildings: placedBuildings,
      },
      placementDef: null,
      onPlaceBuilding: () => {},
      onInspectBuilding: () => {},
    })
  );
  assert.ok(mapHtml.includes('data-building-level-badge="2"'));
  assert.ok(mapHtml.includes('data-building-level-badge="3"'));
  assert.ok(mapHtml.includes('Lv.2'));
  assert.ok(mapHtml.includes('Lv.3'));

  // ErrorTranslator sanity across Stage 5C-1 error codes
  const errEn = localizeErrorMessage('en', '', 'UPGRADE_PLAYER_LEVEL_REQUIRED', {
    buildingName: 'Foraging Post',
    requiredLevel: 4,
    currentLevel: 3,
  });
  const errVi = localizeErrorMessage('vi', '', 'UPGRADE_PLAYER_LEVEL_REQUIRED', {
    buildingName: 'Foraging Post',
    requiredLevel: 4,
    currentLevel: 3,
  });
  assert.ok(errEn.includes('Player Level 4'));
  assert.ok(errVi.includes('Trạm Hái lượm'));
  assert.ok(errVi.includes('Player Level 4'));
});
