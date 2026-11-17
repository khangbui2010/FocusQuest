import React from 'react';
import {
  PixelSpriteMatrix,
  REUSED_TINY_TOWN_TILES,
  STONE_AGE_SPRITE_DATA,
  TINY_TOWN_SHEET_PATH,
} from './spriteData.ts';
import { PixelSprite } from './PixelSprite.tsx';
import { TileImage, SpriteSheetPack } from './TileImage.tsx';
import { CellDecor, TERRAIN_DECOR_SEED, getCellDecor } from './terrainDecor.ts';

export { PixelSprite, TileImage, getCellDecor, TERRAIN_DECOR_SEED };
export type { PixelSpriteMatrix, SpriteSheetPack, CellDecor };

export type TerrainTileKind = 'grass';

export interface TerrainTileSelection {
  readonly kind: TerrainTileKind;
  readonly pack: 'tiny-town';
  readonly tileIndex: 0 | 1 | 2;
  readonly sheetPath: string;
}

/**
 * Safely returns the pixel-art sprite matrix for a registered building ID.
 * Returns null for unrecognized IDs so callers can gracefully fall back to icons.
 */
export function getBuildingSprite(buildingId: string): PixelSpriteMatrix | null {
  if (typeof buildingId !== 'string' || buildingId.length === 0) {
    return null;
  }
  return STONE_AGE_SPRITE_DATA[buildingId] ?? null;
}

/**
 * Deterministic coordinate hash picking Tiny Town grass variations:
 * - Tile 0 (~74%): plain grass
 * - Tile 1 (~21%): tufted grass
 * - Tile 2 (~5%): wildflowers (deliberately sparse relative to grass)
 */
export function getTerrainTile(
  kind: TerrainTileKind | string,
  x: number,
  y: number
): TerrainTileSelection {
  const ix = Number.isFinite(x) ? x | 0 : 0;
  const iy = Number.isFinite(y) ? y | 0 : 0;

  let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263)) | 0;
  h = (h ^ (h >>> 13)) | 0;
  h = Math.imul(h, 1274126177) | 0;
  h = (h ^ (h >>> 16)) >>> 0;

  const roll = h % 100;
  let tileIndex: 0 | 1 | 2 = REUSED_TINY_TOWN_TILES.GRASS_PLAIN as 0;
  if (roll >= 95) {
    tileIndex = REUSED_TINY_TOWN_TILES.GRASS_FLOWERS as 2;
  } else if (roll >= 74) {
    tileIndex = REUSED_TINY_TOWN_TILES.GRASS_TUFTS as 1;
  }

  return {
    kind: kind === 'grass' ? 'grass' : 'grass',
    pack: 'tiny-town',
    tileIndex,
    sheetPath: TINY_TOWN_SHEET_PATH,
  };
}

/**
 * Safe visual resolver wrapping `getCellDecor` with finite-number guard.
 * Returns null if coordinates are non-finite.
 */
export function getCellDecorVisual(
  x: number,
  y: number,
  isUnlocked: boolean,
  seed = TERRAIN_DECOR_SEED,
  isCellUnlockedFn?: (cx: number, cy: number) => boolean
): CellDecor | null {
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }
  return getCellDecor(Math.trunc(x), Math.trunc(y), Boolean(isUnlocked), seed, isCellUnlockedFn);
}

export interface RenderBuildingSpriteOptions {
  width?: number;
  height?: number;
  className?: string;
  title?: string;
  ariaLabel?: string;
}

/**
 * Convenience helper rendering <PixelSprite /> for a known building ID,
 * or null when fallback to Lucide icons should be used.
 */
export function renderBuildingSprite(
  buildingId: string,
  options: RenderBuildingSpriteOptions = {}
): React.ReactNode | null {
  const sprite = getBuildingSprite(buildingId);
  if (!sprite) return null;

  return React.createElement(PixelSprite, {
    sprite,
    width: options.width ?? sprite.width,
    height: options.height ?? sprite.height,
    className: options.className,
    title: options.title,
    ariaLabel: options.ariaLabel,
  });
}
