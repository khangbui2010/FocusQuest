import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  LOCKED_FOREST_DARKEN_OPACITY,
  LOCKED_TREE_DARKEN_FACTOR,
  TERRAIN_DECOR_SEED,
} from './terrainDecor.ts';
import {
  buildTerrainBitmapPlan,
  getCachedTinyTownTileSheet,
  loadTinyTownTileSheet,
  renderTerrainBitmapIfNeeded,
} from './terrainBitmapRenderer.ts';

export interface TerrainBitmapCanvasProps {
  minX: number;
  minY: number;
  cols: number;
  rows: number;
  cellSize: number;
  isCellUnlocked: (cx: number, cy: number) => boolean;
  seed?: number;
  darkenOpacity?: number;
  treeDarkenFactor?: number;
  testId?: string;
  className?: string;
}

type SheetState = 'loading' | 'loaded' | 'error';

/**
 * Renders an entire rectangular terrain region into ONE crisp pixel-aligned <canvas>
 * element (`image-rendering: pixelated`) so adjacent tiles share a continuous raster
 * texture with zero sub-pixel seams across any DPR, zoom, pan, or animation.
 */
export const TerrainBitmapCanvas: React.FC<TerrainBitmapCanvasProps> = ({
  minX,
  minY,
  cols,
  rows,
  cellSize,
  isCellUnlocked,
  seed = TERRAIN_DECOR_SEED,
  darkenOpacity = LOCKED_FOREST_DARKEN_OPACITY,
  treeDarkenFactor = LOCKED_TREE_DARKEN_FACTOR,
  testId = 'map-terrain-bitmap',
  className = '',
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lastRenderSignatureRef = useRef<string | null>(null);

  const [sheetState, setSheetState] = useState<SheetState>(() =>
    getCachedTinyTownTileSheet() ? 'loaded' : 'loading'
  );

  useEffect(() => {
    const cached = getCachedTinyTownTileSheet();
    if (cached) {
      setSheetState('loaded');
      return;
    }

    let cancelled = false;
    loadTinyTownTileSheet().then((result) => {
      if (cancelled) return;
      setSheetState(result.status === 'loaded' ? 'loaded' : 'error');
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const plan = useMemo(
    () =>
      buildTerrainBitmapPlan({
        minX,
        minY,
        cols,
        rows,
        seed,
        darkenOpacity,
        treeDarkenFactor,
        isCellUnlocked,
      }),
    [minX, minY, cols, rows, seed, darkenOpacity, treeDarkenFactor, isCellUnlocked]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const tileSheet = sheetState === 'loaded' ? getCachedTinyTownTileSheet() : null;
    const result = renderTerrainBitmapIfNeeded(
      ctx,
      plan,
      tileSheet,
      lastRenderSignatureRef.current
    );
    lastRenderSignatureRef.current = result.renderSignature;
  }, [plan, sheetState]);

  const cssWidth = cols * cellSize;
  const cssHeight = rows * cellSize;

  return (
    <canvas
      ref={canvasRef}
      data-testid={testId}
      data-terrain-key={plan.contentKey}
      data-bitmap-width={plan.bitmapWidth}
      data-bitmap-height={plan.bitmapHeight}
      data-sheet-state={sheetState}
      width={plan.bitmapWidth}
      height={plan.bitmapHeight}
      aria-hidden="true"
      style={{
        width: cssWidth,
        height: cssHeight,
        imageRendering: 'pixelated',
      }}
      className={className}
    />
  );
};
