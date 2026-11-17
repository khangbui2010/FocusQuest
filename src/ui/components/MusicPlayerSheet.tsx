import React, { useEffect, useState } from 'react';
import {
  Disc3,
  ExternalLink,
  Music,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Square,
  Volume2,
  VolumeX,
  X,
  AlertCircle,
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
  isOpen: boolean;
  onClose: () => void;
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
  onToggleSyncWithSession: (enabled: boolean) => Promise<void> | void;
}

const NEXT_REPEAT_MODE: Record<RepeatMode, RepeatMode> = {
  off: 'all',
  all: 'one',
  one: 'off',
};

export const MusicPlayerSheet: React.FC<MusicPlayerSheetProps> = ({
  isOpen,
  onClose,
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
  onToggleSyncWithSession,
}) => {
  const { locale, t } = useTranslation();
  const [scrubSec, setScrubSec] = useState<number | null>(null);

  useEffect(() => {
    setScrubSec(null);
  }, [musicState.currentTrackId, isOpen]);

  useEffect(() => {
    if (!isOpen || typeof window === 'undefined') return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  const safeCatalog = Array.isArray(catalog) ? catalog : [];
  const activeTrack =
    getTrackById(musicState.currentTrackId, safeCatalog) ?? safeCatalog[0] ?? null;

  const isPlaying = musicState.status === 'PLAYING';
  const isPaused = musicState.status === 'PAUSED';
  const hasTracks = safeCatalog.length > 0;

  const effectiveDuration =
    musicState.durationSec ?? activeTrack?.duration ?? 0;
  const displayedPosition =
    scrubSec !== null ? scrubSec : Math.min(musicState.positionSec, effectiveDuration || musicState.positionSec);

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

  // Deduplicate attribution credits so required CC BY / CC BY-SA attributions remain visible cleanly
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

  return (
    <div
      data-testid="music-sheet-backdrop"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-xs"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('music.sheetTitle')}
        data-testid="music-player-sheet"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[400px] h-[86%] max-h-[520px] bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700 rounded-t-2xl shadow-2xl flex flex-col overflow-hidden"
      >
        {/* Sheet Header */}
        <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Music className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
            <div className="min-w-0">
              <h2 className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                {t('music.sheetTitle')}
              </h2>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                {t('music.bundledSubtitle')} · {statusLabel}
              </p>
            </div>
          </div>

          <button
            type="button"
            data-testid="music-sheet-close-btn"
            aria-label={t('music.closeAria')}
            onClick={onClose}
            className="p-1 rounded-md text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors motion-reduce:transition-none cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 min-h-0 overflow-y-auto p-3.5 space-y-3">
          {/* Audio Error Alert */}
          {musicState.lastError && (
            <div
              data-testid="music-player-error"
              role="alert"
              className="flex items-start gap-2 p-2.5 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800/70 rounded-lg text-[11px] text-rose-700 dark:text-rose-200"
            >
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400 mt-0.5" />
              <span>{localizeErrorMessage(locale, musicState.lastError)}</span>
            </div>
          )}

          {/* Now Playing Control Deck */}
          <section className="rounded-xl bg-slate-900 dark:bg-slate-950 text-white p-3.5 border border-slate-800 space-y-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-lg bg-indigo-600/25 border border-indigo-400/30 flex items-center justify-center shrink-0">
                <Disc3
                  className={`w-5 h-5 text-indigo-300 ${
                    isPlaying ? 'animate-spin motion-reduce:animate-none' : ''
                  }`}
                />
              </div>
              <div className="min-w-0 flex-1">
                <div
                  data-testid="music-current-title"
                  className="text-sm font-bold text-white truncate"
                >
                  {activeTrack ? activeTrack.title : t('music.noTrackSelected')}
                </div>
                {activeTrack && (
                  <div className="text-[11px] text-slate-300 truncate">
                    {activeTrack.artist} · {activeTrack.album}
                  </div>
                )}
              </div>
            </div>

            {/* Seek Timeline */}
            <div className="space-y-1">
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

            {/* Primary Transport Controls */}
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
                className={`p-2 rounded-lg transition-colors motion-reduce:transition-none cursor-pointer disabled:opacity-35 ${
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
                className="p-2 rounded-lg text-slate-200 hover:text-white hover:bg-slate-800 transition-colors motion-reduce:transition-none cursor-pointer disabled:opacity-35"
              >
                <SkipBack className="w-4 h-4" />
              </button>

              <button
                type="button"
                data-testid="music-play-pause-btn"
                aria-label={
                  isPlaying
                    ? t('music.controls.pause')
                    : isPaused
                    ? t('music.controls.resume')
                    : t('music.controls.play')
                }
                disabled={!hasTracks}
                onClick={handlePrimaryPlayPause}
                className="w-10 h-10 rounded-full bg-indigo-500 hover:bg-indigo-400 text-white flex items-center justify-center shadow-md transition-colors motion-reduce:transition-none cursor-pointer disabled:opacity-35"
              >
                {isPlaying ? (
                  <Pause className="w-4 h-4 fill-current" />
                ) : (
                  <Play className="w-4 h-4 fill-current ml-0.5" />
                )}
              </button>

              <button
                type="button"
                data-testid="music-next-btn"
                aria-label={t('music.controls.next')}
                title={t('music.controls.next')}
                disabled={!hasTracks}
                onClick={() => void onNext()}
                className="p-2 rounded-lg text-slate-200 hover:text-white hover:bg-slate-800 transition-colors motion-reduce:transition-none cursor-pointer disabled:opacity-35"
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
                className={`p-2 rounded-lg transition-colors motion-reduce:transition-none cursor-pointer disabled:opacity-35 ${
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
                className="p-2 rounded-lg text-slate-400 hover:text-rose-300 hover:bg-slate-800 transition-colors motion-reduce:transition-none cursor-pointer disabled:opacity-35"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
              </button>
            </div>

            {/* Volume Row */}
            <div className="flex items-center gap-2 pt-1 border-t border-slate-800/80">
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
                className="p-1.5 rounded text-slate-300 hover:text-white hover:bg-slate-800 cursor-pointer shrink-0"
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
          </section>

          {/* Session Sync Option */}
          <label className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-200 cursor-pointer">
            <span className="font-medium">{t('music.syncWithSessionLabel')}</span>
            <input
              type="checkbox"
              data-testid="music-sync-session-toggle"
              checked={musicState.syncWithSession}
              onChange={(e) => void onToggleSyncWithSession(e.target.checked)}
              className="w-4 h-4 accent-indigo-600 rounded cursor-pointer shrink-0"
            />
          </label>

          {/* Dynamic Playlist from MUSIC_CATALOG */}
          <section className="space-y-1.5">
            <div className="flex items-center justify-between">
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                {t('music.playlistHeading', { count: safeCatalog.length })}
              </h3>
            </div>

            {safeCatalog.length === 0 ? (
              <div
                data-testid="music-empty-catalog"
                className="p-4 text-center rounded-lg border border-dashed border-slate-200 dark:border-slate-700 space-y-1"
              >
                <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  {t('music.emptyCatalogTitle')}
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {t('music.emptyCatalogDesc')}
                </p>
              </div>
            ) : (
              <div data-testid="music-playlist-list" className="space-y-1">
                {safeCatalog.map((track, idx) => {
                  const isCurrent = activeTrack?.id === track.id;
                  const isTrackPlaying = isCurrent && isPlaying;
                  return (
                    <button
                      key={track.id}
                      type="button"
                      data-testid={`music-track-${track.id}`}
                      onClick={() => void onPlayTrack(track.id)}
                      className={`w-full text-left px-2.5 py-2 rounded-lg border flex items-center justify-between gap-2 transition-colors motion-reduce:transition-none cursor-pointer ${
                        isCurrent
                          ? 'bg-indigo-50/80 dark:bg-indigo-950/40 border-indigo-300 dark:border-indigo-700'
                          : 'bg-slate-50/70 dark:bg-slate-800/40 border-slate-200/80 dark:border-slate-800 hover:bg-slate-100/80 dark:hover:bg-slate-800'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <span className="w-5 text-center text-[11px] font-mono tabular-nums text-slate-400 dark:text-slate-500 shrink-0">
                          {isTrackPlaying ? (
                            <Play className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 fill-current inline" />
                          ) : (
                            idx + 1
                          )}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                            {track.title}
                          </div>
                          <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                            {track.artist} · {track.album} · {track.license}
                          </div>
                        </div>
                      </div>
                      <span className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 shrink-0">
                        {track.duration !== undefined
                          ? formatMusicDuration(track.duration)
                          : '--:--'}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          {/* License & Attribution Credits */}
          {attributionEntries.length > 0 && (
            <section
              data-testid="music-credits-section"
              className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/40 p-2.5 space-y-2"
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {t('music.creditsHeading')}
                </h3>
                {attributionEntries.some((entry) => isAttributionRequired(entry.license)) && (
                  <span className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400">
                    {t('music.attributionRequiredBadge')}
                  </span>
                )}
              </div>

              {attributionEntries.map((entry) => (
                <div
                  key={entry.id}
                  data-testid={`music-attribution-${entry.id}`}
                  className="text-[11px] text-slate-600 dark:text-slate-300 space-y-1 leading-relaxed"
                >
                  <div className="font-medium text-slate-800 dark:text-slate-100">
                    {entry.attribution}
                  </div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400">
                    {t('music.licenseLabel')}: {entry.license} · {t('music.creatorLabel')}:{' '}
                    {entry.creator} ·{' '}
                    {entry.isModified ? t('music.modifiedYes') : t('music.modifiedNo')}
                  </div>
                  <div className="flex items-center gap-3 pt-0.5 text-[10px]">
                    {entry.sourceUrl && (
                      <a
                        href={entry.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-indigo-600 dark:text-indigo-400 hover:underline"
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
                        className="inline-flex items-center gap-1 text-indigo-600 dark:text-indigo-400 hover:underline"
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
        </div>
      </div>
    </div>
  );
};
