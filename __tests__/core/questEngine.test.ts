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
  createPeriodProgressRecordFromDefinitions,
  DAILY_QUEST_CAP,
  DAILY_QUEST_DEFINITIONS,
  DAILY_SLOT_REWARDS,
  formatLocalDateKey,
  getActiveQuestDefinitions,
  getLocalWeekStartKeyFromDateKey,
  getNextWeeklyStartKey,
  getQuestDefinition,
  getResetCountdown,
  getSlotDefinitions,
  rolloverQuestState,
  sanitizeQuestState,
  selectQuestsForPeriod,
  toQuestOutcomeDelta,
  WEEKLY_QUEST_CAP,
  WEEKLY_QUEST_DEFINITIONS,
  WEEKLY_SLOT_REWARDS,
} from '../../src/core/quests/index.ts';
import { QUEST_SLOTS, QuestDefinition, QuestState } from '../../src/types/quests.ts';
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

function makeStateWithSingleQuest(def: QuestDefinition, nowMs: number): QuestState {
  const base = createInitialQuestState(nowMs, { salt: 'feasibility-test' });
  const dailyDefs =
    def.period === 'DAILY'
      ? [def]
      : getActiveQuestDefinitions('DAILY', base);
  const weeklyDefs =
    def.period === 'WEEKLY'
      ? [def]
      : getActiveQuestDefinitions('WEEKLY', base);

  return {
    ...base,
    daily: createPeriodProgressRecordFromDefinitions(dailyDefs),
    weekly: createPeriodProgressRecordFromDefinitions(weeklyDefs),
  };
}

test('Quest Pool Catalog: >=3 quests/slot, exact slot rewards, and 100% Cartesian cap invariance (40/100 Daily, 150/370 Weekly)', () => {
  assert.ok(ALL_QUEST_DEFINITIONS.length >= 18);
  assert.strictEqual(DAILY_QUEST_DEFINITIONS.length, 9);
  assert.strictEqual(WEEKLY_QUEST_DEFINITIONS.length, 10);

  for (const slot of QUEST_SLOTS) {
    const dSlot = getSlotDefinitions('DAILY', slot);
    const wSlot = getSlotDefinitions('WEEKLY', slot);
    assert.ok(dSlot.length >= 3, `Daily slot ${slot} needs >= 3 options`);
    assert.ok(wSlot.length >= 3, `Weekly slot ${slot} needs >= 3 options`);
    for (const q of dSlot) {
      assert.strictEqual(q.rewardCoins, DAILY_SLOT_REWARDS[slot].rewardCoins);
      assert.strictEqual(q.rewardXp, DAILY_SLOT_REWARDS[slot].rewardXp);
    }
    for (const q of wSlot) {
      assert.strictEqual(q.rewardCoins, WEEKLY_SLOT_REWARDS[slot].rewardCoins);
      assert.strictEqual(q.rewardXp, WEEKLY_SLOT_REWARDS[slot].rewardXp);
    }
  }

  // Weekly Slot C must retain >= 3 standard choices completable by 1x60m*7d alongside hard tenacity_10
  const weeklyC = getSlotDefinitions('WEEKLY', 'C');
  const standardWeeklyC = weeklyC.filter((q) => q.difficulty !== 'hard');
  assert.ok(standardWeeklyC.length >= 3);
  assert.strictEqual(getQuestDefinition('WEEKLY', 'weekly_tenacity_10')?.difficulty, 'hard');

  // Exhaustive Cartesian product check across all Daily combinations (3x3x3 = 27)
  let dailyComboCount = 0;
  for (const a of getSlotDefinitions('DAILY', 'A')) {
    for (const b of getSlotDefinitions('DAILY', 'B')) {
      for (const c of getSlotDefinitions('DAILY', 'C')) {
        dailyComboCount += 1;
        assert.strictEqual(a.rewardCoins + b.rewardCoins + c.rewardCoins, DAILY_QUEST_CAP.coins);
        assert.strictEqual(a.rewardXp + b.rewardXp + c.rewardXp, DAILY_QUEST_CAP.xp);
      }
    }
  }
  assert.strictEqual(dailyComboCount, 27);

  // Exhaustive Cartesian product check across all Weekly combinations (3x3x4 = 36)
  let weeklyComboCount = 0;
  for (const a of getSlotDefinitions('WEEKLY', 'A')) {
    for (const b of getSlotDefinitions('WEEKLY', 'B')) {
      for (const c of getSlotDefinitions('WEEKLY', 'C')) {
        weeklyComboCount += 1;
        assert.strictEqual(a.rewardCoins + b.rewardCoins + c.rewardCoins, WEEKLY_QUEST_CAP.coins);
        assert.strictEqual(a.rewardXp + b.rewardXp + c.rewardXp, WEEKLY_QUEST_CAP.xp);
      }
    }
  }
  assert.strictEqual(weeklyComboCount, 36);

  // Legacy 6 IDs preserved cleanly
  assert.strictEqual(getQuestDefinition('DAILY', 'daily_first_spark')?.target, 1);
  assert.strictEqual(getQuestDefinition('DAILY', 'daily_steady_rhythm')?.target, 60);
  assert.strictEqual(getQuestDefinition('DAILY', 'daily_double_tap')?.target, 2);
  assert.strictEqual(getQuestDefinition('WEEKLY', 'weekly_habit_builder')?.target, 4);
  assert.strictEqual(getQuestDefinition('WEEKLY', 'weekly_deep_diver')?.target, 3);
  assert.strictEqual(getQuestDefinition('WEEKLY', 'weekly_deep_diver')?.minSessionMinutes, 45);
  assert.strictEqual(getQuestDefinition('WEEKLY', 'weekly_tenacity_10')?.target, 10);
});

test('Quest Pool Selection: deterministic, 1-per-slot, zero consecutive repeats, and uniform distribution across 1000 salts', () => {
  // 1. Determinism & 1-per-slot
  const s1 = selectQuestsForPeriod('DAILY', '2026-11-18', 'salt-alpha');
  const s2 = selectQuestsForPeriod('DAILY', '2026-11-18', 'salt-alpha');
  assert.deepStrictEqual(s1.map((q) => q.id), s2.map((q) => q.id));
  assert.deepStrictEqual(s1.map((q) => q.slot), ['A', 'B', 'C']);

  // 2. Anti-repeat across 30 consecutive days & 20 consecutive weeks
  let prevDaily = selectQuestsForPeriod('DAILY', '2026-11-01', 'salt-streak-test').map((q) => q.id);
  for (let d = 2; d <= 30; d += 1) {
    const dk = formatLocalDateKey(localTs(2026, 11, d));
    const curr = selectQuestsForPeriod('DAILY', dk, 'salt-streak-test', prevDaily);
    assert.deepStrictEqual(curr.map((q) => q.slot), ['A', 'B', 'C']);
    for (let i = 0; i < 3; i += 1) {
      assert.notStrictEqual(curr[i].id, prevDaily[i], `Day ${dk} repeated slot ${QUEST_SLOTS[i]}`);
    }
    prevDaily = curr.map((q) => q.id);
  }

  let prevWeekly = selectQuestsForPeriod('WEEKLY', '2026-10-05', 'salt-weekly-test').map((q) => q.id);
  let weekAnchorMs = localTs(2026, 10, 5);
  for (let w = 1; w <= 20; w += 1) {
    weekAnchorMs += 7 * 24 * 60 * 60 * 1000;
    const wk = formatLocalDateKey(weekAnchorMs);
    const curr = selectQuestsForPeriod('WEEKLY', wk, 'salt-weekly-test', prevWeekly);
    assert.deepStrictEqual(curr.map((q) => q.slot), ['A', 'B', 'C']);
    for (let i = 0; i < 3; i += 1) {
      assert.notStrictEqual(curr[i].id, prevWeekly[i], `Week ${wk} repeated slot ${QUEST_SLOTS[i]}`);
    }
    prevWeekly = curr.map((q) => q.id);
  }

  // 3. Distribution uniformity across 1,000 salts (< 5% deviation from 1/poolSize)
  const N = 1000;
  for (const period of ['DAILY', 'WEEKLY'] as const) {
    const key = period === 'DAILY' ? '2026-11-18' : '2026-11-16';
    const counts: Record<string, number> = {};
    for (let i = 0; i < N; i += 1) {
      const picked = selectQuestsForPeriod(period, key, `install-salt-${i}`);
      for (const q of picked) {
        counts[q.id] = (counts[q.id] ?? 0) + 1;
      }
    }
    for (const slot of QUEST_SLOTS) {
      const pool = getSlotDefinitions(period, slot);
      const expectedRatio = 1 / pool.length;
      for (const q of pool) {
        const observedRatio = (counts[q.id] ?? 0) / N;
        assert.ok(
          Math.abs(observedRatio - expectedRatio) <= 0.05,
          `${period} ${slot} ${q.id}: observed ${(observedRatio * 100).toFixed(1)}% vs expected ${(expectedRatio * 100).toFixed(1)}%`
        );
      }
    }
  }
});

test('Quest Dates: Monday week start stays consistent across Dec->Jan year boundary & leap-year Feb 29', () => {
  assert.strictEqual(getLocalWeekStartKeyFromDateKey('2025-12-29'), '2025-12-29');
  assert.strictEqual(getLocalWeekStartKeyFromDateKey('2025-12-31'), '2025-12-29');
  assert.strictEqual(getLocalWeekStartKeyFromDateKey('2026-01-01'), '2025-12-29');
  assert.strictEqual(getLocalWeekStartKeyFromDateKey('2026-01-04'), '2025-12-29');
  assert.strictEqual(getLocalWeekStartKeyFromDateKey('2026-01-05'), '2026-01-05');

  assert.strictEqual(getLocalWeekStartKeyFromDateKey('2024-02-29'), '2024-02-26');
  assert.strictEqual(getLocalWeekStartKeyFromDateKey('2024-03-03'), '2024-02-26');
  assert.strictEqual(getNextWeeklyStartKey('2024-02-29'), '2024-03-04');

  const wedTs = localTs(2026, 11, 18, 18, 30, 0);
  const cd = getResetCountdown(wedTs);
  assert.strictEqual(cd.nextDailyDateKey, '2026-11-19');
  assert.strictEqual(cd.nextWeeklyStartKey, '2026-11-23');
  assert.strictEqual(cd.dailyResetInMs, (5 * 60 + 30) * 60 * 1000);
  assert.strictEqual(cd.weeklyResetInMs, (4 * 24 * 60 + 5 * 60 + 30) * 60 * 1000);
});

test('Quest Engine: updates Daily and Weekly progress accurately across completed sessions & manual claims (legacy selection)', () => {
  const day1 = localTs(2026, 11, 18, 9, 0, 0);
  let state = createInitialQuestState(day1, { useLegacySelection: true });

  // Session 1: 25m
  state = applyCompletedSession(state, { completedDateKey: '2026-11-18', completedFocusMinutes: 25 }, day1);
  assert.strictEqual(state.daily.daily_first_spark.progress, 1);
  assert.strictEqual(state.daily.daily_first_spark.completed, true);
  assert.strictEqual(state.daily.daily_first_spark.claimed, false);
  assert.strictEqual(state.daily.daily_double_tap.progress, 1);
  assert.strictEqual(state.daily.daily_double_tap.completed, false);
  assert.strictEqual(state.daily.daily_steady_rhythm.progress, 25);
  assert.strictEqual(state.weekly.weekly_habit_builder.progress, 1);
  assert.strictEqual(state.weekly.weekly_deep_diver.progress, 0);
  assert.strictEqual(state.weekly.weekly_tenacity_10.progress, 1);
  assert.strictEqual(countUnclaimed(state, day1), 1);

  assert.strictEqual(canClaim(state, 'DAILY', 'daily_first_spark', day1), true);
  const claim1 = claimQuest(state, 'DAILY', 'daily_first_spark', day1 + 5000);
  assert.strictEqual(claim1.claimed, true);
  assert.strictEqual(claim1.coins, 10);
  assert.strictEqual(claim1.xp, 25);
  state = claim1.state;
  assert.strictEqual(canClaim(state, 'DAILY', 'daily_first_spark', day1 + 6000), false);
  assert.strictEqual(countUnclaimed(state, day1 + 6000), 0);

  const doubleClaim = claimQuest(state, 'DAILY', 'daily_first_spark', day1 + 7000);
  assert.strictEqual(doubleClaim.claimed, false);
  assert.strictEqual(doubleClaim.coins, 0);
  assert.strictEqual(doubleClaim.xp, 0);

  const day1Later = localTs(2026, 11, 18, 14, 0, 0);
  state = applyCompletedSession(state, { completedDateKey: '2026-11-18', completedFocusMinutes: 45 }, day1Later);
  assert.strictEqual(state.daily.daily_double_tap.progress, 2);
  assert.strictEqual(state.daily.daily_double_tap.completed, true);
  assert.strictEqual(state.daily.daily_steady_rhythm.progress, 60);
  assert.strictEqual(state.daily.daily_steady_rhythm.completed, true);
  assert.strictEqual(state.weekly.weekly_habit_builder.progress, 1);
  assert.strictEqual(state.weekly.weekly_deep_diver.progress, 1);
  assert.strictEqual(state.weekly.weekly_tenacity_10.progress, 2);
  assert.strictEqual(countUnclaimed(state, day1Later), 2);
});

test('Quest Pool Metrics: daily_warm_up, daily_deep_hour, daily_pomodoro_pair, weekly_three_days (25m/day threshold), and weekly_three_hundred_minutes', () => {
  const mon = localTs(2026, 11, 16, 10, 0, 0);

  // 1. weekly_three_days requires >= 25m cumulative focus on 3 distinct days
  const threeDaysDef = getQuestDefinition('WEEKLY', 'weekly_three_days')!;
  let s3 = makeStateWithSingleQuest(threeDaysDef, mon);
  // Day 1: 15m only -> counts in weeklyActiveDateKeys, NOT >= 25m
  s3 = applyCompletedSession(s3, { completedDateKey: '2026-11-16', completedFocusMinutes: 15 }, mon);
  assert.strictEqual(s3.weekly.weekly_three_days.progress, 0);
  // Same day another 10m -> total 25m -> 1 qualifying day!
  s3 = applyCompletedSession(s3, { completedDateKey: '2026-11-16', completedFocusMinutes: 10 }, mon + 60_000);
  assert.strictEqual(s3.weekly.weekly_three_days.progress, 1);
  // Day 2: 30m, Day 3: 25m -> 3/3 completed
  const tue = localTs(2026, 11, 17, 10, 0, 0);
  const wed = localTs(2026, 11, 18, 10, 0, 0);
  s3 = applyCompletedSession(s3, { completedDateKey: '2026-11-17', completedFocusMinutes: 30 }, tue);
  s3 = applyCompletedSession(s3, { completedDateKey: '2026-11-18', completedFocusMinutes: 25 }, wed);
  assert.strictEqual(s3.weekly.weekly_three_days.progress, 3);
  assert.strictEqual(s3.weekly.weekly_three_days.completed, true);

  // 2. daily_pomodoro_pair increments strictly on completed Pomodoro intervals (non-Pomodoro = 0, partial stopwatch interval ignored)
  const pomoPairDef = getQuestDefinition('DAILY', 'daily_pomodoro_pair')!;
  let sp = makeStateWithSingleQuest(pomoPairDef, mon);
  sp = applyCompletedSession(
    sp,
    { completedDateKey: '2026-11-16', completedFocusMinutes: 60 },
    mon
  );
  assert.strictEqual(sp.daily.daily_pomodoro_pair.progress, 0);

  // POMODORO_STOPWATCH with 1 completed interval + 20m partial 2nd interval -> ONLY 1 interval credited (1/2, NOT completed)
  const partialSwDelta = toQuestOutcomeDelta(
    makeBaseSnapshot({
      mode: 'POMODORO_STOPWATCH',
      status: 'COMPLETED',
      lastKnownValidFocusMinutes: 45,
      pomodoroConfig: {
        focusDurationMinutes: 25,
        focusIntervalDurationMinutes: 25,
        shortBreakDurationMinutes: 5,
        longBreakDurationMinutes: 15,
        targetFocusSessions: 4,
      },
      pomodoroState: {
        currentPhase: 'FOCUS',
        currentInterval: 2,
        completedFocusCount: 1,
        phaseStartedAt: 1_700_000_000_000,
        phaseTargetDurationMinutes: 25,
        phaseTotalPauseMs: 0,
        totalCompletedFocusMinutes: 25,
        accumulatedCoins: 25,
        accumulatedXp: 75,
      },
    }),
    '2026-11-16'
  );
  assert.deepStrictEqual(partialSwDelta, {
    completedDateKey: '2026-11-16',
    completedFocusMinutes: 25,
    pomodoroCompletedIntervals: 1,
  });
  sp = applyCompletedSession(sp, partialSwDelta!, mon + 60_000);
  assert.strictEqual(sp.daily.daily_pomodoro_pair.progress, 1);
  assert.strictEqual(sp.daily.daily_pomodoro_pair.completed, false);

  // Completing 1 more interval finishes daily_pomodoro_pair (2/2)
  sp = applyCompletedSession(
    sp,
    { completedDateKey: '2026-11-16', completedFocusMinutes: 25, pomodoroCompletedIntervals: 1 },
    mon + 120_000
  );
  assert.strictEqual(sp.daily.daily_pomodoro_pair.progress, 2);
  assert.strictEqual(sp.daily.daily_pomodoro_pair.completed, true);

  // 3. daily_deep_hour (1x >= 60m) vs daily_warm_up (1x >= 25m) vs daily_deep_dive (1x >= 45m)
  const deepHourDef = getQuestDefinition('DAILY', 'daily_deep_hour')!;
  let sdh = makeStateWithSingleQuest(deepHourDef, mon);
  sdh = applyCompletedSession(sdh, { completedDateKey: '2026-11-16', completedFocusMinutes: 45 }, mon);
  assert.strictEqual(sdh.daily.daily_deep_hour.progress, 0);
  sdh = applyCompletedSession(sdh, { completedDateKey: '2026-11-16', completedFocusMinutes: 60 }, mon + 1000);
  assert.strictEqual(sdh.daily.daily_deep_hour.progress, 1);
  assert.strictEqual(sdh.daily.daily_deep_hour.completed, true);

  // 4. weekly_three_hundred_minutes (FOCUS_MINUTES in weekly)
  const w300Def = getQuestDefinition('WEEKLY', 'weekly_three_hundred_minutes')!;
  let sw300 = makeStateWithSingleQuest(w300Def, mon);
  sw300 = applyCompletedSession(sw300, { completedDateKey: '2026-11-16', completedFocusMinutes: 180 }, mon);
  sw300 = applyCompletedSession(sw300, { completedDateKey: '2026-11-17', completedFocusMinutes: 150 }, tue);
  assert.strictEqual(sw300.weekly.weekly_three_hundred_minutes.progress, 300);
  assert.strictEqual(sw300.weekly.weekly_three_hundred_minutes.completed, true);
});

test('Quest Feasibility Simulation: 1x60m, 2x60m, 3x60m (7 days Mon-Sun) across full Daily/Weekly Pool', () => {
  const mondayMs = localTs(2026, 11, 16, 10, 0, 0);

  // Rule: Every Daily quest in Slot A and Slot B MUST be completable by 1x60m in a single day
  for (const def of DAILY_QUEST_DEFINITIONS) {
    if (def.slot === 'A' || def.slot === 'B') {
      let s = makeStateWithSingleQuest(def, mondayMs);
      s = applyCompletedSession(
        s,
        { completedDateKey: '2026-11-16', completedFocusMinutes: 60 },
        mondayMs
      );
      assert.strictEqual(
        s.daily[def.id].completed,
        true,
        `1x60m must complete Daily ${def.slot} quest ${def.id}`
      );
    }
  }

  // Rule: 2x60m and 3x60m complete ALL Daily Countdown quests (and Pomodoro pair completes via 2-interval Pomodoro)
  for (const sessionsPerDay of [2, 3]) {
    for (const def of DAILY_QUEST_DEFINITIONS) {
      let s = makeStateWithSingleQuest(def, mondayMs);
      for (let i = 0; i < sessionsPerDay; i += 1) {
        s = applyCompletedSession(
          s,
          {
            completedDateKey: '2026-11-16',
            completedFocusMinutes: 60,
            ...(def.metric === 'POMODORO_FOCUS_INTERVALS' ? { pomodoroCompletedIntervals: 2 } : {}),
          },
          mondayMs + i * 60_000
        );
      }
      assert.strictEqual(
        s.daily[def.id].completed,
        true,
        `${sessionsPerDay}x60m must complete Daily quest ${def.id}`
      );
    }
  }

  // Rule: Every 'standard' Weekly quest MUST be completable by 1x60m x 7 days (Mon-Sun)
  for (const def of WEEKLY_QUEST_DEFINITIONS) {
    let s = makeStateWithSingleQuest(def, mondayMs);
    for (let d = 0; d < 7; d += 1) {
      const ts = mondayMs + d * 24 * 60 * 60 * 1000;
      const dk = formatLocalDateKey(ts);
      s = applyCompletedSession(s, { completedDateKey: dk, completedFocusMinutes: 60 }, ts);
    }
    if (def.difficulty === 'hard') {
      assert.strictEqual(s.weekly[def.id].completed, false, `Hard quest ${def.id} intentionally needs >7 sessions`);
    } else {
      assert.strictEqual(
        s.weekly[def.id].completed,
        true,
        `1x60m x 7d must complete standard Weekly quest ${def.id}`
      );
    }
  }

  // Rule: 2x60m and 3x60m x 7 days complete ALL Weekly quests (including 'hard')
  for (const sessionsPerDay of [2, 3]) {
    for (const def of WEEKLY_QUEST_DEFINITIONS) {
      let s = makeStateWithSingleQuest(def, mondayMs);
      for (let d = 0; d < 7; d += 1) {
        const ts = mondayMs + d * 24 * 60 * 60 * 1000;
        const dk = formatLocalDateKey(ts);
        for (let i = 0; i < sessionsPerDay; i += 1) {
          s = applyCompletedSession(s, { completedDateKey: dk, completedFocusMinutes: 60 }, ts + i * 60_000);
        }
      }
      assert.strictEqual(
        s.weekly[def.id].completed,
        true,
        `${sessionsPerDay}x60m x 7d must complete Weekly quest ${def.id}`
      );
    }
  }
});

test('Quest Anti-Single-Behavior: 3 Weekly quests are orthogonal — no single play pattern satisfies all 3', () => {
  const sun = localTs(2026, 11, 22, 10, 0, 0);
  let binge = createInitialQuestState(sun, { useLegacySelection: true });
  for (let i = 0; i < 10; i++) {
    binge = applyCompletedSession(binge, { completedDateKey: '2026-11-22', completedFocusMinutes: 25 }, sun + i * 1000);
  }
  assert.strictEqual(binge.weekly.weekly_tenacity_10.completed, true);
  assert.strictEqual(binge.weekly.weekly_habit_builder.completed, false);
  assert.strictEqual(binge.weekly.weekly_habit_builder.progress, 1);
  assert.strictEqual(binge.weekly.weekly_deep_diver.completed, false);
  assert.strictEqual(binge.weekly.weekly_deep_diver.progress, 0);

  let shortOnly = createInitialQuestState(localTs(2026, 11, 16, 9, 0, 0), { useLegacySelection: true });
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

  let deepSparse = createInitialQuestState(localTs(2026, 11, 16, 9, 0, 0), { useLegacySelection: true });
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

test('Quest Rollover: Daily midnight, Weekly Monday, multi-day skip rotate without repeating and expire unclaimed rewards cleanly', () => {
  const fri = localTs(2026, 11, 20, 23, 50, 0);
  let state = createInitialQuestState(fri, { salt: 'rollover-pool-salt' });
  const friDailyIds = Object.keys(state.daily);
  const friWeeklyIds = Object.keys(state.weekly);

  // Complete Slot A (1x60m finishes every Slot A & Slot B quest)
  state = applyCompletedSession(state, { completedDateKey: '2026-11-20', completedFocusMinutes: 60 }, fri);
  assert.strictEqual(canClaim(state, 'DAILY', friDailyIds[0], fri), true);
  assert.strictEqual(canClaim(state, 'DAILY', friDailyIds[1], fri), true);

  // Advance past midnight -> Saturday 2026-11-21 (same week)
  const sat = localTs(2026, 11, 21, 0, 1, 0);
  assert.strictEqual(canClaim(state, 'DAILY', friDailyIds[0], sat), false);
  const satState = rolloverQuestState(state, sat);
  assert.strictEqual(satState.dailyDateKey, '2026-11-21');
  assert.strictEqual(satState.weeklyStartKey, '2026-11-16');
  const satDailyIds = Object.keys(satState.daily);
  assert.strictEqual(satDailyIds.length, 3);
  for (let i = 0; i < 3; i += 1) {
    assert.notStrictEqual(satDailyIds[i], friDailyIds[i], `Must not repeat Friday slot ${QUEST_SLOTS[i]}`);
    assert.strictEqual(satState.daily[satDailyIds[i]].progress, 0);
  }
  // Same-day repeated rollover must NEVER change active quests
  const satAgain = rolloverQuestState(satState, sat + 3_600_000);
  assert.deepStrictEqual(Object.keys(satAgain.daily), satDailyIds);

  // Weekly IDs stayed intact Friday -> Saturday
  assert.deepStrictEqual(Object.keys(satState.weekly), friWeeklyIds);

  // Multi-day skip across next Monday 2026-11-30 (+9 days) -> rotates both Daily & Weekly without throwing
  const skipMon = localTs(2026, 11, 30, 9, 0, 0);
  const skipState = rolloverQuestState(satState, skipMon);
  assert.strictEqual(skipState.dailyDateKey, '2026-11-30');
  assert.strictEqual(skipState.weeklyStartKey, '2026-11-30');
  assert.strictEqual(skipState.weeklyActiveDateKeys.length, 0);
  assert.deepStrictEqual(skipState.weeklyDailyMinutes, {});
  const newWeeklyIds = Object.keys(skipState.weekly);
  assert.strictEqual(newWeeklyIds.length, 3);
  for (let i = 0; i < 3; i += 1) {
    assert.notStrictEqual(newWeeklyIds[i], friWeeklyIds[i], `Must not repeat previous weekly slot ${QUEST_SLOTS[i]}`);
    assert.strictEqual(skipState.weekly[newWeeklyIds[i]].progress, 0);
  }
  assert.strictEqual(skipState.streak.lastCompletedDateKey, '2026-11-20');
});

test('Quest Anti-Clock-Rollback & Ring Buffer: blocks clock-back reroll/reset, double-claim, and caps ledger at 14', () => {
  const day1 = localTs(2026, 11, 18, 10, 0, 0);
  let state = createInitialQuestState(day1, { useLegacySelection: true });
  state = applyCompletedSession(state, { completedDateKey: '2026-11-18', completedFocusMinutes: 25 }, day1);
  state = claimQuest(state, 'DAILY', 'daily_first_spark', day1 + 1000).state;

  const day2 = localTs(2026, 11, 19, 10, 0, 0);
  state = applyCompletedSession(state, { completedDateKey: '2026-11-19', completedFocusMinutes: 30 }, day2);
  const day2DailyIds = Object.keys(state.daily);
  const day2SlotAId = day2DailyIds[0];
  const day2SlotBId = day2DailyIds[1];
  const day2SlotBDef = getActiveQuestDefinitions('DAILY', state)[1];
  const expectedDay2SlotB =
    day2SlotBDef.metric === 'FOCUS_MINUTES' ? Math.min(day2SlotBDef.target, 30) : 0;
  assert.strictEqual(state.dailyDateKey, '2026-11-19');
  assert.strictEqual(state.daily[day2SlotAId].progress >= 1, true);
  assert.strictEqual(state.daily[day2SlotBId].progress, expectedDay2SlotB);

  // Roll system clock BACKWARDS to day 1 -> progress & active quest IDs on day 2 MUST NOT wipe or reroll
  const rolledBack = rolloverQuestState(state, day1 + 5000);
  assert.strictEqual(rolledBack.dailyDateKey, '2026-11-19');
  assert.deepStrictEqual(Object.keys(rolledBack.daily), day2DailyIds);
  assert.strictEqual(rolledBack.daily[day2SlotAId].progress, state.daily[day2SlotAId].progress);
  assert.strictEqual(rolledBack.daily[day2SlotBId].progress, expectedDay2SlotB);
  assert.strictEqual(rolledBack.lastSettledTimestamp, day2);

  // Rolling forward again to an already-processed day2 timestamp must NOT reroll either
  const backForward = rolloverQuestState(rolledBack, day2 + 60_000);
  assert.deepStrictEqual(Object.keys(backForward.daily), day2DailyIds);

  // Attempt session credit with rolled-back completedDateKey must NOT increment day 2 daily quests or regress streak
  const afterBackSession = applyCompletedSession(
    rolledBack,
    { completedDateKey: '2026-11-18', completedFocusMinutes: 60 },
    day1 + 6000
  );
  assert.strictEqual(afterBackSession.daily[day2SlotAId].progress, state.daily[day2SlotAId].progress);
  assert.strictEqual(afterBackSession.daily[day2SlotBId].progress, expectedDay2SlotB);
  assert.strictEqual(afterBackSession.streak.lastCompletedDateKey, '2026-11-19');

  // Ring buffer cap test: claim > 14 times across sequential days -> recentClaimedKeys stays <= 14
  let ledgerState = createInitialQuestState(localTs(2026, 10, 1, 9, 0, 0), { salt: 'ledger-salt' });
  const expectedKeys: string[] = [];
  for (let d = 0; d < 18; d++) {
    const ts = localTs(2026, 10, 1 + d, 9, 0, 0);
    const dk = formatLocalDateKey(ts);
    ledgerState = applyCompletedSession(ledgerState, { completedDateKey: dk, completedFocusMinutes: 25 }, ts);
    const activeSlotA = getActiveQuestDefinitions('DAILY', ledgerState)[0];
    ledgerState = claimQuest(ledgerState, 'DAILY', activeSlotA.id, ts + 500).state;
    expectedKeys.push(`daily:${dk}:${activeSlotA.id}`);
  }
  assert.strictEqual(ledgerState.recentClaimedKeys.length, 14);
  assert.strictEqual(ledgerState.recentClaimedKeys[0], expectedKeys[4]);
  assert.strictEqual(ledgerState.recentClaimedKeys[13], expectedKeys[17]);
});

test('Quest Streak: same day unchanged, +1 next day, >= 2d gap resets to 1 keeping longestDays', () => {
  const d1 = localTs(2026, 11, 10, 10, 0, 0);
  let state = createInitialQuestState(d1, { salt: 'streak-salt' });

  state = applyCompletedSession(state, { completedDateKey: '2026-11-10', completedFocusMinutes: 25 }, d1);
  assert.deepStrictEqual(state.streak, { currentDays: 1, longestDays: 1, lastCompletedDateKey: '2026-11-10' });

  state = applyCompletedSession(state, { completedDateKey: '2026-11-10', completedFocusMinutes: 25 }, d1 + 60000);
  assert.deepStrictEqual(state.streak, { currentDays: 1, longestDays: 1, lastCompletedDateKey: '2026-11-10' });

  const d2 = localTs(2026, 11, 11, 10, 0, 0);
  state = applyCompletedSession(state, { completedDateKey: '2026-11-11', completedFocusMinutes: 25 }, d2);
  const d3 = localTs(2026, 11, 12, 10, 0, 0);
  state = applyCompletedSession(state, { completedDateKey: '2026-11-12', completedFocusMinutes: 25 }, d3);
  assert.deepStrictEqual(state.streak, { currentDays: 3, longestDays: 3, lastCompletedDateKey: '2026-11-12' });

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
    { completedDateKey: dk, completedFocusMinutes: 100, pomodoroCompletedIntervals: 4 }
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

  // 3. STOPWATCH
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

  // 4. POMODORO_STOPWATCH
  assert.deepStrictEqual(
    toQuestOutcomeDelta(
      makeBaseSnapshot({
        mode: 'POMODORO_STOPWATCH',
        status: 'COMPLETED',
        lastKnownValidFocusMinutes: 67,
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
    { completedDateKey: dk, completedFocusMinutes: 50, pomodoroCompletedIntervals: 2 }
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
      daily: { daily_first_spark: { progress: Number.NaN, claimed: 'yes' }, unknown_quest: { progress: 5 } },
      weekly: null,
      weeklyActiveDateKeys: ['2026-01-01', 42],
      weeklyDailyMinutes: { 'bad-key': 10, '2026-11-18': -5 },
      streak: { currentDays: -10, longestDays: Number.POSITIVE_INFINITY, lastCompletedDateKey: 'bad' },
      lastSettledTimestamp: -1,
    },
  ];

  for (const raw of corruptInputs) {
    const sanitized = sanitizeQuestState(raw, nowMs);
    assert.strictEqual(sanitized.dailyDateKey, '2026-11-18');
    assert.strictEqual(sanitized.weeklyStartKey, '2026-11-16');
    const dailyActive = getActiveQuestDefinitions('DAILY', sanitized);
    const weeklyActive = getActiveQuestDefinitions('WEEKLY', sanitized);
    assert.deepStrictEqual(dailyActive.map((q) => q.slot), ['A', 'B', 'C']);
    assert.deepStrictEqual(weeklyActive.map((q) => q.slot), ['A', 'B', 'C']);
    for (const q of dailyActive) {
      assert.strictEqual(sanitized.daily[q.id].progress, 0);
    }
    assert.strictEqual(sanitized.streak.currentDays, 0);
    assert.ok(sanitized.streak.longestDays >= sanitized.streak.currentDays);
  }
});
