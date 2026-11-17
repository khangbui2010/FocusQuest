import React from 'react';
import { TINY_DUNGEON_SHEET_PATH, TINY_TOWN_SHEET_PATH } from './spriteData.ts';

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
  const safeIndex = Math.max(
    0,
    Math.min(PACKED_SHEET_COLUMNS * PACKED_SHEET_ROWS - 1, Math.floor(tileIndex))
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
}) => {
  const sheetPath = getSpriteSheetPath(pack);
  const { col, row } = getTileSourceCoords(tileIndex);

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
      data-tile-index={tileIndex}
      className={spanClassName}
      style={{
        width: size,
        height: size,
      }}
    >
      <img
        src={sheetPath}
        alt={alt}
        draggable={false}
        aria-hidden={alt ? undefined : true}
        style={{
          position: 'absolute',
          left: -col * size,
          top: -row * size,
          width: PACKED_SHEET_COLUMNS * size,
          height: PACKED_SHEET_ROWS * size,
          maxWidth: 'none',
          maxHeight: 'none',
          imageRendering: 'pixelated',
          pointerEvents: 'none',
        }}
      />
    </span>
  );
};
