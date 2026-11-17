import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
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
  TileImage,
  getBuildingSprite,
} from './spriteRegistry.ts';
import {
  TERRAIN_DECOR_SEED,
  LOCKED_FOREST_OVERLAY_OPACITY,
  getCellDecor,
} from './terrainDecor.ts';
import {
  ActiveExpansionReveal,
  EXPANSION_IMPACT_MS,
  EXPANSION_SHAKE_DURATION_MS,
  doesFootprintOverlapChunkOrigin,
  isCellInChunk,
} from './expansionReveal.ts';
import { ExpansionRevealOverlay } from './ExpansionRevealOverlay.tsx';
import { formatRewardAmount } from '../../utils/formatters.ts';
import { getLocalizedBuildingName } from '../../utils/buildingI18n.ts';
import { useTranslation } from '../../../i18n/I18nContext.tsx';

export interface MapGridViewProps {
  civilizationState: CivilizationState;
  placementDef: BuildingDefinition | null;
  onPlaceBuilding: (pos: GridCoordinate) => void;
  onInspectBuilding: (inst: BuildingInstance) => void;
  isSubmitting?: boolean;
  isExpansionMode?: boolean;
  selectedExpansionOrigin?: GridCoordinate | null;
  onSelectExpansionSlot?: (origin: GridCoordinate) => void;
  onInvalidExpansionClick?: () => void;
  activeExpansionReveal?: ActiveExpansionReveal | null;
  unrevealedChunkOrigin?: GridCoordinate | null;
}

export const CELL_SIZE = 32;
export const FOREST_MARGIN_CHUNKS = 2;
export const FOREST_MARGIN_CELLS = FOREST_MARGIN_CHUNKS * CHUNK_WIDTH;
export const EXPANSION_FOREST_MARGIN_CELLS = Math.max(FOREST_MARGIN_CELLS, CHUNK_WIDTH, CHUNK_HEIGHT);
const MIN_ZOOM = 0.6;
const EXPANSION_MIN_ZOOM = 0.35;
const MAX_ZOOM = 2.0;
const ZOOM_STEP = 0.2;
const DRAG_THRESHOLD_PX = 4;

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
  return Math.round(clamped * 100) / 100;
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

interface GridCellProps {
  x: number;
  y: number;
  isUnlocked: boolean;
  isCellUnlockedFn: (cx: number, cy: number) => boolean;
  isPlacementMode: boolean;
  isExpansionMode: boolean;
  onHover: (coord: GridCoordinate) => void;
  onCellClick: (coord: GridCoordinate, isUnlocked: boolean) => void;
}

const GridCell = React.memo<GridCellProps>(
  ({
    x,
    y,
    isUnlocked,
    isCellUnlockedFn,
    isPlacementMode,
    isExpansionMode,
    onHover,
    onCellClick,
  }) => {
    const decor = getCellDecor(x, y, isUnlocked, TERRAIN_DECOR_SEED, isCellUnlockedFn);
    const clickableLocked = isExpansionMode && !isUnlocked;

    return (
      <div
        data-cell-coord={`${x},${y}`}
        data-unlocked={isUnlocked ? 'true' : 'false'}
        data-decor-kind={decor.kind}
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
        className={`relative box-border select-none overflow-hidden transition-colors ${
          isUnlocked
            ? isPlacementMode
              ? 'border-[0.5px] border-emerald-950/20 dark:border-slate-900/40 after:absolute after:inset-0 after:pointer-events-none hover:after:bg-emerald-300/35 cursor-crosshair'
              : 'border-[0.5px] border-emerald-950/15 dark:border-slate-900/35'
            : isPlacementMode
            ? 'border-0 cursor-crosshair'
            : clickableLocked
            ? 'border-0 cursor-not-allowed'
            : 'border-0 pointer-events-none'
        }`}
      >
        <TileImage
          pack="tiny-town"
          tileIndex={decor.baseTile}
          size={CELL_SIZE}
          className="block pointer-events-none"
        />

        {decor.isDarkened && (
          <div
            aria-hidden="true"
            data-locked-forest="true"
            style={{ opacity: LOCKED_FOREST_OVERLAY_OPACITY }}
            className="absolute inset-0 bg-slate-950 pointer-events-none"
          />
        )}

        {decor.overlayTile !== null && (
          <TileImage
            pack="tiny-town"
            tileIndex={decor.overlayTile}
            size={CELL_SIZE}
            className="absolute inset-0 block pointer-events-none"
          />
        )}
      </div>
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
  selectedExpansionOrigin = null,
  onSelectExpansionSlot,
  onInvalidExpansionClick,
  activeExpansionReveal = null,
  unrevealedChunkOrigin = null,
}) => {
  const { locale, t } = useTranslation();

  const gridMap = useMemo(
    () => GridMap.fromSnapshot(civilizationState.grid),
    [civilizationState.grid]
  );

  const boundingBox = useMemo(() => gridMap.getBoundingBox(), [gridMap]);

  const effectiveMargin = isExpansionMode ? EXPANSION_FOREST_MARGIN_CELLS : FOREST_MARGIN_CELLS;

  // Padded display box adds darkened forest border (4 cells wide in expansion mode so all adjacent chunks fit)
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

  const [zoom, setZoom] = useState<number>(() =>
    isExpansionMode ? computeExpansionFitZoom(mapWidthPx, mapHeightPx) : 1.0
  );
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [hoverCoord, setHoverCoord] = useState<GridCoordinate | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const wasExpansionModeRef = useRef<boolean>(isExpansionMode);
  const savedCameraRef = useRef<{ zoom: number; pan: { x: number; y: number } } | null>(null);

  const hasMovedRef = useRef<boolean>(false);
  const dragStartRef = useRef<{
    clientX: number;
    clientY: number;
    panX: number;
    panY: number;
  } | null>(null);

  // Auto-zoom out cleanly on entering expansion mode so all adjacent candidate chunks are visible;
  // restore previous camera on exiting expansion mode.
  useEffect(() => {
    if (isExpansionMode) {
      if (!wasExpansionModeRef.current) {
        savedCameraRef.current = { zoom, pan };
        wasExpansionModeRef.current = true;
      }
      const vw = containerRef.current?.clientWidth || 360;
      const vh = containerRef.current?.clientHeight || 420;
      setPan({ x: 0, y: 0 });
      setZoom(computeExpansionFitZoom(mapWidthPx, mapHeightPx, vw, vh));
    } else if (wasExpansionModeRef.current) {
      const restored = savedCameraRef.current;
      savedCameraRef.current = null;
      wasExpansionModeRef.current = false;
      setZoom(restored?.zoom ?? 1.0);
      setPan(restored?.pan ?? { x: 0, y: 0 });
    }
    // Intentionally exclude `zoom` and `pan` so only mode/map-size transitions adjust auto-camera
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isExpansionMode, mapWidthPx, mapHeightPx]);

  const availableExpansionSlots = useMemo(
    () => (isExpansionMode ? gridMap.getAvailableExpansionSlots() : []),
    [isExpansionMode, gridMap]
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

  const activeMinZoom = isExpansionMode ? EXPANSION_MIN_ZOOM : MIN_ZOOM;

  const clampZoom = (val: number): number => {
    const clamped = Math.min(MAX_ZOOM, Math.max(activeMinZoom, val));
    return Math.round(clamped * 100) / 100;
  };

  const handleZoomIn = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setZoom((z) => clampZoom(z + ZOOM_STEP));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeMinZoom]
  );

  const handleZoomOut = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setZoom((z) => clampZoom(z - ZOOM_STEP));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeMinZoom]
  );

  const handleResetZoom = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setZoom(1.0);
  }, []);

  const handleRecenter = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setPan({ x: 0, y: 0 });
    setZoom(1.0);
  }, []);

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    hasMovedRef.current = false;
    setIsDragging(true);
    dragStartRef.current = {
      clientX: e.clientX,
      clientY: e.clientY,
      panX: pan.x,
      panY: pan.y,
    };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!dragStartRef.current) return;
    const dx = e.clientX - dragStartRef.current.clientX;
    const dy = e.clientY - dragStartRef.current.clientY;
    if (Math.hypot(dx, dy) >= DRAG_THRESHOLD_PX) {
      hasMovedRef.current = true;
    }
    if (hasMovedRef.current) {
      setPan({
        x: dragStartRef.current.panX + dx,
        y: dragStartRef.current.panY + dy,
      });
    }
  };

  const handleMouseUpOrLeave = () => {
    dragStartRef.current = null;
    setIsDragging(false);
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const delta = e.deltaY < 0 ? 0.1 : -0.1;
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
      if (isExpansionMode && !isUnlocked) {
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
      isExpansionMode,
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
        isDragging ? 'cursor-grabbing' : placementDef ? 'cursor-crosshair' : 'cursor-grab'
      }`}
    >
      {/* Interactive Pan/Zoom Stage */}
      <div
        data-testid="map-grid-stage"
        data-render-width={renderBox.width}
        data-render-height={renderBox.height}
        data-expansion-mode={isExpansionMode ? 'true' : 'false'}
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: 'center center',
          width: mapWidthPx,
          height: mapHeightPx,
        }}
        className="relative shrink-0 transition-transform duration-150 ease-out shadow-sm"
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
        {/* Base Grid Cells (Unlocked Landscape + Locked Dark Forest Margin) */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${renderBox.width}, ${CELL_SIZE}px)`,
            width: mapWidthPx,
            height: mapHeightPx,
          }}
        >
          {cells.map((cell) => (
            <GridCell
              key={`${cell.x},${cell.y}`}
              x={cell.x}
              y={cell.y}
              isUnlocked={cell.unlocked}
              isCellUnlockedFn={isCellUnlockedFn}
              isPlacementMode={Boolean(placementDef)}
              isExpansionMode={isExpansionMode}
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
              className="absolute pointer-events-none border border-emerald-500/35 dark:border-emerald-400/25"
            >
              <span className="absolute top-0.5 left-1 text-[8px] font-mono text-emerald-700/60 dark:text-emerald-300/50 tabular-nums">
                {`(${chunk.origin.x},${chunk.origin.y})`}
              </span>
            </div>
          );
        })}

        {/* Expandable Adjacent Candidate 4x4 Chunks (Expansion Mode Only) */}
        {isExpansionMode &&
          availableExpansionSlots.map((slot) => {
            const left = (slot.x - renderBox.minX) * CELL_SIZE;
            const top = (slot.y - renderBox.minY) * CELL_SIZE;
            const width = CHUNK_WIDTH * CELL_SIZE;
            const height = CHUNK_HEIGHT * CELL_SIZE;
            const isSelected =
              selectedExpansionOrigin?.x === slot.x && selectedExpansionOrigin?.y === slot.y;

            return (
              <button
                key={`expand_slot_${slot.x}_${slot.y}`}
                type="button"
                data-expansion-candidate={`${slot.x},${slot.y}`}
                aria-label={t('civ.expand.candidateAria', { x: slot.x, y: slot.y })}
                disabled={isSubmitting}
                onMouseDown={(e) => {
                  hasMovedRef.current = false;
                  e.stopPropagation();
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (hasMovedRef.current || isSubmitting) return;
                  onSelectExpansionSlot?.(slot);
                }}
                style={{ left, top, width, height }}
                className={`absolute z-20 box-border rounded-sm flex flex-col items-center justify-center gap-0.5 transition-all cursor-pointer ${
                  isSelected
                    ? 'border-2 border-amber-300 bg-amber-300/30 ring-2 ring-amber-300/80 shadow-lg text-white'
                    : 'border-2 border-emerald-300/90 bg-emerald-400/20 hover:bg-emerald-300/35 hover:border-emerald-200 animate-pulse text-emerald-50 shadow-md'
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
                if (hasMovedRef.current || isSubmitting) return;
                if (placementDef || isExpansionMode) return;
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
        className="absolute top-2 left-2 z-10 px-2 py-1 rounded-md bg-white/85 dark:bg-slate-900/85 backdrop-blur-sm border border-slate-200/80 dark:border-slate-700/80 text-[10px] font-medium text-slate-600 dark:text-slate-300 flex items-center gap-1 tabular-nums pointer-events-auto"
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
          disabled={zoom <= activeMinZoom}
          onClick={handleZoomOut}
          className="w-6 h-6 rounded flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors cursor-pointer"
        >
          <ZoomOut className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          title={t('civ.map.resetZoom')}
          onClick={handleResetZoom}
          className="px-1.5 h-6 rounded text-[10px] font-mono font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 tabular-nums transition-colors cursor-pointer"
        >
          {`${zoomPercent}%`}
        </button>

        <button
          type="button"
          title={t('civ.map.zoomIn')}
          aria-label={t('civ.map.zoomIn')}
          disabled={zoom >= MAX_ZOOM}
          onClick={handleZoomIn}
          className="w-6 h-6 rounded flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors cursor-pointer"
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </button>

        <div className="w-px h-4 bg-slate-200 dark:bg-slate-700 mx-0.5" />

        <button
          type="button"
          title={t('civ.map.recenterTitle')}
          aria-label={t('civ.map.recenterTitle')}
          onClick={handleRecenter}
          className="px-1.5 h-6 rounded inline-flex items-center gap-1 text-[10px] font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap cursor-pointer"
        >
          <RotateCcw className="w-3 h-3 shrink-0" />
          <span>{t('civ.map.recenter')}</span>
        </button>
      </div>
    </div>
  );
};
