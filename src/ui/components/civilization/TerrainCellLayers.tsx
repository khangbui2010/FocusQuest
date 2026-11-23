import React from 'react';
import { TileImage } from './TileImage.tsx';
import {
  LOCKED_FOREST_DARKEN_OPACITY,
  LOCKED_TREE_DARKEN_FACTOR,
  computeLockedForestOpacities,
} from './terrainDecor.ts';

export interface TerrainCellLayersProps {
  baseTile: number;
  overlayTile: number | null;
  isDarkened: boolean;
  size: number;
  darkenOpacity?: number;
  treeDarkenFactor?: number;
}

/**
 * Shared terrain cell renderer used by both MapGridView and SpriteGallery (#sprites).
 * Layer order:
 *   1. Ground base tile
 *   2. (Optional ground compensation scrim ONLY if treeDarkenFactor < 1.0)
 *   3. Tree / canopy / decor overlay tile
 *   4. Top dark scrim (`bg-slate-950`) above BOTH ground and tree overlay
 */
export const TerrainCellLayers: React.FC<TerrainCellLayersProps> = ({
  baseTile,
  overlayTile,
  isDarkened,
  size,
  darkenOpacity = LOCKED_FOREST_DARKEN_OPACITY,
  treeDarkenFactor = LOCKED_TREE_DARKEN_FACTOR,
}) => {
  const hasOverlay = overlayTile !== null;
  const { groundUnderOverlayOpacity, topScrimOpacity, treeBrightnessFactor } = isDarkened
    ? computeLockedForestOpacities(hasOverlay, darkenOpacity, treeDarkenFactor)
    : { groundUnderOverlayOpacity: 0, topScrimOpacity: 0, treeBrightnessFactor: 1 };

  return (
    <>
      <TileImage
        pack="tiny-town"
        tileIndex={baseTile}
        size={size}
        className="block pointer-events-none"
      />

      {isDarkened && groundUnderOverlayOpacity > 0 && (
        <div
          aria-hidden="true"
          data-locked-ground-compensation="true"
          style={{ opacity: groundUnderOverlayOpacity }}
          className="absolute inset-0 bg-slate-950 pointer-events-none"
        />
      )}

      {overlayTile !== null && (
        <TileImage
          pack="tiny-town"
          tileIndex={overlayTile}
          size={size}
          style={
            treeBrightnessFactor !== 1
              ? { filter: `brightness(${treeBrightnessFactor})` }
              : undefined
          }
          className="absolute inset-0 block pointer-events-none"
        />
      )}

      {isDarkened && (
        <div
          aria-hidden="true"
          data-locked-forest="true"
          style={{ opacity: topScrimOpacity }}
          className="absolute inset-0 bg-slate-950 pointer-events-none"
        />
      )}
    </>
  );
};
