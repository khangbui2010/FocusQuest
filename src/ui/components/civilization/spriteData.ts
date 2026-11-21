// Shared Tiny Town palette keys & sprite matrices for Stone Age buildings.
// Palette hexes live in TINY_TOWN_PALETTE; every sprite must pass validatePixelSpriteData.
import { PixelSpriteMatrix } from '../../../types/index.ts';

export interface PixelSpriteMatrix {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly rows: readonly string[];
  readonly reusedTiles: readonly {
    readonly pack: string;
    readonly tileIndex: number;
    readonly usage: string
  }[];
}

export const TINY_TOWN_PALETTE: Readonly<Record<string, string>> = Object.freeze({
  k: '#3f2631', // outline (dark plum-black)
  c: '#cbb077', // light sand / tan (thatch light)
  b: '#c2a065', // sand mid
  d: '#b09058', // sand dark / wood mid
  p: '#de9f53', // wood light
  t: '#dfc26a', // thatch yellow
  y: '#dfc26a', // thatch yellow
  o: '#e3d380', // thatch light
  g: '#37a179', // grass green mid
  S: '#37a179', // grass green mid (secondary usage)
  G: '#43b58c', // grass light
  L: '#58c7a5', // grass lightest
  M: '#2f8564', // grass dark
  D: '#256c50', // grass darkest
  w: '#86796f', // stone mid
  W: '#a49a8c', // stone light
  s: '#8c8076', // stone mid alt
  N: '#5e5258', // rock dark
  K: '#453a41', // rock darker
  R: '#de6f44', // accent orange
  r: '#de6f44', // accent orange alt
  T: '#2f8564', // grass dark alt
  a: '#de9f53', // wood accent
});

export const ALLOWED_TINY_TOWN_HEX_SET: ReadonlySet<string> = new Set(
  Aliased_TINY_TOWN_HEX_SOURCE()
);

function Aliased_TINY_TOWN_HEX_SOURCE(): string[] {
  return Object.values(TINY_TOWN_PALETTE);
}

// 1x1 (16x16) — Campfire: crossed logs, orange flame, small stones ring
const CAMPFIRE_ROWS: readonly string[] = [
  '................',
  '......k..k......',
  '.....kRkkRk.....',
  '.....kRykkk.....',
  '......kkkRk.....',
  '.....kRyRyk.....',
  '....kkRyyRkk....',
  '...kwkRyyRkwk...',
  '..kwwkRRRRkwwk..',
  '..kwwkyyyykwwk..',
  '..kwwkyyyykwwk..',
  '.kwwwwkkkkwwwwk.',
  '.kwwwwwwwwwwwwwk',
  '.kwwwwwwwwwwwwwk',
  '................',
  '................',
];

const TOTEM_ROWS: readonly string[] = [
  '................',
  '.....kkkkkk.....',
  '....kRRRRRRk....',
  '...kRRyyRRyyk...',
  '...kRRyyRRyyk...',
  '...kRRRRRRRRk...',
  '...kRRddRRddk...',
  '...kRRddRRddk...',
  '...kRRRRRRRRk...',
  '...kRRddRRddk...',
  '...kRRddRRddk...',
  '...kRRRRRRRRk...',
  '...kRRyyRRyyk...',
  '...kRRyyRRyyk...',
  '....kkkkkkkk....',
  '................',
];

// 3x3 (48x48) — Meditation Cave: large boulder mound, dark cave door at bottom-center,
// moss patches, small rocks & grass tufts. Palette Tiny Town, viền #3f2631 ('k').
const STUDY_CAVE_ROWS: readonly string[] = [
  '................................................',
  '................................................',
  '..............kkkkkkkkkkkkkk....................',
  '.............kWWWWWWWWWWWWWWk...................',
  '............kWWWWWWWWWWWWWWWWk..................',
  '...........kWWwwwwwwwwwwwwwwWWk.................',
  '..........kWWwwwwwwwwwwwwwwwwWWk................',
  '.........kWWwwwwwGGwwwwwwwwwwwWWk...............',
  '........kWWwwwwwGGGGwwwwwwwNwwwwWWk.............',
  '.......kWWwwwwwGGGGwwwwwwNNNNwwwwWWk............',
  '......kWWwwwwwwwwwwwwwwwNNNNNNwwwwWWk...........',
  '.....kWWwwwwwwwwwwwwwwwwNNNNwwwwwwwWWk..........',
  '....kWWwwwwwwwGGGGwwwwwwwwwwwwGGwwwwWWk.........',
  '...kWWwwwwwwwGGGGGGwwwwwwwwwGGGGGGwwwwWWk.......',
  '..kWWwwwwwwwwGGGGwwwwwwwwwwGGGGGGGGwwwwwWWk.....',
  '..kwwwwwwwwwwwwwwwwwwwwwwwwGGGGGGGGwwwwwwwWWk...',
  '..kwwwwwwwwwwwwwwwwwwwwwwwwwwGGGGwwwwwwwwwwWWk..',
  '.kwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwNNwwwwWWk',
  '.kwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwNNNNNNwwwWk',
  'kWWwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwNNNNNNwwwWk',
  'kWWwwGGwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwNNNNNNwwWWk',
  'kWWwwGGGGwwwwwwwwwwwwwwwwwwwwwwwwwwwwNNNNNNwwWWk',
  'kWWwwGGGGwwwwwwwwwwwwwwwwwwwwwwwwwwwwNNNNNNwwWWk',
  'kWWwwGGGGwwwwwwwwwwwwwwwwwwwwwwwwwwwNNNNNNNwwWWk',
  'kWWwwGGGGwwwwwwwwwwwwwwwwwwwwwwwwwwwwNNNNNNwwWWk',
  'kWWwwGGwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwNNNNNNwwWWk',
  'kWWwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwNNNNNNwwWWk',
  'kWWwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwNNNNNNwwWWk',
  'kWWwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwNNNNNNwwWWk',
  'kWWwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwNNNNNNwwWWk',
  'kWWwwwwwwwwwwwwwkkkkkkkkkkkkkkkwwwwwwNNNNNNwwWWk',
  'kWWwwwwwwwwwwwwkKKKKKKKKKKKKKKKkwwwwwNNNNNNwwWWk',
  'kWWwwwwwwwwwwwkKKNNNNNNNNNNNNNKKkwwwwNNNNNNwwWWk',
  'kWWwwwwwwwwwwkKKNNNNNNNNNNNNNNNKKkwwwNNNNNNwwWWk',
  'kWWwwwwwwwwwwkKKNNNNNNNNNNNNNNNKKkwwwNNNNNNwwWWk',
  'kWWwwwwwwwwwwkKKNNNNNNNNNNNNNNNKKkwwwNNNNNNwwWWk',
  'kWWwwwwwwwwwwkKKNNNNNNNNNNNNNNNKKkwwwNNNNNNwwWWk',
  'kWWwwwwwwwwwwkKKNNNNNNNNNNNNNNNKKkwwwNNNNNNwwWWk',
  'kWWwwwwwwwwwwkKKNNNNNNNNNNNNNNNKKkwwwNNNNNNwwWWk',
  'kWWwwwwwwwwwwkKKNNKKKKKKKKKKKNNKKkwwwNNNNNNwwWWk',
  'kWWwwwwwwwwwwkKKNNKKKKKKKKKKKNNKKkwwwNNNNNNwwWWk',
  'kWWwwwwwwwwwwkKKNNKKKKKKKKKKKNNKKkwwwNNNNNNwwWWk',
  'kWWwwwwwwwwwwwkKKNNKKKKKKKKKNNKKkwwwwNNNNNNwwWWk',
  'kWWwwwwwwwwwwwkKKNNNKKKKKKKNNNKKkwwwwNNNNNNwwWWk',
  'kWWwwwwwwwwwwwkKKNNNNKKKKKNNNNKKkwwwwNNNNNNwwWWk',
  'kWWwwGGwwwwwwwkKKNNNNNNNNNNNNNKKkwwwwNNNNNNwwWWk',
  'kWWwwGGGGwwwwwkKKKKKKKKKKKKKKKKKkwwwwNNNNNNwwWWk',
  'kWWwwwGGwwwwwkKKKKKKKKKKKKKKKKKKKkwwwwNNNNNNwWWk',
  '.kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk.',
];

function buildSpriteData(): Record<string, PixelSpriteMatrix> {
  return {
    stone_age_campfire: {
      id: 'stone_age_campfire',
      width: 16,
      height: 16,
      rows: CAMPFIRE_ROWS, reusedTiles: [
        {
          pack: 'tiny-town',
          tileIndex: 106,
          usage: 'Palette and crossed-log shading reference from Tiny Town tile 106',
        },
      ],
    },
    stone_age_totem: {
      id: 'stone_age_totem',
      width: 16,
      height: 16,
      rows: TOTEM_ROWS,
      reusedTiles: [],
    },
    stone_age_study_cave: {
      id: 'stone_age_study_keep_placeholder_do_not_match',
      width: 48,
      height: 48,
      rows: STUDY_CAVE_ROWS,
      reusedTiles: [],
    },
  };
}
