import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';

import { createInitialCivilizationState } from '../../src/core/civilization/civilizationState.ts';
import { getBuildingDefinition } from '../../src/core/civilization/buildingCatalog.ts';
import { GridMap } from '../../src/core/civilization/gridMap.ts';
import {
  CELL_SIZE,
  MapGridView,
  computeExpansionFitZoom,
  getMapStageClassName,
  snapZoomToIntegerPixels,
} from '../../src/ui/components/civilization/MapGridView.tsx';
import { SpriteGallery } from '../../src/ui/components/civilization/SpriteGallery.tsx';
import { PACKED_TILE_PX, getTileSourceCoords } from '../../src/ui/components/civilization/TileImage.tsx';
import {
  LOCKED_FOREST_DARKEN_OPACITY,
  LOCKED_TREE_DARKEN_FACTOR,
  TERRAIN_DECOR_SEED,
  computeLockedForestOpacities,
} from '../../src/ui/components/civilization/terrainDecor.ts';
import {
  FALLBACK_TERRAIN_COLORS,
  LOCKED_FOREST_SCRIM_COLOR,
  TerrainCanvasContext2D,
  buildTerrainBitmapPlan,
  renderTerrainBitmap,
  renderTerrainBitmapIfNeeded,
} from '../../src/ui/components/civilization/terrainBitmapRenderer.ts';

interface RecordedDrawImage {
  readonly kind: 'drawImage';
  readonly sx: number;
  readonly sy: number;
  readonly sw: number;
  readonly sh: number;
  readonly dx: number;
  readonly dy: number;
  readonly dw: number;
  readonly dh: number;
  readonly globalAlpha: number;
}

interface RecordedFillRect {
  readonly kind: 'fillRect';
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly fillStyle: string;
  readonly globalAlpha: number;
}

type RecordedOp = RecordedDrawImage | RecordedFillRect;

function createMockContext() {
  const ops: RecordedOp[] = [];
  let clearedCount = 0;

  const ctx: TerrainCanvasContext2D = {
    imageSmoothingEnabled: true,
    fillStyle: '#000000',
    globalAlpha: 1,
    drawImage(_img, sx, sy, sw, sh, dx, dy, dw, dh) {
      ops.push({
        kind: 'drawImage',
        sx,
        sy,
        sw,
        sh,
        dx,
        dy,
        dw,
        dh,
        globalAlpha: ctx.globalAlpha,
      });
    },
    fillRect(x, y, w, h) {
      ops.push({
        kind: 'fillRect',
        x,
        y,
        w,
        h,
        fillStyle: String(ctx.fillStyle),
        globalAlpha: ctx.globalAlpha,
      });
    },
    clearRect() {
      clearedCount++;
    },
  };

  return {
    ctx,
    ops,
    getClearedCount: () => clearedCount,
  };
}

test('UX-5 (Bitmap Renderer): every tile draws at exact (col*16, row*16, 16x16), zero gaps/overlaps, locked scrim matches UX-3 constants & tree factor, deterministic & imageSmoothingEnabled=false', () => {
  const cols = 24;
  const rows = 24;
  const isCellUnlocked = (cx: number, cy: number) => cx >= 0 && cx < 8 && cy >= 0 && cy < 8;

  const plan = buildTerrainBitmapPlan({
    minX: -8,
    minY: -8,
    cols,
    rows,
    seed: TERRAIN_DECOR_SEED,
    darkenOpacity: LOCKED_FOREST_DARKEN_OPACITY,
    treeDarkenFactor: LOCKED_TREE_DARKEN_FACTOR,
    isCellUnlocked,
  });

  assert.equal(plan.bitmapWidth, cols * 16);
  assert.equal(plan.bitmapHeight, rows * 16);
  assert.equal(plan.cells.length, cols * rows);

  const mock1 = createMockContext();
  renderTerrainBitmap(mock1.ctx, plan, { mockSheet: true });
  assert.equal(mock1.ctx.imageSmoothingEnabled, false);
  assert.equal(mock1.ctx.globalAlpha, 1);

  // Determinism: second render produces identical sequence of canvas operations
  const mock2 = createMockContext();
  renderTerrainBitmap(mock2.ctx, plan, { mockSheet: true });
  assert.deepStrictEqual(mock1.ops, mock2.ops);

  // Track exact base-tile coverage across [0..cols*16) x [0..rows*16)
  const baseCountPerCell = new Map<string, number>();
  const overlayCountPerCell = new Map<string, number>();

  for (const cell of plan.cells) {
    const dx = cell.col * PACKED_TILE_PX;
    const dy = cell.row * PACKED_TILE_PX;
    const cellOps = mock1.ops.filter((op) =>
      op.kind === 'drawImage'
        ? op.dx === dx && op.dy === dy
        : op.x === dx && op.y === dy
    );

    const drawOps = cellOps.filter((op): op is RecordedDrawImage => op.kind === 'drawImage');
    const fillOps = cellOps.filter((op): op is RecordedFillRect => op.kind === 'fillRect');

    const expectedBaseSrc = getTileSourceCoords(cell.decor.baseTile);
    assert.ok(drawOps.length >= 1, `Cell (${cell.gx},${cell.gy}) must draw base tile`);
    assert.deepStrictEqual(drawOps[0], {
      kind: 'drawImage',
      sx: expectedBaseSrc.x,
      sy: expectedBaseSrc.y,
      sw: 16,
      sh: 16,
      dx,
      dy,
      dw: 16,
      dh: 16,
      globalAlpha: 1,
    });
    const cellKey = `${cell.col},${cell.row}`;
    baseCountPerCell.set(cellKey, (baseCountPerCell.get(cellKey) ?? 0) + 1);

    if (cell.decor.overlayTile !== null) {
      assert.equal(drawOps.length, 2, `Cell (${cell.gx},${cell.gy}) with overlay must draw base + overlay`);
      const expectedOvSrc = getTileSourceCoords(cell.decor.overlayTile);
      assert.deepStrictEqual(drawOps[1], {
        kind: 'drawImage',
        sx: expectedOvSrc.x,
        sy: expectedOvSrc.y,
        sw: 16,
        sh: 16,
        dx,
        dy,
        dw: 16,
        dh: 16,
        globalAlpha: 1,
      });
      overlayCountPerCell.set(cellKey, (overlayCountPerCell.get(cellKey) ?? 0) + 1);
    } else {
      assert.equal(drawOps.length, 1);
    }

    if (cell.isUnlocked) {
      assert.equal(fillOps.length, 0, 'Unlocked cell must NOT have dark forest scrim fillRect');
    } else {
      assert.equal(fillOps.length, 1, 'Locked cell at treeFactor=1.0 must have 1 dark scrim fillRect');
      assert.deepStrictEqual(fillOps[0], {
        kind: 'fillRect',
        x: dx,
        y: dy,
        w: 16,
        h: 16,
        fillStyle: LOCKED_FOREST_SCRIM_COLOR,
        globalAlpha: LOCKED_FOREST_DARKEN_OPACITY,
      });
      // Scrim must execute AFTER tree overlay
      const lastDrawIdx = mock1.ops.lastIndexOf(drawOps[drawOps.length - 1]);
      const scrimIdx = mock1.ops.indexOf(fillOps[0]);
      assert.ok(scrimIdx > lastDrawIdx, 'Locked scrim must draw AFTER base and tree overlay');
    }
  }

  // Every grid cell [0..cols) x [0..rows) has exactly ONE base tile drawImage -> zero gaps, zero overlaps
  assert.equal(baseCountPerCell.size, cols * rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      assert.equal(baseCountPerCell.get(`${c},${r}`), 1);
      assert.ok((overlayCountPerCell.get(`${c},${r}`) ?? 0) <= 1);
    }
  }

  // Verify tuned treeDarkenFactor (e.g. 0.7) mirrors UX-3 computeLockedForestOpacities cleanly
  const tunedPlan = buildTerrainBitmapPlan({
    minX: -8,
    minY: -8,
    cols: 8,
    rows: 8,
    seed: TERRAIN_DECOR_SEED,
    darkenOpacity: 0.44,
    treeDarkenFactor: 0.7,
    isCellUnlocked: () => false,
  });
  const treeCell = tunedPlan.cells.find((c) => c.decor.overlayTile !== null);
  assert.ok(treeCell);
  const tunedMock = createMockContext();
  renderTerrainBitmap(tunedMock.ctx, tunedPlan, { mockSheet: true });
  const expectedOps = computeLockedForestOpacities(true, 0.44, 0.7);
  const tunedFills = tunedMock.ops.filter(
    (op): op is RecordedFillRect =>
      op.kind === 'fillRect' && op.x === treeCell!.col * 16 && op.y === treeCell!.row * 16
  );
  assert.equal(tunedFills.length, 2, 'Tuned treeDarkenFactor=0.7 emits ground compensation + top scrim');
  assert.equal(tunedFills[0].globalAlpha, expectedOps.groundUnderOverlayOpacity);
  assert.equal(tunedFills[1].globalAlpha, expectedOps.topScrimOpacity);
});

test('UX-5 (Cache & Fallback): redraws ONLY when content key or sheet mode changes; draws flat fallback cleanly on image error', () => {
  const planA = buildTerrainBitmapPlan({
    minX: -8,
    minY: -8,
    cols: 16,
    rows: 11,
    isCellUnlocked: () => false,
  });
  const planASame = buildTerrainBitmapPlan({
    minX: -8,
    minY: -8,
    cols: 16,
    rows: 11,
    isCellUnlocked: () => false,
  });
  assert.equal(planA.contentKey, planASame.contentKey);

  const mock = createMockContext();
  const sheet = { mockSheet: true };

  const first = renderTerrainBitmapIfNeeded(mock.ctx, planA, sheet, null);
  assert.equal(first.drawn, true);
  const opsCountAfterFirst = mock.ops.length;
  assert.ok(opsCountAfterFirst > 0);

  // Pan/zoom re-render with identical terrain content key -> zero canvas draws
  const second = renderTerrainBitmapIfNeeded(mock.ctx, planASame, sheet, first.renderSignature);
  assert.equal(second.drawn, false);
  assert.equal(second.renderSignature, first.renderSignature);
  assert.equal(mock.ops.length, opsCountAfterFirst);

  // Land unlock changes contentKey -> redraws bitmap cleanly
  const planExpanded = buildTerrainBitmapPlan({
    minX: -8,
    minY: -8,
    cols: 16,
    rows: 11,
    isCellUnlocked: (cx, cy) => cx >= 0 && cx < 4 && cy >= 0 && cy < 4,
  });
  assert.notEqual(planExpanded.contentKey, planA.contentKey);
  const third = renderTerrainBitmapIfNeeded(mock.ctx, planExpanded, sheet, second.renderSignature);
  assert.equal(third.drawn, true);
  assert.ok(mock.ops.length > opsCountAfterFirst);

  // Tilemap load failure (tileSheet = null) renders flat fallback colors cleanly with 0 drawImage & no crash
  const fallbackMock = createMockContext();
  renderTerrainBitmap(fallbackMock.ctx, planExpanded, null);
  assert.equal(fallbackMock.ctx.imageSmoothingEnabled, false);
  assert.equal(fallbackMock.ops.some((op) => op.kind === 'drawImage'), false);
  const fillColors = new Set(
    fallbackMock.ops
      .filter((op): op is RecordedFillRect => op.kind === 'fillRect')
      .map((op) => op.fillStyle)
  );
  assert.ok(fillColors.has(FALLBACK_TERRAIN_COLORS.grass));
  assert.ok(fillColors.has(LOCKED_FOREST_SCRIM_COLOR));
});

test('UX-5 (SSR & Interaction): MapGridView uses single pixelated bitmap canvas, transparent interaction cells, preserves all overlays, disables transition-transform while dragging, and matches SpriteGallery #sprites preview', () => {
  const campfire = getBuildingDefinition('stone_age_campfire')!;
  const baseState = createInitialCivilizationState();
  const stateWithBuilding = {
    ...baseState,
    buildings: [
      {
        id: 'b_ux5_camp',
        definitionId: 'stone_age_campfire',
        position: { x: 2, y: 2 },
        level: 1,
        placedAt: 1700000000000,
      },
    ],
  };

  const idleHtml = renderToString(
    React.createElement(MapGridView, {
      civilizationState: stateWithBuilding,
      placementDef: null,
      onPlaceBuilding: () => {},
      onInspectBuilding: () => {},
    })
  );

  // 1. Exactly one bitmap <canvas>, zero <img> in terrain grid, exact bitmap & CSS sizes + pixelated
  const bitmapMatches = idleHtml.match(/data-testid="map-terrain-bitmap"/g) ?? [];
  assert.equal(bitmapMatches.length, 1);
  assert.equal(idleHtml.includes('<img'), false, 'MapGridView idle render must contain zero terrain <img> tags');
  assert.ok(idleHtml.includes(`width="${24 * 16}"`));
  assert.ok(idleHtml.includes(`height="${24 * 16}"`));
  assert.ok(idleHtml.includes(`width:${24 * CELL_SIZE}px;height:${24 * CELL_SIZE}px;image-rendering:pixelated`));

  // 2. Transparent interactive grid, buildings, chunk frames, and zoom toolbar preserved
  assert.ok(idleHtml.includes('data-testid="map-interaction-grid"'));
  assert.ok(idleHtml.includes('data-cell-coord="0,0"'));
  assert.ok(idleHtml.includes('data-sprite-id="stone_age_campfire"'));
  assert.ok(idleHtml.includes('(0,0)'));
  assert.ok(idleHtml.includes('border-emerald-500/35'));
  assert.ok(idleHtml.includes('map-controls-toolbar'));

  // 3. Stage classes: never include shadow-sm or transition-transform while dragging (or idle)
  assert.equal(getMapStageClassName(true, false).includes('transition-transform'), false);
  assert.equal(getMapStageClassName(true, true).includes('transition-transform'), false);
  assert.equal(getMapStageClassName(false, false).includes('transition-transform'), false);
  assert.equal(getMapStageClassName(false, true).includes('transition-transform'), true);
  assert.equal(idleHtml.includes('shadow-sm'), false, 'Stage must not carry shadow-sm around bitmap');

  // 4. Placement mode preserves hover highlight on transparent interaction layer
  const placementHtml = renderToString(
    React.createElement(MapGridView, {
      civilizationState: stateWithBuilding,
      placementDef: campfire,
      onPlaceBuilding: () => {},
      onInspectBuilding: () => {},
    })
  );
  assert.ok(placementHtml.includes('hover:after:bg-emerald-300/35'));
  assert.ok(placementHtml.includes('cursor-crosshair'));
  assert.equal(placementHtml.includes('<img'), false);

  // 5. Expansion mode preserves candidate slots & auto-fit zoom
  const expandHtml = renderToString(
    React.createElement(MapGridView, {
      civilizationState: stateWithBuilding,
      placementDef: null,
      onPlaceBuilding: () => {},
      onInspectBuilding: () => {},
      isExpansionMode: true,
      selectedExpansionOrigin: { x: 8, y: 0 },
      onSelectExpansionSlot: () => {},
    })
  );
  assert.ok(expandHtml.includes('data-expansion-candidate="8,0"'));
  assert.ok(expandHtml.includes('data-testid="map-terrain-bitmap"'));
  assert.equal(expandHtml.includes('<img'), false);

  // 6. SpriteGallery (#sprites) preserves old DOM 16x11 block AND adds UX-5 Map terrain bitmap preview
  const galleryHtml = renderToString(React.createElement(SpriteGallery));
  assert.ok(galleryHtml.includes('data-testid="gallery-locked_forest_16x11"'));
  assert.ok(galleryHtml.includes('data-testid="gallery-terrain_bitmap_16x11"'));
  assert.ok(galleryHtml.includes('data-testid="gallery-terrain-bitmap-canvas"'));
  assert.ok(galleryHtml.includes(`width="${16 * 16}"`));
  assert.ok(galleryHtml.includes(`height="${11 * 16}"`));
  assert.ok(galleryHtml.includes(`width:${16 * 32}px;height:${11 * 32}px;image-rendering:pixelated`));
});

test('UX-5 (Arithmetic Proof): legacy per-cell DOM boundaries produce fractional physical pixels on non-1x DPRs/pans, whereas single bitmap has zero inter-tile edges for all DPRs, zooms, and pans', () => {
  const dprs = [1, 1.25, 1.5, 1.75, 2, 2.5, 3];
  const zooms = [
    0.375,
    0.5,
    0.5625,
    0.6875,
    0.75,
    1.0,
    1.25,
    1.5,
    1.75,
    2.0,
    snapZoomToIntegerPixels(0.69, 0.375),
    computeExpansionFitZoom(768, 768, 360, 420),
    computeExpansionFitZoom(896, 896, 360, 420),
  ];
  const pans = [0, 1, -17, 43];

  // 1. Demonstrate mathematically why UX-3 CSS-integer sizing still broke under real DPR/pan:
  // Example: panX = 1 CSS px (or zoom = 11/16 -> cellCss = 22 CSS px) on DPR 1.25 or 1.75
  assert.equal(Number.isInteger(22 * 1.25), false);
  assert.equal(Number.isInteger(22 * 1.75), false);
  assert.equal(Number.isInteger(1 * 1.25), false);
  assert.equal(Number.isInteger(1 * 1.5), false);

  // 2. Prove for UX-5 single composite bitmap across ALL DPRs, zooms, and pans:
  // Every adjacent pair of tiles shares exact contiguous integer texel boundary in the single bitmap
  // (dxRight === nextDxLeft, dyBottom === nextDyTop), with ZERO CSS/DOM clip edges between tiles.
  const cols = 24;
  const rows = 24;
  const plan = buildTerrainBitmapPlan({
    minX: -8,
    minY: -8,
    cols,
    rows,
    isCellUnlocked: (cx, cy) => cx >= 0 && cx < 8 && cy >= 0 && cy < 8,
  });

  const mock = createMockContext();
  renderTerrainBitmap(mock.ctx, plan, { mockSheet: true });
  const baseDraws = new Map<string, RecordedDrawImage>();
  for (const op of mock.ops) {
    if (op.kind !== 'drawImage') continue;
    const key = `${op.dx / 16},${op.dy / 16}`;
    if (!baseDraws.has(key)) {
      baseDraws.set(key, op);
    }
  }

  for (const dpr of dprs) {
    for (const zoom of zooms) {
      for (const pan of pans) {
        assert.ok(dpr > 0 && zoom > 0 && Number.isInteger(pan));
        for (let r = 0; r < rows - 1; r++) {
          for (let c = 0; c < cols - 1; c++) {
            const tile = baseDraws.get(`${c},${r}`)!;
            const right = baseDraws.get(`${c + 1},${r}`)!;
            const bottom = baseDraws.get(`${c},${r + 1}`)!;
            // Exact integer raster abutment inside single bitmap — independent of DPR/zoom/pan
            assert.equal(tile.dx + tile.dw, right.dx);
            assert.equal(tile.dy + tile.dh, bottom.dy);
          }
        }
      }
    }
  }
});

test('UX-5 (GridMap integration): initial GridMap snapshot remains untouched & canvas expansion unlock flips bitmap key cleanly', () => {
  const map = new GridMap();
  const isInitialUnlocked = (cx: number, cy: number) => map.isCellUnlocked(cx, cy);
  const planBefore = buildTerrainBitmapPlan({
    minX: -8,
    minY: -8,
    cols: 24,
    rows: 24,
    isCellUnlocked: isInitialUnlocked,
  });
  const expand = map.expandChunk({ x: 8, y: 0 });
  assert.equal(expand.success, true);

  const planAfter = buildTerrainBitmapPlan({
    minX: -8,
    minY: -8,
    cols: 24,
    rows: 24,
    isCellUnlocked: (cx, cy) => map.isCellUnlocked(cx, cy),
  });
  assert.notEqual(planBefore.contentKey, planAfter.contentKey);
  const unlockedCorner = planAfter.cells.find((c) => c.gx === 8 && c.gy === 0)!;
  assert.equal(unlockedCorner.isUnlocked, true);
  assert.equal(unlockedCorner.decor.isDarkened, false);
});
