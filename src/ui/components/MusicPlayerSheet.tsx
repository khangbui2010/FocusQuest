import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Disc3,
  ExternalLink,
  Music,
  Pause,
  Play,
  RefreshCw,
  Repeat,
  Repeat1,
  ShieldCheck,
  Shuffle,
  SkipBack,
  SkipForward,
  Square,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { MusicPlayerState, MusicTrack, RepeatMode } from '../../types/music.ts';
import {
  formatMusicDuration,
  getTrackById,
  isAttributionRequired,
} from '../../data/musicCatalog.ts';
import { useTranslation } from '../../i18n/I18nContext.tsx';
import { localizeErrorMessage } from '../../i18n/errorTranslator.ts';

export interface MusicPlayerSheetProps {
  /** Expanded sheet visibility (persisted in UserSettings.musicPlayerExpanded, default false). */
  isExpanded?: boolean;
  /** Toggle sheet expanded/collapsed state. */
  onToggleExpand?: (expanded: boolean) => Promise<void> | void;
  /** Legacy alias kept for compatibility with existing unit harnesses. */
  isOpen?: boolean;
  /** Legacy alias kept for compatibility with existing unit harnesses. */
  onClose?: () => void;
  /** Whether the 64px bottom navigation bar is currently rendered below the mini-player. */
  hasBottomNav?: boolean;
  /** Optional initial state for the License & Attribution panel (defaults to false). */
  defaultCreditsOpen?: boolean;
  musicState: MusicPlayerState;
  catalog: readonly MusicTrack[];
  onPlayTrack: (trackId?: string) => Promise<void> | void;
  onPause: () => Promise<void> | void;
  onResume: () => Promise<void> | void;
  onStop: () => Promise<void> | void;
  onNext: () => Promise<void> | void;
  onPrevious: () => Promise<void> | void;
  onSeek: (positionSec: number) => Promise<void> | void;
  onSetVolume: (volume: number, muted?: boolean) => Promise<void> | void;
  onToggleShuffle: (enabled: boolean) => Promise<void> | void;
  onCycleRepeat: (nextMode: RepeatMode) => Promise<void> | void;
  onRefreshCatalog?: () => Promise<void> | void;
}

const NEXT_REPEAT_MODE: Record<RepeatMode, RepeatMode> = {
  off: 'all',
  all: 'one',
  one: 'off',
};

export function formatShortLicenseBadge(license: string): string {
  const upper = license.trim().toUpperCase();
  if (upper.startsWith('CC0')) return 'CC0';
  if (upper.includes('BY-SA')) return 'BY-SA';
  if (upper.includes('BY')) return 'BY';
  return license;
}

export const MusicPlayerSheet: React.FC<MusicPlayerSheetProps> = ({
  isExpanded,
  onToggleExpand,
  isOpen,
  onClose,
  hasBottomNav = true,
  defaultCreditsOpen = false,
  musicState,
  catalog,
  onPlayTrack,
  onPause,
  onResume,
  onStop,
  onNext,
  onPrevious,
  onSeek,
  onSetVolume,
  onToggleShuffle,
  onCycleRepeat,
  onRefreshCatalog,
}) => {
  const { locale, t } = useTranslation();
  const [scrubSec, setScrubSec] = useState<number | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isCreditsOpen, setIsCreditsOpen] = useState<boolean>(defaultCreditsOpen);

  const expanded = Boolean(isExpanded ?? isOpen ?? false);
  const safeCatalog = Array.isArray(catalog) ? catalog : [];

  const handleSetExpanded = (nextExpanded: boolean) => {
    if (onToggleExpand) {
      void onToggleExpand(nextExpanded);
    } else if (!nextExpanded && onClose) {
      onClose();
    }
  };

  const handleRefreshClick = async () => {
    if (!onRefreshCatalog || isRefreshing) return;
    setIsRefreshing(true);
    try {
      await onRefreshCatalog();
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    setScrubSec(null);
  }, [musicState.currentTrackId, expanded]);

  useEffect(() => {
    if (!expanded || typeof window === 'undefined') return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleSetExpanded(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [expanded, onToggleExpand, onClose]);

  const activeTrack =
    getTrackById(musicState.currentTrackId, safeCatalog) ?? safeCatalog[0] ?? null;

  const isPlaying = musicState.status === 'PLAYING';
  const isPaused = musicState.status === 'PAUSED';
  const hasTracks = safeCatalog.length > 0;

  const effectiveDuration =
    musicState.durationSec ?? activeTrack?.durationSec ?? activeTrack?.duration ?? 0;
  const displayedPosition =
    scrubSec !== null
      ? scrubSec
      : Math.min(musicState.positionSec, effectiveDuration || musicState.positionSec);

  const progressPercent =
    hasTracks && effectiveDuration > 0
      ? Math.max(0, Math.min(100, (displayedPosition / effectiveDuration) * 100))
      : 0;

  const statusLabel = (() => {
    switch (musicState.status) {
      case 'PLAYING':
        return t('music.status.playing');
      case 'PAUSED':
        return t('music.status.paused');
      case 'STOPPED':
        return t('music.status.stopped');
      case 'ERROR':
        return t('music.status.error');
      default:
        return t('music.status.idle');
    }
  })();

  const repeatLabel = (() => {
    switch (musicState.repeatMode) {
      case 'all':
        return t('music.controls.repeatAll');
      case 'one':
        return t('music.controls.repeatOne');
      default:
        return t('music.controls.repeatOff');
    }
  })();

  const handlePrimaryPlayPause = () => {
    if (!hasTracks) return;
    if (isPlaying) {
      void onPause();
    } else if (isPaused) {
      void onResume();
    } else {
      void onPlayTrack(activeTrack?.id);
    }
  };

  // Attribution credits for currently active track (honoring CC-BY / CC-BY-SA)
  const attributionEntries = (() => {
    const targetTracks = activeTrack ? [activeTrack] : safeCatalog;
    const seen = new Set<string>();
    const list: MusicTrack[] = [];
    for (const item of targetTracks) {
      const key = `${item.license}|${item.creator}|${item.attribution}`;
      if (!seen.has(key)) {
        seen.add(key);
        list.push(item);
      }
    }
    return list;
  })();

  const playPauseAriaLabel = isPlaying
    ? t('music.controls.pause')
    : isPaused
    ? t('music.controls.resume')
    : t('music.controls.play');

  return (
    <>
      {/* 1. Persistent Mini-Player Bar (~56px, immediately above bottom tab bar on every tab) */}
      <section
        aria-label={t('music.miniPlayerAria')}
        data-testid="music-mini-player"
        className="relative h-[56px] shrink-0 bg-slate-900 dark:bg-slate-950 text-white border-t border-slate-800 flex flex-col justify-between select-none"
      >
        {/* Top 3px slim progress indicator */}
        <div
          data-testid="music-mini-progress-track"
          className="w-full h-[3px] bg-slate-800 overflow-hidden shrink-0"
        >
          <div
            data-testid="music-mini-progress"
            className="h-full bg-indigo-400 transition-all duration-300 motion-reduce:transition-none"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* Mini-player content row (53px remaining) */}
        <div className="flex-1 min-h-0 px-2.5 flex items-center justify-between gap-2">
          {!hasTracks ? (
            <>
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <div className="w-9 h-9 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0">
                  <Music className="w-4 h-4 text-slate-400" />
                </div>
                <span
                  data-testid="music-mini-empty-label"
                  className="text-xs font-medium text-slate-300 truncate"
                >
                  {t('music.miniNotLoaded')}
                </span>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                {onRefreshCatalog && (
                  <button
                    type="button"
                    data-testid="music-mini-retry-btn"
                    aria-label={t('music.retryCatalogBtn')}
                    disabled={isRefreshing}
                    onClick={() => void handleRefreshClick()}
                    className="min-h-[36px] px-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                    <span>
                      {isRefreshing ? t('music.retryingCatalogBtn') : t('music.retryCatalogBtn')}
                    </span>
                  </button>
                )}

                <button
                  type="button"
                  data-testid="music-mini-expand-btn"
                  aria-label={t('music.expandAria')}
                  aria-expanded={expanded}
                  onClick={() => handleSetExpanded(!expanded)}
                  className="min-w-[36px] min-h-[36px] w-9 h-9 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 flex items-center justify-center transition-colors motion-reduce:transition-none cursor-pointer"
                >
                  <ChevronUp className="w-4 h-4" />
                </button>
              </div>
            </>
          ) : (
            <>
              {/* Cover icon + Title + Artist · Album */}
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <div className="w-9 h-9 rounded-lg bg-indigo-500/25 border border-indigo-400/35 flex items-center justify-center shrink-0">
                  <Disc3
                    className={`w-4 h-4 text-indigo-300 ${
                      isPlaying ? 'animate-spin motion-reduce:animate-none' : ''
                    }`}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div
                    data-testid="music-mini-title"
                    className="text-xs font-semibold text-white truncate leading-tight"
                  >
                    {activeTrack ? activeTrack.title : t('music.noTrackSelected')}
                  </div>
                  {activeTrack && (
                    <div
                      data-testid="music-mini-subtitle"
                      className="text-[10px] text-slate-300 truncate leading-tight mt-0.5"
                    >
                      {`${activeTrack.artist} · ${activeTrack.album}`}
                    </div>
                  )}
                </div>
              </div>

              {/* Mini transport + chevron-up controls (min 36px target, play 40px) */}
              <div className="flex items-center gap-0.5 shrink-0">
                <button
                  type="button"
                  data-testid="music-mini-prev-btn"
                  aria-label={t('music.controls.previous')}
                  title={t('music.controls.previous')}
                  onClick={() => void onPrevious()}
                  className="min-w-[36px] min-h-[36px] w-9 h-9 rounded-lg text-slate-200 hover:text-white hover:bg-slate-800 flex items-center justify-center transition-colors motion-reduce:transition-none cursor-pointer"
                >
                  <SkipBack className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  data-testid="music-mini-play-pause-btn"
                  aria-label={playPauseAriaLabel}
                  title={playPauseAriaLabel}
                  onClick={handlePrimaryPlayPause}
                  className="min-w-[40px] min-h-[40px] w-[40px] h-[40px] rounded-full bg-indigo-500 hover:bg-indigo-400 text-white flex items-center justify-center shadow-sm transition-colors motion-reduce:transition-none cursor-pointer"
                >
                  {isPlaying ? (
                    <Pause className="w-4 h-4 fill-current" />
                  ) : (
                    <Play className="w-4 h-4 fill-current ml-0.5" />
                  )}
                </button>

                <button
                  type="button"
                  data-testid="music-mini-next-btn"
                  aria-label={t('music.controls.next')}
                  title={t('music.controls.next')}
                  onClick={() => void onNext()}
                  className="min-w-[36px] min-h-[36px] w-9 h-9 rounded-lg text-slate-200 hover:text-white hover:bg-slate-800 flex items-center justify-center transition-colors motion-reduce:transition-none cursor-pointer"
                >
                  <SkipForward className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  data-testid="music-mini-expand-btn"
                  aria-label={t('music.expandAria')}
                  aria-expanded={expanded}
                  title={t('music.expandAria')}
                  onClick={() => handleSetExpanded(!expanded)}
                  className="min-w-[36px] min-h-[36px] w-9 h-9 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 flex items-center justify-center transition-colors motion-reduce:transition-none cursor-pointer"
                >
                  <ChevronUp className="w-4 h-4" />
                </button>
              </div>
            </>
          )}
        </div>
      </section>

      {/* 2. Expandable Bottom Sheet (taller sheet so 5+ tracks are visible at once) */}
      {expanded && (
        <div
          data-testid="music-sheet-backdrop"
          onClick={() => handleSetExpanded(false)}
          className={`fixed inset-0 z-50 ${
            hasBottomNav ? 'pb-[64px]' : 'pb-0'
          } flex items-end justify-center bg-black/55 backdrop-blur-xs`}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t('music.lofiSheetTitle')}
            data-testid="music-player-sheet"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[400px] h-[560px] max-h-[95%] bg-slate-950 text-slate-100 border-t border-slate-800 rounded-t-[22px] shadow-2xl flex flex-col overflow-hidden"
          >
            {/* a. Sheet Header: "Nhạc Lofi tập trung" + Refresh + Chevron-Down */}
            <div className="px-4 py-1.5 border-b border-slate-800/90 flex items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <Music className="w-4 h-4 text-indigo-400 shrink-0" />
                <div className="min-w-0">
                  <h2 className="text-xs font-bold text-white truncate">
                    {t('music.lofiSheetTitle')}
                  </h2>
                  <p className="text-[10px] text-slate-400 truncate">
                    {`${t('music.streamedSubtitle')} · ${statusLabel}`}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                {onRefreshCatalog && (
                  <button
                    type="button"
                    data-testid="music-refresh-catalog-btn"
                    aria-label={t('music.refreshCatalogAria')}
                    title={t('music.refreshCatalogAria')}
                    disabled={isRefreshing}
                    onClick={() => void handleRefreshClick()}
                    className="w-8 h-8 rounded-lg text-slate-300 hover:text-indigo-300 hover:bg-slate-800/80 flex items-center justify-center transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                  </button>
                )}

                <button
                  type="button"
                  data-testid="music-sheet-close-btn"
                  aria-label={t('music.collapseAria')}
                  title={t('music.collapseAria')}
                  onClick={() => handleSetExpanded(false)}
                  className="w-9 h-9 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 flex items-center justify-center transition-colors motion-reduce:transition-none cursor-pointer shrink-0"
                >
                  <ChevronDown className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Audio Error Banner (if any) */}
            {(musicState.lastError || musicState.lastErrorCode) && (
              <div
                data-testid="music-player-error"
                role="alert"
                className="mx-3.5 mt-2 flex items-start gap-2 px-2.5 py-1.5 bg-rose-950/60 border border-rose-800/70 rounded-lg text-[11px] text-rose-200 shrink-0"
              >
                <AlertCircle className="w-3.5 h-3.5 shrink-0 text-rose-400 mt-0.5" />
                <span className="line-clamp-2">
                  {localizeErrorMessage(
                    locale,
                    musicState.lastError ||
                      (musicState.lastErrorCode
                        ? `Audio playback failed (${musicState.lastErrorCode}).`
                        : '')
                  )}
                </span>
              </div>
            )}

            {/* Upper Deck (b, c, d, e) */}
            <div className="px-3.5 pt-1.5 pb-1.5 space-y-1.5 shrink-0 border-b border-slate-800/70">
              {/* b. Now Playing: 56px cover square + title + artist · album */}
              <div data-testid="music-now-playing" className="flex items-center gap-3 min-w-0">
                <div
                  data-testid="music-sheet-cover"
                  className="w-14 h-14 rounded-xl bg-indigo-500/20 border border-indigo-400/35 flex items-center justify-center shrink-0"
                >
                  <Disc3
                    className={`w-7 h-7 text-indigo-300 ${
                      isPlaying ? 'animate-spin motion-reduce:animate-none' : ''
                    }`}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-indigo-300">
                    {t('music.nowPlayingLabel')}
                  </div>
                  <div
                    data-testid="music-current-title"
                    className="text-sm font-bold text-white truncate"
                  >
                    {activeTrack ? activeTrack.title : t('music.noTrackSelected')}
                  </div>
                  {activeTrack && (
                    <div className="text-[11px] text-slate-300 truncate">
                      {`${activeTrack.artist} · ${activeTrack.album}`}
                    </div>
                  )}
                </div>
              </div>

              {/* c. Seek Timeline + Tabular Timestamps */}
              <div className="space-y-0.5">
                <input
                  type="range"
                  data-testid="music-seek-slider"
                  aria-label={t('music.controls.seekAria')}
                  min={0}
                  max={effectiveDuration > 0 ? effectiveDuration : 100}
                  step={1}
                  disabled={!hasTracks || effectiveDuration <= 0}
                  value={Math.floor(displayedPosition)}
                  onChange={(e) => setScrubSec(Number(e.target.value))}
                  onMouseUp={(e) => {
                    const val = Number((e.target as HTMLInputElement).value);
                    setScrubSec(null);
                    void onSeek(val);
                  }}
                  onTouchEnd={(e) => {
                    const val = Number((e.target as HTMLInputElement).value);
                    setScrubSec(null);
                    void onSeek(val);
                  }}
                  onKeyUp={(e) => {
                    const val = Number((e.target as HTMLInputElement).value);
                    setScrubSec(null);
                    void onSeek(val);
                  }}
                  className="w-full h-1.5 accent-indigo-400 cursor-pointer disabled:opacity-40"
                />
                <div className="flex items-center justify-between text-[10px] font-mono tabular-nums text-slate-400">
                  <span data-testid="music-position-time">
                    {formatMusicDuration(displayedPosition)}
                  </span>
                  <span data-testid="music-duration-time">
                    {formatMusicDuration(effectiveDuration)}
                  </span>
                </div>
              </div>

              {/* d. Transport Controls: Shuffle, Prev, 52px Play/Pause, Next, Repeat, Stop */}
              <div className="flex items-center justify-between gap-1">
                <button
                  type="button"
                  data-testid="music-shuffle-btn"
                  aria-pressed={musicState.shuffle}
                  aria-label={
                    musicState.shuffle
                      ? t('music.controls.shuffleOn')
                      : t('music.controls.shuffleOff')
                  }
                  title={
                    musicState.shuffle
                      ? t('music.controls.shuffleOn')
                      : t('music.controls.shuffleOff')
                  }
                  disabled={!hasTracks}
                  onClick={() => void onToggleShuffle(!musicState.shuffle)}
                  className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors motion-reduce:transition-none cursor-pointer disabled:opacity-35 ${
                    musicState.shuffle
                      ? 'bg-indigo-500/25 text-indigo-300'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  <Shuffle className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  data-testid="music-prev-btn"
                  aria-label={t('music.controls.previous')}
                  title={t('music.controls.previous')}
                  disabled={!hasTracks}
                  onClick={() => void onPrevious()}
                  className="w-9 h-9 rounded-lg text-slate-200 hover:text-white hover:bg-slate-800 flex items-center justify-center transition-colors motion-reduce:transition-none cursor-pointer disabled:opacity-35"
                >
                  <SkipBack className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  data-testid="music-play-pause-btn"
                  aria-label={playPauseAriaLabel}
                  disabled={!hasTracks}
                  onClick={handlePrimaryPlayPause}
                  className="w-[52px] h-[52px] rounded-full bg-indigo-500 hover:bg-indigo-400 text-white flex items-center justify-center shadow-lg transition-colors motion-reduce:transition-none cursor-pointer disabled:opacity-35 shrink-0"
                >
                  {isPlaying ? (
                    <Pause className="w-5 h-5 fill-current" />
                  ) : (
                    <Play className="w-5 h-5 fill-current ml-0.5" />
                  )}
                </button>

                <button
                  type="button"
                  data-testid="music-next-btn"
                  aria-label={t('music.controls.next')}
                  title={t('music.controls.next')}
                  disabled={!hasTracks}
                  onClick={() => void onNext()}
                  className="w-9 h-9 rounded-lg text-slate-200 hover:text-white hover:bg-slate-800 flex items-center justify-center transition-colors motion-reduce:transition-none cursor-pointer disabled:opacity-35"
                >
                  <SkipForward className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  data-testid="music-repeat-btn"
                  aria-label={repeatLabel}
                  title={repeatLabel}
                  disabled={!hasTracks}
                  onClick={() => void onCycleRepeat(NEXT_REPEAT_MODE[musicState.repeatMode])}
                  className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors motion-reduce:transition-none cursor-pointer disabled:opacity-35 ${
                    musicState.repeatMode !== 'off'
                      ? 'bg-indigo-500/25 text-indigo-300'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  {musicState.repeatMode === 'one' ? (
                    <Repeat1 className="w-4 h-4" />
                  ) : (
                    <Repeat className="w-4 h-4" />
                  )}
                </button>

                <button
                  type="button"
                  data-testid="music-stop-btn"
                  aria-label={t('music.controls.stop')}
                  title={t('music.controls.stop')}
                  disabled={!hasTracks || (musicState.status === 'IDLE' && musicState.positionSec === 0)}
                  onClick={() => void onStop()}
                  className="w-9 h-9 rounded-lg text-slate-400 hover:text-rose-300 hover:bg-slate-800 flex items-center justify-center transition-colors motion-reduce:transition-none cursor-pointer disabled:opacity-35"
                >
                  <Square className="w-3.5 h-3.5 fill-current" />
                </button>
              </div>

              {/* e. Volume Row + compact session behavior toggles */}
              <div className="space-y-1.5 pt-1 border-t border-slate-800/80">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    data-testid="music-mute-btn"
                    aria-label={
                      musicState.muted ? t('music.controls.unmute') : t('music.controls.mute')
                    }
                    title={
                      musicState.muted ? t('music.controls.unmute') : t('music.controls.mute')
                    }
                    onClick={() => void onSetVolume(musicState.volume, !musicState.muted)}
                    className="p-1 rounded text-slate-300 hover:text-white hover:bg-slate-800 cursor-pointer shrink-0"
                  >
                    {musicState.muted || musicState.volume === 0 ? (
                      <VolumeX className="w-4 h-4 text-rose-400" />
                    ) : (
                      <Volume2 className="w-4 h-4" />
                    )}
                  </button>
                  <input
                    type="range"
                    data-testid="music-volume-slider"
                    aria-label={t('music.controls.volumeLabel')}
                    min={0}
                    max={100}
                    step={1}
                    value={musicState.muted ? 0 : Math.round(musicState.volume * 100)}
                    onChange={(e) => {
                      const vol = Number(e.target.value) / 100;
                      void onSetVolume(vol, vol === 0);
                    }}
                    className="flex-1 h-1.5 accent-indigo-400 cursor-pointer"
                  />
                  <span className="text-[10px] font-mono tabular-nums text-slate-400 w-8 text-right shrink-0">
                    {musicState.muted ? '0%' : `${Math.round(musicState.volume * 100)}%`}
                  </span>
                </div>
              </div>

            </div>

            {/* f. Scrollable Track List (rows ~46px with index / equalizer, short license badge, duration) */}
            <div className="flex-1 min-h-0 overflow-y-auto px-3.5 py-1.5 space-y-1">
              <h3 className="sr-only">{t('music.playlistHeading', { count: safeCatalog.length })}</h3>

              {safeCatalog.length === 0 ? (
                <div
                  data-testid="music-empty-catalog"
                  className="p-3 text-center rounded-xl border border-dashed border-slate-700 bg-slate-900/60 space-y-2"
                >
                  <div className="text-xs font-semibold text-slate-200">
                    {t('music.emptyCatalogTitle')}
                  </div>
                  <p className="text-[11px] text-slate-400">{t('music.emptyCatalogDesc')}</p>
                  {onRefreshCatalog && (
                    <button
                      type="button"
                      data-testid="music-retry-catalog-btn"
                      disabled={isRefreshing}
                      onClick={() => void handleRefreshClick()}
                      className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                      <span>
                        {isRefreshing ? t('music.retryingCatalogBtn') : t('music.retryCatalogBtn')}
                      </span>
                    </button>
                  )}
                </div>
              ) : (
                <div data-testid="music-playlist-list" className="space-y-1">
                  {safeCatalog.map((track, idx) => {
                    const isCurrent = activeTrack?.id === track.id;
                    const isTrackPlaying = isCurrent && isPlaying;
                    const shortBadge = formatShortLicenseBadge(track.license);
                    return (
                      <button
                        key={track.id}
                        type="button"
                        data-testid={`music-track-${track.id}`}
                        onClick={() => void onPlayTrack(track.id)}
                        className={`w-full min-h-[46px] text-left px-2.5 py-1.5 rounded-xl border flex items-center justify-between gap-2 transition-colors motion-reduce:transition-none cursor-pointer ${
                          isCurrent
                            ? 'bg-indigo-950/60 border-indigo-500/70'
                            : 'bg-slate-900/70 border-slate-800 hover:bg-slate-900 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <span className="w-5 flex items-center justify-center text-[11px] font-mono tabular-nums text-slate-400 shrink-0">
                            {isTrackPlaying ? (
                              <span
                                data-testid="music-playing-equalizer"
                                aria-label={t('music.playingEqualizerAria')}
                                className="inline-flex items-end gap-[2px] h-3"
                              >
                                <span className="fq-music-eq-bar w-[2px] h-3 bg-indigo-400 rounded-xs" />
                                <span
                                  className="fq-music-eq-bar w-[2px] h-2 bg-indigo-300 rounded-xs"
                                  style={{ animationDelay: '0.2s' }}
                                />
                                <span
                                  className="fq-music-eq-bar w-[2px] h-2.5 bg-indigo-400 rounded-xs"
                                  style={{ animationDelay: '0.4s' }}
                                />
                              </span>
                            ) : (
                              idx + 1
                            )}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-semibold text-white truncate leading-tight">
                              {track.title}
                            </div>
                            <div className="text-[10px] text-slate-400 truncate leading-tight mt-0.5">
                              {`${track.artist} · ${track.album}`}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <span
                            data-testid={`music-track-license-${track.id}`}
                            title={track.license}
                            className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-[9px] font-mono font-semibold text-slate-300"
                          >
                            {shortBadge}
                          </span>
                          <span className="text-[11px] font-mono tabular-nums text-slate-400 w-9 text-right">
                            {(track.durationSec ?? track.duration) !== undefined
                              ? formatMusicDuration(track.durationSec ?? track.duration)
                              : '--:--'}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* h. Expandable Attribution Panel + Sheet Footer Toggle */}
            {isCreditsOpen && attributionEntries.length > 0 && (
              <section
                data-testid="music-credits-section"
                className="mx-3.5 mb-1.5 rounded-xl border border-slate-800 bg-slate-900 p-2.5 space-y-1.5 max-h-[120px] overflow-y-auto shrink-0"
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    {t('music.creditsHeading')}
                  </h3>
                  {attributionEntries.some((entry) => isAttributionRequired(entry.license)) && (
                    <span className="text-[10px] font-semibold text-indigo-300">
                      {t('music.attributionRequiredBadge')}
                    </span>
                  )}
                </div>

                {attributionEntries.map((entry) => (
                  <div
                    key={entry.id}
                    data-testid={`music-attribution-${entry.id}`}
                    className="text-[11px] text-slate-300 space-y-1 leading-relaxed"
                  >
                    <div className="font-medium text-slate-100">{entry.attribution}</div>
                    <div className="text-[10px] text-slate-400">
                      {t('music.licenseLabel')}: {entry.license} · {t('music.creatorLabel')}:{' '}
                      {entry.creator} ·{' '}
                      {(entry.isModified ?? entry.modified)
                        ? t('music.modifiedYes')
                        : t('music.modifiedNo')}
                    </div>
                    <div className="flex items-center gap-3 pt-0.5 text-[10px]">
                      {entry.sourceUrl && (
                        <a
                          href={entry.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-indigo-300 hover:underline"
                        >
                          <span>{t('music.sourceLink')}</span>
                          <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      )}
                      {entry.licenseUrl && (
                        <a
                          href={entry.licenseUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-indigo-300 hover:underline"
                        >
                          <span>{t('music.licenseLink')}</span>
                          <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </section>
            )}

            <footer className="px-4 py-1.5 border-t border-slate-800/90 bg-slate-950 flex items-center justify-between shrink-0">
              <button
                type="button"
                data-testid="music-credits-toggle-btn"
                aria-expanded={isCreditsOpen}
                onClick={() => setIsCreditsOpen((prev) => !prev)}
                className="inline-flex items-center gap-1.5 text-[11px] font-medium text-indigo-300 hover:text-indigo-200 cursor-pointer py-0.5"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>{t('music.creditsFooterBtn')}</span>
              </button>
              <span className="text-[10px] font-mono text-slate-500">
                {t('music.playlistHeading', { count: safeCatalog.length })}
              </span>
            </footer>
          </div>
        </div>
      )}
    </>
  );
};
