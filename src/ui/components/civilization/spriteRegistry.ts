import React from 'react';
import {
  PixelSpriteMatrix,
  REUSED_TINY_TOWN_TILES,
  STONE_AGE_SPRITE_DATA,
  TINY_TOWN_SHEET_PATH,
} from './spriteData.ts';
import {
  BRONZE_AGE_SPRITE_DATA,
} from './bronzeSpriteData.ts';
import {
  CONSTRUCTION_STAGE_COUNT,
  CONSTRUCTION_SPRITE_STAGES,
  getConstructionSprite,
  getConstructionStageIndex,
} from './constructionSpriteData.ts';
import {
  BRONZE_CONSTRUCTION_STAGE_COUNT,
  BRONZE_CONSTRUCTION_SPRITE_STAGES,
} from './bronzeConstructionSpriteData.ts';
import { PixelSprite } from './PixelSprite.tsx';
import {
  TileImage,
  SpriteSheetPack,
  ClockTileIcon,
  ClockTileIconProps,
  ClockTileIndex,
  CLOCK_TILE_INDEX,
  CLOCK_TILES_SHEET_PATH,
  EraToolTileIcon,
  EraToolTileIconProps,
} from './TileImage.tsx';
import {
  ToolKind,
  TOOL_SKINS_SHEET_PATH,
  TOOL_SKINS_COLUMNS,
  TOOL_SKINS_ROWS,
  TOOL_SKIN_CELL_PX,
  TOOL_SKIN_COLS,
  EraToolSkinSpec,
  getEraToolSkinRow,
  getEraToolSkinSpec,
  getConstructionToolKind,
  getAwardToolKind,
} from './constructionTools.ts';
import { CellDecor, TERRAIN_DECOR_SEED, getCellDecor } from './terrainDecor.ts';
import { VillagerSprite, VillagerSpriteProps } from './VillagerSprite.tsx';

export {
  PixelSprite,
  TileImage,
  ClockTileIcon,
  CLOCK_TILE_INDEX,
  CLOCK_TILES_SHEET_PATH,
  EraToolTileIcon,
  TOOL_SKINS_SHEET_PATH,
  TOOL_SKINS_COLUMNS,
  TOOL_SKINS_ROWS,
  TOOL_SKIN_CELL_PX,
  TOOL_SKIN_COLS,
  getEraToolSkinRow,
  getEraToolSkinSpec,
  getConstructionToolKind,
  getAwardToolKind,
  CONSTRUCTION_STAGE_COUNT,
  CONSTRUCTION_SPRITE_STAGES,
  getConstructionSprite,
  getConstructionStageIndex,
  BRONZE_AGE_SPRITE_DATA,
  BRONZE_CONSTRUCTION_STAGE_COUNT,
  BRONZE_CONSTRUCTION_SPRITE_STAGES,
  getCellDecor,
  TERRAIN_DECOR_SEED,
  VillagerSprite,
};
export type {
  PixelSpriteMatrix,
  SpriteSheetPack,
  ClockTileIconProps,
  ClockTileIndex,
  EraToolTileIconProps,
  ToolKind,
  EraToolSkinSpec,
  CellDecor,
  VillagerSpriteProps,
};

export const VILLAGER_CELL_PX = 16;
export const VILLAGER_SHEET_COLUMNS = 4;
export const VILLAGER_ROLES = ['elder', 'crafter', 'woodworker'] as const;
export type VillagerRole = (typeof VILLAGER_ROLES)[number];

export interface VillagerAnimationConfig {
  readonly row: number;
  readonly frames: number;
  readonly frameMs: number;
  readonly durationMs: number;
}

export const VILLAGER_ANIMATIONS: Record<VillagerAnimationName, VillagerAnimationConfig> = {
  idle: { row: 0, frames: 2, frameMs: 600, durationMs: 1200 },
  walk_down: { row: 1, frames: 4, frameMs: 150, durationMs: 600 },
  walk_right: { row: 2, frames: 4, frameMs: 150, durationMs: 600 },
  walk_left: { row: 3, frames: 4, frameMs: 150, durationMs: 600 },
};

export type VillagerAnimationName = 'idle' | 'walk_down' | 'walk_right' | 'walk_left';
export type VillagerDirection = 'up' | 'down' | 'left' | 'right';

export function isVillagerRole(role: unknown): role is VillagerRole {
  return typeof role === 'string' && (VILLAGER_ROLES as readonly string[]).includes(role);
}

export function getVillagerSheetUrl(role: string): string | null {
  if (!isVillagerRole(role)) {
    return null;
  }
  return `/assets/sprites/villagers/${role}.png`;
}

export const BRONZE_VILLAGER_ROLES = ['smith', 'merchant', 'mason'] as const;
export type BronzeVillagerRole = (typeof BRONZE_VILLAGER_ROLES)[number];

export const BRONZE_VILLAGER_SHEETS: Readonly<Record<BronzeVillagerRole, string>> = Object.freeze({
  smith: '/assets/sprites/villagers/smith.png',
  merchant: '/assets/sprites/villagers/merchant.png',
  mason: '/assets/sprites/villagers/mason.png',
});

export function isBronzeVillagerRole(role: unknown): role is BronzeVillagerRole {
  return (
    typeof role === 'string' &&
    (BRONZE_VILLAGER_ROLES as readonly string[]).includes(role)
  );
}

export function getBronzeVillagerSheetUrl(role: string): string | null {
  if (!isBronzeVillagerRole(role)) {
    return null;
  }
  return BRONZE_VILLAGER_SHEETS[role];
}

export function getVillagerAnimation(name: VillagerAnimationName): VillagerAnimationConfig {
  return VILLAGER_ANIMATIONS[name] ?? VILLAGER_ANIMATIONS.idle;
}

/**
 * Maps standard 4-way movement direction to villager sprite animation.
 *
 * NOTE: The native Tiny Dungeon villager atlas contains animations for:
 * row 0 (idle), row 1 (walk_down), row 2 (walk_right), and row 3 (walk_left).
 * No 'walk_up' frames exist in the asset sheet.
 * Therefore, direction 'up' strictly falls back to 'idle' (facing the viewer),
 * never to 'walk_down' or inverted sprite frames.
 */
export function getVillagerAnimationForDirection(
  direction: VillagerDirection,
  isMoving: boolean
): VillagerAnimationName {
  if (!isMoving) {
    return 'idle';
  }
  switch (direction) {
    case 'down':
      return 'walk_down';
    case 'right':
      return 'walk_right';
    case 'left':
      return 'walk_left';
    case 'up':
      // Intentional fallback: native asset lacks walk_up; face idle rather than walk_down
      return 'idle';
    default:
      return 'idle';
  }
}


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

export const BRONZE_AGE_BUILDING_IDS: readonly string[] = Object.freeze(
  Object.keys(BRONZE_AGE_SPRITE_DATA)
);

/**
 * Isolated asset lookup for Milestone 5G Bronze Age building sprites (preview-only until 5C-2).
 */
export function getBronzeBuildingSprite(buildingId: string): PixelSpriteMatrix | null {
  if (typeof buildingId !== 'string' || buildingId.length === 0) {
    return null;
  }
  return BRONZE_AGE_SPRITE_DATA[buildingId] ?? null;
}

/**
 * Isolated asset lookup for Milestone 5G Bronze Age 4-stage construction sprites (preview-only until 5C-2).
 */
export function getBronzeConstructionSprite(
  buildingId: string,
  stageIndexOrRemaining: number,
  totalSeconds?: number
): PixelSpriteMatrix | null {
  if (typeof buildingId !== 'string' || buildingId.length === 0) {
    return null;
  }
  const stages = BRONZE_CONSTRUCTION_SPRITE_STAGES[buildingId];
  if (!stages || stages.length === 0) {
    return null;
  }
  let stageIndex: number;
  if (typeof totalSeconds === 'number' && Number.isFinite(totalSeconds) && totalSeconds > 0) {
    stageIndex = getConstructionStageIndex(stageIndexOrRemaining, totalSeconds);
  } else {
    const rawIdx = Number.isFinite(stageIndexOrRemaining) ? Math.floor(stageIndexOrRemaining) : 0;
    stageIndex = Math.max(0, Math.min(stages.length - 1, rawIdx));
  }
  return stages[stageIndex] ?? stages[0] ?? null;
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
