import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { I18nProvider } from '../../src/i18n/I18nContext.tsx';
import { EN_MESSAGES } from '../../src/i18n/locales/en.ts';
import { VI_MESSAGES } from '../../src/i18n/locales/vi.ts';
import {
  BRONZE_AGE_BUILDING_IDS,
  BRONZE_AGE_SPRITE_DATA,
  BRONZE_CONSTRUCTION_SPRITE_STAGES,
  BRONZE_CONSTRUCTION_STAGE_COUNT,
  BRONZE_VILLAGER_ROLES,
  EraToolTileIcon,
  TOOL_SKIN_CELL_PX,
  TOOL_SKIN_COLS,
  TOOL_SKINS_COLUMNS,
  TOOL_SKINS_ROWS,
  TOOL_SKINS_SHEET_PATH,
  VILLAGER_ROLES,
  getBronzeBuildingSprite,
  getBronzeConstructionSprite,
  getBronzeVillagerSheetUrl,
  getBuildingSprite,
  getEraToolSkinRow,
  getEraToolSkinSpec,
} from '../../src/ui/components/civilization/spriteRegistry.ts';
import { SpriteGallery } from '../../src/ui/components/civilization/SpriteGallery.tsx';
import { validatePixelSpriteData } from '../../src/ui/components/civilization/spriteData.ts';
import { FocusSceneArea } from '../../src/ui/components/FocusSceneArea.tsx';
import { AwardIcon, AwardsView } from '../../src/ui/components/awards/index.ts';
import { BuildingCatalogPanel } from '../../src/ui/components/civilization/BuildingCatalogPanel.tsx';
import {
  STONE_AGE_BUILDING_DEFINITIONS,
  getBuildingDefinition,
} from '../../src/core/civilization/buildingCatalog.ts';
import { createInitialCivilizationState } from '../../src/core/civilization/civilizationState.ts';
import { STONE_TO_BRONZE_ADVANCE_REQUIREMENTS } from '../../src/core/civilization/eraRules.ts';
import {
  STONE_AGE_AWARDS_CATALOG,
  createInitialAwardState,
  evaluateAwards,
} from '../../src/core/awards/index.ts';
import { createInitialQuestState } from '../../src/core/quests/questEngine.ts';
import { ToolKind } from '../../src/ui/components/civilization/constructionTools.ts';

const ROOT_DIR = path.resolve(import.meta.dirname, '../..');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const DIST_DIR = path.join(ROOT_DIR, 'dist');

function readPngDimensions(filePath: string): { width: number; height: number } {
  const buf = fs.readFileSync(filePath);
  const pngSig = '89504e470d0a1a0a';
  assert.equal(buf.subarray(0, 8).toString('hex'), pngSig, `Invalid PNG header in ${filePath}`);
  assert.equal(buf.subarray(12, 16).toString('ascii'), 'IHDR', `Missing IHDR chunk in ${filePath}`);
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
  };
}

function collectFilesRecursive(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectFilesRecursive(full, out);
    } else {
      out.push(full);
    }
  }
  return out;
}

test('Milestone 5G Assets: PNG sheets have valid dimensions and exact 16x16 grids', () => {
  const toolSheetPath = path.join(PUBLIC_DIR, 'assets/sprites/era/tool_skins_16.png');
  assert.ok(fs.existsSync(toolSheetPath), 'tool_skins_16.png must exist in public/assets/sprites/era/');
  const toolDims = readPngDimensions(toolSheetPath);
  assert.equal(toolDims.width, TOOL_SKINS_COLUMNS * TOOL_SKIN_CELL_PX);
  assert.equal(toolDims.height, TOOL_SKINS_ROWS * TOOL_SKIN_CELL_PX);
  assert.deepStrictEqual(toolDims, { width: 64, height: 48 });

  for (const role of BRONZE_VILLAGER_ROLES) {
    const villagerPath = path.join(PUBLIC_DIR, `assets/sprites/villagers/${role}.png`);
    assert.ok(fs.existsSync(villagerPath), `${role}.png must exist in public/assets/sprites/villagers/`);
    const dims = readPngDimensions(villagerPath);
    assert.deepStrictEqual(dims, { width: 64, height: 64 }, `${role}.png must be 64x64`);
    assert.equal(getBronzeVillagerSheetUrl(role), `/assets/sprites/villagers/${role}.png`);
  }
  assert.equal(getBronzeVillagerSheetUrl('unknown'), null);
});

test('Milestone 5G Assets: all 10 Bronze Age building matrices and 4-stage construction matrices pass validation', () => {
  const expectedSizes: Record<string, { w: number; h: number }> = {
    bronze_forge: { w: 48, h: 32 },
    bronze_market_stall: { w: 32, h: 32 },
    bronze_grain_silo: { w: 32, h: 48 },
    bronze_irrigated_field: { w: 48, h: 48 },
    bronze_apiary: { w: 32, h: 32 },
    bronze_scribe_hall: { w: 32, h: 48 },
    bronze_craft_workshop: { w: 48, h: 32 },
    bronze_watchtower: { w: 32, h: 48 },
    bronze_longhouse: { w: 64, h: 32 },
    bronze_town_hall: { w: 64, h: 48 },
  };

  assert.equal(BRONZE_AGE_BUILDING_IDS.length, 10);
  assert.equal(BRONZE_CONSTRUCTION_STAGE_COUNT, 4);

  for (const [id, dims] of Object.entries(expectedSizes)) {
    const sprite = BRONZE_AGE_SPRITE_DATA[id];
    assert.ok(sprite, `Missing Bronze building matrix ${id}`);
    assert.equal(sprite.width, dims.w, `${id} width`);
    assert.equal(sprite.height, dims.h, `${id} height`);
    assert.equal(sprite.width % 16, 0);
    assert.equal(sprite.height % 16, 0);

    const validation = validatePixelSpriteData(sprite);
    assert.equal(validation.valid, true, `${id} validation errors: ${validation.errors.join('; ')}`);
    assert.equal(getBronzeBuildingSprite(id), sprite);
    assert.equal(getBuildingSprite(id), null, `${id} must NOT leak into Stone Age getBuildingSprite`);

    const stages = BRONZE_CONSTRUCTION_SPRITE_STAGES[id];
    assert.ok(stages, `Missing construction stages for ${id}`);
    assert.equal(stages.length, 4, `${id} must have 4 construction stages`);
    stages.forEach((stageMatrix, stageIdx) => {
      assert.equal(stageMatrix.width, dims.w, `${id} stage ${stageIdx} width`);
      assert.equal(stageMatrix.height, dims.h, `${id} stage ${stageIdx} height`);
      const stageVal = validatePixelSpriteData(stageMatrix);
      assert.equal(
        stageVal.valid,
        true,
        `${id} stage ${stageIdx} validation errors: ${stageVal.errors.join('; ')}`
      );
      assert.equal(getBronzeConstructionSprite(id, stageIdx), stageMatrix);
    });
  }

  assert.equal(getBronzeBuildingSprite('unknown_bronze'), null);
  assert.equal(getBronzeConstructionSprite('unknown_bronze', 0), null);
});

test('Milestone 5G Tool Skins: getEraToolSkinSpec resolves exact rows/cols across all Eras and renders pixelated EraToolTileIcon', () => {
  assert.equal(getEraToolSkinRow('STONE_AGE'), 0);
  assert.equal(getEraToolSkinRow('BRONZE_AGE'), 1);
  for (const laterEra of ['IRON_AGE', 'MEDIEVAL', 'EARLY_MODERN', 'MODERN', 'FUTURISTIC', 'INTERPLANETARY'] as const) {
    assert.equal(getEraToolSkinRow(laterEra), 2, `Expected row 2 for ${laterEra}`);
  }
  assert.equal(getEraToolSkinRow(undefined), 0);

  const expectedCols: Record<ToolKind, 0 | 1 | 2 | 3> = {
    axe: 0,
    pickaxe: 1,
    sickle: 2,
    hammer: 3,
  };
  assert.deepStrictEqual(TOOL_SKIN_COLS, expectedCols);

  for (const [kind, col] of Object.entries(expectedCols) as Array<[ToolKind, 0 | 1 | 2 | 3]>) {
    const stone = getEraToolSkinSpec(kind, 'STONE_AGE');
    assert.equal(stone.row, 0);
    assert.equal(stone.col, col);
    assert.equal(stone.x, col * 16);
    assert.equal(stone.y, 0);
    assert.equal(stone.sheetPath, TOOL_SKINS_SHEET_PATH);

    const bronze = getEraToolSkinSpec(kind, 'BRONZE_AGE');
    assert.equal(bronze.row, 1);
    assert.equal(bronze.col, col);
    assert.equal(bronze.y, 16);

    const iron = getEraToolSkinSpec(kind, 'IRON_AGE');
    assert.equal(iron.row, 2);
    assert.equal(iron.col, col);
    assert.equal(iron.y, 32);
  }

  const html = renderToString(
    React.createElement(EraToolTileIcon, {
      toolKind: 'sickle',
      era: 'BRONZE_AGE',
      size: 32,
      testId: 'test-bronze-sickle',
    })
  );
  assert.ok(html.includes('data-testid="test-bronze-sickle"'));
  assert.ok(html.includes('data-tool-kind="sickle"'));
  assert.ok(html.includes('data-tool-era="BRONZE_AGE"'));
  assert.ok(html.includes('data-tool-skin-row="1"'));
  assert.ok(html.includes('data-tool-skin-col="2"'));
  assert.ok(html.includes('/assets/sprites/era/tool_skins_16.png'));
  assert.ok(html.includes('image-rendering:pixelated'));
});

test('Milestone 5G UI Integration: FocusSceneArea and Awards use Era tool skins cleanly across Stone/Bronze/Iron test props', () => {
  const baseCiv = createInitialCivilizationState();
  const workCiv = {
    ...baseCiv,
    era: 'STONE_AGE' as const,
    founderRole: 'crafter' as const,
    jobs: [
      {
        id: 'job_cave',
        kind: 'place' as const,
        status: 'ACTIVE' as const,
        definitionId: 'stone_age_study_cave',
        crewRequired: 1,
        paidCoins: 12,
        remainingSeconds: 1800,
        totalSeconds: 3600,
        createdAt: 100,
      },
    ],
  };

  const stoneWorkHtml = renderToString(
    React.createElement(
      I18nProvider,
      { locale: 'en' },
      React.createElement(FocusSceneArea, {
        era: 'STONE_AGE',
        sceneState: 'working',
        statusLabel: 'FOCUSING',
        chimeEnabled: true,
        onToggleChime: () => {},
        chimeAriaLabel: 'Mute',
        chimeTitle: 'Sound',
        civilizationState: workCiv,
      })
    )
  );
  assert.ok(stoneWorkHtml.includes('/assets/sprites/era/tool_skins_16.png'));
  assert.ok(stoneWorkHtml.includes('data-tool-kind="pickaxe"'));
  assert.ok(stoneWorkHtml.includes('data-tool-skin-row="0"'));
  assert.ok(stoneWorkHtml.includes('data-tool-skin-col="1"'));

  const bronzeWorkHtml = renderToString(
    React.createElement(
      I18nProvider,
      { locale: 'en' },
      React.createElement(FocusSceneArea, {
        era: 'BRONZE_AGE',
        sceneState: 'working',
        statusLabel: 'FOCUSING',
        chimeEnabled: true,
        onToggleChime: () => {},
        chimeAriaLabel: 'Mute',
        chimeTitle: 'Sound',
        civilizationState: { ...workCiv, era: 'BRONZE_AGE' },
      })
    )
  );
  assert.ok(bronzeWorkHtml.includes('data-tool-kind="pickaxe"'));
  assert.ok(bronzeWorkHtml.includes('data-tool-era="BRONZE_AGE"'));
  assert.ok(bronzeWorkHtml.includes('data-tool-skin-row="1"'));

  const ironCampHtml = renderToString(
    React.createElement(
      I18nProvider,
      { locale: 'en' },
      React.createElement(FocusSceneArea, {
        era: 'IRON_AGE',
        sceneState: 'working',
        statusLabel: 'FOCUSING',
        chimeEnabled: true,
        onToggleChime: () => {},
        chimeAriaLabel: 'Mute',
        chimeTitle: 'Sound',
        civilizationState: {
          ...baseCiv,
          era: 'IRON_AGE',
          founderRole: 'woodworker',
        },
      })
    )
  );
  assert.ok(ironCampHtml.includes('data-tool-kind="axe"'));
  assert.ok(ironCampHtml.includes('data-tool-era="IRON_AGE"'));
  assert.ok(ironCampHtml.includes('data-tool-skin-row="2"'));

  // Awards: builder (hammer), master_builder (pickaxe), land_clearer (axe) use EraToolTileIcon
  const nowMs = 1770000000000;
  const evalRes = evaluateAwards(createInitialAwardState(), {
    economy: { focusCoins: 100, totalXP: 200, level: 2 },
    dailyStats: {},
    quests: createInitialQuestState(nowMs),
    civilization: baseCiv,
    todayDateKey: '2026-02-02',
    nowMs,
  });

  const awardsHtml = renderToString(
    React.createElement(
      I18nProvider,
      { locale: 'en' },
      React.createElement(AwardsView, {
        initialData: {
          awardState: evalRes.nextState,
          awards: evalRes.viewModels,
          unseenCount: 0,
          era: 'STONE_AGE',
        },
      })
    )
  );
  assert.ok(awardsHtml.includes('/assets/sprites/era/tool_skins_16.png'));
  assert.ok(awardsHtml.includes('data-tool-kind="hammer"'));
  assert.ok(awardsHtml.includes('data-tool-kind="pickaxe"'));
  assert.ok(awardsHtml.includes('data-tool-kind="axe"'));
  assert.ok(awardsHtml.includes('data-tool-skin-row="0"'));

  const bronzeAwardIconHtml = renderToString(
    React.createElement(AwardIcon, {
      icon: { kind: 'tile', pack: 'tiny-dungeon', tileIndex: 117 },
      unlocked: true,
      level: 2,
      era: 'BRONZE_AGE',
    })
  );
  assert.ok(bronzeAwardIconHtml.includes('data-tool-kind="hammer"'));
  assert.ok(bronzeAwardIconHtml.includes('data-tool-skin-row="1"'));
  assert.ok(bronzeAwardIconHtml.includes('data-tool-skin-col="3"'));
});

test('Milestone 5G SpriteGallery: showcases tool skins 4x3, 10 Bronze buildings, 4-stage construction, and 3 Bronze villagers', () => {
  const galleryHtml = renderToString(
    React.createElement(
      I18nProvider,
      { locale: 'en' },
      React.createElement(SpriteGallery)
    )
  );

  assert.ok(galleryHtml.includes('data-testid="gallery-era-assets-5g"'));
  assert.ok(galleryHtml.includes('data-testid="gallery-tool-skins-section"'));
  assert.ok(galleryHtml.includes('data-testid="gallery-tool-skin-STONE_AGE-axe"'));
  assert.ok(galleryHtml.includes('data-testid="gallery-tool-skin-BRONZE_AGE-sickle"'));
  assert.ok(galleryHtml.includes('data-testid="gallery-tool-skin-IRON_AGE-hammer"'));

  assert.ok(galleryHtml.includes('data-testid="gallery-bronze-buildings-section"'));
  assert.ok(galleryHtml.includes('data-testid="gallery-bronze-construction-section"'));
  for (const id of BRONZE_AGE_BUILDING_IDS) {
    assert.ok(galleryHtml.includes(`data-testid="gallery-bronze-building-${id}"`));
    assert.ok(galleryHtml.includes(`data-testid="gallery-bronze-construction-${id}"`));
  }

  assert.ok(galleryHtml.includes('data-testid="gallery-bronze-villagers-section"'));
  for (const role of BRONZE_VILLAGER_ROLES) {
    assert.ok(galleryHtml.includes(`data-testid="gallery-bronze-villager-${role}"`));
    assert.ok(galleryHtml.includes(`/assets/sprites/villagers/${role}.png`));
  }
});

test('Milestone 5G Totem Rename & Zero Gameplay Leakage Guards', () => {
  // 1. Standing Stone rename (EN + VI) while keeping stone_age_totem ID, cost, unlocks, limit
  const totemDef = getBuildingDefinition('stone_age_totem');
  assert.ok(totemDef);
  assert.equal(totemDef.id, 'stone_age_totem');
  assert.equal(totemDef.name, 'Standing Stone');
  assert.equal(totemDef.description, 'A carved standing stone marking the settlement.');
  assert.equal(totemDef.baseCost, 8);
  assert.deepStrictEqual(totemDef.footprint, { width: 1, height: 1 });
  assert.equal(EN_MESSAGES['buildings.stone_age_totem.name'], 'Standing Stone');
  assert.equal(EN_MESSAGES['buildings.stone_age_totem.description'], 'A carved standing stone marking the settlement.');
  assert.equal(VI_MESSAGES['buildings.stone_age_totem.name'], 'Đá dựng');
  assert.equal(VI_MESSAGES['buildings.stone_age_totem.description'], 'Cột đá dựng khắc dấu, đánh dấu khu định cư.');

  // Ensure no leftover "Ancient Totem" or "Vật tổ" anywhere under src/
  const srcFiles = collectFilesRecursive(path.join(ROOT_DIR, 'src'));
  for (const file of srcFiles) {
    const content = fs.readFileSync(file, 'utf8');
    assert.equal(
      /Ancient Totem|Vật tổ/i.test(content),
      false,
      `Found stale Totem text in ${path.relative(ROOT_DIR, file)}`
    );
  }

  // 2. Gameplay invariance: Stone Age stays active with exact 6 buildings, 3 villager roles, 13 awards, unchanged Era rules
  assert.equal(STONE_AGE_BUILDING_DEFINITIONS.length, 6);
  assert.deepStrictEqual(
    STONE_AGE_BUILDING_DEFINITIONS.map((b) => b.id),
    [
      'stone_age_campfire',
      'stone_age_totem',
      'stone_age_study_cave',
      'stone_age_elder_hut',
      'stone_age_foraging_post',
      'stone_age_food_cache',
    ]
  );
  assert.deepStrictEqual([...VILLAGER_ROLES], ['elder', 'crafter', 'woodworker']);
  assert.equal(createInitialCivilizationState().era, 'STONE_AGE');
  assert.equal(STONE_TO_BRONZE_ADVANCE_REQUIREMENTS.minPlayerLevel, 9);
  assert.equal(STONE_TO_BRONZE_ADVANCE_REQUIREMENTS.feeCoins, 500);
  assert.equal(STONE_AGE_AWARDS_CATALOG.length, 13);

  const catalogHtml = renderToString(
    React.createElement(
      I18nProvider,
      { locale: 'en' },
      React.createElement(BuildingCatalogPanel, {
        isOpen: true,
        onClose: () => {},
        playerLevel: 10,
        playerCoins: 9999,
        lifetimeFocusMinutes: 9999,
        onSelectBuilding: () => {},
      })
    )
  );
  for (const bronzeId of BRONZE_AGE_BUILDING_IDS) {
    assert.equal(catalogHtml.includes(bronzeId), false, `${bronzeId} must not appear in BuildingCatalogPanel`);
  }
});

test('Milestone 5G Packaging Guard: public/ and dist/ contain runtime assets only with zero zip/py/ts/preview leftovers', () => {
  const publicFiles = collectFilesRecursive(PUBLIC_DIR);
  for (const filePath of publicFiles) {
    const rel = path.relative(PUBLIC_DIR, filePath).replace(/\\/g, '/');
    assert.equal(/\.zip$|\.py$|\.ts$|preview|bronze_assets/i.test(rel), false, `Forbidden artifact in public/: ${rel}`);
  }

  assert.ok(fs.existsSync(DIST_DIR), 'dist/ must exist (run npm run clean && npm run build before npm test)');
  const distFiles = collectFilesRecursive(DIST_DIR);
  const distRels = distFiles.map((f) => path.relative(DIST_DIR, f).replace(/\\/g, '/'));

  for (const rel of distRels) {
    assert.equal(/\.zip$|\.py$|preview|bronze_assets/i.test(rel), false, `Forbidden artifact in dist/: ${rel}`);
    assert.equal(/\.ts$/i.test(rel), false, `Forbidden .ts source file in dist/: ${rel}`);
  }

  assert.ok(distRels.includes('assets/sprites/era/tool_skins_16.png'), 'tool_skins_16.png must be copied into dist/');
  for (const role of BRONZE_VILLAGER_ROLES) {
    assert.ok(
      distRels.includes(`assets/sprites/villagers/${role}.png`),
      `${role}.png must be copied into dist/`
    );
  }
});
