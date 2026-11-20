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
import { renderBuildingIcon } from './BuildingCatalogPanel.tsx';
import { PixelSprite, getBuildingSprite } from './spriteRegistry.ts';
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
  playerLevel?: number;
  playerCoins?: number;
  currentEra?: CivilizationEra;
  upgradeError?: UiErrorPayload | null;
  upgradeSuccessLevel?: number | null;
  isSubmitting?: boolean;
}

export const BuildingDetailsModal: React.FC<BuildingDetailsModalProps> = ({
  building,
  onClose,
  onRemove,
  onUpgrade,
  playerLevel = 1,
  playerCoins = 0,
  currentEra = 'STONE_AGE',
  upgradeError = null,
  upgradeSuccessLevel = null,
  isSubmitting = false,
}) => {
  const { locale, t } = useTranslation();
  const [confirmDemolish, setConfirmDemolish] = useState(false);
  const [inFlightBuildingId, setInFlightBuildingId] = useState<string | null>(null);
  const inFlightLockRef = useRef<string | null>(null);

  useEffect(() => {
    setConfirmDemolish(false);
    setInFlightBuildingId(null);
    inFlightLockRef.current = null;
  }, [building?.id]);

  if (!building) return null;

  const def = getBuildingDefinition(building.definitionId);
  const sprite = getBuildingSprite(building.definitionId);
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
  const maxLevel = def?.maxLevel ?? 1;
  const footprintLabel = def ? `${def.footprint.width}×${def.footprint.height}` : '1×1';
  const placedDate = new Date(building.placedAt).toISOString().slice(0, 10);

  const coinBonusEffect = def?.effects.find((e) => e.type === 'COIN_BONUS');
  const activeBonusPercent =
    coinBonusEffect && coinBonusEffect.type === 'COIN_BONUS'
      ? formatRewardAmount(coinBonusEffect.rate * building.level * 100)
      : null;

  const upgradeEval = evaluateBuildingUpgrade({
    instance: building,
    definition: def,
    currentEra,
    playerLevel,
    playerCoins,
  });

  const isUpgradeBusy = isSubmitting || inFlightBuildingId === building.id;
  const canTriggerUpgrade = Boolean(onUpgrade) && upgradeEval.canUpgrade && !isUpgradeBusy;
  const demolishRefund = calculateBuildingDemolishRefund(def, building.level);
  const reducedMotion = prefersReducedMotion();
  const showUpgradeSuccess = upgradeSuccessLevel === building.level;

  const handleUpgradeClick = async () => {
    if (!onUpgrade || !upgradeEval.canUpgrade || isSubmitting) return;
    if (inFlightLockRef.current === building.id) return;

    inFlightLockRef.current = building.id;
    setInFlightBuildingId(building.id);
    try {
      await onUpgrade(building.id, building.level);
    } finally {
      if (inFlightLockRef.current === building.id) {
        inFlightLockRef.current = null;
      }
      setInFlightBuildingId(null);
    }
  };

  let upgradeBtnLabel = t('civ.details.upgradeBtn');
  if (!upgradeEval.isCategoryUpgradeable) {
    upgradeBtnLabel = t('civ.details.upgradeFixedBadge');
  } else if (upgradeEval.reason === 'BUILDING_MAX_LEVEL') {
    upgradeBtnLabel = t('civ.details.upgradeMaxBadge');
  } else if (isUpgradeBusy) {
    upgradeBtnLabel = t('civ.details.upgradingBtn');
  } else if (upgradeEval.reason === 'PLAYER_LEVEL_REQUIRED') {
    upgradeBtnLabel = t('civ.details.upgradeNeedLevelShort', {
      required: upgradeEval.requiredPlayerLevel,
    });
  } else if (upgradeEval.reason === 'INSUFFICIENT_COINS') {
    upgradeBtnLabel = t('civ.catalog.needCoins', {
      cost: formatRewardAmount(upgradeEval.cost),
    });
  }

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
        className="w-full max-w-[356px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/60 dark:bg-slate-900/60">
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
        <div className="p-4 space-y-3 text-xs">
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

          {/* Active Effect */}
          <div className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-[11px]">
            <div className="font-semibold text-slate-800 dark:text-slate-200 mb-0.5">
              {t('civ.details.activeEffectTitle')}
            </div>
            {activeBonusPercent ? (
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

          {/* Upgrade Section (Milestone 5C-1) */}
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
                ) : upgradeEval.reason === 'BUILDING_MAX_LEVEL' ? (
                  <div className="text-[10px] text-emerald-700 dark:text-emerald-400 font-medium">
                    {t('civ.details.upgradeMax')}
                  </div>
                ) : (
                  <div className="space-y-0.5 text-[10px] tabular-nums">
                    <div className="text-slate-600 dark:text-slate-300">
                      {t('civ.details.upgradeNext', {
                        level: upgradeEval.nextLevel ?? building.level + 1,
                        cost: formatRewardAmount(upgradeEval.cost),
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
                    {upgradeEval.reason === 'PLAYER_LEVEL_REQUIRED' && (
                      <div className="text-amber-600 dark:text-amber-400 font-medium">
                        {t('civ.details.upgradeNeedLevel', {
                          required: upgradeEval.requiredPlayerLevel,
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
          <div className="pt-1 border-t border-slate-200 dark:border-slate-800">
            {!confirmDemolish ? (
              <button
                type="button"
                disabled={isUpgradeBusy}
                onClick={() => setConfirmDemolish(true)}
                className="w-full py-2 px-3 inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/30 hover:bg-rose-100 dark:hover:bg-rose-950/50 border border-rose-200 dark:border-rose-900/60 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
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
                    disabled={isUpgradeBusy}
                    onClick={() => setConfirmDemolish(false)}
                    className="py-1.5 px-3 text-[11px] font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                  >
                    {t('civ.details.cancelBtn')}
                  </button>
                  <button
                    type="button"
                    disabled={isUpgradeBusy}
                    onClick={() => onRemove(building.id)}
                    className="py-1.5 px-3 text-[11px] font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {isUpgradeBusy ? t('civ.details.removingBtn') : t('civ.details.confirmDemolishBtn')}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
