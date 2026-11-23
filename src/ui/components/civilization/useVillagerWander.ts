import { useEffect, useMemo, useRef, useState } from 'react';
import { BuildingInstance } from '../../../core/civilization/buildingTypes.ts';
import { GridMap } from '../../../core/civilization/gridMap.ts';
import { Villager } from '../../../core/civilization/villager.ts';
import {
  VILLAGER_WANDER_TICK_MS,
  VillagerWanderState,
  buildWanderWorld,
  createInitialWanderStates,
  pauseWanderStates,
  stepWander,
  syncWanderStates,
} from '../../../core/civilization/villagerWander.ts';

export interface UseVillagerWanderOptions {
  readonly villagers: readonly Villager[];
  readonly buildings: readonly BuildingInstance[];
  readonly gridMap: GridMap;
  readonly isPaused: boolean;
  readonly reducedMotion: boolean;
}

/**
 * UI-only hook driving villager wandering on the Map tab.
 * - Keeps all coordinates strictly in React memory (never persisted to storage).
 * - Uses a single shared 700ms interval across all villagers.
 * - Pauses automatically when `document.hidden`, during expansion/camera lock, or on reduced motion.
 */
export function useVillagerWander({
  villagers,
  buildings,
  gridMap,
  isPaused,
  reducedMotion,
}: UseVillagerWanderOptions): readonly VillagerWanderState[] {
  const world = useMemo(() => buildWanderWorld(gridMap, buildings), [gridMap, buildings]);

  const [wanderStates, setWanderStates] = useState<readonly VillagerWanderState[]>(() =>
    createInitialWanderStates(villagers, world)
  );

  const [isDocumentHidden, setIsDocumentHidden] = useState<boolean>(() =>
    typeof document !== 'undefined' ? Boolean(document.hidden) : false
  );

  const tickRef = useRef<number>(0);
  const isFirstSyncRef = useRef<boolean>(true);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const handleVisibilityChange = () => {
      setIsDocumentHidden(Boolean(document.hidden));
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    if (isFirstSyncRef.current) {
      isFirstSyncRef.current = false;
      return;
    }
    setWanderStates((prev) => syncWanderStates(prev, villagers, world, false));
  }, [villagers, world]);

  useEffect(() => {
    if (reducedMotion || isPaused || isDocumentHidden || villagers.length === 0) {
      setWanderStates((prev) => pauseWanderStates(prev));
      return;
    }

    const timerId = setInterval(() => {
      const nextTick = tickRef.current++;
      setWanderStates((prev) => stepWander(prev, world, nextTick));
    }, VILLAGER_WANDER_TICK_MS);

    return () => {
      clearInterval(timerId);
    };
  }, [reducedMotion, isPaused, isDocumentHidden, villagers.length, world]);

  const staticReducedMotionStates = useMemo<readonly VillagerWanderState[]>(() => {
    if (!reducedMotion) return [];
    return createInitialWanderStates(villagers, world).map((s) =>
      s.animation === 'idle' ? s : { ...s, animation: 'idle' as const }
    );
  }, [reducedMotion, villagers, world]);

  return reducedMotion ? staticReducedMotionStates : wanderStates;
}
