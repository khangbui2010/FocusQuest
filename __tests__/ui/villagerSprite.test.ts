import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToString } from 'react-dom/server';

import {
  VILLAGER_CELL_PX,
  VILLAGER_SHEET_COLUMNS,
  VILLAGER_ROLES,
  VILLAGER_ANIMATIONS,
  isVillagerRole,
  getVillagerSheetUrl,
  getVillagerAnimation,
  getVillagerAnimationForDirection,
  VillagerSprite,
} from '../../src/ui/components/civilization/spriteRegistry.ts';
import { SpriteGallery } from '../../src/ui/components/civilization/SpriteGallery.tsx';

test('Villager Registry (V1): constants, roles, and animation configurations match spec', () => {
  assert.equal(VILLAGER_CELL_PX, 16);
  assert.equal(VILLAGER_SHEET_COLUMNS, 4);
  assert.deepEqual(VILLAGER_ROLES, ['elder', 'crafter', 'woodworker']);

  // Check all 4 animations
  const idle = getVillagerAnimation('idle');
  assert.equal(idle.row, 0);
  assert.equal(idle.frames, 2);
  assert.equal(idle.frameMs, 600);
  assert.equal(idle.durationMs, 1200);

  const walkDown = getVillagerAnimation('walk_down');
  assert.equal(walkDown.row, 1);
  assert.equal(walkDown.frames, 4);
  assert.equal(walkDown.frameMs, 150);
  assert.equal(walkDown.durationMs, 600);

  const walkRight = getVillagerAnimation('walk_right');
  assert.equal(walkRight.row, 2);
  assert.equal(walkRight.frames, 4);
  assert.equal(walkRight.frameMs, 150);
  assert.equal(walkRight.durationMs, 600);

  const walkLeft = getVillagerAnimation('walk_left');
  assert.equal(walkLeft.row, 3);
  assert.equal(walkLeft.frames, 4);
  assert.equal(walkLeft.frameMs, 150);
  assert.equal(walkLeft.durationMs, 600);
});

test('Villager Registry (V1): role checking and sheet URL generation', () => {
  for (const role of VILLAGER_ROLES) {
    assert.equal(isVillagerRole(role), true);
    assert.equal(getVillagerSheetUrl(role), `/assets/sprites/villagers/${role}.png`);
  }

  assert.equal(isVillagerRole('warrior'), false);
  assert.equal(isVillagerRole(''), false);
  assert.equal(isVillagerRole(null), false);
  assert.equal(getVillagerSheetUrl('unknown'), null);
});

test('Villager Direction Mapping (V1): strict mapping with up -> idle fallback', () => {
  // Not moving -> always idle
  assert.equal(getVillagerAnimationForDirection('down', false), 'idle');
  assert.equal(getVillagerAnimationForDirection('right', false), 'idle');
  assert.equal(getVillagerAnimationForDirection('left', false), 'idle');
  assert.equal(getVillagerAnimationForDirection('up', false), 'idle');

  // Moving down, right, left -> walk_*
  assert.equal(getVillagerAnimationForDirection('down', true), 'walk_down');
  assert.equal(getVillagerAnimationForDirection('right', true), 'walk_right');
  assert.equal(getVillagerAnimationForDirection('left', true), 'walk_left');

  // Strict constraint: no walk_up animation exists in native Tiny Dungeon asset
  assert.equal(
    getVillagerAnimationForDirection('up', true),
    'idle',
    'Direction "up" must fall back to "idle" since no walk_up frames exist'
  );
});

test('VillagerSprite SSR (V1): renders correct CSS variables, dimensions, steps, and attributes', () => {
  // Default scale 2 (32px, sheet 128px)
  const idleHtml = renderToString(
    React.createElement(VillagerSprite, {
      role: 'elder',
      animation: 'idle',
      ariaLabel: 'Tribal Elder',
    })
  );

  assert.ok(idleHtml.includes('width:32px'), 'Must set width 32px at scale 2');
  assert.ok(idleHtml.includes('height:32px'), 'Must set height 32px at scale 2');
  assert.ok(
    idleHtml.includes('background-size:128px 128px'),
    'Sheet size must be 128px 128px at scale 2'
  );
  assert.ok(
    idleHtml.includes('url(&#x27;/assets/sprites/villagers/elder.png&#x27;)'),
    'Must reference elder sprite sheet'
  );
  assert.ok(idleHtml.includes('image-rendering:pixelated'));
  assert.ok(idleHtml.includes('pointer-events:none'));
  assert.ok(idleHtml.includes('data-villager-role="elder"'));
  assert.ok(idleHtml.includes('data-villager-animation="idle"'));
  assert.ok(idleHtml.includes('data-testid="villager-sprite-elder"'));
  assert.ok(idleHtml.includes('fq-villager-anim-2'));
  assert.ok(idleHtml.includes('steps(2)'));
  assert.ok(idleHtml.includes('--villager-end-x:-64px'));
  assert.ok(idleHtml.includes('--villager-duration:1200ms'));

  // Scale 4 (64px) walk_left (row 3)
  const walkHtml = renderToString(
    React.createElement(VillagerSprite, {
      role: 'crafter',
      animation: 'walk_left',
      scale: 4,
    })
  );

  assert.ok(walkHtml.includes('width:64px'));
  assert.ok(walkHtml.includes('height:64px'));
  assert.ok(walkHtml.includes('background-size:256px 256px'));
  // row 3 at scale 4: 3 * 64 = 192px
  assert.ok(walkHtml.includes('background-position:0px -192px'));
  assert.ok(walkHtml.includes('fq-villager-anim-4'));
  assert.ok(walkHtml.includes('steps(4)'));
  assert.ok(walkHtml.includes('--villager-end-x:-256px'));
  assert.ok(walkHtml.includes('--villager-duration:600ms'));

  // Reduced motion
  const reducedMotionHtml = renderToString(
    React.createElement(VillagerSprite, {
      role: 'woodworker',
      animation: 'walk_down',
      reducedMotion: true,
    })
  );
  assert.ok(reducedMotionHtml.includes('animation:none'));
  assert.ok(!reducedMotionHtml.includes('fq-villager-anim-4'));
});

test('Villager PNG Assets (V1): all 3 role sheets exist as valid 64x64 RGBA PNGs', () => {
  const spriteDir = path.resolve(process.cwd(), 'public/assets/sprites/villagers');
  assert.ok(fs.existsSync(spriteDir), 'Villagers asset directory must exist');

  for (const role of VILLAGER_ROLES) {
    const filePath = path.join(spriteDir, `${role}.png`);
    assert.ok(fs.existsSync(filePath), `Sprite sheet ${role}.png must exist`);

    const buf = fs.readFileSync(filePath);
    // PNG signature: 89 50 4E 47 0D 0A 1A 0A
    assert.equal(buf[0], 0x89);
    assert.equal(buf[1], 0x50);
    assert.equal(buf[2], 0x4e);
    assert.equal(buf[3], 0x47);

    // IHDR starts at offset 12
    const ihdrType = buf.toString('ascii', 12, 16);
    assert.equal(ihdrType, 'IHDR');

    const width = buf.readUInt32BE(16);
    const height = buf.readUInt32BE(20);
    const bitDepth = buf[24];
    const colorType = buf[25];

    assert.equal(width, 64, `${role}.png width must be 64px`);
    assert.equal(height, 64, `${role}.png height must be 64px`);
    assert.equal(bitDepth, 8, `${role}.png bit depth must be 8`);
    assert.equal(colorType, 6, `${role}.png color type must be RGBA (6)`);
  }
});

test('SpriteGallery SSR (V1): renders Section 5 showcasing all 3 villager roles across all animations', () => {
  const html = renderToString(React.createElement(SpriteGallery));
  assert.ok(html.includes('data-testid="gallery-villagers-section"'));
  assert.ok(html.includes('data-testid="gallery-villager-card-elder"'));
  assert.ok(html.includes('data-testid="gallery-villager-card-crafter"'));
  assert.ok(html.includes('data-testid="gallery-villager-card-woodworker"'));
  assert.ok(html.includes('walk_down'));
  assert.ok(html.includes('walk_right'));
  assert.ok(html.includes('walk_left'));
});
