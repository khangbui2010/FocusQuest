import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Trash2,
  MapPin,
  ArrowUpCircle,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import {
  BuildingInstance,
  CivilizationEra,
} from '../../../core/civilization/buildingTypes.ts';
import { getBuildingDefinition } from '../../../core/civilization/buildingCatalog.ts';
import {
  calculateBuildingDemolishRefund,
  evaluateBuildingUpgrade,
} from '../../../core/civilization/buildingUpgrade.ts';
import {
  VILLAGER_COMPLETE_TRIBE_COIN_BONUS,
  VILLAGER_CRAFTER_COIN_BONUS_CAP,
  VILLAGER_CRAFTER_COIN_BONUS_RATE,
  VILLAGER_ELDER_UPGRADE_DISCOUNT_CAP,
  VILLAGER_ELDER_UPGRADE_DISCOUNT_RATE,
  VILLAGER_WOODWORKER_EXPANSION_DISCOUNT_CAP,
  VILLAGER_WOODWORKER_EXPANSION_DISCOUNT_RATE,
} from '../../../core/civilization/constants.ts';
import { getEffectiveMaxLevel } from '../../../core/civilization/eraRules.ts';
import { getVillagerBuffSummary } from '../../../core/civilization/villagerBuffs.ts';
import {
  ConstructionJob,
  getPlaceJobForBuilding,
  getTotalVillagerCount,
  getUpgradeJobSpec,
  getUpgradeJobsForBuilding,
} from '../../../core/civilization/jobs.ts';
import {
  VILLAGE_CAVE_DEFINITION_ID,
  Villager,
  evaluateRecruitment,
  getVillagerCapacity,
} from '../../../core/civilization/villager.ts';
import { renderBuildingIcon } from './BuildingCatalogPanel.tsx';
import {
  CLOCK_TILE_INDEX,
  ClockTileIcon,
  PixelSprite,
  VILLAGER_ROLES,
  VillagerRole,
  VillagerSprite,
  getBuildingSprite,
  getConstructionSprite,
} from './spriteRegistry.ts';
import {
  formatJobCountdown,
  formatJobDurationMinutes,
  getCancelJobRefundPreview,
} from './jobProjection.ts';
import { formatRewardAmount } from '../../utils/formatters.ts';
import {
  getLocalizedBuildingDescription,
  getLocalizedBuildingName,
} from '../../utils/buildingI18n.ts';
import { useTranslation } from '../../../i18n/I18nContext.tsx';
import { localizeErrorMessage, UiErrorPayload } from '../../../i18n/errorTranslator.ts';
import { prefersReducedMotion } from './expansionReveal.ts';

export interface BuildingDetailsModalProps {
  building: BuildingInstance | null;
  onClose: () => void;
  onRemove: (instanceId: string) => Promise<void>;
  onUpgrade?: (instanceId: string, expectedLevel: number) => Promise<void>;
  onRecruitVillager?: (role: VillagerRole) => Promise<void>;
  onCancelJob?: (jobId: string) => Promise<void>;
  jobs?: readonly ConstructionJob[];
  villagers?: readonly Villager[];
  founderRole?: VillagerRole | null;
  playerLevel?: number;
  playerCoins?: number;
  currentEra?: CivilizationEra;
  upgradeError?: UiErrorPayload | null;
  upgradeSuccessLevel?: number | null;
  recruitError?: UiErrorPayload | null;
  recruitSuccessRole?: VillagerRole | null;
  isSubmitting?: boolean;
}

export const BuildingDetailsModal: React.FC<BuildingDetailsModalProps> = ({
  building,
  onClose,
  onRemove,
  onUpgrade,
  onRecruitVillager,
  onCancelJob,
  jobs = [],
  villagers = [],
  founderRole = null,
  playerLevel = 1,
  playerCoins = 0,
  currentEra = 'STONE_AGE',
  upgradeError = null,
  upgradeSuccessLevel = null,
  recruitError = null,
  recruitSuccessRole = null,
  isSubmitting = false,
}) => {
  const { locale, t } = useTranslation();
  const [confirmDemolish, setConfirmDemolish] = useState(false);
  const [confirmCancelBuild, setConfirmCancelBuild] = useState(false);
  const [cancellingJobId, setCancellingJobId] = useState<string | null>(null);
  const [inFlightBuildingId, setInFlightBuildingId] = useState<string | null>(null);
  const inFlightLockRef = useRef<string | null>(null);
  const cancelJobLockRef = useRef<string | null>(null);
  const [selectedRole, setSelectedRole] = useState<VillagerRole>('elder');
  const [isRecruitInFlight, setIsRecruitInFlight] = useState(false);
  const recruitLockRef = useRef<boolean>(false);

  useEffect(() => {
    setConfirmDemolish(false);
    setConfirmCancelBuild(false);
    setCancellingJobId(null);
    cancelJobLockRef.current = null;
    setInFlightBuildingId(null);
    inFlightLockRef.current = null;
    setIsRecruitInFlight(false);
    recruitLockRef.current = false;
  }, [building?.id]);

  if (!building) return null;

  const def = getBuildingDefinition(building.definitionId);
  const placeJob = getPlaceJobForBuilding(building.id, jobs);
  const upgradeJobs = getUpgradeJobsForBuilding(building.id, jobs);
  const baseSprite = getBuildingSprite(building.definitionId);
  const constructionSprite = placeJob
    ? getConstructionSprite(building.definitionId, placeJob.remainingSeconds, placeJob.totalSeconds)
    : null;
  const sprite = constructionSprite ?? baseSprite;
  const thumbScale = sprite
    ? sprite.width === 16 && sprite.height === 16
      ? 2
      : sprite.height > 32
      ? 36 / sprite.height
      : 1
    : 1;
  const name = getLocalizedBuildingName(
    locale,
    def ?? building.definitionId,
    def?.name ?? building.definitionId
  );
  const description = def
    ? getLocalizedBuildingDescription(locale, def, def.description)
    : '';
  const maxLevel = def ? getEffectiveMaxLevel(def, currentEra) : 1;
  const footprintLabel = def ? `${def.footprint.width}×${def.footprint.height}` : '1×1';
  const placedDate = new Date(building.placedAt).toISOString().slice(0, 10);

  const coinBonusEffect = def?.effects.find((e) => e.type === 'COIN_BONUS');
  const activeBonusPercent =
    coinBonusEffect && coinBonusEffect.type === 'COIN_BONUS'
      ? formatRewardAmount(coinBonusEffect.rate * building.level * 100)
      : null;

  const buffSummary = getVillagerBuffSummary(villagers, founderRole);
  const totalCrew = getTotalVillagerCount(villagers, founderRole);
  const upgradeEval = evaluateBuildingUpgrade({
    instance: building,
    definition: def,
    currentEra,
    playerLevel,
    playerCoins,
    upgradeDiscountRate: buffSummary.upgradeDiscountRate,
    jobs,
    totalVillagers: totalCrew,
  });
  const nextUpgradeSpec = getUpgradeJobSpec(upgradeEval.currentLevel);

  const isCave = def?.id === VILLAGE_CAVE_DEFINITION_ID;
  const caveCapacity = isCave ? getVillagerCapacity(building) : 0;
  const currentVillagerCount = villagers.length;
  const isUpgradeBusy = isSubmitting || inFlightBuildingId === building.id;
  const isCancellingAnyJob = cancellingJobId !== null;
  const isAnyBusy = isUpgradeBusy || isRecruitInFlight || isCancellingAnyJob;
  const canTriggerUpgrade = Boolean(onUpgrade) && upgradeEval.canUpgrade && !isAnyBusy;
  const demolishRefund = calculateBuildingDemolishRefund(def, building.level, {
    placeJob,
    upgradeJobs,
  });
  const canDemolish = !(isCave && currentVillagerCount > 0);
  const reducedMotion = prefersReducedMotion();
  const showUpgradeSuccess = upgradeSuccessLevel === building.level;

  const recruitEval = isCave
    ? evaluateRecruitment({
        caveBuilding: placeJob ? undefined : building,
        villagers,
        founderRole,
        playerCoins,
        role: selectedRole,
      })
    : null;
  const canTriggerRecruit =
    isCave &&
    !placeJob &&
    Boolean(onRecruitVillager) &&
    Boolean(recruitEval?.canRecruit) &&
    !isAnyBusy;

  const handleUpgradeClick = async () => {
    if (!onUpgrade || !upgradeEval.canUpgrade || isAnyBusy) return;
    if (inFlightLockRef.current === building.id) return;

    inFlightLockRef.current = building.id;
    setInFlightBuildingId(building.id);
    try {
      await onUpgrade(building.id, upgradeEval.currentLevel);
    } finally {
      if (inFlightLockRef.current === building.id) {
        inFlightLockRef.current = null;
      }
      setInFlightBuildingId(null);
    }
  };

  const handleRecruitClick = async () => {
    if (!isCave || placeJob || !onRecruitVillager || !recruitEval?.canRecruit || isAnyBusy) return;
    if (recruitLockRef.current) return;

    recruitLockRef.current = true;
    setIsRecruitInFlight(true);
    try {
      await onRecruitVillager(selectedRole);
    } finally {
      recruitLockRef.current = false;
      setIsRecruitInFlight(false);
    }
  };

  const handleCancelJobClick = async (jobId: string) => {
    if (!onCancelJob || isAnyBusy) return;
    if (cancelJobLockRef.current === jobId) return;
    cancelJobLockRef.current = jobId;
    setCancellingJobId(jobId);
    try {
      await onCancelJob(jobId);
      setConfirmCancelBuild(false);
    } finally {
      if (cancelJobLockRef.current === jobId) {
        cancelJobLockRef.current = null;
      }
      setCancellingJobId(null);
    }
  };

  const formattedUpgradeCost = formatRewardAmount(upgradeEval.cost);
  let upgradeBtnLabel = t('civ.details.upgradeBtn');
  if (!upgradeEval.isCategoryUpgradeable) {
    upgradeBtnLabel = t('civ.details.upgradeFixedBadge');
  } else if (upgradeEval.reason === 'BUILDING_UNDER_CONSTRUCTION') {
    upgradeBtnLabel = t('civ.job.pendingShort');
  } else if (upgradeEval.reason === 'BUILDING_MAX_LEVEL') {
    upgradeBtnLabel = t('civ.details.upgradeMaxBadge');
  } else if (isUpgradeBusy) {
    upgradeBtnLabel = t('civ.details.upgradingBtn');
  } else if (upgradeEval.reason === 'PLAYER_LEVEL_REQUIRED') {
    upgradeBtnLabel = t('civ.details.upgradeNeedLevelShort', {
      required: upgradeEval.requiredPlayerLevel,
    });
  } else if (upgradeEval.reason === 'NOT_ENOUGH_VILLAGERS') {
    upgradeBtnLabel = t('civ.details.upgradeNeedVillagersShort', {
      required: nextUpgradeSpec.crew,
    });
  } else if (upgradeEval.reason === 'INSUFFICIENT_COINS') {
    upgradeBtnLabel = t('civ.catalog.needCoins', {
      cost: formattedUpgradeCost,
    });
  }

  const placeRefundPreview = placeJob ? getCancelJobRefundPreview(placeJob, jobs) : null;
  const placePercent = placeJob
    ? Math.max(
        0,
        Math.min(
          100,
          Math.floor(
            ((placeJob.totalSeconds - placeJob.remainingSeconds) / Math.max(1, placeJob.totalSeconds)) *
              100
          )
        )
      )
    : 0;
  const formattedPlaceRefund = placeRefundPreview
    ? formatRewardAmount(placeRefundPreview.refundCoins)
    : '0';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="building-details-title"
      onClick={onClose}
      className="absolute inset-0 z-40 flex items-center justify-center bg-black/55 backdrop-blur-[1px] p-3"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[340px] max-h-[90%] flex flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/60 dark:bg-slate-900/60 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className={`w-11 h-11 rounded-lg border flex items-center justify-center shrink-0 overflow-hidden ${
                sprite
                  ? 'bg-[#84c669]/25 dark:bg-slate-800 border-[#65a556]/40 dark:border-slate-700'
                  : 'bg-indigo-50 dark:bg-indigo-950/60 border-indigo-200 dark:border-indigo-800/60 text-indigo-600 dark:text-indigo-400'
              }`}
            >
              {sprite ? (
                <PixelSprite
                  sprite={sprite}
                  width={Math.round(sprite.width * thumbScale)}
                  height={Math.round(sprite.height * thumbScale)}
                />
              ) : (
                renderBuildingIcon(def?.iconIdentifier ?? '', 'w-4 h-4')
              )}
            </div>
            <div className="min-w-0">
              <h2
                id="building-details-title"
                className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate"
              >
                {name}
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                {t('civ.details.subtitle', {
                  level: building.level,
                  maxLevel,
                  footprint: footprintLabel,
                })}
              </p>
            </div>
          </div>

          <button
            type="button"
            aria-label={t('civ.details.closeAria')}
            onClick={onClose}
            className="w-7 h-7 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center justify-center cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-3 text-xs overflow-y-auto flex-1 min-h-0">
          {description && (
            <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
              {description}
            </p>
          )}

          {/* Coordinates & Metadata */}
          <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/80 space-y-1.5 text-[11px]">
            <div className="flex items-center justify-between">
              <span className="text-slate-500 dark:text-slate-400 inline-flex items-center gap-1">
                <MapPin className="w-3 h-3 shrink-0" />
                <span>{t('civ.details.anchorPosition')}</span>
              </span>
              <span className="font-mono font-semibold text-slate-800 dark:text-slate-200 tabular-nums">
                {`(${building.position.x}, ${building.position.y})`}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-500 dark:text-slate-400">{t('civ.details.footprint')}</span>
              <span className="font-mono text-slate-800 dark:text-slate-200 tabular-nums">
                {t('civ.details.footprintCells', { footprint: footprintLabel })}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-500 dark:text-slate-400">{t('civ.details.builtOn')}</span>
              <span className="font-mono text-slate-800 dark:text-slate-200 tabular-nums">
                {placedDate}
              </span>
            </div>
          </div>

          {/* Under Construction Banner (Milestone 5E-1) */}
          {placeJob && placeRefundPreview && (
            <div
              data-testid="building-under-construction-section"
              className="p-2.5 rounded-xl border border-sky-300/80 dark:border-sky-800/70 bg-sky-50/70 dark:bg-sky-950/30 space-y-2 text-[11px]"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 font-semibold text-sky-900 dark:text-sky-200">
                  <ClockTileIcon
                    tileIndex={
                      placeJob.status === 'ACTIVE'
                        ? CLOCK_TILE_INDEX.CLOCK
                        : CLOCK_TILE_INDEX.HOURGLASS
                    }
                    size={14}
                  />
                  <span>{t('civ.details.underConstructionTitle')}</span>
                </span>
                <span className="font-mono font-semibold text-sky-800 dark:text-sky-300 tabular-nums">
                  {placeJob.status === 'ACTIVE'
                    ? formatJobCountdown(placeJob.remainingSeconds)
                    : t('civ.job.pendingShort')}
                </span>
              </div>

              <p className="text-[10px] text-sky-800/90 dark:text-sky-300/90 leading-snug">
                {t('civ.details.underConstructionDesc', { crew: placeJob.crewRequired })}
              </p>

              <div className="text-[10px] font-medium text-sky-900 dark:text-sky-200 tabular-nums">
                {placeJob.status === 'ACTIVE'
                  ? t('civ.details.constructionProgress', {
                      percent: placePercent,
                      time: formatJobCountdown(placeJob.remainingSeconds),
                    })
                  : t('civ.details.constructionPendingNote', { crew: placeJob.crewRequired })}
              </div>

              {onCancelJob &&
                (!confirmCancelBuild ? (
                  <button
                    type="button"
                    data-testid="cancel-build-job-btn"
                    disabled={isAnyBusy}
                    onClick={() => setConfirmCancelBuild(true)}
                    className="w-full py-1.5 px-2.5 inline-flex items-center justify-center gap-1.5 text-[11px] font-semibold text-rose-600 dark:text-rose-400 bg-white dark:bg-slate-900 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <Trash2 className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      {t('civ.details.cancelBuildBtn', { refund: formattedPlaceRefund })}
                    </span>
                  </button>
                ) : (
                  <div className="space-y-1.5 p-2 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60">
                    <div className="text-[10px] text-rose-700 dark:text-rose-300 leading-snug">
                      {t('civ.details.cancelBuildConfirm', {
                        refund: formattedPlaceRefund,
                        percent: placeRefundPreview.isUnstarted ? '100' : '50',
                      })}
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        disabled={isAnyBusy}
                        onClick={() => setConfirmCancelBuild(false)}
                        className="py-1 px-2 text-[10px] font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded cursor-pointer"
                      >
                        {t('civ.details.cancelBtn')}
                      </button>
                      <button
                        type="button"
                        data-testid="confirm-cancel-build-job-btn"
                        disabled={isAnyBusy}
                        onClick={() => void handleCancelJobClick(placeJob.id)}
                        className="py-1 px-2 text-[10px] font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded cursor-pointer disabled:opacity-50"
                      >
                        {t('civ.details.confirmCancelJobBtn')}
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          )}

          {/* Active Effect */}
          {!placeJob && (
            <div className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-[11px]">
              <div className="font-semibold text-slate-800 dark:text-slate-200 mb-0.5">
                {t('civ.details.activeEffectTitle')}
              </div>
              {isCave ? (
                <p className="text-indigo-700 dark:text-indigo-400">
                  {t('civ.details.effectCaveSupport', { capacity: caveCapacity })}
                </p>
              ) : activeBonusPercent ? (
                <p className="text-emerald-700 dark:text-emerald-400">
                  {t('civ.details.effectCoinBonus', { percent: activeBonusPercent })}
                </p>
              ) : def?.category === 'FOCUS_SUPPORT' ? (
                <p className="text-indigo-700 dark:text-indigo-400">
                  {t('civ.details.effectFocusSupport')}
                </p>
              ) : (
                <p className="text-slate-500 dark:text-slate-400">
                  {t('civ.details.effectDecor')}
                </p>
              )}
            </div>
          )}

          {/* Village & Villager Recruitment (Meditation Cave V2) */}
          {isCave && !placeJob && recruitEval && (
            <div
              data-testid="cave-village-section"
              className="p-2.5 rounded-xl border border-indigo-200/80 dark:border-indigo-800/60 bg-indigo-50/40 dark:bg-indigo-950/20 space-y-2"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="text-[11px] font-semibold text-slate-800 dark:text-slate-200">
                  {t('civ.details.villageTitle')}
                </div>
                <span
                  data-testid="cave-capacity-counter"
                  className="text-[11px] font-semibold text-indigo-700 dark:text-indigo-300 tabular-nums"
                >
                  {t('civ.details.villageCapacityCounter', {
                    current: currentVillagerCount,
                    capacity: caveCapacity,
                  })}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-1.5">
                {VILLAGER_ROLES.map((role) => {
                  const roleLabel = t(`civ.villager.role.${role}`);
                  const isSelected = selectedRole === role;
                  return (
                    <button
                      key={role}
                      type="button"
                      data-testid={`recruit-role-${role}`}
                      aria-label={t('civ.details.selectRoleAria', { role: roleLabel })}
                      aria-pressed={isSelected}
                      onClick={() => setSelectedRole(role)}
                      className={`p-1.5 rounded-lg border flex flex-col items-center gap-1 transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-indigo-100/90 dark:bg-indigo-900/50 border-indigo-500 text-indigo-900 dark:text-indigo-100 shadow-2xs'
                          : 'bg-white dark:bg-slate-800/70 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-indigo-300'
                      }`}
                    >
                      <VillagerSprite
                        role={role}
                        animation="idle"
                        scale={2}
                        reducedMotion={true}
                      />
                      <span className="text-[10px] font-medium truncate max-w-full">
                        {roleLabel}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div
                data-testid="selected-role-buff-preview"
                className="text-[10px] text-indigo-700 dark:text-indigo-300 bg-white/80 dark:bg-slate-900/50 border border-indigo-200/70 dark:border-indigo-800/50 rounded-lg px-2 py-1"
              >
                {selectedRole === 'elder'
                  ? t('civ.details.roleBuff.elder', {
                      rate: Math.round(VILLAGER_ELDER_UPGRADE_DISCOUNT_RATE * 100),
                      cap: Math.round(VILLAGER_ELDER_UPGRADE_DISCOUNT_CAP * 100),
                    })
                  : selectedRole === 'crafter'
                  ? t('civ.details.roleBuff.crafter', {
                      rate: Math.round(VILLAGER_CRAFTER_COIN_BONUS_RATE * 100),
                      cap: Math.round(VILLAGER_CRAFTER_COIN_BONUS_CAP * 100),
                    })
                  : t('civ.details.roleBuff.woodworker', {
                      rate: Math.round(VILLAGER_WOODWORKER_EXPANSION_DISCOUNT_RATE * 100),
                      cap: Math.round(VILLAGER_WOODWORKER_EXPANSION_DISCOUNT_CAP * 100),
                    })}
              </div>

              <div className="flex items-center justify-between gap-2 pt-0.5">
                <div className="min-w-0 text-[10px]">
                  {recruitEval.reason === 'CIV_VILLAGER_CAPACITY_REACHED' ? (
                    <span
                      data-testid="recruit-capacity-full-hint"
                      className="text-amber-700 dark:text-amber-400 font-medium leading-snug block"
                    >
                      {t('civ.details.recruitFullHint')}
                    </span>
                  ) : recruitEval.reason === 'CIV_VILLAGER_INSUFFICIENT_COINS' ? (
                    <span className="text-rose-600 dark:text-rose-400 font-medium tabular-nums">
                      {t('civ.details.recruitNeedCoins', {
                        cost: formatRewardAmount(recruitEval.cost),
                        shortfall: formatRewardAmount(recruitEval.shortfallCoins ?? 0),
                      })}
                    </span>
                  ) : (
                    <span className="text-slate-600 dark:text-slate-300 tabular-nums">
                      {t('civ.details.recruitCostLabel', {
                        cost: formatRewardAmount(recruitEval.cost),
                      })}
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  data-testid="recruit-villager-btn"
                  disabled={!canTriggerRecruit}
                  onClick={handleRecruitClick}
                  className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold rounded-md whitespace-nowrap shrink-0 transition-colors ${
                    canTriggerRecruit
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 border border-slate-200 dark:border-slate-700 cursor-not-allowed'
                  }`}
                >
                  <span>
                    {isRecruitInFlight
                      ? t('civ.details.recruitingBtn')
                      : recruitEval.reason === 'CIV_VILLAGER_CAPACITY_REACHED'
                      ? t('civ.details.recruitFullBtn')
                      : t('civ.details.recruitBtn', {
                          cost: formatRewardAmount(recruitEval.cost),
                        })}
                  </span>
                </button>
              </div>

              {recruitSuccessRole && (
                <div
                  data-testid="recruit-villager-success"
                  className={`flex items-center gap-1 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300 ${
                    reducedMotion ? '' : 'animate-pulse'
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    {t('civ.details.recruitSuccess', {
                      role: t(`civ.villager.role.${recruitSuccessRole}`),
                    })}
                  </span>
                </div>
              )}

              {recruitError && (
                <div
                  role="alert"
                  data-testid="recruit-villager-error"
                  className="flex items-start gap-1.5 text-[10px] text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 rounded-lg px-2 py-1"
                >
                  <AlertCircle className="w-3 h-3 shrink-0 mt-0.5" />
                  <span>
                    {localizeErrorMessage(
                      locale,
                      recruitError.message,
                      recruitError.code,
                      recruitError.params
                    )}
                  </span>
                </div>
              )}

              <div
                data-testid="villager-buff-summary"
                className="p-2 rounded-lg bg-white/90 dark:bg-slate-900/60 border border-indigo-200/70 dark:border-indigo-800/50 space-y-1 text-[10px] tabular-nums"
              >
                <div className="font-semibold text-slate-800 dark:text-slate-200">
                  {t('civ.details.buffSummaryTitle')}
                </div>
                <div className="flex items-center justify-between gap-2 text-slate-700 dark:text-slate-300">
                  <span>
                    {t('civ.details.buffCrafterRow', {
                      count: buffSummary.counts.crafter,
                      bonus: formatRewardAmount(buffSummary.crafterCoinBonus * 100),
                    })}
                  </span>
                  {buffSummary.crafterAtCap && (
                    <span className="px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 font-semibold">
                      {t('civ.details.buffCapBadge')}
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between gap-2 text-slate-700 dark:text-slate-300">
                  <span>
                    {t('civ.details.buffWoodworkerRow', {
                      count: buffSummary.counts.woodworker,
                      discount: formatRewardAmount(buffSummary.expansionDiscountRate * 100),
                    })}
                  </span>
                  {buffSummary.expansionAtCap && (
                    <span className="px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 font-semibold">
                      {t('civ.details.buffCapBadge')}
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between gap-2 text-slate-700 dark:text-slate-300">
                  <span>
                    {t('civ.details.buffElderRow', {
                      count: buffSummary.counts.elder,
                      discount: formatRewardAmount(buffSummary.upgradeDiscountRate * 100),
                    })}
                  </span>
                  {buffSummary.upgradeAtCap && (
                    <span className="px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 font-semibold">
                      {t('civ.details.buffCapBadge')}
                    </span>
                  )}
                </div>
                <div
                  className={
                    buffSummary.hasCompleteTribe
                      ? 'font-semibold text-emerald-700 dark:text-emerald-300 pt-0.5'
                      : 'text-slate-500 dark:text-slate-400 pt-0.5'
                  }
                >
                  {buffSummary.hasCompleteTribe
                    ? t('civ.details.buffTribeActive', {
                        bonus: formatRewardAmount(VILLAGER_COMPLETE_TRIBE_COIN_BONUS * 100),
                      })
                    : t('civ.details.buffTribeInactive', {
                        bonus: formatRewardAmount(VILLAGER_COMPLETE_TRIBE_COIN_BONUS * 100),
                      })}
                </div>
              </div>
            </div>
          )}

          {/* Queued Upgrades (Milestone 5E-1) */}
          {upgradeJobs.length > 0 && (
            <div
              data-testid="building-upgrade-queue-section"
              className="p-2.5 rounded-xl border border-indigo-200/80 dark:border-indigo-800/60 bg-indigo-50/40 dark:bg-indigo-950/20 space-y-1.5"
            >
              <div className="text-[11px] font-semibold text-slate-800 dark:text-slate-200">
                {t('civ.details.upgradeQueueTitle')}
              </div>
              <div className="space-y-1">
                {upgradeJobs.map((uJob) => {
                  const toLevel = uJob.targetLevel ?? building.level + 1;
                  const fromLevel = toLevel - 1;
                  const isActive = uJob.status === 'ACTIVE';
                  const preview = getCancelJobRefundPreview(uJob, jobs);
                  const previewRefund = formatRewardAmount(preview.refundCoins);
                  const formattedCountdown = formatJobCountdown(uJob.remainingSeconds);

                  return (
                    <div
                      key={uJob.id}
                      data-testid={`upgrade-job-row-${uJob.id}`}
                      className="flex items-center justify-between gap-2 p-1.5 rounded-lg bg-white/90 dark:bg-slate-900/60 border border-indigo-200/70 dark:border-indigo-800/50 text-[10px]"
                    >
                      <div className="min-w-0">
                        <div className="inline-flex items-center gap-1 font-semibold text-slate-800 dark:text-slate-200 font-mono tabular-nums">
                          <ClockTileIcon
                            tileIndex={
                              isActive ? CLOCK_TILE_INDEX.CLOCK : CLOCK_TILE_INDEX.HOURGLASS
                            }
                            size={11}
                          />
                          <span>
                            {isActive
                              ? t('civ.details.upgradeJobRowActive', {
                                  from: fromLevel,
                                  to: toLevel,
                                  time: formattedCountdown,
                                })
                              : t('civ.details.upgradeJobRowPending', {
                                  from: fromLevel,
                                  to: toLevel,
                                })}
                          </span>
                        </div>
                        <div className="text-[9px] text-slate-500 dark:text-slate-400 tabular-nums">
                          {t('civ.details.cancelUpgradeHint', {
                            level: toLevel,
                            refund: previewRefund,
                          })}
                        </div>
                      </div>

                      {onCancelJob && (
                        <button
                          type="button"
                          data-testid={`cancel-upgrade-job-${uJob.id}`}
                          disabled={isAnyBusy}
                          onClick={() => void handleCancelJobClick(uJob.id)}
                          className="px-2 py-1 text-[10px] font-semibold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/30 hover:bg-rose-100 dark:hover:bg-rose-950/50 border border-rose-200 dark:border-rose-900/60 rounded whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
                        >
                          {t('civ.details.cancelUpgradeBtn')}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Upgrade Section (Milestone 5C-1 + 5E-1 Queue/Crew) */}
          <div
            data-testid="building-upgrade-section"
            className={`p-2.5 rounded-xl border space-y-1.5 ${
              showUpgradeSuccess
                ? 'bg-emerald-50/80 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-700'
                : 'bg-slate-50/70 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[11px] font-semibold text-slate-800 dark:text-slate-200">
                  {t('civ.details.upgradeTitle')}
                </div>

                {!upgradeEval.isCategoryUpgradeable ? (
                  <div className="text-[10px] text-slate-500 dark:text-slate-400">
                    {t('civ.details.upgradeNonUpgradeable')}
                  </div>
                ) : upgradeEval.reason === 'BUILDING_UNDER_CONSTRUCTION' ? (
                  <div className="text-[10px] text-sky-700 dark:text-sky-400 font-medium">
                    {t('civ.details.upgradeUnderConstruction')}
                  </div>
                ) : upgradeEval.reason === 'BUILDING_MAX_LEVEL' ? (
                  <div className="text-[10px] text-emerald-700 dark:text-emerald-400 font-medium">
                    {t('civ.details.upgradeMax')}
                  </div>
                ) : (
                  <div className="space-y-0.5 text-[10px] tabular-nums">
                    <div className="text-slate-600 dark:text-slate-300 flex items-center gap-1.5 flex-wrap">
                      <span>
                        {t('civ.details.upgradeNext', {
                          level: upgradeEval.nextLevel ?? upgradeEval.currentLevel + 1,
                          cost: formattedUpgradeCost,
                        })}
                      </span>
                      {upgradeEval.discountRate > 0 && upgradeEval.baseCost > upgradeEval.cost && (
                        <>
                          <span
                            data-testid="upgrade-base-cost-strike"
                            className="line-through text-slate-400 dark:text-slate-500"
                          >
                            {formatRewardAmount(upgradeEval.baseCost)}
                          </span>
                          <span
                            data-testid="upgrade-discount-badge"
                            className="px-1 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 font-semibold"
                          >
                            {t('civ.details.upgradeDiscountBadge', {
                              rate: formatRewardAmount(upgradeEval.discountRate * 100),
                            })}
                          </span>
                        </>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 tabular-nums">
                      {t('civ.details.upgradeDurationCrew', {
                        crew: nextUpgradeSpec.crew,
                        minutes: formatJobDurationMinutes(nextUpgradeSpec.durationSeconds),
                      })}
                    </div>
                    {upgradeEval.nextCoinBonusRate > upgradeEval.currentCoinBonusRate && (
                      <div className="text-emerald-700 dark:text-emerald-400 font-medium">
                        {t('civ.details.upgradeBonusPreview', {
                          current: formatRewardAmount(upgradeEval.currentCoinBonusRate * 100),
                          next: formatRewardAmount(upgradeEval.nextCoinBonusRate * 100),
                        })}
                      </div>
                    )}
                    {isCave && (
                      <div
                        data-testid="cave-upgrade-capacity-preview"
                        className="text-indigo-700 dark:text-indigo-400 font-medium"
                      >
                        {t('civ.details.upgradeCaveCapacityPreview', {
                          current: caveCapacity,
                          next: getVillagerCapacity({
                            level: upgradeEval.nextLevel ?? upgradeEval.currentLevel + 1,
                          }),
                        })}
                      </div>
                    )}
                    {upgradeEval.reason === 'PLAYER_LEVEL_REQUIRED' && (
                      <div className="text-amber-600 dark:text-amber-400 font-medium">
                        {t('civ.details.upgradeNeedLevel', {
                          required: upgradeEval.requiredPlayerLevel,
                        })}
                      </div>
                    )}
                    {upgradeEval.reason === 'NOT_ENOUGH_VILLAGERS' && (
                      <div className="text-amber-600 dark:text-amber-400 font-medium">
                        {t('civ.details.upgradeNeedVillagers', {
                          required: nextUpgradeSpec.crew,
                          current: totalCrew,
                        })}
                      </div>
                    )}
                    {upgradeEval.reason === 'INSUFFICIENT_COINS' &&
                      upgradeEval.shortfallCoins > 0 && (
                        <div className="text-rose-600 dark:text-rose-400 font-medium">
                          {t('civ.details.upgradeNeedCoins', {
                            shortfall: formatRewardAmount(upgradeEval.shortfallCoins),
                          })}
                        </div>
                      )}
                  </div>
                )}
              </div>

              <button
                type="button"
                data-testid="building-upgrade-btn"
                disabled={!canTriggerUpgrade}
                onClick={handleUpgradeClick}
                className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold rounded-md whitespace-nowrap shrink-0 transition-colors ${
                  canTriggerUpgrade
                    ? 'bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 border border-slate-200 dark:border-slate-700 cursor-not-allowed'
                }`}
              >
                <ArrowUpCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{upgradeBtnLabel}</span>
              </button>
            </div>

            {showUpgradeSuccess && (
              <div
                data-testid="building-upgrade-success"
                className={`flex items-center gap-1 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300 ${
                  reducedMotion ? '' : 'animate-pulse'
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <span>{t('civ.details.upgradeSuccess', { level: building.level })}</span>
              </div>
            )}

            {upgradeError && (
              <div
                role="alert"
                data-testid="building-upgrade-error"
                className="flex items-start gap-1.5 text-[10px] text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 rounded-lg px-2 py-1"
              >
                <AlertCircle className="w-3 h-3 shrink-0 mt-0.5" />
                <span>
                  {localizeErrorMessage(
                    locale,
                    upgradeError.message,
                    upgradeError.code,
                    upgradeError.params
                  )}
                </span>
              </div>
            )}
          </div>

          {/* Demolish Action */}
          {!placeJob && (
            <div className="pt-1 border-t border-slate-200 dark:border-slate-800 space-y-1.5">
              {isCave && !canDemolish && (
                <div
                  data-testid="demolish-blocked-villagers-hint"
                  className="text-[10px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 rounded-lg px-2 py-1"
                >
                  {t('civ.details.demolishBlockedVillagers', { count: currentVillagerCount })}
                </div>
              )}
              {!confirmDemolish ? (
                <button
                  type="button"
                  data-testid="building-demolish-btn"
                  disabled={isAnyBusy || !canDemolish}
                  onClick={() => {
                    if (!canDemolish) return;
                    setConfirmDemolish(true);
                  }}
                  className="w-full py-2 px-3 inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/30 hover:bg-rose-100 dark:hover:bg-rose-950/50 border border-rose-200 dark:border-rose-900/60 rounded-xl transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Trash2 className="w-3.5 h-3.5 shrink-0" />
                  <span>{t('civ.details.demolishBtn')}</span>
                </button>
              ) : (
                <div className="space-y-2 p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/60">
                  <div className="flex items-start gap-1.5 text-[11px] text-rose-700 dark:text-rose-300">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>
                      {t('civ.details.demolishWarning', {
                        name,
                        refund: formatRewardAmount(demolishRefund),
                      })}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={isAnyBusy}
                      onClick={() => setConfirmDemolish(false)}
                      className="py-1.5 px-3 text-[11px] font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                    >
                      {t('civ.details.cancelBtn')}
                    </button>
                    <button
                      type="button"
                      disabled={isAnyBusy || !canDemolish}
                      onClick={() => {
                        if (!canDemolish) return;
                        void onRemove(building.id);
                      }}
                      className="py-1.5 px-3 text-[11px] font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isAnyBusy ? t('civ.details.removingBtn') : t('civ.details.confirmDemolishBtn')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
