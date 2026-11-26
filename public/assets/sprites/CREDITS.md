# Sprite credits / Ghi công tài nguyên hình ảnh

## Third-party assets (CC0 1.0 Universal, public domain dedication)

| Pack | Author | Version | License | Files in this repo |
|---|---|---|---|---|
| Tiny Town | Kenney (www.kenney.nl) | 1.1 | CC0 1.0 | `kenney-tiny-town/tilemap_packed.png` |
| Tiny Dungeon | Kenney (www.kenney.nl) | 1.0 | CC0 1.0 | `kenney-tiny-dungeon/tilemap_packed.png` |

- License text copied from each pack: `kenney-tiny-town/License.txt`, `kenney-tiny-dungeon/License.txt`.
- CC0 allows personal, educational and commercial use without permission. Crediting Kenney is voluntary; it is given here as a courtesy.
- Tile layout: 16 x 16 px tiles, packed sheet 192 x 176 px (12 columns x 11 rows, no spacing). Tile index = row * 12 + column.

## Project-original & reused tile mapping

- **Stage 4a — Map terrain (`kenney-tiny-town/tilemap_packed.png`):**
  - Tile `0` (plain grass), tile `1` (tufted grass), tile `2` (wildflowers) — rendered deterministically via `TileImage` on unlocked grid cells (`MapGridView`) and showcased in `#sprites` (`SpriteGallery`).
- **Stage 4a — Stone Age buildings (`src/ui/components/civilization/spriteData.ts`):**
  - All 6 Stone Age buildings (`stone_age_campfire`, `stone_age_totem`, `stone_age_study_cave`, `stone_age_elder_hut`, `stone_age_foraging_post`, `stone_age_food_cache`) are original pixel-art data authored for this project using the exact Tiny Town palette (`#3f2631` outline).
  - Visual references/details adapted from Tiny Town CC0 tiles: tile `5` (green bush — Foraging Post), tile `106` (wood log — Campfire), tile `107` (supply sack/pot — Foraging Post & Primitive Granary), tile `130` (barrel/basket — Foraging Post & Primitive Granary).
- **Stage 4a-2 & 4a-3 — Visual Terrain & Locked Forest Landscape (`src/ui/components/civilization/terrainDecor.ts`):**
  - **Unlocked cells (`isUnlocked: true`):** Grass (`0`, `1`, `2`), sparse `2×2` / `3×3` / notched dirt patches (`12`, `13`, `14`, `24`, `25`, `26`, `36`, `37`, `38`, `39`, `40`, `41`, `42`), rare mossy stone (`43`), sparse sprout (`17`) / mushrooms (`29`), and rare plain-grass green bushes (`5`) from `kenney-tiny-town/tilemap_packed.png` (pure visual decor, zero trees/canopies, zero placement blocking).
  - **Locked forest border (`isUnlocked: false`, Stage 4a-3):** Per-4×4-chunk deterministic forest (~30% tree density / ~70% darkened clearings) assembled strictly from the 6 recipes `M1–M6` (`[3]/[15]` tall autumn, `[4]/[16]` tall green, `[6,8]/[30,32]` 2×2 green, `[9,11]/[33,35]` 2×2 autumn, `[·,7,·]/[18,19,20]/[·,31,·]` 3×3 green cross, `[·,10,·]/[21,22,23]/[·,34,·]` 3×3 autumn cross) plus `1×1` green bush filler (`5`) ONLY — tiles `15`/`16` are restricted strictly to `M1`/`M2` bases (never standalone), and standalone cones (`27`, `28`) are retired. Grass ground tiles are darkened (`LOCKED_FOREST_OVERLAY_OPACITY = 0.44`) **under** the tree overlay in `MapGridView` and `SpriteGallery` (with `TileImage` cascade positioning guard) so trees retain 100% original Tiny Town color contrast.
- **Milestone 5B.6b — Land Expansion Animation (`src/ui/components/civilization/ExpansionRevealOverlay.tsx`):**
  - Woodcutter axe tile `127` from `kenney-tiny-town/tilemap_packed.png` rendered during post-commit land expansion reveal (`EXPANSION_AXE_TILE_INDEX = 127`) alongside procedural flash & wood-chip particles.
- **Stage 4b — Focus scene villagers & Stone Age campsite (`src/ui/components/FocusSceneArea.tsx`):**
  - CC0 `kenney-tiny-dungeon/tilemap_packed.png`: Villager characters `86` (bearded craftsman), `88` (settler), `100` (tribal elder) and handheld tools `117` (hammer), `119` (axe) during active focus.
  - CC0 `kenney-tiny-town/tilemap_packed.png` & project `STONE_AGE_SPRITE_DATA`: Trees `3`/`15`, `4`/`16`, bush `5`, sprout `17`, mushrooms `29`, wood log `106`, alongside `stone_age_study_cave` and `stone_age_campfire` (`PixelSprite`).

- **Milestone Villager — Animated Villager Sprite Sheets (`public/assets/sprites/villagers/`):**
  - Character sprite sheets (`elder.png`, `crafter.png`, `woodworker.png`) are 64×64 pixel sheets (16×16 cell, 4 columns × 4 rows) procedurally generated from CC0 `kenney-tiny-dungeon/tilemap_packed.png`: tile `100` (tribal elder), tile `88` (crafter/settler), tile `86` (woodworker/craftsman).
  - Row 0: `idle` (2 frames, 600ms/frame), Row 1: `walk_down` (4 frames, 150ms/frame), Row 2: `walk_right` (4 frames, 150ms/frame), Row 3: `walk_left` (4 frames, 150ms/frame).
- **Milestone 5E-1 — Construction Stages & Clock Tiles:**
  - `public/assets/sprites/clock_tiles_16.png`: Project-original 48×16 pixel sheet (three 16×16 tiles: `0` = clock for active jobs, `1` = hourglass for waiting jobs, `2` = stopwatch icon).
  - `src/ui/components/civilization/constructionSpriteData.ts`: Project-original 4-stage progressive blueprint/scaffolding pixel matrices derived from the Tiny Town Stone Age building palette for `stone_age_totem` (Standing Stone), `stone_age_study_cave`, `stone_age_elder_hut`, `stone_age_foraging_post`, and `stone_age_food_cache`.
- **Milestone 5G — Era Tool Skins, Bronze Age Building/Construction Matrices & Bronze Villagers (Kenney Tiny Town / Tiny Dungeon CC0):**
  - `public/assets/sprites/era/tool_skins_16.png`: 64×48 pixel sheet (4 cols × 3 rows of 16×16 cells: `axe`, `pickaxe`, `sickle`, `hammer` across Stone Age, Bronze Age, and Iron Age+ tiers) adapted from CC0 Kenney tiles/palette.
  - `src/ui/components/civilization/bronzeSpriteData.ts` & `src/ui/components/civilization/bronzeConstructionSpriteData.ts`: 10 Bronze Age building pixel matrices and 4-stage construction matrices quantized to the Tiny Town CC0 palette (`bronze_forge`, `bronze_market_stall`, `bronze_grain_silo`, `bronze_irrigated_field`, `bronze_apiary`, `bronze_scribe_hall`, `bronze_craft_workshop`, `bronze_watchtower`, `bronze_longhouse`, `bronze_town_hall`), generated with `docs/assets/era/gen_bronze_construction.py` (previews in `docs/assets/era/`).
  - `public/assets/sprites/villagers/{smith,merchant,mason}.png`: 64×64 animated villager sprite sheets (4 cols × 4 rows of 16×16 cells) derived/recolored from CC0 Kenney Tiny Dungeon (`smith`, `merchant`, `mason`).

## Rule for adding new assets

Only add assets that ship with an explicit license file (CC0, MIT, or CC-BY with credit added here). Do NOT add assets with unclear terms, "free for personal use", NC/SA licenses, or anything taken from commercial games. Keep a copy of each pack's license file next to the assets.
