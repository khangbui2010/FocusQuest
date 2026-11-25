import React, { useMemo } from 'react';
import { Hammer, MapPin } from 'lucide-react';
import { CivilizationState } from '../../core/civilization/civilizationState.ts';
import {
  ConstructionJob,
  MAX_ACTIVE_CONSTRUCTION_JOBS,
  assignJobsWithSchedule,
  assignVillagersToActiveJobs,
  getTotalVillagerCount,
} from '../../core/civilization/jobs.ts';
import { useTranslation } from '../../i18n/I18nContext.tsx';
import { SupportedLocale } from '../../i18n/types.ts';
import { getLocalizedBuildingName } from '../utils/buildingI18n.ts';
import { formatJobCountdown } from './civilization/jobProjection.ts';
import {
  PixelSprite,
  TileImage,
  VillagerSprite,
  VillagerRole,
  getBuildingSprite,
  getConstructionSprite,
} from './civilization/spriteRegistry.ts';
import { REUSED_TINY_TOWN_TILES } from './civilization/spriteData.ts';

export interface FocusJobAssignmentCardProps {
  readonly civilizationState: Partial<CivilizationState> | null | undefined;
  readonly autoMode: boolean;
  readonly selectedJobIds: readonly string[];
  readonly autoContinue: boolean;
  readonly disabled?: boolean;
  readonly onToggleAutoMode: (nextAuto: boolean) => void;
  readonly onToggleJob: (jobId: string) => void;
  readonly onToggleAutoContinue: (nextAutoContinue: boolean) => void;
  readonly onNavigateToMap?: () => void;
}

function getLocalizedRoleShort(
  role: VillagerRole,
  t: (key:
    | 'civ.villager.role.elder'
    | 'civ.villager.role.crafter'
    | 'civ.villager.role.woodworker'
  ) => string
): string {
  switch (role) {
    case 'elder':
      return t('civ.villager.role.elder');
    case 'crafter':
      return t('civ.villager.role.crafter');
    case 'woodworker':
      return t('civ.villager.role.woodworker');
  }
}

export function getLocalizedJobLabel(
  job: ConstructionJob,
  civState: Partial<CivilizationState> | null | undefined,
  locale: SupportedLocale,
  t: (
    key:
      | 'timer.scene.jobPlaceLabel'
      | 'timer.scene.jobUpgradeLabel'
      | 'timer.scene.jobExpandLabel',
    params?: Record<string, string | number>
  ) => string
): string {
  if (job.kind === 'expand') {
    return t('timer.scene.jobExpandLabel');
  }
  const buildings = Array.isArray(civState?.buildings) ? civState.buildings : [];
  const defId =
    job.definitionId ??
    (job.buildingId
      ? buildings.find((b) => b.id === job.buildingId)?.definitionId
      : undefined);
  const name = getLocalizedBuildingName(locale, defId);
  if (job.kind === 'upgrade') {
    return t('timer.scene.jobUpgradeLabel', {
      name,
      level: job.targetLevel ?? 2,
    });
  }
  return t('timer.scene.jobPlaceLabel', { name });
}

export const FocusJobAssignmentCard: React.FC<FocusJobAssignmentCardProps> = ({
  civilizationState,
  autoMode,
  selectedJobIds,
  autoContinue,
  disabled = false,
  onToggleAutoMode,
  onToggleJob,
  onToggleAutoContinue,
  onNavigateToMap,
}) => {
  const { locale, t } = useTranslation();
  const jobs = Array.isArray(civilizationState?.jobs) ? civilizationState.jobs : [];
  const villagers = Array.isArray(civilizationState?.villagers)
    ? civilizationState.villagers
    : [];
  const founderRole = civilizationState?.founderRole ?? null;
  const buildings = Array.isArray(civilizationState?.buildings)
    ? civilizationState.buildings
    : [];
  const totalCrew = getTotalVillagerCount(villagers, founderRole);

  // Compute lowest pending/active upgrade level per building to guard sequential upgrade order
  const lowestUpgradeLevelByBuilding = useMemo(() => {
    const map = new Map<string, number>();
    for (const job of jobs) {
      if (job.kind === 'upgrade' && job.buildingId && typeof job.targetLevel === 'number') {
        const prev = map.get(job.buildingId);
        if (prev === undefined || job.targetLevel < prev) {
          map.set(job.buildingId, job.targetLevel);
        }
      }
    }
    return map;
  }, [jobs]);

  const effectiveSchedule = useMemo(() => {
    const scheduleOpts = autoMode
      ? undefined
      : { priorityJobIds: selectedJobIds, autoContinue: false };
    return assignJobsWithSchedule(jobs, totalCrew, scheduleOpts);
  }, [jobs, totalCrew, autoMode, selectedJobIds]);

  const effectiveSelectedSet = useMemo(() => {
    if (autoMode) {
      return new Set(
        effectiveSchedule.jobs.filter((j) => j.status === 'ACTIVE').map((j) => j.id)
      );
    }
    const validIds = new Set(jobs.map((j) => j.id));
    return new Set(selectedJobIds.filter((id) => validIds.has(id)));
  }, [autoMode, effectiveSchedule.jobs, jobs, selectedJobIds]);

  const previewAssignedJobs = useMemo(
    () =>
      jobs.map((job) => ({
        ...job,
        status: effectiveSelectedSet.has(job.id) ? ('ACTIVE' as const) : ('PENDING' as const),
      })),
    [jobs, effectiveSelectedSet]
  );

  const crewAllocation = useMemo(
    () => assignVillagersToActiveJobs(previewAssignedJobs, villagers, founderRole),
    [previewAssignedJobs, villagers, founderRole]
  );

  const usedCrew = useMemo(() => {
    let sum = 0;
    for (const job of jobs) {
      if (effectiveSelectedSet.has(job.id)) {
        sum += Math.max(0, job.crewRequired);
      }
    }
    return sum;
  }, [jobs, effectiveSelectedSet]);

  const selectedCount = effectiveSelectedSet.size;
  const freeCrewCount = Math.max(0, totalCrew - usedCrew);

  const allPoolVillagers = useMemo(() => {
    const assigned = crewAllocation.assignments.flatMap((a) =>
      a.villagers.map((v) => ({ villager: v, isAssigned: true }))
    );
    const idle = crewAllocation.idleVillagers.map((v) => ({ villager: v, isAssigned: false }));
    return [...assigned, ...idle];
  }, [crewAllocation]);

  return (
    <section
      data-testid="focus-job-assignment-card"
      className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 rounded-xl p-2.5 space-y-2"
    >
      {/* Header row */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <Hammer className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
          <span className="text-xs font-semibold text-slate-800 dark:text-slate-100 truncate">
            {t('timer.jobs.title')}
          </span>
          <span
            data-testid="job-assign-crew-counter"
            className="px-1.5 py-0.5 rounded bg-slate-200/80 dark:bg-slate-700/80 text-[10px] font-mono font-semibold text-slate-700 dark:text-slate-200 tabular-nums shrink-0"
          >
            {t('timer.jobs.crewCount', { used: usedCrew, total: totalCrew })}
          </span>
        </div>

        {jobs.length > 0 && (
          <button
            type="button"
            data-testid="job-assign-auto-toggle"
            aria-label={t('timer.jobs.autoAria')}
            aria-pressed={autoMode}
            disabled={disabled}
            onClick={() => onToggleAutoMode(!autoMode)}
            className={`px-2 py-0.5 rounded-md border text-[11px] font-semibold transition-colors cursor-pointer disabled:opacity-50 ${
              autoMode
                ? 'bg-indigo-600 border-indigo-600 text-white shadow-2xs'
                : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            {t('timer.jobs.autoLabel')}
          </button>
        )}
      </div>

      {/* Empty queue state */}
      {jobs.length === 0 ? (
        <div
          data-testid="job-assign-empty"
          className="flex items-center justify-between gap-2 py-1 px-1 text-[11px] text-slate-500 dark:text-slate-400"
        >
          <span className="truncate">{t('timer.jobs.emptyTitle')}</span>
          {onNavigateToMap && (
            <button
              type="button"
              data-testid="job-assign-go-map-btn"
              onClick={onNavigateToMap}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-indigo-600 dark:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 text-[11px] font-medium shrink-0 cursor-pointer"
            >
              <MapPin className="w-3 h-3 shrink-0" />
              <span>{t('timer.jobs.goToMapBtn')}</span>
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Compact Real Villager Roster */}
          {allPoolVillagers.length > 0 && (
            <div
              data-testid="job-assign-villager-strip"
              className="flex items-center justify-between gap-2 px-1.5 py-1 rounded-lg bg-white/80 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-700/60"
            >
              <div className="flex items-center gap-1 flex-wrap min-w-0">
                {allPoolVillagers.slice(0, 8).map(({ villager, isAssigned }) => (
                  <div
                    key={villager.id}
                    data-testid={`job-assign-villager-${villager.id}`}
                    data-assigned={isAssigned ? 'true' : 'false'}
                    title={getLocalizedRoleShort(villager.role, t)}
                    className={`inline-flex items-center gap-0.5 px-1 py-0.5 rounded border text-[9px] leading-none ${
                      isAssigned
                        ? 'border-emerald-300 dark:border-emerald-700 bg-emerald-50/90 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200'
                        : 'border-slate-200 dark:border-slate-700 bg-slate-100/80 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 opacity-75'
                    }`}
                  >
                    <VillagerSprite
                      role={villager.role}
                      animation="idle"
                      scale={1}
                      reducedMotion
                    />
                  </div>
                ))}
              </div>
              <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400 shrink-0 tabular-nums">
                {t('timer.jobs.freeVillagers', { count: freeCrewCount })}
              </span>
            </div>
          )}

          {/* Job List */}
          <div
            data-testid="job-assign-list"
            className="max-h-[132px] overflow-y-auto space-y-1 pr-0.5"
          >
            {jobs.map((job) => {
              const isSelected = effectiveSelectedSet.has(job.id);
              const defId =
                job.definitionId ??
                (job.buildingId
                  ? buildings.find((b) => b.id === job.buildingId)?.definitionId
                  : undefined);
              const label = getLocalizedJobLabel(job, civilizationState, locale, t);

              const lowestTarget =
                job.kind === 'upgrade' && job.buildingId
                  ? lowestUpgradeLevelByBuilding.get(job.buildingId)
                  : undefined;
              const isSequentialLocked =
                job.kind === 'upgrade' &&
                lowestTarget !== undefined &&
                job.targetLevel !== lowestTarget;
              const isMaxSlotsBlocked =
                !isSelected && selectedCount >= MAX_ACTIVE_CONSTRUCTION_JOBS;
              const isCrewBlocked =
                !isSelected && usedCrew + job.crewRequired > totalCrew;
              const isItemDisabled =
                disabled || (!autoMode && (isSequentialLocked || isMaxSlotsBlocked || isCrewBlocked));

              const sprite =
                job.kind === 'place' && defId
                  ? getConstructionSprite(defId, job.remainingSeconds, job.totalSeconds)
                  : defId
                  ? getBuildingSprite(defId)
                  : null;

              let lockReason: string | null = null;
              if (!isSelected) {
                if (isSequentialLocked && typeof job.targetLevel === 'number') {
                  lockReason = t('timer.jobs.sequentialLock', { prev: job.targetLevel - 1 });
                } else if (isCrewBlocked) {
                  lockReason = t('timer.jobs.needMoreCrew', { crew: job.crewRequired });
                } else if (isMaxSlotsBlocked) {
                  lockReason = t('timer.jobs.maxSlotsReached');
                }
              }

              return (
                <label
                  key={job.id}
                  data-testid={`job-assign-item-${job.id}`}
                  data-selected={isSelected ? 'true' : 'false'}
                  data-locked={!autoMode && Boolean(lockReason) ? 'true' : 'false'}
                  className={`flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg border text-[11px] transition-colors ${
                    isSelected
                      ? 'bg-white dark:bg-slate-900 border-emerald-300 dark:border-emerald-700/80 shadow-2xs'
                      : 'bg-white/70 dark:bg-slate-900/40 border-slate-200/80 dark:border-slate-700/60'
                  } ${
                    !autoMode && Boolean(lockReason)
                      ? 'opacity-50 cursor-not-allowed'
                      : 'cursor-pointer hover:border-slate-300 dark:hover:border-slate-600'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <input
                      type="checkbox"
                      data-testid={`job-assign-checkbox-${job.id}`}
                      aria-label={t('timer.jobs.selectJobAria', { label })}
                      checked={isSelected}
                      disabled={isItemDisabled}
                      onChange={() => onToggleJob(job.id)}
                      className="w-3.5 h-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 shrink-0 cursor-pointer disabled:cursor-not-allowed"
                    />
                    <span className="w-5 h-5 flex items-center justify-center shrink-0">
                      {job.kind === 'expand' ? (
                        <TileImage
                          pack="tiny-town"
                          tileIndex={REUSED_TINY_TOWN_TILES.TREE_ROUND_GREEN}
                          size={18}
                        />
                      ) : sprite ? (
                        <PixelSprite sprite={sprite} width={18} height={18} />
                      ) : (
                        <Hammer className="w-3.5 h-3.5 text-slate-500" />
                      )}
                    </span>
                    <div className="min-w-0 leading-tight">
                      <div className="font-medium text-slate-800 dark:text-slate-100 truncate">
                        {label}
                      </div>
                      <div className="flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400">
                        <span>{t('timer.jobs.itemCrew', { crew: job.crewRequired })}</span>
                        <span>·</span>
                        <span className="font-mono tabular-nums">
                          {formatJobCountdown(job.remainingSeconds)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0 ${
                      !autoMode && lockReason
                        ? 'bg-slate-200/80 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                        : isSelected
                        ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {!autoMode && lockReason
                      ? lockReason
                      : isSelected
                      ? t('timer.jobs.statusActive')
                      : t('timer.jobs.statusPending')}
                  </span>
                </label>
              );
            })}
          </div>

          {/* Auto-continue queued option when Auto mode is OFF */}
          {!autoMode && (
            <label
              data-testid="job-assign-auto-continue-row"
              title={t('timer.jobs.autoContinueHint')}
              className="flex items-center gap-2 pt-0.5 px-0.5 text-[11px] text-slate-600 dark:text-slate-300 cursor-pointer select-none"
            >
              <input
                type="checkbox"
                data-testid="job-assign-auto-continue"
                checked={autoContinue}
                disabled={disabled}
                onChange={(e) => onToggleAutoContinue(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 shrink-0 cursor-pointer"
              />
              <span className="leading-tight">{t('timer.jobs.autoContinueLabel')}</span>
            </label>
          )}
        </>
      )}
    </section>
  );
};
