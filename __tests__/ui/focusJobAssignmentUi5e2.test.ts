import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { I18nProvider } from '../../src/i18n/I18nContext.tsx';
import { EN_MESSAGES } from '../../src/i18n/locales/en.ts';
import { VI_MESSAGES } from '../../src/i18n/locales/vi.ts';
import { createInitialCivilizationState } from '../../src/core/civilization/civilizationState.ts';
import { ConstructionJob } from '../../src/core/civilization/jobs.ts';
import { FocusProfile } from '../../src/types/profiles.ts';
import { SessionSnapshot } from '../../src/types/session.ts';
import { FocusJobAssignmentCard } from '../../src/ui/components/FocusJobAssignmentCard.tsx';
import { FocusSceneArea } from '../../src/ui/components/FocusSceneArea.tsx';
import { TimerView } from '../../src/ui/components/TimerView.tsx';
import {
  buildWorkSubSceneModels,
  getWorkSceneGridClass,
} from '../../src/ui/utils/focusWorkSceneModel.ts';

function makeProfile(): FocusProfile {
  return {
    id: 'prof-5e2',
    name: 'Deep Work',
    allowedDomains: ['github.com'],
    isDefault: true,
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
  };
}

function makeSession(overrides: Partial<SessionSnapshot> = {}): SessionSnapshot {
  return {
    id: 'sess-5e2',
    mode: 'COUNTDOWN',
    status: 'RUNNING',
    targetMinutes: 60,
    startedAt: 1700000000000,
    currentPauseStartedAt: null,
    totalPauseMs: 0,
    pauseCount: 0,
    pauseHistory: [],
    lastHeartbeatAt: 1700000000000,
    completedAt: null,
    rewardProcessed: false,
    lockedMultiplier: 1.4,
    profileId: 'prof-5e2',
    ...overrides,
  };
}

function renderWithLocale(locale: 'en' | 'vi', element: React.ReactElement): string {
  return renderToString(React.createElement(I18nProvider, { locale }, element));
}

function makeSampleJobs(): ConstructionJob[] {
  return [
    {
      id: 'j_place_cave',
      kind: 'place',
      status: 'ACTIVE',
      definitionId: 'stone_age_study_cave',
      buildingId: 'b_cave',
      crewRequired: 1,
      totalSeconds: 3600,
      remainingSeconds: 1800,
      paidCoins: 12,
      createdAt: 100,
    },
    {
      id: 'j_expand_east',
      kind: 'expand',
      status: 'ACTIVE',
      origin: { x: 8, y: 0 },
      purchaseIndex: 1,
      crewRequired: 2,
      totalSeconds: 3600,
      remainingSeconds: 2400,
      paidCoins: 30,
      createdAt: 200,
    },
    {
      id: 'j_upgrade_2',
      kind: 'upgrade',
      status: 'PENDING',
      definitionId: 'stone_age_foraging_post',
      buildingId: 'b_forage',
      targetLevel: 2,
      crewRequired: 1,
      totalSeconds: 300,
      remainingSeconds: 300,
      paidCoins: 24,
      createdAt: 300,
    },
    {
      id: 'j_upgrade_3',
      kind: 'upgrade',
      status: 'PENDING',
      definitionId: 'stone_age_foraging_post',
      buildingId: 'b_forage',
      targetLevel: 3,
      crewRequired: 2,
      totalSeconds: 600,
      remainingSeconds: 600,
      paidCoins: 38,
      createdAt: 400,
    },
    {
      id: 'j_place_totem',
      kind: 'place',
      status: 'PENDING',
      definitionId: 'stone_age_totem',
      buildingId: 'b_totem',
      crewRequired: 1,
      totalSeconds: 3600,
      remainingSeconds: 3600,
      paidCoins: 8,
      createdAt: 500,
    },
  ];
}

test('5E-2 UI Pre-Session: TimerView IDLE renders Giao việc card in EN/VI with Map CTA when empty and locks/hides during active session', () => {
  const baseCiv = createInitialCivilizationState();
  const emptyProps = {
    session: null,
    activeProfile: makeProfile(),
    era: 'STONE_AGE' as const,
    activeBonusRate: 0,
    isBonusLoading: false,
    civilizationState: { ...baseCiv, founderRole: 'crafter' as const, jobs: [] },
    onStartSession: async () => {},
    onPauseSession: async () => {},
    onResumeSession: async () => {},
    onGiveUpSession: async () => {},
    onFinishStopwatch: async () => {},
    onResetSession: async () => {},
    onRefreshSession: async () => {},
    isLoading: false,
    onOpenProfiles: () => {},
    onNavigateToMap: () => {},
    chimeEnabled: true,
    onToggleChime: async () => {},
  };

  const emptyEn = renderWithLocale('en', React.createElement(TimerView, emptyProps));
  const emptyVi = renderWithLocale('vi', React.createElement(TimerView, emptyProps));

  assert.ok(emptyEn.includes('data-testid="focus-job-assignment-card"'));
  assert.ok(emptyEn.includes('data-testid="job-assign-empty"'));
  assert.ok(emptyEn.includes(EN_MESSAGES['timer.jobs.goToMapBtn']));
  assert.ok(emptyVi.includes(VI_MESSAGES['timer.jobs.title']));
  assert.ok(emptyVi.includes(VI_MESSAGES['timer.jobs.goToMapBtn']));

  // With queued jobs & Manual mode OFF Auto -> sequential lock, crew lock, villager strip, and auto-continue row render cleanly
  const jobs = makeSampleJobs();
  const manualHtmlEn = renderWithLocale(
    'en',
    React.createElement(FocusJobAssignmentCard, {
      civilizationState: {
        ...baseCiv,
        founderRole: 'woodworker',
        villagers: [
          { id: 'v1', role: 'crafter', recruitedAt: 10 },
          { id: 'v2', role: 'elder', recruitedAt: 20 },
        ], // 3 crew total
        jobs,
      },
      autoMode: false,
      selectedJobIds: ['j_expand_east', 'j_place_cave'], // uses 2 + 1 = 3 crew (0 free)
      autoContinue: true,
      onToggleAutoMode: () => {},
      onToggleJob: () => {},
      onToggleAutoContinue: () => {},
    })
  );

  assert.ok(manualHtmlEn.includes('data-testid="job-assign-villager-founder_villager"'));
  assert.ok(manualHtmlEn.includes('data-testid="job-assign-villager-v1"'));
  assert.ok(manualHtmlEn.includes('data-testid="job-assign-auto-continue-row"'));
  assert.ok(manualHtmlEn.includes('3/3 crew'));
  assert.ok(manualHtmlEn.includes('Free: 0'));
  // Sequential upgrade j_upgrade_3 locked until Lv.2
  assert.match(manualHtmlEn, /data-testid="job-assign-item-j_upgrade_3"[^>]*data-locked="true"/);
  assert.ok(manualHtmlEn.includes('Wait Lv.2'));
  // Unselected j_place_totem locked by insufficient remaining crew
  assert.match(manualHtmlEn, /data-testid="job-assign-item-j_place_totem"[^>]*data-locked="true"/);
  assert.ok(manualHtmlEn.includes('Need 1 crew'));

  const manualHtmlVi = renderWithLocale(
    'vi',
    React.createElement(FocusJobAssignmentCard, {
      civilizationState: {
        ...baseCiv,
        founderRole: 'woodworker',
        villagers: [{ id: 'v1', role: 'crafter', recruitedAt: 10 }], // 2 crew
        jobs,
      },
      autoMode: false,
      selectedJobIds: ['j_place_cave'], // 1 crew used, 1 free
      autoContinue: false,
      onToggleAutoMode: () => {},
      onToggleJob: () => {},
      onToggleAutoContinue: () => {},
    })
  );
  assert.ok(manualHtmlVi.includes(VI_MESSAGES['timer.jobs.sequentialLock'].replace('{prev}', '2')));
  assert.ok(manualHtmlVi.includes(VI_MESSAGES['timer.jobs.needMoreCrew'].replace('{crew}', '2')));
  assert.ok(manualHtmlVi.includes(VI_MESSAGES['timer.jobs.autoContinueLabel']));

  // Active session hides pre-session job assignment card completely
  const activeHtml = renderWithLocale(
    'vi',
    React.createElement(TimerView, {
      ...emptyProps,
      session: makeSession({ status: 'RUNNING' }),
      civilizationState: { ...baseCiv, founderRole: 'crafter', jobs },
    })
  );
  assert.ok(!activeHtml.includes('data-testid="focus-job-assignment-card"'));
  assert.ok(activeHtml.includes('data-testid="focus-scene-area"'));
});

test('5E-2 UI FocusSceneArea: 0 jobs keeps single campsite SVG; 1..4 jobs render equal grid with distinct villagers & state-gated tools', () => {
  const baseCiv = createInitialCivilizationState();
  const villagers = [
    { id: 'v1', role: 'crafter' as const, recruitedAt: 10 },
    { id: 'v2', role: 'elder' as const, recruitedAt: 20 },
    { id: 'v3', role: 'woodworker' as const, recruitedAt: 30 },
    { id: 'v4', role: 'crafter' as const, recruitedAt: 40 },
    { id: 'v5', role: 'elder' as const, recruitedAt: 50 },
  ];

  // Grid class invariants
  assert.strictEqual(getWorkSceneGridClass(1), 'grid-cols-1 grid-rows-1');
  assert.strictEqual(getWorkSceneGridClass(2), 'grid-cols-2 grid-rows-1');
  assert.strictEqual(getWorkSceneGridClass(3), 'grid-cols-3 grid-rows-1');
  assert.strictEqual(getWorkSceneGridClass(4), 'grid-cols-2 grid-rows-2');

  // 0 active jobs -> preserves V4 campsite SVG
  const zeroHtml = renderWithLocale(
    'en',
    React.createElement(FocusSceneArea, {
      era: 'STONE_AGE',
      sceneState: 'working',
      statusLabel: 'FOCUSING',
      chimeEnabled: true,
      onToggleChime: () => {},
      chimeAriaLabel: 'Mute',
      chimeTitle: 'Sound',
      civilizationState: { ...baseCiv, founderRole: 'woodworker', villagers, jobs: [] },
      session: makeSession(),
    })
  );
  assert.ok(!zeroHtml.includes('data-testid="focus-work-grid"'));
  assert.ok(zeroHtml.includes('data-work-scenes="0"'));
  assert.ok(zeroHtml.includes('viewBox="0 0 360 220"'));

  // 4 concurrent active jobs (1+2+1+2 = 6 total villagers: founder + 5 recruited -> zero duplication!)
  const fourJobs: ConstructionJob[] = [
    {
      id: 'job_cave',
      kind: 'place',
      status: 'ACTIVE',
      definitionId: 'stone_age_study_cave',
      buildingId: 'b1',
      crewRequired: 1,
      totalSeconds: 3600,
      remainingSeconds: 1800,
      paidCoins: 12,
      createdAt: 10,
    },
    {
      id: 'job_expand',
      kind: 'expand',
      status: 'ACTIVE',
      origin: { x: 8, y: 0 },
      purchaseIndex: 1,
      crewRequired: 2,
      totalSeconds: 3600,
      remainingSeconds: 2400,
      paidCoins: 30,
      createdAt: 20,
    },
    {
      id: 'job_upgrade',
      kind: 'upgrade',
      status: 'ACTIVE',
      definitionId: 'stone_age_foraging_post',
      buildingId: 'b2',
      targetLevel: 2,
      crewRequired: 1,
      totalSeconds: 300,
      remainingSeconds: 300,
      paidCoins: 24,
      createdAt: 30,
    },
    {
      id: 'job_granary',
      kind: 'place',
      status: 'ACTIVE',
      definitionId: 'stone_age_food_cache',
      buildingId: 'b3',
      crewRequired: 2,
      totalSeconds: 7200,
      remainingSeconds: 7200,
      paidCoins: 30,
      createdAt: 40,
    },
  ];

  const bundle = buildWorkSubSceneModels(
    {
      ...baseCiv,
      founderRole: 'woodworker',
      villagers,
      jobs: fourJobs,
      buildings: [
        { id: 'b1', definitionId: 'stone_age_study_cave', position: { x: 0, y: 0 }, level: 1, placedAt: 1 },
        { id: 'b2', definitionId: 'stone_age_foraging_post', position: { x: 3, y: 0 }, level: 1, placedAt: 2 },
        { id: 'b3', definitionId: 'stone_age_food_cache', position: { x: 5, y: 0 }, level: 1, placedAt: 3 },
      ],
    },
    {
      session: makeSession({ status: 'RUNNING' }),
      liveFocusSeconds: 125, // 2m05s live tick!
    }
  );
  assert.strictEqual(bundle.activeSubScenes.length, 4);
  assert.strictEqual(bundle.idleVillagers.length, 0);
  // Check live projection deducted 125s from every active job
  assert.strictEqual(bundle.activeSubScenes[0].remainingSeconds, 1675);
  assert.strictEqual(bundle.activeSubScenes[1].remainingSeconds, 2275);
  assert.strictEqual(bundle.activeSubScenes[2].remainingSeconds, 175);
  assert.strictEqual(bundle.activeSubScenes[3].remainingSeconds, 7075);

  // Verify every assigned villager ID is unique across all 4 sub-scenes
  const allRenderedVillagerIds = bundle.activeSubScenes.flatMap((s) => s.villagers.map((v) => v.id));
  assert.strictEqual(allRenderedVillagerIds.length, 6);
  assert.strictEqual(new Set(allRenderedVillagerIds).size, 6);

  // Working state: animated tools (Pickaxe 115 for cave dig, Axe 127 for expand, Hammer 117 for upgrade & granary)
  const workingFourHtml = renderWithLocale(
    'en',
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
        villagers,
        jobs: fourJobs,
        buildings: [
          { id: 'b1', definitionId: 'stone_age_study_cave', position: { x: 0, y: 0 }, level: 1, placedAt: 1 },
          { id: 'b2', definitionId: 'stone_age_foraging_post', position: { x: 3, y: 0 }, level: 1, placedAt: 2 },
          { id: 'b3', definitionId: 'stone_age_food_cache', position: { x: 5, y: 0 }, level: 1, placedAt: 3 },
        ],
      },
      session: makeSession({ status: 'RUNNING' }),
      liveFocusSeconds: 125,
    })
  );

  assert.ok(workingFourHtml.includes('data-testid="focus-work-grid"'));
  assert.ok(workingFourHtml.includes('grid-cols-2 grid-rows-2'));
  assert.ok(workingFourHtml.includes('data-testid="focus-scene-status-chip"'));
  assert.ok(workingFourHtml.includes('data-testid="chime-toggle-btn"'));
  assert.ok(workingFourHtml.includes('data-tile-index="115"'), 'Rock Shelter uses Pickaxe #115');
  assert.ok(workingFourHtml.includes('data-tile-index="127"'), 'Land expansion uses Axe #127');
  assert.ok(workingFourHtml.includes('data-tile-index="117"'), 'Building place/upgrade uses Hammer #117');
  assert.ok(workingFourHtml.includes('data-tool-animated="true"'));
  assert.ok(workingFourHtml.includes('fq-tool-strike'));
  assert.ok(workingFourHtml.includes('fq-construction-scaffold'));
  assert.ok(workingFourHtml.includes('27:55'), 'Live 1s countdown renders 1675s as 27:55');
  assert.ok(workingFourHtml.includes('1:57:55'), 'Live 1s countdown renders 7075s as 1:57:55');

  // Verify each of the 6 distinct villager testids appears exactly once in rendered HTML
  for (const vid of ['founder_villager', 'v1', 'v2', 'v3', 'v4', 'v5']) {
    const matches = workingFourHtml.match(new RegExp(`data-testid="focus-work-villager-[^"]*-${vid}"`, 'g'));
    assert.strictEqual(matches?.length, 1, `Villager ${vid} must appear exactly once across work sub-scenes`);
  }

  // Paused, Resting (Pomodoro break), and Reduced Motion -> tools MUST stay static (no fq-tool-strike)
  for (const [state, reduced] of [
    ['paused', false],
    ['resting', false],
    ['working', true],
  ] as const) {
    const staticHtml = renderWithLocale(
      'vi',
      React.createElement(FocusSceneArea, {
        era: 'STONE_AGE',
        sceneState: state,
        statusLabel: state === 'paused' ? 'TẠM DỪNG' : 'NGHỈ NGƠI',
        chimeEnabled: true,
        onToggleChime: () => {},
        chimeAriaLabel: 'Tắt chuông',
        chimeTitle: 'Âm thanh',
        reducedMotion: reduced,
        civilizationState: {
          ...baseCiv,
          founderRole: 'woodworker',
          villagers,
          jobs: [fourJobs[0], fourJobs[1]],
        },
        session: makeSession({ status: state === 'paused' ? 'PAUSED' : 'RUNNING' }),
      })
    );
    assert.ok(staticHtml.includes('grid-cols-2 grid-rows-1'));
    assert.ok(!staticHtml.includes('fq-tool-strike'), `Tools must stand still on ${state} reduced=${reduced}`);
    assert.ok(!staticHtml.includes('data-tool-animated="true"'));
    assert.ok(staticHtml.includes('data-tool-animated="false"'));
  }

  // Static determinism check on focusWorkSceneModel.ts (FocusSceneArea.tsx checked in focusSceneArea.test.ts too)
  const modelSource = fs.readFileSync(
    path.resolve(import.meta.dirname, '../../src/ui/utils/focusWorkSceneModel.ts'),
    'utf8'
  );
  assert.strictEqual(modelSource.includes('Math.random'), false);
  assert.strictEqual(modelSource.includes('Date.now'), false);
});
