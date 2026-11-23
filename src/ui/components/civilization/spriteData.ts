/**
 * Project-original pixel-art sprite matrices for Stone Age buildings.
 * Strictly constrained to the Kenney Tiny Town CC0 palette so hand-drawn
 * structures blend seamlessly with Tiny Town terrain and props.
 */

export const TINY_TOWN_SHEET_PATH = '/assets/sprites/kenney-tiny-town/tilemap_packed.png';
export const TINY_DUNGEON_SHEET_PATH = '/assets/sprites/kenney-tiny-dungeon/tilemap_packed.png';

export const TINY_TOWN_ALLOWED_HEXES: readonly string[] = Object.freeze([
  // Outline / dark
  '#3f2631',
  '#3d212d',
  '#262b44',
  // Greens
  '#84c669',
  '#479f4a',
  '#65a556',
  '#8bd87d',
  // Browns / oranges / sand
  '#eaa56c',
  '#bd6c4a',
  '#763b36',
  '#cf8254',
  '#e38628',
  '#fdbe53',
  '#fcbc8f',
  '#fec99c',
  '#f28462',
  // Greys / blues
  '#c0cbdc',
  '#8b9bb4',
  '#5a6988',
  '#52607c',
  '#8c9cb5',
  // Reds
  '#c34b35',
  '#e84537',
  // White / water
  '#ffffff',
  '#009adc',
  '#76e4ff',
]);

export const ALLOWED_TINY_TOWN_HEX_SET: ReadonlySet<string> = new Set(TINY_TOWN_ALLOWED_HEXES);

/**
 * Character -> Tiny Town palette hex mapping.
 * '.' represents transparent pixels.
 */
export const TINY_TOWN_PALETTE: Readonly<Record<string, string>> = Object.freeze({
  // Outline / dark
  k: '#3f2631',
  K: '#3d212d',
  N: '#262b44',
  // Greens
  G: '#84c669',
  D: '#479f4a',
  M: '#65a556',
  L: '#8bd87d',
  // Browns / oranges / sand
  t: '#eaa56c',
  b: '#bd6c4a',
  d: '#763b36',
  c: '#cf8254',
  o: '#e38628',
  y: '#fdbe53',
  p: '#fcbc8f',
  s: '#fec99c',
  a: '#f28462',
  // Greys / blues
  w: '#c0cbdc',
  g: '#8b9bb4',
  S: '#5a6988',
  T: '#52607c',
  u: '#8c9cb5',
  // Reds
  r: '#c34b35',
  R: '#e84537',
  // White / water
  W: '#ffffff',
  B: '#009adc',
  C: '#76e4ff',
});

export interface ReusedTileReference {
  readonly pack: 'tiny-town';
  readonly tileIndex: number;
  readonly usage: string;
}

export interface PixelSpriteMatrix {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly rows: readonly string[];
  readonly reusedTiles: readonly ReusedTileReference[];
}

/**
 * CC0 Tiny Town tiles explicitly reused or visually referenced in Stage 4a & 4a-2 (V2).
 * - Unlocked terrain ground: tiles 0 (plain grass), 1 (tufts), 2 (flowers),
 *   dirt 3×3 set (12–14, 24–26, 36–38), dirt inner notch corners (39–42), mossy stone (43),
 *   sparse micro-decor sprout (17), mushrooms (29), and rare plain-grass bush (5).
 * - Locked forest units (over grass + darkened): standalone 1×1 (28, 27, 5), tall 1×2 trees
 *   ([4]/[16] green; [3]/[15] autumn), Cluster A 2×2 groves ([6,8]/[30,32] green;
 *   [9,11]/[33,35] autumn), and Cross B 5-tile crosses ([·,7,·]/[18,19,20]/[·,31,·] green;
 *   [·,10,·]/[21,22,23]/[·,34,·] autumn).
 * - Props/Accents: tiles 106 (log), 107 (sack/pot), 130 (barrel/basket), 127 (axe).
 */
export const REUSED_TINY_TOWN_TILES = Object.freeze({
  GRASS_PLAIN: 0,
  GRASS_TUFTS: 1,
  GRASS_FLOWERS: 2,
  TREE_CONIFER_ORANGE: 3,
  TREE_CONIFER_GREEN: 4,
  GREEN_BUSH: 5,
  CANOPY_GREEN_TL: 6,
  CANOPY_GREEN_T: 7,
  CANOPY_GREEN_TR: 8,
  CANOPY_ORANGE_TL: 9,
  CANOPY_ORANGE_T: 10,
  CANOPY_ORANGE_TR: 11,
  DIRT_TL: 12,
  DIRT_T: 13,
  DIRT_TR: 14,
  TREE_ROUND_ORANGE: 15,
  TREE_ROUND_GREEN: 16,
  SPROUT: 17,
  CANOPY_GREEN_L: 18,
  CANOPY_GREEN_CENTER: 19,
  CANOPY_GREEN_R: 20,
  CANOPY_ORANGE_L: 21,
  CANOPY_ORANGE_CENTER: 22,
  CANOPY_ORANGE_R: 23,
  DIRT_L: 24,
  DIRT_CENTER: 25,
  DIRT_R: 26,
  TREE_PINE_ORANGE: 27,
  TREE_PINE_GREEN: 28,
  MUSHROOMS: 29,
  CANOPY_GREEN_BL: 30,
  CANOPY_GREEN_B: 31,
  CANOPY_GREEN_BR: 32,
  CANOPY_ORANGE_BL: 33,
  CANOPY_ORANGE_B: 34,
  CANOPY_ORANGE_BR: 35,
  DIRT_BL: 36,
  DIRT_B: 37,
  DIRT_BR: 38,
  DIRT_NOTCH_TL: 39,
  DIRT_NOTCH_TR: 40,
  DIRT_NOTCH_BR: 41,
  DIRT_NOTCH_BL: 42,
  MOSSY_STONE: 43,
  WOOD_LOG: 106,
  SUPPLY_SACK: 107,
  WOODCUTTER_AXE: 127,
  STORAGE_BARREL: 130,
});

// 1x1 (16x16) — Campfire: stone ring, crossed wooden logs, bright ember flame
const CAMPFIRE_ROWS: readonly string[] = [
  '................', // 00
  '.......kk.......', // 01
  '......kRyk......', // 02
  '.....kRoyRk.....', // 03
  '....kRoWWyRk....', // 04
  '....kRayyyok....', // 05
  '...kRaoWWyoRk...', // 06
  '...kRaoWWyoRk...', // 07
  '..kgkcoWWockgk..', // 08
  '.kwgkcboobckgwk.', // 09
  '.kgSkbddRddkSgk.', // 10
  '.kwgkbdoodbKgwk.', // 11
  '.kSgwkkddkkwgSk.', // 12
  '..kkgwgSSgwgkk..', // 13
  '...kwggSSggwk...', // 14
  '....kkkkkkkk....', // 15
];

// 1x1 (16x16) — Ancient Totem: carved timber pillar with face, red/gold accents, stone collar
const TOTEM_ROWS: readonly string[] = [
  '.....kk..kk.....', // 00
  '....kRykkyRk....', // 01
  '....kcctbcck....', // 02
  '...kccbbbbcck...', // 03
  '...kRccbbccRk...', // 04
  '...kcWyKKyWck...', // 05
  '...kccRrrRcck...', // 06
  '...kbcKKKKcbk...', // 07
  '..kkbbbccbbbkk..', // 08
  '.kRykbyttybkyRk.', // 09
  '..kkkbbRRbbkkk..', // 10
  '....kbbttbbk....', // 11
  '....kdbbbddk....', // 12
  '...kwgddddgwk...', // 13
  '..kwgSSkkSSgwk..', // 14
  '...kkkkkkkkkk...', // 15
];

// 3x3 (48x48) — Meditation Cave: rocky stone mound, mossy ledges, arched dark entrance & lantern
const STUDY_CAVE_ROWS: readonly string[] = [
  '................................................', // 00
  '................................................', // 01
  '................................................', // 02
  '................kkkkkkkkkkkkkkkk................', // 03
  '..............kkwwwggggggggggSSSkk..............', // 04
  '............kkwwLLGGGGGGgggggSSSSSkk............', // 05
  '..........kkwwLLGGGGGGMMMMggggSSSSSSkk..........', // 06
  '.........kwwLLGGGGGGMMMMDDggwwwwSSSSSSk.........', // 07
  '........kwLLGGGGGMMMMDDDDkkgggwwwSSSTTsk........'.replace('s', 'S'), // 08
  '.......kwwGGGGMMMMDDDDkkkwwwgggwwSSSTTTSk.......', // 09
  '......kwwGGGGGMMMDDDkkwwwwgggggggSSSTTTTSk......', // 10
  '.....kwwgGGMMMDDkkkkwwgggwwwgggggSSSTTTTTSk.....', // 11
  '.....kwgggGMDkkkwwwggggwwwgggSSSSSSSTTTTTSk.....', // 12
  '....kwwggggkkwwwggggwwwwgggggSSSTTTTTTTTSSSk....', // 13
  '....kLLGGgggggggwwwwgggwwwwggSSTTTTTTTggggSk....', // 14
  '...kLLGGGDDgggggwwgggSSwwwwggSSTTTTTTggSSSTSk...', // 15
  '...kGGGMMMDggggwwggSSSSSSwwgSSTTTTTggSSSTTTTk...', // 16
  '...kgggkkkggggwwggSSSTTTTSSgSTTTTggSSSTTTTTTk...', // 17
  '..kwwggSSwgggkkwwwwwwwwwkkkkSTTTggSTTTTTLLGGk...', // 18
  '..kwggSSSSwgkwwNNNNNNNNNNwwkSTTggSTTTTTLGGMMDk..', // 19
  '..kLLGGSSSTkwwNNNNNNNNNNNNwkSTTgSTTTTTTGGMDkkSk.', // 20
  '..kGGMDSTTTkNNNNKKKKKKKKNNNNkSTSSTTTTTTTkkwwgSk.', // 21
  '.kggkkSTTTkNNNKKKKKKKKKKKKNNkSSSTTTTTTTTkwgSSSk.', // 22
  '.kwgSSTTTTkNNKKKKKccbbKKKKNNkSTTTTTTTTTkLLGSTTk.', // 23
  '.kSTTTTTTTkNNKKKKcoWWyoKKKNNkSTTTTTTTTkGGMDTTTk.', // 24
  '.kSTTTTTTTkNNKKKKKcoyyoKKKNNkSTTTTTTTTkMDkkSTTk.', // 25
  '.kSTTTTTTTkNNKKKKKKccKKKKKNNkSTTTTTTTkkwwSSSTTk.', // 26
  '.kLGGTTTTTkNNKKKKKKKKKKKKKNNkSTTTTTkwwLLGTTTTTk.', // 27
  '.kGMGDTTTTkNNKKKKKKKKKKKKKNNkSTTTTkLLGGGMDTTTTk.', // 28
  '.kDDkkSTTTkNNKKKKKKKKKKKKKNNkSTTTTkGGMMMDDSTTTk.', // 29
  '..kwkSTTTTkNNKKKKKKKKKKKKKNNkSTTTTkwkkDDkSSTTTk.', // 30
  '..kgSSTTTTkNNKKKKKKKKKKKKKNNkSTTTTkwSSwgSSTTTTk.', // 31
  '..kgSSTTTTkNNKKKKKKKKKKKKKNNkSTTTTkSSwgSSTTTTTk.', // 32
  '..kSTTTTTTkNNKKKKKKKKKKKKKNNkSTTTTSSggSSTTTTTTk.', // 33
  '..kSTTTTTTkNNKKKKKKKKKKKKKNNkSTTTTSSSSTTTTTTTTk.', // 34
  '..kSTTTTTTkNNKKKKKKKKKKKKKNNkSTTTTTTTTTTTTTTTTk.', // 35
  '..kSTTTTTTkNNKKKKKKKKKKKKKNNkSTTTTTTkLGGkSTTTTk.', // 36
  '..kSTTTTTTkkNNNNNNNNNNNNNNkkSTTTTTTkGGMDkSTTTTk.', // 37
  '..kSTTTTTTwwkwwwwwwwwwwwwkwwSTTTTTTkDDkkSSTTTTk.', // 38
  '...kSSTTTkkwwwggggggggggwwwkkSTTTTwwkkwwSSTTTk..', // 39
  '...kSSSTkwwggSSSSggggggSSSSgwkSSTwwggSSSSSTTTk..', // 40
  '....kSSTkwggSSSTTggggggTTSSSwkwgwgSSSTTTTTSSk...', // 41
  '....kkkkkwgSSSTTTggggggTTTSSgwkwwgSSSTTTSSSkk...', // 42
  '.....kwwggSSggSSgggwwgggSSggSSgwwgggSSSSSSkk....', // 43
  '......kkwwwwgggggwwwwwwgggggwwwwggSSSSSkkkk.....', // 44
  '........kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk.........', // 45
  '................................................', // 46
  '................................................', // 47
];

// 2x2 (32x32) — Elder's Hut: thatched dome hut, wooden door, bone talisman & tribal banner
const ELDER_HUT_ROWS: readonly string[] = [
  '.............kk..kk.............', // 00
  '............kcckkcck............', // 01
  '.............kdkkdkkkkk.........', // 02
  '..............kddkkRRyyk........', // 03
  '.............kkcckkrrRRk........', // 04
  '...........kkyyttyykkk..........', // 05
  '.........kkyyttttoooykk.........', // 06
  '.......kkyytttoooottttyyk.......', // 07
  '......kyyttooottttoooootyk......', // 08
  '.....kytooottttoooottttooyk.....', // 09
  '....kyttootttoooooottttootyk....', // 10
  '...kytooottoooccooottoooottyk...', // 11
  '..kyyttoottoccbbccoottootttoyk..', // 12
  '..kytoootttccbbbbccoottttootyk..', // 13
  '.kytooottooccddddccoottttoottyk.', // 14
  '.kcooottoocccddddcccoooootoocck.', // 15
  '.kddcccoocccbbbbbbcccoooocccddk.', // 16
  '..kkkddddcccbbbbbbccccdddddkkk..', // 17
  '...kppppkbbkWWkkWWkbbkppppppk...', // 18
  '...kppptkccksWssWsckckptttppk...', // 19
  '...kpttcbbbbkddddkbbbbcttttpk...', // 20
  '...kpttcbbkbbcddcbbkbbcttttpk...', // 21
  '...kpbbcbbkbcboobcbkbbcbccbbk...', // 22
  '...kddbcbbkbcboobcbkbbcbccddk...', // 23
  '...kppbcbbkbcbbbbcbkbbcbccppk...', // 24
  '...kptkcbbkbcbddbcbkbbckttppk...', // 25
  '...kptkcbbkbcbbbbcbkbbckttppk...', // 26
  '..kwgkdkbbkbcboobcbkbbkdkSSgwk..', // 27
  '..kgSkkkkkkwggggggwkkkkkkkSSgk..', // 28
  '...kk.....kwggSSggwk......kkk...', // 29
  '..........kSSggggSSk............', // 30
  '...........kkkkkkkk.............', // 31
];

// 2x2 (32x32) — Foraging Post: timber awning + drying rack, berry bush, woven basket & sack
const FORAGING_POST_ROWS: readonly string[] = [
  '................................', // 00
  '................................', // 01
  '..kkkkkkkkkkkk..................', // 02
  '.kGGGGMMMMDDDDkkkkkkkkkkkkkk....', // 03
  '.kLLGGGGMMMMDDkccbbbbbbdddddk...', // 04
  '.kGGGGMMMMDDDDkccbbbbbbdddddk...', // 05
  '.kccbbcccbbdddkkdkkkdkkkdkkk....', // 06
  '..kddkccccbbdddkGk.kRk.kGk......', // 07
  '...kdk....kddk.kMk.kRk.kMk......', // 08
  '...kck....kck..kDk.kyk.kDk......', // 09
  '...kck....kck..kk...k...kk......', // 10
  '...kck....kck...................', // 11
  '...kck....kck......kkkkkk.......', // 12
  '...kck....kck....kkLLGGGGkk.....', // 13
  '...kckkkkkkck...kLLLGGMMGGMk....', // 14
  '...kcbbbbbbck..kLLGGMRGMGRGMk...', // 15
  '..kkkkkkkkkkk..kGGMMGGGMMMMMDk..', // 16
  '.kptttppkckkck.kGMRGGMMMDMMMDk..', // 17
  '.kppttppkcckdk.kGGGGMMDDDDDDDk..', // 18
  '.kppccppkbbkdk..kMMDDDDDDDDDk...', // 19
  '.kcctccckddkkkk..kkDDDDDDDkk....', // 20
  '.kcccccakttRook...kkkkkkkk......', // 21
  '.kddccddkRRttok..kkkkkk.........', // 22
  '..kkddkkktbbtok.kccbbcck........', // 23
  '...kck..kbbddbk.kcbddbbk..kkkk..', // 24
  '...kck..kddbddk.kcSSSSck.kppppk.', // 25
  '..kwgk...kkkkk..kcbddbbk.kpttck.', // 26
  '..kgSk..........kbbddbbk.kcccbk.', // 27
  '...kk............kkkkkk...kkkk..', // 28
  '................................', // 29
  '................................', // 30
  '................................', // 31
];

// 2x3 (32x48) — Primitive Granary: elevated thatched loft on stilts, grain pile, barrel & sack
const FOOD_CACHE_ROWS: readonly string[] = [
  '...............kk...............', // 00
  '..............kddk..............', // 01
  '.............ktyytk.............', // 02
  '............kkyyyytk............', // 03
  '...........kyyttyyytk...........', // 04
  '..........kyyttootyytk..........', // 05
  '.........kyyttoooootyyk.........', // 06
  '........kyyttooyyoottyyk........', // 07
  '.......kkyyttooyyyoottyyk.......', // 08
  '......kyyttooottyytoootyyk......', // 09
  '.....kyyttooottttttooottyyk.....', // 10
  '....kyyttooottyyyyyttoootyyk....', // 11
  '...kyyttooottyyyyyyyttoootyyk...', // 12
  '..kyyttooottyyoooootyyttoootyk..', // 13
  '..koyttooottooooooooottttoooyk..', // 14
  '.kcyyttoooooottttttooooootttcck.', // 15
  '.kcooottoooottyyyyyttoooottoock.', // 16
  '.kddcccooooottoooootooooccccddk.', // 17
  '..kkkddcccccoooooooocccccdddkkk.', // 18
  '....kddddccccccccccccccdddddk...', // 19
  '....ktttttttttttttttttttttttk...', // 20
  '....kccbbbbbbbccccccbbbbbbcck...', // 21
  '....ktttttttckNNNNNNkcttttttk...', // 22
  '....kccbbbbbckNKKKKNkcbddddck...', // 23
  '....ktttttttckNKKKKNkcctttttk...', // 24
  '....kccbbbbbckNyyppNkcbddddck...', // 25
  '....ktttttttckyyppyykcctttttk...', // 26
  '....kccbbbbbckpyyyypkcbddddck...', // 27
  '....kddddddddkcccccckdddddddk...', // 28
  '...kkbbbbbbbbbbbbbbbbbbbbbbbkk..', // 29
  '...kccccccccccccccccccccccccck..', // 30
  '...kdddddddddddddddddddddddddk..', // 31
  '....kkkcck......kck......kcckk..', // 32
  '......kbbk......kdk......kbbk...', // 33
  '......kddk......kdk......kddk...', // 34
  '......kbbk..kk..kdk..kk..kbbk...', // 35
  '......kddk.kppk.kdk.kcck.kddk...', // 36
  '......kbbkkpttpkkdkkcbcckkbbk...', // 37
  '..kkkkkddkpttppkddkcbSSbckddk...', // 38
  '.kppppkbbkptccpkddkcbbbbckbbk...', // 39
  '.kpttckddkcbbcckddkcbSSbckddk...', // 40
  '.kpccpkbbk.kkkkkkkkcbddbbkbbk...', // 41
  '.kcccbkddk.kyyyyyykcccccckddk...', // 42
  '..kkkkwggkkyyppyyykccccccwggk...', // 43
  '.....kgSSkyyppyppyykcccckgSSk...', // 44
  '......kkkkyyoooooyyk.kkk..kk....', // 45
  '.........kkkkkkkkkk.............', // 46
  '................................', // 47
];

export const STONE_AGE_SPRITE_DATA: Readonly<Record<string, PixelSpriteMatrix>> = Object.freeze({
  stone_age_campfire: {
    id: 'stone_age_campfire',
    width: 16,
    height: 16,
    rows: CAMPFIRE_ROWS,
    reusedTiles: [
      {
        pack: 'tiny-town',
        tileIndex: REUSED_TINY_TOWN_TILES.WOOD_LOG,
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
    id: 'stone_age_study_cave',
    width: 48,
    height: 48,
    rows: STUDY_CAVE_ROWS,
    reusedTiles: [],
  },
  stone_age_elder_hut: {
    id: 'stone_age_elder_hut',
    width: 32,
    height: 32,
    rows: ELDER_HUT_ROWS,
    reusedTiles: [],
  },
  stone_age_foraging_post: {
    id: 'stone_age_foraging_post',
    width: 32,
    height: 32,
    rows: FORAGING_POST_ROWS,
    reusedTiles: [
      {
        pack: 'tiny-town',
        tileIndex: REUSED_TINY_TOWN_TILES.GREEN_BUSH,
        usage: 'Berry bush silhouette & foliage palette adapted from Tiny Town tile 5',
      },
      {
        pack: 'tiny-town',
        tileIndex: REUSED_TINY_TOWN_TILES.SUPPLY_SACK,
        usage: 'Woven supply sack/pot shading adapted from Tiny Town tile 107',
      },
      {
        pack: 'tiny-town',
        tileIndex: REUSED_TINY_TOWN_TILES.STORAGE_BARREL,
        usage: 'Storage crate/barrel detail adapted from Tiny Town tile 130',
      },
    ],
  },
  stone_age_food_cache: {
    id: 'stone_age_food_cache',
    width: 32,
    height: 48,
    rows: FOOD_CACHE_ROWS,
    reusedTiles: [
      {
        pack: 'tiny-town',
        tileIndex: REUSED_TINY_TOWN_TILES.SUPPLY_SACK,
        usage: 'Under-granary burlap sack silhouette adapted from Tiny Town tile 107',
      },
      {
        pack: 'tiny-town',
        tileIndex: REUSED_TINY_TOWN_TILES.STORAGE_BARREL,
        usage: 'Hooped storage barrel detail adapted from Tiny Town tile 130',
      },
    ],
  },
});

export interface SpriteValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

/**
 * Validates that a pixel-art sprite matrix matches exact dimensions and uses
 * only '.' or allowed Tiny Town palette color keys.
 */
export function validatePixelSpriteData(sprite: PixelSpriteMatrix): SpriteValidationResult {
  const errors: string[] = [];

  if (!sprite || !Array.isArray(sprite.rows)) {
    return { valid: false, errors: ['Sprite rows array is missing.'] };
  }

  if (sprite.rows.length !== sprite.height) {
    errors.push(
      `Sprite "${sprite.id}" height mismatch: expected ${sprite.height} rows, got ${sprite.rows.length}.`
    );
  }

  sprite.rows.forEach((row, y) => {
    if (row.length !== sprite.width) {
      errors.push(
        `Sprite "${sprite.id}" row ${y} width mismatch: expected ${sprite.width}, got ${row.length}.`
      );
    }

    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === '.') continue;
      const hex = TINY_TOWN_PALETTE[ch];
      if (!hex) {
        errors.push(`Sprite "${sprite.id}" invalid palette key "${ch}" at (${x}, ${y}).`);
      } else if (!ALLOWED_TINY_TOWN_HEX_SET.has(hex)) {
        errors.push(`Sprite "${sprite.id}" disallowed color "${hex}" at (${x}, ${y}).`);
      }
    }
  });

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validates all registered Stone Age building sprite matrices.
 */
export function validateAllSpriteData(): SpriteValidationResult {
  const allErrors: string[] = [];
  for (const sprite of Object.values(STONE_AGE_SPRITE_DATA)) {
    const res = validatePixelSpriteData(sprite);
    if (!res.valid) {
      allErrors.push(...res.errors);
    }
  }
  return {
    valid: allErrors.length === 0,
    errors: allErrors,
  };
}
