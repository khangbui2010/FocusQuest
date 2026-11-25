import { REUSED_TINY_TOWN_TILES } from './spriteData.ts';
import type { SpriteSheetPack } from './TileImage.tsx';

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
