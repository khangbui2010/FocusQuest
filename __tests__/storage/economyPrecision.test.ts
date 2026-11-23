import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStorageAdapter } from '../../src/storage/memoryStorageAdapter.ts';
import { StorageManager } from '../../src/storage/storageManager.ts';
import { SessionSnapshot } from '../../src/types/session.ts';

const EPSILON = 1e-9;

function makeSession(id: string): SessionSnapshot {
  return {
    id,
    mode: 'COUNTDOWN',
    profileId: 'profile-study-research',
    status: 'COMPLETED',
    targetMinutes: 5,
    lockedMultiplier: 1.0,
    startedAt: 1_000_000,
    currentPauseStartedAt: null,
    pauseCount: 0,
    totalPauseMs: 0,
    pauseHistory: [],
    lastHeartbeatAt: 1_300_000,
    completedAt: 1_300_000,
    rewardProcessed: true,
  };
}

test('Economy precision: decimal coins survive an atomic commit unchanged', async () => {
  const manager = new StorageManager(new MemoryStorageAdapter());

  await manager.commitSessionOutcome({
    session: makeSession('decimal-1'),
    economyDelta: { coins: 12.236, xp: 41.5 },
  });

  const economy = await manager.getEconomy();
  assert.strictEqual(economy.focusCoins, 12.236, 'Storage must not round 12.236 to 12.24');
  assert.strictEqual(economy.totalXP, 41.5);
});

test('Economy precision: concurrent economy updates serialize without losing coins', async () => {
  const manager = new StorageManager(new MemoryStorageAdapter());

  await Promise.all(
    Array.from({ length: 100 }, () =>
      manager.updateEconomy((current) => ({
        ...current,
        focusCoins: current.focusCoins + 0.1,
      }))
    )
  );

  const economy = await manager.getEconomy();
  assert.ok(
    Math.abs(economy.focusCoins - 10) < EPSILON,
    `Expected 100 x 0.1 Coins to accumulate to ~10, got ${economy.focusCoins}`
  );
});

test('Economy precision: concurrent session settlements do not drop any Coins/XP', async () => {
  const manager = new StorageManager(new MemoryStorageAdapter());

  await Promise.all(
    Array.from({ length: 20 }, (_, index) =>
      manager.commitSessionOutcome({
        session: makeSession(`concurrent-${index}`),
        economyDelta: { coins: 0.25, xp: 1.5 },
        dailyStatDelta: {
          date: '2026-11-03',
          focusMinutes: 5,
          isCompleted: true,
          isAbandoned: false,
          coins: 0.25,
          xp: 1.5,
        },
      })
    )
  );

  const economy = await manager.getEconomy();
  assert.ok(Math.abs(economy.focusCoins - 5) < EPSILON);
  assert.ok(Math.abs(economy.totalXP - 30) < EPSILON);

  const stats = await manager.getDailyStats();
  assert.ok(Math.abs(stats['2026-11-03'].coinsEarned - 5) < EPSILON);
  assert.ok(Math.abs(stats['2026-11-03'].xpEarned - 30) < EPSILON);
  assert.strictEqual(stats['2026-11-03'].totalFocusMinutes, 100);
});

test('Economy precision: daily stats keep decimal rewards without early rounding', async () => {
  const manager = new StorageManager(new MemoryStorageAdapter());

  await manager.recordDailyFocus('2026-11-03', {
    focusMinutes: 25,
    isCompleted: true,
    isAbandoned: false,
    coins: 12.236,
    xp: 137.5,
  });

  const stats = await manager.getDailyStats();
  assert.strictEqual(stats['2026-11-03'].coinsEarned, 12.236);
  assert.strictEqual(stats['2026-11-03'].xpEarned, 137.5);
});

test('Economy precision: legacy integer coin values remain valid after new decimals are added', async () => {
  const manager = new StorageManager(new MemoryStorageAdapter());

  await manager.setEconomy({ focusCoins: 25, totalXP: 100, level: 1 });
  await manager.updateEconomy((current) => ({
    ...current,
    focusCoins: current.focusCoins + 0.75,
  }));

  assert.strictEqual((await manager.getEconomy()).focusCoins, 25.75);
});
