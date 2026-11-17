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
  STONE_AGE_VILLAGER_SPRITES,
} from '../../src/ui/components/FocusSceneArea.tsx';
import { I18nProvider } from '../../src/i18n/I18nContext.tsx';
import { EN_MESSAGES } from '../../src/i18n/locales/en.ts';
import { VI_MESSAGES } from '../../src/i18n/locales/vi.ts';

function renderScene(
  sceneState: FocusSceneState,
  options: {
    locale?: 'en' | 'vi';
    reducedMotion?: boolean;
    era?: string;
    chimeEnabled?: boolean;
  } = {}
): string {
  const { locale = 'en', reducedMotion = false, era = 'STONE_AGE', chimeEnabled = true } = options;
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
      })
    )
  );
}

test('FocusSceneArea (4b): renders distinct animated Stone Age villager & campsite states for working, paused, and resting', () => {
  const workingHtml = renderScene('working');
  assert.ok(workingHtml.includes('data-scene-state="working"'));
  assert.ok(workingHtml.includes('data-testid="scene-villager-elder"'));
  assert.ok(workingHtml.includes('data-testid="scene-villager-crafter"'));
  assert.ok(workingHtml.includes('data-testid="scene-villager-woodworker"'));
  assert.ok(workingHtml.includes('data-testid="scene-tool-crafter"'), 'Working crafter holds hammer tool');
  assert.ok(workingHtml.includes('data-testid="scene-tool-woodworker"'), 'Working woodworker holds axe tool');
  assert.ok(workingHtml.includes('fq-scene-villager-work'));
  assert.ok(workingHtml.includes('fq-scene-tool-swing'));
  assert.ok(workingHtml.includes('fq-scene-flame'));
  assert.ok(workingHtml.includes('fq-scene-spark'));
  assert.ok(!workingHtml.includes('data-testid="scene-rest-zzz"'));

  const pausedHtml = renderScene('paused');
  assert.ok(pausedHtml.includes('data-scene-state="paused"'));
  assert.ok(pausedHtml.includes('data-testid="scene-villager-elder"'));
  assert.ok(!pausedHtml.includes('fq-scene-villager-work'), 'Paused state must stop work animation');
  assert.ok(!pausedHtml.includes('fq-scene-villager-rest'), 'Paused state must not run rest animation');
  assert.ok(!pausedHtml.includes('fq-scene-flame'), 'Paused campfire must not flicker');
  assert.ok(!pausedHtml.includes('fq-scene-spark'), 'Paused campfire must not emit sparks');
  assert.ok(!pausedHtml.includes('data-testid="scene-tool-crafter"'));
  assert.ok(!pausedHtml.includes('data-testid="scene-rest-zzz"'));

  const restingHtml = renderScene('resting');
  assert.ok(restingHtml.includes('data-scene-state="resting"'));
  assert.ok(restingHtml.includes('fq-scene-villager-rest'));
  assert.ok(restingHtml.includes('fq-scene-glow-rest'));
  assert.ok(restingHtml.includes('fq-scene-zzz'));
  assert.ok(restingHtml.includes('data-testid="scene-rest-zzz"'));
  assert.ok(restingHtml.includes('fq-scene-star'));
  assert.ok(!restingHtml.includes('fq-scene-villager-work'));
  assert.ok(!restingHtml.includes('fq-scene-spark'));
  assert.ok(!restingHtml.includes('data-testid="scene-tool-crafter"'));
});

test('FocusSceneArea (4b): uses only CC0 Tiny Dungeon villagers, Tiny Town terrain props, and PixelSprite Stone Age structures', () => {
  const html = renderScene('working');

  // CC0 Kenney Tiny Dungeon characters (86, 88, 100) + tools (117, 119)
  assert.ok(html.includes('/assets/sprites/kenney-tiny-dungeon/tilemap_packed.png'));
  assert.ok(html.includes('data-tile-pack="tiny-dungeon"'));
  assert.ok(html.includes('data-tile-index="100"'));
  assert.ok(html.includes('data-tile-index="88"'));
  assert.ok(html.includes('data-tile-index="86"'));
  assert.ok(html.includes('data-tile-index="117"'));
  assert.ok(html.includes('data-tile-index="119"'));

  // CC0 Kenney Tiny Town trees & props + Stone Age PixelSprites
  assert.ok(html.includes('/assets/sprites/kenney-tiny-town/tilemap_packed.png'));
  assert.ok(html.includes('data-sprite-id="stone_age_study_cave"'));
  assert.ok(html.includes('data-sprite-id="stone_age_campfire"'));

  // Pixel crispness preserved
  assert.ok(html.includes('image-rendering:pixelated'));
  assert.ok(html.includes('shape-rendering="crispEdges"'));

  // Purely decorative: never displays or promises rewards
  assert.ok(!html.includes('Coin'));
  assert.ok(!html.includes('XP'));
  assert.ok(!html.includes('Bonus'));
});

test('FocusSceneArea (4b): renders localized EN and VI aria-labels and preserves region/chip/chime accessibility', () => {
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
    assert.ok(!viHtml.includes('Quest'), 'VI scene aria-label must not leak Quest text');
  }
});

test('FocusSceneArea (4b): supports prefers-reduced-motion via both static reducedMotion frame and CSS @media rule', () => {
  const staticWorking = renderScene('working', { reducedMotion: true });
  assert.ok(staticWorking.includes('data-reduced-motion="true"'));
  assert.ok(!staticWorking.includes('fq-scene-villager-work'));
  assert.ok(!staticWorking.includes('fq-scene-tool-swing'));
  assert.ok(!staticWorking.includes('fq-scene-flame'));
  assert.ok(!staticWorking.includes('fq-scene-spark'));
  assert.ok(!staticWorking.includes('fq-scene-cloud'));
  assert.ok(staticWorking.includes('data-testid="scene-villager-elder"'));
  assert.ok(staticWorking.includes('data-testid="scene-campfire"'));

  const staticResting = renderScene('resting', { reducedMotion: true });
  assert.ok(!staticResting.includes('fq-scene-villager-rest'));
  assert.ok(!staticResting.includes('fq-scene-zzz'));
  assert.ok(!staticResting.includes('fq-scene-star'));

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
    '.fq-scene-star',
  ]) {
    const mediaIdx = cssContent.indexOf('@media (prefers-reduced-motion: reduce)');
    const ruleIdx = cssContent.indexOf(cls, mediaIdx);
    assert.ok(ruleIdx > mediaIdx, `Reduced-motion media query must disable ${cls}`);
  }
});

test('FocusSceneArea (4b): is completely deterministic (no Math.random) and keeps 100% full-bleed SVG backdrop', () => {
  const componentPath = path.resolve(
    import.meta.dirname,
    '../../src/ui/components/FocusSceneArea.tsx'
  );
  const source = fs.readFileSync(componentPath, 'utf8');
  assert.ok(!source.includes('Math.random'), 'FocusSceneArea must never call Math.random()');

  // Verify deterministic config constants
  assert.equal(STONE_AGE_VILLAGER_SPRITES.length, 3);
  for (const villager of STONE_AGE_VILLAGER_SPRITES) {
    assert.ok(Number.isFinite(villager.animDelaySec));
    for (const state of ['working', 'paused', 'resting'] as const) {
      assert.ok(Number.isFinite(villager.positions[state].leftPx));
      assert.ok(Number.isFinite(villager.positions[state].bottomPx));
    }
  }
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
