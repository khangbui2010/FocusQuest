import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  STONE_AGE_AWARDS_CATALOG,
  areAllActiveDailyQuestsClaimed,
  backfillAwardsFromHistory,
  buildAwardViewModels,
  countMaxedBuildings,
  countUnseenAwards,
  createInitialAwardState,
  evaluateAwards,
  getAwardDefinition,
  markAwardsAsSeen,
  recordPerfectDayInCounters,
  sanitizeAwardState,
} from '../../src/core/awards/index.ts';
import { AwardDefinition, AwardEvaluationContext } from '../../src/types/awards.ts';
import { createInitialCivilizationState } from '../../src/core/civilization/civilizationState.ts';
import { GridMap } from '../../src/core/civilization/gridMap.ts';
import { createInitialQuestState, getActiveQuestDefinitions } from '../../src/core/quests/questEngine.ts';
import { ERA_LEVEL_RULES } from '../../src/core/civilization/eraRules.ts';
import { EN_MESSAGES } from '../../src/i18n/locales/en.ts';
import { VI_MESSAGES } from '../../src/i18n/locales/vi.ts';

function makeBaseContext(overrides?: Partial<AwardEvaluationContext>): AwardEvaluationContext {
  const nowMs = 1770000000000;
  return {
    economy: { focusCoins: 0, totalXP: 0, level: 1 },
    dailyStats: {},
    quests: createInitialQuestState(nowMs),
    civilization: createInitialCivilizationState(),
    todayDateKey: '2026-02-02',
    nowMs,
    ...overrides,
  };
}

test('Awards Catalog: defines all 13 Stone Age awards with strict ordering, valid units, and zero economy rewards', () => {
  assert.equal(STONE_AGE_AWARDS_CATALOG.length, 13);
  const ids = STONE_AGE_AWARDS_CATALOG.map((d) => d.id);
  assert.deepStrictEqual(ids, [
    'focus_hours',
    'focus_sessions',
    'long_haul',
    'focus_streak',
    'quest_keeper',
    'perfect_day',
    'player_level',
    'builder',
    'master_builder',
    'land_clearer',
    'tribe',
    'tribe_complete',
    'era_ready',
  ]);

  for (const def of STONE_AGE_AWARDS_CATALOG) {
    assert.ok(def.tiers.length >= 1);
    assert.equal('rewardPlaceholder' in def, false);
    assert.ok(def.titleKey in EN_MESSAGES);
    assert.ok(def.descriptionKey in EN_MESSAGES);
    assert.ok(def.titleKey in VI_MESSAGES);
    assert.ok(def.descriptionKey in VI_MESSAGES);
    for (let i = 1; i < def.tiers.length; i += 1) {
      assert.ok(def.tiers[i].threshold > def.tiers[i - 1].threshold);
      assert.equal(def.tiers[i].tier, i + 1);
    }
  }

  assert.deepStrictEqual(
    getAwardDefinition('focus_hours')?.tiers.map((t) => t.threshold),
    [60, 600, 3000, 6000, 30000]
  );
  assert.deepStrictEqual(
    getAwardDefinition('focus_sessions')?.tiers.map((t) => t.threshold),
    [1, 10, 50, 100, 500]
  );
  assert.deepStrictEqual(
    getAwardDefinition('quest_keeper')?.tiers.map((t) => t.threshold),
    [1, 10, 30, 75, 150]
  );
  assert.deepStrictEqual(
    getAwardDefinition('perfect_day')?.tiers.map((t) => t.threshold),
    [1, 5, 15, 30, 60]
  );
  assert.deepStrictEqual(
    getAwardDefinition('player_level')?.tiers.map((t) => t.threshold),
    [3, 5, 10, 15, 20]
  );
  assert.deepStrictEqual(
    getAwardDefinition('builder')?.tiers.map((t) => t.threshold),
    [1, 3, 6, 10, 15]
  );
  const masterBuilder = getAwardDefinition('master_builder');
  assert.ok(masterBuilder);
  assert.deepStrictEqual(
    masterBuilder.tiers.map((t) => t.threshold),
    [1, 3, 5, 7, 9]
  );
  assert.equal(getAwardDefinition('tribe_complete')?.tiers.length, 1);
  assert.equal(getAwardDefinition('era_ready')?.tiers.length, 1);
});

test('Awards Engine: master_builder counts only completed upgradeable buildings at Stone Age cap (excludes Campfire and under-construction upgrades)', () => {
  const baseCiv = createInitialCivilizationState();
  const civWithBuildings = {
    ...baseCiv,
    buildings: [
      // Campfire is non-upgradeable -> must NOT count
      { id: 'b_camp', definitionId: 'stone_age_campfire', position: { x: 0, y: 0 }, level: 1, placedAt: 1 },
      // Rock Shelter at Lv.5 (cap) -> counts
      { id: 'b_cave', definitionId: 'stone_age_study_cave', position: { x: 2, y: 0 }, level: ERA_LEVEL_RULES.STONE_AGE.upgradeCap, placedAt: 2 },
      // Hut at Lv.5 but currently under a construction job -> must NOT count
      { id: 'b_hut', definitionId: 'stone_age_hut', position: { x: 0, y: 2 }, level: ERA_LEVEL_RULES.STONE_AGE.upgradeCap, placedAt: 3 },
      // Gathering post at Lv.4 (below cap) -> must NOT count
      { id: 'b_gp', definitionId: 'stone_age_gathering_post', position: { x: 6, y: 0 }, level: ERA_LEVEL_RULES.STONE_AGE.upgradeCap - 1, placedAt: 4 },
    ],
    jobs: [
      {
        id: 'job_1',
        kind: 'upgrade' as const,
        status: 'ACTIVE' as const,
        definitionId: 'stone_age_hut',
        buildingId: 'b_hut',
        targetLevel: ERA_LEVEL_RULES.STONE_AGE.upgradeCap,
        crewRequired: 1,
        totalSeconds: 1800,
        remainingSeconds: 900,
        paidCoins: 100,
        createdAt: 10,
      },
    ],
  };

  assert.equal(countMaxedBuildings(civWithBuildings), 1);
});

test('Awards Engine: evaluates all 13 awards, preserves one-way permanent unlocks after metric drops, and grants 0 Coins / 0 XP', () => {
  const nowMs = 1770000000000;
  const ctx = makeBaseContext({ nowMs });
  const initial = createInitialAwardState();

  // Trigger tier unlocks across metrics via metricOverrides + real counters
  const unlockedRes = evaluateAwards(initial, ctx, {
    metricOverrides: {
      focus_hours: 600, // Lv.2
      focus_sessions: 10, // Lv.2
      long_haul: 60, // Lv.3
      focus_streak: 7, // Lv.2
      quest_keeper: 10, // Lv.2
      perfect_day: 1, // Lv.1
      player_level: 5, // Lv.2
      builder: 3, // Lv.2
      master_builder: 3, // Lv.2
      land_clearer: 1, // Lv.1
      tribe: 3, // Lv.2
      tribe_complete: 1, // Single-level achieved
      era_ready: 1, // Single-level achieved
    },
  });

  assert.equal(unlockedRes.mutated, true);
  assert.ok(unlockedRes.newlyUnlocked.length > 0);
  assert.equal(unlockedRes.unseenCount, unlockedRes.newlyUnlocked.length);
  // Economy untouched (engine doesn't even return or alter coins/XP)
  assert.equal(ctx.economy.focusCoins, 0);
  assert.equal(ctx.economy.totalXP, 0);

  // Now drop metrics back to 0 (e.g. building demolished, era_ready drops after spending coins)
  const droppedRes = evaluateAwards(unlockedRes.nextState, ctx, {
    metricOverrides: {
      focus_hours: 0,
      master_builder: 0,
      era_ready: 0,
    },
  });

  // One-way permanent unlock invariant: previously unlocked tiers MUST stay unlocked with original unlockedAt
  assert.equal(droppedRes.nextState.unlocked.master_builder[1]?.unlockedAt, nowMs);
  assert.equal(droppedRes.nextState.unlocked.master_builder[2]?.unlockedAt, nowMs);
  assert.equal(droppedRes.nextState.unlocked.era_ready[1]?.unlockedAt, nowMs);
  assert.equal(droppedRes.unseenCount, unlockedRes.unseenCount);
});

test('Awards Engine: markAwardsAsSeen clears unseen flags cleanly without touching unlockedAt', () => {
  const ctx = makeBaseContext({ nowMs: 1770000001234 });
  const evalRes = evaluateAwards(createInitialAwardState(), ctx, {
    metricOverrides: { focus_sessions: 10, builder: 1 },
  });
  assert.equal(evalRes.unseenCount, 3); // focus_sessions Lv.1 & Lv.2 + builder Lv.1

  const partial = markAwardsAsSeen(evalRes.nextState, ['builder']);
  assert.equal(partial.mutated, true);
  assert.equal(countUnseenAwards(partial.nextState), 2);
  assert.equal(partial.nextState.unlocked.builder[1].seen, true);
  assert.equal(partial.nextState.unlocked.builder[1].unlockedAt, 1770000001234);

  const all = markAwardsAsSeen(partial.nextState);
  assert.equal(all.mutated, true);
  assert.equal(countUnseenAwards(all.nextState), 0);

  const noop = markAwardsAsSeen(all.nextState);
  assert.equal(noop.mutated, false);
});

test('Awards Engine: dynamically supports future-era Lv.6, exposes level & nextThreshold, and filters by current era', () => {
  const syntheticCatalog: readonly AwardDefinition[] = [
    {
      ...STONE_AGE_AWARDS_CATALOG[0],
      tiers: [
        ...STONE_AGE_AWARDS_CATALOG[0].tiers,
        { tier: 6, threshold: 60000, availableFrom: 'BRONZE_AGE' },
      ],
    },
  ];

  const stoneCtx = makeBaseContext();
  const stoneEval = evaluateAwards(createInitialAwardState(), stoneCtx, {
    catalog: syntheticCatalog,
    metricOverrides: { focus_hours: 65000 },
  });
  assert.equal(stoneEval.viewModels[0].totalAvailableTiers, 5);
  assert.equal(stoneEval.viewModels[0].tiers.length, 5);
  assert.equal(stoneEval.viewModels[0].level, 5);
  assert.equal(stoneEval.viewModels[0].nextThreshold, null);

  const bronzeCtx = makeBaseContext({
    civilization: {
      ...createInitialCivilizationState(),
      era: 'BRONZE_AGE',
    },
  });
  const bronzeEval = evaluateAwards(createInitialAwardState(), bronzeCtx, {
    catalog: syntheticCatalog,
    metricOverrides: { focus_hours: 65000 },
  });
  assert.equal(bronzeEval.viewModels[0].totalAvailableTiers, 6);
  assert.equal(bronzeEval.viewModels[0].tiers.length, 6);
  assert.equal(bronzeEval.viewModels[0].level, 6);
  assert.equal(bronzeEval.viewModels[0].highestTierUnlocked, 6);
  assert.equal(bronzeEval.viewModels[0].nextThreshold, null);
  assert.equal(bronzeEval.viewModels[0].isMaxed, true);
  assert.deepStrictEqual(bronzeEval.levels.focus_hours, { level: 6, nextThreshold: null });
});

test('Awards Engine: checks strictly below, exact, and strictly above every tier threshold for all 13 awards', () => {
  const ctx = makeBaseContext();
  for (const def of STONE_AGE_AWARDS_CATALOG) {
    for (let idx = 0; idx < def.tiers.length; idx += 1) {
      const tierSpec = def.tiers[idx];
      const expectedPrevLevel = idx;
      const belowVal = Math.max(0, tierSpec.threshold - 1);
      const belowRes = evaluateAwards(createInitialAwardState(), ctx, {
        catalog: [def],
        metricOverrides: { [def.id]: belowVal },
      });
      assert.equal(
        belowRes.levels[def.id]?.level,
        expectedPrevLevel,
        `${def.id} must be Lv.${expectedPrevLevel} below tier ${tierSpec.tier} at ${belowVal}`
      );
      assert.equal(belowRes.levels[def.id]?.nextThreshold, tierSpec.threshold);
      assert.equal(belowRes.viewModels[0].level, expectedPrevLevel);
      assert.equal(belowRes.viewModels[0].nextThreshold, tierSpec.threshold);

      const exactRes = evaluateAwards(createInitialAwardState(), ctx, {
        catalog: [def],
        metricOverrides: { [def.id]: tierSpec.threshold },
      });
      assert.equal(
        exactRes.levels[def.id]?.level,
        tierSpec.tier,
        `${def.id} must be Lv.${tierSpec.tier} at exact ${tierSpec.threshold}`
      );
      const expectedNext = idx + 1 < def.tiers.length ? def.tiers[idx + 1].threshold : null;
      assert.equal(exactRes.levels[def.id]?.nextThreshold, expectedNext);
      assert.equal(exactRes.viewModels[0].isSingleLevel, def.tiers.length === 1);

      const aboveVal =
        expectedNext !== null
          ? Math.min(tierSpec.threshold + 1, expectedNext - 1)
          : tierSpec.threshold + 1;
      const aboveRes = evaluateAwards(createInitialAwardState(), ctx, {
        catalog: [def],
        metricOverrides: { [def.id]: aboveVal },
      });
      assert.equal(
        aboveRes.levels[def.id]?.level,
        tierSpec.tier,
        `${def.id} must stay Lv.${tierSpec.tier} above tier ${tierSpec.tier} at ${aboveVal}`
      );
      assert.equal(aboveRes.levels[def.id]?.nextThreshold, expectedNext);
    }
  }
});

test('Awards Engine: all 13 Stone Age awards reach max level cleanly under real Stone Age limits without metricOverrides', () => {
  const nowMs = 1770000000000;
  const baseCiv = createInitialCivilizationState();
  const extraChunks = Array.from({ length: 15 }, (_, idx) => ({
    id: `chunk_extra_${idx}`,
    origin: { x: (idx + 2) * 4, y: 0 },
    dimensions: { width: 4, height: 4 },
  }));

  const realStoneAgeBuildings = [
    { id: 'c1', definitionId: 'stone_age_campfire', position: { x: 0, y: 0 }, level: 1, placedAt: 1 },
    { id: 'c2', definitionId: 'stone_age_campfire', position: { x: 1, y: 0 }, level: 1, placedAt: 2 },
    { id: 'c3', definitionId: 'stone_age_campfire', position: { x: 2, y: 0 }, level: 1, placedAt: 3 },
    { id: 't1', definitionId: 'stone_age_totem', position: { x: 3, y: 0 }, level: 1, placedAt: 4 },
    { id: 't2', definitionId: 'stone_age_totem', position: { x: 4, y: 0 }, level: 1, placedAt: 5 },
    { id: 't3', definitionId: 'stone_age_totem', position: { x: 5, y: 0 }, level: 1, placedAt: 6 },
    { id: 'eh1', definitionId: 'stone_age_elder_hut', position: { x: 0, y: 2 }, level: 1, placedAt: 7 },
    { id: 'eh2', definitionId: 'stone_age_elder_hut', position: { x: 5, y: 2 }, level: 1, placedAt: 8 },
    { id: 'cave1', definitionId: 'stone_age_study_cave', position: { x: 2, y: 2 }, level: 5, placedAt: 9 },
    { id: 'fp1', definitionId: 'stone_age_foraging_post', position: { x: 8, y: 0 }, level: 5, placedAt: 10 },
    { id: 'fp2', definitionId: 'stone_age_foraging_post', position: { x: 12, y: 0 }, level: 5, placedAt: 11 },
    { id: 'fp3', definitionId: 'stone_age_foraging_post', position: { x: 16, y: 0 }, level: 5, placedAt: 12 },
    { id: 'fp4', definitionId: 'stone_age_foraging_post', position: { x: 20, y: 0 }, level: 5, placedAt: 13 },
    { id: 'fg1', definitionId: 'stone_age_food_cache', position: { x: 24, y: 0 }, level: 5, placedAt: 14 },
    { id: 'fg2', definitionId: 'stone_age_food_cache', position: { x: 28, y: 0 }, level: 5, placedAt: 15 },
    { id: 'fg3', definitionId: 'stone_age_food_cache', position: { x: 32, y: 0 }, level: 5, placedAt: 16 },
    { id: 'fg4', definitionId: 'stone_age_food_cache', position: { x: 36, y: 0 }, level: 5, placedAt: 17 },
  ];
  assert.equal(realStoneAgeBuildings.length, 17);

  // 500 sessions * 60 mins = 30,000 mins across 60 consecutive days ending 2026-02-02:
  // 20 days * 9 sessions/day (540m) + 40 days * 8 sessions/day (480m) = 500 sessions & 30,000 mins
  const dailyStats: AwardEvaluationContext['dailyStats'] = {};
  const endDate = new Date(Date.UTC(2026, 1, 2));
  for (let d = 0; d < 60; d += 1) {
    const dt = new Date(endDate.getTime() - d * 86_400_000);
    const key = dt.toISOString().slice(0, 10);
    const sessions = d < 20 ? 9 : 8;
    const mins = sessions * 60;
    dailyStats[key] = {
      date: key,
      totalFocusMinutes: mins,
      completedSessions: sessions,
      abandonedSessions: 0,
      coinsEarned: mins * 2,
      xpEarned: mins * 5,
    };
  }

  const realState = {
    ...createInitialAwardState(),
    counters: {
      longestSessionMinutes: 120,
      maxFocusStreakDays: 60,
      totalQuestsClaimed: 150,
      perfectDaysCount: 60,
      perfectDayDateKeys: [],
      totalBuildingsBuilt: realStoneAgeBuildings.length,
    },
  };

  // Level 20 requires 19*20/2 * 100 = 19,000 XP (500 x 60m sessions yield >= 150,000 XP)
  const realCtx = makeBaseContext({
    nowMs,
    todayDateKey: '2026-02-02',
    economy: { focusCoins: 500, totalXP: 19000, level: 20 },
    dailyStats,
    civilization: {
      ...baseCiv,
      era: 'STONE_AGE',
      founderRole: 'elder',
      villagers: Array.from({ length: 9 }, (_, i) => ({
        id: `v_${i + 1}`,
        role: i % 2 === 0 ? ('crafter' as const) : ('woodworker' as const),
        recruitedAt: nowMs,
      })),
      grid: {
        ...baseCiv.grid,
        chunks: [...baseCiv.grid.chunks, ...extraChunks],
      },
      buildings: realStoneAgeBuildings,
    },
  });

  const res = evaluateAwards(realState, realCtx);
  assert.equal(res.viewModels.length, 13);
  for (const vm of res.viewModels) {
    assert.equal(vm.level, vm.totalAvailableTiers, `${vm.id} should hit max Stone Age level`);
    assert.equal(vm.nextThreshold, null, `${vm.id} should have null nextThreshold when maxed`);
    assert.equal(vm.isMaxed, true, `${vm.id} should be isMaxed`);
  }
});

test('Awards Engine: backfillAwardsFromHistory marks prior achievements seen and computes perfect_day/builder/tribe', () => {
  const nowMs = 1770000000000;
  const quests = createInitialQuestState(nowMs);
  const dailyDefs = getActiveQuestDefinitions('DAILY', quests);
  const claimedDaily = { ...quests.daily };
  for (const d of dailyDefs) {
    claimedDaily[d.id] = {
      questId: d.id,
      period: 'DAILY',
      progress: d.target,
      target: d.target,
      completed: true,
      claimed: true,
      claimedAt: nowMs,
    };
  }
  const fullDailyQuests = { ...quests, daily: claimedDaily };
  assert.equal(areAllActiveDailyQuestsClaimed(fullDailyQuests), true);

  const baseCiv = createInitialCivilizationState();
  const gm = GridMap.fromSnapshot(baseCiv.grid);
  gm.placeBuilding('b1', { x: 0, y: 0 }, { width: 1, height: 1 });
  const ctx = makeBaseContext({
    nowMs,
    economy: { focusCoins: 500, totalXP: 300, level: 3 },
    dailyStats: {
      '2026-02-02': {
        date: '2026-02-02',
        totalFocusMinutes: 65,
        completedSessions: 2,
        abandonedSessions: 0,
        coinsEarned: 130,
        xpEarned: 325,
      },
    },
    quests: fullDailyQuests,
    civilization: {
      ...baseCiv,
      grid: gm.toSnapshot(),
      founderRole: 'elder',
      villagers: [
        { id: 'v1', role: 'crafter', recruitedAt: nowMs },
        { id: 'v2', role: 'woodworker', recruitedAt: nowMs },
      ],
      buildings: [
        { id: 'b1', definitionId: 'stone_age_campfire', position: { x: 0, y: 0 }, level: 1, placedAt: nowMs },
      ],
    },
  });

  const backfill = backfillAwardsFromHistory(undefined, ctx);
  assert.equal(backfill.unseenCount, 0);
  assert.equal(backfill.nextState.counters.perfectDaysCount, 1);
  assert.equal(backfill.nextState.counters.totalQuestsClaimed, 3);
  assert.equal(backfill.nextState.counters.totalBuildingsBuilt, 1);
  assert.ok(backfill.nextState.unlocked.focus_hours[1]?.seen);
  assert.ok(backfill.nextState.unlocked.tribe_complete[1]?.seen);
  assert.ok(backfill.nextState.unlocked.perfect_day[1]?.seen);
});

test('Awards State Hygiene & Purity: sanitizes corrupt payloads, deduplicates perfectDayDateKeys, avoids Date.now/Math.random, and avoids lore/magic wording', () => {
  const corrupt = sanitizeAwardState({
    version: -5,
    unlocked: {
      focus_hours: {
        '0': { unlockedAt: 100, seen: false },
        '1': { unlockedAt: -10, seen: 1 },
      },
      '': { '1': { unlockedAt: 10, seen: true } },
    },
    counters: {
      longestSessionMinutes: -9,
      perfectDayDateKeys: ['2026-02-01', 'invalid', '2026-02-01'],
    },
  });
  assert.equal(corrupt.version, 1);
  assert.equal(corrupt.unlocked.focus_hours[0], undefined);
  assert.equal(corrupt.unlocked.focus_hours[1]?.unlockedAt, 0);
  assert.equal(corrupt.unlocked.focus_hours[1]?.seen, true);
  assert.equal(corrupt.counters.longestSessionMinutes, 0);
  assert.deepStrictEqual(corrupt.counters.perfectDayDateKeys, ['2026-02-01']);

  const deduped = recordPerfectDayInCounters(corrupt.counters, '2026-02-01');
  assert.equal(deduped.perfectDaysCount, 1);

  const awardsDir = path.resolve(import.meta.dirname, '../../src/core/awards');
  for (const file of fs.readdirSync(awardsDir)) {
    const src = fs.readFileSync(path.join(awardsDir, file), 'utf8');
    assert.equal(src.includes('Date.now('), false, `${file} must not call Date.now()`);
    assert.equal(src.includes('Math.random('), false, `${file} must not call Math.random()`);
    assert.equal(/\bsrc\/ui\b|\.\.\/\.\.\/ui\//.test(src), false, `${file} must not import from src/ui/`);
  }

  // Zero lore / magic / supernatural words in Awards EN & VI copy
  const bannedWords = /\b(magic|spell|sorcery|alchemy|mana|wizard|enchanted|ma thuật|phép thuật|linh hồn|huyền bí)\b/i;
  for (const def of STONE_AGE_AWARDS_CATALOG) {
    assert.equal(bannedWords.test(EN_MESSAGES[def.titleKey as keyof typeof EN_MESSAGES]), false);
    assert.equal(bannedWords.test(EN_MESSAGES[def.descriptionKey as keyof typeof EN_MESSAGES]), false);
    assert.equal(bannedWords.test(VI_MESSAGES[def.titleKey as keyof typeof VI_MESSAGES]), false);
    assert.equal(bannedWords.test(VI_MESSAGES[def.descriptionKey as keyof typeof VI_MESSAGES]), false);
  }
});
