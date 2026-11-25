import {
  getAllBuildingDefinitions,
  getBuildingDefinition,
} from '../../core/civilization/buildingCatalog.ts';
import {
  BuildingDefinition,
  BuildingInstance,
} from '../../core/civilization/buildingTypes.ts';
import {
  ConstructionJob,
  isBuildingUnderConstruction,
} from '../../core/civilization/jobs.ts';

export const STREAK_ANALYSIS_STAT_ID = 'focus_metric_streak_analysis';

export function hasFocusStatUnlock(
  buildings: readonly BuildingInstance[] | null | undefined,
  statId: string,
  jobs?: readonly ConstructionJob[] | null
): boolean {
  if (!Array.isArray(buildings) || typeof statId !== 'string' || statId.length === 0) {
    return false;
  }

  return buildings.some((instance) => {
    if (!instance || typeof instance.definitionId !== 'string') {
      return false;
    }
    if (isBuildingUnderConstruction(instance.id, jobs)) {
      return false;
    }
    const def = getBuildingDefinition(instance.definitionId);
    if (!def) {
      return false;
    }
    return def.effects.some(
      (effect) => effect.type === 'FOCUS_STAT_UNLOCK' && effect.statId === statId
    );
  });
}

export function getUnlockingBuildingDefinition(
  statId: string
): BuildingDefinition | undefined {
  if (typeof statId !== 'string' || statId.length === 0) {
    return undefined;
  }
  return getAllBuildingDefinitions().find((def) =>
    def.effects.some(
      (effect) => effect.type === 'FOCUS_STAT_UNLOCK' && effect.statId === statId
    )
  );
}
