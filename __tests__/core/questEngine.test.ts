import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  ALL_QUEST_DEFINITIONS,
  applyCompletedSession,
  canClaim,
  claimQuest,
  countUnclaimed,
  createInitialQuestState,
  DAILY_QUEST_CAP,
  DAILY_QUEST_DEFINITIONS,
  formatLocalDateKey,
  getLocalWeekStartKeyFromDateKey,
  getNextWeeklyStartKey,
  getQuestDefinition,
  getResetCountdown,
  rolloverQuestState,
  sanitizeQuestState,
  toQuestOutcomeDelta,
  WEEKLY_QUEST_CAP,
  WEEKLY_QUEST_DEFINITIONS,
} from '../../src/core/quests/index.ts';
import { SessionSnapshot } from '../../src/types/session.ts';

function localTs(
  year: number,
  month: number,
  day: number,
  hour = 10,
  minute = 0,
  second = 0
): number {
  return new Date(year, month - 1, day, hour, minute, second, 0).getTime();
}

function makeBaseSnapshot(overrides: Partial<SessionSnapshot>): SessionSnapshot {
  return {
    id: 'sess-quest-test',
    mode: 'COUNTDOWN',
    profileId: 'p-1',
    status: 'COMPLETED',
    targetMinutes: 25,
    lockedMultiplier: 1.0,
    startedAt: 1_700_000_000_000,
    currentPauseStartedAt: null,
    pauseCount: 0,
    totalPauseMs: 0,
    pauseHistory: [],
    lastHeartbeatAt: 1_700_001_500_000,
    completedAt: 1_700_001_500_000,
    rewardProcessed: true,
    ...overrides,
  };
}

test('Quest Catalog: verifies exact 6 quests, Daily cap (40 Coins / 100 XP) & Weekly cap (150 Coins / 370 XP)', () => {
  assert.strictEqual(ALL_QUEST_DEFINITIONS.length, 6);
  assert.strictEqual(DAILY_QUEST_DEFINITIONS.length, 3);
  assert.strictEqual(WEEKLY_QUEST_DEFINITIONS.length, 3);

  const dailyCoins = DAILY_QUEST_DEFINITIONS.reduce((acc, q) => acc + q.rewardCoins, 0);
  const dailyXp = DAILY_QUEST_DEFINITIONS.reduce((acc, q) => acc + q.rewardXp, 0);
  assert.strictEqual(dailyCoins, DAILY_QUEST_CAP.coins);
  assert.strictEqual(dailyXp, DAILY_QUEST_CAP.xp);
  assert.strictEqual(dailyCoins, 40);
  assert.strictEqual(dailyXp, 100);

  const weeklyCoins = WEEKLY_QUEST_DEFINITIONS.reduce((acc, q) => acc + q.rewardCoins, 0);
  const weeklyXp = WEEKLY_QUEST_DEFINITIONS.reduce((acc, q) => acc + q.rewardXp, 0);
  assert.strictEqual(weeklyCoins, WEEKLY_QUEST_CAP.coins);
  assert.strictEqual(weeklyXp, WEEKLY_QUEST_CAP.xp);
  assert.strictEqual(weeklyCoins, 150);
  assert.strictEqual(weeklyXp, 370);

  assert.strictEqual(getQuestDefinition('DAILY', 'daily_first_spark')?.target, 1);
  assert.strictEqual(getQuestDefinition('DAILY', 'daily_steady_rhythm')?.target, 60);
  assert.strictEqual(getQuestDefinition('DAILY', 'daily_double_tap')?.target, 2);
  assert.strictEqual(getQuestDefinition('WEEKLY', 'weekly_habit_builder')?.target, 4);
  assert.strictEqual(getQuestDefinition('WEEKLY', 'weekly_deep_diver')?.target, 3);
  assert.strictEqual(getQuestDefinition('WEEKLY', 'weekly_deep_diver')?.minSessionMinutes, 45);
  assert.strictEqual(getQuestDefinition('WEEKLY', 'weekly_tenacity_10')?.target, 10);
});

test('Quest Dates: Monday week start stays consistent across Dec->Jan year boundary & leap-year Feb 29', () => {
  // 2025-12-29 is Monday -> 2026-01-04 is Sunday (same week)
  assert.strictEqual(getLocalWeekStartKeyFromDateKey('2025-12-29'), '2025-12-29');
  assert.strictEqual(getLocalWeekStartKeyFromDateKey('2025-12-31'), '2025-12-29');
  assert.strictEqual(getLocalWeekStartKeyFromDateKey('2026-01-01'), '2025-12-29');
  assert.strictEqual(getLocalWeekStartKeyFromDateKey('2026-01-04'), '2025-12-29');
  assert.strictEqual(getLocalWeekStartKeyFromDateKey('2026-01-05'), '2026-01-05');

  // 2024 leap year Feb 29 (Thursday) belongs to Monday 2024-02-26 week
  assert.strictEqual(getLocalWeekStartKeyFromDateKey('2024-02-29'), '2024-02-26');
  assert.strictEqual(getLocalWeekStartKeyFromDateKey('2024-03-03'), '2024-02-26');
  assert.strictEqual(getNextWeeklyStartKey('2024-02-29'), '2024-03-04');

  // Reset countdown deterministic from Wednesday 2026-11-18 18:30:00
  const wedTs = localTs(2026, 11, 18, 18, 30, 0);
  const cd = getResetCountdown(wedTs);
  assert.strictEqual(cd.nextDailyDateKey, '2026-11-19');
  assert.strictEqual(cd.nextWeeklyStartKey, '2026-11-23');
  assert.strictEqual(cd.dailyResetInMs, (5 * 60 + 30) * 60 * 1000);
  assert.strictEqual(cd.weeklyResetInMs, (4 * 24 * 60 + 5 * 60 + 30) * 60 * 1000);
});

test('Quest Engine: updates Daily and Weekly progress accurately across completed sessions & manual claims', () => {
  const day1 = localTs(2026, 11, 18, 9, 0, 0);
  let state = createInitialQuestState(day1);

  // Session 1: 25m
  state = applyCompletedSession(state, { completedDateKey: '2026-11-18', completedFocusMinutes: 25 }, day1);
  assert.strictEqual(state.daily.daily_first_spark.progress, 1);
  assert.strictEqual(state.daily.daily_first_spark.completed, true);
  assert.strictEqual(state.daily.daily_first_spark.claimed, false); // Manual claim only
  assert.strictEqual(state.daily.daily_double_tap.progress, 1);
  assert.strictEqual(state.daily.daily_double_tap.completed, false);
  assert.strictEqual(state.daily.daily_steady_rhythm.progress, 25);
  assert.strictEqual(state.weekly.weekly_habit_builder.progress, 1);
  assert.strictEqual(state.weekly.weekly_deep_diver.progress, 0);
  assert.strictEqual(state.weekly.weekly_tenacity_10.progress, 1);
  assert.strictEqual(countUnclaimed(state, day1), 1);

  // Claim daily_first_spark manually -> returns fixed flat 10 Coins / 25 XP
  assert.strictEqual(canClaim(state, 'DAILY', 'daily_first_spark', day1), true);
  const claim1 = claimQuest(state, 'DAILY', 'daily_first_spark', day1 + 5000);
  assert.strictEqual(claim1.claimed, true);
  assert.strictEqual(claim1.coins, 10);
  assert.strictEqual(claim1.xp, 25);
  state = claim1.state;
  assert.strictEqual(canClaim(state, 'DAILY', 'daily_first_spark', day1 + 6000), false);
  assert.strictEqual(countUnclaimed(state, day1 + 6000), 0);

  // Double-claim must fail cleanly with 0 coins/xp
  const doubleClaim = claimQuest(state, 'DAILY', 'daily_first_spark', day1 + 7000);
  assert.strictEqual(doubleClaim.claimed, false);
  assert.strictEqual(doubleClaim.coins, 0);
  assert.strictEqual(doubleClaim.xp, 0);

  // Session 2 same day: 45m -> completes double_tap, steady_rhythm (capped at 60), increments deep_diver (1/3)
  const day1Later = localTs(2026, 11, 18, 14, 0, 0);
  state = applyCompletedSession(state, { completedDateKey: '2026-11-18', completedFocusMinutes: 45 }, day1Later);
  assert.strictEqual(state.daily.daily_double_tap.progress, 2);
  assert.strictEqual(state.daily.daily_double_tap.completed, true);
  assert.strictEqual(state.daily.daily_steady_rhythm.progress, 60);
  assert.strictEqual(state.daily.daily_steady_rhythm.completed, true);
  assert.strictEqual(state.weekly.weekly_habit_builder.progress, 1); // Still 1 distinct day
  assert.strictEqual(state.weekly.weekly_deep_diver.progress, 1);
  assert.strictEqual(state.weekly.weekly_tenacity_10.progress, 2);
  assert.strictEqual(countUnclaimed(state, day1Later), 2);
});

test('Quest Anti-Single-Behavior: 3 Weekly quests are orthogonal — no single play pattern satisfies all 3', () => {
  // Pattern 1: Binge 10 x 25m sessions in a single Sunday -> finishes Weekly Tenacity only
  const sun = localTs(2026, 11, 22, 10, 0, 0);
  let binge = createInitialQuestState(sun);
  for (let i = 0; i < 10; i++) {
    binge = applyCompletedSession(binge, { completedDateKey: '2026-11-22', completedFocusMinutes: 25 }, sun + i * 1000);
  }
  assert.strictEqual(binge.weekly.weekly_tenacity_10.completed, true);
  assert.strictEqual(binge.weekly.weekly_habit_builder.completed, false);
  assert.strictEqual(binge.weekly.weekly_habit_builder.progress, 1);
  assert.strictEqual(binge.weekly.weekly_deep_diver.completed, false);
  assert.strictEqual(binge.weekly.weekly_deep_diver.progress, 0);

  // Pattern 2: 10 short 25m sessions spread across 5 days -> fails Deep Diver
  let shortOnly = createInitialQuestState(localTs(2026, 11, 16, 9, 0, 0));
  for (let d = 0; d < 5; d++) {
    const ts = localTs(2026, 11, 16 + d, 9, 0, 0);
    const dk = formatLocalDateKey(ts);
    shortOnly = applyCompletedSession(shortOnly, { completedDateKey: dk, completedFocusMinutes: 25 }, ts);
    shortOnly = applyCompletedSession(shortOnly, { completedDateKey: dk, completedFocusMinutes: 25 }, ts + 1000);
  }
  assert.strictEqual(shortOnly.weekly.weekly_habit_builder.completed, true);
  assert.strictEqual(shortOnly.weekly.weekly_tenacity_10.completed, true);
  assert.strictEqual(shortOnly.weekly.weekly_deep_diver.completed, false);
  assert.strictEqual(shortOnly.weekly.weekly_deep_diver.progress, 0);

  // Pattern 3: 4 days with 1 deep 50m session each -> fails Weekly Tenacity (4/10)
  let deepSparse = createInitialQuestState(localTs(2026, 11, 16, 9, 0, 0));
  for (let d = 0; d < 4; d++) {
    const ts = localTs(2026, 11, 16 + d, 9, 0, 0);
    const dk = formatLocalDateKey(ts);
    deepSparse = applyCompletedSession(deepSparse, { completedDateKey: dk, completedFocusMinutes: 50 }, ts);
  }
  assert.strictEqual(deepSparse.weekly.weekly_habit_builder.completed, true);
  assert.strictEqual(deepSparse.weekly.weekly_deep_diver.completed, true);
  assert.strictEqual(deepSparse.weekly.weekly_tenacity_10.completed, false);
  assert.strictEqual(deepSparse.weekly.weekly_tenacity_10.progress, 4);
});

test('Quest Rollover: Daily midnight & Weekly Monday resets expire unclaimed rewards cleanly', () => {
  // Friday 2026-11-20 -> complete Daily Spark + Weekly Tenacity threshold setup
  const fri = localTs(2026, 11, 20, 23, 50, 0);
  let state = createInitialQuestState(fri);
  state = applyCompletedSession(state, { completedDateKey: '2026-11-20', completedFocusMinutes: 60 }, fri);
  assert.strictEqual(canClaim(state, 'DAILY', 'daily_first_spark', fri), true);
  assert.strictEqual(canClaim(state, 'DAILY', 'daily_steady_rhythm', fri), true);

  // Advance past midnight -> Saturday 2026-11-21 (same week '2026-11-16')
  const sat = localTs(2026, 11, 21, 0, 1, 0);
  assert.strictEqual(canClaim(state, 'DAILY', 'daily_first_spark', sat), false); // Expired unclaimed daily reward
  const satState = rolloverQuestState(state, sat);
  assert.strictEqual(satState.dailyDateKey, '2026-11-21');
  assert.strictEqual(satState.weeklyStartKey, '2026-11-16');
  assert.strictEqual(satState.daily.daily_first_spark.progress, 0);
  assert.strictEqual(satState.weekly.weekly_tenacity_10.progress, 1); // Weekly kept across Friday->Saturday
  assert.strictEqual(satState.weekly.weekly_deep_diver.progress, 1);

  // Advance across Monday 2026-11-23 00:00 -> Weekly resets, streak stays intact until next session
  const mon = localTs(2026, 11, 23, 0, 5, 0);
  const monState = rolloverQuestState(satState, mon);
  assert.strictEqual(monState.dailyDateKey, '2026-11-23');
  assert.strictEqual(monState.weeklyStartKey, '2026-11-23');
  assert.strictEqual(monState.weekly.weekly_tenacity_10.progress, 0);
  assert.strictEqual(monState.weekly.weekly_deep_diver.progress, 0);
  assert.strictEqual(monState.weekly.weekly_habit_builder.progress, 0);
  assert.strictEqual(monState.weeklyActiveDateKeys.length, 0);
  assert.strictEqual(monState.streak.lastCompletedDateKey, '2026-11-20');
});

test('Quest Anti-Clock-Rollback & Ring Buffer: blocks clock-back reset, double-claim, and caps ledger at 14', () => {
  const day1 = localTs(2026, 11, 18, 10, 0, 0);
  let state = createInitialQuestState(day1);
  state = applyCompletedSession(state, { completedDateKey: '2026-11-18', completedFocusMinutes: 25 }, day1);
  state = claimQuest(state, 'DAILY', 'daily_first_spark', day1 + 1000).state;

  // Move forward to day 2 (2026-11-19) and build partial steady rhythm progress
  const day2 = localTs(2026, 11, 19, 10, 0, 0);
  state = applyCompletedSession(state, { completedDateKey: '2026-11-19', completedFocusMinutes: 30 }, day2);
  assert.strictEqual(state.dailyDateKey, '2026-11-19');
  assert.strictEqual(state.daily.daily_steady_rhythm.progress, 30);

  // Roll system clock BACKWARDS to day 1 -> progress on day 2 MUST NOT wipe or revert
  const rolledBack = rolloverQuestState(state, day1 + 5000);
  assert.strictEqual(rolledBack.dailyDateKey, '2026-11-19');
  assert.strictEqual(rolledBack.daily.daily_steady_rhythm.progress, 30);
  assert.strictEqual(rolledBack.lastSettledTimestamp, day2);

  // Attempt session credit with rolled-back completedDateKey must NOT increment day 2 daily quests or regress streak
  const afterBackSession = applyCompletedSession(
    rolledBack,
    { completedDateKey: '2026-11-18', completedFocusMinutes: 30 },
    day1 + 6000
  );
  assert.strictEqual(afterBackSession.daily.daily_steady_rhythm.progress, 30);
  assert.strictEqual(afterBackSession.streak.lastCompletedDateKey, '2026-11-19');

  // Ring buffer cap test: claim > 14 times across sequential days -> recentClaimedKeys stays <= 14
  let ledgerState = createInitialQuestState(localTs(2026, 10, 1, 9, 0, 0));
  for (let d = 0; d < 18; d++) {
    const ts = localTs(2026, 10, 1 + d, 9, 0, 0);
    const dk = formatLocalDateKey(ts);
    ledgerState = applyCompletedSession(ledgerState, { completedDateKey: dk, completedFocusMinutes: 25 }, ts);
    ledgerState = claimQuest(ledgerState, 'DAILY', 'daily_first_spark', ts + 500).state;
  }
  assert.strictEqual(ledgerState.recentClaimedKeys.length, 14);
  assert.strictEqual(ledgerState.recentClaimedKeys[0], 'daily:2026-10-05:daily_first_spark');
  assert.strictEqual(ledgerState.recentClaimedKeys[13], 'daily:2026-10-18:daily_first_spark');
});

test('Quest Streak: same day unchanged, +1 next day, >= 2d gap resets to 1 keeping longestDays', () => {
  const d1 = localTs(2026, 11, 10, 10, 0, 0);
  let state = createInitialQuestState(d1);

  state = applyCompletedSession(state, { completedDateKey: '2026-11-10', completedFocusMinutes: 25 }, d1);
  assert.deepStrictEqual(state.streak, { currentDays: 1, longestDays: 1, lastCompletedDateKey: '2026-11-10' });

  // Second session same day
  state = applyCompletedSession(state, { completedDateKey: '2026-11-10', completedFocusMinutes: 25 }, d1 + 60000);
  assert.deepStrictEqual(state.streak, { currentDays: 1, longestDays: 1, lastCompletedDateKey: '2026-11-10' });

  // Consecutive days d2, d3
  const d2 = localTs(2026, 11, 11, 10, 0, 0);
  state = applyCompletedSession(state, { completedDateKey: '2026-11-11', completedFocusMinutes: 25 }, d2);
  const d3 = localTs(2026, 11, 12, 10, 0, 0);
  state = applyCompletedSession(state, { completedDateKey: '2026-11-12', completedFocusMinutes: 25 }, d3);
  assert.deepStrictEqual(state.streak, { currentDays: 3, longestDays: 3, lastCompletedDateKey: '2026-11-12' });

  // Gap of 2 days (skip Nov 13 -> Nov 14): gap === 2 -> resets currentDays to 1, longestDays remains 3
  const d5 = localTs(2026, 11, 14, 10, 0, 0);
  state = applyCompletedSession(state, { completedDateKey: '2026-11-14', completedFocusMinutes: 25 }, d5);
  assert.deepStrictEqual(state.streak, { currentDays: 1, longestDays: 3, lastCompletedDateKey: '2026-11-14' });
});

test('Quest Outcome Mapper (toQuestOutcomeDelta): enforces All-or-Nothing across all 4 session modes', () => {
  const dk = '2026-11-18';

  // 1. COUNTDOWN
  assert.deepStrictEqual(
    toQuestOutcomeDelta(makeBaseSnapshot({ mode: 'COUNTDOWN', status: 'COMPLETED', targetMinutes: 25 }), dk),
    { completedDateKey: dk, completedFocusMinutes: 25 }
  );
  assert.strictEqual(
    toQuestOutcomeDelta(makeBaseSnapshot({ mode: 'COUNTDOWN', status: 'ABANDONED', targetMinutes: 25 }), dk),
    null
  );
  assert.strictEqual(
    toQuestOutcomeDelta(makeBaseSnapshot({ mode: 'COUNTDOWN', status: 'INTERRUPTED', targetMinutes: 25 }), dk),
    null
  );

  // 2. POMODORO_COUNTDOWN
  assert.deepStrictEqual(
    toQuestOutcomeDelta(
      makeBaseSnapshot({
        mode: 'POMODORO_COUNTDOWN',
        status: 'COMPLETED',
        targetMinutes: 100,
        pomodoroState: {
          currentPhase: 'FOCUS',
          currentInterval: 4,
          completedFocusCount: 4,
          phaseStartedAt: 1_700_000_000_000,
          phaseTargetDurationMinutes: 25,
          phaseTotalPauseMs: 0,
          totalCompletedFocusMinutes: 100,
          accumulatedCoins: 240,
          accumulatedXp: 800,
        },
      }),
      dk
    ),
    { completedDateKey: dk, completedFocusMinutes: 100 }
  );
  assert.strictEqual(
    toQuestOutcomeDelta(
      makeBaseSnapshot({
        mode: 'POMODORO_COUNTDOWN',
        status: 'ABANDONED',
        pomodoroState: {
          currentPhase: 'FOCUS',
          currentInterval: 3,
          completedFocusCount: 2,
          phaseStartedAt: 1_700_000_000_000,
          phaseTargetDurationMinutes: 25,
          phaseTotalPauseMs: 0,
          totalCompletedFocusMinutes: 50,
          accumulatedCoins: 100,
          accumulatedXp: 200,
        },
      }),
      dk
    ),
    null
  );

  // 3. STOPWATCH (with both wall-clock SessionCoordinator shape and explicit lastKnownValidFocusMinutes)
  const swStart = 1_700_000_000_000;
  assert.strictEqual(
    toQuestOutcomeDelta(
      makeBaseSnapshot({
        mode: 'STOPWATCH',
        status: 'COMPLETED',
        startedAt: swStart,
        completedAt: swStart + 4 * 60 * 1000,
        lastKnownValidFocusMinutes: undefined,
      }),
      dk
    ),
    null
  );
  assert.deepStrictEqual(
    toQuestOutcomeDelta(
      makeBaseSnapshot({
        mode: 'STOPWATCH',
        status: 'COMPLETED',
        startedAt: swStart,
        completedAt: swStart + 35 * 60 * 1000,
        totalPauseMs: 5 * 60 * 1000,
        lastKnownValidFocusMinutes: undefined,
      }),
      dk
    ),
    { completedDateKey: dk, completedFocusMinutes: 30 }
  );
  assert.strictEqual(
    toQuestOutcomeDelta(
      makeBaseSnapshot({
        mode: 'STOPWATCH',
        status: 'INTERRUPTED',
        lastKnownValidFocusMinutes: 30,
      }),
      dk
    ),
    null
  );

  // 4. POMODORO_STOPWATCH: STRICTLY completedFocusCount * intervalDuration (no partial intervals, no INTERRUPTED)
  assert.deepStrictEqual(
    toQuestOutcomeDelta(
      makeBaseSnapshot({
        mode: 'POMODORO_STOPWATCH',
        status: 'COMPLETED',
        lastKnownValidFocusMinutes: 67, // includes 17m partial interval -> MUST be ignored for Quest progress!
        pomodoroConfig: {
          focusDurationMinutes: 25,
          focusIntervalDurationMinutes: 25,
          shortBreakDurationMinutes: 5,
          longBreakDurationMinutes: 15,
          targetFocusSessions: 4,
        },
        pomodoroState: {
          currentPhase: 'FOCUS',
          currentInterval: 3,
          completedFocusCount: 2,
          phaseStartedAt: 1_700_000_000_000,
          phaseTargetDurationMinutes: 25,
          phaseTotalPauseMs: 0,
          totalCompletedFocusMinutes: 50,
          accumulatedCoins: 60,
          accumulatedXp: 180,
        },
      }),
      dk
    ),
    { completedDateKey: dk, completedFocusMinutes: 50 }
  );
  assert.strictEqual(
    toQuestOutcomeDelta(
      makeBaseSnapshot({
        mode: 'POMODORO_STOPWATCH',
        status: 'COMPLETED',
        pomodoroState: {
          currentPhase: 'FOCUS',
          currentInterval: 1,
          completedFocusCount: 0,
          phaseStartedAt: 1_700_000_000_000,
          phaseTargetDurationMinutes: 25,
          phaseTotalPauseMs: 0,
          totalCompletedFocusMinutes: 0,
          accumulatedCoins: 0,
          accumulatedXp: 0,
        },
      }),
      dk
    ),
    null
  );
  assert.strictEqual(
    toQuestOutcomeDelta(
      makeBaseSnapshot({
        mode: 'POMODORO_STOPWATCH',
        status: 'INTERRUPTED',
        interruptedReason: 'BROWSER_CLOSED',
        pomodoroState: {
          currentPhase: 'FOCUS',
          currentInterval: 3,
          completedFocusCount: 2,
          phaseStartedAt: 1_700_000_000_000,
          phaseTargetDurationMinutes: 25,
          phaseTotalPauseMs: 0,
          totalCompletedFocusMinutes: 50,
          accumulatedCoins: 60,
          accumulatedXp: 180,
        },
      }),
      dk
    ),
    null
  );
});

test('Quest Engine Purity: src/core/quests contains zero Date.now() and zero Math.random() calls & sanitizes corrupt input', () => {
  const questsDir = path.resolve(import.meta.dirname, '../../src/core/quests');
  const files = fs.readdirSync(questsDir).filter((f) => f.endsWith('.ts'));
  assert.ok(files.length >= 4);
  for (const file of files) {
    const content = fs.readFileSync(path.join(questsDir, file), 'utf8');
    assert.strictEqual(content.includes('Date.now('), false, `${file} must not call Date.now()`);
    assert.strictEqual(content.includes('Math.random('), false, `${file} must not call Math.random()`);
  }

  const nowMs = localTs(2026, 11, 18, 12, 0, 0);
  const corruptInputs: unknown[] = [
    null,
    undefined,
    'bad',
    123,
    [],
    {
      schemaVersion: -5,
      dailyDateKey: '9999-99-99',
      weeklyStartKey: 'not-a-date',
      daily: { daily_first_spark: { progress: Number.NaN, claimed: 'yes' } },
      weekly: null,
      weeklyActiveDateKeys: ['2026-01-01', 42],
      streak: { currentDays: -10, longestDays: Number.POSITIVE_INFINITY, lastCompletedDateKey: 'bad' },
      lastSettledTimestamp: -1,
    },
  ];

  for (const raw of corruptInputs) {
    const sanitized = sanitizeQuestState(raw, nowMs);
    assert.strictEqual(sanitized.dailyDateKey, '2026-11-18');
    assert.strictEqual(sanitized.weeklyStartKey, '2026-11-16');
    assert.strictEqual(sanitized.daily.daily_first_spark.progress, 0);
    assert.strictEqual(sanitized.streak.currentDays, 0);
    assert.ok(sanitized.streak.longestDays >= sanitized.streak.currentDays);
  }
});
