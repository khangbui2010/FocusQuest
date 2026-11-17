import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToString } from 'react-dom/server';

import { GridMap } from '../../src/core/civilization/gridMap.ts';
import { createInitialCivilizationState } from '../../src/core/civilization/civilizationState.ts';
import {
  ActiveExpansionReveal,
  EXPANSION_ANIMATION_DURATION_MS,
  EXPANSION_AXE_TILE_INDEX,
  EXPANSION_IMPACT_MS,
  EXPANSION_SHAKE_DURATION_MS,
  buildExpansionAnimationPlan,
  detectNewlyAddedChunks,
  doesFootprintOverlapChunkOrigin,
  isCellInChunk,
  isExpansionChunkRevealed,
  prefersReducedMotion,
} from '../../src/ui/components/civilization/expansionReveal.ts';
import { ExpansionRevealOverlay } from '../../src/ui/components/civilization/ExpansionRevealOverlay.tsx';
import { MapGridView } from '../../src/ui/components/civilization/MapGridView.tsx';
import { translate } from '../../src/i18n/translator.ts';

test('Expansion Reveal (Stage C): constants, plan math, and negative-origin support', () => {
  assert.equal(EXPANSION_AXE_TILE_INDEX, 127);
  assert.equal(EXPANSION_IMPACT_MS, 680);
  assert.ok(EXPANSION_ANIMATION_DURATION_MS > EXPANSION_IMPACT_MS);
  assert.equal(EXPANSION_SHAKE_DURATION_MS, 340);

  const planNeg = buildExpansionAnimationPlan({ x: -4, y: 0 }, 32);
  assert.deepStrictEqual(planNeg.origin, { x: -4, y: 0 });
  assert.equal(planNeg.axeTileIndex, 127);
  assert.equal(planNeg.impactDelayMs, 680);
  assert.equal(planNeg.chunkWidthPx, 128);
  assert.equal(planNeg.chunkHeightPx, 128);
  assert.equal(planNeg.centerPxX, 64);
  assert.equal(planNeg.centerPxY, 64);
  assert.ok(planNeg.axeStartYOffsetPx < 0);
  assert.equal(planNeg.particles.length, 6);

  const planNegBoth = buildExpansionAnimationPlan({ x: -8, y: -4 }, 32);
  assert.deepStrictEqual(planNegBoth, buildExpansionAnimationPlan({ x: -8, y: -4 }, 32));
});

test('Expansion Reveal (Stage C): detectNewlyAddedChunks, reveal timing gate, and footprint overlap guard', () => {
  const initialOrigins = [
    { x: 0, y: 0 },
    { x: 4, y: 0 },
    { x: 0, y: 4 },
    { x: 4, y: 4 },
  ];
  assert.deepStrictEqual(
    detectNewlyAddedChunks(initialOrigins, initialOrigins.map((o) => ({ origin: o }))),
    []
  );
  assert.deepStrictEqual(
    detectNewlyAddedChunks(initialOrigins, [
      ...initialOrigins.map((o) => ({ origin: o })),
      { origin: { x: -4, y: 0 } },
    ]),
    [{ x: -4, y: 0 }]
  );

  const reveal: ActiveExpansionReveal = {
    id: 1,
    origin: { x: 8, y: 0 },
    startedAt: 1000,
    reducedMotion: false,
  };
  assert.equal(isExpansionChunkRevealed(reveal, 0), false);
  assert.equal(isExpansionChunkRevealed(reveal, EXPANSION_IMPACT_MS - 1), false);
  assert.equal(isExpansionChunkRevealed(reveal, EXPANSION_IMPACT_MS), true);
  assert.equal(isExpansionChunkRevealed(reveal, EXPANSION_ANIMATION_DURATION_MS), true);
  assert.equal(
    isExpansionChunkRevealed({ ...reveal, reducedMotion: true }, 0),
    true
  );
  assert.equal(isExpansionChunkRevealed(null, 0), true);

  assert.equal(isCellInChunk({ x: 8, y: 0 }, { x: 8, y: 0 }), true);
  assert.equal(isCellInChunk({ x: 11, y: 3 }, { x: 8, y: 0 }), true);
  assert.equal(isCellInChunk({ x: 12, y: 0 }, { x: 8, y: 0 }), false);
  assert.equal(isCellInChunk({ x: -1, y: 3 }, { x: -4, y: 0 }), true);

  // Building footprint overlap checks (especially boundary placements into unrevealed chunk)
  assert.equal(
    doesFootprintOverlapChunkOrigin({ x: 8, y: 0 }, { width: 1, height: 1 }, { x: 8, y: 0 }),
    true
  );
  assert.equal(
    doesFootprintOverlapChunkOrigin({ x: 7, y: 0 }, { width: 2, height: 2 }, { x: 8, y: 0 }),
    true
  );
  assert.equal(
    doesFootprintOverlapChunkOrigin({ x: 6, y: 0 }, { width: 2, height: 2 }, { x: 8, y: 0 }),
    false
  );
  assert.equal(
    doesFootprintOverlapChunkOrigin({ x: -1, y: 0 }, { width: 2, height: 1 }, { x: -4, y: 0 }),
    true
  );
});

test('Expansion Reveal (Stage C): prefersReducedMotion is SSR-safe and respects window.matchMedia', () => {
  const g = globalThis as unknown as {
    window?: { matchMedia?: (q: string) => { matches: boolean } };
  };
  const prevWindow = g.window;

  try {
    Reflect.deleteProperty(g, 'window');
    assert.equal(prefersReducedMotion(), false);

    g.window = {
      matchMedia: () => ({ matches: true }),
    };
    assert.equal(prefersReducedMotion(), true);

    g.window = {
      matchMedia: () => ({ matches: false }),
    };
    assert.equal(prefersReducedMotion(), false);
  } finally {
    if (prevWindow === undefined) {
      Reflect.deleteProperty(g, 'window');
    } else {
      g.window = prevWindow;
    }
  }
});

test('Expansion Reveal (Stage C): CSS keyframes and reduced-motion rules exist in src/index.css', () => {
  const cssPath = path.resolve(process.cwd(), 'src/index.css');
  const css = fs.readFileSync(cssPath, 'utf8');
  assert.ok(css.includes('@keyframes fq-axe-chop'));
  assert.ok(css.includes('@keyframes fq-expansion-flash'));
  assert.ok(css.includes('@keyframes fq-expansion-particle'));
  assert.ok(css.includes('@keyframes fq-map-shake'));
  assert.ok(css.includes('--fq-impact-delay'));
  assert.ok(css.includes('prefers-reduced-motion: reduce'));
});

test('Expansion Reveal (Stage C): SSR overlay and MapGridView hold dark forest until impact and keep zoom at 100%', () => {
  const idleOverlay = renderToString(
    React.createElement(ExpansionRevealOverlay, {
      reveal: null,
      renderMinX: -8,
      renderMinY: -8,
      cellSize: 32,
    })
  );
  assert.equal(idleOverlay, '');

  const reducedOverlay = renderToString(
    React.createElement(ExpansionRevealOverlay, {
      reveal: {
        id: 2,
        origin: { x: 8, y: 0 },
        startedAt: 100,
        reducedMotion: true,
      },
      renderMinX: -8,
      renderMinY: -8,
      cellSize: 32,
    })
  );
  assert.equal(reducedOverlay, '');

  // Commit chunk (8,0) into state, then render MapGridView before 680ms impact
  const baseState = createInitialCivilizationState();
  const map = GridMap.fromSnapshot(baseState.grid);
  const res = map.expandChunk({ x: 8, y: 0 });
  assert.equal(res.success, true);

  const committedState = {
    ...baseState,
    grid: map.toSnapshot(),
  };

  const preImpactHtml = renderToString(
    React.createElement(MapGridView, {
      civilizationState: committedState,
      placementDef: null,
      onPlaceBuilding: () => {},
      onInspectBuilding: () => {},
      activeExpansionReveal: {
        id: 1,
        origin: { x: 8, y: 0 },
        startedAt: 1000,
        reducedMotion: false,
      },
      unrevealedChunkOrigin: { x: 8, y: 0 },
    })
  );

  assert.ok(preImpactHtml.includes('data-testid="expansion-reveal-overlay"'));
  assert.ok(preImpactHtml.includes('data-reveal-origin="8,0"'));
  assert.ok(preImpactHtml.includes('data-axe-tile-index="127"'));
  assert.ok(preImpactHtml.includes('fq-map-shake-active'));
  assert.ok(preImpactHtml.includes('>100%<'), 'Animation must keep map zoom at 100%');
  // Cell (8,0) stays visually darkened/locked before 680ms impact
  assert.ok(
    preImpactHtml.includes('data-cell-coord="8,0" data-unlocked="false"'),
    'Newly committed chunk cell (8,0) must remain visually locked before impact'
  );

  // Post-impact (unrevealedChunkOrigin = null) unlocks cells visually
  const postImpactHtml = renderToString(
    React.createElement(MapGridView, {
      civilizationState: committedState,
      placementDef: null,
      onPlaceBuilding: () => {},
      onInspectBuilding: () => {},
      activeExpansionReveal: null,
      unrevealedChunkOrigin: null,
    })
  );
  assert.ok(!postImpactHtml.includes('data-testid="expansion-reveal-overlay"'));
  assert.ok(!postImpactHtml.includes('fq-map-shake-active'));
  assert.ok(
    postImpactHtml.includes('data-cell-coord="8,0" data-unlocked="true"'),
    'Chunk cell (8,0) must reveal as unlocked grass/landscape once impact settles'
  );

  // EN/VI aria-live announcement keys exist cleanly
  assert.equal(translate('en', 'civ.expand.ariaAnnouncement', { x: 8, y: 0 }), 'Expanded territory chunk at (8, 0).');
  assert.equal(translate('vi', 'civ.expand.ariaAnnouncement', { x: 8, y: 0 }), 'Đã mở rộng vùng đất mới tại (8, 0).');
});
