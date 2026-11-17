import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStorageAdapter } from '../../src/storage/memoryStorageAdapter.ts';
import { StorageManager } from '../../src/storage/storageManager.ts';
import { SessionSnapshot } from '../../src/types/session.ts';

test('StorageManager updates session, economy, and daily stats safely', async () => {
  const adapter = new MemoryStorageAdapter();
  const manager = new StorageManager(adapter);

  // 1. Session snapshot operations
  const mockSession: SessionSnapshot = {
    id: 'session-123',
    mode: 'COUNTDOWN',
    profileId: 'profile-study-research',
    status: 'RUNNING',
    targetMinutes: 25,
    lockedMultiplier: 1.1,
    startedAt: 1000000,
    currentPauseStartedAt: null,
    pauseCount: 0,
    totalPauseMs: 0,
    pauseHistory: [],
    lastHeartbeatAt: 1000000,
    completedAt: null,
    rewardProcessed: false,
  };

  await manager.setCurrentSession(mockSession);
  const fetched = await manager.getCurrentSession();
  assert.deepStrictEqual(fetched, mockSession);

  // 2. Atomic Economy update
  await manager.updateEconomy((current) => ({
    ...current,
    focusCoins: current.focusCoins + 50,
    totalXP: current.totalXP + 120,
  }));

  const economy = await manager.getEconomy();
  assert.strictEqual(economy.focusCoins, 50);
  assert.strictEqual(economy.totalXP, 120);

  // 3. Record daily focus
  await manager.recordDailyFocus('2026-10-29', {
    focusMinutes: 25,
    isCompleted: true,
    isAbandoned: false,
    coins: 50,
    xp: 120,
  });

  // Second session: abandoned with 15 mins focus
  await manager.recordDailyFocus('2026-10-29', {
    focusMinutes: 15,
    isCompleted: false,
    isAbandoned: true,
    coins: 0,
    xp: 0,
  });

  const stats = await manager.getDailyStats();
  const today = stats['2026-10-29'];

  assert.ok(today, 'Daily record should exist');
  assert.strictEqual(today.totalFocusMinutes, 40, 'Should accumulate 25 + 15 = 40 minutes');
  assert.strictEqual(today.completedSessions, 1);
  assert.strictEqual(today.abandonedSessions, 1);
  assert.strictEqual(today.coinsEarned, 50);
  assert.strictEqual(today.xpEarned, 120);
});

test('StorageManager: commitSessionOutcome writes session, economy, and dailyStats atomically in one call', async () => {
  const adapter = new MemoryStorageAdapter();
  const manager = new StorageManager(adapter);

  const completedSession: SessionSnapshot = {
    id: 'atomic-sess-1',
    mode: 'COUNTDOWN',
    profileId: 'profile-1',
    status: 'COMPLETED',
    targetMinutes: 30,
    lockedMultiplier: 1.2,
    startedAt: 1000000,
    currentPauseStartedAt: null,
    pauseCount: 0,
    totalPauseMs: 0,
    pauseHistory: [],
    lastHeartbeatAt: 1000000 + 30 * 60 * 1000,
    completedAt: 1000000 + 30 * 60 * 1000,
    rewardProcessed: true,
  };

  const outcome = await manager.commitSessionOutcome({
    session: completedSession,
    economyDelta: { coins: 72, xp: 180 },
    dailyStatDelta: {
      date: '2026-10-29',
      focusMinutes: 30,
      isCompleted: true,
      isAbandoned: false,
      coins: 72,
      xp: 180,
    },
  });

  // Verify memory adapter has all 3 keys committed
  const sessionInStorage = await manager.getCurrentSession();
  assert.deepStrictEqual(sessionInStorage, completedSession);

  const economyInStorage = await manager.getEconomy();
  assert.strictEqual(economyInStorage.focusCoins, 72);
  assert.strictEqual(economyInStorage.totalXP, 180);

  const statsInStorage = await manager.getDailyStats();
  assert.strictEqual(statsInStorage['2026-10-29'].totalFocusMinutes, 30);
  assert.strictEqual(statsInStorage['2026-10-29'].coinsEarned, 72);
  assert.strictEqual(statsInStorage['2026-10-29'].xpEarned, 180);
});

