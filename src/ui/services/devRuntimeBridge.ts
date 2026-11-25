import type { FocusProfile } from '../../types/profiles.ts';
import type { ExtensionMessage, FullSessionStateResponse, MessageResponse } from '../../types/messages.ts';
import type { DailyStatRecord } from '../../types/storageSchema.ts';
import type { CivilizationState } from '../../core/civilization/civilizationState.ts';
import type { QuestState } from '../../types/quests.ts';
import type { MusicPlayerState } from '../../types/music.ts';

export type SimPluginMessageHandler = (message: {
  readonly action: string;
  readonly payload?: unknown;
}) => Promise<MessageResponse<unknown>> | MessageResponse<unknown> | null;

export interface SimStateAdapter {
  getFullState: () => FullSessionStateResponse;
  setFullState: (next: FullSessionStateResponse) => void;
  getProfiles: () => FocusProfile[];
  setProfiles: (next: FocusProfile[]) => void;
  getCivState: () => CivilizationState;
  setCivState: (next: CivilizationState) => void;
  getQuestState: () => QuestState;
  setQuestState: (next: QuestState) => void;
  getMusicState: () => MusicPlayerState;
  setMusicState: (next: MusicPlayerState) => void;
  getCustomDailyStats: () => Record<string, DailyStatRecord> | null;
  setCustomDailyStats: (next: Record<string, DailyStatRecord> | null) => void;
  buildDefaultDailyStats: (
    todayDateKey: string,
    liveTodayStats?: DailyStatRecord | null,
    useMaxPreset?: boolean
  ) => Record<string, DailyStatRecord>;
  runCoreMessage: <T = unknown>(message: ExtensionMessage) => MessageResponse<T>;
  syncMusicWithSession: () => void;
}

let activeMessagePlugin: SimPluginMessageHandler | null = null;
let activeTimeScaleProvider: (() => number) | null = null;
let activeSimTickHook: ((elapsedRealMs: number) => void) | null = null;
let activeSimulatorAdapter: SimStateAdapter | null = null;

export function registerSimMessagePlugin(handler: SimPluginMessageHandler | null): void {
  activeMessagePlugin = handler;
}

export async function dispatchSimMessagePlugin<T = unknown>(message: {
  readonly action: string;
  readonly payload?: unknown;
}): Promise<MessageResponse<T> | null> {
  if (!activeMessagePlugin) {
    return null;
  }
  const result = await activeMessagePlugin(message);
  return (result as MessageResponse<T> | null) ?? null;
}

export function registerTimeScaleProvider(provider: (() => number) | null): void {
  activeTimeScaleProvider = provider;
}

export function getActiveTimeScale(): number {
  if (!activeTimeScaleProvider) {
    return 1;
  }
  const raw = activeTimeScaleProvider();
  return typeof raw === 'number' && Number.isFinite(raw) && raw >= 1 ? raw : 1;
}

export function registerSimTickHook(hook: ((elapsedRealMs: number) => void) | null): void {
  activeSimTickHook = hook;
}

export function notifySimTick(elapsedRealMs: number): void {
  if (activeSimTickHook && Number.isFinite(elapsedRealMs) && elapsedRealMs > 0) {
    activeSimTickHook(elapsedRealMs);
  }
}

export function registerSimStateAdapter(adapter: SimStateAdapter | null): void {
  activeSimulatorAdapter = adapter;
}

export function getSimStateAdapter(): SimStateAdapter | null {
  return activeSimulatorAdapter;
}
