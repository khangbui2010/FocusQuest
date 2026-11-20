import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { AlertCircle, X } from 'lucide-react';
import { CivilizationState } from '../../../core/civilization/civilizationState.ts';
import {
  BuildingDefinition,
  BuildingInstance,
} from '../../../core/civilization/buildingTypes.ts';
import { GridCoordinate } from '../../../core/civilization/types.ts';
import { GridMap } from '../../../core/civilization/gridMap.ts';
import { extractBuildingCoinBonuses } from '../../../core/civilization/civilizationBonusHelper.ts';
import { aggregateCoinBonus } from '../../../core/economy/coinBonus.ts';
import { calculatePlayerLevel } from '../../../core/economy/levelSystem.ts';
import { PlayerEconomy } from '../../../types/economy.ts';
import { FullSessionStateResponse } from '../../../types/messages.ts';
import {
  getCivilizationStateClient,
  placeBuildingClient,
  removeBuildingClient,
  upgradeBuildingClient,
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
import {
  CameraReturnTarget,
  ExpansionFlowState,
  canCancelExpansionMode,
  canSelectExpansionSlot,
  isExpansionFlowActive,
  isManualCameraLocked,
  transitionExpansionFlow,
} from './expansionCamera.ts';
import { useTranslation } from '../../../i18n/I18nContext.tsx';
import {
  localizeErrorMessage,
  toUiErrorPayload,
  UiErrorPayload,
} from '../../../i18n/errorTranslator.ts';

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
  const [errorMsg, setErrorMsg] = useState<UiErrorPayload | null>(null);

  const [isCatalogOpen, setIsCatalogOpen] = useState<boolean>(false);
  const [flowState, setFlowState] = useState<ExpansionFlowState>('NORMAL');
  const [isCinematicAnimating, setIsCinematicAnimating] = useState<boolean>(false);
  const [selectedExpansionOrigin, setSelectedExpansionOrigin] = useState<GridCoordinate | null>(
    null
  );
  const [placementDef, setPlacementDef] = useState<BuildingDefinition | null>(null);
  const [inspectedBuilding, setInspectedBuilding] = useState<BuildingInstance | null>(null);
  const [upgradeModalError, setUpgradeModalError] = useState<UiErrorPayload | null>(null);
  const [upgradeSuccessLevel, setUpgradeSuccessLevel] = useState<number | null>(null);
  const [activeExpansionReveal, setActiveExpansionReveal] =
    useState<ActiveExpansionReveal | null>(null);
  const [unrevealedChunkOrigin, setUnrevealedChunkOrigin] = useState<GridCoordinate | null>(null);
  const [expansionAnnouncement, setExpansionAnnouncement] = useState<string>('');

  const isMountedRef = useRef<boolean>(true);
  const flowStateRef = useRef<ExpansionFlowState>('NORMAL');
  const isCinematicAnimatingRef = useRef<boolean>(false);
  const returnTargetRef = useRef<CameraReturnTarget>('NORMAL');
  const isConfirmInFlightRef = useRef<boolean>(false);
  const knownChunkOriginsRef = useRef<GridCoordinate[] | null>(null);
  const revealSequenceIdRef = useRef<number>(0);
  const impactTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const completeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateFlowState = useCallback((next: ExpansionFlowState) => {
    const validated = transitionExpansionFlow(flowStateRef.current, next);
    flowStateRef.current = validated;
    setFlowState(validated);
    return validated;
  }, []);

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
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      clearRevealTimers();
    };
  }, [clearRevealTimers]);

  // Post-commit chunk-set diff detector: never fires on initial hydrate, drives CHOPPING -> TERRAIN_UPDATING -> CAMERA_RETURNING
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

    const isDrivenByActiveExpansion =
      flowStateRef.current === 'CINEMATIC_MOVING' || flowStateRef.current === 'CHOPPING';

    clearRevealTimers();
    const reduced = prefersReducedMotion();
    if (reduced) {
      setActiveExpansionReveal(null);
      setUnrevealedChunkOrigin(null);
      if (isDrivenByActiveExpansion) {
        updateFlowState('CHOPPING');
        updateFlowState('TERRAIN_UPDATING');
        returnTargetRef.current = 'NORMAL';
        setSelectedExpansionOrigin(null);
        updateFlowState('CAMERA_RETURNING');
      }
      return;
    }

    if (isDrivenByActiveExpansion) {
      updateFlowState('CHOPPING');
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
      impactTimerRef.current = null;
      if (!isMountedRef.current || revealSequenceIdRef.current !== seqId) return;
      setUnrevealedChunkOrigin((prev) =>
        prev && prev.x === latestOrigin.x && prev.y === latestOrigin.y ? null : prev
      );
      if (flowStateRef.current === 'CHOPPING') {
        updateFlowState('TERRAIN_UPDATING');
      }
    }, EXPANSION_IMPACT_MS);

    completeTimerRef.current = setTimeout(() => {
      completeTimerRef.current = null;
      if (!isMountedRef.current || revealSequenceIdRef.current !== seqId) return;
      setActiveExpansionReveal((prev) => (prev && prev.id === seqId ? null : prev));
      setUnrevealedChunkOrigin((prev) =>
        prev && prev.x === latestOrigin.x && prev.y === latestOrigin.y ? null : prev
      );
      if (
        flowStateRef.current === 'CHOPPING' ||
        flowStateRef.current === 'TERRAIN_UPDATING'
      ) {
        if (flowStateRef.current === 'CHOPPING') {
          updateFlowState('TERRAIN_UPDATING');
        }
        returnTargetRef.current = 'NORMAL';
        setSelectedExpansionOrigin(null);
        updateFlowState('CAMERA_RETURNING');
      }
    }, EXPANSION_ANIMATION_DURATION_MS);
  }, [civState, clearRevealTimers, t, updateFlowState]);

  const loadCivilizationData = useCallback(async () => {
    try {
      const [civRes, sessionRes] = await Promise.all([
        getCivilizationStateClient(),
        sendExtensionMessage<FullSessionStateResponse>({ action: 'GET_SESSION_STATE' }),
      ]);
      if (!isMountedRef.current) return;

      if (civRes.success && civRes.data) {
        setCivState(civRes.data);
      } else if (!civRes.success && (civRes.error || civRes.errorCode)) {
        setErrorMsg({
          message: civRes.error,
          code: civRes.errorCode ?? 'CIV_LOAD_FAILED',
          params: civRes.errorParams,
        });
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
      if (!isMountedRef.current) return;
      setErrorMsg(toUiErrorPayload(err, 'CIV_LOAD_FAILED', 'Failed to load civilization state.'));
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    loadCivilizationData();
    const unsubscribe = onStorageChange(() => {
      loadCivilizationData();
    });
    return unsubscribe;
  }, [loadCivilizationData]);

  const handleCloseExpansionModal = useCallback(() => {
    if (
      isSubmitting ||
      isConfirmInFlightRef.current ||
      flowStateRef.current !== 'CINEMATIC_MOVING' ||
      isCinematicAnimatingRef.current
    ) {
      return;
    }
    returnTargetRef.current = 'EXPANSION_SELECTING';
    setSelectedExpansionOrigin(null);
    updateFlowState('CAMERA_RETURNING');
  }, [isSubmitting, updateFlowState]);

  const handleCancelExpansionMode = useCallback(() => {
    if (isSubmitting || !canCancelExpansionMode(flowStateRef.current)) return;
    returnTargetRef.current = 'NORMAL';
    setSelectedExpansionOrigin(null);
    isCinematicAnimatingRef.current = false;
    setIsCinematicAnimating(false);
    updateFlowState('CAMERA_RETURNING');
  }, [isSubmitting, updateFlowState]);

  // Escape key cancels active modal/confirmation -> expansion selecting -> catalog -> placement mode
  // Strictly disallowed while camera animation / chopping / terrain update / returning is running.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (inspectedBuilding) {
        setInspectedBuilding(null);
      } else if (
        flowStateRef.current === 'CINEMATIC_MOVING' &&
        !isCinematicAnimatingRef.current &&
        selectedExpansionOrigin
      ) {
        handleCloseExpansionModal();
      } else if (canCancelExpansionMode(flowStateRef.current)) {
        handleCancelExpansionMode();
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
    isCatalogOpen,
    placementDef,
    handleCloseExpansionModal,
    handleCancelExpansionMode,
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
  const isExpansionMode = isExpansionFlowActive(flowState);
  const isExpansionLocked = isManualCameraLocked(flowState) || isSubmitting;
  const canCancelExpansion = canCancelExpansionMode(flowState) && !isSubmitting;

  const handleOpenCatalog = () => {
    if (isManualCameraLocked(flowStateRef.current) || isSubmitting) return;
    setErrorMsg(null);
    if (flowStateRef.current === 'EXPANSION_SELECTING') {
      updateFlowState('NORMAL');
    }
    setSelectedExpansionOrigin(null);
    setInspectedBuilding(null);
    setIsCatalogOpen(true);
  };

  const handleToggleExpansionMode = () => {
    if (isSubmitting) return;
    if (flowStateRef.current === 'NORMAL') {
      setErrorMsg(null);
      setIsCatalogOpen(false);
      setInspectedBuilding(null);
      setPlacementDef(null);
      setSelectedExpansionOrigin(null);
      isCinematicAnimatingRef.current = false;
      setIsCinematicAnimating(false);
      updateFlowState('EXPANSION_SELECTING');
      return;
    }
    if (canCancelExpansionMode(flowStateRef.current)) {
      handleCancelExpansionMode();
    }
  };

  const handleSelectBuildingForPlacement = (def: BuildingDefinition) => {
    if (isManualCameraLocked(flowStateRef.current)) return;
    setErrorMsg(null);
    setIsCatalogOpen(false);
    if (flowStateRef.current === 'EXPANSION_SELECTING') {
      updateFlowState('NORMAL');
    }
    setSelectedExpansionOrigin(null);
    setPlacementDef(def);
  };

  const handlePlaceBuilding = async (pos: GridCoordinate) => {
    if (!placementDef || isSubmitting || isExpansionFlowActive(flowStateRef.current)) return;
    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await placeBuildingClient({
        buildingDefinitionId: placementDef.id,
        position: pos,
      });
      if (!isMountedRef.current) return;
      if (res.success && res.data) {
        setCivState(res.data.civilizationState);
        setEconomy(res.data.economy);
        setPlacementDef(null);
        await onStateMutated?.();
      } else {
        setErrorMsg({
          message: res.error || 'Could not place building at that location.',
          code: res.errorCode ?? 'CIV_PLACE_REQUEST_FAILED',
          params: res.errorParams,
        });
      }
    } catch (err) {
      if (!isMountedRef.current) return;
      setErrorMsg(toUiErrorPayload(err, 'CIV_PLACE_REQUEST_FAILED', 'Placement request failed.'));
    } finally {
      if (isMountedRef.current) {
        setIsSubmitting(false);
      }
    }
  };

  const handleRemoveBuilding = async (instanceId: string) => {
    if (isSubmitting || isExpansionFlowActive(flowStateRef.current)) return;
    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await removeBuildingClient({ buildingInstanceId: instanceId });
      if (!isMountedRef.current) return;
      if (res.success && res.data) {
        setCivState(res.data.civilizationState);
        if (res.data.economy) {
          setEconomy(res.data.economy);
        }
        setInspectedBuilding(null);
        setUpgradeModalError(null);
        setUpgradeSuccessLevel(null);
        await onStateMutated?.();
      } else {
        setErrorMsg({
          message: res.error || 'Could not remove building.',
          code: res.errorCode ?? 'CIV_REMOVE_REQUEST_FAILED',
          params: res.errorParams,
        });
      }
    } catch (err) {
      if (!isMountedRef.current) return;
      setErrorMsg(toUiErrorPayload(err, 'CIV_REMOVE_REQUEST_FAILED', 'Removal request failed.'));
    } finally {
      if (isMountedRef.current) {
        setIsSubmitting(false);
      }
    }
  };

  const handleUpgradeBuilding = async (buildingId: string, expectedLevel: number) => {
    if (isSubmitting || isExpansionFlowActive(flowStateRef.current)) return;
    setIsSubmitting(true);
    setErrorMsg(null);
    setUpgradeModalError(null);
    setUpgradeSuccessLevel(null);
    try {
      const res = await upgradeBuildingClient({ buildingId, expectedLevel });
      if (!isMountedRef.current) return;
      if (res.success && res.data) {
        setCivState(res.data.civilizationState);
        setEconomy(res.data.economy);
        setInspectedBuilding(res.data.building);
        setUpgradeSuccessLevel(res.data.newLevel);
        await onStateMutated?.();
      } else {
        setUpgradeModalError({
          message: res.error || 'Could not upgrade building.',
          code: res.errorCode ?? 'CIV_UPGRADE_REQUEST_FAILED',
          params: res.errorParams,
        });
      }
    } catch (err) {
      if (!isMountedRef.current) return;
      setUpgradeModalError(
        toUiErrorPayload(err, 'CIV_UPGRADE_REQUEST_FAILED', 'Upgrade request failed.')
      );
    } finally {
      if (isMountedRef.current) {
        setIsSubmitting(false);
      }
    }
  };

  const handleSelectExpansionSlot = useCallback(
    (origin: GridCoordinate) => {
      if (
        isSubmitting ||
        isConfirmInFlightRef.current ||
        !canSelectExpansionSlot(flowStateRef.current) ||
        !civState
      ) {
        return;
      }
      const validSlots = GridMap.fromSnapshot(civState.grid).getAvailableExpansionSlots();
      const stillValid = validSlots.some((s) => s.x === origin.x && s.y === origin.y);
      if (!stillValid) {
        setErrorMsg({ message: t('civ.expand.onlyAdjacentHint') });
        return;
      }

      setErrorMsg(null);
      isCinematicAnimatingRef.current = true;
      setIsCinematicAnimating(true);
      setSelectedExpansionOrigin(origin);
      updateFlowState('CINEMATIC_MOVING');
    },
    [civState, isSubmitting, t, updateFlowState]
  );

  const handleCinematicArrived = useCallback(() => {
    if (!isMountedRef.current || flowStateRef.current !== 'CINEMATIC_MOVING') return;
    isCinematicAnimatingRef.current = false;
    setIsCinematicAnimating(false);
  }, []);

  const handleCameraReturnArrived = useCallback(() => {
    if (!isMountedRef.current || flowStateRef.current !== 'CAMERA_RETURNING') return;
    const nextState: ExpansionFlowState =
      returnTargetRef.current === 'EXPANSION_SELECTING' ? 'EXPANSION_SELECTING' : 'NORMAL';
    returnTargetRef.current = 'NORMAL';
    setSelectedExpansionOrigin(null);
    isCinematicAnimatingRef.current = false;
    setIsCinematicAnimating(false);
    updateFlowState(nextState);
  }, [updateFlowState]);

  const handleConfirmExpandLand = async (origin: GridCoordinate) => {
    if (
      isSubmitting ||
      isConfirmInFlightRef.current ||
      flowStateRef.current !== 'CINEMATIC_MOVING' ||
      isCinematicAnimatingRef.current ||
      !civState
    ) {
      return;
    }

    const validSlots = GridMap.fromSnapshot(civState.grid).getAvailableExpansionSlots();
    const stillValid = validSlots.some((s) => s.x === origin.x && s.y === origin.y);
    if (!stillValid) {
      setErrorMsg({ message: t('civ.expand.onlyAdjacentHint') });
      returnTargetRef.current = 'EXPANSION_SELECTING';
      setSelectedExpansionOrigin(null);
      updateFlowState('CAMERA_RETURNING');
      return;
    }

    isConfirmInFlightRef.current = true;
    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await expandLandClient({ origin });
      if (!isMountedRef.current) return;

      if (res.success && res.data) {
        returnTargetRef.current = 'NORMAL';
        setCivState(res.data.civilizationState);
        setEconomy(res.data.economy);
        await onStateMutated?.();
      } else {
        setErrorMsg({
          message: res.error || 'Could not expand territory.',
          code: res.errorCode ?? 'CIV_EXPAND_REQUEST_FAILED',
          params: res.errorParams,
        });
        returnTargetRef.current = 'EXPANSION_SELECTING';
        setSelectedExpansionOrigin(null);
        updateFlowState('CAMERA_RETURNING');
      }
    } catch (err) {
      if (!isMountedRef.current) return;
      setErrorMsg(toUiErrorPayload(err, 'CIV_EXPAND_REQUEST_FAILED', 'Expansion request failed.'));
      returnTargetRef.current = 'EXPANSION_SELECTING';
      setSelectedExpansionOrigin(null);
      updateFlowState('CAMERA_RETURNING');
    } finally {
      isConfirmInFlightRef.current = false;
      if (isMountedRef.current) {
        setIsSubmitting(false);
      }
    }
  };

  const isExpansionModalOpen =
    flowState === 'CINEMATIC_MOVING' &&
    !isCinematicAnimating &&
    Boolean(selectedExpansionOrigin);

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
        isExpansionLocked={isExpansionLocked}
        canCancelExpansion={canCancelExpansion}
        onCancelExpansion={handleCancelExpansionMode}
      />

      {errorMsg && (
        <div
          role="alert"
          className="px-3 py-1.5 bg-rose-50 dark:bg-rose-950/70 border-b border-rose-200 dark:border-rose-800/80 text-rose-700 dark:text-rose-200 text-[11px] flex items-center justify-between gap-2 shrink-0"
        >
          <span className="inline-flex items-center gap-1.5 min-w-0">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 text-rose-600 dark:text-rose-400" />
            <span className="truncate">
              {localizeErrorMessage(locale, errorMsg.message, errorMsg.code, errorMsg.params)}
            </span>
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
            if (isExpansionFlowActive(flowStateRef.current)) return;
            setErrorMsg(null);
            setUpgradeModalError(null);
            setUpgradeSuccessLevel(null);
            setInspectedBuilding(inst);
          }}
          isSubmitting={isSubmitting}
          isExpansionMode={isExpansionMode}
          expansionFlowState={flowState}
          selectedExpansionOrigin={selectedExpansionOrigin}
          onSelectExpansionSlot={handleSelectExpansionSlot}
          onInvalidExpansionClick={() => {
            if (!canSelectExpansionSlot(flowStateRef.current)) return;
            setErrorMsg({ message: t('civ.expand.onlyAdjacentHint') });
          }}
          activeExpansionReveal={activeExpansionReveal}
          unrevealedChunkOrigin={unrevealedChunkOrigin}
          onCinematicArrived={handleCinematicArrived}
          onCameraReturnArrived={handleCameraReturnArrived}
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
        placedBuildings={civState?.buildings ?? []}
        onSelectBuilding={handleSelectBuildingForPlacement}
      />

      <BuildingDetailsModal
        building={inspectedBuilding}
        onClose={() => {
          setInspectedBuilding(null);
          setUpgradeModalError(null);
          setUpgradeSuccessLevel(null);
        }}
        onRemove={handleRemoveBuilding}
        onUpgrade={handleUpgradeBuilding}
        playerLevel={playerLevel}
        playerCoins={economy.focusCoins}
        currentEra={civState?.era ?? 'STONE_AGE'}
        upgradeError={upgradeModalError}
        upgradeSuccessLevel={upgradeSuccessLevel}
        isSubmitting={isSubmitting}
      />

      <LandExpansionModal
        isOpen={isExpansionModalOpen}
        selectedOrigin={selectedExpansionOrigin}
        chunksCount={chunksCount}
        playerLevel={playerLevel}
        playerCoins={economy.focusCoins}
        onConfirm={handleConfirmExpandLand}
        onClose={handleCloseExpansionModal}
        isSubmitting={isSubmitting}
      />
    </div>
  );
};
