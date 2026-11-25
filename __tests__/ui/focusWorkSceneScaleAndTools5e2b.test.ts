import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { I18nProvider } from '../../src/i18n/I18nContext.tsx';
import { createInitialCivilizationState } from '../../src/core/civilization/civilizationState.ts';
import { ConstructionJob } from '../../src/core/civilization/jobs.ts';
import { FocusSceneArea } from '../../src/ui/components/FocusSceneArea.tsx';
import {
  CELL_SIZE as MAP_GRID_CELL_SIZE,
} from '../../src/ui/components/civilization/MapGridView.tsx';
import {
  MAP_CELL_PX,
  MAP_RENDER_MULTIPLIER,
  NATIVE_TILE_PX,
  computeWorkSubSceneLayout,
  getWorkSubjectFootprint,
} from '../../src/ui/components/civilization/civilizationScale.ts';
import {
  ClockTileIcon,
  TileImage,
  getTileSourceCoords,
} from '../../src/ui/components/civilization/TileImage.tsx';

function renderEn(element: React.ReactElement): string {
  return renderToString(React.createElement(I18nProvider, { locale: 'en' }, element));
}

function makeVillagers(count: number) {
  const roles = ['crafter', 'elder', 'woodworker'] as const;
  return Array.from({ length: count }, (_, idx) => ({
    id: `v${idx + 1}`,
    role: roles[idx % roles.length],
    recruitedAt: (idx + 1) * 100,
  }));
}

test('5E-2b TileImage NaN CSS left guard: non-finite tileIndex or size always resolves to finite pixel values', () => {
  const coordsNaN = getTileSourceCoords(Number.NaN);
  assert.strictEqual(Number.isFinite(coordsNaN.col), true);
  assert.strictEqual(Number.isFinite(coordsNaN.row), true);
  assert.strictEqual(coordsNaN.col, 0);

  const tileHtml = renderToString(
    React.createElement(TileImage, {
      pack: 'tiny-town',
      tileIndex: Number.NaN,
      size: Number.NaN,
    })
  );
  assert.ok(!tileHtml.includes('NaN'), `TileImage must never emit NaN in style/attributes: ${tileHtml}`);
  assert.ok(tileHtml.includes('left:0px') || tileHtml.includes('left:0'));

  const clockHtml = renderToString(
    React.createElement(ClockTileIcon, {
      tileIndex: undefined as unknown as 0,
      size: Number.NaN,
    })
  );
  assert.ok(!clockHtml.includes('NaN'), `ClockTileIcon must never emit NaN in style: ${clockHtml}`);
});

test('5E-2b Part A Scale Parity: MapGridView and FocusSceneArea share civilizationScale constants and keep exact 1:footprint ratio', () => {
  assert.strictEqual(MAP_GRID_CELL_SIZE, MAP_CELL_PX);
  assert.strictEqual(MAP_CELL_PX, NATIVE_TILE_PX * MAP_RENDER_MULTIPLIER);

  // Verify layout ratios across every Stone Age footprint (1x1, 2x2, 2x3, 3x3) and job counts 1..4
  const cases: Array<{
    kind: ConstructionJob['kind'];
    defId?: string;
    expectedW: number;
    expectedH: number;
  }> = [
    { kind: 'expand', expectedW: 1, expectedH: 1 },
    { kind: 'place', defId: 'stone_age_campfire', expectedW: 1, expectedH: 1 },
    { kind: 'place', defId: 'stone_age_foraging_post', expectedW: 2, expectedH: 2 },
    { kind: 'place', defId: 'stone_age_food_cache', expectedW: 2, expectedH: 3 },
    { kind: 'place', defId: 'stone_age_study_cave', expectedW: 3, expectedH: 3 },
  ];

  for (const jobCount of [1, 2, 3, 4]) {
    for (const c of cases) {
      const footprint = getWorkSubjectFootprint(c.kind, c.defId);
      assert.strictEqual(footprint.width, c.expectedW);
      assert.strictEqual(footprint.height, c.expectedH);

      const layout = computeWorkSubSceneLayout({ jobCount, subjectFootprint: footprint });
      // Exact Map proportion: buildingWidth / villagerHeight === footprint.width / 1
      assert.strictEqual(layout.subjectWidthPx / layout.villagerSizePx, footprint.width);
      assert.strictEqual(layout.subjectHeightPx / layout.villagerSizePx, footprint.height);
      assert.strictEqual(Number.isInteger(layout.villagerSizePx), true);
      assert.strictEqual(Number.isInteger(layout.subjectWidthPx), true);
      assert.strictEqual(Number.isInteger(layout.subjectHeightPx), true);
    }
  }

  // Verify FocusSceneArea renders exact ratio attributes for Rock Shelter 3x3 (1x3 -> Cave is 3x taller/wider than villager)
  const baseCiv = createInitialCivilizationState();
  const caveJob: ConstructionJob = {
    id: 'job_cave_scale',
    kind: 'place',
    status: 'ACTIVE',
    definitionId: 'stone_age_study_cave',
    buildingId: 'b_cave',
    crewRequired: 1,
    totalSeconds: 3600,
    remainingSeconds: 1800,
    paidCoins: 12,
    createdAt: 10,
  };

  const caveHtml = renderEn(
    React.createElement(FocusSceneArea, {
      era: 'STONE_AGE',
      sceneState: 'working',
      statusLabel: 'FOCUSING',
      chimeEnabled: true,
      onToggleChime: () => {},
      chimeAriaLabel: 'Mute',
      chimeTitle: 'Sound',
      civilizationState: {
        ...baseCiv,
        founderRole: 'crafter',
        villagers: makeVillagers(2),
        jobs: [caveJob],
      },
    })
  );

  assert.ok(caveHtml.includes('data-villager-px="24"'));
  assert.ok(caveHtml.includes('data-subject-width-px="72"'));
  assert.ok(caveHtml.includes('data-subject-height-px="72"'));
});

test('5E-2b Part A Hand-Held Tools: tool renders inside villager element on hand side, flips inward for 2-crew, and stays held when resting/paused', () => {
  const baseCiv = createInitialCivilizationState();
  const twoCrewExpandJob: ConstructionJob = {
    id: 'job_expand_2crew',
    kind: 'expand',
    status: 'ACTIVE',
    origin: { x: 8, y: 0 },
    purchaseIndex: 1,
    crewRequired: 2,
    totalSeconds: 3600,
    remainingSeconds: 1500,
    paidCoins: 30,
    createdAt: 20,
  };

  const workingHtml = renderEn(
    React.createElement(FocusSceneArea, {
      era: 'STONE_AGE',
      sceneState: 'working',
      statusLabel: 'FOCUSING',
      chimeEnabled: true,
      onToggleChime: () => {},
      chimeAriaLabel: 'Mute',
      chimeTitle: 'Sound',
      civilizationState: {
        ...baseCiv,
        founderRole: 'woodworker',
        villagers: makeVillagers(2),
        jobs: [twoCrewExpandJob],
      },
    })
  );

  // Subject for expand is 1x1 tree (single tile, matching 1:1 villager scale)
  const subjectMatch = workingHtml.match(
    /<div data-testid="focus-work-subject-job_expand_2crew"[\s\S]*?<\/div>/
  );
  assert.ok(subjectMatch, 'Subject div must render');
  assert.strictEqual(
    subjectMatch[0].includes('data-work-tool-job'),
    false,
    'Tool MUST NOT be inside or hovering over the subject div'
  );
  const treeTileMatches = subjectMatch[0].match(/data-tile-pack="tiny-town"/g);
  assert.strictEqual(treeTileMatches?.length, 1, 'Expand subject must render a single 1x1 tree tile');

  // Verify BOTH villagers exist and EACH owns a hand-held tool inside its own villager container
  const leftVillagerSection = workingHtml.slice(
    workingHtml.indexOf('data-testid="focus-work-villager-job_expand_2crew-founder_villager"'),
    workingHtml.indexOf('data-testid="focus-work-subject-job_expand_2crew"')
  );
  assert.ok(
    leftVillagerSection.includes('data-testid="focus-work-tool-job_expand_2crew"'),
    'Left villager must hold its tool inside its own DOM subtree'
  );
  assert.ok(leftVillagerSection.includes('data-tool-hand-side="left"'));
  assert.ok(leftVillagerSection.includes('fq-work-hand-tool-strike-right'));

  const rightVillagerIdx = workingHtml.indexOf('data-testid="focus-work-villager-job_expand_2crew-v1"');
  const countdownIdx = workingHtml.indexOf('data-testid="focus-work-countdown-job_expand_2crew"');
  const rightVillagerSection = workingHtml.slice(rightVillagerIdx, countdownIdx);
  assert.ok(
    rightVillagerSection.includes('data-testid="focus-work-tool-job_expand_2crew-v1"'),
    'Second villager in 2-crew must also hold its own tool inside its DOM subtree'
  );
  assert.ok(rightVillagerSection.includes('data-tool-hand-side="right"'));
  assert.ok(rightVillagerSection.includes('fq-work-hand-tool-strike-left'));
  assert.ok(rightVillagerSection.includes('scaleX(-1)'));

  // Paused / Resting / Reduced Motion -> tools remain in hand with rest class and no strike animation
  for (const [sceneState, reducedMotion] of [
    ['paused', false],
    ['resting', false],
    ['working', true],
  ] as const) {
    const restHtml = renderEn(
      React.createElement(FocusSceneArea, {
        era: 'STONE_AGE',
        sceneState,
        statusLabel: sceneState === 'paused' ? 'PAUSED' : 'REST',
        chimeEnabled: true,
        onToggleChime: () => {},
        chimeAriaLabel: 'Mute',
        chimeTitle: 'Sound',
        reducedMotion,
        civilizationState: {
          ...baseCiv,
          founderRole: 'woodworker',
          villagers: makeVillagers(2),
          jobs: [twoCrewExpandJob],
        },
      })
    );
    assert.ok(restHtml.includes('data-testid="focus-work-tool-job_expand_2crew"'), 'Tool stays visible in hand');
    assert.ok(restHtml.includes('fq-work-hand-tool-rest-right'));
    assert.ok(restHtml.includes('fq-work-hand-tool-rest-left'));
    assert.strictEqual(restHtml.includes('fq-work-hand-tool-strike-right'), false);
    assert.strictEqual(restHtml.includes('fq-work-hand-tool-strike-left'), false);
    assert.strictEqual(restHtml.includes('data-tool-animated="true"'), false);
  }

  // Verify FocusSceneArea imports shared scale helper and remains deterministic
  const sceneSrc = fs.readFileSync(
    path.resolve(import.meta.dirname, '../../src/ui/components/FocusSceneArea.tsx'),
    'utf8'
  );
  assert.ok(sceneSrc.includes("from './civilization/civilizationScale.ts'"));
  assert.strictEqual(sceneSrc.includes('Math.random'), false);
  assert.strictEqual(sceneSrc.includes('Date.now'), false);
});
