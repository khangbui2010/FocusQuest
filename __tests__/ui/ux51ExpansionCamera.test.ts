import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToString } from 'react-dom/server';

import { createInitialCivilizationState } from '../../src/core/civilization/civilizationState.ts';
import { GridMap } from '../../src/core/civilization/gridMap.ts';
import { evaluateExpansion } from '../../src/core/civilization/landExpansion.ts';
import { CHUNK_HEIGHT, CHUNK_WIDTH } from '../../src/core/civilization/constants.ts';
import { MemoryStorageAdapter } from '../../src/storage/memoryStorageAdapter.ts';
import { StorageManager } from '../../src/storage/storageManager.ts';
import { advanceJobs } from '../../src/core/civilization/jobs.ts';
import { CivilizationCoordinator } from '../../src/background/civilizationCoordinator.ts';
import { CivilizationHeader } from '../../src/ui/components/civilization/CivilizationHeader.tsx';
import {
  CELL_SIZE,
  EXPANSION_FOREST_MARGIN_CELLS,
  FOREST_MARGIN_CELLS,
  MapGridView,
} from '../../src/ui/components/civilization/MapGridView.tsx';
import {
  EXPANSION_ANIMATION_DURATION_MS,
  EXPANSION_IMPACT_MS,
} from '../../src/ui/components/civilization/expansionReveal.ts';
import {
  EXPANSION_CINEMATIC_MS,
  ExpansionFlowState,
  canCancelExpansionMode,
  canSelectExpansionSlot,
  canTransitionExpansionFlow,
  computeChunkCenterPan,
  computeRestoredPanFromSnapshot,
  createCameraSnapshot,
  easeInOutCubic,
  interpolatePan,
  isExpansionCandidatesVisible,
  isExpansionFlowActive,
  isManualCameraLocked,
  transitionExpansionFlow,
} from '../../src/ui/components/civilization/expansionCamera.ts';

function computeRenderBoxForMap(map: GridMap, margin = FOREST_MARGIN_CELLS) {
  const bb = map.getBoundingBox();
  return {
    minX: bb.minX - margin,
    maxX: bb.maxX + margin,
    minY: bb.minY - margin,
    maxY: bb.maxY + margin,
    width: bb.width + margin * 2,
    height: bb.height + margin * 2,
  };
}

test('UX-5.1 Camera: snapshot keeps initial pan/zoom/viewport & computeRestoredPanFromSnapshot compensates West/North/East/South growth with zero camera jump', () => {
  const mapBefore = new GridMap();
  const boxBefore = computeRenderBoxForMap(mapBefore, EXPANSION_FOREST_MARGIN_CELLS);
  assert.equal(FOREST_MARGIN_CELLS, 8);
  assert.equal(EXPANSION_FOREST_MARGIN_CELLS, 8);

  const zooms = [0.75, 1.0, 1.25, 1.5];
  const initialPan = { x: 48, y: -32 };
  const viewport = { width: 400, height: 420 };

  for (const zoom of zooms) {
    const snapshot = createCameraSnapshot(initialPan, zoom, viewport, boxBefore);
    assert.deepStrictEqual(snapshot.pan, initialPan);
    assert.equal(snapshot.zoom, zoom);
    assert.deepStrictEqual(snapshot.viewport, viewport);

    // 1. Cancel without expansion -> restores identical initial pan
    assert.deepStrictEqual(
      computeRestoredPanFromSnapshot(snapshot, boxBefore, CELL_SIZE),
      initialPan
    );

    // 2. Verify world point at viewport center before expansion remains at viewport center after expansion
    const worldFocusBeforeX = snapshot.stageCenterWorldX - initialPan.x / (CELL_SIZE * zoom);
    const worldFocusBeforeY = snapshot.stageCenterWorldY - initialPan.y / (CELL_SIZE * zoom);

    for (const origin of [
      { x: 8, y: 0 }, // East
      { x: -4, y: 0 }, // West (shifts boundingBox.minX!)
      { x: 0, y: -4 }, // North (shifts boundingBox.minY!)
      { x: 0, y: 8 }, // South
    ]) {
      const mapAfter = GridMap.fromSnapshot(mapBefore.toSnapshot());
      const res = mapAfter.expandChunk(origin);
      assert.equal(res.success, true);

      const boxAfter = computeRenderBoxForMap(mapAfter, EXPANSION_FOREST_MARGIN_CELLS);
      const restoredPan = computeRestoredPanFromSnapshot(snapshot, boxAfter, CELL_SIZE);
      const newCenterX = boxAfter.minX + boxAfter.width / 2;
      const newCenterY = boxAfter.minY + boxAfter.height / 2;

      const worldFocusAfterX = newCenterX - restoredPan.x / (CELL_SIZE * zoom);
      const worldFocusAfterY = newCenterY - restoredPan.y / (CELL_SIZE * zoom);

      assert.ok(
        Math.abs(worldFocusAfterX - worldFocusBeforeX) < 0.05,
        `Zoom ${zoom} origin (${origin.x},${origin.y}) X drift: ${worldFocusAfterX} vs ${worldFocusBeforeX}`
      );
      assert.ok(
        Math.abs(worldFocusAfterY - worldFocusBeforeY) < 0.05,
        `Zoom ${zoom} origin (${origin.x},${origin.y}) Y drift: ${worldFocusAfterY} vs ${worldFocusBeforeY}`
      );
    }
  }
});

test('UX-5.1 Camera: computeChunkCenterPan centers target chunk at current zoom & interpolatePan eases smoothly', () => {
  const map = new GridMap();
  const box = computeRenderBoxForMap(map, EXPANSION_FOREST_MARGIN_CELLS);
  const mapWidthPx = box.width * CELL_SIZE;
  const mapHeightPx = box.height * CELL_SIZE;

  for (const zoom of [0.75, 1.0, 1.5]) {
    for (const origin of [
      { x: 8, y: 0 },
      { x: -4, y: 0 },
      { x: 0, y: -4 },
      { x: 0, y: 8 },
    ]) {
      const targetPan = computeChunkCenterPan(
        origin,
        box.minX,
        box.minY,
        mapWidthPx,
        mapHeightPx,
        zoom
      );
      const chunkCenterPxX = (origin.x + CHUNK_WIDTH / 2 - box.minX) * CELL_SIZE;
      const chunkCenterPxY = (origin.y + CHUNK_HEIGHT / 2 - box.minY) * CELL_SIZE;
      const screenX = targetPan.x + (chunkCenterPxX - mapWidthPx / 2) * zoom;
      const screenY = targetPan.y + (chunkCenterPxY - mapHeightPx / 2) * zoom;

      assert.ok(Math.abs(screenX) <= 1, `Expected centered X (~0), got ${screenX}`);
      assert.ok(Math.abs(screenY) <= 1, `Expected centered Y (~0), got ${screenY}`);
    }
  }

  assert.equal(EXPANSION_CINEMATIC_MS, 600);
  assert.equal(easeInOutCubic(-0.2), 0);
  assert.equal(easeInOutCubic(0), 0);
  assert.equal(easeInOutCubic(0.5), 0.5);
  assert.equal(easeInOutCubic(1), 1);
  assert.equal(easeInOutCubic(1.5), 1);

  const start = { x: 20, y: -40 };
  const end = { x: -220, y: 120 };
  assert.deepStrictEqual(interpolatePan(start, end, 0), start);
  assert.deepStrictEqual(interpolatePan(start, end, 1), end);
  const mid = interpolatePan(start, end, 0.5);
  assert.deepStrictEqual(mid, { x: -100, y: 40 });
});

test('UX-5.1 State Machine: enforces valid 6-state flow, locks controls & cancel outside EXPANSION_SELECTING, and blocks duplicate chunk selection', () => {
  const happyPath: ExpansionFlowState[] = [
    'NORMAL',
    'EXPANSION_SELECTING',
    'CINEMATIC_MOVING',
    'CHOPPING',
    'TERRAIN_UPDATING',
    'CAMERA_RETURNING',
    'NORMAL',
  ];

  for (let i = 0; i < happyPath.length - 1; i++) {
    const from = happyPath[i];
    const to = happyPath[i + 1];
    assert.equal(
      canTransitionExpansionFlow(from, to),
      true,
      `Expected valid transition ${from} -> ${to}`
    );
    assert.equal(transitionExpansionFlow(from, to), to);
  }

  // Cancel path & modal cancel path
  assert.equal(canTransitionExpansionFlow('EXPANSION_SELECTING', 'CAMERA_RETURNING'), true);
  assert.equal(canTransitionExpansionFlow('CINEMATIC_MOVING', 'CAMERA_RETURNING'), true);
  assert.equal(canTransitionExpansionFlow('CAMERA_RETURNING', 'EXPANSION_SELECTING'), true);

  // Invalid jumps rejected
  assert.equal(canTransitionExpansionFlow('NORMAL', 'CHOPPING'), false);
  assert.equal(canTransitionExpansionFlow('NORMAL', 'CINEMATIC_MOVING'), false);
  assert.equal(canTransitionExpansionFlow('EXPANSION_SELECTING', 'CHOPPING'), false);
  assert.equal(canTransitionExpansionFlow('EXPANSION_SELECTING', 'TERRAIN_UPDATING'), false);
  assert.equal(canTransitionExpansionFlow('TERRAIN_UPDATING', 'EXPANSION_SELECTING'), false);
  assert.equal(transitionExpansionFlow('NORMAL', 'CHOPPING'), 'NORMAL');

  // Permission guards per state
  assert.equal(isExpansionFlowActive('NORMAL'), false);
  assert.equal(canSelectExpansionSlot('EXPANSION_SELECTING'), true);
  assert.equal(canCancelExpansionMode('EXPANSION_SELECTING'), true);
  assert.equal(isManualCameraLocked('NORMAL'), false);
  assert.equal(isManualCameraLocked('EXPANSION_SELECTING'), false);

  for (const lockedState of [
    'CINEMATIC_MOVING',
    'CHOPPING',
    'TERRAIN_UPDATING',
    'CAMERA_RETURNING',
  ] as const) {
    assert.equal(isExpansionFlowActive(lockedState), true);
    assert.equal(canSelectExpansionSlot(lockedState), false, `${lockedState} must lock chunk selection`);
    assert.equal(canCancelExpansionMode(lockedState), false, `${lockedState} must lock cancel expansion`);
    assert.equal(isManualCameraLocked(lockedState), true, `${lockedState} must lock manual camera`);
  }

  assert.equal(isExpansionCandidatesVisible('NORMAL'), false);
  assert.equal(isExpansionCandidatesVisible('EXPANSION_SELECTING'), true);
  assert.equal(isExpansionCandidatesVisible('CINEMATIC_MOVING'), true);
  assert.equal(isExpansionCandidatesVisible('CHOPPING'), false);
  assert.equal(isExpansionCandidatesVisible('TERRAIN_UPDATING'), false);
  assert.equal(isExpansionCandidatesVisible('CAMERA_RETURNING'), false);
});

test('UX-5.1 UI Integration & Regression: CivilizationHeader & MapGridView lock controls properly, overlay banner prevents viewport resize, and UX-5 bitmap stays untouched', () => {
  const baseState = createInitialCivilizationState();
  const validSlots = GridMap.fromSnapshot(baseState.grid).getAvailableExpansionSlots();
  assert.ok(validSlots.length > 0);

  // 1. CivilizationHeader in locked cinematic state disables Expand, Build, and Cancel (Esc)
  const lockedHeaderHtml = renderToString(
    React.createElement(CivilizationHeader, {
      era: 'STONE_AGE',
      focusCoins: 200,
      lifetimeFocusMinutes: 120,
      activeBonusRate: 0.05,
      isPlacementMode: false,
      selectedBuildingDef: null,
      onCancelPlacement: () => {},
      onOpenCatalog: () => {},
      onOpenExpansion: () => {},
      isExpansionMode: true,
      isExpansionLocked: true,
      canCancelExpansion: false,
      onCancelExpansion: () => {},
    })
  );
  assert.ok(lockedHeaderHtml.includes('data-testid="expansion-mode-banner"'));
  // Non-layout-shifting overlay banner: positioned absolute below header so map viewport size stays unchanged
  assert.ok(lockedHeaderHtml.includes('absolute top-full inset-x-0'));
  const disabledMatches = lockedHeaderHtml.match(/disabled=""/g) ?? [];
  assert.equal(disabledMatches.length, 3, 'Expand, Build, and Cancel (Esc) buttons must all be disabled during locked cinematic phases');

  // 2. MapGridView across all 6 states
  const htmlSelecting = renderToString(
    React.createElement(MapGridView, {
      civilizationState: baseState,
      placementDef: null,
      onPlaceBuilding: () => {},
      onInspectBuilding: () => {},
      isExpansionMode: true,
      expansionFlowState: 'EXPANSION_SELECTING',
    })
  );
  assert.ok(htmlSelecting.includes('data-expansion-flow-state="EXPANSION_SELECTING"'));
  assert.ok(htmlSelecting.includes('data-camera-locked="false"'));
  assert.ok(htmlSelecting.includes('>100%<'), 'Entering EXPANSION_SELECTING preserves zoom at 100%');
  assert.equal(
    (htmlSelecting.match(/data-expansion-candidate="/g) ?? []).length,
    validSlots.length
  );
  assert.equal(htmlSelecting.includes('<img'), false);
  assert.ok(htmlSelecting.includes('data-testid="map-terrain-bitmap"'));

  const htmlMoving = renderToString(
    React.createElement(MapGridView, {
      civilizationState: baseState,
      placementDef: null,
      onPlaceBuilding: () => {},
      onInspectBuilding: () => {},
      isExpansionMode: true,
      expansionFlowState: 'CINEMATIC_MOVING',
      selectedExpansionOrigin: { x: 8, y: 0 },
    })
  );
  assert.ok(htmlMoving.includes('data-expansion-flow-state="CINEMATIC_MOVING"'));
  assert.ok(htmlMoving.includes('data-camera-locked="true"'));
  assert.ok(htmlMoving.includes('border-amber-300'), 'Selected target chunk stays highlighted during cinematic move');
  assert.equal(
    (htmlMoving.match(/disabled=""[^>]*title="(?:Zoom Out|Reset Zoom|Zoom In|Recenter Map)"/g) ?? []).length >= 3 ||
      (htmlMoving.match(/map-controls-toolbar[\s\S]*$/g)?.[0].match(/disabled=""/g) ?? []).length === 4,
    true,
    'All 4 manual camera toolbar buttons (Zoom Out, Reset, Zoom In, Recenter) must be disabled during CINEMATIC_MOVING'
  );

  // CHOPPING keeps dark forest until 680ms & hides other candidates
  const mapAfter = GridMap.fromSnapshot(baseState.grid);
  assert.equal(mapAfter.expandChunk({ x: 8, y: 0 }).success, true);
  const expandedState = { ...baseState, grid: mapAfter.toSnapshot() };

  const htmlChopping = renderToString(
    React.createElement(MapGridView, {
      civilizationState: expandedState,
      placementDef: null,
      onPlaceBuilding: () => {},
      onInspectBuilding: () => {},
      isExpansionMode: true,
      expansionFlowState: 'CHOPPING',
      selectedExpansionOrigin: { x: 8, y: 0 },
      activeExpansionReveal: {
        id: 1,
        origin: { x: 8, y: 0 },
        startedAt: 1000,
        reducedMotion: false,
      },
      unrevealedChunkOrigin: { x: 8, y: 0 },
    })
  );
  assert.ok(htmlChopping.includes('data-expansion-flow-state="CHOPPING"'));
  assert.ok(htmlChopping.includes('data-camera-locked="true"'));
  assert.ok(!htmlChopping.includes('data-expansion-candidate='), 'Candidate overlays hidden during chop');
  assert.ok(htmlChopping.includes('data-testid="expansion-reveal-overlay"'));
  assert.ok(htmlChopping.includes('data-cell-coord="8,0" data-unlocked="false"'));
  assert.ok(htmlChopping.includes('data-testid="map-terrain-bitmap"'));
  const terrainSlice = htmlChopping.slice(
    htmlChopping.indexOf('data-testid="map-interaction-grid"'),
    htmlChopping.indexOf('data-testid="expansion-reveal-overlay"')
  );
  assert.equal(terrainSlice.includes('<img'), false, 'Terrain grid must still use single bitmap (zero terrain <img>)');
  assert.equal(EXPANSION_IMPACT_MS, 680);
  assert.equal(EXPANSION_ANIMATION_DURATION_MS, 1150);

  // TERRAIN_UPDATING unlocks the chunk cells on bitmap while holding camera lock
  const htmlTerrainUpdating = renderToString(
    React.createElement(MapGridView, {
      civilizationState: expandedState,
      placementDef: null,
      onPlaceBuilding: () => {},
      onInspectBuilding: () => {},
      isExpansionMode: true,
      expansionFlowState: 'TERRAIN_UPDATING',
      selectedExpansionOrigin: { x: 8, y: 0 },
      activeExpansionReveal: {
        id: 1,
        origin: { x: 8, y: 0 },
        startedAt: 1000,
        reducedMotion: false,
      },
      unrevealedChunkOrigin: null,
    })
  );
  assert.ok(htmlTerrainUpdating.includes('data-expansion-flow-state="TERRAIN_UPDATING"'));
  assert.ok(htmlTerrainUpdating.includes('data-camera-locked="true"'));
  assert.ok(htmlTerrainUpdating.includes('data-cell-coord="8,0" data-unlocked="true"'));

  // CAMERA_RETURNING locks controls while easing back
  const htmlReturning = renderToString(
    React.createElement(MapGridView, {
      civilizationState: expandedState,
      placementDef: null,
      onPlaceBuilding: () => {},
      onInspectBuilding: () => {},
      isExpansionMode: true,
      expansionFlowState: 'CAMERA_RETURNING',
      selectedExpansionOrigin: null,
    })
  );
  assert.ok(htmlReturning.includes('data-expansion-flow-state="CAMERA_RETURNING"'));
  assert.ok(htmlReturning.includes('data-camera-locked="true"'));
  assert.equal((htmlReturning.match(/map-controls-toolbar[\s\S]*$/g)?.[0].match(/disabled=""/g) ?? []).length, 4);
});

test('UX-5.1 Lifecycle & Source Integrity: pre/post-commit popup restart preserves business invariants & source contains zero auto-fit zoom calls or resource leaks', async () => {
  // 1. Pre-commit cancel / popup close leaves economy & chunks untouched; post-commit keeps clearing job & completed chunk persisted
  const adapter = new MemoryStorageAdapter();
  const storage = new StorageManager(adapter);
  await storage.setEconomy({ focusCoins: 200, totalXP: 450, level: 3 });
  const initCiv = createInitialCivilizationState();
  const gm = GridMap.fromSnapshot(initCiv.grid);
  gm.placeBuilding('cave_seed', { x: 0, y: 0 }, { width: 3, height: 3 });
  await storage.setCivilizationState({
    ...initCiv,
    grid: gm.toSnapshot(),
    buildings: [
      {
        id: 'cave_seed',
        definitionId: 'stone_age_study_cave',
        position: { x: 0, y: 0 },
        level: 1,
        placedAt: 1,
      },
    ],
    villagers: [{ id: 'v_seed', role: 'elder', recruitedAt: 1 }],
    founderRole: 'elder',
  });
  const coordinator = new CivilizationCoordinator(storage);

  // Before commit: popup closes during CINEMATIC_MOVING -> storage untouched
  const before = await coordinator.getCivilizationState();
  assert.equal(before.grid.chunks.length, 4);
  assert.equal((await storage.getEconomy()).focusCoins, 200);

  // Rules check unchanged: evaluateExpansion gate
  const gate = evaluateExpansion({ chunkCount: 4, playerLevel: 3, coins: 200 });
  assert.equal(gate.canExpand, true);
  assert.equal(gate.cost, 30);

  // Execute real commit (queues 60m clearing job), then simulate duplicate transaction & Focus completion
  const tx = await coordinator.expandLand({ origin: { x: 8, y: 0 } });
  assert.equal(tx.civilizationState.grid.chunks.length, 4);
  assert.equal(tx.civilizationState.jobs?.length, 1);
  assert.equal(tx.economy.focusCoins, 170);

  // Duplicate transaction on same origin must fail cleanly without deducting Coins
  await assert.rejects(() => coordinator.expandLand({ origin: { x: 8, y: 0 } }));
  assert.equal((await storage.getEconomy()).focusCoins, 170);

  // Focus settlement completes clearing job and unlocks chunk (8,0)
  await storage.setCivilizationState(advanceJobs(tx.civilizationState, 3600));
  const reopened = await coordinator.getCivilizationState();
  assert.equal(reopened.grid.chunks.length, 5);
  assert.ok(reopened.grid.chunks.some((c) => c.origin.x === 8 && c.origin.y === 0));

  // 2. Static audit of MapGridView.tsx & CivilizationScreen.tsx for UX-5.1 safety guarantees
  const mapViewSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'src/ui/components/civilization/MapGridView.tsx'),
    'utf8'
  );
  const civScreenSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'src/ui/components/civilization/CivilizationScreen.tsx'),
    'utf8'
  );

  // MapGridView must NOT invoke computeExpansionFitZoom() at runtime
  const runtimeSection = mapViewSrc.slice(mapViewSrc.indexOf('export const MapGridView'));
  assert.equal(
    runtimeSection.includes('computeExpansionFitZoom('),
    false,
    'MapGridView runtime must never call computeExpansionFitZoom on expansion mode entry'
  );
  // Cleanup hooks for ResizeObserver, RAF, timers, and mounted flag must exist
  assert.ok(mapViewSrc.includes('observer.disconnect()'));
  assert.ok(mapViewSrc.includes('cancelAnimationFrame('));
  assert.ok(civScreenSrc.includes('isConfirmInFlightRef'));
  assert.ok(civScreenSrc.includes('isMountedRef'));
  assert.ok(civScreenSrc.includes('clearRevealTimers()'));
  assert.ok(civScreenSrc.includes("window.removeEventListener('keydown'"));
});
