/**
 * Deterministic visual landscape & locked-forest generator for MapGridView.
 * Pure UI presentation layer:
 * - Zero gameplay state, zero persistence, zero placement blocking, zero economic effects.
 * - Unlocked territory (`isUnlocked === true`): grass (0, 1), wildflowers (2), sparse dirt patches
 *   (12–14, 24–26, 36–38, inner-notch 39–42), rare mossy stone (43), sparse sprout/mushroom
 *   accents (17, 29), and rare decorative green bushes (5, <= ~5%) strictly on plain grass (0).
 *   Never renders trees or canopy fragments.
 * - Locked territory (`isUnlocked === false`, Stage 4a-3):
 *   Uses ONLY the 6 mandatory multi-tile recipes (M1–M6) + crisp round green bush filler (5):
 *     M1. Tall autumn tree (1×2):   3 (top) / 15 (bottom)
 *     M2. Tall green tree (1×2):    4 (top) / 16 (bottom)
 *     M3. Green cluster (2×2):      [6, 8] / [30, 32]
 *     M4. Autumn cluster (2×2):     [9, 11] / [33, 35]
 *     M5. Green cross (3×3):        [—, 7, —] / [18, 19, 20] / [—, 31, —]
 *     M6. Autumn cross (3×3):       [—, 10, —] / [21, 22, 23] / [—, 34, —]
 *     Filler (1×1):                 5 (green bush — full 4-sided outline)
 *   - Tiles 15 and 16 NEVER stand alone (only as bottom of M1/M2, avoiding sliced flat tops).
 *   - Retired standalone cones (27, 28) are NEVER used; 3 and 4 appear ONLY in M1/M2.
 *   - Canopy fragments (6–11, 18–23, 30–35) NEVER stand alone or get clipped at unlocked borders.
 *   - Corner cells ("—") of M5/M6 belong to the 3×3 block, stay locked & clear of other units.
 *   - Tree density targeted at ~30% (25%–35% overlay cells; 65%–75% darkened grass clearings).
 *   - Background-only darkening (`LOCKED_FOREST_OVERLAY_OPACITY`) keeps tree overlays at full Tiny Town color.
 */

import { CHUNK_WIDTH, CHUNK_HEIGHT } from '../../../core/civilization/constants.ts';
import { REUSED_TINY_TOWN_TILES } from './spriteData.ts';

export const TERRAIN_DECOR_SEED = 5202402;

/** Darkens ONLY the ground layer under locked forest so trees retain crisp Tiny Town contrast */
export const LOCKED_FOREST_OVERLAY_OPACITY = 0.44;

/** Target tree density (~30%, bounded 25%–35%) and corresponding clearing ratio (65%–75%) on 24×24 samples */
export const FOREST_TARGET_DENSITY_MIN = 0.25;
export const FOREST_TARGET_DENSITY_MAX = 0.35;
export const FOREST_CLEARING_MIN_RATIO = 0.65;
export const FOREST_CLEARING_MAX_RATIO = 0.75;

export type CellDecorKind =
  | 'grass'
  | 'flowers'
  | 'dirt'
  | 'stone'
  | 'sprout'
  | 'mushroom'
  | 'bush'
  | 'forest_clearing'
  | 'forest_tree'
  | 'forest_canopy';

export interface CellDecor {
  readonly baseTile: number;
  readonly overlayTile: number | null;
  readonly isDarkened: boolean;
  readonly kind: CellDecorKind;
}

export type ForestUnitKind =
  | 'tall_orange' // M1
  | 'tall_green' // M2
  | 'cluster_a_green' // M3
  | 'cluster_a_orange' // M4
  | 'cross_b_green' // M5
  | 'cross_b_orange' // M6
  | 'bush_green'; // Filler 5

export type ForestRecipeId = 'M1' | 'M2' | 'M3' | 'M4' | 'M5' | 'M6' | 'FILLER';

export interface ForestUnitCellOffset {
  readonly dx: number;
  readonly dy: number;
  readonly tileIndex: number;
}

export interface ForestUnitTemplate {
  readonly kind: ForestUnitKind;
  readonly recipeId: ForestRecipeId;
  readonly color: 'green' | 'orange';
  readonly width: number;
  readonly height: number;
  readonly cellCount: number;
  readonly isCanopyCluster: boolean;
  readonly cells: readonly ForestUnitCellOffset[];
}

export const UNLOCKED_GRASS_TILES: readonly number[] = Object.freeze([
  REUSED_TINY_TOWN_TILES.GRASS_PLAIN,
  REUSED_TINY_TOWN_TILES.GRASS_TUFTS,
  REUSED_TINY_TOWN_TILES.GRASS_FLOWERS,
]);

export const DIRT_PATCH_TILES: readonly number[] = Object.freeze([
  REUSED_TINY_TOWN_TILES.DIRT_TL,
  REUSED_TINY_TOWN_TILES.DIRT_T,
  REUSED_TINY_TOWN_TILES.DIRT_TR,
  REUSED_TINY_TOWN_TILES.DIRT_L,
  REUSED_TINY_TOWN_TILES.DIRT_CENTER,
  REUSED_TINY_TOWN_TILES.DIRT_R,
  REUSED_TINY_TOWN_TILES.DIRT_BL,
  REUSED_TINY_TOWN_TILES.DIRT_B,
  REUSED_TINY_TOWN_TILES.DIRT_BR,
  REUSED_TINY_TOWN_TILES.DIRT_NOTCH_TL,
  REUSED_TINY_TOWN_TILES.DIRT_NOTCH_TR,
  REUSED_TINY_TOWN_TILES.DIRT_NOTCH_BR,
  REUSED_TINY_TOWN_TILES.DIRT_NOTCH_BL,
]);

export const MOSSY_STONE_TILE = REUSED_TINY_TOWN_TILES.MOSSY_STONE;

export const UNLOCKED_MICRO_DECOR_TILES: readonly number[] = Object.freeze([
  REUSED_TINY_TOWN_TILES.SPROUT,
  REUSED_TINY_TOWN_TILES.MUSHROOMS,
]);

export const UNLOCKED_ALLOWED_OVERLAY_TILES: readonly number[] = Object.freeze([
  ...UNLOCKED_MICRO_DECOR_TILES,
  REUSED_TINY_TOWN_TILES.GREEN_BUSH,
]);

/** Allowed 1×1 filler ONLY: cleanly-outlined green bush 5 (never cut-top 15/16, 3/4, 27/28, or canopy fragments) */
export const FOREST_FILLER_TILES: readonly number[] = Object.freeze([
  REUSED_TINY_TOWN_TILES.GREEN_BUSH, // 5
]);

export const STANDALONE_FOREST_TILES: readonly number[] = FOREST_FILLER_TILES;

/** Retired single-tile pine cones that must NEVER appear in Stage 4a-3 locked forest */
export const RETIRED_CONE_TILES: readonly number[] = Object.freeze([
  REUSED_TINY_TOWN_TILES.TREE_PINE_ORANGE, // 27
  REUSED_TINY_TOWN_TILES.TREE_PINE_GREEN, // 28
]);

/** M1 & M2: Tall 1×2 two-cell vertical tree pairs */
export const TALL_TREE_1X2_ORANGE = Object.freeze([
  REUSED_TINY_TOWN_TILES.TREE_CONIFER_ORANGE, // 3 (top)
  REUSED_TINY_TOWN_TILES.TREE_ROUND_ORANGE, // 15 (bottom/trunk)
] as const);

export const TALL_TREE_1X2_GREEN = Object.freeze([
  REUSED_TINY_TOWN_TILES.TREE_CONIFER_GREEN, // 4 (top)
  REUSED_TINY_TOWN_TILES.TREE_ROUND_GREEN, // 16 (bottom/trunk)
] as const);

export const TALL_TREE_TILES: readonly number[] = Object.freeze([
  ...TALL_TREE_1X2_ORANGE,
  ...TALL_TREE_1X2_GREEN,
]);

/** M3 & M4: 2×2 seamless groves */
export const CANOPY_GROVE_2X2_GREEN = Object.freeze([
  [REUSED_TINY_TOWN_TILES.CANOPY_GREEN_TL, REUSED_TINY_TOWN_TILES.CANOPY_GREEN_TR], // 6, 8
  [REUSED_TINY_TOWN_TILES.CANOPY_GREEN_BL, REUSED_TINY_TOWN_TILES.CANOPY_GREEN_BR], // 30, 32
] as const);

export const CANOPY_GROVE_2X2_ORANGE = Object.freeze([
  [REUSED_TINY_TOWN_TILES.CANOPY_ORANGE_TL, REUSED_TINY_TOWN_TILES.CANOPY_ORANGE_TR], // 9, 11
  [REUSED_TINY_TOWN_TILES.CANOPY_ORANGE_BL, REUSED_TINY_TOWN_TILES.CANOPY_ORANGE_BR], // 33, 35
] as const);

/** M5 & M6: 3×3 cross groves (corners "—" belong to the block and stay empty) */
export const CANOPY_CROSS_B_GREEN = Object.freeze([
  [null, REUSED_TINY_TOWN_TILES.CANOPY_GREEN_T, null], // —, 7, —
  [
    REUSED_TINY_TOWN_TILES.CANOPY_GREEN_L, // 18
    REUSED_TINY_TOWN_TILES.CANOPY_GREEN_CENTER, // 19
    REUSED_TINY_TOWN_TILES.CANOPY_GREEN_R, // 20
  ],
  [null, REUSED_TINY_TOWN_TILES.CANOPY_GREEN_B, null], // —, 31, —
] as const);

export const CANOPY_CROSS_B_ORANGE = Object.freeze([
  [null, REUSED_TINY_TOWN_TILES.CANOPY_ORANGE_T, null], // —, 10, —
  [
    REUSED_TINY_TOWN_TILES.CANOPY_ORANGE_L, // 21
    REUSED_TINY_TOWN_TILES.CANOPY_ORANGE_CENTER, // 22
    REUSED_TINY_TOWN_TILES.CANOPY_ORANGE_R, // 23
  ],
  [null, REUSED_TINY_TOWN_TILES.CANOPY_ORANGE_B, null], // —, 34, —
] as const);

export const CANOPY_FRAGMENT_TILES: readonly number[] = Object.freeze([
  REUSED_TINY_TOWN_TILES.CANOPY_GREEN_TL,
  REUSED_TINY_TOWN_TILES.CANOPY_GREEN_T,
  REUSED_TINY_TOWN_TILES.CANOPY_GREEN_TR,
  REUSED_TINY_TOWN_TILES.CANOPY_ORANGE_TL,
  REUSED_TINY_TOWN_TILES.CANOPY_ORANGE_T,
  REUSED_TINY_TOWN_TILES.CANOPY_ORANGE_TR,
  REUSED_TINY_TOWN_TILES.CANOPY_GREEN_L,
  REUSED_TINY_TOWN_TILES.CANOPY_GREEN_CENTER,
  REUSED_TINY_TOWN_TILES.CANOPY_GREEN_R,
  REUSED_TINY_TOWN_TILES.CANOPY_ORANGE_L,
  REUSED_TINY_TOWN_TILES.CANOPY_ORANGE_CENTER,
  REUSED_TINY_TOWN_TILES.CANOPY_ORANGE_R,
  REUSED_TINY_TOWN_TILES.CANOPY_GREEN_BL,
  REUSED_TINY_TOWN_TILES.CANOPY_GREEN_B,
  REUSED_TINY_TOWN_TILES.CANOPY_GREEN_BR,
  REUSED_TINY_TOWN_TILES.CANOPY_ORANGE_BL,
  REUSED_TINY_TOWN_TILES.CANOPY_ORANGE_B,
  REUSED_TINY_TOWN_TILES.CANOPY_ORANGE_BR,
]);

export const LOCKED_FOREST_TILES: readonly number[] = Object.freeze([
  ...FOREST_FILLER_TILES,
  ...TALL_TREE_TILES,
  ...CANOPY_FRAGMENT_TILES,
]);

/** Tiles strictly forbidden from ever appearing on unlocked territory (trees + canopy fragments) */
export const FORBIDDEN_UNLOCKED_TREE_TILES: readonly number[] = Object.freeze([
  ...RETIRED_CONE_TILES, // 27, 28
  ...TALL_TREE_TILES, // 3, 4, 15, 16
  ...CANOPY_FRAGMENT_TILES, // 6..11, 18..23, 30..35
]);

export const FOREST_UNIT_TEMPLATES: Readonly<Record<ForestUnitKind, ForestUnitTemplate>> =
  Object.freeze({
    tall_orange: {
      kind: 'tall_orange',
      recipeId: 'M1',
      color: 'orange',
      width: 1,
      height: 2,
      cellCount: 2,
      isCanopyCluster: false,
      cells: Object.freeze([
        { dx: 0, dy: 0, tileIndex: REUSED_TINY_TOWN_TILES.TREE_CONIFER_ORANGE }, // 3
        { dx: 0, dy: 1, tileIndex: REUSED_TINY_TOWN_TILES.TREE_ROUND_ORANGE }, // 15
      ]),
    },
    tall_green: {
      kind: 'tall_green',
      recipeId: 'M2',
      color: 'green',
      width: 1,
      height: 2,
      cellCount: 2,
      isCanopyCluster: false,
      cells: Object.freeze([
        { dx: 0, dy: 0, tileIndex: REUSED_TINY_TOWN_TILES.TREE_CONIFER_GREEN }, // 4
        { dx: 0, dy: 1, tileIndex: REUSED_TINY_TOWN_TILES.TREE_ROUND_GREEN }, // 16
      ]),
    },
    cluster_a_green: {
      kind: 'cluster_a_green',
      recipeId: 'M3',
      color: 'green',
      width: 2,
      height: 2,
      cellCount: 4,
      isCanopyCluster: true,
      cells: Object.freeze([
        { dx: 0, dy: 0, tileIndex: REUSED_TINY_TOWN_TILES.CANOPY_GREEN_TL }, // 6
        { dx: 1, dy: 0, tileIndex: REUSED_TINY_TOWN_TILES.CANOPY_GREEN_TR }, // 8
        { dx: 0, dy: 1, tileIndex: REUSED_TINY_TOWN_TILES.CANOPY_GREEN_BL }, // 30
        { dx: 1, dy: 1, tileIndex: REUSED_TINY_TOWN_TILES.CANOPY_GREEN_BR }, // 32
      ]),
    },
    cluster_a_orange: {
      kind: 'cluster_a_orange',
      recipeId: 'M4',
      color: 'orange',
      width: 2,
      height: 2,
      cellCount: 4,
      isCanopyCluster: true,
      cells: Object.freeze([
        { dx: 0, dy: 0, tileIndex: REUSED_TINY_TOWN_TILES.CANOPY_ORANGE_TL }, // 9
        { dx: 1, dy: 0, tileIndex: REUSED_TINY_TOWN_TILES.CANOPY_ORANGE_TR }, // 11
        { dx: 0, dy: 1, tileIndex: REUSED_TINY_TOWN_TILES.CANOPY_ORANGE_BL }, // 33
        { dx: 1, dy: 1, tileIndex: REUSED_TINY_TOWN_TILES.CANOPY_ORANGE_BR }, // 35
      ]),
    },
    cross_b_green: {
      kind: 'cross_b_green',
      recipeId: 'M5',
      color: 'green',
      width: 3,
      height: 3,
      cellCount: 5,
      isCanopyCluster: true,
      cells: Object.freeze([
        { dx: 1, dy: 0, tileIndex: REUSED_TINY_TOWN_TILES.CANOPY_GREEN_T }, // 7
        { dx: 0, dy: 1, tileIndex: REUSED_TINY_TOWN_TILES.CANOPY_GREEN_L }, // 18
        { dx: 1, dy: 1, tileIndex: REUSED_TINY_TOWN_TILES.CANOPY_GREEN_CENTER }, // 19
        { dx: 2, dy: 1, tileIndex: REUSED_TINY_TOWN_TILES.CANOPY_GREEN_R }, // 20
        { dx: 1, dy: 2, tileIndex: REUSED_TINY_TOWN_TILES.CANOPY_GREEN_B }, // 31
      ]),
    },
    cross_b_orange: {
      kind: 'cross_b_orange',
      recipeId: 'M6',
      color: 'orange',
      width: 3,
      height: 3,
      cellCount: 5,
      isCanopyCluster: true,
      cells: Object.freeze([
        { dx: 1, dy: 0, tileIndex: REUSED_TINY_TOWN_TILES.CANOPY_ORANGE_T }, // 10
        { dx: 0, dy: 1, tileIndex: REUSED_TINY_TOWN_TILES.CANOPY_ORANGE_L }, // 21
        { dx: 1, dy: 1, tileIndex: REUSED_TINY_TOWN_TILES.CANOPY_ORANGE_CENTER }, // 22
        { dx: 2, dy: 1, tileIndex: REUSED_TINY_TOWN_TILES.CANOPY_ORANGE_R }, // 23
        { dx: 1, dy: 2, tileIndex: REUSED_TINY_TOWN_TILES.CANOPY_ORANGE_B }, // 34
      ]),
    },
    bush_green: {
      kind: 'bush_green',
      recipeId: 'FILLER',
      color: 'green',
      width: 1,
      height: 1,
      cellCount: 1,
      isCanopyCluster: false,
      cells: Object.freeze([{ dx: 0, dy: 0, tileIndex: REUSED_TINY_TOWN_TILES.GREEN_BUSH }]), // 5
    },
  });

export interface PlacedForestUnit {
  readonly unitId: number;
  readonly kind: ForestUnitKind;
  readonly originX: number;
  readonly originY: number;
}

export interface ChunkForestCell {
  readonly tileIndex: number;
  readonly unitId: number;
  readonly unitKind: ForestUnitKind;
  readonly isCanopy: boolean;
}

export interface ChunkForestLayout {
  readonly chunkX: number;
  readonly chunkY: number;
  readonly units: readonly PlacedForestUnit[];
  readonly cells: ReadonlyArray<ReadonlyArray<ChunkForestCell | null>>;
  readonly totalForestCells: number;
}

/** Deterministic integer block origin (safe for negative coordinates and avoids -0) */
export function getAlignedOrigin(coord: number, size: number): number {
  const safe = Number.isFinite(coord) ? Math.trunc(coord) : 0;
  const origin = Math.floor(safe / size) * size;
  return origin === 0 ? 0 : origin;
}

/** Floor integer division (safe for negative coordinates and avoids -0) */
export function floorDiv(coord: number, divisor: number): number {
  const safe = Number.isFinite(coord) ? Math.trunc(coord) : 0;
  const q = Math.floor(safe / divisor);
  return q === 0 ? 0 : q;
}

/** Deterministic unsigned 32-bit coordinate hash (zero Math.random) */
export function hashTerrainCoords(
  x: number,
  y: number,
  salt = 0,
  seed = TERRAIN_DECOR_SEED
): number {
  const ix = Number.isFinite(x) ? x | 0 : 0;
  const iy = Number.isFinite(y) ? y | 0 : 0;
  let h = (seed ^ salt) | 0;
  h = (h + Math.imul(ix, 374761393)) | 0;
  h = (h + Math.imul(iy, 668265263)) | 0;
  h = (h ^ (h >>> 13)) | 0;
  h = Math.imul(h, 1274126177) | 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/** Deterministic Mulberry32 PRNG producing [0, 1) floats */
function createMulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleInPlace<T>(arr: T[], rand: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

/** Deterministic base grass tile (0 plain ~72%, 1 tufts ~22%, 2 flowers ~6% when allowed) */
function pickGrassBaseTile(
  x: number,
  y: number,
  seed: number,
  allowFlowers: boolean
): number {
  const roll = hashTerrainCoords(x, y, 0x11a5, seed) % 100;
  if (allowFlowers && roll >= 94) {
    return REUSED_TINY_TOWN_TILES.GRASS_FLOWERS;
  }
  if (roll >= 72) {
    return REUSED_TINY_TOWN_TILES.GRASS_TUFTS;
  }
  return REUSED_TINY_TOWN_TILES.GRASS_PLAIN;
}

type DirtShape =
  | { readonly kind: 'none' }
  | { readonly kind: '2x2'; readonly ox: number; readonly oy: number }
  | { readonly kind: '3x3'; readonly ox: number; readonly oy: number }
  | {
      readonly kind: '3x3_notched';
      readonly ox: number;
      readonly oy: number;
      readonly notchCorner: 0 | 1 | 2 | 3; // 0=TL, 1=TR, 2=BL, 3=BR
    };

function getChunkDirtShape(chunkX: number, chunkY: number, seed: number): DirtShape {
  const h = hashTerrainCoords(chunkX, chunkY, 0x64697274, seed);
  const roll = h % 100;

  // ~55% chunks: pure grass (with occasional mossy stone / micro decor)
  if (roll < 55) {
    return { kind: 'none' };
  }

  // ~28% chunks: 2×2 dirt patch inside 4×4 chunk (offset 0..2)
  if (roll < 83) {
    const ox = (h >>> 8) % 3;
    const oy = (h >>> 12) % 3;
    return { kind: '2x2', ox, oy };
  }

  // ~10% chunks: 8-cell notched 3×3 dirt patch using inner-notch corners 39–42
  if (roll < 93) {
    const ox = (h >>> 8) % 2;
    const oy = (h >>> 12) % 2;
    const notchCorner = ((h >>> 16) % 4) as 0 | 1 | 2 | 3;
    return { kind: '3x3_notched', ox, oy, notchCorner };
  }

  // ~7% chunks: full 3×3 dirt patch (offset 0..1)
  const ox = (h >>> 8) % 2;
  const oy = (h >>> 12) % 2;
  return { kind: '3x3', ox, oy };
}

/**
 * Returns the Tiny Town dirt tile index at (x, y) if (x, y) belongs to its 4×4 chunk's
 * sparse dirt patch, or null if the cell is outside any dirt patch.
 */
export function getChunkDirtPatchTile(
  x: number,
  y: number,
  seed = TERRAIN_DECOR_SEED
): number | null {
  const chunkX = getAlignedOrigin(x, CHUNK_WIDTH);
  const chunkY = getAlignedOrigin(y, CHUNK_HEIGHT);
  const lx = x - chunkX;
  const ly = y - chunkY;

  const shape = getChunkDirtShape(chunkX, chunkY, seed);
  if (shape.kind === 'none') return null;

  if (shape.kind === '2x2') {
    const dx = lx - shape.ox;
    const dy = ly - shape.oy;
    if (dx < 0 || dx > 1 || dy < 0 || dy > 1) return null;
    if (dy === 0 && dx === 0) return REUSED_TINY_TOWN_TILES.DIRT_TL;
    if (dy === 0 && dx === 1) return REUSED_TINY_TOWN_TILES.DIRT_TR;
    if (dy === 1 && dx === 0) return REUSED_TINY_TOWN_TILES.DIRT_BL;
    return REUSED_TINY_TOWN_TILES.DIRT_BR;
  }

  const dx = lx - shape.ox;
  const dy = ly - shape.oy;
  if (dx < 0 || dx > 2 || dy < 0 || dy > 2) return null;

  if (shape.kind === '3x3_notched') {
    if (shape.notchCorner === 0 && dx === 0 && dy === 0) return null;
    if (shape.notchCorner === 1 && dx === 2 && dy === 0) return null;
    if (shape.notchCorner === 2 && dx === 0 && dy === 2) return null;
    if (shape.notchCorner === 3 && dx === 2 && dy === 2) return null;

    if (dx === 1 && dy === 1) {
      if (shape.notchCorner === 0) return REUSED_TINY_TOWN_TILES.DIRT_NOTCH_TL;
      if (shape.notchCorner === 1) return REUSED_TINY_TOWN_TILES.DIRT_NOTCH_TR;
      if (shape.notchCorner === 2) return REUSED_TINY_TOWN_TILES.DIRT_NOTCH_BL;
      return REUSED_TINY_TOWN_TILES.DIRT_NOTCH_BR;
    }

    if (shape.notchCorner === 0) {
      if (dx === 1 && dy === 0) return REUSED_TINY_TOWN_TILES.DIRT_TL;
      if (dx === 0 && dy === 1) return REUSED_TINY_TOWN_TILES.DIRT_TL;
    } else if (shape.notchCorner === 1) {
      if (dx === 1 && dy === 0) return REUSED_TINY_TOWN_TILES.DIRT_TR;
      if (dx === 2 && dy === 1) return REUSED_TINY_TOWN_TILES.DIRT_TR;
    } else if (shape.notchCorner === 2) {
      if (dx === 0 && dy === 1) return REUSED_TINY_TOWN_TILES.DIRT_BL;
      if (dx === 1 && dy === 2) return REUSED_TINY_TOWN_TILES.DIRT_BL;
    } else if (shape.notchCorner === 3) {
      if (dx === 2 && dy === 1) return REUSED_TINY_TOWN_TILES.DIRT_BR;
      if (dx === 1 && dy === 2) return REUSED_TINY_TOWN_TILES.DIRT_BR;
    }
  }

  const grid3x3 = [
    [REUSED_TINY_TOWN_TILES.DIRT_TL, REUSED_TINY_TOWN_TILES.DIRT_T, REUSED_TINY_TOWN_TILES.DIRT_TR],
    [REUSED_TINY_TOWN_TILES.DIRT_L, REUSED_TINY_TOWN_TILES.DIRT_CENTER, REUSED_TINY_TOWN_TILES.DIRT_R],
    [REUSED_TINY_TOWN_TILES.DIRT_BL, REUSED_TINY_TOWN_TILES.DIRT_B, REUSED_TINY_TOWN_TILES.DIRT_BR],
  ];
  return grid3x3[dy][dx];
}

function getChunkMossyStoneCoord(
  chunkX: number,
  chunkY: number,
  seed: number
): { lx: number; ly: number } | null {
  const h = hashTerrainCoords(chunkX, chunkY, 0x73746f6e, seed);
  if (h % 100 >= 16) return null;
  const lx = (h >>> 8) % CHUNK_WIDTH;
  const ly = (h >>> 12) % CHUNK_HEIGHT;
  return { lx, ly };
}

type ChunkForestRole = 0 | 1 | 2 | 3;

const FILLER_KINDS: readonly ForestUnitKind[] = ['bush_green'];

function getChunkMacroRole(chunkX: number, chunkY: number, seed: number): ChunkForestRole {
  const cx = floorDiv(chunkX, CHUNK_WIDTH);
  const cy = floorDiv(chunkY, CHUNK_HEIGHT);
  const macroX = floorDiv(cx, 2);
  const macroY = floorDiv(cy, 2);
  const localIdx = (cy - macroY * 2) * 2 + (cx - macroX * 2);

  const macroHash = hashTerrainCoords(macroX, macroY, 0x4d414352, seed);
  const rand = createMulberry32(macroHash);
  const roles: ChunkForestRole[] = [0, 1, 2, 3];
  shuffleInPlace(roles, rand);
  return roles[localIdx];
}

function isBitLocked(lockedMask: number, lx: number, ly: number): boolean {
  return ((lockedMask >>> (ly * CHUNK_WIDTH + lx)) & 1) === 1;
}

/**
 * Checks whether ALL cells of a template's bounding box (width × height, INCLUDING
 * "—" corner cells of M5/M6) are inside the 4×4 chunk, locked, and unoccupied.
 */
function canPlaceTemplateAt(
  occupiedGrid: ReadonlyArray<ReadonlyArray<ForestUnitKind | null>>,
  lockedMask: number,
  template: ForestUnitTemplate,
  ox: number,
  oy: number,
  adjacencyMode: 'none' | 'not_same' | 'any'
): boolean {
  if (ox < 0 || oy < 0 || ox + template.width > CHUNK_WIDTH || oy + template.height > CHUNK_HEIGHT) {
    return false;
  }

  for (let dy = 0; dy < template.height; dy++) {
    for (let dx = 0; dx < template.width; dx++) {
      const gx = ox + dx;
      const gy = oy + dy;
      if (!isBitLocked(lockedMask, gx, gy)) {
        return false;
      }
      if (occupiedGrid[gy][gx] !== null) {
        return false;
      }
      if (adjacencyMode !== 'any') {
        const neighbors: readonly [number, number][] = [
          [gx - 1, gy],
          [gx + 1, gy],
          [gx, gy - 1],
          [gx, gy + 1],
        ];
        for (const [nx, ny] of neighbors) {
          if (nx < 0 || nx >= CHUNK_WIDTH || ny < 0 || ny >= CHUNK_HEIGHT) continue;
          const neighborKind = occupiedGrid[ny][nx];
          if (!neighborKind) continue;
          if (adjacencyMode === 'none') {
            return false;
          }
          if (adjacencyMode === 'not_same' && neighborKind === template.kind) {
            return false;
          }
        }
      }
    }
  }

  return true;
}

function placeUnitOnGrid(
  occupiedGrid: Array<Array<ForestUnitKind | null>>,
  cellGrid: Array<Array<ChunkForestCell | null>>,
  units: PlacedForestUnit[],
  alignedX: number,
  alignedY: number,
  ox: number,
  oy: number,
  template: ForestUnitTemplate,
  unitId: number
): number {
  // Reserve ENTIRE bounding box (including "—" corner cells of M5/M6)
  for (let dy = 0; dy < template.height; dy++) {
    for (let dx = 0; dx < template.width; dx++) {
      occupiedGrid[oy + dy][ox + dx] = template.kind;
    }
  }

  let addedOverlays = 0;
  for (const offset of template.cells) {
    const gx = ox + offset.dx;
    const gy = oy + offset.dy;
    cellGrid[gy][gx] = {
      tileIndex: offset.tileIndex,
      unitId,
      unitKind: template.kind,
      isCanopy: template.isCanopyCluster,
    };
    addedOverlays++;
  }

  units.push({
    unitId,
    kind: template.kind,
    originX: alignedX + ox,
    originY: alignedY + oy,
  });

  return addedOverlays;
}

function tryPlaceTemplate(
  occupiedGrid: Array<Array<ForestUnitKind | null>>,
  cellGrid: Array<Array<ChunkForestCell | null>>,
  units: PlacedForestUnit[],
  alignedX: number,
  alignedY: number,
  lockedMask: number,
  kind: ForestUnitKind,
  rand: () => number,
  nextUnitIdRef: { value: number }
): number {
  const template = FOREST_UNIT_TEMPLATES[kind];
  const maxOx = CHUNK_WIDTH - template.width;
  const maxOy = CHUNK_HEIGHT - template.height;
  const candidates: Array<{ ox: number; oy: number }> = [];
  for (let oy = 0; oy <= maxOy; oy++) {
    for (let ox = 0; ox <= maxOx; ox++) {
      candidates.push({ ox, oy });
    }
  }
  shuffleInPlace(candidates, rand);

  // Prefer natural spacing (no orthogonal neighbor), then non-identical neighbor, then any valid fit
  const chosen =
    candidates.find((c) => canPlaceTemplateAt(occupiedGrid, lockedMask, template, c.ox, c.oy, 'none')) ??
    candidates.find((c) =>
      canPlaceTemplateAt(occupiedGrid, lockedMask, template, c.ox, c.oy, 'not_same')
    ) ??
    candidates.find((c) => canPlaceTemplateAt(occupiedGrid, lockedMask, template, c.ox, c.oy, 'any'));

  if (!chosen) {
    return 0;
  }

  const unitId = nextUnitIdRef.value++;
  return placeUnitOnGrid(
    occupiedGrid,
    cellGrid,
    units,
    alignedX,
    alignedY,
    chosen.ox,
    chosen.oy,
    template,
    unitId
  );
}

function tryPlaceBushFillers(
  occupiedGrid: Array<Array<ForestUnitKind | null>>,
  cellGrid: Array<Array<ChunkForestCell | null>>,
  units: PlacedForestUnit[],
  alignedX: number,
  alignedY: number,
  lockedMask: number,
  count: number,
  rand: () => number,
  nextUnitIdRef: { value: number }
): number {
  let added = 0;
  for (let i = 0; i < count; i++) {
    added += tryPlaceTemplate(
      occupiedGrid,
      cellGrid,
      units,
      alignedX,
      alignedY,
      lockedMask,
      'bush_green',
      rand,
      nextUnitIdRef
    );
  }
  return added;
}

const CHUNK_LAYOUT_CACHE_MAX = 4096;
const chunkLayoutCache = new Map<string, ChunkForestLayout>();

function computeLockedMask(
  alignedX: number,
  alignedY: number,
  isCellUnlockedFn?: (cx: number, cy: number) => boolean
): number {
  if (!isCellUnlockedFn) return 0xffff;
  let mask = 0;
  for (let ly = 0; ly < CHUNK_HEIGHT; ly++) {
    for (let lx = 0; lx < CHUNK_WIDTH; lx++) {
      if (!isCellUnlockedFn(alignedX + lx, alignedY + ly)) {
        mask |= 1 << (ly * CHUNK_WIDTH + lx);
      }
    }
  }
  return mask;
}

/**
 * Generates deterministic, self-contained 4×4 forest layout for chunk `(chunkX, chunkY)`.
 * Respects `isCellUnlockedFn` so NO pattern (including M5/M6 "—" corners) ever touches
 * an unlocked cell or crosses an unlocked border.
 */
export function getChunkForestLayout(
  chunkX: number,
  chunkY: number,
  seed = TERRAIN_DECOR_SEED,
  isCellUnlockedFn?: (cx: number, cy: number) => boolean
): ChunkForestLayout {
  const alignedX = getAlignedOrigin(chunkX, CHUNK_WIDTH);
  const alignedY = getAlignedOrigin(chunkY, CHUNK_HEIGHT);
  const lockedMask = computeLockedMask(alignedX, alignedY, isCellUnlockedFn);
  const cacheKey = `${seed}:${alignedX}:${alignedY}:${lockedMask}`;
  const cached = chunkLayoutCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const chunkHash = hashTerrainCoords(
    floorDiv(alignedX, CHUNK_WIDTH),
    floorDiv(alignedY, CHUNK_HEIGHT),
    0x46525354,
    seed
  );
  const rand = createMulberry32(chunkHash);
  const role = getChunkMacroRole(alignedX, alignedY, seed);

  const occupiedGrid: Array<Array<ForestUnitKind | null>> = Array.from(
    { length: CHUNK_HEIGHT },
    () => Array.from({ length: CHUNK_WIDTH }, () => null)
  );
  const cellGrid: Array<Array<ChunkForestCell | null>> = Array.from(
    { length: CHUNK_HEIGHT },
    () => Array.from({ length: CHUNK_WIDTH }, () => null)
  );
  const units: PlacedForestUnit[] = [];
  const nextUnitIdRef = { value: 1 };
  let totalForestCells = 0;

  // Step 1: Balanced ~30% forest coverage per 2×2 macro-chunk (~19.5 / 64 cells = ~30.5%)
  // using ONLY M1–M6 complete recipes + sparse bush #5 (never cut-top 15/16 standalone!).
  const crossKind: ForestUnitKind = rand() < 0.62 ? 'cross_b_green' : 'cross_b_orange';
  const clusterKind: ForestUnitKind = rand() < 0.66 ? 'cluster_a_green' : 'cluster_a_orange';
  const altClusterKind: ForestUnitKind =
    clusterKind === 'cluster_a_green' ? 'cluster_a_orange' : 'cluster_a_green';
  const firstTall: ForestUnitKind = rand() < 0.64 ? 'tall_green' : 'tall_orange';
  const secondTall: ForestUnitKind =
    firstTall === 'tall_green'
      ? rand() < 0.65
        ? 'tall_orange'
        : 'tall_green'
      : 'tall_green';

  if (role === 0) {
    // Role 0 (~5.5 cells): 3×3 Cross (M5 or M6 = 5 cells) + 0–1 spaced bush #5
    const placedCross = tryPlaceTemplate(
      occupiedGrid,
      cellGrid,
      units,
      alignedX,
      alignedY,
      lockedMask,
      crossKind,
      rand,
      nextUnitIdRef
    );
    totalForestCells += placedCross;

    if (placedCross === 0) {
      // Narrow 2-cell border strip where 3×3 doesn't fit: use M3/M4 (2×2) or M1/M2 (1×2) + 1 bush
      const placedCluster = tryPlaceTemplate(
        occupiedGrid,
        cellGrid,
        units,
        alignedX,
        alignedY,
        lockedMask,
        clusterKind,
        rand,
        nextUnitIdRef
      );
      totalForestCells += placedCluster;
      if (placedCluster === 0) {
        totalForestCells += tryPlaceTemplate(
          occupiedGrid,
          cellGrid,
          units,
          alignedX,
          alignedY,
          lockedMask,
          firstTall,
          rand,
          nextUnitIdRef
        );
      }
      totalForestCells += tryPlaceBushFillers(
        occupiedGrid,
        cellGrid,
        units,
        alignedX,
        alignedY,
        lockedMask,
        1,
        rand,
        nextUnitIdRef
      );
    } else if (rand() < 0.5) {
      totalForestCells += tryPlaceBushFillers(
        occupiedGrid,
        cellGrid,
        units,
        alignedX,
        alignedY,
        lockedMask,
        1,
        rand,
        nextUnitIdRef
      );
    }
  } else if (role === 1) {
    // Role 1 (~4.7 cells): 2×2 Cluster (M3 or M4 = 4 cells) + 0–1 spaced bush #5
    totalForestCells += tryPlaceTemplate(
      occupiedGrid,
      cellGrid,
      units,
      alignedX,
      alignedY,
      lockedMask,
      clusterKind,
      rand,
      nextUnitIdRef
    );
    if (rand() < 0.7) {
      totalForestCells += tryPlaceBushFillers(
        occupiedGrid,
        cellGrid,
        units,
        alignedX,
        alignedY,
        lockedMask,
        1,
        rand,
        nextUnitIdRef
      );
    }
  } else if (role === 2) {
    // Role 2 (~5.4 cells): 2×2 Cluster (M3 or M4 = 4 cells) + optional M1/M2 tall (50%) + 0–1 bush #5
    totalForestCells += tryPlaceTemplate(
      occupiedGrid,
      cellGrid,
      units,
      alignedX,
      alignedY,
      lockedMask,
      clusterKind,
      rand,
      nextUnitIdRef
    );
    if (rand() < 0.5) {
      totalForestCells += tryPlaceTemplate(
        occupiedGrid,
        cellGrid,
        units,
        alignedX,
        alignedY,
        lockedMask,
        firstTall,
        rand,
        nextUnitIdRef
      );
    }
    if (rand() < 0.45) {
      totalForestCells += tryPlaceBushFillers(
        occupiedGrid,
        cellGrid,
        units,
        alignedX,
        alignedY,
        lockedMask,
        1,
        rand,
        nextUnitIdRef
      );
    }
  } else {
    // Role 3 (~4.4 cells): Tall Trees grove (2 × M1/M2 = 4 cells) + optional bush #5 (45%)
    totalForestCells += tryPlaceTemplate(
      occupiedGrid,
      cellGrid,
      units,
      alignedX,
      alignedY,
      lockedMask,
      firstTall,
      rand,
      nextUnitIdRef
    );
    totalForestCells += tryPlaceTemplate(
      occupiedGrid,
      cellGrid,
      units,
      alignedX,
      alignedY,
      lockedMask,
      secondTall,
      rand,
      nextUnitIdRef
    );
    if (rand() < 0.45) {
      totalForestCells += tryPlaceBushFillers(
        occupiedGrid,
        cellGrid,
        units,
        alignedX,
        alignedY,
        lockedMask,
        1,
        rand,
        nextUnitIdRef
      );
    }
  }
  // Keep altClusterKind referenced cleanly if needed for future narrow fallbacks
  void altClusterKind;

  const layout: ChunkForestLayout = {
    chunkX: alignedX,
    chunkY: alignedY,
    units: Object.freeze(units),
    cells: Object.freeze(cellGrid.map((row) => Object.freeze(row))),
    totalForestCells,
  };

  if (chunkLayoutCache.size >= CHUNK_LAYOUT_CACHE_MAX) {
    chunkLayoutCache.clear();
  }
  chunkLayoutCache.set(cacheKey, layout);
  return layout;
}

/** Ensures filler helper constant stays referenced and clean */
export function isAllowedFillerKind(kind: ForestUnitKind): boolean {
  return FILLER_KINDS.includes(kind);
}

/**
 * Pure deterministic landscape & forest decorator for any grid coordinate.
 */
export function getCellDecor(
  x: number,
  y: number,
  isUnlocked: boolean,
  seed = TERRAIN_DECOR_SEED,
  isCellUnlockedFn?: (cx: number, cy: number) => boolean
): CellDecor {
  const ix = Number.isFinite(x) ? Math.trunc(x) : 0;
  const iy = Number.isFinite(y) ? Math.trunc(y) : 0;

  if (isUnlocked) {
    const dirtTile = getChunkDirtPatchTile(ix, iy, seed);
    if (dirtTile !== null) {
      return {
        baseTile: dirtTile,
        overlayTile: null,
        isDarkened: false,
        kind: 'dirt',
      };
    }

    const chunkX = getAlignedOrigin(ix, CHUNK_WIDTH);
    const chunkY = getAlignedOrigin(iy, CHUNK_HEIGHT);
    const stone = getChunkMossyStoneCoord(chunkX, chunkY, seed);
    if (stone && ix - chunkX === stone.lx && iy - chunkY === stone.ly) {
      return {
        baseTile: MOSSY_STONE_TILE,
        overlayTile: null,
        isDarkened: false,
        kind: 'stone',
      };
    }

    const baseTile = pickGrassBaseTile(ix, iy, seed, true);
    if (baseTile === REUSED_TINY_TOWN_TILES.GRASS_FLOWERS) {
      return {
        baseTile,
        overlayTile: null,
        isDarkened: false,
        kind: 'flowers',
      };
    }

    // Sparse micro-decor on non-flower unlocked grass (~3% sprout 17, ~2% mushrooms 29)
    const microRoll = hashTerrainCoords(ix, iy, 0x4d494352, seed) % 100;
    if (microRoll < 3) {
      return {
        baseTile,
        overlayTile: REUSED_TINY_TOWN_TILES.SPROUT,
        isDarkened: false,
        kind: 'sprout',
      };
    }
    if (microRoll < 5) {
      return {
        baseTile,
        overlayTile: REUSED_TINY_TOWN_TILES.MUSHROOMS,
        isDarkened: false,
        kind: 'mushroom',
      };
    }

    // Sparse decorative bush (5) strictly on plain grass (0), <= ~5% of unlocked cells
    if (baseTile === REUSED_TINY_TOWN_TILES.GRASS_PLAIN) {
      const bushRoll = hashTerrainCoords(ix, iy, 0x42555348, seed) % 100;
      if (bushRoll < 4) {
        return {
          baseTile,
          overlayTile: REUSED_TINY_TOWN_TILES.GREEN_BUSH,
          isDarkened: false,
          kind: 'bush',
        };
      }
    }

    return {
      baseTile,
      overlayTile: null,
      isDarkened: false,
      kind: 'grass',
    };
  }

  // Locked territory: per-4×4-chunk deterministic forest over grass + background-only darkening
  const chunkX = getAlignedOrigin(ix, CHUNK_WIDTH);
  const chunkY = getAlignedOrigin(iy, CHUNK_HEIGHT);
  const lx = ix - chunkX;
  const ly = iy - chunkY;
  const layout = getChunkForestLayout(chunkX, chunkY, seed, isCellUnlockedFn);
  const forestCell = layout.cells[ly]?.[lx] ?? null;

  if (forestCell) {
    return {
      baseTile: REUSED_TINY_TOWN_TILES.GRASS_PLAIN,
      overlayTile: forestCell.tileIndex,
      isDarkened: true,
      kind: forestCell.isCanopy ? 'forest_canopy' : 'forest_tree',
    };
  }

  return {
    baseTile: pickGrassBaseTile(ix, iy, seed, false),
    overlayTile: null,
    isDarkened: true,
    kind: 'forest_clearing',
  };
}
