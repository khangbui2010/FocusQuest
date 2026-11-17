import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToString } from 'react-dom/server';

import { GridMap } from '../../src/core/civilization/gridMap.ts';
import { createInitialCivilizationState } from '../../src/core/civilization/civilizationState.ts';
import { REUSED_TINY_TOWN_TILES } from '../../src/ui/components/civilization/spriteData.ts';
import { MapGridView } from '../../src/ui/components/civilization/MapGridView.tsx';
import { SpriteGallery } from '../../src/ui/components/civilization/SpriteGallery.tsx';
import {
  CANOPY_CROSS_B_GREEN,
  CANOPY_CROSS_B_ORANGE,
  CANOPY_FRAGMENT_TILES,
  CANOPY_GROVE_2X2_GREEN,
  CANOPY_GROVE_2X2_ORANGE,
  DIRT_PATCH_TILES,
  FORBIDDEN_UNLOCKED_TREE_TILES,
  FOREST_CLEARING_MAX_RATIO,
  FOREST_CLEARING_MIN_RATIO,
  FOREST_FILLER_TILES,
  FOREST_TARGET_DENSITY_MAX,
  FOREST_TARGET_DENSITY_MIN,
  FOREST_UNIT_TEMPLATES,
  ForestUnitKind,
  LOCKED_FOREST_OVERLAY_OPACITY,
  LOCKED_FOREST_TILES,
  MOSSY_STONE_TILE,
  RETIRED_CONE_TILES,
  STANDALONE_FOREST_TILES,
  TALL_TREE_1X2_GREEN,
  TALL_TREE_1X2_ORANGE,
  TERRAIN_DECOR_SEED,
  UNLOCKED_ALLOWED_OVERLAY_TILES,
  UNLOCKED_GRASS_TILES,
  floorDiv,
  getAlignedOrigin,
  getCellDecor,
  getChunkDirtPatchTile,
  getChunkForestLayout,
  isAllowedFillerKind,
} from '../../src/ui/components/civilization/terrainDecor.ts';

const ALLOWED_UNLOCKED_BASE_SET = new Set<number>([
  ...UNLOCKED_GRASS_TILES,
  ...DIRT_PATCH_TILES,
  MOSSY_STONE_TILE,
]);

const ALLOWED_UNLOCKED_OVERLAY_SET = new Set<number>(UNLOCKED_ALLOWED_OVERLAY_TILES);
const FORBIDDEN_UNLOCKED_SET = new Set<number>(FORBIDDEN_UNLOCKED_TREE_TILES);
const ALLOWED_LOCKED_BASE_SET = new Set<number>([
  REUSED_TINY_TOWN_TILES.GRASS_PLAIN,
  REUSED_TINY_TOWN_TILES.GRASS_TUFTS,
]);
const ALLOWED_LOCKED_OVERLAY_SET = new Set<number>(LOCKED_FOREST_TILES);
const CANOPY_FRAGMENT_SET = new Set<number>(CANOPY_FRAGMENT_TILES);
const RETIRED_CONE_SET = new Set<number>(RETIRED_CONE_TILES);
const ALLOWED_FILLER_TILE_SET = new Set<number>(FOREST_FILLER_TILES);

test('Terrain Decor Stage 4a-3: determinism, zero Math.random, negative-coord safety & 44% background contrast', () => {
  const sourcePath = path.resolve(
    import.meta.dirname,
    '../../src/ui/components/civilization/terrainDecor.ts'
  );
  const sourceText = fs.readFileSync(sourcePath, 'utf8');
  assert.equal(/Math\.random\s*\(/.test(sourceText), false, 'terrainDecor.ts must NEVER call Math.random()');

  const coords: Array<[number, number, boolean]> = [
    [0, 0, true],
    [7, 7, true],
    [-4, -4, true],
    [-1, 5, false],
    [8, 8, false],
    [-25, 19, false],
    [-101, -99, false],
  ];

  for (const [x, y, unlocked] of coords) {
    const first = getCellDecor(x, y, unlocked, TERRAIN_DECOR_SEED);
    const second = getCellDecor(x, y, unlocked, TERRAIN_DECOR_SEED);
    assert.deepStrictEqual(first, second);
    assert.deepStrictEqual(Object.keys(first).sort(), ['baseTile', 'isDarkened', 'kind', 'overlayTile']);
  }

  assert.equal(getAlignedOrigin(0, 4), 0);
  assert.equal(getAlignedOrigin(-1, 4), -4);
  assert.equal(getAlignedOrigin(-4, 4), -4);
  assert.equal(getAlignedOrigin(-5, 4), -8);
  assert.equal(Object.is(getAlignedOrigin(-0, 4), -0), false);
  assert.equal(floorDiv(-1, 4), -1);
  assert.equal(floorDiv(-4, 4), -1);
  assert.equal(floorDiv(-5, 4), -2);
  assert.equal(Object.is(floorDiv(-0, 4), -0), false);
  assert.ok(
    LOCKED_FOREST_OVERLAY_OPACITY >= 0.35 && LOCKED_FOREST_OVERLAY_OPACITY <= 0.45,
    `Expected contrast darkening in [0.35, 0.45], got ${LOCKED_FOREST_OVERLAY_OPACITY}`
  );
});

test('Terrain Decor Stage 4a-3: unlocked cells never render trees/canopies; bushes strictly on plain grass (0) and <= 5%', () => {
  let grassOrFlowerCount = 0;
  let dirtOrStoneCount = 0;
  let microDecorCount = 0;
  let bushCount = 0;
  const total = 1600; // 40x40 unlocked sample

  for (let y = -20; y < 20; y++) {
    for (let x = -20; x < 20; x++) {
      const decor = getCellDecor(x, y, true, TERRAIN_DECOR_SEED);
      assert.equal(decor.isDarkened, false);
      assert.ok(ALLOWED_UNLOCKED_BASE_SET.has(decor.baseTile));
      assert.ok(!FORBIDDEN_UNLOCKED_SET.has(decor.baseTile));

      if (decor.overlayTile !== null) {
        assert.ok(ALLOWED_UNLOCKED_OVERLAY_SET.has(decor.overlayTile));
        assert.ok(!FORBIDDEN_UNLOCKED_SET.has(decor.overlayTile));
        if (decor.overlayTile === REUSED_TINY_TOWN_TILES.GREEN_BUSH) {
          assert.equal(decor.baseTile, REUSED_TINY_TOWN_TILES.GRASS_PLAIN);
          assert.equal(decor.kind, 'bush');
          bushCount++;
        } else {
          microDecorCount++;
        }
      }

      if (decor.kind === 'dirt' || decor.kind === 'stone') {
        dirtOrStoneCount++;
      } else {
        grassOrFlowerCount++;
      }
    }
  }

  assert.ok(grassOrFlowerCount >= total * 0.78);
  assert.ok(dirtOrStoneCount <= total * 0.22);
  assert.ok(microDecorCount > 0 && microDecorCount <= total * 0.1);
  assert.ok(bushCount > 0 && bushCount <= total * 0.05);
});

test('Terrain Decor Stage 4a-3: validates exact M1-M6 recipes, reserved "—" corners, bush #5 filler only, zero standalone 15/16 or retired 27/28', () => {
  const CHUNK_SCAN_GRID = 40; // 1,600 chunks = 25,600 cells covering negative & positive coords
  const START_CX = -20;
  const START_CY = -20;

  const recipeCounts: Record<ForestUnitKind, number> = {
    tall_orange: 0,
    tall_green: 0,
    cluster_a_green: 0,
    cluster_a_orange: 0,
    cross_b_green: 0,
    cross_b_orange: 0,
    bush_green: 0,
  };

  for (let cy = START_CY; cy < START_CY + CHUNK_SCAN_GRID; cy++) {
    for (let cx = START_CX; cx < START_CX + CHUNK_SCAN_GRID; cx++) {
      const originX = cx * 4;
      const originY = cy * 4;
      const layout = getChunkForestLayout(originX, originY, TERRAIN_DECOR_SEED);

      const claimedBoundingCells = new Set<string>();
      const overlayCells = new Map<string, number>();

      for (const unit of layout.units) {
        const tpl = FOREST_UNIT_TEMPLATES[unit.kind];
        assert.ok(tpl, `Unknown unit kind ${unit.kind}`);
        recipeCounts[unit.kind]++;

        // Reserve entire width x height bounding box (including "—" corner cells of M5/M6)
        for (let dy = 0; dy < tpl.height; dy++) {
          for (let dx = 0; dx < tpl.width; dx++) {
            const bx = unit.originX + dx;
            const by = unit.originY + dy;
            assert.ok(bx >= originX && bx < originX + 4 && by >= originY && by < originY + 4);
            const bKey = `${bx},${by}`;
            assert.equal(claimedBoundingCells.has(bKey), false, `Overlapping bounding box at (${bx},${by})`);
            claimedBoundingCells.add(bKey);
          }
        }

        // Verify exact tile placement for every active cell in the recipe
        for (const offset of tpl.cells) {
          const wx = unit.originX + offset.dx;
          const wy = unit.originY + offset.dy;
          const key = `${wx},${wy}`;
          overlayCells.set(key, offset.tileIndex);

          assert.equal(RETIRED_CONE_SET.has(offset.tileIndex), false, `Retired cone tile ${offset.tileIndex} used!`);
          if (offset.tileIndex === 3) assert.equal(unit.kind, 'tall_orange', 'Tile 3 may ONLY appear in M1');
          if (offset.tileIndex === 4) assert.equal(unit.kind, 'tall_green', 'Tile 4 may ONLY appear in M2');
          if (offset.tileIndex === 15) assert.equal(unit.kind, 'tall_orange', 'Tile 15 may ONLY appear as M1 base (never standalone)');
          if (offset.tileIndex === 16) assert.equal(unit.kind, 'tall_green', 'Tile 16 may ONLY appear as M2 base (never standalone)');
          if (CANOPY_FRAGMENT_SET.has(offset.tileIndex)) {
            assert.equal(tpl.isCanopyCluster, true, `Canopy fragment ${offset.tileIndex} cannot stand outside M3-M6`);
          }
          if (tpl.recipeId === 'FILLER') {
            assert.ok(ALLOWED_FILLER_TILE_SET.has(offset.tileIndex));
            assert.equal(offset.tileIndex, REUSED_TINY_TOWN_TILES.GREEN_BUSH);
            assert.equal(isAllowedFillerKind(unit.kind), true);
          }

          const decor = getCellDecor(wx, wy, false, TERRAIN_DECOR_SEED);
          assert.equal(decor.isDarkened, true);
          assert.equal(decor.baseTile, REUSED_TINY_TOWN_TILES.GRASS_PLAIN);
          assert.equal(decor.overlayTile, offset.tileIndex);
          assert.ok(ALLOWED_LOCKED_OVERLAY_SET.has(offset.tileIndex));
        }

        // Verify M1–M6 exact recipes + M5/M6 empty "—" corners
        if (unit.kind === 'tall_orange') {
          assert.equal(overlayCells.get(`${unit.originX},${unit.originY}`), TALL_TREE_1X2_ORANGE[0]); // 3
          assert.equal(overlayCells.get(`${unit.originX},${unit.originY + 1}`), TALL_TREE_1X2_ORANGE[1]); // 15
        } else if (unit.kind === 'tall_green') {
          assert.equal(overlayCells.get(`${unit.originX},${unit.originY}`), TALL_TREE_1X2_GREEN[0]); // 4
          assert.equal(overlayCells.get(`${unit.originX},${unit.originY + 1}`), TALL_TREE_1X2_GREEN[1]); // 16
        } else if (unit.kind === 'cluster_a_green') {
          assert.equal(overlayCells.get(`${unit.originX},${unit.originY}`), CANOPY_GROVE_2X2_GREEN[0][0]); // 6
          assert.equal(overlayCells.get(`${unit.originX + 1},${unit.originY}`), CANOPY_GROVE_2X2_GREEN[0][1]); // 8
          assert.equal(overlayCells.get(`${unit.originX},${unit.originY + 1}`), CANOPY_GROVE_2X2_GREEN[1][0]); // 30
          assert.equal(overlayCells.get(`${unit.originX + 1},${unit.originY + 1}`), CANOPY_GROVE_2X2_GREEN[1][1]); // 32
        } else if (unit.kind === 'cluster_a_orange') {
          assert.equal(overlayCells.get(`${unit.originX},${unit.originY}`), CANOPY_GROVE_2X2_ORANGE[0][0]); // 9
          assert.equal(overlayCells.get(`${unit.originX + 1},${unit.originY}`), CANOPY_GROVE_2X2_ORANGE[0][1]); // 11
          assert.equal(overlayCells.get(`${unit.originX},${unit.originY + 1}`), CANOPY_GROVE_2X2_ORANGE[1][0]); // 33
          assert.equal(overlayCells.get(`${unit.originX + 1},${unit.originY + 1}`), CANOPY_GROVE_2X2_ORANGE[1][1]); // 35
        } else if (unit.kind === 'cross_b_green' || unit.kind === 'cross_b_orange') {
          const tplMatrix =
            unit.kind === 'cross_b_green' ? CANOPY_CROSS_B_GREEN : CANOPY_CROSS_B_ORANGE;
          assert.equal(overlayCells.get(`${unit.originX + 1},${unit.originY}`), tplMatrix[0][1]);
          assert.equal(overlayCells.get(`${unit.originX},${unit.originY + 1}`), tplMatrix[1][0]);
          assert.equal(overlayCells.get(`${unit.originX + 1},${unit.originY + 1}`), tplMatrix[1][1]);
          assert.equal(overlayCells.get(`${unit.originX + 2},${unit.originY + 1}`), tplMatrix[1][2]);
          assert.equal(overlayCells.get(`${unit.originX + 1},${unit.originY + 2}`), tplMatrix[2][1]);
          // All 4 "—" corners MUST have zero overlay and resolve to forest_clearing
          for (const [cdx, cdy] of [
            [0, 0],
            [2, 0],
            [0, 2],
            [2, 2],
          ] as const) {
            const cKey = `${unit.originX + cdx},${unit.originY + cdy}`;
            assert.equal(overlayCells.has(cKey), false, `"—" corner at (${cKey}) must have no overlay`);
            const cDecor = getCellDecor(unit.originX + cdx, unit.originY + cdy, false, TERRAIN_DECOR_SEED);
            assert.equal(cDecor.overlayTile, null);
            assert.equal(cDecor.kind, 'forest_clearing');
          }
        }
      }

      // Check every clearing cell in the chunk
      for (let dy = 0; dy < 4; dy++) {
        for (let dx = 0; dx < 4; dx++) {
          const wx = originX + dx;
          const wy = originY + dy;
          if (!overlayCells.has(`${wx},${wy}`)) {
            const decor = getCellDecor(wx, wy, false, TERRAIN_DECOR_SEED);
            assert.equal(decor.overlayTile, null);
            assert.equal(decor.kind, 'forest_clearing');
            assert.ok(ALLOWED_LOCKED_BASE_SET.has(decor.baseTile));
          }
        }
      }
    }
  }

  for (const kind of Object.keys(recipeCounts) as ForestUnitKind[]) {
    assert.ok(recipeCounts[kind] > 0, `Expected recipe/filler "${kind}" to appear in scan`);
  }
  assert.deepStrictEqual(STANDALONE_FOREST_TILES, [5]);
  assert.deepStrictEqual(RETIRED_CONE_TILES, [27, 28]);
});

function measure24x24Sample(originX: number, originY: number) {
  let clearings = 0;
  let overlays = 0;
  let greenTiles = 0;
  let orangeTiles = 0;
  const kindGrid: Array<Array<ForestUnitKind | null>> = [];
  const recipeCounts: Record<ForestUnitKind, number> = {
    tall_orange: 0,
    tall_green: 0,
    cluster_a_green: 0,
    cluster_a_orange: 0,
    cross_b_green: 0,
    cross_b_orange: 0,
    bush_green: 0,
  };

  for (let y = originY; y < originY + 24; y++) {
    const row: Array<ForestUnitKind | null> = [];
    for (let x = originX; x < originX + 24; x++) {
      const decor = getCellDecor(x, y, false, TERRAIN_DECOR_SEED);
      const cx = getAlignedOrigin(x, 4);
      const cy = getAlignedOrigin(y, 4);
      const layout = getChunkForestLayout(cx, cy, TERRAIN_DECOR_SEED);
      const fCell = layout.cells[y - cy][x - cx];
      row.push(fCell ? fCell.unitKind : null);

      if (decor.kind === 'forest_clearing') {
        clearings++;
      } else {
        overlays++;
        assert.ok(fCell);
        const tpl = FOREST_UNIT_TEMPLATES[fCell.unitKind];
        if (tpl.color === 'green') greenTiles++;
        else orangeTiles++;
      }
    }
    kindGrid.push(row);
  }

  // Count distinct units intersecting this 24x24 window
  const seenUnits = new Set<string>();
  for (let cy = getAlignedOrigin(originY, 4); cy < originY + 24; cy += 4) {
    for (let cx = getAlignedOrigin(originX, 4); cx < originX + 24; cx += 4) {
      const layout = getChunkForestLayout(cx, cy, TERRAIN_DECOR_SEED);
      for (const u of layout.units) {
        const key = `${cx},${cy}:${u.unitId}`;
        if (!seenUnits.has(key)) {
          seenUnits.add(key);
          recipeCounts[u.kind]++;
        }
      }
    }
  }

  // Compute max connected component of identical unitKind cells across 24x24 (4-way orthogonal adjacency)
  const visited = Array.from({ length: 24 }, () => Array(24).fill(false));
  let maxSameKindComponentCells = 0;
  let maxFillerSameKindComponent = 0;
  for (let y = 0; y < 24; y++) {
    for (let x = 0; x < 24; x++) {
      const kind = kindGrid[y][x];
      if (!kind || visited[y][x]) continue;
      const queue: Array<[number, number]> = [[x, y]];
      visited[y][x] = true;
      let count = 0;
      while (queue.length > 0) {
        const [qx, qy] = queue.shift()!;
        count++;
        for (const [nx, ny] of [
          [qx - 1, qy],
          [qx + 1, qy],
          [qx, qy - 1],
          [qx, qy + 1],
        ] as const) {
          if (nx < 0 || nx >= 24 || ny < 0 || ny >= 24) continue;
          if (!visited[ny][nx] && kindGrid[ny][nx] === kind) {
            visited[ny][nx] = true;
            queue.push([nx, ny]);
          }
        }
      }
      if (count > maxSameKindComponentCells) {
        maxSameKindComponentCells = count;
      }
      if (isAllowedFillerKind(kind) && count > maxFillerSameKindComponent) {
        maxFillerSameKindComponent = count;
      }
    }
  }

  return {
    origin: `(${originX},${originY})`,
    total: 576,
    clearings,
    clearingRatio: clearings / 576,
    treeDensity: overlays / 576,
    overlays,
    greenTiles,
    orangeTiles,
    recipeCounts,
    maxSameKindComponentCells,
    maxFillerSameKindComponent,
  };
}

test('Terrain Decor Stage 4a-3: 24x24 locked samples across >=3 origins keep ~30% trees (25%-35%) & 65%-75% clearings, mixed colors, bounded repetition', () => {
  const origins: Array<[number, number]> = [
    [0, 0],
    [-24, -24],
    [-13, -7],
    [16, -20],
  ];

  for (const [ox, oy] of origins) {
    const stats = measure24x24Sample(ox, oy);
    console.log(
      `[Stage 4a-3 24x24 ${stats.origin}] trees=${stats.overlays}/576 (${(
        stats.treeDensity * 100
      ).toFixed(2)}%), clearings=${stats.clearings}/576 (${(
        stats.clearingRatio * 100
      ).toFixed(2)}%), greenTiles=${stats.greenTiles}, orangeTiles=${stats.orangeTiles}, maxSameComponent=${stats.maxSameKindComponentCells}, maxFillerComponent=${stats.maxFillerSameKindComponent}, units=${JSON.stringify(
        stats.recipeCounts
      )}`
    );

    assert.ok(
      stats.treeDensity >= FOREST_TARGET_DENSITY_MIN &&
        stats.treeDensity <= FOREST_TARGET_DENSITY_MAX,
      `Sample ${stats.origin} tree density ${(stats.treeDensity * 100).toFixed(
        2
      )}% out of [25%, 35%] (~30%) bounds`
    );
    assert.ok(
      stats.clearingRatio >= FOREST_CLEARING_MIN_RATIO &&
        stats.clearingRatio <= FOREST_CLEARING_MAX_RATIO,
      `Sample ${stats.origin} clearing ratio ${(stats.clearingRatio * 100).toFixed(
        2
      )}% out of [65%, 75%] bounds`
    );
    assert.ok(stats.greenTiles > 0 && stats.orangeTiles > 0, `Sample ${stats.origin} must mix green and orange`);
    // Bounded identical-unit repetition: same multi-tile cluster or filler clump never spans excessively across the sample
    assert.ok(
      stats.maxSameKindComponentCells <= 10,
      `Sample ${stats.origin} identical-kind connected component too large: ${stats.maxSameKindComponentCells}`
    );
    assert.ok(
      stats.maxFillerSameKindComponent <= 6,
      `Sample ${stats.origin} identical-filler run too large: ${stats.maxFillerSameKindComponent}`
    );
  }
});

test('Terrain Decor Stage 4a-3: unlocked boundary gating prevents clipped canopies & excludes 3x3 M5/M6 on 2-cell narrow strips', () => {
  // Unlocked 8x8 base [0..7, 0..7], surrounded by ONLY a 2-cell locked strip in chunk (8, 0):
  // columns x=8,9 locked and x=10,11 unlocked (a 2-cell wide locked strip).
  const narrowStripUnlocked = (cx: number, cy: number): boolean => {
    if (cx >= 0 && cx < 8 && cy >= 0 && cy < 8) return true;
    if (cx >= 10 && cy >= 0 && cy < 4) return true; // leaves ONLY x=8,9 locked in chunk (8,0)
    return false;
  };

  const stripLayout = getChunkForestLayout(8, 0, TERRAIN_DECOR_SEED, narrowStripUnlocked);
  for (const unit of stripLayout.units) {
    const tpl = FOREST_UNIT_TEMPLATES[unit.kind];
    // 3x3 cross (M5/M6) CANNOT possibly fit inside a 2-cell wide strip!
    assert.notEqual(tpl.width, 3, `3x3 recipe ${unit.kind} must be skipped on 2-cell strip`);
    assert.notEqual(tpl.height, 3, `3x3 recipe ${unit.kind} must be skipped on 2-cell strip`);
    for (let dy = 0; dy < tpl.height; dy++) {
      for (let dx = 0; dx < tpl.width; dx++) {
        assert.equal(
          narrowStripUnlocked(unit.originX + dx, unit.originY + dy),
          false,
          `Placed ${unit.kind} touched unlocked cell`
        );
      }
    }
  }

  // Verify unlocked cells right next to the border never get forest overlays
  for (let y = 0; y < 4; y++) {
    const uDecor = getCellDecor(10, y, true, TERRAIN_DECOR_SEED, narrowStripUnlocked);
    assert.equal(uDecor.isDarkened, false);
    assert.ok(!FORBIDDEN_UNLOCKED_SET.has(uDecor.baseTile));
    if (uDecor.overlayTile !== null) {
      assert.ok(ALLOWED_UNLOCKED_OVERLAY_SET.has(uDecor.overlayTile));
    }
  }

  // L-shaped unlocked chunks around (-4,-4): unlocked everywhere except cx<0 && cy<0
  const lBorderUnlocked = (cx: number, cy: number) => !(cx < 0 && cy < 0);
  const allLocked = getCellDecor(-2, -2, false, TERRAIN_DECOR_SEED);
  const lBorder = getCellDecor(-2, -2, false, TERRAIN_DECOR_SEED, lBorderUnlocked);
  assert.deepStrictEqual(allLocked, lBorder);
});

test('Terrain Decor Stage 4a-3: MapGridView ground-only darkening order & SpriteGallery M1-M6 + 16x11 sample', () => {
  const baseState = createInitialCivilizationState();
  const mapHtml = renderToString(
    React.createElement(MapGridView, {
      civilizationState: baseState,
      placementDef: null,
      onPlaceBuilding: () => {},
      onInspectBuilding: () => {},
    })
  );

  // Verify layer order inside locked grid cell: baseTile (data-tile-index="0") -> bg-slate-950 scrim -> overlayTile
  const lockedCellStart = mapHtml.indexOf('data-cell-coord="-8,-8"');
  assert.ok(lockedCellStart > -1);
  const lockedCellSnippet = mapHtml.slice(lockedCellStart, lockedCellStart + 900);
  const baseIdx = lockedCellSnippet.indexOf('data-tile-index="');
  const scrimIdx = lockedCellSnippet.indexOf('data-locked-forest="true"');
  const overlayIdx = lockedCellSnippet.indexOf('data-tile-index="', scrimIdx);
  assert.ok(baseIdx > -1 && scrimIdx > baseIdx, 'Dark scrim must sit AFTER base grass tile');
  if (overlayIdx !== -1) {
    assert.ok(overlayIdx > scrimIdx, 'Tree overlay MUST render AFTER dark scrim so tree keeps 100% color');
  }
  // Regression guard: overlay TileImage with "absolute inset-0" must NEVER also have "relative"
  // (Tailwind v4 outputs .relative after .absolute, which pushed overlays out of the overflow-hidden cell).
  assert.equal(
    /class="[^"]*\brelative\b[^"]*\babsolute\b[^"]*"/.test(mapHtml),
    false,
    'Overlay TileImage must not carry both relative and absolute classes'
  );
  assert.equal(
    /class="[^"]*\babsolute\b[^"]*\brelative\b[^"]*"/.test(mapHtml),
    false,
    'Overlay TileImage must not carry both absolute and relative classes'
  );
  assert.ok(!mapHtml.includes('data-tile-index="27"'), 'Retired pine 27 must never render on MapGridView');
  assert.ok(!mapHtml.includes('data-tile-index="28"'), 'Retired pine 28 must never render on MapGridView');

  const galleryHtml = renderToString(React.createElement(SpriteGallery));
  assert.ok(galleryHtml.includes('data-testid="gallery-locked_forest_16x11"'));
  assert.ok(galleryHtml.includes('M1 · Tall 1×2 Autumn Tree'));
  assert.ok(galleryHtml.includes('M6 · 3×3 Autumn Cross'));
  assert.ok(!galleryHtml.includes('data-tile-index="27"'), 'Retired pine 27 must never render in SpriteGallery');
  assert.ok(!galleryHtml.includes('data-tile-index="28"'), 'Retired pine 28 must never render in SpriteGallery');

  // Inspect 16x11 SpriteGallery region tiles (-8, -8) via getCellDecor: all 6 recipes (M1-M6) + fillers appear without slicing bottom trees
  const seen16x11 = new Set<number>();
  let clearings16x11 = 0;
  const isOutsideGallery16x11 = (cx: number, cy: number) => cx < -8 || cx >= 8 || cy < -8 || cy >= 3;
  for (let r = 0; r < 11; r++) {
    for (let c = 0; c < 16; c++) {
      const decor = getCellDecor(-8 + c, -8 + r, false, TERRAIN_DECOR_SEED, isOutsideGallery16x11);
      if (decor.overlayTile !== null) {
        seen16x11.add(decor.overlayTile);
      } else {
        clearings16x11++;
      }
    }
  }
  for (const representativeTile of [3, 4, 5, 6, 7, 9, 10, 15, 16]) {
    assert.ok(seen16x11.has(representativeTile), `Expected tile ${representativeTile} inside 16x11 gallery preview`);
  }
  console.log(
    `[Stage 4a-3 16x11 gallery (-8,-8)] clearings=${clearings16x11}/176 (${(
      (clearings16x11 / 176) *
      100
    ).toFixed(2)}%), tiles=${JSON.stringify([...seen16x11].sort((a, b) => a - b))}`
  );
});

test('Terrain Decor Stage 4a-3 + GridMap integration: decor never blocks placement & expanding chunk clears forest', () => {
  const map = new GridMap();
  const snap = map.toSnapshot();
  assert.deepStrictEqual(Object.keys(snap).sort(), ['buildings', 'chunks']);

  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const decor = getCellDecor(x, y, map.isCellUnlocked(x, y), TERRAIN_DECOR_SEED);
      assert.equal(decor.isDarkened, false);
      const check = map.canPlaceBuilding({ x, y }, { width: 1, height: 1 });
      assert.equal(check.isValid, true, `Visual decor "${decor.kind}" at (${x}, ${y}) must not block placement`);
    }
  }

  const beforeUnlock = getCellDecor(8, 0, map.isCellUnlocked(8, 0), TERRAIN_DECOR_SEED);
  assert.equal(beforeUnlock.isDarkened, true);

  const expandResult = map.expandChunk({ x: 8, y: 0 });
  assert.equal(expandResult.success, true);
  assert.deepStrictEqual(expandResult.chunk?.origin, { x: 8, y: 0 });
  assert.equal(map.isCellUnlocked(8, 0), true);

  const afterUnlock = getCellDecor(8, 0, map.isCellUnlocked(8, 0), TERRAIN_DECOR_SEED);
  assert.equal(afterUnlock.isDarkened, false);
  assert.ok(!FORBIDDEN_UNLOCKED_SET.has(afterUnlock.baseTile));
  assert.ok(afterUnlock.overlayTile === null || ALLOWED_UNLOCKED_OVERLAY_SET.has(afterUnlock.overlayTile));
  assert.ok(
    getChunkDirtPatchTile(8, 0, TERRAIN_DECOR_SEED) === null ||
      DIRT_PATCH_TILES.includes(getChunkDirtPatchTile(8, 0, TERRAIN_DECOR_SEED)!)
  );
});
