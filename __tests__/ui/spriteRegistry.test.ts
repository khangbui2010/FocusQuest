import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';

import {
  STONE_AGE_BUILDING_DEFINITIONS,
} from '../../src/core/civilization/buildingCatalog.ts';
import { createInitialCivilizationState } from '../../src/core/civilization/civilizationState.ts';
import {
  ALLOWED_TINY_TOWN_HEX_SET,
  REUSED_TINY_TOWN_TILES,
  STONE_AGE_SPRITE_DATA,
  TINY_TOWN_PALETTE,
  validateAllSpriteData,
  validatePixelSpriteData,
} from '../../src/ui/components/civilization/spriteData.ts';
import {
  PixelSprite,
  TileImage,
  getBuildingSprite,
  getCellDecorVisual,
  getTerrainTile,
} from '../../src/ui/components/civilization/spriteRegistry.ts';
import { computeSpriteRects } from '../../src/ui/components/civilization/PixelSprite.tsx';
import { getTileSourceCoords } from '../../src/ui/components/civilization/TileImage.tsx';
import { MapGridView } from '../../src/ui/components/civilization/MapGridView.tsx';
import { BuildingCatalogPanel } from '../../src/ui/components/civilization/BuildingCatalogPanel.tsx';
import { BuildingDetailsModal } from '../../src/ui/components/civilization/BuildingDetailsModal.tsx';
import { SpriteGallery } from '../../src/ui/components/civilization/SpriteGallery.tsx';
import App from '../../src/App.tsx';

const EXPECTED_STONE_AGE_IDS = [
  'stone_age_campfire',
  'stone_age_totem',
  'stone_age_study_cave',
  'stone_age_elder_hut',
  'stone_age_foraging_post',
  'stone_age_food_cache',
] as const;

test('Sprite Registry (4a): all 6 Stone Age building IDs have registered sprites', () => {
  assert.equal(STONE_AGE_BUILDING_DEFINITIONS.length, 6);
  for (const id of EXPECTED_STONE_AGE_IDS) {
    const sprite = getBuildingSprite(id);
    assert.ok(sprite, `Expected sprite for "${id}"`);
    assert.equal(sprite.id, id);
  }
});

test('Sprite Data (4a): each building sprite matches exact footprint * 16px dimensions', () => {
  for (const def of STONE_AGE_BUILDING_DEFINITIONS) {
    const sprite = getBuildingSprite(def.id);
    assert.ok(sprite, `Missing sprite for ${def.id}`);
    const expectedWidth = def.footprint.width * 16;
    const expectedHeight = def.footprint.height * 16;
    assert.equal(sprite.width, expectedWidth, `${def.id} width mismatch`);
    assert.equal(sprite.height, expectedHeight, `${def.id} height mismatch`);
    assert.equal(sprite.rows.length, expectedHeight, `${def.id} rows length mismatch`);
    for (let y = 0; y < sprite.rows.length; y++) {
      assert.equal(
        sprite.rows[y].length,
        expectedWidth,
        `${def.id} row ${y} length mismatch`
      );
    }
  }
});

test('Sprite Palette (4a): all non-transparent characters belong to the allowed Tiny Town palette and use #3f2631 outlines', () => {
  const result = validateAllSpriteData();
  assert.equal(result.valid, true, result.errors.join('; '));

  for (const sprite of Object.values(STONE_AGE_SPRITE_DATA)) {
    let filledPixels = 0;
    let outlinePixels = 0;
    for (const row of sprite.rows) {
      for (const ch of row) {
        if (ch === '.') continue;
        filledPixels++;
        const hex = TINY_TOWN_PALETTE[ch];
        assert.ok(hex, `Unmapped char "${ch}" in ${sprite.id}`);
        assert.ok(ALLOWED_TINY_TOWN_HEX_SET.has(hex), `Disallowed hex "${hex}" in ${sprite.id}`);
        if (hex === '#3f2631') outlinePixels++;
      }
    }
    assert.ok(filledPixels > 40, `${sprite.id} must have substantial artwork`);
    assert.ok(outlinePixels > 10, `${sprite.id} must include #3f2631 outlines`);
  }
});

test('Sprite Validator (4a): catches dimension mismatch and unknown palette characters', () => {
  const invalidSize = validatePixelSpriteData({
    id: 'bad_size',
    width: 4,
    height: 2,
    rows: ['kkkk', 'kk'],
    reusedTiles: [],
  });
  assert.equal(invalidSize.valid, false);
  assert.ok(invalidSize.errors.some((e) => e.includes('width mismatch')));

  const invalidColor = validatePixelSpriteData({
    id: 'bad_color',
    width: 2,
    height: 2,
    rows: ['kZ', 'kk'],
    reusedTiles: [],
  });
  assert.equal(invalidColor.valid, false);
  assert.ok(invalidColor.errors.some((e) => e.includes('invalid palette key "Z"')));
});

test('Sprite Registry (4a): getBuildingSprite returns null safely for unknown or empty IDs', () => {
  assert.equal(getBuildingSprite('unknown_building_id'), null);
  assert.equal(getBuildingSprite('bronze_age_foundry'), null);
  assert.equal(getBuildingSprite(''), null);
  assert.equal(getBuildingSprite(undefined as unknown as string), null);
});

test('Terrain Hash (4a): getTerrainTile is deterministic for positive/negative coordinates and flowers are sparse', () => {
  const counts: Record<number, number> = { 0: 0, 1: 0, 2: 0 };

  for (let y = -10; y < 10; y++) {
    for (let x = -10; x < 10; x++) {
      const first = getTerrainTile('grass', x, y);
      const second = getTerrainTile('grass', x, y);
      assert.deepEqual(first, second, `Non-deterministic tile at (${x}, ${y})`);
      assert.equal(first.pack, 'tiny-town');
      assert.equal(first.sheetPath, '/assets/sprites/kenney-tiny-town/tilemap_packed.png');
      assert.ok(
        first.tileIndex === 0 || first.tileIndex === 1 || first.tileIndex === 2,
        `Unexpected grass tile index ${first.tileIndex}`
      );
      counts[first.tileIndex]++;
    }
  }

  const grassTotal = counts[0] + counts[1];
  assert.ok(grassTotal > 320, `Expected grass (0+1) to dominate 400 cells, got ${grassTotal}`);
  assert.ok(counts[1] > counts[2], `Expected grass tufts (${counts[1]}) > flowers (${counts[2]})`);
  assert.ok(counts[2] > 0 && counts[2] <= 40, `Expected sparse flowers (>0, <=10%), got ${counts[2]}`);
});

test('PixelSprite SSR (4a): merges adjacent same-color pixels into horizontal rects and sets crispEdges', () => {
  const sprite = getBuildingSprite('stone_age_campfire')!;
  const runs = computeSpriteRects(sprite);

  let nonTransparentCount = 0;
  for (const row of sprite.rows) {
    for (const ch of row) {
      if (ch !== '.') nonTransparentCount++;
    }
  }
  assert.ok(
    runs.length < nonTransparentCount,
    `Expected RLE runs (${runs.length}) < raw pixels (${nonTransparentCount})`
  );
  assert.ok(runs.some((r) => r.width > 1), 'Expected merged horizontal <rect> segments');

  const html = renderToString(
    React.createElement(PixelSprite, {
      sprite,
      width: 32,
      height: 32,
      ariaLabel: 'Campfire Sprite',
    })
  );
  assert.ok(html.includes('<svg'), 'Must render inline <svg>');
  assert.ok(html.includes('shape-rendering="crispEdges"'), 'Must set shape-rendering="crispEdges"');
  assert.ok(html.includes('viewBox="0 0 16 16"'), 'Must preserve sprite pixel viewBox');
  assert.ok(html.includes('data-sprite-id="stone_age_campfire"'));
  assert.ok(html.includes('<rect '), 'Must render horizontal <rect> elements');
});

test('TileImage SSR (4a): points to /assets/sprites/ CC0 packed sheet with pixelated rendering and 12x11 offsets', () => {
  const coords = getTileSourceCoords(107); // row 8, col 11 -> x = 176, y = 128
  assert.equal(coords.col, 11);
  assert.equal(coords.row, 8);
  assert.equal(coords.x, 176);
  assert.equal(coords.y, 128);

  const townHtml = renderToString(
    React.createElement(TileImage, {
      pack: 'tiny-town',
      tileIndex: 2,
      size: 24,
    })
  );
  assert.ok(
    townHtml.includes('src="/assets/sprites/kenney-tiny-town/tilemap_packed.png"'),
    'Must use root /assets/sprites/ path for tiny-town'
  );
  assert.ok(townHtml.includes('image-rendering:pixelated'), 'Must apply pixelated image-rendering');
  assert.ok(townHtml.includes('data-tile-index="2"'));

  const dungeonHtml = renderToString(
    React.createElement(TileImage, {
      pack: 'tiny-dungeon',
      tileIndex: 85,
      size: 32,
    })
  );
  assert.ok(
    dungeonHtml.includes('src="/assets/sprites/kenney-tiny-dungeon/tilemap_packed.png"'),
    'Must use root /assets/sprites/ path for tiny-dungeon'
  );
});

test('MapGridView SSR (4a): renders Tiny Town grass tiles, building PixelSprites, and safe fallback for unknown IDs', () => {
  const baseState = createInitialCivilizationState();
  const stateWithBuildings = {
    ...baseState,
    buildings: [
      {
        id: 'b_camp',
        definitionId: 'stone_age_campfire',
        position: { x: 2, y: 2 },
        level: 1,
        placedAt: 1700000000000,
      },
      {
        id: 'b_granary',
        definitionId: 'stone_age_food_cache',
        position: { x: 4, y: 4 },
        level: 2,
        placedAt: 1700000000000,
      },
      {
        id: 'b_unknown',
        definitionId: 'unknown_future_era_building',
        position: { x: 1, y: 5 },
        level: 1,
        placedAt: 1700000000000,
      },
    ],
  };

  const html = renderToString(
    React.createElement(MapGridView, {
      civilizationState: stateWithBuildings,
      placementDef: null,
      onPlaceBuilding: () => {},
      onInspectBuilding: () => {},
    })
  );

  // UX-5: Terrain rendered via single composite bitmap canvas (no per-cell TileImage <img>)
  assert.ok(html.includes('data-testid="map-terrain-bitmap"'));
  assert.ok(html.includes('image-rendering:pixelated'));
  assert.equal(html.includes('<img'), false);
  // Stone Age building sprites rendered inline via PixelSprite
  assert.ok(html.includes('data-sprite-id="stone_age_campfire"'));
  assert.ok(html.includes('data-sprite-id="stone_age_food_cache"'));
  assert.ok(html.includes('Lv.2'), 'Granary level badge must remain visible');
  // Unknown building renders safely with fallback Lucide hammer icon
  assert.ok(html.includes('title="unknown_future_era_building (Lv.1)"'));
  // Existing camera controls remain unchanged
  assert.ok(html.includes('100%'));
  assert.ok(html.includes('title="Zoom In"'));
});

test('BuildingCatalogPanel SSR (4a): renders pixel sprites for all 6 Stone Age buildings while keeping strings intact', () => {
  const html = renderToString(
    React.createElement(BuildingCatalogPanel, {
      isOpen: true,
      onClose: () => {},
      playerLevel: 2,
      playerCoins: 500,
      lifetimeFocusMinutes: 300,
      onSelectBuilding: () => {},
    })
  );

  for (const id of EXPECTED_STONE_AGE_IDS) {
    assert.ok(html.includes(`data-sprite-id="${id}"`), `Catalog missing sprite for ${id}`);
  }
  assert.ok(html.includes('Meditation Cave'));
  assert.ok(html.includes('Primitive Granary'));
});

test('BuildingDetailsModal SSR (4a): renders building sprite in header and falls back safely for unknown IDs', () => {
  const caveHtml = renderToString(
    React.createElement(BuildingDetailsModal, {
      building: {
        id: 'b_cave',
        definitionId: 'stone_age_study_cave',
        position: { x: 3, y: 4 },
        level: 1,
        placedAt: 1700000000000,
      },
      onClose: () => {},
      onRemove: async () => {},
    })
  );

  assert.ok(caveHtml.includes('data-sprite-id="stone_age_study_cave"'));
  assert.ok(caveHtml.includes('Meditation Cave'));
  assert.ok(caveHtml.includes('Upgrade Building'));
  assert.ok(caveHtml.includes('data-testid="cave-village-section"'));
  assert.ok(caveHtml.includes('2 → 4 Villager capacity'));

  const elderHutHtml = renderToString(
    React.createElement(BuildingDetailsModal, {
      building: {
        id: 'b_elder_hut',
        definitionId: 'stone_age_elder_hut',
        position: { x: 0, y: 0 },
        level: 1,
        placedAt: 1700000000000,
      },
      onClose: () => {},
      onRemove: async () => {},
    })
  );
  assert.ok(elderHutHtml.includes('data-sprite-id="stone_age_elder_hut"'));
  assert.ok(elderHutHtml.includes('Fixed effect · Cannot be upgraded'));

  const unknownHtml = renderToString(
    React.createElement(BuildingDetailsModal, {
      building: {
        id: 'b_other',
        definitionId: 'nonexistent_monument',
        position: { x: 1, y: 1 },
        level: 1,
        placedAt: 1700000000000,
      },
      onClose: () => {},
      onRemove: async () => {},
    })
  );
  assert.ok(unknownHtml.includes('nonexistent_monument'));
  assert.ok(!unknownHtml.includes('data-sprite-id="nonexistent_monument"'));
});

test('SpriteGallery & #sprites route (4a): shows 1x/2x/4x in web preview and is never exposed in live Chrome Extension', () => {
  const galleryHtml = renderToString(React.createElement(SpriteGallery));
  for (const id of EXPECTED_STONE_AGE_IDS) {
    assert.ok(galleryHtml.includes(`data-sprite-id="${id}"`));
  }
  assert.ok(galleryHtml.includes('1×'));
  assert.ok(galleryHtml.includes('2×'));
  assert.ok(galleryHtml.includes('4×'));
  assert.ok(galleryHtml.includes('/assets/sprites/kenney-tiny-town/tilemap_packed.png'));

  const g = globalThis as unknown as {
    window?: { location?: { hash: string }; addEventListener?: () => void; removeEventListener?: () => void };
    chrome?: unknown;
  };
  const prevWindow = g.window;
  const prevChrome = g.chrome;

  try {
    // 1. Standalone Web Preview with #sprites -> renders SpriteGallery
    Reflect.deleteProperty(g, 'chrome');
    g.window = {
      location: { hash: '#sprites' },
      addEventListener: () => {},
      removeEventListener: () => {},
    };
    const previewSpritesHtml = renderToString(React.createElement(App));
    assert.ok(previewSpritesHtml.includes('data-testid="sprite-gallery-page"'));

    // 2. Live Chrome Extension even if #sprites hash is present -> MUST NOT render SpriteGallery
    g.chrome = { runtime: { sendMessage: () => {} } };
    const extHtml = renderToString(React.createElement(App));
    assert.ok(!extHtml.includes('data-testid="sprite-gallery-page"'));
    assert.ok(extHtml.includes('Your Civilization'));
  } finally {
    if (prevWindow === undefined) {
      Reflect.deleteProperty(g, 'window');
    } else {
      g.window = prevWindow;
    }
    if (prevChrome === undefined) {
      Reflect.deleteProperty(g, 'chrome');
    } else {
      g.chrome = prevChrome;
    }
  }
});

test('Terrain Registry (4a-2 V2): getCellDecorVisual guards non-finite inputs and resolves unlocked/locked visuals', () => {
  assert.equal(getCellDecorVisual(Number.NaN, 0, true), null);
  assert.equal(getCellDecorVisual(0, Number.POSITIVE_INFINITY, false), null);

  const unlocked = getCellDecorVisual(0, 0, true);
  assert.ok(unlocked);
  assert.equal(unlocked.isDarkened, false);
  assert.ok(unlocked.kind !== 'forest_tree' && unlocked.kind !== 'forest_canopy' && unlocked.kind !== 'forest_clearing');

  const locked = getCellDecorVisual(-1, -1, false);
  assert.ok(locked);
  assert.equal(locked.isDarkened, true);
  assert.ok(
    locked.kind === 'forest_canopy' || locked.kind === 'forest_tree' || locked.kind === 'forest_clearing'
  );
  assert.ok(
    REUSED_TINY_TOWN_TILES.GRASS_PLAIN === locked.baseTile ||
      REUSED_TINY_TOWN_TILES.GRASS_TUFTS === locked.baseTile
  );
});

test('MapGridView & SpriteGallery SSR (Stage B): MapGridView renders 24x24 stage with 2-chunk forest border and SpriteGallery showcases Stage B units', () => {
  const baseState = createInitialCivilizationState();
  const mapHtml = renderToString(
    React.createElement(MapGridView, {
      civilizationState: baseState,
      placementDef: null,
      onPlaceBuilding: () => {},
      onInspectBuilding: () => {},
    })
  );

  // 8x8 initial grid + 2-chunk (8-cell) forest margin on each side -> 24x24 render stage
  assert.ok(mapHtml.includes('data-render-width="24"'));
  assert.ok(mapHtml.includes('data-render-height="24"'));
  assert.ok(mapHtml.includes('data-testid="map-terrain-bitmap"'));
  assert.ok(mapHtml.includes(':0.44:'));
  assert.ok(mapHtml.includes('data-unlocked="true"'));
  assert.ok(mapHtml.includes('data-unlocked="false"'));
  assert.ok(!mapHtml.includes('data-terrain-id='));

  const galleryHtml = renderToString(React.createElement(SpriteGallery));
  assert.ok(galleryHtml.includes('data-testid="gallery-landscape-v2"'));
  assert.ok(galleryHtml.includes('data-testid="gallery-canopy-grove_2x2_green"'));
  assert.ok(galleryHtml.includes('data-testid="gallery-canopy-grove_2x2_orange"'));
  assert.ok(galleryHtml.includes('data-testid="gallery-canopy-cross_b_green"'));
  assert.ok(galleryHtml.includes('data-testid="gallery-canopy-cross_b_orange"'));
  assert.ok(galleryHtml.includes('data-testid="gallery-canopy-tall_1x2_green"'));
  assert.ok(galleryHtml.includes('data-testid="gallery-canopy-tall_1x2_orange"'));
  assert.ok(!galleryHtml.includes('data-testid="gallery-canopy-diamond_3x3_green"'));
  assert.ok(!galleryHtml.includes('data-testid="gallery-canopy-pair_1x2_green"'));
  assert.ok(galleryHtml.includes('data-testid="gallery-unlocked_sample"'));
  assert.ok(galleryHtml.includes('data-testid="gallery-locked_sample"'));
  assert.ok(galleryHtml.includes('data-testid="gallery-rect_border_sample"'));
  assert.ok(galleryHtml.includes('data-testid="gallery-l_border_sample"'));
  assert.ok(galleryHtml.includes('17 · Sprout'));
  assert.ok(galleryHtml.includes('29 · Mushrooms'));
});
