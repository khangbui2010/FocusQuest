import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LevelSystem } from '../../src/core/economy/levelSystem.ts';

test('LevelSystem calculates levels, current level XP and progress percentage accurately', () => {
  const system = new LevelSystem({ xpPerLevelBase: 100 });

  // 0 XP -> Level 1, 0%
  const l0 = system.calculateLevel(0);
  assert.strictEqual(l0.level, 1);
  assert.strictEqual(l0.currentLevelXP, 0);
  assert.strictEqual(l0.xpForNextLevel, 100);
  assert.strictEqual(l0.progressPercentage, 0);

  // 50 XP -> Level 1, 50%
  const l50 = system.calculateLevel(50);
  assert.strictEqual(l50.level, 1);
  assert.strictEqual(l50.currentLevelXP, 50);
  assert.strictEqual(l50.xpForNextLevel, 100);
  assert.strictEqual(l50.progressPercentage, 50);

  // 100 XP -> Reaches Level 2! (Step 2 requires 200 XP)
  const l100 = system.calculateLevel(100);
  assert.strictEqual(l100.level, 2);
  assert.strictEqual(l100.currentLevelXP, 0);
  assert.strictEqual(l100.xpForNextLevel, 200);
  assert.strictEqual(l100.progressPercentage, 0);

  // 200 XP -> In Level 2, 100/200 = 50%
  const l200 = system.calculateLevel(200);
  assert.strictEqual(l200.level, 2);
  assert.strictEqual(l200.currentLevelXP, 100);
  assert.strictEqual(l200.xpForNextLevel, 200);
  assert.strictEqual(l200.progressPercentage, 50);

  // 300 XP (100 + 200) -> Reaches Level 3!
  const l300 = system.calculateLevel(300);
  assert.strictEqual(l300.level, 3);
  assert.strictEqual(l300.currentLevelXP, 0);
  assert.strictEqual(l300.xpForNextLevel, 300);
  assert.strictEqual(l300.progressPercentage, 0);
});

test('LevelSystem handles exact -1 XP boundary thresholds', () => {
  const system = new LevelSystem();

  // 99 XP: 1 XP short of Level 2 -> Must still be Level 1
  const l99 = system.calculateLevel(99);
  assert.strictEqual(l99.level, 1);
  assert.strictEqual(l99.currentLevelXP, 99);
  assert.strictEqual(l99.progressPercentage, 99);

  // 299 XP: 1 XP short of Level 3 (100 + 200 = 300) -> Must still be Level 2
  const l299 = system.calculateLevel(299);
  assert.strictEqual(l299.level, 2);
  assert.strictEqual(l299.currentLevelXP, 199);
  assert.strictEqual(l299.progressPercentage, 99);
});

test('LevelSystem skips multiple levels when receiving massive XP in one leap', () => {
  const system = new LevelSystem();

  // Jump from 0 to 1000 XP
  // L1: 100 (cumul 100)
  // L2: 200 (cumul 300)
  // L3: 300 (cumul 600)
  // L4: 400 (cumul 1000)
  // At 1000 XP -> Exact Level 5! (currentLevelXP = 0, xpForNextLevel = 500)
  const l1000 = system.calculateLevel(1000);
  assert.strictEqual(l1000.level, 5);
  assert.strictEqual(l1000.currentLevelXP, 0);
  assert.strictEqual(l1000.xpForNextLevel, 500);
});

test('LevelSystem handles negative or malformed XP safely', () => {
  const system = new LevelSystem();
  const res = system.calculateLevel(-50);
  assert.strictEqual(res.level, 1);
  assert.strictEqual(res.currentLevelXP, 0);
  assert.strictEqual(res.progressPercentage, 0);
});
