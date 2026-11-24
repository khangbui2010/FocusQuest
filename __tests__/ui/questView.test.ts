import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import App, { PopupShell } from '../../src/App.tsx';
import { Navbar } from '../../src/ui/components/Navbar.tsx';
import { QuestView } from '../../src/ui/components/quests/QuestView.tsx';
import {
  computePeriodClaimedSummary,
  formatDailyResetCountdown,
  formatQuestProgressLabel,
  formatWeeklyResetCountdown,
  resolveQuestVisualStatus,
} from '../../src/ui/utils/questFormatting.ts';
import {
  DAILY_QUEST_CAP,
  WEEKLY_QUEST_CAP,
  getQuestDefinition,
  getQuestDefinitionsByPeriod,
} from '../../src/core/quests/questCatalog.ts';
import {
  applyCompletedSession,
  claimQuest,
  countUnclaimed,
  createInitialQuestState,
  getActiveQuestDefinitions,
} from '../../src/core/quests/questEngine.ts';
import { getResetCountdown } from '../../src/core/quests/questDates.ts';
import { I18nProvider } from '../../src/i18n/I18nContext.tsx';
import { EN_MESSAGES } from '../../src/i18n/locales/en.ts';
import { VI_MESSAGES } from '../../src/i18n/locales/vi.ts';
import { translate } from '../../src/i18n/translator.ts';
import { localizeErrorMessage } from '../../src/i18n/errorTranslator.ts';
import { sendExtensionMessage } from '../../src/ui/services/extensionClient.ts';
import {
  ClaimQuestRewardResponseData,
  FullSessionStateResponse,
  GetQuestStateResponseData,
} from '../../src/types/messages.ts';
import { GetQuestStateResponseData as _Unused } from '../../src/types/messages.ts';

void (undefined as unknown as _Unused);

test('Stage 5c Quest Formatting: countdowns, statuses, caps, and progress labels', () => {
  assert.equal(formatDailyResetCountdown(0), '00:00:00');
  assert.equal(formatDailyResetCountdown(-5000), '00:00:00');
  assert.equal(formatDailyResetCountdown(Number.NaN), '00:00:00');
  assert.equal(formatDailyResetCountdown(3661_000), '01:01:01');

  const enT = (key: keyof typeof EN_MESSAGES, params?: Record<string, string | number>) =>
    translate('en', key, params);
  const viT = (key: keyof typeof EN_MESSAGES, params?: Record<string, string | number>) =>
    translate('vi', key, params);

  assert.equal(formatWeeklyResetCountdown(0, enT), '00:00:00');
  assert.equal(formatWeeklyResetCountdown(5 * 3600_000 + 2 * 60_000, enT), '05:02:00');
  assert.equal(formatWeeklyResetCountdown((2 * 24 + 6) * 3600_000, enT), '2d 6h');
  assert.equal(formatWeeklyResetCountdown((2 * 24 + 6) * 3600_000, viT), '2 ngày 6 giờ');

  assert.equal(
    resolveQuestVisualStatus({ progress: 0, target: 2, claimed: false }),
    'IN_PROGRESS'
  );
  assert.equal(
    resolveQuestVisualStatus({ progress: 2, target: 2, claimed: false }),
    'READY'
  );
  assert.equal(
    resolveQuestVisualStatus({ progress: 2, target: 2, claimed: true }),
    'CLAIMED'
  );
  assert.equal(
    resolveQuestVisualStatus({ progress: 2, target: 2, claimed: false }, { isExpired: true }),
    'EXPIRED'
  );

  const now = new Date(2026, 10, 18, 10, 0, 0).getTime();
  let state = createInitialQuestState(now, { useLegacySelection: true });
  state = applyCompletedSession(
    state,
    { completedDateKey: '2026-11-18', completedFocusMinutes: 60 },
    now
  );
  const claimedDaily1 = claimQuest(state, 'DAILY', 'daily_first_spark', now);
  assert.equal(claimedDaily1.claimed, true);

  const summary = computePeriodClaimedSummary('DAILY', claimedDaily1.state);
  assert.equal(summary.claimedCoins, 10);
  assert.equal(summary.claimedXp, 25);
  assert.equal(summary.maxCoins, DAILY_QUEST_CAP.coins);
  assert.equal(summary.maxXp, DAILY_QUEST_CAP.xp);
  assert.equal(summary.claimedCount, 1);
  assert.equal(summary.readyCount, 1); // daily_steady_rhythm ready (60/60)

  const sparkDef = getQuestDefinition('DAILY', 'daily_first_spark')!;
  const steadyDef = getQuestDefinition('DAILY', 'daily_steady_rhythm')!;
  const habitDef = getQuestDefinition('WEEKLY', 'weekly_habit_builder')!;
  const pomoPairDef = getQuestDefinition('DAILY', 'daily_pomodoro_pair')!;
  assert.equal(formatQuestProgressLabel(sparkDef, 5, enT), '1/1 sessions');
  assert.equal(formatQuestProgressLabel(steadyDef, 45, viT), '45/60 phút');
  assert.equal(formatQuestProgressLabel(habitDef, 2, enT), '2/4 days');
  assert.equal(formatQuestProgressLabel(pomoPairDef, 1, viT), '1/2 pha');
  assert.equal(getQuestDefinitionsByPeriod('DAILY').length, 9);
});

test('Stage 5c + 5D-1 QuestView SSR: renders all 4 visual states, Slot badges, Hard tag, countdown, zero reroll button, and EN/VI strings', () => {
  const now = new Date(2026, 10, 18, 12, 0, 0).getTime();
  let qState = createInitialQuestState(now, { useLegacySelection: true });
  qState = applyCompletedSession(
    qState,
    { completedDateKey: '2026-11-18', completedFocusMinutes: 60 },
    now
  );
  const claimRes = claimQuest(qState, 'DAILY', 'daily_first_spark', now);
  assert.equal(claimRes.claimed, true);

  const data: GetQuestStateResponseData = {
    questState: claimRes.state,
    resetCountdown: getResetCountdown(now, claimRes.state),
    unclaimedCount: countUnclaimed(claimRes.state, now),
  };

  const enHtml = renderToString(
    React.createElement(
      I18nProvider,
      { locale: 'en' },
      React.createElement(QuestView, {
        initialData: data,
        expiredQuestKeys: ['weekly_habit_builder'],
      })
    )
  );

  assert.ok(enHtml.includes('data-testid="quest-view"'));
  assert.ok(enHtml.includes('Daily &amp; Weekly Quests'));
  assert.ok(enHtml.includes('1 ready to claim'));
  assert.ok(enHtml.includes('data-testid="quest-card-daily_first_spark" data-quest-status="CLAIMED"'));
  assert.ok(enHtml.includes('data-testid="quest-card-daily_steady_rhythm" data-quest-status="READY"'));
  assert.ok(enHtml.includes('data-testid="quest-claim-btn-daily_steady_rhythm"'));
  assert.ok(enHtml.includes('data-testid="quest-card-daily_double_tap" data-quest-status="IN_PROGRESS"'));
  assert.ok(enHtml.includes('data-testid="quest-card-weekly_habit_builder" data-quest-status="EXPIRED"'));
  assert.ok(enHtml.includes('Slot A · Starter'));
  assert.ok(enHtml.includes('Slot B · Pace'));
  assert.ok(enHtml.includes('Slot C · Challenge'));
  assert.ok(enHtml.includes('data-testid="quest-difficulty-weekly_tenacity_10"'));
  assert.ok(enHtml.includes('New quests in'));
  assert.ok(!enHtml.toLowerCase().includes('reroll'));
  assert.ok(enHtml.includes('Claimed 10/40 Coins · 25/100 XP'));
  assert.ok(enHtml.includes(`Claimed 0/${WEEKLY_QUEST_CAP.coins} Coins · 0/${WEEKLY_QUEST_CAP.xp} XP`));
  assert.ok(enHtml.includes('role="progressbar"'));
  assert.ok(enHtml.includes('Quest Streak'));
  assert.ok(enHtml.includes('Zero passive') || enHtml.includes('no passive Coins'));
  assert.ok(enHtml.includes('First Spark') && enHtml.includes('Steady Rhythm') && enHtml.includes('Deep Diver'));

  const viHtml = renderToString(
    React.createElement(
      I18nProvider,
      { locale: 'vi' },
      React.createElement(QuestView, {
        initialData: data,
        expiredQuestKeys: ['weekly_habit_builder'],
      })
    )
  );
  assert.ok(viHtml.includes('Nhiệm vụ Ngày &amp; Tuần'));
  assert.ok(viHtml.includes('1 thưởng chờ nhận'));
  assert.ok(viHtml.includes('Khe A · Khởi động'));
  assert.ok(viHtml.includes('Nhiệm vụ mới sau'));
  assert.ok(viHtml.includes('Tia Sáng Đầu Tiên'));
  assert.ok(viHtml.includes('Nhịp Điệu Bền Bỉ'));
  assert.ok(viHtml.includes('Chuỗi Nhiệm vụ'));
  assert.ok(viHtml.includes('Đã nhận'));
  assert.ok(viHtml.includes('Hết hạn'));
  assert.ok(viHtml.includes('Đang làm'));
  assert.ok(viHtml.includes('>Nhận<'));

  // Randomized Quest Pool state renders strictly 3 Daily + 3 Weekly cards matching active keys
  const poolState = createInitialQuestState(now, { salt: 'ui-pool-seed' });
  const poolHtml = renderToString(
    React.createElement(
      I18nProvider,
      { locale: 'en' },
      React.createElement(QuestView, {
        initialData: {
          questState: poolState,
          resetCountdown: getResetCountdown(now, poolState),
          unclaimedCount: countUnclaimed(poolState, now),
        },
      })
    )
  );
  for (const def of [...getActiveQuestDefinitions('DAILY', poolState), ...getActiveQuestDefinitions('WEEKLY', poolState)]) {
    assert.ok(poolHtml.includes(`data-testid="quest-card-${def.id}"`));
  }
});

test('Stage 5c Navbar Unclaimed Badge: hidden at 0, shows 1..9, caps >=10 to 9+ in EN and VI', () => {
  const zeroHtml = renderToString(
    React.createElement(Navbar, {
      activeTab: 'map',
      onChangeTab: () => {},
      isSessionActive: false,
      unclaimedQuestCount: 0,
    })
  );
  assert.ok(!zeroHtml.includes('quest-unclaimed-badge'), 'Must hide badge when unclaimed is 0');

  const oneHtml = renderToString(
    React.createElement(Navbar, {
      activeTab: 'map',
      onChangeTab: () => {},
      isSessionActive: false,
      unclaimedQuestCount: 3,
    })
  );
  assert.ok(oneHtml.includes('data-testid="quest-unclaimed-badge"'));
  assert.ok(oneHtml.includes('>3<'));
  assert.ok(oneHtml.includes('3 unclaimed quest rewards'));

  const ninePlusVi = renderToString(
    React.createElement(
      I18nProvider,
      { locale: 'vi' },
      React.createElement(Navbar, {
        activeTab: 'quests',
        onChangeTab: () => {},
        isSessionActive: false,
        unclaimedQuestCount: 12,
      })
    )
  );
  assert.ok(ninePlusVi.includes('data-testid="quest-unclaimed-badge"'));
  assert.ok(ninePlusVi.includes('>9+<'));
  assert.ok(ninePlusVi.includes('12 phần thưởng nhiệm vụ chưa nhận'));
});

test('Stage 5c App Wiring: Quests tab renders QuestView (no Coming soon), Awards placeholder remains untouched, and EN/VI keys match 100%', () => {
  assert.deepStrictEqual(Object.keys(EN_MESSAGES).sort(), Object.keys(VI_MESSAGES).sort());
  assert.equal('quest.placeholder.comingSoon' in EN_MESSAGES, false);
  assert.equal('awards.placeholder.comingSoon' in EN_MESSAGES, true);

  const questsAppHtml = renderToString(
    React.createElement(App, { initialTab: 'quests' })
  );
  assert.ok(!questsAppHtml.includes('quests-placeholder-view'));
  assert.ok(!questsAppHtml.includes('Coming soon'));
  assert.ok(questsAppHtml.includes('data-testid="quest-view-loading"') || questsAppHtml.includes('data-testid="quest-view"'));

  const awardsAppHtml = renderToString(
    React.createElement(App, { initialTab: 'awards' })
  );
  assert.ok(awardsAppHtml.includes('data-testid="awards-placeholder-view"'));
  assert.ok(awardsAppHtml.includes('Coming soon'));

  // PopupShell keeps Awards intact & supports optional unclaimedQuestCount=0
  const popupQuests = renderToString(
    React.createElement(PopupShell, {
      onToggleLanguage: async () => {},
      session: null,
      economy: { focusCoins: 100, totalXP: 200, level: 2 },
      activeProfile: null,
      profiles: [],
      todayStats: null,
      lifetimeFocusMinutes: 25,
      isBlockingActive: false,
      isSessionActive: false,
      civEra: 'STONE_AGE',
      settings: { soundEnabled: false, notificationsEnabled: true, language: 'en' },
      isLoading: false,
      activeTab: 'quests',
      setActiveTab: () => {},
      isHelpOpen: false,
      setIsHelpOpen: () => {},
      isProfileSheetOpen: false,
      setIsProfileSheetOpen: () => {},
      isMusicExpanded: false,
      onToggleMusicExpanded: async () => {},
      musicState: {
        status: 'IDLE',
        currentTrackId: null,
        positionSec: 0,
        durationSec: null,
        volume: 0.7,
        muted: false,
        shuffle: false,
        repeatMode: 'off',
        shuffledOrder: [],
        musicEnabled: false,
        catalogUpdatedAt: null,
        lastUpdatedAt: 0,
        lastError: null,
        lastErrorCode: null,
      },
      musicCatalog: [],
      refreshState: async () => {},
      handleStartSession: async () => {},
      handlePauseSession: async () => {},
      handleResumeSession: async () => {},
      handleGiveUpSession: async () => {},
      handleFinishStopwatch: async () => {},
      handleSkipBreak: async () => {},
      handleResetSession: async () => {},
      handleSwitchProfile: async () => {},
      handleCreateProfile: async () => {},
      handleRenameProfile: async () => {},
      handleDeleteProfile: async () => {},
      handleAddDomain: async () => {},
      handleRemoveDomain: async () => {},
      handleToggleChime: async () => {},
      handlePlayMusicTrack: async () => {},
      handlePauseMusic: async () => {},
      handleResumeMusic: async () => {},
      handleStopMusic: async () => {},
      handleNextMusic: async () => {},
      handlePreviousMusic: async () => {},
      handleSeekMusic: async () => {},
      handleSetMusicVolume: async () => {},
      handleToggleMusicShuffle: async () => {},
      handleCycleMusicRepeat: async () => {},
      handleRefreshMusicCatalog: async () => {},
    })
  );
  assert.ok(!popupQuests.includes('quests-placeholder-view'));
  assert.ok(!popupQuests.includes('quest-unclaimed-badge'));
});

test('Stage 5c Simulator Claim Flow: flat Quest reward updates economy without mutating fq_daily_stats and rejects repeat claims cleanly', async () => {
  const beforeSession = await sendExtensionMessage<FullSessionStateResponse>({
    action: 'GET_SESSION_STATE',
  });
  assert.equal(beforeSession.success, true);
  const beforeCoins = beforeSession.data!.economy.focusCoins;
  const beforeXp = beforeSession.data!.economy.totalXP;
  const beforeTodayStats = { ...beforeSession.data!.todayStats! };

  const questBefore = await sendExtensionMessage<GetQuestStateResponseData>({
    action: 'GET_QUEST_STATE',
  });
  assert.equal(questBefore.success, true);
  assert.equal(questBefore.data!.unclaimedCount >= 1, true);
  const activeSlotA = getActiveQuestDefinitions('DAILY', questBefore.data!.questState)[0];

  const claimRes = await sendExtensionMessage<ClaimQuestRewardResponseData>({
    action: 'CLAIM_QUEST_REWARD',
    payload: { period: 'DAILY', questId: activeSlotA.id },
  });
  assert.equal(claimRes.success, true);
  assert.equal(claimRes.data!.claimedCoins, 10);
  assert.equal(claimRes.data!.claimedXp, 25);
  assert.equal(claimRes.data!.economy.focusCoins, beforeCoins + 10);
  assert.equal(claimRes.data!.economy.totalXP, beforeXp + 25);

  const afterSession = await sendExtensionMessage<FullSessionStateResponse>({
    action: 'GET_SESSION_STATE',
  });
  assert.deepStrictEqual(
    afterSession.data!.todayStats,
    beforeTodayStats,
    'Claiming quest reward MUST NOT mutate todayStats / fq_daily_stats'
  );

  // Repeat claim must reject with QUEST_ALREADY_CLAIMED and clean localized VI error
  const repeatRes = await sendExtensionMessage<ClaimQuestRewardResponseData>({
    action: 'CLAIM_QUEST_REWARD',
    payload: { period: 'DAILY', questId: activeSlotA.id },
  });
  assert.equal(repeatRes.success, false);
  assert.equal(repeatRes.errorCode, 'QUEST_ALREADY_CLAIMED');
  assert.ok(
    localizeErrorMessage('vi', repeatRes.error).includes('đã được nhận trước đó')
  );
});
