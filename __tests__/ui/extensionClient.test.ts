import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEV_SERVER_MOCK_LIMITS,
  buildSimulatedDailyStats,
  createInitialMockState,
  createInitialSimulatedQuestState,
  getDailyStatsClient,
  isChromeExtension,
  isDevServerMockMode,
  sendExtensionMessage,
} from '../../src/ui/services/extensionClient.ts';
import { FullSessionStateResponse } from '../../src/types/messages.ts';
import { SessionSnapshot } from '../../src/types/session.ts';
import { FocusProfile } from '../../src/types/profiles.ts';
import { DailyStatRecord } from '../../src/types/storageSchema.ts';
import { calculatePlayerLevel } from '../../src/core/economy/levelSystem.ts';
import { countUnclaimed, rolloverQuestState } from '../../src/core/quests/questEngine.ts';
import {
  aggregateMonthStats,
  aggregateYearStats,
  calculateFocusStreak,
} from '../../src/core/stats/statsAggregator.ts';

test('UI ExtensionClient: isChromeExtension returns boolean without error', () => {
  const result = isChromeExtension();
  assert.equal(typeof result, 'boolean');
});

test('UI ExtensionClient: GET_SESSION_STATE returns full operational state in simulation fallback', async () => {
  const res = await sendExtensionMessage<FullSessionStateResponse>({
    action: 'GET_SESSION_STATE',
  });

  assert.equal(res.success, true);
  assert.ok(res.data, 'Must return state data');
  assert.equal(typeof res.data?.economy.focusCoins, 'number');
  assert.equal(typeof res.data?.economy.totalXP, 'number');
  assert.equal(typeof res.data?.economy.level, 'number');
});

test('UI ExtensionClient: GET_PROFILES returns initial profile list', async () => {
  const res = await sendExtensionMessage<FocusProfile[]>({
    action: 'GET_PROFILES',
  });

  assert.equal(res.success, true);
  assert.ok(Array.isArray(res.data));
  assert.ok(res.data.length >= 2, 'Must contain default profiles');
});

test('UI ExtensionClient: full session lifecycle flow (START -> PAUSE -> RESUME -> GIVE_UP -> RESET)', async () => {
  // 1. Start Countdown session
  const startRes = await sendExtensionMessage<SessionSnapshot>({
    action: 'START_SESSION',
    payload: {
      mode: 'COUNTDOWN',
      targetMinutes: 25,
      profileId: 'profile-study-research',
    },
  });
  assert.equal(startRes.success, true);
  assert.equal(startRes.data?.status, 'RUNNING');
  assert.equal(startRes.data?.targetMinutes, 25);

  // 2. Pause session
  const pauseRes = await sendExtensionMessage<SessionSnapshot>({
    action: 'PAUSE_SESSION',
  });
  assert.equal(pauseRes.success, true);
  assert.equal(pauseRes.data?.status, 'PAUSED');
  assert.equal(pauseRes.data?.pauseCount, 1);

  // 3. Resume session
  const resumeRes = await sendExtensionMessage<SessionSnapshot>({
    action: 'RESUME_SESSION',
  });
  assert.equal(resumeRes.success, true);
  assert.equal(resumeRes.data?.status, 'RUNNING');

  // 4. Give up session
  const giveUpRes = await sendExtensionMessage<SessionSnapshot>({
    action: 'GIVE_UP_SESSION',
  });
  assert.equal(giveUpRes.success, true);
  assert.equal(giveUpRes.data?.status, 'ABANDONED');

  // 5. Reset session back to IDLE
  const resetRes = await sendExtensionMessage({
    action: 'RESET_SESSION',
  });
  assert.equal(resetRes.success, true);

  // 6. Verify state is now null (IDLE)
  const stateRes = await sendExtensionMessage<FullSessionStateResponse>({
    action: 'GET_SESSION_STATE',
  });
  assert.equal(stateRes.success, true);
  assert.equal(stateRes.data?.currentSession, null);
});

test('UI ExtensionClient: profile and domain modification messages operate accurately', async () => {
  // 1. Create a new profile
  const createRes = await sendExtensionMessage<FocusProfile>({
    action: 'CREATE_PROFILE',
    payload: { name: 'Deep Work Lab' },
  });
  assert.equal(createRes.success, true);
  assert.equal(createRes.data?.name, 'Deep Work Lab');
  const profileId = createRes.data?.id as string;
  assert.ok(profileId);

  // 2. Switch to this profile
  const switchRes = await sendExtensionMessage<FocusProfile>({
    action: 'SWITCH_PROFILE',
    payload: { profileId },
  });
  assert.equal(switchRes.success, true);
  assert.equal(switchRes.data?.id, profileId);

  // 3. Add domain
  const addRes = await sendExtensionMessage<FocusProfile>({
    action: 'ADD_DOMAIN',
    payload: { profileId, domainPattern: 'docs.google.com' },
  });
  assert.equal(addRes.success, true);
  assert.ok(addRes.data?.allowedDomains.includes('docs.google.com'));

  // 4. Remove domain
  const removeRes = await sendExtensionMessage<FocusProfile>({
    action: 'REMOVE_DOMAIN',
    payload: { profileId, domainPattern: 'docs.google.com' },
  });
  assert.equal(removeRes.success, true);
  assert.ok(!removeRes.data?.allowedDomains.includes('docs.google.com'));
});

test('UI ExtensionClient: rejects domain and profile modifications during simulated active session', async () => {
  // Start session
  await sendExtensionMessage({
    action: 'START_SESSION',
    payload: {
      mode: 'COUNTDOWN',
      targetMinutes: 25,
      profileId: 'profile-study-research',
    },
  });

  // Attempt to add domain during session
  const addRes = await sendExtensionMessage({
    action: 'ADD_DOMAIN',
    payload: { profileId: 'profile-study-research', domainPattern: 'reddit.com' },
  });
  assert.equal(addRes.success, false);
  assert.equal(addRes.error, 'Allowlist cannot be modified during a focus session. Finish your session first.');

  // Attempt to remove domain during session
  const removeRes = await sendExtensionMessage({
    action: 'REMOVE_DOMAIN',
    payload: { profileId: 'profile-study-research', domainPattern: 'github.com' },
  });
  assert.equal(removeRes.success, false);
  assert.equal(removeRes.error, 'Allowlist cannot be modified during a focus session. Finish your session first.');

  // Attempt to switch profile during session
  const switchRes = await sendExtensionMessage({
    action: 'SWITCH_PROFILE',
    payload: { profileId: 'profile-deep-work-coding' },
  });
  assert.equal(switchRes.success, false);
  assert.equal(switchRes.error, 'Cannot switch active profile during a focus session. Finish your session first.');

  // Reset session
  await sendExtensionMessage({ action: 'RESET_SESSION' });
});

test('UI ExtensionClient (5b): GET_ACTIVE_PROFILE, RENAME_PROFILE, and DELETE_PROFILE mirror ProfileManager rules', async () => {
  // 1. GET_ACTIVE_PROFILE returns current active profile
  const activeRes = await sendExtensionMessage<FocusProfile>({
    action: 'GET_ACTIVE_PROFILE',
  });
  assert.equal(activeRes.success, true);
  assert.ok(activeRes.data?.id);

  // 2. Create a temporary profile and switch to it
  const createRes = await sendExtensionMessage<FocusProfile>({
    action: 'CREATE_PROFILE',
    payload: { name: 'Sprint Mode' },
  });
  assert.equal(createRes.success, true);
  const createdId = createRes.data!.id;

  const switchRes = await sendExtensionMessage<FocusProfile>({
    action: 'SWITCH_PROFILE',
    payload: { profileId: createdId },
  });
  assert.equal(switchRes.success, true);

  // 3. RENAME_PROFILE validates empty, duplicate (case-insensitive), and succeeds when valid
  const emptyRename = await sendExtensionMessage<FocusProfile>({
    action: 'RENAME_PROFILE',
    payload: { profileId: createdId, newName: '   ' },
  });
  assert.equal(emptyRename.success, false);
  assert.match(emptyRename.error || '', /cannot be empty/i);

  const dupRename = await sendExtensionMessage<FocusProfile>({
    action: 'RENAME_PROFILE',
    payload: { profileId: createdId, newName: 'study & research' },
  });
  assert.equal(dupRename.success, false);
  assert.match(dupRename.error || '', /already exists/i);

  const renameRes = await sendExtensionMessage<FocusProfile>({
    action: 'RENAME_PROFILE',
    payload: { profileId: createdId, newName: 'Sprint Mode v2' },
  });
  assert.equal(renameRes.success, true);
  assert.equal(renameRes.data?.name, 'Sprint Mode v2');

  // 4. Rejects RENAME_PROFILE and DELETE_PROFILE during an active session
  await sendExtensionMessage({
    action: 'START_SESSION',
    payload: {
      mode: 'COUNTDOWN',
      targetMinutes: 25,
      profileId: createdId,
    },
  });

  const lockedRename = await sendExtensionMessage({
    action: 'RENAME_PROFILE',
    payload: { profileId: createdId, newName: 'Locked Rename' },
  });
  assert.equal(lockedRename.success, false);
  assert.equal(
    lockedRename.error,
    'Cannot rename profile during a focus session. Finish your session first.'
  );

  const lockedDelete = await sendExtensionMessage({
    action: 'DELETE_PROFILE',
    payload: { profileId: createdId },
  });
  assert.equal(lockedDelete.success, false);
  assert.equal(
    lockedDelete.error,
    'Cannot delete profile during a focus session. Finish your session first.'
  );

  await sendExtensionMessage({ action: 'GIVE_UP_SESSION' });
  await sendExtensionMessage({ action: 'RESET_SESSION' });

  // 5. Deleting active profile auto-switches activeProfileId to remaining profile
  const deleteRes = await sendExtensionMessage<{
    deletedProfile: FocusProfile;
    newActiveProfileId: string;
  }>({
    action: 'DELETE_PROFILE',
    payload: { profileId: createdId },
  });
  assert.equal(deleteRes.success, true);
  assert.ok(deleteRes.data);
  assert.equal(deleteRes.data!.deletedProfile.id, createdId);
  assert.ok(deleteRes.data!.newActiveProfileId && deleteRes.data!.newActiveProfileId !== createdId);

  const afterProfiles = await sendExtensionMessage<FocusProfile[]>({
    action: 'GET_PROFILES',
  });
  assert.equal(afterProfiles.success, true);
  assert.ok(!afterProfiles.data!.some((p) => p.id === createdId));

  const afterActive = await sendExtensionMessage<FocusProfile>({
    action: 'GET_ACTIVE_PROFILE',
  });
  assert.equal(afterActive.success, true);
  assert.equal(afterActive.data?.id, deleteRes.data!.newActiveProfileId);

  // Restore default active profile for clean subsequent tests
  await sendExtensionMessage({
    action: 'SWITCH_PROFILE',
    payload: { profileId: 'profile-study-research' },
  });
});

test('UI ExtensionClient (5B.6a): EXPAND_LAND simulator matches backend Level, Coins, and origin-only rules', async () => {
  // Rejects deprecated direction payload
  const dirRes = await sendExtensionMessage({
    action: 'EXPAND_LAND',
    payload: { direction: 'EAST' } as unknown as { origin: { x: number; y: number } },
  });
  assert.equal(dirRes.success, false);

  // Rejects non-aligned origin
  const unalignedRes = await sendExtensionMessage({
    action: 'EXPAND_LAND',
    payload: { origin: { x: 5, y: 0 } },
  });
  assert.equal(unalignedRes.success, false);
  assert.match(unalignedRes.error || '', /INVALID_ORIGIN/);

  // Rejects non-adjacent origin without deducting Coins
  const nonAdjacentRes = await sendExtensionMessage({
    action: 'EXPAND_LAND',
    payload: { origin: { x: 16, y: 16 } },
  });
  assert.equal(nonAdjacentRes.success, false);

  // Valid k=1 expansion at (8, 0): default mockState starts at 120 Coins, Lv. 3 -> costs 60, leaves 60
  const okRes = await sendExtensionMessage<{
    newChunk: { x: number; y: number };
    economy: { focusCoins: number };
    cost: number;
    civilizationState: { grid: { chunks: unknown[] } };
  }>({
    action: 'EXPAND_LAND',
    payload: { origin: { x: 8, y: 0 } },
  });
  assert.equal(okRes.success, true, `Expected simulator EXPAND_LAND success, got ${okRes.error}`);
  assert.deepEqual(okRes.data?.newChunk, { x: 8, y: 0 });
  assert.equal(okRes.data?.cost, 60);
  assert.equal(okRes.data?.economy.focusCoins, 60);
  assert.equal(okRes.data?.civilizationState.grid.chunks.length, 5);

  // Subsequent k=2 blocked by Level 4 gate (default simulator is Lv. 3)
  const levelGateRes = await sendExtensionMessage({
    action: 'EXPAND_LAND',
    payload: { origin: { x: -4, y: 0 } },
  });
  assert.equal(levelGateRes.success, false);
  assert.match(levelGateRes.error || '', /Player Level 4/);
});

test('UI ExtensionClient (Stage 3): GET_DAILY_STATS simulator returns deterministic ~400-day dataset with gaps & streaks', async () => {
  const firstRes = await getDailyStatsClient();
  const secondRes = await sendExtensionMessage<Record<string, DailyStatRecord>>({
    action: 'GET_DAILY_STATS',
  });

  assert.equal(firstRes.success, true);
  assert.equal(secondRes.success, true);
  assert.deepEqual(firstRes.data, secondRes.data, 'Simulated GET_DAILY_STATS must be deterministic');

  const records = firstRes.data!;
  const keys = Object.keys(records).sort();
  assert.ok(keys.length >= 250 && keys.length <= 405, `Expected dense ~13 month subset, got ${keys.length}`);

  const fixedAnchor = '2026-11-17';
  const fixedA = buildSimulatedDailyStats(fixedAnchor);
  const fixedB = buildSimulatedDailyStats(fixedAnchor);
  assert.deepEqual(fixedA, fixedB);

  // Covers rest weeks, gap days, Day/Month/Year & realistic streaks
  const streak = calculateFocusStreak(fixedA, fixedAnchor);
  assert.ok(streak.current >= 5, `Expected current streak >= 5, got ${streak.current}`);
  assert.ok(streak.longest >= 16, `Expected longest streak >= 16, got ${streak.longest}`);
  assert.ok(streak.current <= streak.longest);

  const month = aggregateMonthStats(fixedA, '2026-11');
  assert.ok(month.activeDays > 0 && month.activeDays < month.daysInMonth, 'Month must include both active & rest days');
  const year = aggregateYearStats(fixedA, '2026');
  assert.equal(year.months.length, 12);
  assert.ok(
    year.months.slice(0, 11).every((m) => m.focusMinutes > 0),
    'Jan-Nov 2026 months should have focus activity'
  );
  assert.equal(year.months[11].focusMinutes, 0, 'Dec 2026 is after 2026-11-17 anchor');
  const prevYear = aggregateYearStats(fixedA, '2025');
  assert.ok(prevYear.totalFocusMinutes > 0, '405-day span must include late 2025 history');
});

test('UI ExtensionClient (Dev Server Only): max/infinite mock data activates strictly when devServerMode is true', () => {
  assert.equal(isDevServerMockMode(), false, 'Node test runner must NOT enable dev-server mock overrides');

  const nowMs = Date.UTC(2026, 10, 17, 10, 0, 0);
  const devState = createInitialMockState(true, nowMs);

  assert.equal(devState.economy.focusCoins, DEV_SERVER_MOCK_LIMITS.focusCoins);
  assert.equal(devState.economy.totalXP, DEV_SERVER_MOCK_LIMITS.totalXP);
  assert.equal(devState.economy.level, 9999);
  assert.equal(devState.economy.level, calculatePlayerLevel(devState.economy.totalXP));
  assert.equal(devState.lifetimeFocusMinutes, DEV_SERVER_MOCK_LIMITS.lifetimeFocusMinutes);
  assert.equal(devState.todayStats?.totalFocusMinutes, DEV_SERVER_MOCK_LIMITS.dailyFocusMinutes);
  assert.equal(devState.todayStats?.completedSessions, DEV_SERVER_MOCK_LIMITS.dailyCompletedSessions);
  assert.equal(devState.todayStats?.abandonedSessions, 0);

  const devQuests = createInitialSimulatedQuestState(nowMs, true);
  const rolledQuests = rolloverQuestState(devQuests, nowMs);
  assert.equal(countUnclaimed(rolledQuests, nowMs), 6);
  assert.equal(rolledQuests.streak.currentDays, DEV_SERVER_MOCK_LIMITS.questStreakDays);
  assert.equal(rolledQuests.streak.longestDays, DEV_SERVER_MOCK_LIMITS.questStreakDays);

  const devStats = buildSimulatedDailyStats('2026-11-17', null, true);
  const devStreak = calculateFocusStreak(devStats, '2026-11-17');
  assert.equal(devStreak.current, 405);
  assert.equal(devStreak.longest, 405);

  const devOct = aggregateMonthStats(devStats, '2026-10');
  assert.equal(devOct.activeDays, devOct.daysInMonth);
  assert.equal(devOct.completionRate, 1);
  assert.equal(devOct.peakDay?.focusMinutes, DEV_SERVER_MOCK_LIMITS.dailyFocusMinutes);

  const devNov = aggregateMonthStats(devStats, '2026-11');
  assert.equal(devNov.activeDays, 17);
  assert.equal(devNov.completionRate, 1);
});
