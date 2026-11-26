import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToString } from 'react-dom/server';

import {
  BuildingInstance,
  GridMap,
  VILLAGE_CAVE_DEFINITION_ID,
  createInitialCivilizationState,
} from '../../src/core/civilization/index.ts';
import { MapGridView } from '../../src/ui/components/civilization/MapGridView.tsx';
import {
  MAX_CONCURRENT_VILLAGER_ENTRIES,
  VILLAGER_ENTRY_MAX_DURATION_MS,
  computeVillagerCaveEntryPlan,
  isCaveVisibleInViewport,
  sampleVillagerEntryFrame,
} from '../../src/ui/components/civilization/villagerEntryAnimation.ts';
import { getVillagerAnimationForDirection } from '../../src/ui/components/civilization/spriteRegistry.ts';
import { I18nProvider } from '../../src/i18n/I18nContext.tsx';

function makeBuilding(
  id: string,
  definitionId: string,
  x: number,
  y: number,
  width = 1,
  height = 1,
  map?: GridMap
): BuildingInstance {
  if (map) {
    const res = map.placeBuilding(id, { x, y }, { width, height });
    assert.equal(res.success, true, `Expected ${id} placement at (${x},${y}) to succeed`);
  }
  return {
    id,
    definitionId,
    position: { x, y },
    level: 1,
    placedAt: 1_700_000_000_000,
  };
}

function isInsideFootprint(
  coord: { x: number; y: number },
  origin: { x: number; y: number },
  width: number,
  height: number
): boolean {
  return (
    coord.x >= origin.x &&
    coord.x < origin.x + width &&
    coord.y >= origin.y &&
    coord.y < origin.y + height
  );
}

test('5E-3 Case 1 (walk-from-edge): starts at settlement/forest edge, uses walkable cells, enters (cave.x+1, cave.y+2) with idle on up-step <= 3000ms', () => {
  const map = new GridMap();
  const cave = makeBuilding('cave-1', VILLAGE_CAVE_DEFINITION_ID, 2, 2, 3, 3, map);
  const plan = computeVillagerCaveEntryPlan({
    cave,
    buildings: [cave],
    gridMap: map,
  });

  if (!plan) {
    assert.fail('Expected villager entry plan');
  }
  assert.equal(plan.mode, 'walk-from-edge');
  assert.deepStrictEqual(plan.doorwayCell, { x: 3, y: 4 });
  assert.deepStrictEqual(plan.entranceCell, { x: 3, y: 5 });
  assert.equal(
    isInsideFootprint(plan.startCell, cave.position, 3, 3),
    false,
    'Start cell must NOT be inside the Rock Shelter footprint'
  );
  assert.ok(plan.steps >= 1);
  assert.ok(plan.totalDurationMs <= VILLAGER_ENTRY_MAX_DURATION_MS);
  assert.deepStrictEqual(plan.path[plan.path.length - 1], { x: 3, y: 4 });
  assert.deepStrictEqual(plan.path[plan.path.length - 2], { x: 3, y: 5 });

  for (const cell of plan.path.slice(0, -1)) {
    assert.equal(map.isCellUnlocked(cell.x, cell.y), true);
    assert.equal(isInsideFootprint(cell, cave.position, 3, 3), false);
  }

  // Final walk step goes north from (3,5) into doorway (3,4) -> must use 'idle', never 'walk_down'
  assert.equal(getVillagerAnimationForDirection('up', true), 'idle');
  const finalStepMidMs =
    plan.fadeInMs + (plan.steps - 0.5) * plan.stepMs;
  const finalStepFrame = sampleVillagerEntryFrame(plan, finalStepMidMs);
  assert.equal(finalStepFrame.direction, 'up');
  assert.equal(finalStepFrame.animation, 'idle');
  assert.notEqual(finalStepFrame.animation, 'walk_down');

  const endFrame = sampleVillagerEntryFrame(plan, plan.totalDurationMs);
  assert.equal(endFrame.finished, true);
  assert.equal(endFrame.opacity, 0);
  assert.deepStrictEqual(endFrame.cell, { x: 3, y: 4 });
});

test('5E-3 Case 2 (fade-in-settlement): walled enclave fades in cleanly and walks to doorway', () => {
  const map = new GridMap();
  const cave = makeBuilding('cave-enclave', VILLAGE_CAVE_DEFINITION_ID, 2, 2, 3, 3, map);
  // Wall off an interior courtyard (2..4, 5) so no cell in courtyard borders the outer forest edge
  const walls: BuildingInstance[] = [
    cave,
    makeBuilding('w1', 'stone_age_campfire', 1, 4, 1, 1, map),
    makeBuilding('w2', 'stone_age_campfire', 5, 4, 1, 1, map),
    makeBuilding('w3', 'stone_age_campfire', 1, 5, 1, 1, map),
    makeBuilding('w4', 'stone_age_campfire', 5, 5, 1, 1, map),
    makeBuilding('w5', 'stone_age_campfire', 2, 6, 1, 1, map),
    makeBuilding('w6', 'stone_age_campfire', 3, 6, 1, 1, map),
    makeBuilding('w7', 'stone_age_campfire', 4, 6, 1, 1, map),
  ];

  const plan = computeVillagerCaveEntryPlan({
    cave,
    buildings: walls,
    gridMap: map,
  });

  if (!plan) {
    assert.fail('Expected villager entry plan');
  }
  assert.equal(plan.mode, 'fade-in-settlement');
  assert.equal(isInsideFootprint(plan.startCell, cave.position, 3, 3), false);
  assert.deepStrictEqual(plan.path[plan.path.length - 1], { x: 3, y: 4 });
  assert.ok(plan.totalDurationMs <= VILLAGER_ENTRY_MAX_DURATION_MS);

  const startFrame = sampleVillagerEntryFrame(plan, 0);
  assert.equal(startFrame.opacity, 0);
  const afterFadeIn = sampleVillagerEntryFrame(plan, plan.fadeInMs);
  assert.equal(afterFadeIn.opacity, 1);
});

test('5E-3 Case 3 (doorway-settle): completely boxed-in cave doorway settles briefly under 500ms', () => {
  const map = new GridMap();
  const cave = makeBuilding('cave-boxed', VILLAGE_CAVE_DEFINITION_ID, 2, 2, 3, 3, map);
  const blocker = makeBuilding('blocker', 'stone_age_campfire', 3, 5, 1, 1, map);

  const plan = computeVillagerCaveEntryPlan({
    cave,
    buildings: [cave, blocker],
    gridMap: map,
  });

  if (!plan) {
    assert.fail('Expected villager entry plan');
  }
  assert.equal(plan.mode, 'doorway-settle');
  assert.equal(plan.steps, 0);
  assert.deepStrictEqual(plan.path, [{ x: 3, y: 4 }]);
  assert.ok(plan.totalDurationMs < 500);

  const midFrame = sampleVillagerEntryFrame(plan, plan.fadeInMs + 20);
  assert.equal(midFrame.animation, 'idle');
  assert.equal(midFrame.opacity, 1);
  assert.deepStrictEqual(midFrame.cell, { x: 3, y: 4 });
});

test('5E-3 Case 4 (UI SSR & reduced-motion): renders arriving villager cleanly, suppresses duplicate wander, and skips on reduced motion', () => {
  const map = new GridMap();
  const cave = makeBuilding('cave-ui', VILLAGE_CAVE_DEFINITION_ID, 2, 2, 3, 3, map);
  const villager = { id: 'vil-new-1', role: 'crafter' as const, recruitedAt: 500 };

  const state = {
    ...createInitialCivilizationState(),
    grid: map.toSnapshot(),
    buildings: [cave],
    villagers: [villager],
  };

  const plan = computeVillagerCaveEntryPlan({
    cave,
    buildings: [cave],
    gridMap: map,
  });
  assert.ok(plan);
  if (!plan) return;

  const activeEntry = {
    villager,
    plan,
    startedAt: 1000,
    previewElapsedMs: plan.fadeInMs + 10,
  };

  const animatedHtml = renderToString(
    React.createElement(
      I18nProvider,
      { locale: 'en' },
      React.createElement(MapGridView, {
        civilizationState: state,
        placementDef: null,
        onPlaceBuilding: () => {},
        onInspectBuilding: () => {},
        activeVillagerEntries: [activeEntry],
      })
    )
  );

  assert.ok(animatedHtml.includes('data-testid="map-villagers-layer"'));
  assert.ok(animatedHtml.includes('data-testid="map-villager-entry-vil-new-1"'));
  assert.ok(animatedHtml.includes('data-entry-mode="walk-from-edge"'));
  assert.equal(
    animatedHtml.includes('data-testid="map-villager-vil-new-1"'),
    false,
    'Arriving villager must not duplicate as wandering sprite while entry animation runs'
  );

  // Reduced motion skips entry animation and renders static idle villager immediately
  const g = globalThis as unknown as { window?: unknown };
  const prevWindow = g.window;
  g.window = {
    matchMedia: (query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  };

  try {
    const reducedHtml = renderToString(
      React.createElement(
        I18nProvider,
        { locale: 'en' },
        React.createElement(MapGridView, {
          civilizationState: state,
          placementDef: null,
          onPlaceBuilding: () => {},
          onInspectBuilding: () => {},
          activeVillagerEntries: [activeEntry],
        })
      )
    );

    assert.equal(reducedHtml.includes('data-testid="map-villager-entry-vil-new-1"'), false);
    assert.ok(reducedHtml.includes('data-testid="map-villager-vil-new-1"'));
    assert.ok(reducedHtml.includes('data-animation="idle"'));
  } finally {
    if (prevWindow === undefined) {
      delete g.window;
    } else {
      g.window = prevWindow;
    }
  }
});

test('5E-3 Structural guards: RECRUIT_VILLAGER-only trigger, max 3 concurrent, CSS reduced-motion, zero storage writes', () => {
  assert.equal(MAX_CONCURRENT_VILLAGER_ENTRIES, 3);

  const entryModuleSource = fs.readFileSync(
    path.resolve(process.cwd(), 'src/ui/components/civilization/villagerEntryAnimation.ts'),
    'utf8'
  );
  assert.equal(entryModuleSource.includes('chrome.storage'), false);
  assert.equal(entryModuleSource.includes('StorageManager'), false);

  const civScreenSource = fs.readFileSync(
    path.resolve(process.cwd(), 'src/ui/components/civilization/CivilizationScreen.tsx'),
    'utf8'
  );
  const enqueueOccurrences = civScreenSource.match(/enqueueVillagerCaveEntry\(/g) ?? [];
  assert.equal(
    enqueueOccurrences.length,
    1,
    'enqueueVillagerCaveEntry must be called ONLY inside handleRecruitVillager (never SELECT_FOUNDER)'
  );
  assert.ok(civScreenSource.includes('MAX_CONCURRENT_VILLAGER_ENTRIES'));
  assert.equal(civScreenSource.includes('chrome.storage'), false);

  const cssSource = fs.readFileSync(path.resolve(process.cwd(), 'src/index.css'), 'utf8');
  assert.ok(cssSource.includes('.fq-villager-entry-sprite'));
  const reducedMotionSection = cssSource.slice(cssSource.indexOf('prefers-reduced-motion: reduce'));
  assert.ok(reducedMotionSection.includes('.fq-villager-entry-sprite'));
  assert.ok(civScreenSource.includes('isCaveVisibleInViewport'));
});

test('5E-3 Case 5 (viewport visibility guard): skips entry animation when Rock Shelter is panned offscreen or out of zoomed view', () => {
  const cave = makeBuilding('cave-vis', VILLAGE_CAVE_DEFINITION_ID, 2, 2, 3, 3);
  const renderBox = { minX: -8, minY: -8, width: 24, height: 24 };
  const viewport = { width: 400, height: 420 };
  const cellSize = 32;

  // Default centered camera sees Rock Shelter cleanly
  assert.equal(
    isCaveVisibleInViewport({
      cave,
      pan: { x: 0, y: 0 },
      zoom: 1,
      viewport,
      renderBox,
      cellSize,
    }),
    true
  );

  // Panned far left -> Rock Shelter is outside viewport -> skip entry animation
  assert.equal(
    isCaveVisibleInViewport({
      cave,
      pan: { x: -1200, y: 0 },
      zoom: 1,
      viewport,
      renderBox,
      cellSize,
    }),
    false
  );

  // Zoomed in 2.0x and panned to distant corner -> Rock Shelter is outside zoomed view -> skip
  assert.equal(
    isCaveVisibleInViewport({
      cave,
      pan: { x: 900, y: 900 },
      zoom: 2,
      viewport,
      renderBox,
      cellSize,
    }),
    false
  );

  // Unmeasured SSR viewport falls back safely to true
  assert.equal(
    isCaveVisibleInViewport({
      cave,
      pan: { x: 0, y: 0 },
      zoom: 1,
      viewport: { width: 0, height: 0 },
      renderBox,
      cellSize,
    }),
    true
  );
});
