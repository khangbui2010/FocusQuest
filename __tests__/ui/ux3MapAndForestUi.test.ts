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

import {
  buildTerrainBitmapPlan,
  renderTerrainBitmap,
  TerrainCanvasContext2D,
} from '../../src/ui/components/civilization/terrainBitmapRenderer.ts';

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

test('UX-3 + UX-5: Locked forest cells render ground -> tree -> dark scrim uniformly into MapGridView bitmap & TerrainCellLayers', () => {
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

  // UX-5: MapGridView uses a single terrain bitmap canvas (zero per-cell TileImage DOM layers)
  assert.ok(mapHtml.includes('data-testid="map-terrain-bitmap"'));
  assert.equal(mapHtml.includes('<img'), false);

  // Locate a locked forest cell & clearing cell inside the margin and verify canvas draw order:
  // baseTile drawImage -> overlayTile drawImage -> dark scrim fillRect(0.44)
  let treeCell: { x: number; y: number; col: number; row: number } | null = null;
  let clearingCell: { x: number; y: number; col: number; row: number } | null = null;
  for (let y = -8; y < 16 && (!treeCell || !clearingCell); y++) {
    for (let x = -8; x < 16 && (!treeCell || !clearingCell); x++) {
      if (x >= 0 && x < 8 && y >= 0 && y < 8) continue;
      const decor = getCellDecor(x, y, false, TERRAIN_DECOR_SEED);
      if (decor.overlayTile !== null && !treeCell) treeCell = { x, y, col: x + 8, row: y + 8 };
      if (decor.overlayTile === null && !clearingCell) clearingCell = { x, y, col: x + 8, row: y + 8 };
    }
  }
  assert.ok(treeCell, 'Expected at least one locked forest tree cell in margin');
  assert.ok(clearingCell, 'Expected at least one locked forest clearing cell in margin');

  const ops: Array<{ op: 'drawImage' | 'fillRect'; dx: number; dy: number; alpha: number }> = [];
  const fakeCtx: TerrainCanvasContext2D = {
    imageSmoothingEnabled: true,
    fillStyle: '',
    globalAlpha: 1,
    drawImage(_img, _sx, _sy, _sw, _sh, dx, dy) {
      ops.push({ op: 'drawImage', dx, dy, alpha: fakeCtx.globalAlpha });
    },
    fillRect(x, y) {
      ops.push({ op: 'fillRect', dx: x, dy: y, alpha: fakeCtx.globalAlpha });
    },
  };
  const plan = buildTerrainBitmapPlan({
    minX: -8,
    minY: -8,
    cols: 24,
    rows: 24,
    seed: TERRAIN_DECOR_SEED,
    isCellUnlocked: (cx, cy) => cx >= 0 && cx < 8 && cy >= 0 && cy < 8,
  });
  renderTerrainBitmap(fakeCtx, plan, {});

  const treeOps = ops.filter((o) => o.dx === treeCell!.col * 16 && o.dy === treeCell!.row * 16);
  assert.equal(treeOps.length, 3, 'Locked tree cell must execute base drawImage -> tree drawImage -> scrim fillRect');
  assert.equal(treeOps[0].op, 'drawImage');
  assert.equal(treeOps[1].op, 'drawImage');
  assert.equal(treeOps[2].op, 'fillRect');
  assert.equal(treeOps[2].alpha, LOCKED_FOREST_DARKEN_OPACITY);

  const clearingOps = ops.filter((o) => o.dx === clearingCell!.col * 16 && o.dy === clearingCell!.row * 16);
  assert.equal(clearingOps.length, 2, 'Locked clearing cell must execute base drawImage -> scrim fillRect');
  assert.equal(clearingOps[0].op, 'drawImage');
  assert.equal(clearingOps[1].op, 'fillRect');
  assert.equal(clearingOps[1].alpha, LOCKED_FOREST_DARKEN_OPACITY);

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
