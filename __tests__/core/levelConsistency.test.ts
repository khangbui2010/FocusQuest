import test from 'node:test';
import assert from 'node:assert';
import { calculatePlayerLevel, calculateLevelProgress, LevelSystem } from '../../src/core/economy/levelSystem.ts';
import { MemoryStorageAdapter } from '../../src/storage/memoryStorageAdapter.ts';
import { StorageManager } from '../../src/storage/storageManager.ts';
import { CivilizationCoordinator } from '../../src/background/civilizationCoordinator.ts';
import { getBuildingDefinition } from '../../src/core/civilization/buildingCatalog.ts';
import { SessionSnapshot } from '../../src/types/session.ts';

test('Level Consistency: calculatePlayerLevel accurately calculates level progression from totalXP', () => {
  // Base 100 arithmetic progression:
  // Level 1: 0 to 99 XP
  // Level 2: 100 to 299 XP
  // Level 3: 300 to 599 XP
  // Level 4: 600 to 999 XP
  assert.strictEqual(calculatePlayerLevel(0), 1);
  assert.strictEqual(calculatePlayerLevel(50), 1);
  assert.strictEqual(calculatePlayerLevel(99), 1);
  assert.strictEqual(calculatePlayerLevel(100), 2);
  assert.strictEqual(calculatePlayerLevel(299), 2);
  assert.strictEqual(calculatePlayerLevel(300), 3);
  assert.strictEqual(calculatePlayerLevel(450), 3);
  assert.strictEqual(calculatePlayerLevel(600), 4);
});

test('Level Consistency: StorageManager getEconomy infers level when omitted', async () => {
  const adapter = new MemoryStorageAdapter();
  const storage = new StorageManager(adapter);

  // Set raw economy without level in storage
  await adapter.set('fq_economy', { focusCoins: 100, totalXP: 500 });

  const fresh = await storage.getEconomy();
  // 500 XP corresponds to Level 3 (0-99 Lv1, 100-299 Lv2, 300-599 Lv3)
  assert.strictEqual(fresh.level, 3, 'Level must be inferred as 3 based on 500 totalXP');
});

test('Level Consistency: commitSessionOutcomeInternal updates economy.level atomically on session settlement', async () => {
  const adapter = new MemoryStorageAdapter();
  const storage = new StorageManager(adapter);

  // Initial economy: 0 coins, 0 XP, Level 1
  await storage.setEconomy({ focusCoins: 0, totalXP: 0, level: 1 });

  const dummySession: SessionSnapshot = {
    id: 'test_sess',
    mode: 'COUNTDOWN',
    profileId: 'study',
    status: 'COMPLETED',
    targetMinutes: 25,
    lockedMultiplier: 1.0,
    startedAt: Date.now() - 25 * 60000,
    currentPauseStartedAt: null,
    pauseCount: 0,
    totalPauseMs: 0,
    pauseHistory: [],
    lastHeartbeatAt: Date.now(),
    completedAt: Date.now(),
    rewardProcessed: true,
  };

  // Settle session granting 350 XP (crosses into Level 3)
  const outcome = await storage.commitSessionOutcome({
    session: dummySession,
    economyDelta: { coins: 50, xp: 350 },
  });

  assert.strictEqual(outcome.economy.totalXP, 350);
  assert.strictEqual(outcome.economy.level, 3, 'Level must atomically advance to Level 3');
});

test('Level Consistency: CivilizationCoordinator placeBuilding checks unlock requirements using totalXP', async () => {
  const adapter = new MemoryStorageAdapter();
  const storage = new StorageManager(adapter);
  const civCoordinator = new CivilizationCoordinator(storage);
  await civCoordinator.ensureInitialized();

  // Find a building that requires minPlayerLevel > 1 (e.g. Elder Hut requires Level 2)
  const elderHut = getBuildingDefinition('stone_age_elder_hut')!;
  assert.ok(elderHut.unlockRequirements.minPlayerLevel >= 2);

  // Player has 0 XP (Level 1) and 500 coins -> placing should be rejected
  await storage.setEconomy({ focusCoins: 500, totalXP: 0, level: 1 });
  await assert.rejects(
    async () => {
      await civCoordinator.placeBuilding({
        buildingDefinitionId: 'stone_age_elder_hut',
        position: { x: 0, y: 0 },
      });
    },
    /requires Player Level/
  );

  // Now grant player 350 XP (Level 3) and enough lifetime focus minutes
  await storage.setEconomy({ focusCoins: 500, totalXP: 350, level: 3 });
  await storage.setDailyStats({
    '2026-11-06': {
      date: '2026-11-06',
      totalFocusMinutes: 200,
      completedSessions: 4,
      abandonedSessions: 0,
      coinsEarned: 100,
      xpEarned: 350,
    },
  });

  const res = await civCoordinator.placeBuilding({
    buildingDefinitionId: 'stone_age_elder_hut',
    position: { x: 0, y: 0 },
  });
  assert.ok(res.building);
  assert.strictEqual(res.building.definitionId, 'stone_age_elder_hut');
});
