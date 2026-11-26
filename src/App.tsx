import React, { useState, useEffect, useCallback, useRef } from 'react';
import { X } from 'lucide-react';
import { Header } from './ui/components/Header.tsx';
import { Navbar, ActiveTab } from './ui/components/Navbar.tsx';
import { TimerView } from './ui/components/TimerView.tsx';
import { ProfileBottomSheet } from './ui/components/ProfileBottomSheet.tsx';
import { StatsView } from './ui/components/StatsView.tsx';
import { QuestView } from './ui/components/quests/QuestView.tsx';
import { AwardsView, AwardIcon } from './ui/components/awards/index.ts';
import { RewardHelpModal } from './ui/components/RewardHelpModal.tsx';
import { MusicPlayerSheet } from './ui/components/MusicPlayerSheet.tsx';
import { CivilizationScreen } from './ui/components/civilization/CivilizationScreen.tsx';
import { SpriteGallery } from './ui/components/civilization/SpriteGallery.tsx';
import {
  isChromeExtension,
  sendExtensionMessage,
  onStorageChange,
  getCivilizationStateClient,
  getMusicStateClient,
  getQuestStateClient,
  getAwardsStateClient,
} from './ui/services/extensionClient.ts';
import { skipPomodoroBreakAction } from './ui/services/sessionActions.ts';
import {
  isInFocusSession,
  resolveEffectiveTab,
  executeExitSessionAction,
} from './ui/utils/sessionNavigation.ts';
import {
  ClaimQuestRewardResponseData,
  FullSessionStateResponse,
  MusicStateResponseData,
} from './types/messages.ts';
import { SessionSnapshot, SessionMode, PomodoroConfig } from './types/session.ts';
import { FocusProfile } from './types/profiles.ts';
import { PlayerEconomy } from './types/economy.ts';
import { DailyStatRecord, UserSettings } from './types/storageSchema.ts';
import { BuildingInstance, CivilizationEra } from './core/civilization/buildingTypes.ts';
import { CivilizationState } from './core/civilization/civilizationState.ts';
import { extractCivilizationCoinBonuses } from './core/civilization/civilizationBonusHelper.ts';
import { aggregateCoinBonus } from './core/economy/coinBonus.ts';
import { MusicPlayerState, MusicTrack, RepeatMode } from './types/music.ts';
import { I18nProvider, useTranslation } from './i18n/I18nContext.tsx';
import { SupportedLocale, TranslationKey } from './i18n/types.ts';
import { resolveLocale, translate } from './i18n/translator.ts';
import { AwardIconSpec } from './types/awards.ts';
import { AppError, ErrorCode } from './types/errors.ts';

interface AwardUnlockToastData {
  readonly key: string;
  readonly titleKey: string;
  readonly level: number;
  readonly isSingleLevel: boolean;
  readonly icon: AwardIconSpec;
}

const DEFAULT_ECONOMY: PlayerEconomy = {
  focusCoins: 120,
  totalXP: 450,
  level: 3,
};

const DEFAULT_PROFILE: FocusProfile = {
  id: 'profile-study-research',
  name: 'Study & Research',
  allowedDomains: [],
  isDefault: true,
  createdAt: 1700000000000,
  updatedAt: 1700000000000,
};

interface ProfilesResponseData {
  profiles: FocusProfile[];
  activeProfileId?: string;
  activeProfile?: FocusProfile | null;
}

const DEFAULT_MUSIC_STATE: MusicPlayerState = {
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
};

interface PopupShellProps {
  onToggleLanguage: (language: SupportedLocale) => Promise<void>;
  session: SessionSnapshot | null;
  economy: PlayerEconomy;
  activeProfile: FocusProfile | null;
  profiles: FocusProfile[];
  todayStats: DailyStatRecord | null;
  lifetimeFocusMinutes: number;
  isBlockingActive: boolean;
  isSessionActive: boolean;
  civEra: CivilizationEra;
  civBonusRate?: number;
  civBuildings?: readonly BuildingInstance[];
  civState?: CivilizationState | null;
  unclaimedQuestCount?: number;
  questStateVersion?: number;
  onUnclaimedQuestCountChange?: (count: number) => void;
  onQuestClaimed?: (result: ClaimQuestRewardResponseData) => void | Promise<void>;
  unseenAwardCount?: number;
  awardsStateVersion?: number;
  onUnseenAwardCountChange?: (count: number) => void;
  awardToast?: AwardUnlockToastData | null;
  onDismissAwardToast?: () => void;
  settings: UserSettings | null;
  isLoading: boolean;
  activeTab: ActiveTab;
  setActiveTab: React.Dispatch<React.SetStateAction<ActiveTab>>;
  isHelpOpen: boolean;
  setIsHelpOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isProfileSheetOpen: boolean;
  setIsProfileSheetOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isMusicExpanded: boolean;
  onToggleMusicExpanded: (expanded: boolean) => Promise<void>;
  musicState: MusicPlayerState;
  musicCatalog: readonly MusicTrack[];
  refreshState: () => Promise<void>;
  handleStartSession: (
    mode: SessionMode,
    targetMinutes: number,
    pomodoroConfig?: PomodoroConfig,
    jobAssignment?: {
      readonly assignedJobIds?: readonly string[];
      readonly autoContinueJobs?: boolean;
    }
  ) => Promise<void>;
  handlePauseSession: () => Promise<void>;
  handleResumeSession: () => Promise<void>;
  handleGiveUpSession: () => Promise<void>;
  handleFinishStopwatch: () => Promise<void>;
  handleSkipBreak: () => Promise<void>;
  handleResetSession: () => Promise<void>;
  handleSwitchProfile: (profileId: string) => Promise<void>;
  handleCreateProfile: (name: string) => Promise<void>;
  handleRenameProfile: (profileId: string, newName: string) => Promise<void>;
  handleDeleteProfile: (profileId: string) => Promise<void>;
  handleAddDomain: (profileId: string, domain: string) => Promise<void>;
  handleRemoveDomain: (profileId: string, domain: string) => Promise<void>;
  handleToggleChime: (enabled: boolean) => Promise<void>;
  handlePlayMusicTrack: (trackId?: string) => Promise<void>;
  handlePauseMusic: () => Promise<void>;
  handleResumeMusic: () => Promise<void>;
  handleStopMusic: () => Promise<void>;
  handleNextMusic: () => Promise<void>;
  handlePreviousMusic: () => Promise<void>;
  handleSeekMusic: (positionSec: number) => Promise<void>;
  handleSetMusicVolume: (volume: number, muted?: boolean) => Promise<void>;
  handleToggleMusicShuffle: (enabled: boolean) => Promise<void>;
  handleCycleMusicRepeat: (mode: RepeatMode) => Promise<void>;
  handleRefreshMusicCatalog: () => Promise<void>;
}

export const PopupShell: React.FC<PopupShellProps> = ({
  onToggleLanguage,
  session,
  economy,
  activeProfile,
  profiles,
  todayStats,
  lifetimeFocusMinutes,
  isBlockingActive,
  isSessionActive,
  civEra,
  civBonusRate = 0,
  civBuildings,
  civState = null,
  unclaimedQuestCount = 0,
  questStateVersion = 0,
  onUnclaimedQuestCountChange,
  onQuestClaimed,
  unseenAwardCount = 0,
  awardsStateVersion = 0,
  onUnseenAwardCountChange,
  awardToast = null,
  onDismissAwardToast,
  settings,
  isLoading,
  activeTab,
  setActiveTab,
  isHelpOpen,
  setIsHelpOpen,
  isProfileSheetOpen,
  setIsProfileSheetOpen,
  isMusicExpanded,
  onToggleMusicExpanded,
  musicState,
  musicCatalog,
  refreshState,
  handleStartSession,
  handlePauseSession,
  handleResumeSession,
  handleGiveUpSession,
  handleFinishStopwatch,
  handleSkipBreak,
  handleResetSession,
  handleSwitchProfile,
  handleCreateProfile,
  handleRenameProfile,
  handleDeleteProfile,
  handleAddDomain,
  handleRemoveDomain,
  handleToggleChime,
  handlePlayMusicTrack,
  handlePauseMusic,
  handleResumeMusic,
  handleStopMusic,
  handleNextMusic,
  handlePreviousMusic,
  handleSeekMusic,
  handleSetMusicVolume,
  handleToggleMusicShuffle,
  handleCycleMusicRepeat,
  handleRefreshMusicCatalog,
}) => {
  const { t } = useTranslation();
  const inFocusSession = isInFocusSession(session);
  const effectiveTab = resolveEffectiveTab(activeTab, session);
  const showMusicPlayer = Boolean(
    session &&
      (session.status === 'RUNNING' || session.status === 'PAUSED') &&
      effectiveTab === 'focus'
  );

  const handleChangeTab = (nextTab: ActiveTab) => {
    if (inFocusSession && nextTab !== 'focus') return;
    setActiveTab(nextTab);
  };

  return (
    <div className="relative w-[400px] min-h-[580px] max-h-[600px] flex flex-col bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 overflow-hidden shadow-xl rounded-none">
      <Header
        economy={economy}
        activeProfile={activeProfile}
        onOpenProfiles={() => setIsProfileSheetOpen(true)}
        onOpenHelp={() => setIsHelpOpen(true)}
        isBlockingActive={isBlockingActive}
        isSessionActive={isSessionActive}
        era={civEra}
        activeView={effectiveTab}
        onNavigateHome={inFocusSession ? undefined : () => handleChangeTab('map')}
        onToggleLanguage={onToggleLanguage}
      />

      {awardToast && (
        <div
          data-testid="award-unlock-toast"
          role="status"
          aria-live="polite"
          className="absolute top-12 left-3 right-3 z-40 flex items-center gap-2.5 px-3 py-2 rounded-xl border border-amber-300 dark:border-amber-700 bg-white/95 dark:bg-slate-900/95 shadow-lg transition-opacity duration-150 motion-reduce:transition-none"
        >
          <AwardIcon
            icon={awardToast.icon}
            unlocked
            level={awardToast.level}
            isSingleLevel={awardToast.isSingleLevel}
            size={24}
          />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold text-amber-700 dark:text-amber-300 leading-none">
              {t('awards.toast.title')}
            </p>
            <p className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate mt-0.5">
              {awardToast.isSingleLevel
                ? t('awards.toast.bodySingle', {
                    title: t(awardToast.titleKey as TranslationKey),
                  })
                : t('awards.toast.body', {
                    title: t(awardToast.titleKey as TranslationKey),
                    level: awardToast.level,
                  })}
            </p>
          </div>
          {onDismissAwardToast && (
            <button
              type="button"
              data-testid="award-toast-dismiss"
              aria-label={t('awards.toast.dismissAria')}
              onClick={onDismissAwardToast}
              className="p-1 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      <main
        className={`flex-1 min-h-0 flex flex-col ${
          effectiveTab === 'map' ? 'overflow-hidden' : 'overflow-y-auto'
        }`}
      >
        {effectiveTab === 'map' && (
          <div className="flex-1 min-h-0 flex flex-col">
            <div className="px-3 py-1.5 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
              <h1 className="text-xs font-bold tracking-tight text-slate-900 dark:text-slate-100">
                {t('home.title')}
              </h1>
            </div>
            <CivilizationScreen
              lifetimeFocusMinutes={lifetimeFocusMinutes}
              session={session}
              onStateMutated={refreshState}
            />
          </div>
        )}

        {effectiveTab === 'quests' && (
          <QuestView
            refreshTrigger={questStateVersion}
            onUnclaimedCountChange={onUnclaimedQuestCountChange}
            onQuestClaimed={onQuestClaimed}
          />
        )}

        {effectiveTab === 'focus' && (
          <TimerView
            session={session}
            activeProfile={activeProfile}
            era={civEra}
            activeBonusRate={civBonusRate}
            isBonusLoading={false}
            civilizationState={civState}
            onStartSession={handleStartSession}
            onPauseSession={handlePauseSession}
            onResumeSession={handleResumeSession}
            onGiveUpSession={handleGiveUpSession}
            onFinishStopwatch={handleFinishStopwatch}
            onSkipBreak={handleSkipBreak}
            onResetSession={handleResetSession}
            onRefreshSession={refreshState}
            isLoading={isLoading}
            onOpenProfiles={() => setIsProfileSheetOpen(true)}
            onNavigateToMap={() => handleChangeTab('map')}
            chimeEnabled={settings?.chimeEnabled}
            onToggleChime={handleToggleChime}
          />
        )}

        {effectiveTab === 'awards' && (
          <AwardsView
            refreshTrigger={awardsStateVersion}
            onUnseenCountChange={onUnseenAwardCountChange}
          />
        )}

        {effectiveTab === 'stats' && (
          <StatsView todayStats={todayStats} buildings={civBuildings} jobs={civState?.jobs} />
        )}
      </main>

      {showMusicPlayer && (
        <MusicPlayerSheet
          isExpanded={isMusicExpanded}
          onToggleExpand={onToggleMusicExpanded}
          hasBottomNav={false}
          musicState={musicState}
          catalog={musicCatalog}
          onPlayTrack={handlePlayMusicTrack}
          onPause={handlePauseMusic}
          onResume={handleResumeMusic}
          onStop={handleStopMusic}
          onNext={handleNextMusic}
          onPrevious={handlePreviousMusic}
          onSeek={handleSeekMusic}
          onSetVolume={handleSetMusicVolume}
          onToggleShuffle={handleToggleMusicShuffle}
          onCycleRepeat={handleCycleMusicRepeat}
          onRefreshCatalog={handleRefreshMusicCatalog}
        />
      )}

      {!inFocusSession && (
        <Navbar
          activeTab={effectiveTab}
          onChangeTab={handleChangeTab}
          isSessionActive={isSessionActive}
          session={session}
          unclaimedQuestCount={unclaimedQuestCount}
          unseenAwardCount={unseenAwardCount}
        />
      )}

      <ProfileBottomSheet
        isOpen={isProfileSheetOpen}
        onClose={() => setIsProfileSheetOpen(false)}
        profiles={profiles}
        activeProfile={activeProfile}
        isSessionActive={isSessionActive}
        isLoading={isLoading}
        onSwitchProfile={handleSwitchProfile}
        onCreateProfile={handleCreateProfile}
        onRenameProfile={handleRenameProfile}
        onDeleteProfile={handleDeleteProfile}
        onAddDomain={handleAddDomain}
        onRemoveDomain={handleRemoveDomain}
      />

      <RewardHelpModal isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
    </div>
  );
};

export interface AppProps {
  initialSession?: SessionSnapshot | null;
  initialTab?: ActiveTab;
  initialLocale?: SupportedLocale;
}

export const App: React.FC<AppProps> = ({
  initialSession,
  initialTab = 'map',
  initialLocale,
}) => {
  const [activeTab, setActiveTab] = useState<ActiveTab>(() =>
    resolveEffectiveTab(initialTab, initialSession ?? null)
  );
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isProfileSheetOpen, setIsProfileSheetOpen] = useState(false);
  const [isMusicExpanded, setIsMusicExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const [session, setSession] = useState<SessionSnapshot | null>(initialSession ?? null);
  const [hasResolvedInitialSession, setHasResolvedInitialSession] = useState<boolean>(
    () => typeof document === 'undefined' || initialSession !== undefined
  );
  const isResettingRef = useRef(false);
  const [economy, setEconomy] = useState<PlayerEconomy>(DEFAULT_ECONOMY);
  const [activeProfile, setActiveProfile] = useState<FocusProfile | null>(DEFAULT_PROFILE);
  const [profiles, setProfiles] = useState<FocusProfile[]>([DEFAULT_PROFILE]);
  const [todayStats, setTodayStats] = useState<DailyStatRecord | null>(null);
  const [lifetimeFocusMinutes, setLifetimeFocusMinutes] = useState<number>(0);
  const [isBlockingActive, setIsBlockingActive] = useState(false);
  const [civEra, setCivEra] = useState<CivilizationEra>('STONE_AGE');
  const [civBonusRate, setCivBonusRate] = useState<number>(0);
  const [civBuildings, setCivBuildings] = useState<readonly BuildingInstance[]>([]);
  const [civState, setCivState] = useState<CivilizationState | null>(null);
  const [unclaimedQuestCount, setUnclaimedQuestCount] = useState<number>(0);
  const [questStateVersion, setQuestStateVersion] = useState<number>(0);
  const [unseenAwardCount, setUnseenAwardCount] = useState<number>(0);
  const [awardsStateVersion, setAwardsStateVersion] = useState<number>(0);
  const [awardToast, setAwardToast] = useState<AwardUnlockToastData | null>(null);
  const hasInitializedAwardsRef = useRef(false);
  const knownUnlockedTierKeysRef = useRef<Set<string>>(new Set());
  const awardToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [musicState, setMusicState] = useState<MusicPlayerState>(DEFAULT_MUSIC_STATE);
  const [musicCatalog, setMusicCatalog] = useState<readonly MusicTrack[]>([]);
  const [locationHash, setLocationHash] = useState<string>(() =>
    typeof window !== 'undefined' ? window.location.hash : ''
  );

  const dismissAwardToast = useCallback(() => {
    if (awardToastTimerRef.current) {
      clearTimeout(awardToastTimerRef.current);
      awardToastTimerRef.current = null;
    }
    setAwardToast(null);
  }, []);

  const showAwardToast = useCallback((nextToast: AwardUnlockToastData) => {
    if (awardToastTimerRef.current) {
      clearTimeout(awardToastTimerRef.current);
      awardToastTimerRef.current = null;
    }
    setAwardToast(nextToast);
    if (typeof window !== 'undefined') {
      awardToastTimerRef.current = setTimeout(() => {
        setAwardToast(null);
        awardToastTimerRef.current = null;
      }, 4500);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (awardToastTimerRef.current) {
        clearTimeout(awardToastTimerRef.current);
        awardToastTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleHashChange = () => setLocationHash(window.location.hash);
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Sync state from background service worker / simulated state
  const refreshState = useCallback(async () => {
    try {
      const statePromise = sendExtensionMessage<FullSessionStateResponse>({
        action: 'GET_SESSION_STATE',
      }).then((stateRes) => {
        if (stateRes.success && stateRes.data) {
          const nextSession = stateRes.data.currentSession;
          setSession(nextSession);
          if (isInFocusSession(nextSession)) {
            setActiveTab('focus');
          }
          setEconomy(stateRes.data.economy);
          setActiveProfile(stateRes.data.activeProfile);
          setTodayStats(stateRes.data.todayStats);
          setLifetimeFocusMinutes(
            stateRes.data.lifetimeFocusMinutes ??
              stateRes.data.todayStats?.totalFocusMinutes ??
              0
          );
          setIsBlockingActive(Boolean(stateRes.data.isBlockingActive));
          if (stateRes.data.settings) {
            setSettings(stateRes.data.settings);
            setIsMusicExpanded(Boolean(stateRes.data.settings.musicPlayerExpanded));
          }
        }
        setHasResolvedInitialSession(true);
        return stateRes;
      });

      const profilesPromise = sendExtensionMessage<FocusProfile[] | ProfilesResponseData>({
        action: 'GET_PROFILES',
      }).then((profilesRes) => {
        if (profilesRes.success && profilesRes.data) {
          if (Array.isArray(profilesRes.data)) {
            setProfiles(profilesRes.data);
          } else if (
            profilesRes.data &&
            Array.isArray((profilesRes.data as ProfilesResponseData).profiles)
          ) {
            setProfiles((profilesRes.data as ProfilesResponseData).profiles);
            if ((profilesRes.data as ProfilesResponseData).activeProfile) {
              setActiveProfile((profilesRes.data as ProfilesResponseData).activeProfile!);
            }
          }
        }
      });

      const civPromise = getCivilizationStateClient().then((civRes) => {
        if (civRes.success && civRes.data) {
          setCivState(civRes.data);
          if (civRes.data.era) {
            setCivEra(civRes.data.era);
          }
          setCivBuildings(civRes.data.buildings);
          setCivBonusRate(
            aggregateCoinBonus(
              extractCivilizationCoinBonuses(
                civRes.data.buildings,
                civRes.data.villagers,
                civRes.data.jobs,
                civRes.data.founderRole
              )
            )
          );
        }
      });

      const musicPromise = getMusicStateClient().then((musicRes) => {
        if (musicRes.success && musicRes.data) {
          setMusicState(musicRes.data.state);
          setMusicCatalog(musicRes.data.catalog);
        }
      });

      const questPromise = getQuestStateClient().then((questRes) => {
        if (questRes.success && questRes.data) {
          setUnclaimedQuestCount(questRes.data.unclaimedCount);
          setQuestStateVersion((v) => v + 1);
        }
      });

      const awardsPromise = getAwardsStateClient().then((awardsRes) => {
        if (awardsRes.success && awardsRes.data) {
          const data = awardsRes.data;
          setUnseenAwardCount(data.unseenCount);
          setAwardsStateVersion((v) => v + 1);

          let latestNewUnlock: AwardUnlockToastData | null = null;
          for (const award of data.awards) {
            for (const tier of award.tiers) {
              if (!tier.unlocked) continue;
              const tierKey = `${award.id}:${tier.tier}`;
              if (!knownUnlockedTierKeysRef.current.has(tierKey)) {
                knownUnlockedTierKeysRef.current.add(tierKey);
                if (hasInitializedAwardsRef.current && !tier.seen) {
                  latestNewUnlock = {
                    key: tierKey,
                    titleKey: award.titleKey,
                    level: tier.tier,
                    isSingleLevel: award.isSingleLevel,
                    icon: award.icon,
                  };
                }
              }
            }
          }
          if (!hasInitializedAwardsRef.current) {
            hasInitializedAwardsRef.current = true;
          } else if (latestNewUnlock) {
            showAwardToast(latestNewUnlock);
          }
        }
      });

      await Promise.all([
        statePromise,
        profilesPromise,
        civPromise,
        musicPromise,
        questPromise,
        awardsPromise,
      ]);
    } catch {
      // Non-blocking fallback
    } finally {
      setHasResolvedInitialSession(true);
    }
  }, [showAwardToast]);

  const handleQuestClaimed = useCallback(
    async (result: ClaimQuestRewardResponseData) => {
      setEconomy(result.economy);
      await refreshState();
    },
    [refreshState]
  );

  useEffect(() => {
    refreshState();
    const unsubscribe = onStorageChange(() => {
      refreshState();
    });
    return unsubscribe;
  }, [refreshState]);

  useEffect(() => {
    if (musicState.status !== 'PLAYING' || typeof window === 'undefined') {
      return;
    }
    const timer = window.setInterval(() => {
      void getMusicStateClient().then((res) => {
        if (res.success && res.data) {
          setMusicState(res.data.state);
          setMusicCatalog(res.data.catalog);
        }
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [musicState.status]);

  // Session Action Handlers
  const handleStartSession = async (
    mode: SessionMode,
    targetMinutes: number,
    pomodoroConfig?: PomodoroConfig,
    jobAssignment?: {
      readonly assignedJobIds?: readonly string[];
      readonly autoContinueJobs?: boolean;
    }
  ) => {
    setIsLoading(true);
    try {
      const res = await sendExtensionMessage({
        action: 'START_SESSION',
        payload: {
          mode,
          targetMinutes,
          profileId: activeProfile?.id || 'profile-study-research',
          pomodoroConfig,
          ...(jobAssignment?.assignedJobIds !== undefined
            ? { assignedJobIds: [...jobAssignment.assignedJobIds] }
            : {}),
          ...(jobAssignment?.autoContinueJobs !== undefined
            ? { autoContinueJobs: jobAssignment.autoContinueJobs }
            : {}),
        },
      });
      if (!res.success) {
        throw new AppError(
          (res.errorCode as ErrorCode) ?? 'ACTION_FAILED',
          res.error || 'Failed to start session.',
          res.errorParams
        );
      }
      await refreshState();
    } finally {
      setIsLoading(false);
    }
  };

  const handlePauseSession = async () => {
    await sendExtensionMessage({ action: 'PAUSE_SESSION' });
    await refreshState();
  };

  const handleResumeSession = async () => {
    await sendExtensionMessage({ action: 'RESUME_SESSION' });
    await refreshState();
  };

  const handleGiveUpSession = async () => {
    await sendExtensionMessage({ action: 'GIVE_UP_SESSION' });
    await refreshState();
  };

  const handleFinishStopwatch = async () => {
    await sendExtensionMessage({ action: 'FINISH_STOPWATCH' });
    await refreshState();
  };

  const handleSkipBreak = async () => {
    await skipPomodoroBreakAction(refreshState);
  };

  const handleResetSession = async () => {
    if (isResettingRef.current) return;
    isResettingRef.current = true;
    setIsLoading(true);
    try {
      await executeExitSessionAction({
        sendReset: () => sendExtensionMessage({ action: 'RESET_SESSION' }),
        refreshState,
        onNavigateToMap: () => setActiveTab('map'),
      });
    } finally {
      isResettingRef.current = false;
      setIsLoading(false);
    }
  };

  // Profile Action Handlers
  const handleSwitchProfile = async (profileId: string) => {
    setIsLoading(true);
    try {
      const res = await sendExtensionMessage({
        action: 'SWITCH_PROFILE',
        payload: { profileId },
      });
      await refreshState();
      if (!res.success) {
        throw new AppError(
          (res.errorCode as ErrorCode) ?? 'SWITCH_PROFILE_FAILED',
          res.error || 'Failed to switch profile.',
          res.errorParams
        );
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateProfile = async (name: string) => {
    setIsLoading(true);
    try {
      const res = await sendExtensionMessage({
        action: 'CREATE_PROFILE',
        payload: { name },
      });
      await refreshState();
      if (!res.success) {
        throw new AppError(
          (res.errorCode as ErrorCode) ?? 'CREATE_PROFILE_FAILED',
          res.error || 'Failed to create profile.',
          res.errorParams
        );
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleRenameProfile = async (profileId: string, newName: string) => {
    setIsLoading(true);
    try {
      const res = await sendExtensionMessage({
        action: 'RENAME_PROFILE',
        payload: { profileId, newName },
      });
      await refreshState();
      if (!res.success) {
        throw new AppError(
          (res.errorCode as ErrorCode) ?? 'RENAME_PROFILE_FAILED',
          res.error || 'Failed to rename profile.',
          res.errorParams
        );
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteProfile = async (profileId: string) => {
    setIsLoading(true);
    try {
      const res = await sendExtensionMessage({
        action: 'DELETE_PROFILE',
        payload: { profileId },
      });
      await refreshState();
      if (!res.success) {
        throw new AppError(
          (res.errorCode as ErrorCode) ?? 'DELETE_PROFILE_FAILED',
          res.error || 'Failed to delete profile.',
          res.errorParams
        );
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddDomain = async (profileId: string, domain: string) => {
    setIsLoading(true);
    try {
      const res = await sendExtensionMessage({
        action: 'ADD_DOMAIN',
        payload: { profileId, domainPattern: domain },
      });
      await refreshState();
      if (!res.success) {
        throw new AppError(
          (res.errorCode as ErrorCode) ?? 'ADD_DOMAIN_FAILED',
          res.error || 'Failed to add domain.',
          res.errorParams
        );
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemoveDomain = async (profileId: string, domain: string) => {
    setIsLoading(true);
    try {
      const res = await sendExtensionMessage({
        action: 'REMOVE_DOMAIN',
        payload: { profileId, domainPattern: domain },
      });
      await refreshState();
      if (!res.success) {
        throw new AppError(
          (res.errorCode as ErrorCode) ?? 'REMOVE_DOMAIN_FAILED',
          res.error || 'Failed to remove domain.',
          res.errorParams
        );
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Settings Action Handlers
  const handleSetLanguage = async (language: SupportedLocale) => {
    setSettings((prev) =>
      prev
        ? { ...prev, language }
        : { soundEnabled: false, notificationsEnabled: true, language }
    );
    const res = await sendExtensionMessage<UserSettings>({
      action: 'SET_LANGUAGE',
      payload: { language },
    });
    if (res.success && res.data) {
      setSettings(res.data);
    }
    await refreshState();
  };

  const handleToggleChime = async (enabled: boolean) => {
    const res = await sendExtensionMessage<UserSettings>({
      action: 'SET_CHIME_ENABLED',
      payload: { enabled },
    });
    if (res.success && res.data) {
      setSettings(res.data);
    }
    await refreshState();
  };

  const handleToggleMusicExpanded = async (expanded: boolean) => {
    setIsMusicExpanded(expanded);
    setSettings((prev) =>
      prev
        ? { ...prev, musicPlayerExpanded: expanded }
        : { soundEnabled: false, notificationsEnabled: true, musicPlayerExpanded: expanded }
    );
    const res = await sendExtensionMessage<UserSettings>({
      action: 'SET_MUSIC_PLAYER_EXPANDED',
      payload: { expanded },
    });
    if (res.success && res.data) {
      setSettings(res.data);
    }
  };

  // Music Player Action Handlers
  const applyMusicResponse = (res: { success: boolean; data?: MusicStateResponseData }) => {
    if (res.success && res.data) {
      setMusicState(res.data.state);
      setMusicCatalog(res.data.catalog);
    }
  };

  const handlePlayMusicTrack = async (trackId?: string) => {
    const res = await sendExtensionMessage<MusicStateResponseData>({
      action: 'MUSIC_PLAY',
      payload: trackId ? { trackId } : undefined,
    });
    applyMusicResponse(res);
  };

  const handlePauseMusic = async () => {
    const res = await sendExtensionMessage<MusicStateResponseData>({ action: 'MUSIC_PAUSE' });
    applyMusicResponse(res);
  };

  const handleResumeMusic = async () => {
    const res = await sendExtensionMessage<MusicStateResponseData>({ action: 'MUSIC_RESUME' });
    applyMusicResponse(res);
  };

  const handleStopMusic = async () => {
    const res = await sendExtensionMessage<MusicStateResponseData>({ action: 'MUSIC_STOP' });
    applyMusicResponse(res);
  };

  const handleNextMusic = async () => {
    const res = await sendExtensionMessage<MusicStateResponseData>({ action: 'MUSIC_NEXT' });
    applyMusicResponse(res);
  };

  const handlePreviousMusic = async () => {
    const res = await sendExtensionMessage<MusicStateResponseData>({ action: 'MUSIC_PREVIOUS' });
    applyMusicResponse(res);
  };

  const handleSeekMusic = async (positionSec: number) => {
    const res = await sendExtensionMessage<MusicStateResponseData>({
      action: 'MUSIC_SEEK',
      payload: { positionSec },
    });
    applyMusicResponse(res);
  };

  const handleSetMusicVolume = async (volume: number, muted?: boolean) => {
    const res = await sendExtensionMessage<MusicStateResponseData>({
      action: 'MUSIC_SET_VOLUME',
      payload: { volume, muted },
    });
    applyMusicResponse(res);
  };

  const handleToggleMusicShuffle = async (enabled: boolean) => {
    const res = await sendExtensionMessage<MusicStateResponseData>({
      action: 'MUSIC_SET_SHUFFLE',
      payload: { enabled },
    });
    applyMusicResponse(res);
  };

  const handleCycleMusicRepeat = async (mode: RepeatMode) => {
    const res = await sendExtensionMessage<MusicStateResponseData>({
      action: 'MUSIC_SET_REPEAT',
      payload: { mode },
    });
    applyMusicResponse(res);
  };

  const handleRefreshMusicCatalog = async () => {
    const res = await sendExtensionMessage<MusicStateResponseData>({
      action: 'MUSIC_REFRESH_CATALOG',
    });
    applyMusicResponse(res);
  };

  const isSessionActive = Boolean(
    session &&
      session.status !== 'IDLE' &&
      session.status !== 'COMPLETED' &&
      session.status !== 'ABANDONED' &&
      session.status !== 'INTERRUPTED'
  );

  const inLiveExtension = isChromeExtension();
  const activeLocale = resolveLocale(settings?.language ?? initialLocale);

  type DevOverlayProps = {
    onRefreshState: () => Promise<void>;
    activeTab: ActiveTab;
    onSetActiveTab: (tab: ActiveTab) => void;
    session: SessionSnapshot | null;
    economy: PlayerEconomy;
    civState: CivilizationState | null;
  };
  const [DevOverlayComponent, setDevOverlayComponent] =
    useState<React.ComponentType<DevOverlayProps> | null>(null);

  useEffect(() => {
    if (
      typeof import.meta !== 'undefined' &&
      typeof import.meta.env !== 'undefined' &&
      import.meta.env.DEV === true
    ) {
      let mounted = true;
      void import('./dev/DevGodModeMount.tsx')
        .then((mod) => {
          if (mounted) {
            setDevOverlayComponent(() => mod.DevGodModeMount);
          }
        })
        .catch(() => undefined);
      return () => {
        mounted = false;
      };
    }
    return undefined;
  }, []);

  const devOverlayNode =
    typeof import.meta !== 'undefined' &&
    typeof import.meta.env !== 'undefined' &&
    import.meta.env.DEV === true &&
    DevOverlayComponent ? (
      <DevOverlayComponent
        onRefreshState={refreshState}
        activeTab={activeTab}
        onSetActiveTab={setActiveTab}
        session={session}
        economy={economy}
        civState={civState}
      />
    ) : null;

  const popupContent = hasResolvedInitialSession ? (
    <PopupShell
      onToggleLanguage={handleSetLanguage}
      session={session}
      economy={economy}
      activeProfile={activeProfile}
      profiles={profiles}
      todayStats={todayStats}
      lifetimeFocusMinutes={lifetimeFocusMinutes}
      isBlockingActive={isBlockingActive}
      isSessionActive={isSessionActive}
      civEra={civEra}
      civBonusRate={civBonusRate}
      civBuildings={civBuildings}
      civState={civState}
      unclaimedQuestCount={unclaimedQuestCount}
      questStateVersion={questStateVersion}
      onUnclaimedQuestCountChange={setUnclaimedQuestCount}
      onQuestClaimed={handleQuestClaimed}
      unseenAwardCount={unseenAwardCount}
      awardsStateVersion={awardsStateVersion}
      onUnseenAwardCountChange={setUnseenAwardCount}
      awardToast={awardToast}
      onDismissAwardToast={dismissAwardToast}
      settings={settings}
      isLoading={isLoading}
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      isHelpOpen={isHelpOpen}
      setIsHelpOpen={setIsHelpOpen}
      isProfileSheetOpen={isProfileSheetOpen}
      setIsProfileSheetOpen={setIsProfileSheetOpen}
      isMusicExpanded={isMusicExpanded}
      onToggleMusicExpanded={handleToggleMusicExpanded}
      musicState={musicState}
      musicCatalog={musicCatalog}
      refreshState={refreshState}
      handleStartSession={handleStartSession}
      handlePauseSession={handlePauseSession}
      handleResumeSession={handleResumeSession}
      handleGiveUpSession={handleGiveUpSession}
      handleFinishStopwatch={handleFinishStopwatch}
      handleSkipBreak={handleSkipBreak}
      handleResetSession={handleResetSession}
      handleSwitchProfile={handleSwitchProfile}
      handleCreateProfile={handleCreateProfile}
      handleRenameProfile={handleRenameProfile}
      handleDeleteProfile={handleDeleteProfile}
      handleAddDomain={handleAddDomain}
      handleRemoveDomain={handleRemoveDomain}
      handleToggleChime={handleToggleChime}
      handlePlayMusicTrack={handlePlayMusicTrack}
      handlePauseMusic={handlePauseMusic}
      handleResumeMusic={handleResumeMusic}
      handleStopMusic={handleStopMusic}
      handleNextMusic={handleNextMusic}
      handlePreviousMusic={handlePreviousMusic}
      handleSeekMusic={handleSeekMusic}
      handleSetMusicVolume={handleSetMusicVolume}
      handleToggleMusicShuffle={handleToggleMusicShuffle}
      handleCycleMusicRepeat={handleCycleMusicRepeat}
      handleRefreshMusicCatalog={handleRefreshMusicCatalog}
    />
  ) : (
    <div
      data-testid="popup-boot-loading"
      className="relative w-[400px] min-h-[580px] max-h-[600px] flex flex-col bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 overflow-hidden shadow-xl rounded-none"
    />
  );

  // If in Chrome Extension popup context: render ONLY the functional 400px popup UI
  if (inLiveExtension) {
    return (
      <I18nProvider locale={activeLocale} onChangeLocale={handleSetLanguage}>
        {popupContent}
        {devOverlayNode}
      </I18nProvider>
    );
  }

  // In AI Studio Standalone Web Preview: render SpriteGallery exclusively on #sprites hash
  if (locationHash === '#sprites') {
    return (
      <I18nProvider locale={activeLocale} onChangeLocale={handleSetLanguage}>
        <SpriteGallery
          onBack={() => {
            if (typeof window !== 'undefined') {
              window.location.hash = '';
              setLocationHash('');
            }
          }}
        />
      </I18nProvider>
    );
  }

  // In AI Studio Standalone Web Preview: render demo shell with Chrome mockup frame
  return (
    <I18nProvider locale={activeLocale} onChangeLocale={handleSetLanguage}>
      <div className="min-h-screen bg-slate-100 dark:bg-slate-950 flex flex-col items-center justify-start p-4 md:p-8 font-sans antialiased text-slate-800 dark:text-slate-200">
        {/* AI Studio Demo Header & Controls */}
        <header className="w-full max-w-xl mb-6 flex flex-col items-center text-center space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-50 dark:bg-indigo-950/80 border border-indigo-200 dark:border-indigo-800 rounded-full text-indigo-700 dark:text-indigo-300 text-xs font-semibold">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            {translate(activeLocale, 'preview.badge')}
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            {translate(activeLocale, 'preview.title')}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {translate(activeLocale, 'preview.subtitle')}
          </p>

          <div className="flex items-center gap-3 pt-2">
            <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
              {translate(activeLocale, 'preview.chromeFrame')}
            </span>
            <span className="text-slate-300 dark:text-slate-700">|</span>
            <span className="text-xs text-indigo-600 dark:text-indigo-400 font-medium">
              {translate(activeLocale, 'preview.loadUnpacked')}
            </span>
          </div>
        </header>

        {/* Mock Chrome browser window container */}
        <div className="shadow-2xl rounded-2xl border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
          {/* Chrome browser bar */}
          <div className="bg-slate-100 dark:bg-slate-800/90 px-4 py-2 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-red-400/80"></div>
              <div className="w-3 h-3 rounded-full bg-amber-400/80"></div>
              <div className="w-3 h-3 rounded-full bg-emerald-400/80"></div>
            </div>
            <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate max-w-[200px]">
              chrome-extension://focus-quest/popup.html
            </div>
            <div className="w-4"></div>
          </div>

          {/* 400px Extension Popup UI */}
          {popupContent}
        </div>
        {devOverlayNode}
      </div>
    </I18nProvider>
  );
};

export default App;
