import { PomodoroPhase } from '../../types/session.ts';
import { UserSettings } from '../../types/storageSchema.ts';

/**
 * Sound effects service for timer notifications and phase transitions.
 * Uses Web Audio API synthesis with graceful fallback when AudioContext is unavailable (e.g. SSR / Node.js).
 * Note: Controlled exclusively by `UserSettings.chimeEnabled` (`undefined` === enabled).
 * Legacy `UserSettings.soundEnabled` is deprecated and ignored.
 */

export function isChimeEnabled(settings?: Pick<UserSettings, 'chimeEnabled'> | null): boolean {
  return settings?.chimeEnabled !== false;
}

export interface ChimePlayer {
  playFocusStartChime: (chimeEnabledOverride?: boolean) => void;
  playBreakStartChime: (chimeEnabledOverride?: boolean) => void;
}

export function playPhaseTransitionChime(
  phase: PomodoroPhase,
  settings?: Pick<UserSettings, 'chimeEnabled'> | null,
  player: ChimePlayer = soundEffects
): boolean {
  if (!isChimeEnabled(settings)) {
    return false;
  }

  if (phase === 'FOCUS') {
    player.playFocusStartChime(true);
  } else {
    player.playBreakStartChime(true);
  }
  return true;
}

class SoundEffectsService {
  private chimeEnabled: boolean = true;

  setChimeEnabled(chimeEnabled?: boolean): void {
    this.chimeEnabled = chimeEnabled !== false;
  }

  isEnabled(): boolean {
    return this.chimeEnabled;
  }

  private getAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;
    try {
      return new AudioCtx();
    } catch {
      return null;
    }
  }

  playFocusStartChime(chimeEnabledOverride?: boolean): void {
    const enabled = chimeEnabledOverride !== undefined ? chimeEnabledOverride !== false : this.chimeEnabled;
    if (!enabled) return;

    const ctx = this.getAudioContext();
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15); // A5
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    } catch {
      // Audio autoplay policy or device error
    }
  }

  playBreakStartChime(chimeEnabledOverride?: boolean): void {
    const enabled = chimeEnabledOverride !== undefined ? chimeEnabledOverride !== false : this.chimeEnabled;
    if (!enabled) return;

    const ctx = this.getAudioContext();
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(659.25, ctx.currentTime); // E5
      osc.frequency.exponentialRampToValueAtTime(523.25, ctx.currentTime + 0.2); // C5
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.4);
    } catch {
      // Audio autoplay policy or device error
    }
  }
}

export const soundEffects = new SoundEffectsService();
