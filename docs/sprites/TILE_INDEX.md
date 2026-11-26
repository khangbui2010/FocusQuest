# Tile index (verified against the labeled PNG contact sheets in this folder)

Packed sheets: 192 x 176 px, 16 x 16 tiles, 12 columns x 11 rows, no spacing.
`index = row * 12 + column`; `x = (index % 12) * 16`; `y = floor(index / 12) * 16`.
Labeled contact sheets: `tiny-town-labeled.png` (all 132 tiles), `tiny-dungeon-characters-labeled.png` (tiles 84-131).

## Tiny Town (`kenney-tiny-town/tilemap_packed.png`)
- Grass (opaque): `0` plain, `1` tufts, `2` wildflowers
- Dirt with grass border (3x3 opaque set): `12` TL, `13` T, `14` TR, `24` L, `25` center, `26` R, `36` BL, `37` B, `38` BR (combine `[12, 14]` / `[36, 38]` for a 2×2 dirt patch)
- Dirt inner-notch corners (opaque, used with notched 3×3 dirt patches): `39` grass-notch TL, `40` grass-notch TR, `41` grass-notch BR, `42` grass-notch BL
- Locked forest 1×1 filler (transparent bg, Stage 4a-3, ~30% overall tree density): `5` green bush ONLY (tiles `15` and `16` have open cut-top edges and NEVER stand alone outside `M1`/`M2`)
- Retired standalone 1×1 cones (unused in Stage 4a-3): `27` small autumn/orange pine, `28` small green pine (tiles `3`, `4`, `15`, `16` also NEVER appear singly outside `M1`/`M2`)
- **Mandatory 6 Locked Forest Recipes (`M1–M6`, transparent bg — assemble ONLY as complete blocks over darkened grass):**
  - **M1 — Tall 1×2 autumn (`tall_orange`):** `3` (top) directly over `15` (bottom/trunk)
  - **M2 — Tall 1×2 green (`tall_green`):** `4` (top) directly over `16` (bottom/trunk)
  - **M3 — 2×2 green cluster (`cluster_a_green`):** `[6, 8]` top row over `[30, 32]` bottom row
  - **M4 — 2×2 autumn cluster (`cluster_a_orange`):** `[9, 11]` top row over `[33, 35]` bottom row
  - **M5 — 3×3 green cross (`cross_b_green`):** `[·, 7, ·]` / `[18, 19, 20]` / `[·, 31, ·]` (`·` = empty `"—"` corners owned by the 3×3 block; `19` ONLY at center)
  - **M6 — 3×3 autumn cross (`cross_b_orange`):** `[·, 10, ·]` / `[21, 22, 23]` / `[·, 34, ·]` (`·` = empty `"—"` corners owned by the 3×3 block; `22` ONLY at center)
- Unlocked micro-decor / accents: `17` green sprout (transparent bg), `29` red spotted mushrooms (transparent bg), `43` mossy stone patch on grass (opaque), `5` green bush (sparse on plain grass `0` only)
- Fences: 44-47, 56-59, 68-71, 80-82; wooden sign 83
- Props: 94 beehive, 93 coin, 95 target, 107 sack/pot, 106 wood log, 115 pickaxe, 116 pitchfork, 118 bow, 119 arrow, 127 woodcutter axe, 130 barrel/basket, 131 bucket with water
- Brick/stone walls, roofs, windows and doors: 48-91 (medieval look; not Stone Age, recolor or avoid)
- Stone floors / arches: 96-126 (not needed for Stone Age)

## Tiny Dungeon (`kenney-tiny-dungeon/tilemap_packed.png`)
Characters (16x16, dark outline, front-facing, static):
- 84 wizard (purple), 85 young man (brown hair, light tunic), 86 bald bearded man (brown vest), 87 horned-helmet warrior, 88 brown-haired man, 98 brown-haired man (grey), 99 woman (purple dress), 100 grey-haired elder
- 96-97 armored knights, 109-112 monsters / hooded figures (not needed)
Tools / weapons: 103-107 daggers and swords, 117 hammer, 118 double axe, 119 axe, 113-116 potions
Treasure chests 89-92.
Used in Phase 4b (`src/ui/components/FocusSceneArea.tsx`): earth-toned characters `86`, `88`, `100` and hand-held tools `117`, `119` (alongside Tiny Town `3`/`15`, `4`/`16`, `5`, `17`, `29`, `106`).

## Clock & Construction UI Icons (`public/assets/sprites/clock_tiles_16.png`)
- Horizontal strip: `48 × 16` px (`3` tiles × `16 × 16` px, rendered via `ClockTileIcon` / `CLOCK_TILE_INDEX` in `TileImage.tsx` & `spriteRegistry.ts`):
  - `0` (`CLOCK`): Pixel analog clock (active construction / clearing job badge & catalog preview)
  - `1` (`HOURGLASS`): Pixel hourglass (queued / pending construction / clearing job badge)
  - `2` (`STOPWATCH`): Pixel stopwatch (extra timer icon reserve)

## Under-Construction 4-Stage Sprites (`src/ui/components/civilization/constructionSpriteData.ts`)
- Generated offline from the finished Stone Age sprites in `spriteData.ts` using strictly the Tiny Town palette:
  - Applies to: `stone_age_totem` (Standing Stone), `stone_age_study_cave`, `stone_age_elder_hut`, `stone_age_foraging_post`, `stone_age_food_cache` (`stone_age_campfire` builds instantly in `0s` with no construction stage).
  - 4 stages (`CONSTRUCTION_STAGE_COUNT = 4`, resolved by `getConstructionStageIndex(progress)` / `getConstructionSprite(definitionId, progress)`):
    - Stage `0` (`0–24%`): Blueprint dashed cyan outline + wooden posts/corner anchors
    - Stage `1` (`25–49%`): Lower `35%` revealed + scaffolding bar
    - Stage `2` (`50–74%`): Lower `65%` revealed + scaffolding frame
    - Stage `3` (`75–99%`): Lower `90%` revealed before full sprite swap upon job completion

## Stone Age Awards Icons (`src/ui/components/awards/AwardIcon.tsx` & `src/core/awards/awardsCatalog.ts`)
- **Zero new binary sprite assets** — all 13 Stone Age awards reuse existing CC0/origin tile sheets via `TileImage` & `ClockTileIcon`:
  - `clock_tiles_16.png`: `#1` Hourglass (`focus_hours`), `#2` Stopwatch (`long_haul`)
  - `kenney-tiny-town/tilemap_packed.png`: `#17` sprout (`player_level`), `#83` wooden sign (`quest_keeper`), `#93` coin (`perfect_day`), `#95` target (`focus_sessions`), `#106` wood log (`focus_streak`), `#115` pickaxe (`master_builder`), `#117` banner/flag (`era_ready`), `#127` woodcutter axe (`land_clearer`)
  - `kenney-tiny-dungeon/tilemap_packed.png`: `#86` bearded villager (`tribe`), `#99` woman (`tribe_complete`), `#117` hammer (`builder`)

## Era Tool Skins (`public/assets/sprites/era/tool_skins_16.png` — Milestone 5G)
- Dimensions: `64 × 48` px (`4` columns × `3` rows of `16 × 16` px tiles, rendered via `EraToolTileIcon` & `getEraToolSkinSpec`):
  - **Columns (`ToolKind`):** `0` = `axe`, `1` = `pickaxe`, `2` = `sickle`, `3` = `hammer`.
  - **Rows (`Era`):** `0` = `STONE_AGE`, `1` = `BRONZE_AGE`, `2` = `IRON_AGE` and later eras (`MEDIEVAL`, `EARLY_MODERN`, `MODERN`, `FUTURISTIC`, `INTERPLANETARY`).
  - Wired into `FocusSceneArea` (camp & work sub-scenes) and `Awards` (`builder` -> `hammer`, `master_builder` -> `pickaxe`, `land_clearer` -> `axe`).

## Bronze Age Sprites & Villager Sheets (Milestone 5G — Preview Only Until 5C-2)
- **Bronze Age Buildings (`src/ui/components/civilization/bronzeSpriteData.ts`):** `10` quantized Tiny Town palette matrices (`BRONZE_AGE_SPRITE_DATA`, accessed via isolated `getBronzeBuildingSprite` without altering `STONE_AGE_BUILDING_DEFINITIONS`):
  - `bronze_forge` (`48×32`, `3×2`), `bronze_market_stall` (`32×32`, `2×2`), `bronze_grain_silo` (`32×48`, `2×3`), `bronze_irrigated_field` (`48×48`, `3×3`), `bronze_apiary` (`32×32`, `2×2`), `bronze_scribe_hall` (`32×48`, `2×3`), `bronze_craft_workshop` (`48×32`, `3×2`), `bronze_watchtower` (`32×48`, `2×3`), `bronze_longhouse` (`64×32`, `4×2`), `bronze_town_hall` (`64×48`, `4×3`).
- **Bronze Age 4-Stage Construction (`src/ui/components/civilization/bronzeConstructionSpriteData.ts`):** `4` progressive stages per Bronze building (`BRONZE_CONSTRUCTION_SPRITE_STAGES`, `getBronzeConstructionSprite`).
- **Bronze Age Villagers (`public/assets/sprites/villagers/{smith,merchant,mason}.png`):** `64 × 64` px sheets (`4 × 4` grid of `16 × 16` px cells matching `VILLAGER_ANIMATIONS`), exposed via `BRONZE_VILLAGER_ROLES` / `getBronzeVillagerSheetUrl` in `spriteRegistry.ts` and previewed in `#sprites`.
- **Reference Previews & Generator (`docs/assets/era/`):** `tool_skins_preview.png`, `bronze_buildings_preview.png`, `bronze_construction_stages_preview.png`, `villagers_bronze_preview.png`, `gen_bronze_construction.py` (kept strictly outside `public/` & `dist/`).

## Palette used by Tiny Town (hex)
Outline/dark: #3f2631, #3d212d, #262b44
Greens: #84c669, #479f4a, #65a556, #8bd87d
Browns / oranges / sand: #eaa56c, #bd6c4a, #763b36, #cf8254, #e38628, #fdbe53, #fcbc8f, #fec99c, #f28462
Greys / blues: #c0cbdc, #8b9bb4, #5a6988, #52607c, #8c9cb5
Reds: #c34b35, #e84537
White / water: #ffffff, #009adc, #76e4ff

