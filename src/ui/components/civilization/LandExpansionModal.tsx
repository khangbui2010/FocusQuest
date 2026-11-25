import React from 'react';
import { X, Compass, Coins, ShieldAlert, Award, Wallet, Users } from 'lucide-react';
import { CHUNK_HEIGHT, CHUNK_WIDTH } from '../../../core/civilization/constants.ts';
import { GridCoordinate } from '../../../core/civilization/types.ts';
import {
  evaluateExpansion,
  getExpansionFocusMinuteEstimate,
} from '../../../core/civilization/landExpansion.ts';
import {
  EXPAND_JOB_SPEC,
  getTotalVillagerCount,
} from '../../../core/civilization/jobs.ts';
import { Villager } from '../../../core/civilization/villager.ts';
import { getVillagerBuffSummary } from '../../../core/civilization/villagerBuffs.ts';
import { CLOCK_TILE_INDEX, ClockTileIcon, VillagerRole } from './spriteRegistry.ts';
import { formatJobDurationMinutes } from './jobProjection.ts';
import { formatRewardAmount } from '../../utils/formatters.ts';
import { useTranslation } from '../../../i18n/I18nContext.tsx';

export interface LandExpansionModalProps {
  isOpen: boolean;
  selectedOrigin: GridCoordinate | null;
  chunksCount: number;
  playerLevel: number;
  playerCoins: number;
  villagers?: readonly Villager[];
  founderRole?: VillagerRole | null;
  onConfirm: (origin: GridCoordinate) => Promise<void>;
  onClose: () => void;
  isSubmitting?: boolean;
}

export const LandExpansionModal: React.FC<LandExpansionModalProps> = ({
  isOpen,
  selectedOrigin,
  chunksCount,
  playerLevel,
  playerCoins,
  villagers = [],
  founderRole = null,
  onConfirm,
  onClose,
  isSubmitting = false,
}) => {
  const { t } = useTranslation();

  if (!isOpen || !selectedOrigin) return null;

  const buffSummary = getVillagerBuffSummary(villagers, founderRole);
  const totalCrew = getTotalVillagerCount(villagers, founderRole);
  const evaluation = evaluateExpansion({
    chunkCount: chunksCount,
    playerLevel,
    coins: playerCoins,
    discountRate: buffSummary.expansionDiscountRate,
  });
  const addedCellsPerChunk = CHUNK_WIDTH * CHUNK_HEIGHT;
  const focusEstimate = getExpansionFocusMinuteEstimate(evaluation.cost);

  const hasEnoughLevel = playerLevel >= evaluation.requiredLevel;
  const hasEnoughCoins = playerCoins >= evaluation.cost;
  const hasEnoughCrew = totalCrew >= EXPAND_JOB_SPEC.crew;
  const clearingMinutes = formatJobDurationMinutes(EXPAND_JOB_SPEC.durationSeconds);
  const canConfirmExpand = evaluation.canExpand && hasEnoughCrew;

  const failureMessage = !evaluation.canExpand
    ? evaluation.reason === 'LEVEL_TOO_LOW'
      ? t('civ.expand.reasonLevelTooLow', {
          required: evaluation.requiredLevel,
          current: playerLevel,
        })
      : t('civ.expand.reasonInsufficientCoins', {
          cost: evaluation.cost,
          balance: formatRewardAmount(playerCoins),
        })
    : !hasEnoughCrew
    ? t('civ.expand.reasonNotEnoughVillagers', {
        required: EXPAND_JOB_SPEC.crew,
        current: totalCrew,
      })
    : null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="land-expansion-title"
      onClick={onClose}
      className="absolute inset-0 z-40 flex items-center justify-center bg-black/55 backdrop-blur-[1px] p-3"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[344px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-900/70">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <Compass className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2
                id="land-expansion-title"
                className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate"
              >
                {t('civ.expand.confirmTitle')}
              </h2>
              <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                {`(${selectedOrigin.x}, ${selectedOrigin.y})`}
              </div>
            </div>
          </div>

          <button
            type="button"
            aria-label={t('civ.expand.closeAria')}
            onClick={onClose}
            className="w-7 h-7 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center justify-center cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-3">
          {/* Chunk Purchase Summary Banner */}
          <div className="p-2.5 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-200/80 dark:border-emerald-800/60 flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-emerald-900 dark:text-emerald-200 tabular-nums">
              {t('civ.expand.chunkOrderBadge', { order: evaluation.purchaseIndex })}
            </span>
            <span className="px-2 py-0.5 rounded bg-white/90 dark:bg-slate-900/90 border border-emerald-200 dark:border-emerald-800 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 tabular-nums">
              {t('civ.expand.chunkSizeDelta', {
                added: addedCellsPerChunk,
                width: CHUNK_WIDTH,
                height: CHUNK_HEIGHT,
              })}
            </span>
          </div>

          {/* Cost, Level, Clearing Crew & Balance Breakdown */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-200/80 dark:divide-slate-800 bg-slate-50/60 dark:bg-slate-800/40 text-xs">
            {/* Cost */}
            <div className="px-3 py-2.5 flex items-start justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300 font-medium">
                <Coins className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                <span>{t('civ.expand.costLabel')}</span>
              </span>
              <div className="text-right tabular-nums">
                <div className="font-bold text-amber-700 dark:text-amber-300 flex items-center justify-end gap-1.5 flex-wrap">
                  {evaluation.discountRate > 0 && evaluation.baseCost > evaluation.cost && (
                    <>
                      <span
                        data-testid="expand-base-cost-strike"
                        className="line-through text-slate-400 dark:text-slate-500 font-normal"
                      >
                        {t('civ.expand.costValue', {
                          cost: formatRewardAmount(evaluation.baseCost),
                        })}
                      </span>
                      <span
                        data-testid="expand-discount-badge"
                        className="px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 text-[10px] font-semibold"
                      >
                        {t('civ.expand.discountBadge', {
                          rate: formatRewardAmount(evaluation.discountRate * 100),
                        })}
                      </span>
                    </>
                  )}
                  <span>
                    {t('civ.expand.costValue', { cost: formatRewardAmount(evaluation.cost) })}
                  </span>
                </div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400">
                  {t('civ.expand.equivFocus', {
                    mins1x: focusEstimate.minutesAt1x,
                    mins25x: focusEstimate.minutesAtMax25x,
                  })}
                </div>
              </div>
            </div>

            {/* Required Level */}
            <div className="px-3 py-2 flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300 font-medium">
                <Award className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                <span>{t('civ.expand.requiredLevelLabel')}</span>
              </span>
              <div className="flex items-center gap-1.5 tabular-nums">
                <span
                  className={`font-bold ${
                    hasEnoughLevel
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-rose-600 dark:text-rose-400'
                  }`}
                >
                  {t('civ.expand.levelValue', { level: evaluation.requiredLevel })}
                </span>
                <span className="text-[10px] text-slate-500 dark:text-slate-400">
                  {`(${t('civ.expand.currentLevelValue', { level: playerLevel })})`}
                </span>
              </div>
            </div>

            {/* Clearing Crew & Focus Time */}
            <div className="px-3 py-2 flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300 font-medium">
                <Users className="w-3.5 h-3.5 text-sky-500 shrink-0" />
                <span>{t('civ.expand.clearingLabel')}</span>
              </span>
              <span
                data-testid="expand-clearing-spec"
                className={`inline-flex items-center gap-1 font-semibold tabular-nums ${
                  hasEnoughCrew
                    ? 'text-slate-800 dark:text-slate-200'
                    : 'text-rose-600 dark:text-rose-400'
                }`}
              >
                <ClockTileIcon tileIndex={CLOCK_TILE_INDEX.CLOCK} size={11} />
                <span>
                  {t('civ.expand.clearingValue', {
                    crew: EXPAND_JOB_SPEC.crew,
                    minutes: clearingMinutes,
                  })}
                </span>
              </span>
            </div>

            {/* Balance */}
            <div className="px-3 py-2 flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300 font-medium">
                <Wallet className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                <span>{t('civ.expand.balanceLabel')}</span>
              </span>
              <span
                className={`font-semibold tabular-nums ${
                  hasEnoughCoins
                    ? 'text-slate-800 dark:text-slate-200'
                    : 'text-rose-600 dark:text-rose-400'
                }`}
              >
                {t('civ.expand.costValue', { cost: formatRewardAmount(playerCoins) })}
              </span>
            </div>
          </div>

          {/* Insufficient Level / Coins / Crew Banner */}
          {failureMessage && (
            <div
              role="note"
              className="px-3 py-2 rounded-lg bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800/70 text-[11px] text-rose-700 dark:text-rose-200 flex items-start gap-2"
            >
              <ShieldAlert className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              <span>{failureMessage}</span>
            </div>
          )}

          {/* Action Footer */}
          <div className="pt-1 flex items-center gap-2">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={onClose}
              className="flex-1 py-2 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 transition-colors cursor-pointer disabled:opacity-50"
            >
              {t('civ.expand.cancelBtn')}
            </button>
            <button
              type="button"
              disabled={!canConfirmExpand || isSubmitting}
              onClick={() => onConfirm(selectedOrigin)}
              className="flex-1 py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-xs font-semibold text-white disabled:text-slate-500 dark:disabled:text-slate-400 transition-colors cursor-pointer disabled:cursor-not-allowed shadow-2xs"
            >
              {isSubmitting ? t('civ.expand.confirmingBtn') : t('civ.expand.confirmBtn')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
