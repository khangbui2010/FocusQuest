import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToString } from 'react-dom/server';
import {
  FocusSceneArea,
  FocusSceneState,
  STONE_AGE_SPARK_OFFSETS,
} from '../../src/ui/components/FocusSceneArea.tsx';
import { CivilizationState } from '../../src/core/civilization/civilizationState.ts';
import { I18nProvider } from '../../src/i18n/I18nContext.tsx';
import { EN_MESSAGES } from '../../src/i18n/locales/en.ts';
import { VI_MESSAGES } from '../../src/i18n/locales/vi.ts';

const POPULATED_CAMP: Partial<CivilizationState> = {
  era: 'STONE_AGE',
  buildings: [
    { id: 'b-cave', definitionId: 'stone_age_study_cave', position: { x: 1, y: 1 }, level: 2, placedAt: 10 },
    { id: 'b-fire', definitionId: 'stone_age_campfire', position: { x: 4, y: 4 }, level: 1, placedAt: 20 },
    { id: 'b-post-1', definitionId: 'stone_age_foraging_post', position: { x: 0, y: 5 }, level: 1, placedAt: 30 },
    { id: 'b-post-2', definitionId: 'stone_age_foraging_post', position: { x: 2, y: 5 }, level: 1, placedAt: 40 },
  ],
  villagers: [
    { id: 'elder-1', role: 'elder', recruitedAt: 100 },
    { id: 'crafter-1', role: 'crafter', recruitedAt: 200 },
    { id: 'wood-1', role: 'woodworker', recruitedAt: 300 },
  ],
};

function renderScene(
  sceneState: FocusSceneState,
  options: {
    locale?: 'en' | 'vi';
    reducedMotion?: boolean;
    era?: string;
    chimeEnabled?: boolean;
    civilizationState?: Partial<CivilizationState> | null;
  } = {}
): string {
  const {
    locale = 'en',
    reducedMotion = false,
    era = 'STONE_AGE',
    chimeEnabled = true,
    civilizationState = POPULATED_CAMP,
  } = options;
  const statusLabel =
    sceneState === 'paused' ? 'PAUSED' : sceneState === 'resting' ? 'BREAK' : 'FOCUSING';

  return renderToString(
    React.createElement(
      I18nProvider,
      { locale },
      React.createElement(FocusSceneArea, {
        era,
        sceneState,
        statusLabel,
        chimeEnabled,
        onToggleChime: () => {},
        chimeAriaLabel: chimeEnabled ? 'Mute phase transition chime' : 'Enable phase transition chime',
        chimeTitle: chimeEnabled ? 'Phase chime enabled' : 'Phase chime muted',
        reducedMotion,
        civilizationState,
      })
    )
  );
}

test('FocusSceneArea (V4): empty camp shows sky, hills, clearing & localized EN/VI hint with zero buildings or villagers', () => {
  for (const [locale, expectedHint, expectedAria] of [
    ['en', EN_MESSAGES['timer.scene.emptyHint'], EN_MESSAGES['timer.scene.ariaEmpty']],
    ['vi', VI_MESSAGES['timer.scene.emptyHint'], VI_MESSAGES['timer.scene.ariaEmpty']],
  ] as const) {
    const html = renderScene('working', { locale, civilizationState: null });
    assert.ok(html.includes('data-scene-empty="true"'));
    assert.ok(html.includes(`aria-label="${expectedAria}"`));
    assert.ok(html.includes('data-testid="scene-empty-hint"'));
    assert.ok(html.includes(expectedHint));
    assert.equal(html.includes('data-testid="scene-building-'), false);
    assert.equal(html.includes('data-testid="scene-villager-'), false);
    assert.equal(html.includes('fq-scene-spark'), false);
    assert.equal(html.includes('data-testid="scene-rest-zzz"'), false);
    assert.ok(html.includes('viewBox="0 0 360 220"'));
  }
});

test('FocusSceneArea (V4): renders ONLY built buildings (1 per definitionId) and recruited VillagerSprite states for working, paused, and resting', () => {
  const workingHtml = renderScene('working');
  assert.ok(workingHtml.includes('data-scene-state="working"'));
  assert.ok(workingHtml.includes('data-scene-empty="false"'));
  assert.equal(workingHtml.includes('data-testid="scene-empty-hint"'), false);

  // Built buildings appear once; unbuilt buildings absent
  assert.ok(workingHtml.includes('data-testid="scene-building-stone_age_study_cave"'));
  assert.ok(workingHtml.includes('data-testid="scene-building-stone_age_campfire"'));
  assert.ok(workingHtml.includes('data-testid="scene-building-stone_age_foraging_post"'));
  assert.equal(
    workingHtml.match(/data-testid="scene-building-stone_age_foraging_post"/g)?.length,
    1,
    'Repeated foraging posts must render strictly 1 scene sprite'
  );
  assert.equal(workingHtml.includes('data-testid="scene-building-stone_age_totem"'), false);
  assert.equal(workingHtml.includes('data-testid="scene-building-stone_age_elder_hut"'), false);
  assert.equal(workingHtml.includes('data-testid="scene-building-stone_age_food_cache"'), false);

  // Recruited villagers use V1 VillagerSprite sheets + working tools (#117/#119) + campfire flame/sparks
  assert.ok(workingHtml.includes('data-testid="scene-villager-elder-1"'));
  assert.ok(workingHtml.includes('data-testid="scene-villager-crafter-1"'));
  assert.ok(workingHtml.includes('data-testid="scene-villager-wood-1"'));
  assert.ok(workingHtml.includes('/assets/sprites/villagers/elder.png'));
  assert.ok(workingHtml.includes('/assets/sprites/villagers/crafter.png'));
  assert.ok(workingHtml.includes('/assets/sprites/villagers/woodworker.png'));
  assert.ok(workingHtml.includes('data-testid="scene-tool-crafter-1"'));
  assert.ok(workingHtml.includes('data-testid="scene-tool-wood-1"'));
  assert.equal(workingHtml.includes('data-testid="scene-tool-elder-1"'), false);
  assert.ok(workingHtml.includes('/assets/sprites/era/tool_skins_16.png'));
  assert.ok(workingHtml.includes('data-tool-kind="hammer"'));
  assert.ok(workingHtml.includes('data-tool-kind="axe"'));
  assert.ok(workingHtml.includes('data-tool-skin-row="0"'));
  assert.ok(workingHtml.includes('data-tool-skin-col="3"'));
  assert.ok(workingHtml.includes('data-tool-skin-col="0"'));
  assert.ok(workingHtml.includes('fq-scene-tool-swing'));
  assert.ok(workingHtml.includes('fq-scene-flame'));
  assert.ok(workingHtml.includes('fq-scene-spark'));
  assert.equal(workingHtml.includes('data-testid="scene-rest-zzz"'), false);

  // Without campfire: zero flame & zero sparks
  const noFireHtml = renderScene('working', {
    civilizationState: {
      era: 'STONE_AGE',
      buildings: [
        { id: 'b-cave', definitionId: 'stone_age_study_cave', position: { x: 1, y: 1 }, level: 1, placedAt: 10 },
      ],
      villagers: [{ id: 'crafter-1', role: 'crafter', recruitedAt: 100 }],
    },
  });
  assert.equal(noFireHtml.includes('data-testid="scene-building-stone_age_campfire"'), false);
  assert.equal(noFireHtml.includes('fq-scene-flame'), false);
  assert.equal(noFireHtml.includes('fq-scene-spark'), false);
  assert.ok(noFireHtml.includes('data-testid="scene-tool-crafter-1"'));

  // Paused: dimmed, idle, no moving/tools/flame/sparks/zZ
  const pausedHtml = renderScene('paused');
  assert.ok(pausedHtml.includes('data-scene-state="paused"'));
  assert.ok(pausedHtml.includes('data-testid="scene-villager-elder-1"'));
  assert.ok(pausedHtml.includes('opacity-80'));
  assert.equal(pausedHtml.includes('data-villager-moving="true"'), false);
  assert.equal(pausedHtml.includes('fq-scene-flame'), false);
  assert.equal(pausedHtml.includes('fq-scene-spark'), false);
  assert.equal(pausedHtml.includes('data-testid="scene-tool-crafter-1"'), false);
  assert.equal(pausedHtml.includes('data-testid="scene-rest-zzz"'), false);

  // Resting: break state shows elder zZ & sunset sky without dark-theme sky or tools
  const restingHtml = renderScene('resting');
  assert.ok(restingHtml.includes('data-scene-state="resting"'));
  assert.ok(restingHtml.includes('fq-scene-glow-rest'));
  assert.ok(restingHtml.includes('fq-scene-zzz'));
  assert.ok(restingHtml.includes('data-testid="scene-rest-zzz"'));
  assert.ok(restingHtml.includes('fq-scene-cloud'));
  assert.equal(restingHtml.includes('fq-scene-star'), false, 'LOFI-2 sunset sky must not render night stars');
  assert.equal(restingHtml.includes('dark:from-slate-900'), false, 'LOFI-2 sky must always stay daytime/sunset');
  assert.equal(restingHtml.includes('fq-scene-spark'), false);
  assert.equal(restingHtml.includes('data-testid="scene-tool-crafter-1"'), false);

  // Resting without an elder: zero zZ rendered
  const restingNoElder = renderScene('resting', {
    civilizationState: {
      era: 'STONE_AGE',
      buildings: [
        { id: 'b-fire', definitionId: 'stone_age_campfire', position: { x: 4, y: 4 }, level: 1, placedAt: 20 },
      ],
      villagers: [{ id: 'wood-1', role: 'woodworker', recruitedAt: 300 }],
    },
  });
  assert.equal(restingNoElder.includes('data-testid="scene-rest-zzz"'), false);
});

test('FocusSceneArea (V4): caps rendered villagers at 6 when village has more than 6 recruited', () => {
  const manyVillagers = Array.from({ length: 10 }, (_, idx) => ({
    id: `vil-${String(idx + 1).padStart(2, '0')}`,
    role: (['elder', 'crafter', 'woodworker'] as const)[idx % 3],
    recruitedAt: (idx + 1) * 100,
  }));

  const html = renderScene('working', {
    civilizationState: {
      era: 'STONE_AGE',
      buildings: [
        { id: 'b-cave', definitionId: 'stone_age_study_cave', position: { x: 1, y: 1 }, level: 5, placedAt: 10 },
      ],
      villagers: manyVillagers,
    },
  });

  const matches = html.match(/data-testid="scene-villager-vil-/g);
  assert.equal(matches?.length, 6, 'FocusSceneArea must display at most 6 villagers');
});

test('FocusSceneArea (V4): renders localized EN and VI aria-labels and preserves region/chip/chime accessibility', () => {
  for (const [state, key] of [
    ['working', 'timer.scene.ariaWorking'],
    ['paused', 'timer.scene.ariaPaused'],
    ['resting', 'timer.scene.ariaResting'],
  ] as const) {
    const enHtml = renderScene(state, { locale: 'en' });
    assert.ok(enHtml.includes('role="region"'));
    assert.ok(enHtml.includes(`aria-label="${EN_MESSAGES[key]}"`));
    assert.ok(enHtml.includes('data-testid="focus-scene-status-chip"'));
    assert.ok(enHtml.includes('data-testid="chime-toggle-btn"'));

    const viHtml = renderScene(state, { locale: 'vi' });
    assert.ok(viHtml.includes(`aria-label="${VI_MESSAGES[key]}"`));
    assert.equal(viHtml.includes('Quest'), false, 'VI scene aria-label must not leak Quest text');
  }
});

test('FocusSceneArea (V4): supports prefers-reduced-motion via both static reducedMotion frame and CSS @media rule', () => {
  const staticWorking = renderScene('working', { reducedMotion: true });
  assert.ok(staticWorking.includes('data-reduced-motion="true"'));
  assert.equal(staticWorking.includes('fq-villager-anim-'), false);
  assert.equal(staticWorking.includes('fq-scene-tool-swing'), false);
  assert.equal(staticWorking.includes('fq-scene-flame'), false);
  assert.equal(staticWorking.includes('fq-scene-spark'), false);
  assert.equal(staticWorking.includes('fq-scene-cloud'), false);
  assert.equal(staticWorking.includes('transition:left'), false);
  assert.ok(staticWorking.includes('data-testid="scene-villager-elder-1"'));
  assert.ok(staticWorking.includes('data-testid="scene-building-stone_age_campfire"'));

  const staticResting = renderScene('resting', { reducedMotion: true });
  assert.equal(staticResting.includes('fq-scene-zzz'), false);
  assert.equal(staticResting.includes('fq-scene-cloud'), false);

  const cssPath = path.resolve(import.meta.dirname, '../../src/index.css');
  const cssContent = fs.readFileSync(cssPath, 'utf8');
  assert.ok(
    cssContent.includes('@media (prefers-reduced-motion: reduce)'),
    'src/index.css must declare prefers-reduced-motion media query'
  );
  for (const cls of [
    '.fq-scene-villager-work',
    '.fq-scene-villager-rest',
    '.fq-scene-tool-swing',
    '.fq-scene-flame',
    '.fq-scene-glow-work',
    '.fq-scene-glow-rest',
    '.fq-scene-spark',
    '.fq-scene-zzz',
    '.fq-scene-cloud',
    '.fq-music-eq-bar',
    '.fq-villager-anim-2',
    '.fq-villager-anim-4',
    '.fq-scene-villager-mover',
  ]) {
    const mediaIdx = cssContent.indexOf('@media (prefers-reduced-motion: reduce)');
    const ruleIdx = cssContent.indexOf(cls, mediaIdx);
    assert.ok(ruleIdx > mediaIdx, `Reduced-motion media query must disable ${cls}`);
  }
});

test('FocusSceneArea (V4): is completely deterministic (no Math.random/Date.now) and keeps 100% full-bleed SVG backdrop', () => {
  const componentPath = path.resolve(
    import.meta.dirname,
    '../../src/ui/components/FocusSceneArea.tsx'
  );
  const source = fs.readFileSync(componentPath, 'utf8');
  assert.equal(source.includes('Math.random'), false, 'FocusSceneArea must never call Math.random()');
  assert.equal(source.includes('Date.now'), false, 'FocusSceneArea must never call Date.now()');

  assert.equal(STONE_AGE_SPARK_OFFSETS.length, 3);
  for (const spark of STONE_AGE_SPARK_OFFSETS) {
    assert.ok(Number.isFinite(spark.leftPx));
    assert.ok(Number.isFinite(spark.delaySec));
  }

  for (const state of ['working', 'paused', 'resting'] as const) {
    const html = renderScene(state);
    assert.ok(html.includes('viewBox="0 0 360 220"'));
    assert.ok(html.includes('preserveAspectRatio="xMidYMax slice"'));
    assert.ok(html.includes('absolute inset-0 w-full h-full block pointer-events-none'));
    assert.ok(html.includes('L360 220 L0 220 Z'));
  }
});
