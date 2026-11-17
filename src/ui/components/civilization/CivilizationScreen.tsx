import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { AlertCircle, X } from 'lucide-react';
import { CivilizationState } from '../../../core/civilization/civilizationState.ts';
import {
  BuildingDefinition,
  BuildingInstance,
} from '../../../core/civilization/buildingTypes.ts';
import { GridCoordinate } from '../../../core/civilization/types.ts';
import { extractBuildingCoinBonuses } from '../../../core/civilization/civilizationBonusHelper.ts';
import { aggregateCoinBonus } from '../../../core/economy/coinBonus.ts';
import { calculatePlayerLevel } from '../../../core/economy/levelSystem.ts';
import { PlayerEconomy } from '../../../types/economy.ts';
import { FullSessionStateResponse } from '../../../types/messages.ts';
import {
  getCivilizationStateClient,
  placeBuildingClient,
  removeBuildingClient,
  expandLandClient,
  sendExtensionMessage,
  onStorageChange,
} from '../../services/extensionClient.ts';
import { CivilizationHeader } from './CivilizationHeader.tsx';
import { MapGridView } from './MapGridView.tsx';
import { BuildingCatalogPanel } from './BuildingCatalogPanel.tsx';
import { BuildingDetailsModal } from './BuildingDetailsModal.tsx';
import { LandExpansionModal } from './LandExpansionModal.tsx';
import {
  ActiveExpansionReveal,
  EXPANSION_ANIMATION_DURATION_MS,
  EXPANSION_IMPACT_MS,
  detectNewlyAddedChunks,
  prefersReducedMotion,
} from './expansionReveal.ts';
import { useTranslation } from '../../../i18n/I18nContext.tsx';
import { localizeErrorMessage } from '../../../i18n/errorTranslator.ts';

export interface CivilizationScreenProps {
  lifetimeFocusMinutes?: number;
  onStateMutated?: () => void | Promise<void>;
}

const DEFAULT_ECONOMY: PlayerEconomy = {
  focusCoins: 0,
  totalXP: 0,
  level: 1,
};

export const CivilizationScreen: React.FC<CivilizationScreenProps> = ({
  lifetimeFocusMinutes,
  onStateMutated,
}) => {
  const { locale, t } = useTranslation();
  const [civState, setCivState] = useState<CivilizationState | null>(null);
  const [economy, setEconomy] = useState<PlayerEconomy>(DEFAULT_ECONOMY);
  const [fetchedLifetimeMinutes, setFetchedLifetimeMinutes] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [isCatalogOpen, setIsCatalogOpen] = useState<boolean>(false);
  const [isExpansionMode, setIsExpansionMode] = useState<boolean>(false);
  const [selectedExpansionOrigin, setSelectedExpansionOrigin] = useState<GridCoordinate | null>(
    null
  );
  const [placementDef, setPlacementDef] = useState<BuildingDefinition | null>(null);
  const [inspectedBuilding, setInspectedBuilding] = useState<BuildingInstance | null>(null);
  const [activeExpansionReveal, setActiveExpansionReveal] =
    useState<ActiveExpansionReveal | null>(null);
  const [unrevealedChunkOrigin, setUnrevealedChunkOrigin] = useState<GridCoordinate | null>(null);
  const [expansionAnnouncement, setExpansionAnnouncement] = useState<string>('');

  const knownChunkOriginsRef = useRef<GridCoordinate[] | null>(null);
  const revealSequenceIdRef = useRef<number>(0);
  const impactTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const completeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearRevealTimers = useCallback(() => {
    if (impactTimerRef.current !== null) {
      clearTimeout(impactTimerRef.current);
      impactTimerRef.current = null;
    }
    if (completeTimerRef.current !== null) {
      clearTimeout(completeTimerRef.current);
      completeTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      clearRevealTimers();
    };
  }, [clearRevealTimers]);

  // Post-commit chunk-set diff detector: never fires on initial hydrate, cleans up on unmount
  useEffect(() => {
    if (!civState) return;
    const currentChunks = civState.grid.chunks;
    if (knownChunkOriginsRef.current === null) {
      knownChunkOriginsRef.current = currentChunks.map((c) => ({ ...c.origin }));
      return;
    }

    const added = detectNewlyAddedChunks(knownChunkOriginsRef.current, currentChunks);
    knownChunkOriginsRef.current = currentChunks.map((c) => ({ ...c.origin }));
    if (added.length === 0) return;

    const latestOrigin = added[added.length - 1];
    setExpansionAnnouncement(
      t('civ.expand.ariaAnnouncement', { x: latestOrigin.x, y: latestOrigin.y })
    );

    clearRevealTimers();
    const reduced = prefersReducedMotion();
    if (reduced) {
      setActiveExpansionReveal(null);
      setUnrevealedChunkOrigin(null);
      return;
    }

    const seqId = ++revealSequenceIdRef.current;
    setActiveExpansionReveal({
      id: seqId,
      origin: latestOrigin,
      startedAt: Date.now(),
      reducedMotion: false,
    });
    setUnrevealedChunkOrigin(latestOrigin);

    impactTimerRef.current = setTimeout(() => {
      setUnrevealedChunkOrigin((prev) =>
        prev && prev.x === latestOrigin.x && prev.y === latestOrigin.y ? null : prev
      );
      impactTimerRef.current = null;
    }, EXPANSION_IMPACT_MS);

    completeTimerRef.current = setTimeout(() => {
      setActiveExpansionReveal((prev) => (prev && prev.id === seqId ? null : prev));
      setUnrevealedChunkOrigin((prev) =>
        prev && prev.x === latestOrigin.x && prev.y === latestOrigin.y ? null : prev
      );
      completeTimerRef.current = null;
    }, EXPANSION_ANIMATION_DURATION_MS);
  }, [civState, clearRevealTimers, t]);

  const loadCivilizationData = useCallback(async () => {
    try {
      const [civRes, sessionRes] = await Promise.all([
        getCivilizationStateClient(),
        sendExtensionMessage<FullSessionStateResponse>({ action: 'GET_SESSION_STATE' }),
      ]);

      if (civRes.success && civRes.data) {
        setCivState(civRes.data);
      } else if (!civRes.success && civRes.error) {
        setErrorMsg(civRes.error);
      }

      if (sessionRes.success && sessionRes.data) {
        if (sessionRes.data.economy) {
          setEconomy(sessionRes.data.economy);
        }
        const lifetime =
          sessionRes.data.lifetimeFocusMinutes ??
          sessionRes.data.todayStats?.totalFocusMinutes ??
          0;
        setFetchedLifetimeMinutes(lifetime);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to load civilization state.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCivilizationData();
    const unsubscribe = onStorageChange(() => {
      loadCivilizationData();
    });
    return unsubscribe;
  }, [loadCivilizationData]);

  // Escape key cancels active modal/confirmation -> expansion mode -> catalog -> placement mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (inspectedBuilding) {
        setInspectedBuilding(null);
      } else if (selectedExpansionOrigin) {
        setSelectedExpansionOrigin(null);
      } else if (isExpansionMode) {
        setIsExpansionMode(false);
      } else if (isCatalogOpen) {
        setIsCatalogOpen(false);
      } else if (placementDef) {
        setPlacementDef(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    inspectedBuilding,
    selectedExpansionOrigin,
    isExpansionMode,
    isCatalogOpen,
    placementDef,
  ]);

  const effectiveLifetimeFocusMinutes =
    fetchedLifetimeMinutes ?? lifetimeFocusMinutes ?? 0;

  const activeBonusRate = useMemo(() => {
    if (!civState) return 0;
    return aggregateCoinBonus(extractBuildingCoinBonuses(civState.buildings));
  }, [civState]);

  const playerLevel = useMemo(
    () =>
      Math.min(
        economy.level ?? calculatePlayerLevel(economy.totalXP),
        calculatePlayerLevel(economy.totalXP)
      ),
    [economy.level, economy.totalXP]
  );

  const chunksCount = civState ? civState.grid.chunks.length : 0;

  const handleOpenCatalog = () => {
    setErrorMsg(null);
    setIsExpansionMode(false);
    setSelectedExpansionOrigin(null);
    setInspectedBuilding(null);
    setIsCatalogOpen(true);
  };

  const handleToggleExpansionMode = () => {
    setErrorMsg(null);
    setIsCatalogOpen(false);
    setInspectedBuilding(null);
    setPlacementDef(null);
    setSelectedExpansionOrigin(null);
    setIsExpansionMode((prev) => !prev);
  };

  const handleCancelExpansionMode = () => {
    setSelectedExpansionOrigin(null);
    setIsExpansionMode(false);
  };

  const handleSelectBuildingForPlacement = (def: BuildingDefinition) => {
    setErrorMsg(null);
    setIsCatalogOpen(false);
    setIsExpansionMode(false);
    setSelectedExpansionOrigin(null);
    setPlacementDef(def);
  };

  const handlePlaceBuilding = async (pos: GridCoordinate) => {
    if (!placementDef || isSubmitting) return;
    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await placeBuildingClient({
        buildingDefinitionId: placementDef.id,
        position: pos,
      });
      if (res.success && res.data) {
        setCivState(res.data.civilizationState);
        setEconomy(res.data.economy);
        setPlacementDef(null);
        await onStateMutated?.();
      } else {
        setErrorMsg(res.error || 'Could not place building at that location.');
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Placement request failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemoveBuilding = async (instanceId: string) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await removeBuildingClient({ buildingInstanceId: instanceId });
      if (res.success && res.data) {
        setCivState(res.data.civilizationState);
        setInspectedBuilding(null);
        await onStateMutated?.();
      } else {
        setErrorMsg(res.error || 'Could not remove building.');
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Removal request failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmExpandLand = async (origin: GridCoordinate) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await expandLandClient({ origin });
      if (res.success && res.data) {
        setCivState(res.data.civilizationState);
        setEconomy(res.data.economy);
        setSelectedExpansionOrigin(null);
        setIsExpansionMode(false);
        await onStateMutated?.();
      } else {
        setErrorMsg(res.error || 'Could not expand territory.');
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Expansion request failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="relative flex-1 min-h-0 w-full flex flex-col overflow-hidden bg-slate-100 dark:bg-slate-950">
      <CivilizationHeader
        era={civState?.era ?? 'STONE_AGE'}
        focusCoins={economy.focusCoins}
        lifetimeFocusMinutes={effectiveLifetimeFocusMinutes}
        activeBonusRate={activeBonusRate}
        isPlacementMode={Boolean(placementDef)}
        selectedBuildingDef={placementDef}
        onCancelPlacement={() => setPlacementDef(null)}
        onOpenCatalog={handleOpenCatalog}
        onOpenExpansion={handleToggleExpansionMode}
        isExpansionMode={isExpansionMode}
        onCancelExpansion={handleCancelExpansionMode}
      />

      {errorMsg && (
        <div
          role="alert"
          className="px-3 py-1.5 bg-rose-50 dark:bg-rose-950/70 border-b border-rose-200 dark:border-rose-800/80 text-rose-700 dark:text-rose-200 text-[11px] flex items-center justify-between gap-2 shrink-0"
        >
          <span className="inline-flex items-center gap-1.5 min-w-0">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 text-rose-600 dark:text-rose-400" />
            <span className="truncate">{localizeErrorMessage(locale, errorMsg)}</span>
          </span>
          <button
            type="button"
            aria-label={t('civ.error.dismissAria')}
            onClick={() => setErrorMsg(null)}
            className="p-0.5 rounded hover:bg-rose-100 dark:hover:bg-rose-900/50 text-rose-500 dark:text-rose-300 shrink-0 cursor-pointer"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {isLoading || !civState ? (
        <div className="flex-1 flex items-center justify-center p-6 text-xs text-slate-500 dark:text-slate-400">
          {t('civ.map.loading')}
        </div>
      ) : (
        <MapGridView
          civilizationState={civState}
          placementDef={placementDef}
          onPlaceBuilding={handlePlaceBuilding}
          onInspectBuilding={(inst) => {
            setErrorMsg(null);
            setInspectedBuilding(inst);
          }}
          isSubmitting={isSubmitting}
          isExpansionMode={isExpansionMode}
          selectedExpansionOrigin={selectedExpansionOrigin}
          onSelectExpansionSlot={(origin) => {
            setErrorMsg(null);
            setSelectedExpansionOrigin(origin);
          }}
          onInvalidExpansionClick={() => setErrorMsg(t('civ.expand.onlyAdjacentHint'))}
          activeExpansionReveal={activeExpansionReveal}
          unrevealedChunkOrigin={unrevealedChunkOrigin}
        />
      )}

      <div
        aria-live="polite"
        data-testid="expansion-aria-live"
        className="sr-only"
      >
        {expansionAnnouncement}
      </div>

      <BuildingCatalogPanel
        isOpen={isCatalogOpen}
        onClose={() => setIsCatalogOpen(false)}
        playerLevel={playerLevel}
        playerCoins={economy.focusCoins}
        lifetimeFocusMinutes={effectiveLifetimeFocusMinutes}
        currentEra={civState?.era ?? 'STONE_AGE'}
        onSelectBuilding={handleSelectBuildingForPlacement}
      />

      <BuildingDetailsModal
        building={inspectedBuilding}
        onClose={() => setInspectedBuilding(null)}
        onRemove={handleRemoveBuilding}
        isSubmitting={isSubmitting}
      />

      <LandExpansionModal
        isOpen={isExpansionMode && Boolean(selectedExpansionOrigin)}
        selectedOrigin={selectedExpansionOrigin}
        chunksCount={chunksCount}
        playerLevel={playerLevel}
        playerCoins={economy.focusCoins}
        onConfirm={handleConfirmExpandLand}
        onClose={() => setSelectedExpansionOrigin(null)}
        isSubmitting={isSubmitting}
      />
    </div>
  );
};
