import React from 'react';
import type { CivilizationEra } from '../../../core/civilization/buildingTypes.ts';
import { TINY_DUNGEON_SHEET_PATH, TINY_TOWN_SHEET_PATH } from './spriteData.ts';
import {
  TOOL_SKINS_COLUMNS,
  TOOL_SKINS_ROWS,
  ToolKind,
  getEraToolSkinSpec,
} from './constructionTools.ts';

export type SpriteSheetPack = 'tiny-town' | 'tiny-dungeon';

export const PACKED_SHEET_COLUMNS = 12;
export const PACKED_SHEET_ROWS = 11;
export const PACKED_TILE_PX = 16;

export function getSpriteSheetPath(pack: SpriteSheetPack): string {
  return pack === 'tiny-dungeon' ? TINY_DUNGEON_SHEET_PATH : TINY_TOWN_SHEET_PATH;
}

export function getTileSourceCoords(tileIndex: number): {
  col: number;
  row: number;
  x: number;
  y: number;
} {
  const numericIndex =
    typeof tileIndex === 'number' && Number.isFinite(tileIndex) ? tileIndex : 0;
  const safeIndex = Math.max(
    0,
    Math.min(PACKED_SHEET_COLUMNS * PACKED_SHEET_ROWS - 1, Math.floor(numericIndex))
  );
  const col = safeIndex % PACKED_SHEET_COLUMNS;
  const row = Math.floor(safeIndex / PACKED_SHEET_COLUMNS);
  return {
    col,
    row,
    x: col * PACKED_TILE_PX,
    y: row * PACKED_TILE_PX,
  };
}

export interface TileImageProps {
  pack?: SpriteSheetPack;
  tileIndex: number;
  size?: number;
  className?: string;
  alt?: string;
  style?: React.CSSProperties;
}

/**
 * Displays a single 16x16 tile from a CC0 packed PNG sheet (192x176, 12x11 grid)
 * using absolute extension/root URLs and pixelated scaling. Safe for SSR.
 */
export const TileImage: React.FC<TileImageProps> = ({
  pack = 'tiny-town',
  tileIndex,
  size = PACKED_TILE_PX,
  className = '',
  alt = '',
  style,
}) => {
  const sheetPath = getSpriteSheetPath(pack);
  const safeTileIndex =
    typeof tileIndex === 'number' && Number.isFinite(tileIndex) ? Math.floor(tileIndex) : 0;
  const safeSize = typeof size === 'number' && Number.isFinite(size) && size > 0 ? size : PACKED_TILE_PX;
  const { col, row } = getTileSourceCoords(safeTileIndex);

  const hasPositionClass = /\b(absolute|fixed|sticky|relative)\b/.test(className);
  const hasDisplayClass = /\b(block|inline-block|inline|flex|inline-flex|grid|hidden)\b/.test(
    className
  );
  const spanClassName = [
    hasPositionClass ? '' : 'relative',
    hasDisplayClass ? '' : 'inline-block',
    'overflow-hidden select-none',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <span
      data-tile-pack={pack}
      data-tile-index={safeTileIndex}
      className={spanClassName}
      style={{
        width: safeSize,
        height: safeSize,
        ...style,
      }}
    >
      <img
        src={sheetPath}
        alt={alt}
        draggable={false}
        aria-hidden={alt ? undefined : true}
        style={{
          position: 'absolute',
          left: -col * safeSize,
          top: -row * safeSize,
          width: PACKED_SHEET_COLUMNS * safeSize,
          height: PACKED_SHEET_ROWS * safeSize,
          maxWidth: 'none',
          maxHeight: 'none',
          imageRendering: 'pixelated',
          pointerEvents: 'none',
        }}
      />
    </span>
  );
};

export const CLOCK_TILES_SHEET_PATH = '/assets/sprites/clock_tiles_16.png';
export const CLOCK_TILES_COUNT = 3;
export const CLOCK_TILE_INDEX = Object.freeze({
  CLOCK: 0,
  HOURGLASS: 1,
  STOPWATCH: 2,
} as const);
export type ClockTileIndex = 0 | 1 | 2;

export interface ClockTileIconProps {
  tileIndex: ClockTileIndex;
  size?: number;
  className?: string;
  alt?: string;
  style?: React.CSSProperties;
}

/**
 * Displays one 16x16 icon tile from clock_tiles_16.png (48x16, 3 tiles: 0=clock, 1=hourglass, 2=stopwatch).
 * Uses pixelated rendering and zero-overlap overflow crop. Safe for SSR.
 */
export const ClockTileIcon: React.FC<ClockTileIconProps> = ({
  tileIndex,
  size = PACKED_TILE_PX,
  className = '',
  alt = '',
  style,
}) => {
  const numericIndex =
    typeof tileIndex === 'number' && Number.isFinite(tileIndex) ? tileIndex : 0;
  const safeIndex = Math.max(0, Math.min(CLOCK_TILES_COUNT - 1, Math.floor(numericIndex)));
  const safeSize = typeof size === 'number' && Number.isFinite(size) && size > 0 ? size : PACKED_TILE_PX;
  const hasPositionClass = /\b(absolute|fixed|sticky|relative)\b/.test(className);
  const hasDisplayClass = /\b(block|inline-block|inline|flex|inline-flex|grid|hidden)\b/.test(
    className
  );
  const spanClassName = [
    hasPositionClass ? '' : 'relative',
    hasDisplayClass ? '' : 'inline-block',
    'overflow-hidden select-none shrink-0',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <span
      data-clock-tile-index={safeIndex}
      className={spanClassName}
      style={{
        width: safeSize,
        height: safeSize,
        ...style,
      }}
    >
      <img
        src={CLOCK_TILES_SHEET_PATH}
        alt={alt}
        draggable={false}
        aria-hidden={alt ? undefined : true}
        style={{
          position: 'absolute',
          left: -safeIndex * safeSize,
          top: 0,
          width: CLOCK_TILES_COUNT * safeSize,
          height: safeSize,
          maxWidth: 'none',
          maxHeight: 'none',
          imageRendering: 'pixelated',
          pointerEvents: 'none',
        }}
      />
    </span>
  );
};

export interface EraToolTileIconProps {
  toolKind: ToolKind;
  era?: CivilizationEra | string;
  size?: number;
  className?: string;
  alt?: string;
  style?: React.CSSProperties;
  testId?: string;
}

/**
 * Displays one 16x16 era-themed tool sprite from tool_skins_16.png (64x48, 4 cols x 3 rows).
 * Cols: 0=axe, 1=pickaxe, 2=sickle, 3=hammer. Rows: 0=STONE_AGE, 1=BRONZE_AGE, 2=IRON_AGE+.
 */
export const EraToolTileIcon: React.FC<EraToolTileIconProps> = ({
  toolKind,
  era = 'STONE_AGE',
  size = PACKED_TILE_PX,
  className = '',
  alt = '',
  style,
  testId,
}) => {
  const safeSize =
    typeof size === 'number' && Number.isFinite(size) && size > 0 ? size : PACKED_TILE_PX;
  const spec = getEraToolSkinSpec(toolKind, era);

  const hasPositionClass = /\b(absolute|fixed|sticky|relative)\b/.test(className);
  const hasDisplayClass = /\b(block|inline-block|inline|flex|inline-flex|grid|hidden)\b/.test(
    className
  );
  const spanClassName = [
    hasPositionClass ? '' : 'relative',
    hasDisplayClass ? '' : 'inline-block',
    'overflow-hidden select-none shrink-0',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <span
      data-testid={testId}
      data-tool-kind={spec.toolKind}
      data-tool-era={spec.era}
      data-tool-skin-row={spec.row}
      data-tool-skin-col={spec.col}
      className={spanClassName}
      style={{
        width: safeSize,
        height: safeSize,
        ...style,
      }}
    >
      <img
        src={spec.sheetPath}
        alt={alt}
        draggable={false}
        aria-hidden={alt ? undefined : true}
        style={{
          position: 'absolute',
          left: -spec.col * safeSize,
          top: -spec.row * safeSize,
          width: TOOL_SKINS_COLUMNS * safeSize,
          height: TOOL_SKINS_ROWS * safeSize,
          maxWidth: 'none',
          maxHeight: 'none',
          imageRendering: 'pixelated',
          pointerEvents: 'none',
        }}
      />
    </span>
  );
};

