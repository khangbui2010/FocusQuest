/**
 * Single source of truth for pixel grid scale between MapGridView and FocusSceneArea.
 *
 * Map grid cells are 16 native sprite pixels multiplied by MAP_RENDER_MULTIPLIER (2 -> 32px).
 * A Stone Age villager occupies 1×1 grid cell (height === 1 cell), while buildings and trees
 * occupy footprint.width × footprint.height grid cells so villager:building proportions stay
 * strictly identical on both Map and Focus work scenes.
 */

import { getBuildingDefinition } from '../../../core/civilization/buildingCatalog.ts';
import { ConstructionJobKind } from '../../../core/civilization/jobs.ts';

export const NATIVE_TILE_PX = 16;
export const MAP_RENDER_MULTIPLIER = 2;
export const MAP_CELL_PX = NATIVE_TILE_PX * MAP_RENDER_MULTIPLIER;
export const VILLAGER_HEIGHT_CELLS = 1;

export interface GridFootprint {
  readonly width: number;
  readonly height: number;
}

export const WORK_SUBJECT_EXPAND_FOOTPRINT: GridFootprint = Object.freeze({
  width: 1,
  height: 1,
});

export interface WorkSubSceneLayout {
  readonly uniformScale: number;
  readonly cellPx: number;
  readonly villagerSizePx: number;
  readonly subjectWidthPx: number;
  readonly subjectHeightPx: number;
  readonly toolSizePx: number;
  readonly gapPx: number;
}

export function getWorkSubjectFootprint(
  kind: ConstructionJobKind,
  definitionId?: string
): GridFootprint {
  if (kind === 'expand') {
    return WORK_SUBJECT_EXPAND_FOOTPRINT;
  }
  if (definitionId) {
    const def = getBuildingDefinition(definitionId);
    if (def) {
      return {
        width: def.footprint.width,
        height: def.footprint.height,
      };
    }
  }
  return { width: 1, height: 1 };
}

/**
 * Computes ONE uniform integer/half-integer pixel multiplier per sub-scene so the villager
 * (1 cell) and subject (footprint.width × footprint.height cells) always share exact Map proportions
 * while fitting comfortably inside the 1/2/3/4 Focus work grid inside the 400px popup.
 */
export function computeWorkSubSceneLayout(params: {
  readonly jobCount: number;
  readonly subjectFootprint: GridFootprint;
}): WorkSubSceneLayout {
  const { jobCount, subjectFootprint } = params;
  const maxDim = Math.max(subjectFootprint.width, subjectFootprint.height);

  let uniformScale: number;
  if (jobCount <= 2 && maxDim <= 2) {
    // Full Map scale (2× -> 32px/cell) for 1×1 and 2×2 subjects in 1- or 2-job view
    uniformScale = MAP_RENDER_MULTIPLIER;
  } else if (jobCount === 1 && maxDim >= 3) {
    // Single-job large 2×3 / 3×3 building: crisp 1.5× (24px/cell -> Cave = 72×72, Villager = 24×24)
    uniformScale = 1.5;
  } else {
    // 3–4 sub-scenes or 2×2/3×3 alongside another job: crisp 1× (16px/cell -> Cave = 48×48, Villager = 16×16)
    uniformScale = 1;
  }

  const cellPx = NATIVE_TILE_PX * uniformScale;
  const villagerSizePx = cellPx * VILLAGER_HEIGHT_CELLS;
  const subjectWidthPx = subjectFootprint.width * cellPx;
  const subjectHeightPx = subjectFootprint.height * cellPx;
  const toolSizePx = Math.max(12, Math.round(villagerSizePx * 0.72));
  const gapPx = Math.max(2, Math.round(cellPx * 0.125));

  return {
    uniformScale,
    cellPx,
    villagerSizePx,
    subjectWidthPx,
    subjectHeightPx,
    toolSizePx,
    gapPx,
  };
}
