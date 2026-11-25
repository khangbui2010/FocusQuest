import React, { useState, useEffect, useCallback, useRef } from 'react';
import { getAllBuildingDefinitions } from '../core/civilization/buildingCatalog.ts';
import { getVillagerCapacity, findVillageCave } from '../core/civilization/villager.ts';
import { formatRewardAmount } from '../ui/utils/formatters.ts';
import { VILLAGER_ROLES, VillagerRole } from '../ui/components/civilization/spriteRegistry.ts';
import { sendExtensionMessage } from '../ui/services/extensionClient.ts';
import { ExtensionMessage, MessageResponse } from '../types/messages.ts';
import {
  DEV_TIME_SPEED_OPTIONS,
  DevActionLogEntry,
  DevActionName,
  DevExportBundle,
  DevPresetId,
  DevSnapshotData,
  DevTimeSpeed,
} from './devTypes.ts';

export interface DevGodModePanelProps {
  onRefreshState: () => Promise<void>;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  onTimeSpeedSync?: (speed: DevTimeSpeed) => void;
}

const MAX_ACTION_LOG_ENTRIES = 20;

const PRESET_BUTTONS: ReadonlyArray<{ id: DevPresetId; label: string }> = [
  { id: 'newcomer', label: 'Newcomer (Empty)' },
  { id: 'mid_stone', label: 'Mid Stone' },
  { id: 'era_ready', label: 'Era Ready' },
  { id: 'full_jobs', label: 'Full Jobs (4+2)' },
  { id: 'late_stone', label: 'Late Stone Max' },
];

const UNDOABLE_ACTIONS = new Set<DevActionName>([
  'DEV_SET_COINS',
  'DEV_SET_LEVEL',
  'DEV_SET_FOCUS_MINUTES',
  'DEV_ADVANCE_ACTIVE_SESSION_MS',
  'DEV_SKIP_FOCUS_WAIT',
  'DEV_COMPLETE_ALL_JOBS',
  'DEV_PLACE_FREE_BUILDING',
  'DEV_MAX_BUILDINGS',
  'DEV_UNLOCK_LAND',
  'DEV_RECRUIT_FREE',
  'DEV_FILL_ALL_ROLES',
  'DEV_MEET_ERA_REQUIREMENTS',
  'DEV_COMPLETE_ALL_QUESTS',
  'DEV_ROLLOVER_QUESTS',
  'DEV_FAST_FORWARD_DAY',
  'DEV_SEED_DEMO_DATA',
  'DEV_APPLY_PRESET',
  'DEV_IMPORT_STATE',
  'DEV_RESET_ALL_DATA',
]);

export function appendDevActionLog(
  current: readonly DevActionLogEntry[],
  entry: DevActionLogEntry
): DevActionLogEntry[] {
  return [entry, ...current].slice(0, MAX_ACTION_LOG_ENTRIES);
}

function formatLogTime(timestamp: number): string {
  try {
    const d = new Date(timestamp);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  } catch {
    return '--:--:--';
  }
}

function downloadJsonBackupFile(bundle: DevExportBundle): boolean {
  if (typeof document === 'undefined' || typeof URL === 'undefined' || typeof Blob === 'undefined') {
    return false;
  }
  try {
    const json = JSON.stringify(bundle, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `focus-quest-dev-backup-${bundle.exportedAt}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  } catch {
    return false;
  }
}

async function sendDevCommand<T = DevSnapshotData>(
  action: DevActionName,
  payload?: unknown
): Promise<MessageResponse<T>> {
  return sendExtensionMessage<T>({
    action,
    payload,
  } as unknown as ExtensionMessage);
}

const DevGodModePanelInner: React.FC<DevGodModePanelProps> = ({
  onRefreshState,
  isOpen: controlledIsOpen,
  onOpenChange,
  onTimeSpeedSync,
}) => {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledIsOpen !== undefined;
  const isOpen = isControlled ? controlledIsOpen : internalOpen;

  const setOpen = useCallback(
    (next: boolean | ((prev: boolean) => boolean)) => {
      const target = typeof next === 'function' ? next(isOpen) : next;
      if (!isControlled) {
        setInternalOpen(target);
      }
      onOpenChange?.(target);
    },
    [isControlled, isOpen, onOpenChange]
  );

  const [snapshot, setSnapshot] = useState<DevSnapshotData | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [coinsInput, setCoinsInput] = useState('1000');
  const [levelInput, setLevelInput] = useState('9');
  const [focusMinsInput, setFocusMinsInput] = useState('60');
  const [selectedBuildingId, setSelectedBuildingId] = useState('stone_age_campfire');
  const [jsonBuffer, setJsonBuffer] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);

  const [actionLog, setActionLog] = useState<DevActionLogEntry[]>([]);
  const [undoSnapshot, setUndoSnapshot] = useState<{
    label: string;
    bundle: DevExportBundle;
  } | null>(null);
  const logSeqRef = useRef(0);

  const catalogDefs = getAllBuildingDefinitions();

  const loadSnapshot = useCallback(async () => {
    const res = await sendDevCommand<DevSnapshotData>('DEV_GET_SNAPSHOT');
    if (res.success && res.data) {
      setSnapshot(res.data);
      onTimeSpeedSync?.(res.data.timeSpeed);
    }
  }, [onTimeSpeedSync]);

  useEffect(() => {
    if (isOpen) {
      void loadSnapshot();
    }
  }, [isOpen, loadSnapshot]);

  useEffect(() => {
    if (!isOpen || typeof window === 'undefined') {
      return undefined;
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, setOpen]);

  const recordLog = useCallback(
    (label: string, action: DevActionName, status: 'ok' | 'err', detail?: string) => {
      logSeqRef.current += 1;
      const now = Date.now();
      setActionLog((prev) =>
        appendDevActionLog(prev, {
          id: `log_${now}_${logSeqRef.current}`,
          timestamp: now,
          label,
          action,
          status,
          detail,
        })
      );
    },
    []
  );

  const runAction = async (
    label: string,
    action: DevActionName,
    payload?: unknown,
    onDone?: (data: unknown) => void
  ) => {
    setBusyAction(label);
    setToast(null);
    try {
      let capturedUndoBundle: DevExportBundle | null = null;
      if (UNDOABLE_ACTIONS.has(action)) {
        const exp = await sendDevCommand<DevExportBundle>('DEV_EXPORT_STATE');
        if (exp.success && exp.data) {
          capturedUndoBundle = exp.data;
        }
      }

      const res = await sendDevCommand<unknown>(action, payload);
      if (!res.success) {
        const errMsg = res.error || `${action} failed`;
        setToast({ type: 'err', text: errMsg });
        recordLog(label, action, 'err', errMsg);
        return;
      }

      if (capturedUndoBundle) {
        setUndoSnapshot({ label, bundle: capturedUndoBundle });
      }

      if (action !== 'DEV_EXPORT_STATE' && res.data) {
        const nextSnap = res.data as DevSnapshotData;
        setSnapshot(nextSnap);
        onTimeSpeedSync?.(nextSnap.timeSpeed);
      }

      if (onDone && res.data !== undefined) {
        onDone(res.data);
      }
      await onRefreshState();
      setToast({ type: 'ok', text: `${label} applied.` });
      recordLog(label, action, 'ok');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setToast({ type: 'err', text: msg });
      recordLog(label, action, 'err', msg);
    } finally {
      setBusyAction(null);
    }
  };

  const handleUndoLast = async () => {
    if (!undoSnapshot || busyAction !== null) return;
    const target = undoSnapshot;
    setBusyAction('Undo');
    setToast(null);
    try {
      const res = await sendDevCommand<DevSnapshotData>('DEV_IMPORT_STATE', {
        bundle: target.bundle,
      });
      if (!res.success) {
        const errMsg = res.error || 'Undo restore failed';
        setToast({ type: 'err', text: errMsg });
        recordLog(`Undo (${target.label})`, 'DEV_IMPORT_STATE', 'err', errMsg);
        return;
      }
      setUndoSnapshot(null);
      if (res.data) {
        setSnapshot(res.data);
        onTimeSpeedSync?.(res.data.timeSpeed);
      }
      await onRefreshState();
      setToast({ type: 'ok', text: `Undid "${target.label}".` });
      recordLog(`Undo (${target.label})`, 'DEV_IMPORT_STATE', 'ok');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setToast({ type: 'err', text: msg });
      recordLog(`Undo (${target.label})`, 'DEV_IMPORT_STATE', 'err', msg);
    } finally {
      setBusyAction(null);
    }
  };

  const handleDownloadBackup = async () => {
    if (busyAction !== null) return;
    await runAction('Backup JSON', 'DEV_EXPORT_STATE', undefined, (data) => {
      const bundle = data as DevExportBundle;
      setJsonBuffer(JSON.stringify(bundle, null, 2));
      downloadJsonBackupFile(bundle);
    });
  };

  const activeTimeSpeed: DevTimeSpeed = snapshot?.timeSpeed ?? 1;
  const eraEval = snapshot?.eraEvaluation;
  const villagers = snapshot?.civ.villagers ?? [];
  const totalCrewCount = villagers.length + (snapshot?.civ.founderRole ? 1 : 0);
  const cave = snapshot ? findVillageCave(snapshot.civ.buildings, snapshot.civ.jobs) : undefined;
  const villagerCap = getVillagerCapacity(cave);
  const allJobs = snapshot?.civ.jobs ?? [];
  const activeJobCount = allJobs.filter((j) => j.status === 'ACTIVE').length;
  const pendingJobCount = allJobs.filter((j) => j.status === 'PENDING').length;

  const drawerBody = isOpen ? (
    <div
      id="dev-god-mode-drawer"
      data-testid="dev-god-mode-drawer"
      role="region"
      aria-label="God Mode Developer Controls"
      className="mb-2 w-[364px] max-w-[94vw] max-h-[84vh] overflow-y-auto rounded-2xl border border-amber-400/50 bg-slate-950/95 text-slate-100 shadow-2xl p-3 space-y-2.5"
    >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <div>
              <div className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-full bg-amber-400" />
                <span className="font-bold tracking-wide text-amber-300 text-xs">
                  GOD MODE (dev)
                </span>
              </div>
              <p className="text-[10px] text-slate-400">
                Dev server only · excluded from dist/ · Esc to close
              </p>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                data-testid="dev-undo-last"
                disabled={busyAction !== null || !undoSnapshot}
                title={undoSnapshot ? `Undo "${undoSnapshot.label}"` : 'Nothing to undo'}
                onClick={() => void handleUndoLast()}
                className="rounded-lg bg-slate-800 hover:bg-slate-700 px-2 py-1 text-[10px] font-semibold text-amber-200 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Undo
              </button>
              <button
                type="button"
                data-testid="dev-close-drawer"
                onClick={() => setOpen(false)}
                className="rounded-lg bg-slate-800 hover:bg-slate-700 px-2 py-1 text-[10px] font-semibold text-slate-300 cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>

          {/* Live Readout */}
          {snapshot && (
            <div
              data-testid="dev-live-readout"
              className="grid grid-cols-3 gap-1.5 rounded-xl bg-slate-900 border border-slate-800 p-2 text-[10px]"
            >
              <div>
                <div className="text-slate-400">Coins / Lv</div>
                <div className="font-mono font-bold text-amber-300">
                  {formatRewardAmount(snapshot.economy.focusCoins)} · Lv.{snapshot.economy.level}
                </div>
              </div>
              <div>
                <div className="text-slate-400">Crew / Chunks</div>
                <div className="font-mono font-bold text-emerald-300">
                  {totalCrewCount} ({villagers.length}/{villagerCap}) · {snapshot.civ.grid.chunks.length}ch
                </div>
              </div>
              <div>
                <div className="text-slate-400">Focus (Day/All)</div>
                <div className="font-mono font-bold text-sky-300">
                  {snapshot.todayFocusMinutes}m / {snapshot.lifetimeFocusMinutes}m
                </div>
              </div>
              <div>
                <div className="text-slate-400">Jobs (Act/Pen)</div>
                <div className="font-mono font-bold text-teal-300">
                  {activeJobCount} / {pendingJobCount}
                </div>
              </div>
              <div>
                <div className="text-slate-400">Session / Speed</div>
                <div className="font-mono font-bold text-slate-200">
                  {snapshot.session?.status ?? 'IDLE'} · ×{activeTimeSpeed}
                </div>
              </div>
              <div>
                <div className="text-slate-400">Era ({snapshot.civ.era})</div>
                <div
                  className={`font-mono font-bold ${
                    eraEval?.eligible ? 'text-emerald-300' : 'text-slate-400'
                  }`}
                >
                  {eraEval?.eligible ? 'Bronze Ready' : 'Not Ready'}
                </div>
              </div>
            </div>
          )}

          {/* Feedback Toast */}
          {toast && (
            <div
              data-testid="dev-god-mode-toast"
              className={`rounded-lg px-2.5 py-1.5 text-[11px] font-medium border ${
                toast.type === 'ok'
                  ? 'bg-emerald-950/80 border-emerald-700 text-emerald-200'
                  : 'bg-red-950/80 border-red-700 text-red-200'
              }`}
            >
              {toast.text}
            </div>
          )}

          {/* 0. Quick Presets */}
          <section className="space-y-1.5 rounded-xl bg-slate-900/70 border border-slate-800 p-2">
            <div className="font-semibold text-[11px] text-slate-300 uppercase tracking-wider">
              Quick Presets
            </div>
            <div className="grid grid-cols-3 gap-1">
              {PRESET_BUTTONS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  data-testid={`dev-preset-${preset.id}`}
                  disabled={busyAction !== null}
                  onClick={() =>
                    void runAction(`Preset: ${preset.label}`, 'DEV_APPLY_PRESET', {
                      presetId: preset.id,
                    })
                  }
                  className="rounded bg-slate-800 hover:bg-amber-700/80 hover:text-white py-1 px-1 text-[10px] font-medium text-slate-200 cursor-pointer disabled:opacity-50"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </section>

          {/* 1. Economy & Stats */}
          <section className="space-y-1.5 rounded-xl bg-slate-900/70 border border-slate-800 p-2">
            <div className="font-semibold text-[11px] text-slate-300 uppercase tracking-wider">
              Economy &amp; Stats
            </div>
            <div className="flex items-center gap-1">
              <input
                type="number"
                aria-label="Coins amount"
                min={0}
                value={coinsInput}
                onChange={(e) => setCoinsInput(e.target.value)}
                className="w-20 rounded bg-slate-800 border border-slate-700 px-1.5 py-1 text-[11px] font-mono text-white"
              />
              <button
                type="button"
                disabled={busyAction !== null}
                onClick={() =>
                  void runAction('Set Coins', 'DEV_SET_COINS', {
                    amount: Number(coinsInput || 0),
                  })
                }
                className="rounded bg-amber-600 hover:bg-amber-500 px-2 py-1 text-[10px] font-bold text-white cursor-pointer disabled:opacity-50"
              >
                Set Coins
              </button>
              <button
                type="button"
                disabled={busyAction !== null}
                onClick={() =>
                  void runAction('+1000 Coins', 'DEV_SET_COINS', {
                    amount: (snapshot?.economy.focusCoins ?? 0) + 1000,
                  })
                }
                className="rounded bg-slate-800 hover:bg-slate-700 px-1.5 py-1 text-[10px] cursor-pointer"
              >
                +1k
              </button>
              <button
                type="button"
                disabled={busyAction !== null}
                onClick={() =>
                  void runAction('+10k Coins', 'DEV_SET_COINS', {
                    amount: (snapshot?.economy.focusCoins ?? 0) + 10000,
                  })
                }
                className="rounded bg-slate-800 hover:bg-slate-700 px-1.5 py-1 text-[10px] cursor-pointer"
              >
                +10k
              </button>
              <button
                type="button"
                disabled={busyAction !== null}
                onClick={() =>
                  void runAction('Max Coins', 'DEV_SET_COINS', {
                    amount: 999_999_999,
                  })
                }
                className="rounded bg-slate-800 hover:bg-slate-700 px-1.5 py-1 text-[10px] cursor-pointer"
              >
                Max
              </button>
            </div>

            <div className="flex items-center gap-1">
              <input
                type="number"
                aria-label="Player level"
                min={1}
                max={9999}
                value={levelInput}
                onChange={(e) => setLevelInput(e.target.value)}
                className="w-20 rounded bg-slate-800 border border-slate-700 px-1.5 py-1 text-[11px] font-mono text-white"
              />
              <button
                type="button"
                disabled={busyAction !== null}
                onClick={() =>
                  void runAction('Set Level', 'DEV_SET_LEVEL', {
                    level: Number(levelInput || 1),
                  })
                }
                className="rounded bg-indigo-600 hover:bg-indigo-500 px-2 py-1 text-[10px] font-bold text-white cursor-pointer disabled:opacity-50"
              >
                Set Lv
              </button>
              <button
                type="button"
                disabled={busyAction !== null}
                onClick={() => void runAction('Set Lv.9', 'DEV_SET_LEVEL', { level: 9 })}
                className="rounded bg-slate-800 hover:bg-slate-700 px-1.5 py-1 text-[10px] cursor-pointer"
              >
                Lv.9
              </button>
              <button
                type="button"
                disabled={busyAction !== null}
                onClick={() => void runAction('Set Lv.20', 'DEV_SET_LEVEL', { level: 20 })}
                className="rounded bg-slate-800 hover:bg-slate-700 px-1.5 py-1 text-[10px] cursor-pointer"
              >
                Lv.20
              </button>
              <button
                type="button"
                disabled={busyAction !== null}
                onClick={() => void runAction('Max Lv', 'DEV_SET_LEVEL', { level: 9999 })}
                className="rounded bg-slate-800 hover:bg-slate-700 px-1.5 py-1 text-[10px] cursor-pointer"
              >
                Max
              </button>
            </div>

            <div className="flex items-center gap-1">
              <input
                type="number"
                aria-label="Today focus minutes"
                min={0}
                max={1440}
                value={focusMinsInput}
                onChange={(e) => setFocusMinsInput(e.target.value)}
                className="w-20 rounded bg-slate-800 border border-slate-700 px-1.5 py-1 text-[11px] font-mono text-white"
              />
              <button
                type="button"
                disabled={busyAction !== null}
                onClick={() =>
                  void runAction('Set Today Mins', 'DEV_SET_FOCUS_MINUTES', {
                    minutes: Number(focusMinsInput || 0),
                  })
                }
                className="rounded bg-sky-600 hover:bg-sky-500 px-2 py-1 text-[10px] font-bold text-white cursor-pointer disabled:opacity-50"
              >
                Set Mins
              </button>
              <button
                type="button"
                disabled={busyAction !== null}
                onClick={() =>
                  void runAction('+60m', 'DEV_SET_FOCUS_MINUTES', {
                    minutes: (snapshot?.todayFocusMinutes ?? 0) + 60,
                  })
                }
                className="rounded bg-slate-800 hover:bg-slate-700 px-1.5 py-1 text-[10px] cursor-pointer"
              >
                +60m
              </button>
              <button
                type="button"
                disabled={busyAction !== null}
                onClick={() =>
                  void runAction('+500m', 'DEV_SET_FOCUS_MINUTES', {
                    minutes: (snapshot?.todayFocusMinutes ?? 0) + 500,
                  })
                }
                className="rounded bg-slate-800 hover:bg-slate-700 px-1.5 py-1 text-[10px] cursor-pointer"
              >
                +500m
              </button>
            </div>
          </section>

          {/* 2. Focus Speed & Instant Settlement */}
          <section className="space-y-1.5 rounded-xl bg-slate-900/70 border border-slate-800 p-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-[11px] text-slate-300 uppercase tracking-wider">
                Focus Speed &amp; Jobs
              </span>
              <span className="text-[10px] font-mono text-amber-300">
                {activeTimeSpeed}× · Jobs: {allJobs.length}
              </span>
            </div>
            <div className="grid grid-cols-4 gap-1">
              {DEV_TIME_SPEED_OPTIONS.map((spd) => (
                <button
                  key={spd}
                  type="button"
                  data-testid={`dev-speed-${spd}`}
                  disabled={busyAction !== null}
                  onClick={() => void runAction(`Speed ×${spd}`, 'DEV_SET_TIME_SPEED', { speed: spd })}
                  className={`rounded py-1 text-[11px] font-bold cursor-pointer ${
                    activeTimeSpeed === spd
                      ? 'bg-amber-500 text-slate-950'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                  }`}
                >
                  ×{spd}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                data-testid="dev-skip-focus-wait"
                disabled={busyAction !== null}
                onClick={() => void runAction('Skip focus wait', 'DEV_SKIP_FOCUS_WAIT')}
                className="rounded bg-emerald-700 hover:bg-emerald-600 px-2 py-1.5 text-[11px] font-semibold text-white cursor-pointer disabled:opacity-50"
              >
                Skip focus wait
              </button>
              <button
                type="button"
                data-testid="dev-complete-all-jobs"
                disabled={busyAction !== null}
                onClick={() => void runAction('Complete all jobs', 'DEV_COMPLETE_ALL_JOBS')}
                className="rounded bg-teal-700 hover:bg-teal-600 px-2 py-1.5 text-[11px] font-semibold text-white cursor-pointer disabled:opacity-50"
              >
                Complete all jobs
              </button>
            </div>
          </section>

          {/* 3. Buildings & Land */}
          <section className="space-y-1.5 rounded-xl bg-slate-900/70 border border-slate-800 p-2">
            <div className="font-semibold text-[11px] text-slate-300 uppercase tracking-wider">
              Buildings &amp; Land
            </div>
            <div className="flex items-center gap-1">
              <select
                aria-label="Building definition"
                value={selectedBuildingId}
                onChange={(e) => setSelectedBuildingId(e.target.value)}
                className="flex-1 rounded bg-slate-800 border border-slate-700 px-1.5 py-1 text-[11px] text-white"
              >
                {catalogDefs.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.footprint.width}x{d.footprint.height})
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={busyAction !== null}
                onClick={() =>
                  void runAction('Place free building', 'DEV_PLACE_FREE_BUILDING', {
                    definitionId: selectedBuildingId,
                  })
                }
                className="rounded bg-emerald-700 hover:bg-emerald-600 px-2 py-1 text-[10px] font-bold text-white cursor-pointer"
              >
                Place Free
              </button>
            </div>
            <div className="grid grid-cols-3 gap-1">
              <button
                type="button"
                disabled={busyAction !== null}
                onClick={() => void runAction('Max buildings', 'DEV_MAX_BUILDINGS')}
                className="rounded bg-slate-800 hover:bg-slate-700 py-1 text-[10px] font-medium cursor-pointer"
              >
                Max Lv Buildings
              </button>
              <button
                type="button"
                disabled={busyAction !== null}
                onClick={() => void runAction('Unlock +1 chunk', 'DEV_UNLOCK_LAND', { chunks: 1 })}
                className="rounded bg-slate-800 hover:bg-slate-700 py-1 text-[10px] font-medium cursor-pointer"
              >
                +1 Land Chunk
              </button>
              <button
                type="button"
                disabled={busyAction !== null}
                onClick={() => void runAction('Unlock +3 chunks', 'DEV_UNLOCK_LAND', { chunks: 3 })}
                className="rounded bg-slate-800 hover:bg-slate-700 py-1 text-[10px] font-medium cursor-pointer"
              >
                +3 Land Chunks
              </button>
            </div>
          </section>

          {/* 4. Villagers */}
          <section className="space-y-1.5 rounded-xl bg-slate-900/70 border border-slate-800 p-2">
            <div className="font-semibold text-[11px] text-slate-300 uppercase tracking-wider">
              Villagers
            </div>
            <div className="grid grid-cols-4 gap-1">
              {VILLAGER_ROLES.map((role: VillagerRole) => (
                <button
                  key={role}
                  type="button"
                  disabled={busyAction !== null}
                  onClick={() => void runAction(`Recruit ${role}`, 'DEV_RECRUIT_FREE', { role })}
                  className="rounded bg-slate-800 hover:bg-slate-700 py-1 text-[10px] font-medium capitalize cursor-pointer"
                >
                  +{role}
                </button>
              ))}
              <button
                type="button"
                disabled={busyAction !== null}
                onClick={() => void runAction('Fill all roles', 'DEV_FILL_ALL_ROLES')}
                className="rounded bg-violet-700 hover:bg-violet-600 py-1 text-[10px] font-bold text-white cursor-pointer"
              >
                Fill 3 Roles
              </button>
            </div>
          </section>

          {/* 5. Era Readiness */}
          <section className="space-y-1.5 rounded-xl bg-slate-900/70 border border-slate-800 p-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-[11px] text-slate-300 uppercase tracking-wider">
                Era Readiness (Stone Age)
              </span>
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                  eraEval?.eligible
                    ? 'bg-emerald-900 text-emerald-200'
                    : 'bg-slate-800 text-slate-300'
                }`}
              >
                {eraEval?.eligible ? 'Bronze Ready: YES' : 'Bronze Ready: NO'}
              </span>
            </div>
            <button
              type="button"
              data-testid="dev-meet-era-requirements"
              disabled={busyAction !== null}
              onClick={() => void runAction('Meet Era requirements', 'DEV_MEET_ERA_REQUIREMENTS')}
              className="w-full rounded bg-amber-700 hover:bg-amber-600 py-1.5 text-[11px] font-semibold text-white cursor-pointer"
            >
              Meet Stone → Bronze Requirements (stays Stone Age)
            </button>
          </section>

          {/* 6. Quests & Time */}
          <section className="space-y-1.5 rounded-xl bg-slate-900/70 border border-slate-800 p-2">
            <div className="font-semibold text-[11px] text-slate-300 uppercase tracking-wider">
              Quests &amp; Calendar
            </div>
            <div className="grid grid-cols-2 gap-1">
              <button
                type="button"
                disabled={busyAction !== null}
                onClick={() => void runAction('Complete quests', 'DEV_COMPLETE_ALL_QUESTS')}
                className="rounded bg-emerald-700 hover:bg-emerald-600 py-1 text-[10px] font-semibold text-white cursor-pointer"
              >
                Complete All Quests
              </button>
              <button
                type="button"
                disabled={busyAction !== null}
                onClick={() => void runAction('+1 Day rollover', 'DEV_FAST_FORWARD_DAY', { days: 1 })}
                className="rounded bg-sky-700 hover:bg-sky-600 py-1 text-[10px] font-semibold text-white cursor-pointer"
              >
                +1 Day Rollover
              </button>
              <button
                type="button"
                disabled={busyAction !== null}
                onClick={() =>
                  void runAction('New Daily Quests', 'DEV_ROLLOVER_QUESTS', { period: 'DAILY' })
                }
                className="rounded bg-slate-800 hover:bg-slate-700 py-1 text-[10px] font-medium cursor-pointer"
              >
                New Daily Quests
              </button>
              <button
                type="button"
                disabled={busyAction !== null}
                onClick={() =>
                  void runAction('New Weekly Quests', 'DEV_ROLLOVER_QUESTS', { period: 'WEEKLY' })
                }
                className="rounded bg-slate-800 hover:bg-slate-700 py-1 text-[10px] font-medium cursor-pointer"
              >
                New Weekly Quests
              </button>
            </div>
          </section>

          {/* 7. Awards (Honest Placeholder Notice) */}
          <section className="space-y-1 rounded-xl bg-slate-900/70 border border-slate-800 p-2 opacity-75">
            <div className="font-semibold text-[11px] text-slate-400 uppercase tracking-wider">
              Awards
            </div>
            <button
              type="button"
              disabled
              data-testid="dev-unlock-awards-disabled"
              className="w-full rounded bg-slate-800 py-1 text-[10px] text-slate-400 cursor-not-allowed"
            >
              Unlock all awards (disabled — Awards tab is Coming soon)
            </button>
          </section>

          {/* 8. Data Tools */}
          <section className="space-y-1.5 rounded-xl bg-slate-900/70 border border-slate-800 p-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-[11px] text-slate-300 uppercase tracking-wider">
                Data Tools
              </span>
              <button
                type="button"
                data-testid="dev-download-backup"
                disabled={busyAction !== null}
                onClick={() => void handleDownloadBackup()}
                className="rounded bg-slate-800 hover:bg-slate-700 px-1.5 py-0.5 text-[10px] text-sky-300 cursor-pointer"
              >
                Download Backup JSON
              </button>
            </div>
            <div className="grid grid-cols-3 gap-1">
              <button
                type="button"
                disabled={busyAction !== null}
                onClick={() => void runAction('Seed demo data', 'DEV_SEED_DEMO_DATA')}
                className="rounded bg-indigo-700 hover:bg-indigo-600 py-1 text-[10px] font-semibold text-white cursor-pointer"
              >
                Seed Demo
              </button>
              <button
                type="button"
                disabled={busyAction !== null}
                onClick={() =>
                  void runAction('Export JSON', 'DEV_EXPORT_STATE', undefined, (bundle) => {
                    setJsonBuffer(JSON.stringify(bundle, null, 2));
                  })
                }
                className="rounded bg-slate-800 hover:bg-slate-700 py-1 text-[10px] font-medium cursor-pointer"
              >
                Export JSON
              </button>
              <button
                type="button"
                disabled={busyAction !== null || !jsonBuffer.trim()}
                onClick={() =>
                  void runAction('Import JSON', 'DEV_IMPORT_STATE', { bundle: jsonBuffer })
                }
                className="rounded bg-slate-800 hover:bg-slate-700 py-1 text-[10px] font-medium cursor-pointer disabled:opacity-40"
              >
                Import JSON
              </button>
            </div>
            <textarea
              aria-label="Export or Import State JSON"
              value={jsonBuffer}
              onChange={(e) => setJsonBuffer(e.target.value)}
              rows={3}
              placeholder="Exported state JSON appears here or paste JSON to import..."
              className="w-full rounded bg-slate-950 border border-slate-700 p-1.5 text-[10px] font-mono text-slate-200"
            />
            {!confirmReset ? (
              <button
                type="button"
                data-testid="dev-reset-all-btn"
                onClick={() => setConfirmReset(true)}
                className="w-full rounded bg-red-900/70 hover:bg-red-800 py-1 text-[10px] font-semibold text-red-100 cursor-pointer"
              >
                Reset all data...
              </button>
            ) : (
              <div className="space-y-1">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    data-testid="dev-reset-download-backup"
                    disabled={busyAction !== null}
                    onClick={() => void handleDownloadBackup()}
                    className="rounded bg-slate-800 hover:bg-slate-700 px-2 py-1 text-[10px] text-sky-300 cursor-pointer"
                  >
                    Backup First
                  </button>
                  <button
                    type="button"
                    data-testid="dev-reset-confirm-btn"
                    disabled={busyAction !== null}
                    onClick={() => {
                      setConfirmReset(false);
                      void runAction('Reset all data', 'DEV_RESET_ALL_DATA');
                    }}
                    className="flex-1 rounded bg-red-600 hover:bg-red-500 py-1 text-[10px] font-bold text-white cursor-pointer"
                  >
                    Confirm Wipe All
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmReset(false)}
                    className="rounded bg-slate-800 hover:bg-slate-700 px-2 py-1 text-[10px] cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* 9. Action Log */}
          <section
            data-testid="dev-action-log"
            className="space-y-1 rounded-xl bg-slate-900/70 border border-slate-800 p-2"
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold text-[11px] text-slate-300 uppercase tracking-wider">
                Action Log ({actionLog.length})
              </span>
              <button
                type="button"
                data-testid="dev-clear-log"
                disabled={actionLog.length === 0}
                onClick={() => setActionLog([])}
                className="rounded bg-slate-800 hover:bg-slate-700 px-1.5 py-0.5 text-[10px] text-slate-300 cursor-pointer disabled:opacity-40"
              >
                Clear
              </button>
            </div>
            {actionLog.length === 0 ? (
              <div className="text-[10px] text-slate-500">No actions recorded yet.</div>
            ) : (
              <div className="max-h-24 overflow-y-auto space-y-1 font-mono text-[10px]">
                {actionLog.map((entry) => (
                  <div
                    key={entry.id}
                    className={`flex items-start justify-between gap-2 rounded px-1.5 py-0.5 ${
                      entry.status === 'ok'
                        ? 'bg-slate-950/60 text-slate-300'
                        : 'bg-red-950/50 text-red-200'
                    }`}
                  >
                    <span className="truncate">
                      [{formatLogTime(entry.timestamp)}] {entry.label}
                      {entry.detail ? ` — ${entry.detail}` : ''}
                    </span>
                    <span
                      className={`shrink-0 font-bold ${
                        entry.status === 'ok' ? 'text-emerald-400' : 'text-red-400'
                      }`}
                    >
                      {entry.status === 'ok' ? 'OK' : 'ERR'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
  ) : null;

  if (isControlled) {
    return drawerBody;
  }

  return (
    <div
      data-testid="dev-god-mode-root"
      className="fixed bottom-3 right-3 z-[9999] flex flex-col items-end font-sans text-xs"
    >
      {drawerBody}

      {/* Corner Floating Chip */}
      <button
        type="button"
        data-testid="dev-god-mode-toggle"
        aria-expanded={isOpen}
        aria-controls="dev-god-mode-drawer"
        onClick={() => setOpen((prev) => !prev)}
        className="rounded-full border border-amber-400/70 bg-slate-950/90 hover:bg-slate-900 px-3 py-1.5 text-[11px] font-bold tracking-wide text-amber-300 shadow-lg cursor-pointer"
      >
        GOD MODE (dev){activeTimeSpeed > 1 ? ` · ×${activeTimeSpeed}` : ''}
      </button>
    </div>
  );
};

export const DevGodModePanel = React.memo(DevGodModePanelInner);
