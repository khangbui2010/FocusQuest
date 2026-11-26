import type { CivilizationEra } from '../../../core/civilization/buildingTypes.ts';
import type { AwardIconSpec } from '../../../types/awards.ts';
import { REUSED_TINY_TOWN_TILES } from './spriteData.ts';
import type { SpriteSheetPack } from './TileImage.tsx';

export type ToolKind = 'axe' | 'pickaxe' | 'sickle' | 'hammer';

export const TOOL_SKINS_SHEET_PATH = '/assets/sprites/era/tool_skins_16.png';
export const TOOL_SKINS_COLUMNS = 4;
export const TOOL_SKINS_ROWS = 3;
export const TOOL_SKIN_CELL_PX = 16;

export const TOOL_SKIN_COLS: Readonly<Record<ToolKind, 0 | 1 | 2 | 3>> = Object.freeze({
  axe: 0,
  pickaxe: 1,
  sickle: 2,
  hammer: 3,
});

export interface EraToolSkinSpec {
  readonly toolKind: ToolKind;
  readonly era: CivilizationEra | string;
  readonly row: 0 | 1 | 2;
  readonly col: 0 | 1 | 2 | 3;
  readonly x: number;
  readonly y: number;
  readonly sheetPath: string;
  readonly sheetWidth: number;
  readonly sheetHeight: number;
}

/**
 * Resolves the sprite row in tool_skins_16.png (64×48, 4 cols × 3 rows of 16×16):
 * - Row 0: STONE_AGE (and default fallback)
 * - Row 1: BRONZE_AGE
 * - Row 2: IRON_AGE and later eras
 */
export function getEraToolSkinRow(era?: CivilizationEra | string): 0 | 1 | 2 {
  if (era === 'BRONZE_AGE') {
    return 1;
  }
  if (
    era === 'IRON_AGE' ||
    era === 'MEDIEVAL' ||
    era === 'EARLY_MODERN' ||
    era === 'MODERN' ||
    era === 'FUTURISTIC' ||
    era === 'INTERPLANETARY'
  ) {
    return 2;
  }
  return 0;
}

export function getEraToolSkinSpec(
  toolKind: ToolKind,
  era: CivilizationEra | string = 'STONE_AGE'
): EraToolSkinSpec {
  const safeEra = typeof era === 'string' && era.length > 0 ? era : 'STONE_AGE';
  const row = getEraToolSkinRow(safeEra);
  const col = TOOL_SKIN_COLS[toolKind] ?? 3;
  return {
    toolKind,
    era: safeEra,
    row,
    col,
    x: col * TOOL_SKIN_CELL_PX,
    y: row * TOOL_SKIN_CELL_PX,
    sheetPath: TOOL_SKINS_SHEET_PATH,
    sheetWidth: TOOL_SKINS_COLUMNS * TOOL_SKIN_CELL_PX,
    sheetHeight: TOOL_SKINS_ROWS * TOOL_SKIN_CELL_PX,
  };
}

export function getConstructionToolKind(
  kind: 'place' | 'upgrade' | 'expand',
  definitionId?: string
): ToolKind {
  if (kind === 'expand') {
    return 'axe';
  }
  if (kind === 'place' && definitionId === 'stone_age_study_cave') {
    return 'pickaxe';
  }
  return 'hammer';
}

export function getAwardToolKind(icon: AwardIconSpec): ToolKind | null {
  if (icon.kind !== 'tile') {
    return null;
  }
  if (icon.pack === 'tiny-dungeon' && icon.tileIndex === 117) {
    return 'hammer';
  }
  if (icon.pack === 'tiny-town' && icon.tileIndex === 115) {
    return 'pickaxe';
  }
  if (icon.pack === 'tiny-town' && icon.tileIndex === 127) {
    return 'axe';
  }
  return null;
}

export const CONSTRUCTION_TOOL_TILES = Object.freeze({
  HAMMER_PACK: 'tiny-dungeon' as SpriteSheetPack,
  HAMMER_TILE: 117,
  AXE_PACK: 'tiny-town' as SpriteSheetPack,
  AXE_TILE: REUSED_TINY_TOWN_TILES.WOODCUTTER_AXE, // 127
  PICKAXE_PACK: 'tiny-town' as SpriteSheetPack,
  PICKAXE_TILE: 115,
});

export interface ConstructionToolSpec {
  readonly pack: SpriteSheetPack;
  readonly tileIndex: number;
}

export function getConstructionToolSpec(
  kind: 'place' | 'upgrade' | 'expand',
  definitionId?: string
): ConstructionToolSpec {
  if (kind === 'expand') {
    return {
      pack: CONSTRUCTION_TOOL_TILES.AXE_PACK,
      tileIndex: CONSTRUCTION_TOOL_TILES.AXE_TILE,
    };
  }
  if (kind === 'place' && definitionId === 'stone_age_study_cave') {
    return {
      pack: CONSTRUCTION_TOOL_TILES.PICKAXE_PACK,
      tileIndex: CONSTRUCTION_TOOL_TILES.PICKAXE_TILE,
    };
  }
  return {
    pack: CONSTRUCTION_TOOL_TILES.HAMMER_PACK,
    tileIndex: CONSTRUCTION_TOOL_TILES.HAMMER_TILE,
  };
}
