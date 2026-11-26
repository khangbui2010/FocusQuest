import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';

import {
  getCivilizationStateClient,
  placeBuildingClient,
  removeBuildingClient,
  expandLandClient,
  seedMockCivilizationForTest,
  sendExtensionMessage,
} from '../../src/ui/services/extensionClient.ts';
import { CivilizationHeader } from '../../src/ui/components/civilization/CivilizationHeader.tsx';
import { BuildingCatalogPanel } from '../../src/ui/components/civilization/BuildingCatalogPanel.tsx';
import { BuildingDetailsModal } from '../../src/ui/components/civilization/BuildingDetailsModal.tsx';
import { LandExpansionModal } from '../../src/ui/components/civilization/LandExpansionModal.tsx';
import { CivilizationScreen } from '../../src/ui/components/civilization/CivilizationScreen.tsx';
import {
  MapGridView,
  getPlacementPreviewLabel,
} from '../../src/ui/components/civilization/MapGridView.tsx';
import { translate } from '../../src/i18n/translator.ts';
import { GridMap } from '../../src/core/civilization/gridMap.ts';
import { createInitialCivilizationState } from '../../src/core/civilization/civilizationState.ts';
import { getBuildingDefinition } from '../../src/core/civilization/buildingCatalog.ts';
import App from '../../src/App.tsx';

test('Civilization Client: getCivilizationState returns initial Stone Age state', async () => {
  const res = await getCivilizationStateClient();
  assert.equal(res.success, true);
  assert.ok(res.data);
  assert.equal(res.data.era, 'STONE_AGE');
  assert.equal(res.data.grid.chunks.length, 4);
  assert.ok(Array.isArray(res.data.buildings));
});

test('Civilization Client: placeBuildingClient validates placement, deducts coins and updates grid', async () => {
  // 1. Place campfire (4 coins, 1x1 footprint) at (2, 2)
  const placeRes = await placeBuildingClient({
    buildingDefinitionId: 'stone_age_campfire',
    position: { x: 2, y: 2 },
  });

  assert.equal(placeRes.success, true);
  assert.ok(placeRes.data);
  assert.equal(placeRes.data.building.definitionId, 'stone_age_campfire');
  assert.equal(placeRes.data.building.position.x, 2);
  assert.equal(placeRes.data.building.position.y, 2);
  assert.equal(placeRes.data.building.level, 1);

  const placedId = placeRes.data.building.id;

  // 2. Placing another building at (2, 2) must fail due to collision
  const collisionRes = await placeBuildingClient({
    buildingDefinitionId: 'stone_age_campfire',
    position: { x: 2, y: 2 },
  });
  assert.equal(collisionRes.success, false);
  assert.match(collisionRes.error || '', /Cannot place building/i);

  // 3. Placing out of bounds or outside territory must fail
  const oobRes = await placeBuildingClient({
    buildingDefinitionId: 'stone_age_campfire',
    position: { x: 50, y: 50 },
  });
  assert.equal(oobRes.success, false);

  // 4. Removing the building frees the cell and refunds 50% (2 Coins)
  const removeRes = await removeBuildingClient({
    buildingInstanceId: placedId,
  });
  assert.equal(removeRes.success, true);
  assert.equal(removeRes.data?.removedBuildingId, placedId);
  assert.equal(removeRes.data?.refundedCoins, 2);

  // 5. Placing at (2, 2) succeeds again now that cell is freed
  const replaceRes = await placeBuildingClient({
    buildingDefinitionId: 'stone_age_campfire',
    position: { x: 2, y: 2 },
  });
  assert.equal(replaceRes.success, true);

  // Cleanup for subsequent tests
  if (replaceRes.data) {
    await removeBuildingClient({ buildingInstanceId: replaceRes.data.building.id });
  }
});

test('Civilization Client: expandLandClient requires origin, deducts Coins, enforces Level gate, and rejects direction', async () => {
  const realDateNow = Date.now;
  let mockNow = 1732000000000;
  Date.now = () => mockNow;
  try {
    const baseState = (await getCivilizationStateClient()).data!;
    const gm = GridMap.fromSnapshot(baseState.grid);
    gm.placeBuilding('cave_cv_seed', { x: 4, y: 4 }, { width: 3, height: 3 });
    seedMockCivilizationForTest({
      ...baseState,
      grid: gm.toSnapshot(),
      buildings: [
        ...baseState.buildings,
        {
          id: 'cave_cv_seed',
          definitionId: 'stone_age_study_cave',
          position: { x: 4, y: 4 },
          level: 1,
          placedAt: 1,
        },
      ],
      villagers: [{ id: 'v_cv_seed', role: 'woodworker', recruitedAt: 1 }],
      founderRole: 'woodworker',
    });

    const initialChunks = baseState.grid.chunks.length;

    // Rejects deprecated direction payload
    const rejectedDir = await expandLandClient({
      direction: 'EAST',
    } as unknown as { origin: { x: number; y: number } });
    assert.equal(rejectedDir.success, false);

    // Expand adjacent East chunk (8, 0): k=1 requires Lv. 3, 2 crew, 60m clearing and costs 30 Coins
    // Note: use elder founder + elder villager so discountRate = 0 and exact baseCost 30 applies cleanly.
    seedMockCivilizationForTest({
      ...baseState,
      grid: gm.toSnapshot(),
      buildings: [
        ...baseState.buildings,
        {
          id: 'cave_cv_seed',
          definitionId: 'stone_age_study_cave',
          position: { x: 4, y: 4 },
          level: 1,
          placedAt: 1,
        },
      ],
      villagers: [{ id: 'v_cv_seed', role: 'elder', recruitedAt: 1 }],
      founderRole: 'elder',
    });

    const expandEast = await expandLandClient({ origin: { x: 8, y: 0 } });
    assert.equal(expandEast.success, true, `Expected expandEast success, got ${expandEast.error}`);
    assert.ok(expandEast.data);
    assert.equal(expandEast.data.cost, 30);
    assert.equal(expandEast.data.economy.focusCoins, 86);
    assert.equal(expandEast.data.job?.kind, 'expand');
    assert.equal(expandEast.data.job?.status, 'ACTIVE');
    assert.equal(expandEast.data.civilizationState.grid.chunks.length, initialChunks);

    // Second expansion k=2 (0, -4) requires Lv. 4 while k=1 is clearing -> fails at Lv. 3 without deducting Coins
    const expandSecondBlocked = await expandLandClient({ origin: { x: 0, y: -4 } });
    assert.equal(expandSecondBlocked.success, false);
    assert.match(expandSecondBlocked.error || '', /Player Level 4/i);

    // Completing a 60m Focus session finishes clearing and unlocks chunk #5
    await sendExtensionMessage({
      action: 'START_SESSION',
      payload: { mode: 'COUNTDOWN', targetMinutes: 60, profileId: 'profile-study-research' },
    });
    mockNow += 61 * 60 * 1000;
    await sendExtensionMessage({ action: 'GET_SESSION_STATE' });
    await sendExtensionMessage({ action: 'RESET_SESSION' });

    const afterFocus = await getCivilizationStateClient();
    assert.equal(afterFocus.data?.grid.chunks.length, initialChunks + 1);
    assert.equal(afterFocus.data?.jobs?.length ?? 0, 0);
  } finally {
    Date.now = realDateNow;
  }
});

test('Civilization UI: CivilizationHeader renders Stone Age era, coins, focus, and bonus', () => {
  const html = renderToString(
    React.createElement(CivilizationHeader, {
      era: 'STONE_AGE',
      focusCoins: 150,
      lifetimeFocusMinutes: 75,
      activeBonusRate: 0.05,
      isPlacementMode: false,
      selectedBuildingDef: null,
      onCancelPlacement: () => {},
      onOpenCatalog: () => {},
      onOpenExpansion: () => {},
    })
  );

  assert.ok(html.includes('Stone Age'), 'must render era name');
  assert.ok(html.includes('75m'), 'must render lifetime focus minutes');
  assert.ok(html.includes('+5%'), 'must render active bonus percentage badge');
  assert.ok(html.includes('Build'), 'must render build button');
});

test('Civilization UI: CivilizationHeader in placement mode displays active banner and cancel button', () => {
  const campfireDef = getBuildingDefinition('stone_age_campfire')!;
  const html = renderToString(
    React.createElement(CivilizationHeader, {
      era: 'STONE_AGE',
      focusCoins: 150,
      lifetimeFocusMinutes: 75,
      activeBonusRate: 0,
      isPlacementMode: true,
      selectedBuildingDef: campfireDef,
      onCancelPlacement: () => {},
      onOpenCatalog: () => {},
      onOpenExpansion: () => {},
    })
  );

  assert.ok(html.includes('Placing'), 'must render placing banner');
  assert.ok(html.includes('Campfire'), 'must render building name');
  assert.ok(html.includes('Cancel (Esc)'), 'must render cancel button');
});

test('Civilization UI: CivilizationHeader in expansion mode displays active banner and hides placement banner', () => {
  const html = renderToString(
    React.createElement(CivilizationHeader, {
      era: 'STONE_AGE',
      focusCoins: 150,
      lifetimeFocusMinutes: 75,
      activeBonusRate: 0,
      isPlacementMode: false,
      selectedBuildingDef: null,
      onCancelPlacement: () => {},
      onOpenCatalog: () => {},
      onOpenExpansion: () => {},
      isExpansionMode: true,
      onCancelExpansion: () => {},
    })
  );

  assert.ok(html.includes('Territory Expansion Mode'), 'must render expansion mode banner');
  assert.ok(html.includes('Cancel (Esc)'), 'must render cancel esc button');
  assert.ok(!html.includes('Placing '), 'must remain mutually exclusive with placement banner');
});

test('Civilization UI: BuildingCatalogPanel renders definitions, costs, and unlock gates', () => {
  const html = renderToString(
    React.createElement(BuildingCatalogPanel, {
      isOpen: true,
      onClose: () => {},
      playerLevel: 1,
      playerCoins: 20,
      lifetimeFocusMinutes: 10,
      onSelectBuilding: () => {},
    })
  );

  assert.ok(html.includes('Building Catalog'), 'must render title');
  assert.ok(html.includes('Campfire'), 'must render campfire');
  assert.ok(html.includes('Standing Stone'), 'must render standing stone');
  assert.ok(html.includes('Rock Shelter'), 'must render rock shelter');
  assert.ok(html.includes('Foraging Post'), 'must render foraging post');
  assert.ok(html.includes('Primitive Granary'), 'must render primitive granary');
  // Granary requires Lv. 2, so at playerLevel 1 it should show Lv. 2 requirement
  assert.ok(html.includes('Lv. 2'), 'must show level unlock requirement');
  assert.ok(html.includes('Build Limit: 0/3'), 'must show 0/3 limit badge for Campfire/Totem');
  assert.ok(html.includes('Build Limit: 0/2'), 'must show 0/2 limit badge for Elder Hut');

  const cappedHtml = renderToString(
    React.createElement(BuildingCatalogPanel, {
      isOpen: true,
      onClose: () => {},
      playerLevel: 5,
      playerCoins: 500,
      lifetimeFocusMinutes: 500,
      placedBuildings: [
        { id: 'c1', definitionId: 'stone_age_campfire', position: { x: 0, y: 0 }, level: 1, placedAt: 1 },
        { id: 'c2', definitionId: 'stone_age_campfire', position: { x: 1, y: 0 }, level: 1, placedAt: 2 },
        { id: 'c3', definitionId: 'stone_age_campfire', position: { x: 2, y: 0 }, level: 1, placedAt: 3 },
        { id: 't1', definitionId: 'stone_age_totem', position: { x: 3, y: 0 }, level: 1, placedAt: 4 },
        { id: 't2', definitionId: 'stone_age_totem', position: { x: 4, y: 0 }, level: 1, placedAt: 5 },
        { id: 't3', definitionId: 'stone_age_totem', position: { x: 5, y: 0 }, level: 1, placedAt: 6 },
        { id: 'e1', definitionId: 'stone_age_elder_hut', position: { x: 0, y: 2 }, level: 1, placedAt: 7 },
        { id: 'e2', definitionId: 'stone_age_elder_hut', position: { x: 2, y: 2 }, level: 1, placedAt: 8 },
      ],
      onSelectBuilding: () => {},
    })
  );
  assert.ok(cappedHtml.includes('Build Limit: 3/3'));
  assert.ok(cappedHtml.includes('Build Limit: 2/2'));
  assert.ok(cappedHtml.includes('Limit 3/3'));
  assert.ok(cappedHtml.includes('Limit 2/2'));
});

test('Civilization UI: BuildingCatalogPanel returns null when isOpen is false', () => {
  const html = renderToString(
    React.createElement(BuildingCatalogPanel, {
      isOpen: false,
      onClose: () => {},
      playerLevel: 3,
      playerCoins: 500,
      lifetimeFocusMinutes: 300,
      onSelectBuilding: () => {},
    })
  );

  assert.equal(html, '');
});

test('Civilization UI: BuildingDetailsModal renders building information, Stage 5C-1 upgrade section and demolish action', () => {
  const htmlDecor = renderToString(
    React.createElement(BuildingDetailsModal, {
      building: {
        id: 'test_bld_1',
        definitionId: 'stone_age_campfire',
        position: { x: 3, y: 4 },
        level: 1,
        placedAt: 1700000000000,
      },
      onClose: () => {},
      onRemove: async () => {},
      onUpgrade: async () => {},
      playerLevel: 5,
      playerCoins: 500,
      isSubmitting: false,
    })
  );

  assert.ok(htmlDecor.includes('Campfire'), 'must display building name');
  assert.ok(htmlDecor.includes('(3, 4)'), 'must display position');
  assert.ok(htmlDecor.includes('Demolish Building'), 'must display demolish action');
  assert.ok(htmlDecor.includes('Fixed effect · Cannot be upgraded'), 'decorative building must remain non-upgradeable');
  assert.ok(
    htmlDecor.includes('Can&#x27;t Upgrade') || htmlDecor.includes("Can't Upgrade"),
    'decorative upgrade button must show Can\'t Upgrade'
  );

  const htmlEcon = renderToString(
    React.createElement(BuildingDetailsModal, {
      building: {
        id: 'test_bld_econ',
        definitionId: 'stone_age_foraging_post',
        position: { x: 0, y: 0 },
        level: 1,
        placedAt: 1700000000000,
      },
      onClose: () => {},
      onRemove: async () => {},
      onUpgrade: async () => {},
      playerLevel: 2,
      playerCoins: 150,
      founderRole: 'crafter',
      isSubmitting: false,
    })
  );

  assert.ok(htmlEcon.includes('Next Lv. 2 · Cost: 24 Coins'), 'must display next level and cost');
  assert.ok(htmlEcon.includes('+2% → +4% CoinBonus'), 'must preview CoinBonus delta');
  assert.ok(htmlEcon.includes('>Upgrade<'), 'must display enabled Upgrade button');
});

test('Civilization UI: LandExpansionModal renders chunk confirmation details (cost, level, crew, balance, focus minutes) without compass', () => {
  const htmlReady = renderToString(
    React.createElement(LandExpansionModal, {
      isOpen: true,
      selectedOrigin: { x: 8, y: 0 },
      chunksCount: 4,
      playerLevel: 3,
      playerCoins: 120,
      villagers: [{ id: 'v1', role: 'elder', recruitedAt: 1 }],
      founderRole: 'crafter',
      onConfirm: async () => {},
      onClose: () => {},
      isSubmitting: false,
    })
  );

  assert.ok(htmlReady.includes('Confirm Land Expansion'), 'must render confirmation title');
  assert.ok(htmlReady.includes('(8, 0)'), 'must render chosen chunk origin');
  assert.ok(htmlReady.includes('New Chunk #1'), 'must render purchase order');
  assert.ok(htmlReady.includes('+16 cells (4×4)'), 'must render +16 cells 4x4 delta');
  assert.ok(htmlReady.includes('30 Coins'), 'must render Coins cost');
  assert.ok(htmlReady.includes('20m focus at ×1.0 / 8m at ×2.5'), 'must render equivalent focus minutes');
  assert.ok(htmlReady.includes('2 crew · 60m Focus'), 'must render clearing crew and focus time');
  assert.ok(htmlReady.includes('Lv. 3'), 'must render required level');
  assert.ok(htmlReady.includes('Current: Lv. 3'), 'must render current player level');
  assert.ok(htmlReady.includes('120 Coins'), 'must render current Coins balance');
  assert.ok(htmlReady.includes('Expand'), 'must render Expand button');
  assert.ok(!htmlReady.includes('disabled=""[^>]*>Expand'), 'Expand button must be enabled when level, coins, and crew met');
  assert.ok(htmlReady.includes('Cancel'), 'must render Cancel button');
  assert.ok(!htmlReady.includes('>North<') && !htmlReady.includes('>South<') && !htmlReady.includes('>East<') && !htmlReady.includes('>West<'), 'must not render 4-way directional compass');

  // Level too low disables Expand button and shows level reason
  const htmlLowLevel = renderToString(
    React.createElement(LandExpansionModal, {
      isOpen: true,
      selectedOrigin: { x: 8, y: 0 },
      chunksCount: 4,
      playerLevel: 2,
      playerCoins: 500,
      villagers: [{ id: 'v1', role: 'elder', recruitedAt: 1 }],
      founderRole: 'crafter',
      onConfirm: async () => {},
      onClose: () => {},
      isSubmitting: false,
    })
  );
  assert.ok(htmlLowLevel.includes('Requires Player Level 3 (current: Lv. 2).'));
  assert.match(htmlLowLevel, /disabled=""[^>]*>Expand<\/button>/);

  // Insufficient Coins disables Expand button and shows Coins reason
  const htmlLowCoins = renderToString(
    React.createElement(LandExpansionModal, {
      isOpen: true,
      selectedOrigin: { x: 8, y: 0 },
      chunksCount: 4,
      playerLevel: 3,
      playerCoins: 25,
      villagers: [{ id: 'v1', role: 'elder', recruitedAt: 1 }],
      founderRole: 'crafter',
      onConfirm: async () => {},
      onClose: () => {},
      isSubmitting: false,
    })
  );
  assert.ok(htmlLowCoins.includes('Insufficient Coins: need 30, have 25.'));
  assert.match(htmlLowCoins, /disabled=""[^>]*>Expand<\/button>/);

  // Insufficient villagers disables Expand button and shows crew reason
  const htmlLowCrew = renderToString(
    React.createElement(LandExpansionModal, {
      isOpen: true,
      selectedOrigin: { x: 8, y: 0 },
      chunksCount: 4,
      playerLevel: 3,
      playerCoins: 120,
      villagers: [],
      founderRole: 'crafter',
      onConfirm: async () => {},
      onClose: () => {},
      isSubmitting: false,
    })
  );
  assert.ok(htmlLowCrew.includes('Requires 2 villagers (have 1).'));
  assert.match(htmlLowCrew, /disabled=""[^>]*>Expand<\/button>/);
});

test('Civilization UI: MapGridView renders 8x8 unlocked chunks, darkened locked forest margin, and zoom controls', () => {
  const state = createInitialCivilizationState();
  const html = renderToString(
    React.createElement(MapGridView, {
      civilizationState: state,
      placementDef: null,
      onPlaceBuilding: () => {},
      onInspectBuilding: () => {},
      isSubmitting: false,
    })
  );

  assert.ok(html.includes('100%'), 'must render default camera zoom indicator');
  assert.ok(html.includes('title="Zoom In"'), 'must render zoom in control');
  assert.ok(html.includes('title="Zoom Out"'), 'must render zoom out control');
  assert.ok(html.includes('data-render-width="24"'), 'must include 2-chunk (8-cell) forest border around 8x8 grid');
  assert.ok(html.includes('data-render-height="24"'), 'must include 2-chunk (8-cell) forest border around 8x8 grid');
  assert.ok(html.includes('data-testid="map-terrain-bitmap"'), 'must render single composite terrain bitmap');
  assert.ok(html.includes('data-unlocked="false"'), 'must preserve locked border interaction cells');
  assert.ok(!html.includes('data-terrain-id='), 'must not render V1 entity terrain nodes');
  assert.ok(!html.includes('data-expansion-candidate='), 'must not render expansion candidates in normal mode');

  // Expansion mode keeps >=4-cell margin (24x24 with 2-chunk margin), preserves current zoom (100%), and shows exact adjacent candidate chunks
  const expectedSlots = GridMap.fromSnapshot(state.grid).getAvailableExpansionSlots();
  const htmlExpand = renderToString(
    React.createElement(MapGridView, {
      civilizationState: state,
      placementDef: null,
      onPlaceBuilding: () => {},
      onInspectBuilding: () => {},
      isSubmitting: false,
      isExpansionMode: true,
      selectedExpansionOrigin: { x: 8, y: 0 },
      onSelectExpansionSlot: () => {},
    })
  );

  assert.ok(htmlExpand.includes('data-expansion-mode="true"'), 'must flag expansion mode');
  assert.ok(htmlExpand.includes('data-render-width="24"'), 'expansion mode must pad >=4 cells around 8x8 grid');
  assert.ok(htmlExpand.includes('data-render-height="24"'), 'expansion mode must pad >=4 cells around 8x8 grid');
  assert.ok(htmlExpand.includes('>100%<'), 'UX-5.1 persistent camera must keep initial zoom (100%) on entering expansion mode');
  const candidateMatches = htmlExpand.match(/data-expansion-candidate="/g) ?? [];
  assert.equal(candidateMatches.length, expectedSlots.length, 'rendered candidate count must equal getAvailableExpansionSlots().length');

  // Verify V2 placement preview labels in EN and VI
  assert.equal(
    getPlacementPreviewLabel(false, 'OUT_OF_BOUNDS', (k, p) => translate('en', k, p)),
    '✕ Outside territory'
  );
  assert.equal(
    getPlacementPreviewLabel(false, 'CELL_OCCUPIED', (k, p) => translate('vi', k, p)),
    '✕ Đã có công trình'
  );
});

test('Civilization UI: Navbar includes Civ tab and App switches to Civilization view', () => {
  const html = renderToString(React.createElement(App));
  assert.ok(html.includes('Civ'), 'Navbar must include Civ tab');
});
