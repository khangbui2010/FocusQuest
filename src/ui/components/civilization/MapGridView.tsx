import React, { useState, useMemo, useRef, useCallback, useEffect, useLayoutEffect } from 'react';
import { ZoomIn, ZoomOut, RotateCcw, MapPin, Plus } from 'lucide-react';
import { CivilizationState } from '../../../core/civilization/civilizationState.ts';
import {
  BuildingDefinition,
  BuildingInstance,
} from '../../../core/civilization/buildingTypes.ts';
import { GridCoordinate, PlacementFailureReason } from '../../../core/civilization/types.ts';
import { CHUNK_WIDTH, CHUNK_HEIGHT } from '../../../core/civilization/constants.ts';
import { GridMap } from '../../../core/civilization/gridMap.ts';
import { getBuildingDefinition } from '../../../core/civilization/buildingCatalog.ts';
import { renderBuildingIcon } from './BuildingCatalogPanel.tsx';
import {
  PixelSprite,
  getBuildingSprite,
} from './spriteRegistry.ts';
import { TERRAIN_DECOR_SEED } from './terrainDecor.ts';
import { TerrainBitmapCanvas } from './TerrainBitmapCanvas.tsx';
import {
  ActiveExpansionReveal,
  EXPANSION_IMPACT_MS,
  EXPANSION_SHAKE_DURATION_MS,
  doesFootprintOverlapChunkOrigin,
  isCellInChunk,
  prefersReducedMotion,
} from './expansionReveal.ts';
import {
  CameraSnapshot,
  CameraViewportSize,
  EXPANSION_CINEMATIC_MS,
  ExpansionFlowState,
  canSelectExpansionSlot,
  computeChunkCenterPan,
  computeRestoredPanFromSnapshot,
  createCameraSnapshot,
  easeInOutCubic,
  interpolatePan,
  isExpansionCandidatesVisible,
  isExpansionFlowActive,
  isManualCameraLocked,
} from './expansionCamera.ts';
import { ExpansionRevealOverlay } from './ExpansionRevealOverlay.tsx';
import { formatRewardAmount } from '../../utils/formatters.ts';
import { getLocalizedBuildingName } from '../../utils/buildingI18n.ts';
import { useTranslation } from '../../../i18n/I18nContext.tsx';

export {
  EXPANSION_CINEMATIC_MS,
  computeChunkCenterPan,
  easeInOutCubic,
  interpolatePan,
};

export interface MapGridViewProps {
  civilizationState: CivilizationState;
  placementDef: BuildingDefinition | null;
  onPlaceBuilding: (pos: GridCoordinate) => void;
  onInspectBuilding: (inst: BuildingInstance) => void;
  isSubmitting?: boolean;
  isExpansionMode?: boolean;
  expansionFlowState?: ExpansionFlowState;
  selectedExpansionOrigin?: GridCoordinate | null;
  onSelectExpansionSlot?: (origin: GridCoordinate) => void;
  onInvalidExpansionClick?: () => void;
  activeExpansionReveal?: ActiveExpansionReveal | null;
  unrevealedChunkOrigin?: GridCoordinate | null;
  onCinematicArrived?: () => void;
  onCameraReturnArrived?: () => void;
}

export const CELL_SIZE = 32;
export const ZOOM_PIXEL_DENOMINATOR = 16;
export const FOREST_MARGIN_CHUNKS = 2;
export const FOREST_MARGIN_CELLS = FOREST_MARGIN_CHUNKS * CHUNK_WIDTH;
export const EXPANSION_FOREST_MARGIN_CELLS = Math.max(FOREST_MARGIN_CELLS, CHUNK_WIDTH, CHUNK_HEIGHT);
const MIN_ZOOM = 0.5;
const EXPANSION_MIN_ZOOM = 0.375;
const MAX_ZOOM = 2.0;
const ZOOM_STEP = 0.25;
const WHEEL_ZOOM_STEP = 0.125;
const DRAG_THRESHOLD_PX = 4;

const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

export function snapZoomToIntegerPixels(rawZoom: number, minZoom = MIN_ZOOM): number {
  const clamped = Math.min(MAX_ZOOM, Math.max(minZoom, rawZoom));
  const snapped = Math.round(clamped * ZOOM_PIXEL_DENOMINATOR) / ZOOM_PIXEL_DENOMINATOR;
  return Math.min(MAX_ZOOM, Math.max(minZoom, snapped));
}

export function computeExpansionFitZoom(
  mapWidthPx: number,
  mapHeightPx: number,
  viewportWidth = 360,
  viewportHeight = 420
): number {
  if (mapWidthPx <= 0 || mapHeightPx <= 0) return 1.0;
  const availableW = Math.max(200, viewportWidth - 24);
  const availableH = Math.max(200, viewportHeight - 24);
  const raw = Math.min(1.0, availableW / mapWidthPx, availableH / mapHeightPx);
  const clamped = Math.max(EXPANSION_MIN_ZOOM, Math.min(MAX_ZOOM, raw));
  const snapped = Math.floor(clamped * ZOOM_PIXEL_DENOMINATOR) / ZOOM_PIXEL_DENOMINATOR;
  return Math.max(EXPANSION_MIN_ZOOM, Math.min(MAX_ZOOM, snapped));
}

export function getPlacementPreviewLabel(
  isValid: boolean,
  reason: PlacementFailureReason | undefined,
  t: ReturnType<typeof useTranslation>['t']
): string {
  if (isValid) return t('civ.map.placeValid');
  if (reason === 'CELL_OCCUPIED') return t('civ.map.placeOccupied');
  return t('civ.map.placeOutside');
}

export function getMapStageClassName(
  isDragging: boolean,
  isZoomTransitionActive = false
): string {
  if (isDragging || !isZoomTransitionActive) {
    return 'relative shrink-0';
  }
  return 'relative shrink-0 transition-transform duration-150 ease-out';
}

function scheduleImmediateCallback(cb: () => void): () => void {
  if (typeof requestAnimationFrame === 'function') {
    const rafId = requestAnimationFrame(() => cb());
    return () => cancelAnimationFrame(rafId);
  }
  const timerId = setTimeout(cb, 0);
  return () => clearTimeout(timerId);
}

interface GridCellProps {
  x: number;
  y: number;
  isUnlocked: boolean;
  isPlacementMode: boolean;
  isExpansionSelecting: boolean;
  onHover: (coord: GridCoordinate) => void;
  onCellClick: (coord: GridCoordinate, isUnlocked: boolean) => void;
}

const GridCell = React.memo<GridCellProps>(
  ({
    x,
    y,
    isUnlocked,
    isPlacementMode,
    isExpansionSelecting,
    onHover,
    onCellClick,
  }) => {
    const clickableLocked = isExpansionSelecting && !isUnlocked;

    return (
      <div
        data-cell-coord={`${x},${y}`}
        data-unlocked={isUnlocked ? 'true' : 'false'}
        onMouseEnter={isPlacementMode ? () => onHover({ x, y }) : undefined}
        onClick={
          isPlacementMode || clickableLocked
            ? () => onCellClick({ x, y }, isUnlocked)
            : undefined
        }
        style={{
          width: CELL_SIZE,
          height: CELL_SIZE,
        }}
        className={`box-border select-none ${
          isUnlocked
            ? isPlacementMode
              ? 'relative border-0 after:absolute after:inset-0 after:pointer-events-none hover:after:bg-emerald-300/35 cursor-crosshair'
              : 'border-0'
            : isPlacementMode
            ? 'border-0 cursor-crosshair'
            : clickableLocked
            ? 'border-0 cursor-not-allowed'
            : 'border-0 pointer-events-none'
        }`}
      />
    );
  }
);

GridCell.displayName = 'GridCell';

export const MapGridView: React.FC<MapGridViewProps> = ({
  civilizationState,
  placementDef,
  onPlaceBuilding,
  onInspectBuilding,
  isSubmitting = false,
  isExpansionMode = false,
  expansionFlowState,
  selectedExpansionOrigin = null,
  onSelectExpansionSlot,
  onInvalidExpansionClick,
  activeExpansionReveal = null,
  unrevealedChunkOrigin = null,
  onCinematicArrived,
  onCameraReturnArrived,
}) => {
  const { locale, t } = useTranslation();

  const effectiveFlowState: ExpansionFlowState =
    expansionFlowState ?? (isExpansionMode ? 'EXPANSION_SELECTING' : 'NORMAL');
  const isExpansionActive = isExpansionFlowActive(effectiveFlowState) || isExpansionMode;
  const cameraLocked = isManualCameraLocked(effectiveFlowState);
  const showCandidates = isExpansionCandidatesVisible(effectiveFlowState);
  const isExpansionSelecting = canSelectExpansionSlot(effectiveFlowState);

  const gridMap = useMemo(
    () => GridMap.fromSnapshot(civilizationState.grid),
    [civilizationState.grid]
  );

  const boundingBox = useMemo(() => gridMap.getBoundingBox(), [gridMap]);

  const effectiveMargin = isExpansionActive ? EXPANSION_FOREST_MARGIN_CELLS : FOREST_MARGIN_CELLS;

  const renderBox = useMemo(
    () => ({
      minX: boundingBox.minX - effectiveMargin,
      maxX: boundingBox.maxX + effectiveMargin,
      minY: boundingBox.minY - effectiveMargin,
      maxY: boundingBox.maxY + effectiveMargin,
      width: boundingBox.width + effectiveMargin * 2,
      height: boundingBox.height + effectiveMargin * 2,
    }),
    [boundingBox, effectiveMargin]
  );

  const mapWidthPx = renderBox.width * CELL_SIZE;
  const mapHeightPx = renderBox.height * CELL_SIZE;

  const [zoom, setZoom] = useState<number>(1.0);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [hoverCoord, setHoverCoord] = useState<GridCoordinate | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isZoomTransitionActive, setIsZoomTransitionActive] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const wasExpansionActiveRef = useRef<boolean>(isExpansionActive);
  const savedCameraRef = useRef<CameraSnapshot | null>(null);
  const didReturnViaCinematicRef = useRef<boolean>(false);
  const zoomTransitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cinematicRafRef = useRef<number | null>(null);
  const immediateFinishCancelRef = useRef<(() => void) | null>(null);
  const viewportSizeRef = useRef<CameraViewportSize>({ width: 0, height: 0 });
  const panRef = useRef(pan);
  panRef.current = pan;
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const renderBoxRef = useRef(renderBox);
  renderBoxRef.current = renderBox;
  const onCinematicArrivedRef = useRef(onCinematicArrived);
  onCinematicArrivedRef.current = onCinematicArrived;
  const onCameraReturnArrivedRef = useRef(onCameraReturnArrived);
  onCameraReturnArrivedRef.current = onCameraReturnArrived;

  const clearZoomTransitionTimer = useCallback(() => {
    if (zoomTransitionTimerRef.current !== null) {
      clearTimeout(zoomTransitionTimerRef.current);
      zoomTransitionTimerRef.current = null;
    }
  }, []);

  const triggerButtonZoomTransition = useCallback(() => {
    clearZoomTransitionTimer();
    setIsZoomTransitionActive(true);
    zoomTransitionTimerRef.current = setTimeout(() => {
      setIsZoomTransitionActive(false);
      zoomTransitionTimerRef.current = null;
    }, 160);
  }, [clearZoomTransitionTimer]);

  const cancelCinematicMotion = useCallback(() => {
    if (cinematicRafRef.current !== null) {
      if (typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(cinematicRafRef.current);
      }
      cinematicRafRef.current = null;
    }
    if (immediateFinishCancelRef.current) {
      immediateFinishCancelRef.current();
      immediateFinishCancelRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      clearZoomTransitionTimer();
      cancelCinematicMotion();
    };
  }, [clearZoomTransitionTimer, cancelCinematicMotion]);

  // Track viewport size safely for snapshot completeness and resize resilience
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateSize = (width: number, height: number) => {
      viewportSizeRef.current = {
        width: Math.max(0, Math.round(width)),
        height: Math.max(0, Math.round(height)),
      };
    };

    const rect = el.getBoundingClientRect();
    updateSize(rect.width, rect.height);

    if (typeof ResizeObserver === 'undefined') {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      updateSize(entry.contentRect.width, entry.contentRect.height);
    });
    observer.observe(el);

    return () => {
      observer.disconnect();
    };
  }, []);

  const hasMovedRef = useRef<boolean>(false);
  const dragStartRef = useRef<{
    clientX: number;
    clientY: number;
    panX: number;
    panY: number;
  } | null>(null);

  // Clear any in-progress drag immediately if camera becomes locked
  useEffect(() => {
    if (cameraLocked) {
      dragStartRef.current = null;
      setIsDragging(false);
      clearZoomTransitionTimer();
      setIsZoomTransitionActive(false);
    }
  }, [cameraLocked, clearZoomTransitionTimer]);

  // UX-5.1 Persistent Camera Snapshot: capture without moving camera or changing zoom on entry;
  // clear cleanly on return to NORMAL without introducing any abrupt jump.
  useEffect(() => {
    if (isExpansionActive) {
      if (!wasExpansionActiveRef.current) {
        savedCameraRef.current = createCameraSnapshot(
          panRef.current,
          zoomRef.current,
          viewportSizeRef.current,
          renderBoxRef.current
        );
        didReturnViaCinematicRef.current = false;
        wasExpansionActiveRef.current = true;
      }
    } else if (wasExpansionActiveRef.current) {
      const restored = savedCameraRef.current;
      savedCameraRef.current = null;
      wasExpansionActiveRef.current = false;
      if (!didReturnViaCinematicRef.current && restored) {
        setZoom(restored.zoom);
        setPan(computeRestoredPanFromSnapshot(restored, renderBoxRef.current, CELL_SIZE));
      }
      didReturnViaCinematicRef.current = false;
    }
  }, [isExpansionActive]);

  // UX-5.1 Cinematic Recenter: on CINEMATIC_MOVING with selectedExpansionOrigin, glide pan smoothly
  // to center on the chosen chunk while keeping current zoom untouched.
  useEffect(() => {
    if (effectiveFlowState !== 'CINEMATIC_MOVING' || !selectedExpansionOrigin) {
      return;
    }
    cancelCinematicMotion();
    clearZoomTransitionTimer();
    setIsZoomTransitionActive(false);

    const startPan = { x: panRef.current.x, y: panRef.current.y };
    const currentZoom = zoomRef.current;
    const currentBox = renderBoxRef.current;
    const targetPan = computeChunkCenterPan(
      selectedExpansionOrigin,
      currentBox.minX,
      currentBox.minY,
      currentBox.width * CELL_SIZE,
      currentBox.height * CELL_SIZE,
      currentZoom
    );

    if (
      (startPan.x === targetPan.x && startPan.y === targetPan.y) ||
      prefersReducedMotion() ||
      typeof requestAnimationFrame !== 'function' ||
      typeof performance === 'undefined'
    ) {
      setPan(targetPan);
      immediateFinishCancelRef.current = scheduleImmediateCallback(() => {
        immediateFinishCancelRef.current = null;
        onCinematicArrivedRef.current?.();
      });
      return cancelCinematicMotion;
    }

    const startedAt = performance.now();
    const step = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / EXPANSION_CINEMATIC_MS);
      setPan(interpolatePan(startPan, targetPan, progress));
      if (progress < 1) {
        cinematicRafRef.current = requestAnimationFrame(step);
      } else {
        cinematicRafRef.current = null;
        onCinematicArrivedRef.current?.();
      }
    };
    cinematicRafRef.current = requestAnimationFrame(step);

    return cancelCinematicMotion;
  }, [
    effectiveFlowState,
    selectedExpansionOrigin,
    cancelCinematicMotion,
    clearZoomTransitionTimer,
  ]);

  // UX-5.1 Camera Returning: glide pan smoothly from chunk center back to initial snapshot
  // (compensating for any stage center shift caused by newly unlocked West/North/East/South chunks)
  // and preserve the original zoom.
  useEffect(() => {
    if (effectiveFlowState !== 'CAMERA_RETURNING') {
      return;
    }
    cancelCinematicMotion();
    clearZoomTransitionTimer();
    setIsZoomTransitionActive(false);

    const snapshot = savedCameraRef.current;
    if (!snapshot) {
      didReturnViaCinematicRef.current = true;
      immediateFinishCancelRef.current = scheduleImmediateCallback(() => {
        immediateFinishCancelRef.current = null;
        onCameraReturnArrivedRef.current?.();
      });
      return cancelCinematicMotion;
    }

    if (zoomRef.current !== snapshot.zoom) {
      setZoom(snapshot.zoom);
    }

    const startPan = { x: panRef.current.x, y: panRef.current.y };
    const initialTarget = computeRestoredPanFromSnapshot(
      snapshot,
      renderBoxRef.current,
      CELL_SIZE
    );

    if (
      (startPan.x === initialTarget.x && startPan.y === initialTarget.y) ||
      prefersReducedMotion() ||
      typeof requestAnimationFrame !== 'function' ||
      typeof performance === 'undefined'
    ) {
      setPan(initialTarget);
      didReturnViaCinematicRef.current = true;
      immediateFinishCancelRef.current = scheduleImmediateCallback(() => {
        immediateFinishCancelRef.current = null;
        onCameraReturnArrivedRef.current?.();
      });
      return cancelCinematicMotion;
    }

    const startedAt = performance.now();
    const step = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / EXPANSION_CINEMATIC_MS);
      const liveTarget = computeRestoredPanFromSnapshot(
        snapshot,
        renderBoxRef.current,
        CELL_SIZE
      );
      setPan(interpolatePan(startPan, liveTarget, progress));
      if (progress < 1) {
        cinematicRafRef.current = requestAnimationFrame(step);
      } else {
        cinematicRafRef.current = null;
        didReturnViaCinematicRef.current = true;
        onCameraReturnArrivedRef.current?.();
      }
    };
    cinematicRafRef.current = requestAnimationFrame(step);

    return cancelCinematicMotion;
  }, [effectiveFlowState, cancelCinematicMotion, clearZoomTransitionTimer]);

  // Synchronously keep target chunk dead-center before paint whenever bounding box changes during
  // CHOPPING / TERRAIN_UPDATING (zero 1-frame flicker on West/North/East/South growth).
  useIsomorphicLayoutEffect(() => {
    if (
      !selectedExpansionOrigin ||
      (effectiveFlowState !== 'CHOPPING' && effectiveFlowState !== 'TERRAIN_UPDATING')
    ) {
      return;
    }
    const targetPan = computeChunkCenterPan(
      selectedExpansionOrigin,
      renderBox.minX,
      renderBox.minY,
      mapWidthPx,
      mapHeightPx,
      zoom
    );
    if (panRef.current.x !== targetPan.x || panRef.current.y !== targetPan.y) {
      setPan(targetPan);
    }
  }, [effectiveFlowState, selectedExpansionOrigin, renderBox.minX, renderBox.minY, mapWidthPx, mapHeightPx, zoom]);

  const availableExpansionSlots = useMemo(
    () => (showCandidates ? gridMap.getAvailableExpansionSlots() : []),
    [showCandidates, gridMap]
  );

  const isCellUnlockedFn = useCallback(
    (cx: number, cy: number) => {
      if (unrevealedChunkOrigin && isCellInChunk({ x: cx, y: cy }, unrevealedChunkOrigin)) {
        return false;
      }
      return gridMap.isCellUnlocked(cx, cy);
    },
    [gridMap, unrevealedChunkOrigin]
  );

  const cells = useMemo(() => {
    const list: { x: number; y: number; unlocked: boolean }[] = [];
    for (let y = renderBox.minY; y <= renderBox.maxY; y++) {
      for (let x = renderBox.minX; x <= renderBox.maxX; x++) {
        const visuallyLockedByReveal =
          Boolean(unrevealedChunkOrigin) && isCellInChunk({ x, y }, unrevealedChunkOrigin);
        list.push({
          x,
          y,
          unlocked: !visuallyLockedByReveal && gridMap.isCellUnlocked(x, y),
        });
      }
    }
    return list;
  }, [renderBox, gridMap, unrevealedChunkOrigin]);

  const placementValidation = useMemo(() => {
    if (!placementDef || !hoverCoord) return null;
    if (
      unrevealedChunkOrigin &&
      doesFootprintOverlapChunkOrigin(hoverCoord, placementDef.footprint, unrevealedChunkOrigin)
    ) {
      return null;
    }
    return gridMap.canPlaceBuilding(hoverCoord, placementDef.footprint);
  }, [gridMap, placementDef, hoverCoord, unrevealedChunkOrigin]);

  const activeMinZoom = isExpansionActive ? EXPANSION_MIN_ZOOM : MIN_ZOOM;

  const clampZoom = (val: number): number => snapZoomToIntegerPixels(val, activeMinZoom);

  const handleZoomIn = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (cameraLocked) return;
      triggerButtonZoomTransition();
      setZoom((z) => clampZoom(z + ZOOM_STEP));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeMinZoom, cameraLocked, triggerButtonZoomTransition]
  );

  const handleZoomOut = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (cameraLocked) return;
      triggerButtonZoomTransition();
      setZoom((z) => clampZoom(z - ZOOM_STEP));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeMinZoom, cameraLocked, triggerButtonZoomTransition]
  );

  const handleResetZoom = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (cameraLocked) return;
      triggerButtonZoomTransition();
      setZoom(1.0);
    },
    [cameraLocked, triggerButtonZoomTransition]
  );

  const handleRecenter = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (cameraLocked) return;
      triggerButtonZoomTransition();
      setPan({ x: 0, y: 0 });
      setZoom(1.0);
    },
    [cameraLocked, triggerButtonZoomTransition]
  );

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0 || cameraLocked) return;
    hasMovedRef.current = false;
    clearZoomTransitionTimer();
    setIsZoomTransitionActive(false);
    setIsDragging(true);
    dragStartRef.current = {
      clientX: e.clientX,
      clientY: e.clientY,
      panX: pan.x,
      panY: pan.y,
    };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!dragStartRef.current || cameraLocked) return;
    const dx = e.clientX - dragStartRef.current.clientX;
    const dy = e.clientY - dragStartRef.current.clientY;
    if (Math.hypot(dx, dy) >= DRAG_THRESHOLD_PX) {
      hasMovedRef.current = true;
    }
    if (hasMovedRef.current) {
      setPan({
        x: Math.round(dragStartRef.current.panX + dx),
        y: Math.round(dragStartRef.current.panY + dy),
      });
    }
  };

  const handleMouseUpOrLeave = () => {
    dragStartRef.current = null;
    setIsDragging(false);
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (cameraLocked) return;
    const delta = e.deltaY < 0 ? WHEEL_ZOOM_STEP : -WHEEL_ZOOM_STEP;
    setZoom((z) => clampZoom(z + delta));
  };

  const handleHoverCell = useCallback(
    (coord: GridCoordinate) => {
      if (
        unrevealedChunkOrigin &&
        placementDef &&
        doesFootprintOverlapChunkOrigin(coord, placementDef.footprint, unrevealedChunkOrigin)
      ) {
        setHoverCoord(null);
        return;
      }
      setHoverCoord(coord);
    },
    [unrevealedChunkOrigin, placementDef]
  );

  const handleCellClick = useCallback(
    (coord: GridCoordinate, isUnlocked: boolean) => {
      if (hasMovedRef.current || isSubmitting) return;
      if (isExpansionSelecting && !isUnlocked) {
        onInvalidExpansionClick?.();
        return;
      }
      if (!placementDef) return;
      if (
        unrevealedChunkOrigin &&
        doesFootprintOverlapChunkOrigin(coord, placementDef.footprint, unrevealedChunkOrigin)
      ) {
        return;
      }
      const check = gridMap.canPlaceBuilding(coord, placementDef.footprint);
      if (check.isValid) {
        onPlaceBuilding(coord);
      }
    },
    [
      gridMap,
      placementDef,
      isSubmitting,
      onPlaceBuilding,
      isExpansionSelecting,
      onInvalidExpansionClick,
      unrevealedChunkOrigin,
    ]
  );

  const zoomPercent = Math.round(zoom * 100);
  const shouldShakeMap = Boolean(activeExpansionReveal && !activeExpansionReveal.reducedMotion);
  const shakeLayerStyle = shouldShakeMap
    ? ({
        ['--fq-impact-delay' as string]: `${EXPANSION_IMPACT_MS}ms`,
        ['--fq-shake-duration' as string]: `${EXPANSION_SHAKE_DURATION_MS}ms`,
      } as React.CSSProperties)
    : undefined;

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUpOrLeave}
      onMouseLeave={() => {
        handleMouseUpOrLeave();
        setHoverCoord(null);
      }}
      onWheel={handleWheel}
      className={`relative flex-1 min-h-0 w-full overflow-hidden touch-none select-none bg-slate-100 dark:bg-slate-950 flex items-center justify-center ${
        cameraLocked
          ? 'cursor-default'
          : isDragging
          ? 'cursor-grabbing'
          : placementDef
          ? 'cursor-crosshair'
          : 'cursor-grab'
      }`}
    >
      {/* Interactive Pan/Zoom Stage */}
      <div
        data-testid="map-grid-stage"
        data-render-width={renderBox.width}
        data-render-height={renderBox.height}
        data-cell-px={CELL_SIZE * zoom}
        data-expansion-mode={isExpansionActive ? 'true' : 'false'}
        data-expansion-flow-state={effectiveFlowState}
        data-camera-locked={cameraLocked ? 'true' : 'false'}
        data-camera-zoom={zoom}
        data-camera-pan-x={Math.round(pan.x)}
        data-camera-pan-y={Math.round(pan.y)}
        style={{
          transform: `translate(${Math.round(pan.x)}px, ${Math.round(pan.y)}px) scale(${zoom})`,
          transformOrigin: 'center center',
          width: mapWidthPx,
          height: mapHeightPx,
        }}
        className={getMapStageClassName(isDragging || cameraLocked, isZoomTransitionActive)}
      >
        <div
          key={shouldShakeMap ? `shake-${activeExpansionReveal?.id}` : 'shake-idle'}
          data-testid="map-shake-layer"
          style={shakeLayerStyle}
          className={
            shouldShakeMap
              ? 'fq-map-shake-active relative w-full h-full'
              : 'relative w-full h-full'
          }
        >
        {/* Single Composite Terrain Bitmap (Zero Inter-Tile Seams Across All DPR/Zoom/Pan) */}
        <TerrainBitmapCanvas
          testId="map-terrain-bitmap"
          minX={renderBox.minX}
          minY={renderBox.minY}
          cols={renderBox.width}
          rows={renderBox.height}
          cellSize={CELL_SIZE}
          seed={TERRAIN_DECOR_SEED}
          isCellUnlocked={isCellUnlockedFn}
          className="absolute inset-0 block pointer-events-none select-none"
        />

        {/* Transparent Interactive Cell Layer (Hover / Placement Click / Expansion Cursor Only) */}
        <div
          data-testid="map-interaction-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${renderBox.width}, ${CELL_SIZE}px)`,
            width: mapWidthPx,
            height: mapHeightPx,
          }}
          className="relative z-[1] select-none"
        >
          {cells.map((cell) => (
            <GridCell
              key={`${cell.x},${cell.y}`}
              x={cell.x}
              y={cell.y}
              isUnlocked={cell.unlocked}
              isPlacementMode={Boolean(placementDef)}
              isExpansionSelecting={isExpansionSelecting}
              onHover={handleHoverCell}
              onCellClick={handleCellClick}
            />
          ))}
        </div>

        {/* Unlocked Chunk Boundaries */}
        {civilizationState.grid.chunks.map((chunk) => {
          if (
            unrevealedChunkOrigin &&
            chunk.origin.x === unrevealedChunkOrigin.x &&
            chunk.origin.y === unrevealedChunkOrigin.y
          ) {
            return null;
          }
          const left = (chunk.origin.x - renderBox.minX) * CELL_SIZE;
          const top = (chunk.origin.y - renderBox.minY) * CELL_SIZE;
          const width = chunk.dimensions.width * CELL_SIZE;
          const height = chunk.dimensions.height * CELL_SIZE;
          return (
            <div
              key={chunk.id}
              style={{ left, top, width, height }}
              className="absolute z-[2] pointer-events-none border border-emerald-500/35 dark:border-emerald-400/25"
            >
              <span className="absolute top-0.5 left-1 text-[8px] font-mono text-emerald-700/60 dark:text-emerald-300/50 tabular-nums">
                {`(${chunk.origin.x},${chunk.origin.y})`}
              </span>
            </div>
          );
        })}

        {/* Expandable Adjacent Candidate 4x4 Chunks */}
        {showCandidates &&
          availableExpansionSlots.map((slot) => {
            const left = (slot.x - renderBox.minX) * CELL_SIZE;
            const top = (slot.y - renderBox.minY) * CELL_SIZE;
            const width = CHUNK_WIDTH * CELL_SIZE;
            const height = CHUNK_HEIGHT * CELL_SIZE;
            const isSelected =
              selectedExpansionOrigin?.x === slot.x && selectedExpansionOrigin?.y === slot.y;
            const slotDisabled = isSubmitting || !isExpansionSelecting || Boolean(selectedExpansionOrigin);

            return (
              <button
                key={`expand_slot_${slot.x}_${slot.y}`}
                type="button"
                data-expansion-candidate={`${slot.x},${slot.y}`}
                aria-label={t('civ.expand.candidateAria', { x: slot.x, y: slot.y })}
                disabled={slotDisabled}
                onMouseDown={(e) => {
                  hasMovedRef.current = false;
                  e.stopPropagation();
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (hasMovedRef.current || slotDisabled) return;
                  onSelectExpansionSlot?.(slot);
                }}
                style={{ left, top, width, height }}
                className={`absolute z-20 box-border rounded-sm flex flex-col items-center justify-center gap-0.5 transition-all ${
                  isSelected
                    ? 'border-2 border-amber-300 bg-amber-300/30 ring-2 ring-amber-300/80 shadow-lg text-white cursor-default'
                    : 'border-2 border-emerald-300/90 bg-emerald-400/20 hover:bg-emerald-300/35 hover:border-emerald-200 animate-pulse text-emerald-50 shadow-md cursor-pointer disabled:opacity-55 disabled:cursor-not-allowed disabled:animate-none'
                }`}
              >
                <span className="w-7 h-7 rounded-full bg-slate-950/65 border border-white/50 flex items-center justify-center shadow-xs">
                  <Plus className="w-4 h-4 text-emerald-300" />
                </span>
                <span className="px-1 py-[1px] rounded bg-slate-950/70 text-[9px] font-mono font-semibold text-emerald-100 tabular-nums leading-none">
                  {`(${slot.x},${slot.y})`}
                </span>
              </button>
            );
          })}

        {/* Placed Buildings (aligned to renderBox origin) */}
        {civilizationState.buildings.map((inst) => {
          const def = getBuildingDefinition(inst.definitionId);
          const sprite = getBuildingSprite(inst.definitionId);
          const widthCells = def?.footprint.width ?? 1;
          const heightCells = def?.footprint.height ?? 1;
          const left = (inst.position.x - renderBox.minX) * CELL_SIZE;
          const top = (inst.position.y - renderBox.minY) * CELL_SIZE;
          const width = widthCells * CELL_SIZE;
          const height = heightCells * CELL_SIZE;

          const categoryStyle =
            def?.category === 'ECONOMY_EFFECT'
              ? 'bg-emerald-100/95 dark:bg-emerald-900/85 border-emerald-500 dark:border-emerald-400 text-emerald-900 dark:text-emerald-100'
              : def?.category === 'FOCUS_SUPPORT'
              ? 'bg-indigo-100/95 dark:bg-indigo-900/85 border-indigo-500 dark:border-indigo-400 text-indigo-900 dark:text-indigo-100'
              : 'bg-amber-100/95 dark:bg-amber-900/85 border-amber-500 dark:border-amber-400 text-amber-900 dark:text-amber-100';

          const coinBonusEffect = def?.effects.find((e) => e.type === 'COIN_BONUS');
          const bonusPercent =
            coinBonusEffect && coinBonusEffect.type === 'COIN_BONUS'
              ? formatRewardAmount(coinBonusEffect.rate * inst.level * 100)
              : null;

          const localizedName = getLocalizedBuildingName(
            locale,
            def ?? inst.definitionId,
            def?.name ?? inst.definitionId
          );

          return (
            <button
              key={inst.id}
              type="button"
              title={t('civ.map.buildingTooltip', {
                name: localizedName,
                level: inst.level,
              })}
              onMouseDown={(e) => {
                hasMovedRef.current = false;
                e.stopPropagation();
              }}
              onClick={(e) => {
                e.stopPropagation();
                if (hasMovedRef.current || isSubmitting || cameraLocked) return;
                if (placementDef || isExpansionActive) return;
                onInspectBuilding(inst);
              }}
              style={{ left, top, width, height }}
              className={
                sprite
                  ? 'absolute z-10 flex items-center justify-center rounded-xs transition-all hover:brightness-110 hover:ring-1 hover:ring-white/80 cursor-pointer overflow-visible'
                  : `absolute z-10 border rounded-sm shadow-xs flex flex-col items-center justify-center p-0.5 transition-transform hover:brightness-105 cursor-pointer overflow-hidden ${categoryStyle}`
              }
            >
              {sprite ? (
                <>
                  <PixelSprite
                    sprite={sprite}
                    width={width}
                    height={height}
                    className="block w-full h-full pointer-events-none drop-shadow-[0_1px_1px_rgba(38,43,68,0.45)]"
                  />
                  {widthCells > 1 && (
                    <span className="absolute bottom-0.5 right-0.5 px-1 py-[1px] rounded bg-slate-950/75 text-white text-[8px] font-bold leading-none tabular-nums pointer-events-none">
                      Lv.{inst.level}
                      {bonusPercent ? ` +${bonusPercent}%` : ''}
                    </span>
                  )}
                </>
              ) : (
                <>
                  {renderBuildingIcon(def?.iconIdentifier ?? '', widthCells > 1 ? 'w-4 h-4' : 'w-3 h-3')}
                  {widthCells > 1 && (
                    <span className="mt-0.5 text-[8px] font-bold leading-none tabular-nums">
                      Lv.{inst.level}
                      {bonusPercent ? ` +${bonusPercent}%` : ''}
                    </span>
                  )}
                </>
              )}
            </button>
          );
        })}

        {/* Placement Hover Footprint Preview */}
        {placementDef && hoverCoord && placementValidation && (
          <div
            style={{
              left: (hoverCoord.x - renderBox.minX) * CELL_SIZE,
              top: (hoverCoord.y - renderBox.minY) * CELL_SIZE,
              width: placementDef.footprint.width * CELL_SIZE,
              height: placementDef.footprint.height * CELL_SIZE,
            }}
            className={`absolute z-20 pointer-events-none border-2 rounded-sm flex items-center justify-center ${
              placementValidation.isValid
                ? 'border-emerald-400 bg-emerald-500/30 text-emerald-950 dark:text-emerald-100'
                : 'border-rose-500 bg-rose-500/35 text-rose-950 dark:text-rose-100'
            }`}
          >
            <span className="px-1 py-0.5 rounded bg-white/85 dark:bg-slate-900/85 text-[9px] font-bold whitespace-nowrap shadow-2xs">
              {getPlacementPreviewLabel(
                placementValidation.isValid,
                placementValidation.reason,
                t
              )}
            </span>
          </div>
        )}

        {/* Stage C Post-Commit Axe Chop Overlay */}
        <ExpansionRevealOverlay
          reveal={activeExpansionReveal}
          renderMinX={renderBox.minX}
          renderMinY={renderBox.minY}
          cellSize={CELL_SIZE}
        />
        </div>
      </div>

      {/* Territory Summary Corner Label */}
      <div
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        className={`absolute ${
          isExpansionActive && !placementDef ? 'top-12' : 'top-2'
        } left-2 z-10 px-2 py-1 rounded-md bg-white/85 dark:bg-slate-900/85 backdrop-blur-sm border border-slate-200/80 dark:border-slate-700/80 text-[10px] font-medium text-slate-600 dark:text-slate-300 flex items-center gap-1 tabular-nums pointer-events-auto transition-[top] duration-150`}
      >
        <MapPin className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
        <span>
          {t('civ.map.summaryChunksBuildings', {
            chunks: civilizationState.grid.chunks.length,
            buildings: civilizationState.buildings.length,
          })}
        </span>
      </div>

      {/* Floating Camera Controls Toolbar */}
      <div
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        className="map-controls-toolbar absolute bottom-2.5 right-2.5 z-10 flex items-center gap-0.5 p-1 rounded-lg bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border border-slate-200 dark:border-slate-700 shadow-md"
      >
        <button
          type="button"
          title={t('civ.map.zoomOut')}
          aria-label={t('civ.map.zoomOut')}
          disabled={cameraLocked || zoom <= activeMinZoom}
          onClick={handleZoomOut}
          className="w-6 h-6 rounded flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
        >
          <ZoomOut className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          title={t('civ.map.resetZoom')}
          disabled={cameraLocked}
          onClick={handleResetZoom}
          className="px-1.5 h-6 rounded text-[10px] font-mono font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed tabular-nums transition-colors cursor-pointer"
        >
          {`${zoomPercent}%`}
        </button>

        <button
          type="button"
          title={t('civ.map.zoomIn')}
          aria-label={t('civ.map.zoomIn')}
          disabled={cameraLocked || zoom >= MAX_ZOOM}
          onClick={handleZoomIn}
          className="w-6 h-6 rounded flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </button>

        <div className="w-px h-4 bg-slate-200 dark:bg-slate-700 mx-0.5" />

        <button
          type="button"
          title={t('civ.map.recenterTitle')}
          aria-label={t('civ.map.recenterTitle')}
          disabled={cameraLocked}
          onClick={handleRecenter}
          className="px-1.5 h-6 rounded inline-flex items-center gap-1 text-[10px] font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap cursor-pointer"
        >
          <RotateCcw className="w-3 h-3 shrink-0" />
          <span>{t('civ.map.recenter')}</span>
        </button>
      </div>
    </div>
  );
};
