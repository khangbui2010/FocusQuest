import { PACKED_TILE_PX, getTileSourceCoords } from './TileImage.tsx';
import { TINY_TOWN_SHEET_PATH } from './spriteData.ts';
import {
  CellDecor,
  LOCKED_FOREST_DARKEN_OPACITY,
  LOCKED_TREE_DARKEN_FACTOR,
  TERRAIN_DECOR_SEED,
  computeLockedForestOpacities,
  getCellDecor,
} from './terrainDecor.ts';

/** Tailwind slate-950 hex matching bg-slate-950 in TerrainCellLayers */
export const LOCKED_FOREST_SCRIM_COLOR = '#020617';

export const FALLBACK_TERRAIN_COLORS = Object.freeze({
  grass: '#84c669',
  dirt: '#cf8254',
  stone: '#8b9bb4',
  overlay: '#479f4a',
});

export interface TerrainCanvasContext2D {
  imageSmoothingEnabled: boolean;
  fillStyle: string | CanvasGradient | CanvasPattern;
  globalAlpha: number;
  filter?: string;
  drawImage(
    image: CanvasImageSource | unknown,
    sx: number,
    sy: number,
    sw: number,
    sh: number,
    dx: number,
    dy: number,
    dw: number,
    dh: number
  ): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  clearRect?(x: number, y: number, w: number, h: number): void;
}

export interface TerrainBitmapCellSpec {
  readonly col: number;
  readonly row: number;
  readonly gx: number;
  readonly gy: number;
  readonly isUnlocked: boolean;
  readonly decor: CellDecor;
}

export interface TerrainBitmapPlan {
  readonly contentKey: string;
  readonly minX: number;
  readonly minY: number;
  readonly cols: number;
  readonly rows: number;
  readonly bitmapWidth: number;
  readonly bitmapHeight: number;
  readonly seed: number;
  readonly darkenOpacity: number;
  readonly treeDarkenFactor: number;
  readonly cells: readonly TerrainBitmapCellSpec[];
}

export interface BuildTerrainBitmapPlanOptions {
  readonly minX: number;
  readonly minY: number;
  readonly cols: number;
  readonly rows: number;
  readonly seed?: number;
  readonly darkenOpacity?: number;
  readonly treeDarkenFactor?: number;
  readonly isCellUnlocked: (cx: number, cy: number) => boolean;
}

/**
 * Computes the deterministic cell list and stable content cache key for the map terrain bitmap.
 * Pan/zoom state MUST NOT appear in `contentKey`, so camera motion never triggers bitmap redraws.
 */
export function buildTerrainBitmapPlan(options: BuildTerrainBitmapPlanOptions): TerrainBitmapPlan {
  const safeCols = Math.max(0, Math.trunc(options.cols));
  const safeRows = Math.max(0, Math.trunc(options.rows));
  const minX = Math.trunc(options.minX);
  const minY = Math.trunc(options.minY);
  const seed = options.seed ?? TERRAIN_DECOR_SEED;
  const darkenOpacity = options.darkenOpacity ?? LOCKED_FOREST_DARKEN_OPACITY;
  const treeDarkenFactor = options.treeDarkenFactor ?? LOCKED_TREE_DARKEN_FACTOR;

  const cells: TerrainBitmapCellSpec[] = [];
  let unlockedBits = '';

  for (let row = 0; row < safeRows; row++) {
    const gy = minY + row;
    for (let col = 0; col < safeCols; col++) {
      const gx = minX + col;
      const isUnlocked = Boolean(options.isCellUnlocked(gx, gy));
      unlockedBits += isUnlocked ? '1' : '0';
      const decor = getCellDecor(gx, gy, isUnlocked, seed, options.isCellUnlocked);
      cells.push({
        col,
        row,
        gx,
        gy,
        isUnlocked,
        decor,
      });
    }
  }

  const contentKey = [
    seed,
    minX,
    minY,
    safeCols,
    safeRows,
    darkenOpacity,
    treeDarkenFactor,
    unlockedBits,
  ].join(':');

  return {
    contentKey,
    minX,
    minY,
    cols: safeCols,
    rows: safeRows,
    bitmapWidth: safeCols * PACKED_TILE_PX,
    bitmapHeight: safeRows * PACKED_TILE_PX,
    seed,
    darkenOpacity,
    treeDarkenFactor,
    cells,
  };
}

function getFallbackGroundColor(decor: CellDecor): string {
  if (decor.kind === 'dirt') return FALLBACK_TERRAIN_COLORS.dirt;
  if (decor.kind === 'stone') return FALLBACK_TERRAIN_COLORS.stone;
  return FALLBACK_TERRAIN_COLORS.grass;
}

/**
 * Draws the entire map terrain (ground, optional ground compensation, trees/canopy overlays,
 * and locked-forest dark scrim) into a single integer-aligned 16px-per-tile bitmap buffer.
 * Layer order matches TerrainCellLayers (UX-3) deterministically.
 */
export function renderTerrainBitmap(
  ctx: TerrainCanvasContext2D,
  plan: TerrainBitmapPlan,
  tileSheet: CanvasImageSource | unknown | null
): void {
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = 1;
  ctx.clearRect?.(0, 0, plan.bitmapWidth, plan.bitmapHeight);

  for (const cell of plan.cells) {
    const dx = cell.col * PACKED_TILE_PX;
    const dy = cell.row * PACKED_TILE_PX;
    const { decor } = cell;

    // 1. Base ground tile at exact (col*16, row*16, 16, 16)
    if (tileSheet !== null) {
      const srcBase = getTileSourceCoords(decor.baseTile);
      ctx.globalAlpha = 1;
      ctx.drawImage(
        tileSheet,
        srcBase.x,
        srcBase.y,
        PACKED_TILE_PX,
        PACKED_TILE_PX,
        dx,
        dy,
        PACKED_TILE_PX,
        PACKED_TILE_PX
      );
    } else {
      ctx.globalAlpha = 1;
      ctx.fillStyle = getFallbackGroundColor(decor);
      ctx.fillRect(dx, dy, PACKED_TILE_PX, PACKED_TILE_PX);
    }

    const opacities = decor.isDarkened
      ? computeLockedForestOpacities(
          decor.overlayTile !== null,
          plan.darkenOpacity,
          plan.treeDarkenFactor
        )
      : null;

    // 2. Optional ground compensation scrim under trees when treeDarkenFactor < 1.0
    if (opacities && opacities.groundUnderOverlayOpacity > 0) {
      ctx.fillStyle = LOCKED_FOREST_SCRIM_COLOR;
      ctx.globalAlpha = opacities.groundUnderOverlayOpacity;
      ctx.fillRect(dx, dy, PACKED_TILE_PX, PACKED_TILE_PX);
      ctx.globalAlpha = 1;
    }

    // 3. Tree / canopy / bush / micro-decor overlay tile
    if (decor.overlayTile !== null) {
      if (tileSheet !== null) {
        const hasFilterProp = 'filter' in ctx;
        const appliedBrightness =
          opacities && opacities.treeBrightnessFactor !== 1 && hasFilterProp;
        if (appliedBrightness) {
          ctx.filter = `brightness(${opacities.treeBrightnessFactor})`;
        }
        const srcOverlay = getTileSourceCoords(decor.overlayTile);
        ctx.globalAlpha = 1;
        ctx.drawImage(
          tileSheet,
          srcOverlay.x,
          srcOverlay.y,
          PACKED_TILE_PX,
          PACKED_TILE_PX,
          dx,
          dy,
          PACKED_TILE_PX,
          PACKED_TILE_PX
        );
        if (appliedBrightness) {
          ctx.filter = 'none';
        }
      } else {
        ctx.globalAlpha = 1;
        ctx.fillStyle = FALLBACK_TERRAIN_COLORS.overlay;
        ctx.fillRect(dx + 2, dy + 2, PACKED_TILE_PX - 4, PACKED_TILE_PX - 4);
      }
    }

    // 4. Top dark scrim above BOTH ground and tree overlay on locked cells
    if (opacities && opacities.topScrimOpacity > 0) {
      ctx.fillStyle = LOCKED_FOREST_SCRIM_COLOR;
      ctx.globalAlpha = opacities.topScrimOpacity;
      ctx.fillRect(dx, dy, PACKED_TILE_PX, PACKED_TILE_PX);
      ctx.globalAlpha = 1;
    }
  }

  ctx.globalAlpha = 1;
}

export interface RenderTerrainIfNeededResult {
  readonly drawn: boolean;
  readonly renderSignature: string;
}

/**
 * Redraws the terrain bitmap ONLY when `contentKey` or sheet availability (`sheet` vs `fallback`) changes.
 */
export function renderTerrainBitmapIfNeeded(
  ctx: TerrainCanvasContext2D,
  plan: TerrainBitmapPlan,
  tileSheet: CanvasImageSource | unknown | null,
  prevRenderSignature: string | null
): RenderTerrainIfNeededResult {
  const sheetMode = tileSheet !== null ? 'sheet' : 'fallback';
  const renderSignature = `${plan.contentKey}:${sheetMode}`;

  if (prevRenderSignature === renderSignature) {
    return {
      drawn: false,
      renderSignature,
    };
  }

  renderTerrainBitmap(ctx, plan, tileSheet);
  return {
    drawn: true,
    renderSignature,
  };
}

export type TileSheetLoadResult =
  | { readonly status: 'loaded'; readonly image: HTMLImageElement }
  | { readonly status: 'error' | 'unavailable'; readonly image: null };

let cachedTileSheetImage: HTMLImageElement | null = null;
let cachedTileSheetStatus: 'idle' | 'loaded' | 'error' = 'idle';
let inFlightSheetLoad: Promise<TileSheetLoadResult> | null = null;

export function getCachedTinyTownTileSheet(): HTMLImageElement | null {
  if (
    cachedTileSheetStatus === 'loaded' &&
    cachedTileSheetImage &&
    cachedTileSheetImage.complete &&
    cachedTileSheetImage.naturalWidth > 0
  ) {
    return cachedTileSheetImage;
  }
  return null;
}

/**
 * Loads and caches the Tiny Town packed spritesheet once per page lifecycle.
 * SSR-safe and resolves cleanly on load errors so callers can draw flat fallback terrain.
 */
export function loadTinyTownTileSheet(): Promise<TileSheetLoadResult> {
  const existing = getCachedTinyTownTileSheet();
  if (existing) {
    return Promise.resolve({ status: 'loaded', image: existing });
  }
  if (typeof Image === 'undefined') {
    return Promise.resolve({ status: 'unavailable', image: null });
  }
  if (cachedTileSheetStatus === 'error') {
    return Promise.resolve({ status: 'error', image: null });
  }
  if (inFlightSheetLoad) {
    return inFlightSheetLoad;
  }

  inFlightSheetLoad = new Promise<TileSheetLoadResult>((resolve) => {
    const img = new Image();
    img.decoding = 'async';

    const cleanup = () => {
      img.onload = null;
      img.onerror = null;
      inFlightSheetLoad = null;
    };

    img.onload = () => {
      cleanup();
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        cachedTileSheetImage = img;
        cachedTileSheetStatus = 'loaded';
        resolve({ status: 'loaded', image: img });
      } else {
        cachedTileSheetStatus = 'error';
        resolve({ status: 'error', image: null });
      }
    };

    img.onerror = () => {
      cleanup();
      cachedTileSheetStatus = 'error';
      resolve({ status: 'error', image: null });
    };

    img.src = TINY_TOWN_SHEET_PATH;

    // Handle cached synchronous completion in browsers if `onload` didn't fire synchronously
    if (img.complete && img.naturalWidth > 0) {
      cleanup();
      cachedTileSheetImage = img;
      cachedTileSheetStatus = 'loaded';
      resolve({ status: 'loaded', image: img });
    }
  });

  return inFlightSheetLoad;
}
