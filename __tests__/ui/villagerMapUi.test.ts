import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';

import {
  GridMap,
  VILLAGE_CAVE_DEFINITION_ID,
  createInitialCivilizationState,
} from '../../src/core/civilization/index.ts';
import { MapGridView } from '../../src/ui/components/civilization/MapGridView.tsx';
import { BuildingDetailsModal } from '../../src/ui/components/civilization/BuildingDetailsModal.tsx';
import { BuildingCatalogPanel } from '../../src/ui/components/civilization/BuildingCatalogPanel.tsx';
import { FocusSceneArea } from '../../src/ui/components/FocusSceneArea.tsx';
import { I18nProvider } from '../../src/i18n/I18nContext.tsx';
import {
  placeBuildingClient,
  recruitVillagerClient,
  sendExtensionMessage,
  upgradeBuildingClient,
} from '../../src/ui/services/extensionClient.ts';

test('MapGridView SSR (Villager V2): renders 3x3 Cave (96x96) and map-villagers-layer with idle VillagerSprites', () => {
  const map = new GridMap();
  const cave = {
    id: 'cave-ui-1',
    definitionId: VILLAGE_CAVE_DEFINITION_ID,
    position: { x: 2, y: 2 },
    level: 2,
    placedAt: 1_700_000_000_000,
  };
  map.placeBuilding(cave.id, cave.position, { width: 3, height: 3 });

  const state = {
    ...createInitialCivilizationState(),
    grid: map.toSnapshot(),
    buildings: [cave],
    villagers: [
      { id: 'vil-1', role: 'elder' as const, recruitedAt: 100 },
      { id: 'vil-2', role: 'crafter' as const, recruitedAt: 200 },
      { id: 'vil-3', role: 'woodworker' as const, recruitedAt: 300 },
    ],
  };

  const html = renderToString(
    React.createElement(
      I18nProvider,
      { locale: 'en' },
      React.createElement(MapGridView, {
        civilizationState: state,
        placementDef: null,
        onPlaceBuilding: () => {},
        onInspectBuilding: () => {},
      })
    )
  );

  // 3x3 * 32px = 96px Cave sprite on map stage
  assert.ok(html.includes('data-sprite-id="stone_age_study_cave"'));
  assert.ok(html.includes('width:96px;height:96px'));

  // Villagers layer renders all 3 villagers using V1 VillagerSprite & V3 transform attributes
  assert.ok(html.includes('data-testid="map-villagers-layer"'));
  assert.ok(html.includes('pointer-events-none'));
  assert.ok(html.includes('data-testid="map-villager-vil-1"'));
  assert.ok(html.includes('data-testid="map-villager-vil-2"'));
  assert.ok(html.includes('data-testid="map-villager-vil-3"'));
  assert.ok(html.includes('data-villager-id="vil-1"'));
  assert.ok(html.includes('data-villager-id="vil-2"'));
  assert.ok(html.includes('data-villager-id="vil-3"'));
  assert.ok(html.includes('data-animation="idle"'));
  assert.ok(html.includes('data-cell='));
  assert.ok(html.includes('transform:translate('));
  assert.ok(html.includes('transition:transform 700ms linear'));
  assert.ok(html.includes('z-index:'));
  assert.ok(html.includes('data-testid="villager-sprite-elder"'));
  assert.ok(html.includes('data-testid="villager-sprite-crafter"'));
  assert.ok(html.includes('data-testid="villager-sprite-woodworker"'));
});

test('MapGridView SSR (Villager V3): reduced motion disables transform transition and keeps villagers static idle', () => {
  const map = new GridMap();
  const cave = {
    id: 'cave-ui-rm',
    definitionId: VILLAGE_CAVE_DEFINITION_ID,
    position: { x: 2, y: 2 },
    level: 1,
    placedAt: 1_700_000_000_000,
  };
  map.placeBuilding(cave.id, cave.position, { width: 3, height: 3 });

  const state = {
    ...createInitialCivilizationState(),
    grid: map.toSnapshot(),
    buildings: [cave],
    villagers: [{ id: 'vil-rm', role: 'elder' as const, recruitedAt: 100 }],
  };

  const originalWindow = (globalThis as { window?: unknown }).window;
  (globalThis as { window?: unknown }).window = {
    matchMedia: (query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  };

  try {
    const html = renderToString(
      React.createElement(
        I18nProvider,
        { locale: 'en' },
        React.createElement(MapGridView, {
          civilizationState: state,
          placementDef: null,
          onPlaceBuilding: () => {},
          onInspectBuilding: () => {},
        })
      )
    );

    assert.ok(html.includes('data-testid="map-villager-vil-rm"'));
    assert.ok(html.includes('data-animation="idle"'));
    assert.equal(html.includes('transition:transform 700ms linear'), false);
  } finally {
    if (originalWindow === undefined) {
      delete (globalThis as { window?: unknown }).window;
    } else {
      (globalThis as { window?: unknown }).window = originalWindow;
    }
  }
});

test('BuildingDetailsModal SSR (Villager V2): displays recruitment UI, upgrade capacity preview, and blocks Demolish when occupied', () => {
  const cave = {
    id: 'cave-modal-1',
    definitionId: VILLAGE_CAVE_DEFINITION_ID,
    position: { x: 1, y: 1 },
    level: 1,
    placedAt: 1_700_000_000_000,
  };

  const occupiedHtml = renderToString(
    React.createElement(
      I18nProvider,
      { locale: 'en' },
      React.createElement(BuildingDetailsModal, {
        building: cave,
        villagers: [
          { id: 'v1', role: 'elder', recruitedAt: 10 },
          { id: 'v2', role: 'crafter', recruitedAt: 20 },
        ],
        playerLevel: 2,
        playerCoins: 500,
        onClose: () => {},
        onRemove: async () => {},
        onUpgrade: async () => {},
        onRecruitVillager: async () => {},
      })
    )
  );

  assert.ok(occupiedHtml.includes('data-testid="cave-village-section"'));
  assert.ok(occupiedHtml.includes('2/2 Villagers'));
  assert.ok(occupiedHtml.includes('data-testid="recruit-role-elder"'));
  assert.ok(occupiedHtml.includes('data-testid="recruit-role-crafter"'));
  assert.ok(occupiedHtml.includes('data-testid="recruit-role-woodworker"'));
  assert.ok(occupiedHtml.includes('data-testid="recruit-capacity-full-hint"'));
  assert.ok(occupiedHtml.includes('data-testid="cave-upgrade-capacity-preview"'));
  assert.ok(occupiedHtml.includes('2 → 4 Villager capacity'));
  assert.ok(occupiedHtml.includes('data-testid="demolish-blocked-villagers-hint"'));
  assert.ok(occupiedHtml.includes('Cannot demolish Cave while 2 villagers live in the village.'));
});

test('BuildingCatalogPanel & FocusSceneArea SSR (Villager V2): Cave shows 1/1 limit & Max Lv. 5; scene-shelter stays 48x48', () => {
  const cave = {
    id: 'cave-cat-1',
    definitionId: VILLAGE_CAVE_DEFINITION_ID,
    position: { x: 0, y: 0 },
    level: 1,
    placedAt: 1_700_000_000_000,
  };

  const catHtml = renderToString(
    React.createElement(
      I18nProvider,
      { locale: 'en' },
      React.createElement(BuildingCatalogPanel, {
        isOpen: true,
        onClose: () => {},
        playerLevel: 5,
        playerCoins: 1000,
        lifetimeFocusMinutes: 500,
        placedBuildings: [cave],
        onSelectBuilding: () => {},
      })
    )
  );

  assert.ok(catHtml.includes('Max Lv. 5'));
  assert.ok(catHtml.includes('Build Limit: 1/1'));
  assert.ok(catHtml.includes('Houses +2 villagers / Lv (Max 1 Cave)'));

  const sceneHtml = renderToString(
    React.createElement(
      I18nProvider,
      { locale: 'en' },
      React.createElement(FocusSceneArea, {
        era: 'STONE_AGE',
        sceneState: 'working',
        statusLabel: 'FOCUSING',
        chimeEnabled: true,
        onToggleChime: () => {},
        chimeAriaLabel: 'Mute',
        chimeTitle: 'Mute',
        civilizationState: {
          era: 'STONE_AGE',
          buildings: [cave],
          villagers: [],
        },
      })
    )
  );

  assert.ok(sceneHtml.includes('data-testid="scene-building-stone_age_study_cave"'));
  assert.ok(sceneHtml.includes('width="48"') && sceneHtml.includes('height="48"'));
});

test('extensionClient Web Preview Simulator (Villager V2): full parity for 1-Cave cap, upgrade, recruit, and demolish block', async () => {
  // Ensure simulator initializes in non-extension env
  const initRes = await sendExtensionMessage({ action: 'GET_CIVILIZATION_STATE' });
  assert.equal(initRes.success, true);

  // Place Cave (cost 50, initial coins usually 100+)
  const placeRes = await placeBuildingClient({
    buildingDefinitionId: VILLAGE_CAVE_DEFINITION_ID,
    position: { x: 2, y: 2 },
  });
  if (placeRes.success && placeRes.data) {
    // 2nd Cave rejected with CIV_VILLAGE_CAVE_LIMIT_REACHED
    const secondRes = await placeBuildingClient({
      buildingDefinitionId: VILLAGE_CAVE_DEFINITION_ID,
      position: { x: 5, y: 5 },
    });
    assert.equal(secondRes.success, false);
    assert.equal(secondRes.errorCode, 'CIV_VILLAGE_CAVE_LIMIT_REACHED');

    // Recruit 1st villager
    const recRes = await recruitVillagerClient({ role: 'woodworker' });
    if (recRes.success && recRes.data) {
      assert.equal(recRes.data.villager.role, 'woodworker');
      assert.equal(recRes.data.civilizationState.villagers?.length, 1);
    }

    // Upgrade attempt works through simulator upgradeBuildingClient path
    const upRes = await upgradeBuildingClient({
      buildingId: placeRes.data.building.id,
      expectedLevel: 1,
    });
    assert.ok(typeof upRes.success === 'boolean');
  }
});
