import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { I18nProvider } from '../../src/i18n/I18nContext.tsx';
import { EN_MESSAGES } from '../../src/i18n/locales/en.ts';
import { VI_MESSAGES } from '../../src/i18n/locales/vi.ts';
import {
  AwardsView,
  AwardDetailsModal,
  AwardIcon,
  getAwardLevelBand,
  getAwardLevelFrameClass,
  sortAwardsForDisplay,
} from '../../src/ui/components/awards/index.ts';
import { Navbar } from '../../src/ui/components/Navbar.tsx';
import { PopupShell } from '../../src/App.tsx';
import {
  STONE_AGE_AWARDS_CATALOG,
  buildAwardViewModels,
  createInitialAwardState,
  evaluateAwards,
} from '../../src/core/awards/index.ts';
import { createInitialCivilizationState } from '../../src/core/civilization/civilizationState.ts';
import { createInitialQuestState } from '../../src/core/quests/questEngine.ts';
import { AwardViewModel, GetAwardsStateResponseData } from '../../src/types/awards.ts';
import { sendExtensionMessage } from '../../src/ui/services/extensionClient.ts';

function buildSampleAwardsData(): GetAwardsStateResponseData {
  const nowMs = 1770000000000;
  const ctx = {
    economy: { focusCoins: 200, totalXP: 500, level: 3 },
    dailyStats: {},
    quests: createInitialQuestState(nowMs),
    civilization: createInitialCivilizationState(),
    todayDateKey: '2026-02-02',
    nowMs,
  };
  const evalRes = evaluateAwards(createInitialAwardState(), ctx, {
    metricOverrides: {
      focus_hours: 350, // Lv.2 unlocked (unseen)
      long_haul: 60, // Lv.3 unlocked (sorts above focus_hours Lv.2)
      tribe_complete: 1, // Single-level achieved
    },
  });
  return {
    awardState: evalRes.nextState,
    awards: evalRes.viewModels,
    unseenCount: evalRes.unseenCount,
    era: 'STONE_AGE',
  };
}

test('Awards UI: renders AwardsView in EN and VI with Lv.1..Lv.5, single-level Achieved/Not achieved, zero Roman numerals, and level-descending sorting', () => {
  const sampleData = buildSampleAwardsData();

  const enHtml = renderToString(
    React.createElement(
      I18nProvider,
      { locale: 'en' },
      React.createElement(AwardsView, { initialData: sampleData })
    )
  );
  const decodeHtml = (s: string) => s.replaceAll('&amp;', '&');
  assert.ok(enHtml.includes('data-testid="awards-view"'));
  assert.ok(decodeHtml(enHtml).includes(EN_MESSAGES['awards.title']));
  assert.ok(enHtml.includes('data-testid="award-new-focus_hours"'));
  assert.equal(enHtml.includes('Coming soon'), false);
  for (const def of STONE_AGE_AWARDS_CATALOG) {
    assert.ok(enHtml.includes(`data-testid="award-card-${def.id}"`));
  }
  // Lv.N pips & labels instead of Roman numerals
  assert.ok(enHtml.includes('Lv.3'));
  assert.ok(enHtml.includes('Lv.2'));
  assert.ok(enHtml.includes('Lv.0'));
  assert.ok(enHtml.includes('data-testid="award-tier-pip-focus_hours-5"'));
  assert.equal(enHtml.includes('Tier I'), false);
  assert.equal(enHtml.includes('>I<'), false);
  assert.equal(enHtml.includes('>II<'), false);
  assert.equal(enHtml.includes('>III<'), false);
  assert.equal(enHtml.includes('>IV<'), false);
  assert.equal(enHtml.includes('>V<'), false);

  // Single-level badges show Achieved / Not achieved and never Lv.1 / Lv.0
  assert.ok(enHtml.includes('data-testid="award-level-label-tribe_complete"'));
  assert.ok(enHtml.includes(EN_MESSAGES['awards.singleAchieved']));
  assert.ok(enHtml.includes(EN_MESSAGES['awards.singleNotAchieved']));
  assert.equal(
    enHtml.includes('data-testid="award-level-label-tribe_complete" class="whitespace-nowrap text-emerald-700 dark:text-emerald-300">Lv.'),
    false
  );
  assert.equal(enHtml.includes('data-testid="award-tier-pip-tribe_complete-2"'), false);

  // Within Focus group, Lv.3 (long_haul) sorts ahead of Lv.2 (focus_hours), ahead of Lv.0 (focus_streak)
  const idxLongHaul = enHtml.indexOf('data-testid="award-card-long_haul"');
  const idxFocusHours = enHtml.indexOf('data-testid="award-card-focus_hours"');
  const idxFocusStreak = enHtml.indexOf('data-testid="award-card-focus_streak"');
  assert.ok(idxLongHaul > -1 && idxFocusHours > idxLongHaul && idxFocusStreak > idxFocusHours);

  // Group ordering: Focus -> Quests -> Civilization
  const idxFocusGroup = enHtml.indexOf('data-testid="awards-group-focus"');
  const idxQuestsGroup = enHtml.indexOf('data-testid="awards-group-quests"');
  const idxCivGroup = enHtml.indexOf('data-testid="awards-group-civilization"');
  assert.ok(idxFocusGroup > -1 && idxQuestsGroup > idxFocusGroup && idxCivGroup > idxQuestsGroup);

  const viHtml = renderToString(
    React.createElement(
      I18nProvider,
      { locale: 'vi' },
      React.createElement(AwardsView, { initialData: sampleData })
    )
  );
  assert.ok(decodeHtml(viHtml).includes(VI_MESSAGES['awards.title']));
  assert.ok(viHtml.includes(VI_MESSAGES['awards.tabs.civilization']));
  assert.ok(viHtml.includes(VI_MESSAGES['awards.singleAchieved']));
  assert.ok(viHtml.includes(VI_MESSAGES['awards.singleNotAchieved']));
  assert.equal(viHtml.includes('Sắp ra mắt'), false);
  assert.equal(viHtml.includes('Bậc '), false);

  // Also check sortAwardsForDisplay pure tie-breaker by localized title
  const sortedNames = sortAwardsForDisplay(
    sampleData.awards.filter((a) => a.category === 'civilization' && a.level === 0),
    (k) => EN_MESSAGES[k as keyof typeof EN_MESSAGES] ?? k,
    'en'
  ).map((a) => EN_MESSAGES[a.titleKey as keyof typeof EN_MESSAGES]);
  const copyNames = [...sortedNames].sort((a, b) => a.localeCompare(b, 'en'));
  assert.deepStrictEqual(sortedNames, copyNames);
});

test('Awards UI: dynamically renders Lv.6 pips & modal, CSS level-band classes (0, 1-2, 3, 4, 5, 6+), and single-level modal', () => {
  const nowMs = 1770000000000;
  const ctx = {
    economy: { focusCoins: 0, totalXP: 0, level: 1 },
    dailyStats: {},
    quests: createInitialQuestState(nowMs),
    civilization: { ...createInitialCivilizationState(), era: 'BRONZE_AGE' as const },
    todayDateKey: '2026-02-02',
    nowMs,
  };
  const sixTierDef = {
    ...STONE_AGE_AWARDS_CATALOG[0],
    tiers: [
      ...STONE_AGE_AWARDS_CATALOG[0].tiers,
      { tier: 6, threshold: 12000, availableFrom: 'BRONZE_AGE' as const },
    ],
  };
  const models: readonly AwardViewModel[] = buildAwardViewModels(createInitialAwardState(), ctx, {
    catalog: [sixTierDef, STONE_AGE_AWARDS_CATALOG[11]], // focus_hours (Lv.6) + tribe_complete (single-level)
    metricOverrides: { focus_hours: 12500, tribe_complete: 1 },
  });

  const html = renderToString(
    React.createElement(
      I18nProvider,
      { locale: 'en' },
      React.createElement(AwardsView, {
        initialData: {
          awardState: createInitialAwardState(),
          awards: models,
          unseenCount: 0,
          era: 'BRONZE_AGE',
        },
      })
    )
  );
  assert.ok(html.includes('data-testid="award-tier-pip-focus_hours-6"'));
  assert.ok(html.includes('Lv.6'));

  const modalHtml = renderToString(
    React.createElement(
      I18nProvider,
      { locale: 'en' },
      React.createElement(AwardDetailsModal, { award: models[0], onClose: () => {} })
    )
  );
  assert.ok(modalHtml.includes('data-testid="award-details-modal"'));
  assert.ok(modalHtml.includes('data-testid="award-modal-tier-6"'));
  assert.ok(modalHtml.includes('Lv.6'));
  assert.equal(modalHtml.includes('Tier VI'), false);

  // Single-level modal shows Achieved without Lv.N
  const singleModalHtml = renderToString(
    React.createElement(
      I18nProvider,
      { locale: 'en' },
      React.createElement(AwardDetailsModal, { award: models[1], onClose: () => {} })
    )
  );
  assert.ok(singleModalHtml.includes(EN_MESSAGES['awards.singleAchieved']));
  assert.equal(singleModalHtml.includes('Lv.1'), false);

  // CSS frame band progression checks
  assert.equal(getAwardLevelBand(0), 'locked');
  assert.equal(getAwardLevelBand(1), 'lv1-2');
  assert.equal(getAwardLevelBand(2), 'lv1-2');
  assert.equal(getAwardLevelBand(3), 'lv3');
  assert.equal(getAwardLevelBand(4), 'lv4');
  assert.equal(getAwardLevelBand(5), 'lv5');
  assert.equal(getAwardLevelBand(6), 'lv6-plus');
  assert.notEqual(getAwardLevelFrameClass(1), getAwardLevelFrameClass(3));
  assert.notEqual(getAwardLevelFrameClass(3), getAwardLevelFrameClass(4));
  assert.notEqual(getAwardLevelFrameClass(4), getAwardLevelFrameClass(5));
  assert.notEqual(getAwardLevelFrameClass(5), getAwardLevelFrameClass(6));
  assert.notEqual(getAwardLevelFrameClass(6), getAwardLevelFrameClass(7));

  const iconLv6Html = renderToString(
    React.createElement(AwardIcon, {
      icon: { kind: 'clock', clockIndex: 1 },
      unlocked: true,
      level: 6,
      showLevelTag: true,
    })
  );
  assert.ok(iconLv6Html.includes('data-award-band="lv6-plus"'));
  assert.ok(iconLv6Html.includes('data-award-level="6"'));
});

test('Navbar Awards unseen badge: hides at 0, shows count at 3, caps at 9+ for 12, and localizes aria-label', () => {
  const zeroHtml = renderToString(
    React.createElement(
      I18nProvider,
      { locale: 'en' },
      React.createElement(Navbar, {
        activeTab: 'map',
        onChangeTab: () => {},
        isSessionActive: false,
        unseenAwardCount: 0,
      })
    )
  );
  assert.equal(zeroHtml.includes('data-testid="awards-unseen-badge"'), false);

  const threeHtml = renderToString(
    React.createElement(
      I18nProvider,
      { locale: 'en' },
      React.createElement(Navbar, {
        activeTab: 'map',
        onChangeTab: () => {},
        isSessionActive: false,
        unseenAwardCount: 3,
      })
    )
  );
  assert.ok(threeHtml.includes('data-testid="awards-unseen-badge"'));
  assert.ok(threeHtml.includes('>3<'));
  assert.ok(threeHtml.includes('3 new unlocked awards'));

  const capViHtml = renderToString(
    React.createElement(
      I18nProvider,
      { locale: 'vi' },
      React.createElement(Navbar, {
        activeTab: 'map',
        onChangeTab: () => {},
        isSessionActive: false,
        unseenAwardCount: 12,
      })
    )
  );
  assert.ok(capViHtml.includes('data-testid="awards-unseen-badge"'));
  assert.ok(capViHtml.includes('>9+<'));
  assert.ok(capViHtml.includes('12 thành tựu mới mở khóa'));
});

test('PopupShell award unlock toast renders non-blocking banner with Lv.N & single-level copy within 400px popup', () => {
  const buildShell = (toast: { key: string; titleKey: string; level: number; isSingleLevel: boolean; icon: { kind: 'clock'; clockIndex: 1 } }) =>
    renderToString(
      React.createElement(
        I18nProvider,
        { locale: 'en' },
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
          unseenAwardCount: 1,
          awardToast: toast,
          onDismissAwardToast: () => {},
          settings: { soundEnabled: false, notificationsEnabled: true, language: 'en' },
          isLoading: false,
          activeTab: 'map',
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
      )
    );

  const multiHtml = buildShell({
    key: 'focus_hours:1',
    titleKey: 'awards.items.focus_hours.title',
    level: 1,
    isSingleLevel: false,
    icon: { kind: 'clock', clockIndex: 1 },
  });
  assert.ok(multiHtml.includes('w-[400px]'));
  assert.ok(multiHtml.includes('data-testid="award-unlock-toast"'));
  assert.ok(multiHtml.includes('motion-reduce:transition-none'));
  assert.ok(multiHtml.includes('data-testid="award-toast-dismiss"'));
  assert.ok(multiHtml.includes('Deep Focus Hours · Lv.1'));

  const singleHtml = buildShell({
    key: 'era_ready:1',
    titleKey: 'awards.items.era_ready.title',
    level: 1,
    isSingleLevel: true,
    icon: { kind: 'clock', clockIndex: 1 },
  });
  assert.ok(singleHtml.includes('Bronze Age Ready · Achieved'));
  assert.equal(singleHtml.includes('Bronze Age Ready · Lv.1'), false);
});

test('Simulator GET_AWARDS_STATE and MARK_AWARDS_SEEN handlers work end-to-end', async () => {
  const getRes = await sendExtensionMessage<GetAwardsStateResponseData>({
    action: 'GET_AWARDS_STATE',
  });
  assert.equal(getRes.success, true);
  assert.ok(getRes.data);
  assert.equal(getRes.data.awards.length, 13);

  const badMark = await sendExtensionMessage({
    action: 'MARK_AWARDS_SEEN',
    payload: { awardIds: [123 as unknown as string] },
  });
  assert.equal(badMark.success, false);
  assert.equal(badMark.errorCode, 'INVALID_AWARDS_PAYLOAD');

  const markRes = await sendExtensionMessage<{ unseenCount: number }>({
    action: 'MARK_AWARDS_SEEN',
  });
  assert.equal(markRes.success, true);
  assert.equal(markRes.data?.unseenCount, 0);
});
