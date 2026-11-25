import React, { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { ActiveTab } from '../ui/components/Navbar.tsx';
import { SessionSnapshot } from '../types/session.ts';
import { PlayerEconomy } from '../types/economy.ts';
import { CivilizationState } from '../core/civilization/civilizationState.ts';
import { isChromeExtension, sendExtensionMessage } from '../ui/services/extensionClient.ts';
import { ExtensionMessage } from '../types/messages.ts';
import {
  registerSimTickHook,
  registerTimeScaleProvider,
} from '../ui/services/devRuntimeBridge.ts';
import { DevTimeSpeed } from './devTypes.ts';
import './devSimulatorPlugin.ts';

const LazyDevGodModePanel = React.lazy(() =>
  import('./DevGodModePanel.tsx').then((mod) => ({ default: mod.DevGodModePanel }))
);

export interface DevGodModeMountProps {
  onRefreshState: () => Promise<void>;
  activeTab: ActiveTab;
  onSetActiveTab: (tab: ActiveTab) => void;
  session: SessionSnapshot | null;
  economy: PlayerEconomy;
  civState: CivilizationState | null;
}

export const DevGodModeMount: React.FC<DevGodModeMountProps> = ({
  onRefreshState,
  session,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [hasOpened, setHasOpened] = useState(false);
  const [timeSpeed, setTimeSpeed] = useState<DevTimeSpeed>(1);
  const cachedSpeedRef = useRef<DevTimeSpeed>(1);
  const isRunningSession = session?.status === 'RUNNING';

  const handleTimeSpeedSync = useCallback((speed: DevTimeSpeed) => {
    cachedSpeedRef.current = speed;
    setTimeSpeed((prev) => (prev === speed ? prev : speed));
  }, []);

  // Register extension background bridge + time scale hooks cleanly with unmount teardown
  useEffect(() => {
    if (!isChromeExtension()) {
      return undefined;
    }

    let active = true;
    const syncOnce = () => {
      void sendExtensionMessage<{ timeSpeed?: DevTimeSpeed }>({
        action: 'DEV_GET_SNAPSHOT',
      } as unknown as ExtensionMessage).then((res) => {
        if (active && res.success && res.data?.timeSpeed) {
          handleTimeSpeedSync(res.data.timeSpeed);
        }
      });
    };

    syncOnce();
    registerTimeScaleProvider(() => cachedSpeedRef.current);
    registerSimTickHook((elapsedRealMs) => {
      const spd = cachedSpeedRef.current;
      if (spd <= 1) return;
      void sendExtensionMessage({
        action: 'DEV_ADVANCE_ACTIVE_SESSION_MS',
        payload: { deltaMs: Math.round(elapsedRealMs * (spd - 1)) },
      } as unknown as ExtensionMessage).then(() => {
        if (active) {
          void onRefreshState();
        }
      });
    });

    return () => {
      active = false;
      registerTimeScaleProvider(null);
      registerSimTickHook(null);
    };
  }, [handleTimeSpeedSync, onRefreshState]);

  // Poll speed only when drawer is open OR accelerated time / running session is active (0 idle polling!)
  useEffect(() => {
    if (!isChromeExtension() || (!isOpen && timeSpeed === 1 && !isRunningSession)) {
      return undefined;
    }

    let active = true;
    const id = window.setInterval(() => {
      void sendExtensionMessage<{ timeSpeed?: DevTimeSpeed }>({
        action: 'DEV_GET_SNAPSHOT',
      } as unknown as ExtensionMessage).then((res) => {
        if (active && res.success && res.data?.timeSpeed) {
          handleTimeSpeedSync(res.data.timeSpeed);
        }
      });
    }, 1000);

    return () => {
      active = false;
      window.clearInterval(id);
    };
  }, [handleTimeSpeedSync, isOpen, isRunningSession, timeSpeed]);

  if (
    typeof import.meta === 'undefined' ||
    typeof import.meta.env === 'undefined' ||
    import.meta.env.DEV !== true
  ) {
    return null;
  }

  const handleToggle = () => {
    setIsOpen((prev) => {
      const next = !prev;
      if (next) {
        setHasOpened(true);
      }
      return next;
    });
  };

  return (
    <div
      data-testid="dev-god-mode-root"
      className="fixed bottom-3 right-3 z-[9999] flex flex-col items-end font-sans text-xs"
    >
      {hasOpened && isOpen && (
        <Suspense
          fallback={
            <div className="mb-2 rounded-xl border border-amber-400/40 bg-slate-950/90 px-3 py-2 text-[11px] text-amber-200">
              Loading God Mode...
            </div>
          }
        >
          <LazyDevGodModePanel
            isOpen={isOpen}
            onOpenChange={setIsOpen}
            onRefreshState={onRefreshState}
            onTimeSpeedSync={handleTimeSpeedSync}
          />
        </Suspense>
      )}

      <button
        type="button"
        data-testid="dev-god-mode-toggle"
        aria-expanded={isOpen}
        aria-controls="dev-god-mode-drawer"
        onClick={handleToggle}
        className="rounded-full border border-amber-400/70 bg-slate-950/90 hover:bg-slate-900 px-3 py-1.5 text-[11px] font-bold tracking-wide text-amber-300 shadow-lg cursor-pointer"
      >
        GOD MODE (dev){timeSpeed > 1 ? ` · ×${timeSpeed}` : ''}
      </button>
    </div>
  );
};
