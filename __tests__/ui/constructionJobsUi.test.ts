import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToString } from 'react-dom/server';

import { I18nProvider } from '../../src/i18n/I18nContext.tsx';
import { createInitialCivilizationState } from '../../src/core/civilization/civilizationState.ts';
import { BuildingInstance } from '../../src/core/civilization/buildingTypes.ts';
import { ConstructionJob } from '../../src/core/civilization/jobs.ts';
import { SessionSnapshot } from '../../src/types/session.ts';
import { CivilizationHeader } from '../../src/ui/components/civilization/CivilizationHeader.tsx';
import { BuildingCatalogPanel } from '../../src/ui/components/civilization/BuildingCatalogPanel.tsx';
import { BuildingDetailsModal } from '../../src/ui/components/civilization/BuildingDetailsModal.tsx';
import { ClearingChunkModal } from '../../src/ui/components/civilization/ClearingChunkModal.tsx';
import { MapGridView } from '../../src/ui/components/civilization/MapGridView.tsx';
import { ConstructionFence } from '../../src/ui/components/civilization/ConstructionFence.tsx';
import { SpriteGallery } from '../../src/ui/components/civilization/SpriteGallery.tsx';
import { StatsView } from '../../src/ui/components/StatsView.tsx';
import {
  CLOCK_TILES_SHEET_PATH,
  CLOCK_TILE_INDEX,
  CONSTRUCTION_SPRITE_STAGES,
  CONSTRUCTION_STAGE_COUNT,
  getBuildingSprite,
  getConstructionSprite,
  getConstructionStageIndex,
} from '../../src/ui/components/civilization/spriteRegistry.ts';
import {
  computeLiveSessionElapsedFocusSeconds,
  formatJobCountdown,
  formatJobDurationMinutes,
  getCancelJobRefundPreview,
  isLiveFocusTicking,
} from '../../src/ui/components/civilization/jobProjection.ts';

function renderLocale(locale: 'en' | 'vi', element: React.ReactElement): string {
  return renderToString(React.createElement(I18nProvider, { locale }, element));
}

test('5E-1 Stage B Assets: clock_tiles_16.png is valid 48x16 PNG and 4 construction stages match native building sprite sizes', () => {
  const sheetPath = path.resolve(process.cwd(), 'public', CLOCK_TILES_SHEET_PATH.replace(/^\//, ''));
  assert.ok(fs.existsSync(sheetPath), `Missing ${sheetPath}`);
  const buf = fs.readFileSync(sheetPath);
  // PNG signature + IHDR width/height
  assert.deepStrictEqual(Array.from(buf.subarray(0, 8)), [137, 80, 78, 71, 13, 10, 26, 10]);
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  assert.equal(width, 48);
  assert.equal(height, 16);
  assert.equal(CLOCK_TILE_INDEX.CLOCK, 0);
  assert.equal(CLOCK_TILE_INDEX.HOURGLASS, 1);
  assert.equal(CLOCK_TILE_INDEX.STOPWATCH, 2);

  assert.equal(CONSTRUCTION_STAGE_COUNT, 4);
  const timedBuildingIds = [
    'stone_age_totem',
    'stone_age_study_cave',
    'stone_age_elder_hut',
    'stone_age_foraging_post',
    'stone_age_food_cache',
  ];
  for (const id of timedBuildingIds) {
    const stages = CONSTRUCTION_SPRITE_STAGES[id];
    const base = getBuildingSprite(id);
    assert.ok(stages && stages.length === 4, `Expected 4 construction stages for ${id}`);
    assert.ok(base, `Expected finished sprite for ${id}`);
    for (const stage of stages) {
      assert.equal(stage.width, base.width);
      assert.equal(stage.height, base.height);
      assert.equal(stage.rows.length, base.height);
      assert.equal(stage.rows[0].length, base.width);
    }
  }
  // Campfire builds instantly and intentionally has no construction stages
  assert.equal(CONSTRUCTION_SPRITE_STAGES.stone_age_campfire, undefined);
  assert.equal(getConstructionSprite('stone_age_campfire', 0, 0), null);
});

test('5E-1 Stage B Stage Mapping: getConstructionStageIndex & getConstructionSprite map 0%/25%/50%/75%/99% accurately', () => {
  assert.equal(getConstructionStageIndex(3600, 3600), 0); // 0%
  assert.equal(getConstructionStageIndex(2701, 3600), 0); // <25%
  assert.equal(getConstructionStageIndex(2700, 3600), 1); // 25%
  assert.equal(getConstructionStageIndex(1800, 3600), 2); // 50%
  assert.equal(getConstructionStageIndex(900, 3600), 3);  // 75%
  assert.equal(getConstructionStageIndex(1, 3600), 3);    // 99.97%
  assert.equal(getConstructionStageIndex(0, 3600), 3);    // clamped below 4
  assert.equal(getConstructionStageIndex(10, 0), 0);

  const stage2 = getConstructionSprite('stone_age_foraging_post', 1800, 3600);
  assert.equal(stage2?.id, 'stone_age_foraging_post_construction_2');
});

test('5E-1 Stage B Live Projection Helpers: active focus ticking, pause freeze, Pomodoro break exclusion, countdown & refund preview', () => {
  const baseCountdown: SessionSnapshot = {
    id: 's_1',
    mode: 'COUNTDOWN',
    status: 'RUNNING',
    profileId: 'p1',
    targetMinutes: 60,
    lockedMultiplier: 1,
    startedAt: 1_000_000,
    currentPauseStartedAt: null,
    pauseCount: 0,
    totalPauseMs: 5_000,
    pauseHistory: [],
    lastHeartbeatAt: 1_000_000,
    completedAt: null,
    rewardProcessed: false,
  };
  assert.equal(isLiveFocusTicking(baseCountdown), true);
  // 125s elapsed - 5s pause = 120s
  assert.equal(computeLiveSessionElapsedFocusSeconds(baseCountdown, 1_125_000), 120);
  // Clamped to targetMinutes * 60
  assert.equal(computeLiveSessionElapsedFocusSeconds(baseCountdown, 10_000_000), 3600);

  const pausedSession: SessionSnapshot = {
    ...baseCountdown,
    status: 'PAUSED',
    currentPauseStartedAt: 1_065_000,
  };
  assert.equal(isLiveFocusTicking(pausedSession), false);
  // Frozen on currentPauseStartedAt regardless of advancing nowMs
  assert.equal(computeLiveSessionElapsedFocusSeconds(pausedSession, 1_065_000), 60);
  assert.equal(computeLiveSessionElapsedFocusSeconds(pausedSession, 9_999_000), 60);

  const completedSession: SessionSnapshot = {
    ...baseCountdown,
    status: 'COMPLETED',
  };
  assert.equal(isLiveFocusTicking(completedSession), false);
  assert.equal(computeLiveSessionElapsedFocusSeconds(completedSession, 1_125_000), 0);

  const stopwatchRunning: SessionSnapshot = {
    ...baseCountdown,
    mode: 'STOPWATCH',
    targetMinutes: 0,
  };
  assert.equal(isLiveFocusTicking(stopwatchRunning), true);
  assert.equal(computeLiveSessionElapsedFocusSeconds(stopwatchRunning, 1_045_000), 40);

  const pomodoroFocus: SessionSnapshot = {
    id: 's_pomo',
    mode: 'POMODORO_COUNTDOWN',
    status: 'RUNNING',
    profileId: 'p1',
    targetMinutes: 25,
    lockedMultiplier: 1,
    startedAt: 1_000_000,
    currentPauseStartedAt: null,
    pauseCount: 0,
    totalPauseMs: 0,
    pauseHistory: [],
    lastHeartbeatAt: 2_000_000,
    completedAt: null,
    rewardProcessed: false,
    pomodoroState: {
      currentInterval: 2,
      currentCycle: 1,
      currentPhase: 'FOCUS',
      phaseStartedAt: 2_000_000,
      phaseTargetDurationMinutes: 25,
      phaseTotalPauseMs: 0,
      completedFocusCount: 1,
      totalCompletedFocusMinutes: 25,
      accumulatedCoins: 25,
      accumulatedXp: 75,
    },
  };
  assert.equal(isLiveFocusTicking(pomodoroFocus), true);
  // 25*60 + 90s = 1590s
  assert.equal(computeLiveSessionElapsedFocusSeconds(pomodoroFocus, 2_090_000), 1590);

  const pomodoroBreak: SessionSnapshot = {
    ...pomodoroFocus,
    pomodoroState: {
      ...pomodoroFocus.pomodoroState!,
      currentPhase: 'SHORT_BREAK',
      phaseStartedAt: 2_500_000,
      phaseTargetDurationMinutes: 5,
    },
  };
  assert.equal(isLiveFocusTicking(pomodoroBreak), false);
  // Frozen on completed focus intervals only (1500s) during break
  assert.equal(computeLiveSessionElapsedFocusSeconds(pomodoroBreak, 2_700_000), 1500);

  assert.equal(formatJobCountdown(3661), '1:01:01');
  assert.equal(formatJobCountdown(305), '05:05');
  assert.equal(formatJobCountdown(0), '00:00');
  assert.equal(formatJobDurationMinutes(7200), 120);

  const placeUnstarted: ConstructionJob = {
    id: 'j_place',
    kind: 'place',
    status: 'ACTIVE',
    definitionId: 'stone_age_foraging_post',
    buildingId: 'b_1',
    crewRequired: 1,
    totalSeconds: 3600,
    remainingSeconds: 3600,
    paidCoins: 15,
    createdAt: 1,
  };
  assert.deepStrictEqual(getCancelJobRefundPreview(placeUnstarted, [placeUnstarted]), {
    cancelledCount: 1,
    refundCoins: 15,
    isUnstarted: true,
  });

  const up1: ConstructionJob = {
    id: 'j_u1',
    kind: 'upgrade',
    status: 'ACTIVE',
    buildingId: 'b_1',
    targetLevel: 2,
    crewRequired: 1,
    totalSeconds: 300,
    remainingSeconds: 180,
    paidCoins: 24,
    createdAt: 2,
  };
  const up2: ConstructionJob = {
    id: 'j_u2',
    kind: 'upgrade',
    status: 'PENDING',
    buildingId: 'b_1',
    targetLevel: 3,
    crewRequired: 1,
    totalSeconds: 600,
    remainingSeconds: 600,
    paidCoins: 38,
    createdAt: 3,
  };
  // Cancelling started Lv.2 cascades to unstarted Lv.3: 50%*24 + 100%*38 = 50
  assert.deepStrictEqual(getCancelJobRefundPreview(up1, [up1, up2]), {
    cancelledCount: 2,
    refundCoins: 50,
    isUnstarted: false,
  });
});

test('5E-1 Stage B SSR: CivilizationHeader crew badge & BuildingCatalogPanel crew/time + shortage disable', () => {
  const headerHtml = renderLocale(
    'en',
    React.createElement(CivilizationHeader, {
      era: 'STONE_AGE',
      focusCoins: 120,
      lifetimeFocusMinutes: 60,
      activeBonusRate: 0.05,
      busyCrew: 2,
      totalCrew: 3,
      isPlacementMode: false,
      selectedBuildingDef: null,
      onCancelPlacement: () => {},
      onOpenCatalog: () => {},
      onOpenExpansion: () => {},
    })
  );
  assert.ok(headerHtml.includes('data-testid="civ-header-crew"'));
  assert.ok(headerHtml.includes('2/3'));

  const catalogLowCrew = renderLocale(
    'en',
    React.createElement(BuildingCatalogPanel, {
      isOpen: true,
      onClose: () => {},
      playerLevel: 10,
      playerCoins: 1000,
      lifetimeFocusMinutes: 1000,
      totalCrew: 1,
      onSelectBuilding: () => {},
    })
  );
  assert.ok(catalogLowCrew.includes('data-testid="catalog-crew-time"'));
  assert.ok(catalogLowCrew.includes('Instant'));
  assert.ok(catalogLowCrew.includes('1 crew · 60m'));
  assert.ok(catalogLowCrew.includes('2 crew · 120m'));
  assert.ok(catalogLowCrew.includes('Need 2 crew'));
});

test('5E-1 Stage B SSR: BuildingDetailsModal under-construction, cancel refund, upgrade queue, and StatsView lock', () => {
  const elderHut: BuildingInstance = {
    id: 'b_elder',
    definitionId: 'stone_age_elder_hut',
    position: { x: 0, y: 0 },
    level: 1,
    placedAt: 1700000000000,
  };
  const placeJob: ConstructionJob = {
    id: 'job_elder_place',
    kind: 'place',
    status: 'ACTIVE',
    definitionId: 'stone_age_elder_hut',
    buildingId: 'b_elder',
    crewRequired: 2,
    totalSeconds: 7200,
    remainingSeconds: 3600,
    paidCoins: 20,
    createdAt: 100,
  };

  const underConstructionEn = renderLocale(
    'en',
    React.createElement(BuildingDetailsModal, {
      building: elderHut,
      jobs: [placeJob],
      founderRole: 'elder',
      playerLevel: 5,
      playerCoins: 500,
      onClose: () => {},
      onRemove: async () => {},
      onCancelJob: async () => {},
    })
  );
  assert.ok(underConstructionEn.includes('data-testid="building-under-construction-section"'));
  assert.ok(underConstructionEn.includes('1:00:00'));
  assert.ok(underConstructionEn.includes('data-testid="cancel-build-job-btn"'));
  assert.ok(underConstructionEn.includes('10 Coins')); // 50% of 20 Coins because started
  assert.ok(!underConstructionEn.includes('Demolish Building'));
  assert.ok(underConstructionEn.includes('Fixed effect · Cannot be upgraded'));

  const foragePlacing: BuildingInstance = {
    id: 'b_forage_placing',
    definitionId: 'stone_age_foraging_post',
    position: { x: 2, y: 0 },
    level: 1,
    placedAt: 1700000000000,
  };
  const foragePlaceJob: ConstructionJob = {
    id: 'job_forage_place',
    kind: 'place',
    status: 'PENDING',
    definitionId: 'stone_age_foraging_post',
    buildingId: 'b_forage_placing',
    crewRequired: 1,
    totalSeconds: 3600,
    remainingSeconds: 3600,
    paidCoins: 15,
    createdAt: 101,
  };
  const forageUnderConstructionEn = renderLocale(
    'en',
    React.createElement(BuildingDetailsModal, {
      building: foragePlacing,
      jobs: [foragePlaceJob],
      founderRole: 'crafter',
      playerLevel: 5,
      playerCoins: 500,
      onClose: () => {},
      onRemove: async () => {},
      onCancelJob: async () => {},
    })
  );
  assert.ok(forageUnderConstructionEn.includes('Finish building construction before upgrading.'));
  assert.ok(forageUnderConstructionEn.includes('15 Coins')); // 100% unstarted refund preview

  // Queued upgrade on finished Foraging Post
  const forage: BuildingInstance = {
    id: 'b_forage',
    definitionId: 'stone_age_foraging_post',
    position: { x: 4, y: 0 },
    level: 1,
    placedAt: 1700000000000,
  };
  const u1: ConstructionJob = {
    id: 'j_u1',
    kind: 'upgrade',
    status: 'ACTIVE',
    buildingId: 'b_forage',
    targetLevel: 2,
    crewRequired: 1,
    totalSeconds: 300,
    remainingSeconds: 180,
    paidCoins: 24,
    createdAt: 200,
  };
  const u2: ConstructionJob = {
    id: 'j_u2',
    kind: 'upgrade',
    status: 'PENDING',
    buildingId: 'b_forage',
    targetLevel: 3,
    crewRequired: 1,
    totalSeconds: 600,
    remainingSeconds: 600,
    paidCoins: 38,
    createdAt: 201,
  };
  const queuedVi = renderLocale(
    'vi',
    React.createElement(BuildingDetailsModal, {
      building: forage,
      jobs: [u1, u2],
      founderRole: 'crafter',
      playerLevel: 5,
      playerCoins: 500,
      onClose: () => {},
      onRemove: async () => {},
      onUpgrade: async () => {},
      onCancelJob: async () => {},
    })
  );
  assert.ok(queuedVi.includes('data-testid="building-upgrade-queue-section"'));
  assert.ok(queuedVi.includes('Lv.1→2 · 03:00'));
  assert.ok(queuedVi.includes('Lv.2→3 · Chờ dân làng'));
  assert.ok(queuedVi.includes('Hoàn 50 Coin')); // cascade refund 12 + 38 = 50
  assert.ok(queuedVi.includes('Cấp kế Lv. 4')); // effective target is Lv.3 -> next Lv.4

  // StatsView keeps Focus Streak locked while Elder's Hut has an active place job
  const statsLockedHtml = renderLocale(
    'en',
    React.createElement(StatsView, {
      todayStats: {
        date: '2026-11-24',
        totalFocusMinutes: 60,
        completedSessions: 2,
        abandonedSessions: 0,
        coinsEarned: 60,
        xpEarned: 180,
      },
      buildings: [elderHut],
      jobs: [placeJob],
      initialAllDailyStats: {
        '2026-11-24': {
          date: '2026-11-24',
          totalFocusMinutes: 60,
          completedSessions: 2,
          abandonedSessions: 0,
          coinsEarned: 60,
          xpEarned: 180,
        },
      },
      todayOverride: '2026-11-24',
    })
  );
  assert.ok(statsLockedHtml.includes("Elder&#x27;s Hut") || statsLockedHtml.includes("Elder's Hut"));
  assert.ok(statsLockedHtml.includes('Locked'));
});

test('5E-1 Stage B SSR: ClearingChunkModal, MapGridView overlays, and SpriteGallery Section 6', () => {
  const clearingJob: ConstructionJob = {
    id: 'job_expand_1',
    kind: 'expand',
    status: 'PENDING',
    origin: { x: 8, y: 0 },
    purchaseIndex: 1,
    crewRequired: 2,
    totalSeconds: 3600,
    remainingSeconds: 3600,
    paidCoins: 30,
    createdAt: 300,
  };

  const clearingModalHtml = renderLocale(
    'en',
    React.createElement(ClearingChunkModal, {
      job: clearingJob,
      allJobs: [clearingJob],
      onClose: () => {},
      onCancelJob: async () => {},
    })
  );
  assert.ok(clearingModalHtml.includes('data-testid="clearing-chunk-modal"'));
  assert.ok(clearingModalHtml.includes('(8, 0)'));
  assert.ok(clearingModalHtml.includes('Waiting for villagers'));
  assert.ok(clearingModalHtml.includes('1:00:00'));
  assert.ok(clearingModalHtml.includes('Cancel Clearing (+30 Coins)'));

  const baseCiv = createInitialCivilizationState();
  const placingBuilding: BuildingInstance = {
    id: 'b_totem_1',
    definitionId: 'stone_age_totem',
    position: { x: 0, y: 0 },
    level: 1,
    placedAt: 100,
  };
  const finishedForage: BuildingInstance = {
    id: 'b_forage_2',
    definitionId: 'stone_age_foraging_post',
    position: { x: 2, y: 0 },
    level: 1,
    placedAt: 100,
  };
  const placeTotemJob: ConstructionJob = {
    id: 'job_totem',
    kind: 'place',
    status: 'ACTIVE',
    definitionId: 'stone_age_totem',
    buildingId: 'b_totem_1',
    crewRequired: 1,
    totalSeconds: 3600,
    remainingSeconds: 1800,
    paidCoins: 8,
    createdAt: 100,
  };
  const upgradeForageJob: ConstructionJob = {
    id: 'job_up_f',
    kind: 'upgrade',
    status: 'ACTIVE',
    buildingId: 'b_forage_2',
    targetLevel: 2,
    crewRequired: 1,
    totalSeconds: 300,
    remainingSeconds: 120,
    paidCoins: 15,
    createdAt: 101,
  };

  const mapHtml = renderLocale(
    'en',
    React.createElement(MapGridView, {
      civilizationState: {
        ...baseCiv,
        buildings: [placingBuilding, finishedForage],
        jobs: [placeTotemJob, upgradeForageJob, clearingJob],
      },
      projectedJobs: [placeTotemJob, upgradeForageJob, clearingJob],
      placementDef: null,
      onPlaceBuilding: () => {},
      onInspectBuilding: () => {},
      onInspectClearingChunk: () => {},
    })
  );
  assert.ok(mapHtml.includes('data-clearing-chunk="8,0"'));
  assert.ok(mapHtml.includes('data-building-construction="ACTIVE"'));
  assert.ok(mapHtml.includes('data-testid="building-place-timer-b_totem_1"'));
  assert.ok(mapHtml.includes('30:00'));
  assert.ok(mapHtml.includes('data-building-upgrade-job="ACTIVE"'));
  assert.ok(mapHtml.includes('data-testid="building-upgrade-timer-b_forage_2"'));
  assert.ok(mapHtml.includes('Lv.2 · 02:00'));

  const galleryHtml = renderLocale('en', React.createElement(SpriteGallery, {}));
  assert.ok(galleryHtml.includes('data-testid="gallery-construction-section"'));
  assert.ok(galleryHtml.includes('data-testid="gallery-clock-tile-0"'));
  assert.ok(galleryHtml.includes('data-testid="gallery-clock-tile-1"'));
  assert.ok(galleryHtml.includes('data-testid="gallery-clock-tile-2"'));
  assert.ok(galleryHtml.includes('data-testid="gallery-construction-stone_age_elder_hut"'));
});

test('5E-1b UI Patch: perimeter construction fence, wooden upgrade scaffold, hovering tools + reduced-motion, EN/VI labels, and PENDING countdowns', async () => {
  const { projectJobs } = await import('../../src/core/civilization/jobs.ts');
  const { getConstructionToolSpec } = await import(
    '../../src/ui/components/civilization/MapGridView.tsx'
  );

  // Tool mapping spec verification
  assert.deepStrictEqual(getConstructionToolSpec('place', 'stone_age_study_cave'), {
    pack: 'tiny-town',
    tileIndex: 115,
  });
  assert.deepStrictEqual(getConstructionToolSpec('place', 'stone_age_foraging_post'), {
    pack: 'tiny-dungeon',
    tileIndex: 117,
  });
  assert.deepStrictEqual(getConstructionToolSpec('upgrade', 'stone_age_foraging_post'), {
    pack: 'tiny-dungeon',
    tileIndex: 117,
  });
  assert.deepStrictEqual(getConstructionToolSpec('expand'), {
    pack: 'tiny-town',
    tileIndex: 127,
  });

  const baseCiv = createInitialCivilizationState();
  const placingCave: BuildingInstance = {
    id: 'b_cave_dig',
    definitionId: 'stone_age_study_cave',
    position: { x: 0, y: 0 },
    level: 1,
    placedAt: 100,
  };
  const upgradingGranary: BuildingInstance = {
    id: 'b_granary_up',
    definitionId: 'stone_age_food_cache',
    position: { x: 4, y: 0 },
    level: 2,
    placedAt: 100,
  };
  const pendingPlaceForage: BuildingInstance = {
    id: 'b_forage_pend',
    definitionId: 'stone_age_foraging_post',
    position: { x: 4, y: 4 },
    level: 1,
    placedAt: 100,
  };

  const cavePlaceActive: ConstructionJob = {
    id: 'j_cave_place',
    kind: 'place',
    status: 'ACTIVE',
    definitionId: 'stone_age_study_cave',
    buildingId: 'b_cave_dig',
    crewRequired: 1,
    totalSeconds: 3600,
    remainingSeconds: 2400,
    paidCoins: 12,
    createdAt: 100,
  };
  const granaryUpgradePending: ConstructionJob = {
    id: 'j_granary_up',
    kind: 'upgrade',
    status: 'PENDING',
    buildingId: 'b_granary_up',
    targetLevel: 3,
    crewRequired: 2,
    totalSeconds: 600,
    remainingSeconds: 600,
    paidCoins: 97,
    createdAt: 101,
  };
  const foragePlacePending: ConstructionJob = {
    id: 'j_forage_pend',
    kind: 'place',
    status: 'PENDING',
    definitionId: 'stone_age_foraging_post',
    buildingId: 'b_forage_pend',
    crewRequired: 1,
    totalSeconds: 3600,
    remainingSeconds: 3600,
    paidCoins: 15,
    createdAt: 102,
  };
  const expandActive: ConstructionJob = {
    id: 'j_expand_act',
    kind: 'expand',
    status: 'ACTIVE',
    origin: { x: 8, y: 0 },
    purchaseIndex: 1,
    crewRequired: 2,
    totalSeconds: 3600,
    remainingSeconds: 3600,
    paidCoins: 30,
    createdAt: 103,
  };

  const civState = {
    ...baseCiv,
    buildings: [placingCave, upgradingGranary, pendingPlaceForage],
    jobs: [cavePlaceActive, expandActive, granaryUpgradePending, foragePlacePending],
  };

  const mapEn = renderLocale(
    'en',
    React.createElement(MapGridView, {
      civilizationState: civState,
      projectedJobs: civState.jobs,
      placementDef: null,
      onPlaceBuilding: () => {},
      onInspectBuilding: () => {},
      onInspectClearingChunk: () => {},
    })
  );
  const mapVi = renderLocale(
    'vi',
    React.createElement(MapGridView, {
      civilizationState: civState,
      projectedJobs: civState.jobs,
      placementDef: null,
      onPlaceBuilding: () => {},
      onInspectBuilding: () => {},
      onInspectClearingChunk: () => {},
    })
  );

  // 1. Perimeter construction fence (4 corner stakes + 4 ribbons, no full-cell tarp overlay) on placement (ACTIVE & PENDING) and clearing chunk
  assert.ok(mapEn.includes('data-testid="building-tarp-b_cave_dig"'));
  assert.ok(mapEn.includes('data-testid="building-tarp-b_forage_pend"'));
  assert.ok(mapEn.includes('data-testid="clearing-tarp-8-0"'));
  assert.ok(!mapEn.includes('fq-construction-tarp'));
  assert.ok(mapEn.includes('data-testid="fence-stake-tl"'));
  assert.ok(mapEn.includes('data-testid="fence-stake-br"'));
  assert.ok(mapEn.includes('data-testid="fence-ribbon-back"'));
  assert.ok(mapEn.includes('data-testid="fence-ribbon-front"'));
  assert.ok(mapEn.includes('fq-fence-ribbon-sway'));

  // 2. Milestone 5E-2 Section 0: MapGridView renders zero hovering/animated tool icons across all 3 job kinds
  assert.ok(!mapEn.includes('data-testid="building-tool-'));
  assert.ok(!mapEn.includes('data-testid="clearing-tool-'));
  assert.ok(!mapEn.includes('data-testid="building-upgrade-tool-'));
  assert.ok(!mapEn.includes('fq-tool-strike'));

  // 3. EN & VI short labels ("Digging"/"Đang đào" only on Rock Shelter; "Clearing forest"/"Đang dọn rừng")
  assert.ok(mapEn.includes('data-testid="building-digging-badge-b_cave_dig"'));
  assert.ok(mapEn.includes('>Digging<'));
  assert.ok(mapVi.includes('>Đang đào<'));
  assert.ok(!mapEn.includes('data-testid="building-digging-badge-b_forage_pend"'));
  assert.ok(mapEn.includes('data-testid="clearing-label-8-0"'));
  assert.ok(mapEn.includes('>Clearing forest<'));
  assert.ok(mapVi.includes('>Đang dọn rừng<'));

  // 4. Upgrading building retains base sprite + wooden scaffold + clock + countdown (even when PENDING)
  assert.ok(mapEn.includes('data-testid="building-upgrade-scaffold-b_granary_up"'));
  assert.ok(mapEn.includes('fq-construction-scaffold'));
  assert.ok(mapEn.includes('data-testid="building-upgrade-timer-b_granary_up"'));
  assert.ok(mapEn.includes('Lv.3 · 10:00'));

  // 5. PENDING place job also renders clock + full countdown (not "Waiting")
  assert.ok(mapEn.includes('data-testid="building-place-timer-b_forage_pend"'));
  assert.ok(mapEn.includes('1:00:00'));

  // 6. Reduced motion disables fence sway animation even on ACTIVE jobs
  const originalWindow = (globalThis as { window?: unknown }).window;
  (globalThis as { window: unknown }).window = {
    matchMedia: () => ({ matches: true }),
  };
  try {
    const reducedHtml = renderLocale(
      'en',
      React.createElement(MapGridView, {
        civilizationState: civState,
        projectedJobs: civState.jobs,
        placementDef: null,
        onPlaceBuilding: () => {},
        onInspectBuilding: () => {},
        onInspectClearingChunk: () => {},
      })
    );
    assert.ok(!reducedHtml.includes('fq-tool-strike'));
    assert.ok(!reducedHtml.includes('fq-fence-ribbon-sway'));
    assert.ok(reducedHtml.includes('data-fence-animated="false"'));
  } finally {
    if (originalWindow === undefined) {
      delete (globalThis as { window?: unknown }).window;
    } else {
      (globalThis as { window?: unknown }).window = originalWindow;
    }
  }

  // 7. Live 1-second projection onto MapGridView: RUNNING ticks down per second, PAUSED freezes, Give Up / INTERRUPTED revert
  const liveCiv = {
    ...baseCiv,
    founderRole: 'crafter' as const,
    buildings: [pendingPlaceForage],
    jobs: [{ ...foragePlacePending, status: 'ACTIVE' as const, remainingSeconds: 1800 }],
  };
  const runningCountdown: SessionSnapshot = {
    id: 'sess_live_map',
    mode: 'COUNTDOWN',
    status: 'RUNNING',
    profileId: 'p1',
    targetMinutes: 30,
    lockedMultiplier: 1.2,
    startedAt: 10_000_000,
    currentPauseStartedAt: null,
    pauseCount: 0,
    totalPauseMs: 0,
    pauseHistory: [],
    lastHeartbeatAt: 10_000_000,
    completedAt: null,
    rewardProcessed: false,
  };

  const renderAtSession = (snap: SessionSnapshot, nowMs: number): string => {
    const elapsed = computeLiveSessionElapsedFocusSeconds(snap, nowMs);
    const projected = projectJobs(liveCiv, elapsed);
    return renderLocale(
      'en',
      React.createElement(MapGridView, {
        civilizationState: liveCiv,
        projectedJobs: projected.jobs,
        placementDef: null,
        onPlaceBuilding: () => {},
        onInspectBuilding: () => {},
        onInspectClearingChunk: () => {},
      })
    );
  };

  const htmlT1 = renderAtSession(runningCountdown, 10_001_000);
  const htmlT2 = renderAtSession(runningCountdown, 10_002_000);
  assert.ok(htmlT1.includes('29:59'));
  assert.ok(htmlT2.includes('29:58'));

  const pausedCountdown: SessionSnapshot = {
    ...runningCountdown,
    status: 'PAUSED',
    currentPauseStartedAt: 10_002_000,
  };
  const htmlPausedLater = renderAtSession(pausedCountdown, 10_120_000);
  assert.ok(htmlPausedLater.includes('29:58'));

  const abandonedHtml = renderAtSession({ ...runningCountdown, status: 'ABANDONED' }, 10_120_000);
  const interruptedHtml = renderAtSession({ ...runningCountdown, status: 'INTERRUPTED' }, 10_120_000);
  assert.ok(abandonedHtml.includes('30:00'));
  assert.ok(interruptedHtml.includes('30:00'));
});

test('5E-1c ConstructionFence: 4 corner stakes, 4 perimeter ribbons, transparent interior, ACTIVE/PENDING/reduced-motion, and excludes finished & upgrade', () => {
  // 1. Standalone ConstructionFence: ACTIVE animated vs PENDING static/dimmed vs reducedMotion static
  const activeFenceHtml = renderToString(
    React.createElement(ConstructionFence, {
      width: 64,
      height: 64,
      status: 'ACTIVE',
      reducedMotion: false,
      variant: 'building',
      testId: 'fence-active-sample',
    })
  );
  assert.ok(activeFenceHtml.includes('data-testid="fence-active-sample"'));
  assert.ok(activeFenceHtml.includes('data-fence-status="ACTIVE"'));
  assert.ok(activeFenceHtml.includes('data-fence-animated="true"'));
  assert.ok(activeFenceHtml.includes('pointer-events-none'));
  assert.ok(activeFenceHtml.includes('fill="none"'));
  assert.ok(activeFenceHtml.includes('fq-fence-ribbon-sway'));
  assert.ok(activeFenceHtml.includes('fq-fence-ribbon-sway-side'));
  assert.ok(!activeFenceHtml.includes('opacity-65'));
  assert.ok(!activeFenceHtml.includes('fq-construction-tarp'));
  for (const corner of ['tl', 'tr', 'bl', 'br']) {
    assert.ok(activeFenceHtml.includes(`data-testid="fence-stake-${corner}"`));
    assert.ok(activeFenceHtml.includes(`data-testid="fence-stake-shadow-${corner}"`));
  }
  for (const edge of ['back', 'front', 'left', 'right']) {
    assert.ok(activeFenceHtml.includes(`data-testid="fence-ribbon-${edge}"`));
  }

  const pendingFenceHtml = renderToString(
    React.createElement(ConstructionFence, {
      width: 128,
      height: 128,
      status: 'PENDING',
      reducedMotion: false,
      variant: 'clearing',
      testId: 'fence-pending-sample',
    })
  );
  assert.ok(pendingFenceHtml.includes('data-fence-status="PENDING"'));
  assert.ok(pendingFenceHtml.includes('data-fence-animated="false"'));
  assert.ok(pendingFenceHtml.includes('opacity-65'));
  assert.ok(!pendingFenceHtml.includes('fq-fence-ribbon-sway'));
  assert.ok(pendingFenceHtml.includes('viewBox="0 0 128 128"'));

  const reducedActiveHtml = renderToString(
    React.createElement(ConstructionFence, {
      width: 32,
      height: 32,
      status: 'ACTIVE',
      reducedMotion: true,
      variant: 'building',
      testId: 'fence-reduced-sample',
    })
  );
  assert.ok(reducedActiveHtml.includes('data-fence-animated="false"'));
  assert.ok(!reducedActiveHtml.includes('fq-fence-ribbon-sway'));

  // 2. MapGridView integration: present on new build & clearing, absent on completed & upgrade (upgrade keeps scaffold only)
  const baseCiv = createInitialCivilizationState();
  const placingBuilding: BuildingInstance = {
    id: 'b_place_5e1c',
    definitionId: 'stone_age_foraging_post',
    position: { x: 0, y: 0 },
    level: 1,
    placedAt: 100,
  };
  const finishedBuilding: BuildingInstance = {
    id: 'b_done_5e1c',
    definitionId: 'stone_age_campfire',
    position: { x: 2, y: 0 },
    level: 1,
    placedAt: 100,
  };
  const upgradingBuilding: BuildingInstance = {
    id: 'b_up_5e1c',
    definitionId: 'stone_age_food_cache',
    position: { x: 4, y: 0 },
    level: 1,
    placedAt: 100,
  };
  const jobs: ConstructionJob[] = [
    {
      id: 'j_place_5e1c',
      kind: 'place',
      status: 'ACTIVE',
      definitionId: 'stone_age_foraging_post',
      buildingId: 'b_place_5e1c',
      crewRequired: 1,
      totalSeconds: 3600,
      remainingSeconds: 1800,
      paidCoins: 15,
      createdAt: 100,
    },
    {
      id: 'j_up_5e1c',
      kind: 'upgrade',
      status: 'ACTIVE',
      buildingId: 'b_up_5e1c',
      targetLevel: 2,
      crewRequired: 1,
      totalSeconds: 300,
      remainingSeconds: 180,
      paidCoins: 54,
      createdAt: 101,
    },
    {
      id: 'j_expand_5e1c',
      kind: 'expand',
      status: 'PENDING',
      origin: { x: 8, y: 0 },
      purchaseIndex: 1,
      crewRequired: 2,
      totalSeconds: 3600,
      remainingSeconds: 3600,
      paidCoins: 30,
      createdAt: 102,
    },
  ];
  const mapHtml = renderLocale(
    'en',
    React.createElement(MapGridView, {
      civilizationState: {
        ...baseCiv,
        buildings: [placingBuilding, finishedBuilding, upgradingBuilding],
        jobs,
      },
      projectedJobs: jobs,
      placementDef: null,
      onPlaceBuilding: () => {},
      onInspectBuilding: () => {},
      onInspectClearingChunk: () => {},
    })
  );

  assert.ok(mapHtml.includes('data-testid="building-tarp-b_place_5e1c"'));
  assert.ok(mapHtml.includes('data-testid="clearing-tarp-8-0"'));
  assert.ok(!mapHtml.includes('data-testid="building-tarp-b_done_5e1c"'));
  assert.ok(!mapHtml.includes('data-testid="building-tarp-b_up_5e1c"'));
  assert.ok(mapHtml.includes('data-testid="building-upgrade-scaffold-b_up_5e1c"'));
  assert.ok(!mapHtml.includes('fq-construction-tarp'));
  assert.ok(!mapHtml.includes('bg-amber-950/35'));
  assert.ok(!mapHtml.includes('bg-sky-950/15'));
  assert.ok(mapHtml.includes('30:00'));
  assert.ok(mapHtml.includes('Lv.2 · 03:00'));
});


