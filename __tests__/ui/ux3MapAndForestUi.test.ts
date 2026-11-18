import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';

import { createInitialCivilizationState } from '../../src/core/civilization/civilizationState.ts';
import { getBuildingDefinition } from '../../src/core/civilization/buildingCatalog.ts';
import {
  MapGridView,
  CELL_SIZE,
  computeExpansionFitZoom,
  snapZoomToIntegerPixels,
} from '../../src/ui/components/civilization/MapGridView.tsx';
import { SpriteGallery } from '../../src/ui/components/civilization/SpriteGallery.tsx';
import { TerrainCellLayers } from '../../src/ui/components/civilization/TerrainCellLayers.tsx';
import {
  LOCKED_FOREST_DARKEN_OPACITY,
  LOCKED_FOREST_OVERLAY_OPACITY,
  LOCKED_TREE_DARKEN_FACTOR,
  TERRAIN_DECOR_SEED,
  computeLockedForestOpacities,
  getCellDecor,
} from '../../src/ui/components/civilization/terrainDecor.ts';

function extractCellSlice(html: string, coord: string): string {
  const start = html.indexOf(`data-cell-coord="${coord}"`);
  assert.ok(start > -1, `Expected cell ${coord} to exist in rendered HTML`);
  const nextCell = html.indexOf('data-cell-coord="', start + 20);
  const nextSection = html.indexOf('<!--', start + 20);
  let end = html.length;
  if (nextCell !== -1) end = Math.min(end, nextCell);
  if (nextSection !== -1) end = Math.min(end, nextSection);
  return html.slice(start, Math.min(end, start + 1400));
}

test('UX-3: Locked forest cells render ground -> tree -> dark scrim using shared opacity & tunable tree factor', () => {
  assert.equal(LOCKED_FOREST_DARKEN_OPACITY, 0.44);
  assert.equal(LOCKED_FOREST_OVERLAY_OPACITY, LOCKED_FOREST_DARKEN_OPACITY);
  assert.equal(LOCKED_TREE_DARKEN_FACTOR, 1.0);

  const state = createInitialCivilizationState();
  const mapHtml = renderToString(
    React.createElement(MapGridView, {
      civilizationState: state,
      placementDef: null,
      onPlaceBuilding: () => {},
      onInspectBuilding: () => {},
    })
  );

  // Locate a locked forest cell inside the margin that definitely has a tree overlay
  let treeCoord: string | null = null;
  let clearingCoord: string | null = null;
  for (let y = -8; y < 16 && (!treeCoord || !clearingCoord); y++) {
    for (let x = -8; x < 16 && (!treeCoord || !clearingCoord); x++) {
      if (x >= 0 && x < 8 && y >= 0 && y < 8) continue;
      const decor = getCellDecor(x, y, false, TERRAIN_DECOR_SEED);
      if (decor.overlayTile !== null && !treeCoord) treeCoord = `${x},${y}`;
      if (decor.overlayTile === null && !clearingCoord) clearingCoord = `${x},${y}`;
    }
  }
  assert.ok(treeCoord, 'Expected at least one locked forest tree cell in margin');
  assert.ok(clearingCoord, 'Expected at least one locked forest clearing cell in margin');

  const treeSlice = extractCellSlice(mapHtml, treeCoord);
  const firstTileIdx = treeSlice.indexOf('data-tile-index="');
  const secondTileIdx = treeSlice.indexOf('data-tile-index="', firstTileIdx + 16);
  const scrimIdx = treeSlice.indexOf('data-locked-forest="true"');
  assert.ok(firstTileIdx > -1, 'Tree cell must render ground baseTile');
  assert.ok(secondTileIdx > firstTileIdx, 'Tree cell must render tree overlayTile after baseTile');
  assert.ok(scrimIdx > secondTileIdx, 'Dark scrim must render AFTER tree overlayTile');
  assert.ok(
    treeSlice.includes(`opacity:${LOCKED_FOREST_DARKEN_OPACITY}`),
    `Dark scrim must use LOCKED_FOREST_DARKEN_OPACITY (${LOCKED_FOREST_DARKEN_OPACITY})`
  );

  const clearingSlice = extractCellSlice(mapHtml, clearingCoord);
  const clearingBaseIdx = clearingSlice.indexOf('data-tile-index="');
  const clearingScrimIdx = clearingSlice.indexOf('data-locked-forest="true"');
  assert.ok(clearingScrimIdx > clearingBaseIdx);
  assert.ok(clearingSlice.includes(`opacity:${LOCKED_FOREST_DARKEN_OPACITY}`));

  // Tuning tree factor (e.g. 0.7) works purely via constant/prop without structural rewrite
  const tunedOps = computeLockedForestOpacities(true, 0.44, 0.7);
  assert.equal(tunedOps.topScrimOpacity, 0.308);
  assert.ok(tunedOps.groundUnderOverlayOpacity > 0);
  const effectiveGround =
    1 - (1 - tunedOps.groundUnderOverlayOpacity) * (1 - tunedOps.topScrimOpacity);
  assert.ok(Math.abs(effectiveGround - 0.44) < 0.001, 'Ground must retain 0.44 darkening around tree');

  const tunedHtml = renderToString(
    React.createElement(TerrainCellLayers, {
      baseTile: 0,
      overlayTile: 4,
      isDarkened: true,
      size: CELL_SIZE,
      darkenOpacity: 0.44,
      treeDarkenFactor: 0.7,
    })
  );
  const tunedBase = tunedHtml.indexOf('data-tile-index="0"');
  const tunedComp = tunedHtml.indexOf('data-locked-ground-compensation="true"');
  const tunedTree = tunedHtml.indexOf('data-tile-index="4"');
  const tunedTop = tunedHtml.indexOf('data-locked-forest="true"');
  assert.ok(tunedBase < tunedComp && tunedComp < tunedTree && tunedTree < tunedTop);
  assert.ok(tunedHtml.includes('opacity:0.308'));
});

test('UX-3: Unlocked cells remove idle grid borders while preserving hover, placement ghost, buildings, expansion mode, and integer-pixel zoom', () => {
  const campfire = getBuildingDefinition('stone_age_campfire')!;
  const state = {
    ...createInitialCivilizationState(),
    buildings: [
      {
        id: 'b_ux3_1',
        definitionId: 'stone_age_campfire',
        position: { x: 2, y: 2 },
        level: 1,
        placedAt: 1700000000000,
      },
    ],
  };

  // 1. Idle mode: no border-[0.5px] / border-emerald-950 / border-slate-900 / gap / divide / outline / ring on unlocked cells
  const idleHtml = renderToString(
    React.createElement(MapGridView, {
      civilizationState: state,
      placementDef: null,
      onPlaceBuilding: () => {},
      onInspectBuilding: () => {},
    })
  );
  assert.equal(idleHtml.includes('border-[0.5px]'), false, 'Unlocked cells must not render border-[0.5px]');
  assert.equal(idleHtml.includes('border-emerald-950'), false, 'Unlocked cells must not render emerald cell grid lines');
  assert.equal(idleHtml.includes('border-slate-900'), false, 'Unlocked cells must not render slate cell grid lines');
  assert.equal(idleHtml.includes('divide-'), false);

  const unlockedCellSlice = extractCellSlice(idleHtml, '0,0');
  assert.ok(unlockedCellSlice.includes('data-unlocked="true"'));
  assert.ok(unlockedCellSlice.includes('border-0'), 'Unlocked cell must explicitly use border-0');
  assert.ok(!unlockedCellSlice.includes('ring-'), 'Unlocked cell must not carry idle ring');
  assert.ok(!unlockedCellSlice.includes('outline'), 'Unlocked cell must not carry idle outline');

  // Buildings & map controls remain intact
  assert.ok(idleHtml.includes('data-sprite-id="stone_age_campfire"'));
  assert.ok(idleHtml.includes('map-controls-toolbar'));

  // 2. Placement mode: unlocked cell still has hover highlight & crosshair without border-[0.5px]
  const placementHtml = renderToString(
    React.createElement(MapGridView, {
      civilizationState: state,
      placementDef: campfire,
      onPlaceBuilding: () => {},
      onInspectBuilding: () => {},
    })
  );
  assert.equal(placementHtml.includes('border-[0.5px]'), false);
  const placementCellSlice = extractCellSlice(placementHtml, '1,1');
  assert.ok(placementCellSlice.includes('border-0'));
  assert.ok(placementCellSlice.includes('hover:after:bg-emerald-300/35'));
  assert.ok(placementCellSlice.includes('cursor-crosshair'));

  // 3. Expansion mode: candidate chunks & borders stay intact and zoom is integer-pixel aligned
  const expandHtml = renderToString(
    React.createElement(MapGridView, {
      civilizationState: state,
      placementDef: null,
      onPlaceBuilding: () => {},
      onInspectBuilding: () => {},
      isExpansionMode: true,
      selectedExpansionOrigin: { x: 8, y: 0 },
      onSelectExpansionSlot: () => {},
    })
  );
  assert.ok(expandHtml.includes('data-expansion-candidate="8,0"'));
  assert.ok(expandHtml.includes('border-amber-300'));
  assert.ok(expandHtml.includes('border-emerald-300/90'));

  // 4. Integer-pixel cell sizes across ALL zoom steps & expansion auto-fit widths + pixelated rendering
  assert.ok(idleHtml.includes('image-rendering:pixelated'));
  for (const rawZoom of [0.35, 0.375, 0.44, 0.5, 0.6, 0.75, 0.8, 1.0, 1.2, 1.25, 1.5, 1.75, 2.0]) {
    const snapped = snapZoomToIntegerPixels(rawZoom, 0.375);
    assert.equal(Number.isInteger(CELL_SIZE * snapped), true, `CELL_SIZE * ${snapped} must be integer`);
    assert.equal(Number.isInteger(16 * snapped), true, `16 * ${snapped} must be integer`);
  }
  for (const [mapPx, vw, vh] of [
    [768, 360, 420],
    [896, 360, 420],
    [1024, 400, 460],
  ] as const) {
    const fit = computeExpansionFitZoom(mapPx, mapPx, vw, vh);
    assert.equal(Number.isInteger(CELL_SIZE * fit), true, `Fit zoom ${fit} must yield integer cell px`);
    assert.equal(Number.isInteger(16 * fit), true, `Fit zoom ${fit} must yield integer 16px tile size`);
  }
});

test('UX-3: SpriteGallery (#sprites) matches unified darkening layer order & updated captions', () => {
  const galleryHtml = renderToString(React.createElement(SpriteGallery));

  // No stale "trees stay full color" / "trees stay 100% color" / "Locked Floor Darkened" captions
  assert.equal(galleryHtml.includes('trees stay full color'), false);
  assert.equal(galleryHtml.includes('trees stay 100% color'), false);
  assert.equal(galleryHtml.includes('Locked Floor Darkened'), false);
  assert.ok(galleryHtml.includes('Locked Forest Darkened (2×)'));
  assert.ok(galleryHtml.includes('Ground &amp; trees darkened'));

  // In M1 canopy darkened block, tree #3 appears BEFORE dark scrim
  const m1Start = galleryHtml.indexOf('data-testid="gallery-canopy-tall_1x2_orange"');
  assert.ok(m1Start > -1);
  const darkSectionStart = galleryHtml.indexOf('Locked Forest Darkened (2×)', m1Start);
  assert.ok(darkSectionStart > m1Start);
  const darkBlock = galleryHtml.slice(darkSectionStart, darkSectionStart + 1600);
  const baseTilePos = darkBlock.indexOf('data-tile-index="0"');
  const treeTilePos = darkBlock.indexOf('data-tile-index="3"');
  const scrimPos = darkBlock.indexOf('data-locked-forest="true"');
  assert.ok(baseTilePos > -1 && treeTilePos > baseTilePos, 'Gallery darkened M1 must render ground then tree #3');
  assert.ok(scrimPos > treeTilePos, 'Gallery darkened M1 must render dark scrim AFTER tree #3');
  assert.ok(darkBlock.includes(`opacity:${LOCKED_FOREST_DARKEN_OPACITY}`));

  // In 16x11 algorithm preview, verify a cell with tree overlay renders ground -> tree -> scrim
  const preview16Start = galleryHtml.indexOf('data-testid="gallery-locked_forest_16x11"');
  assert.ok(preview16Start > -1);
  const preview16Slice = galleryHtml.slice(preview16Start);
  const firstScrim = preview16Slice.indexOf('data-locked-forest="true"');
  assert.ok(firstScrim > -1);
  assert.ok(preview16Slice.includes(`opacity:${LOCKED_FOREST_DARKEN_OPACITY}`));
});
