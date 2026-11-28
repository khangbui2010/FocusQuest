import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Circle,
  Compass,
  Coins,
  Crown,
  Hammer,
  Lock,
  Sparkles,
  TrendingUp,
  Users,
  X,
  Clock,
} from 'lucide-react';
import { CivilizationEra } from '../../../core/civilization/buildingTypes.ts';
import {
  EraAdvanceCheckItem,
  getEraAdvanceRequirements,
} from '../../../core/civilization/eraRules.ts';
import { EraAdvanceStatusResponseData } from '../../../types/messages.ts';
import { formatRewardAmount } from '../../utils/formatters.ts';
import { getLocalizedBuildingName, getLocalizedEraName } from '../../utils/buildingI18n.ts';
import { useTranslation } from '../../../i18n/I18nContext.tsx';
import { localizeErrorMessage, UiErrorPayload } from '../../../i18n/errorTranslator.ts';

export interface EraAdvanceModalProps {
  isOpen: boolean;
  currentEra: CivilizationEra;
  status: EraAdvanceStatusResponseData | null;
  onClose: () => void;
  onAdvanceEra: (fromEra: CivilizationEra, targetEra: CivilizationEra) => Promise<void>;
  isSubmitting?: boolean;
  error?: UiErrorPayload | null;
  successEra?: CivilizationEra | null;
  paidFeeCoins?: number | null;
}

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export const EraAdvanceModal: React.FC<EraAdvanceModalProps> = ({
  isOpen,
  currentEra,
  status,
  onClose,
  onAdvanceEra,
  isSubmitting = false,
  error = null,
  successEra = null,
  paidFeeCoins = null,
}) => {
  const { locale, t } = useTranslation();
  const [isConfirmStep, setIsConfirmStep] = useState<boolean>(false);
  const dialogPanelRef = useRef<HTMLDivElement | null>(null);
  const isConfirmInFlightRef = useRef<boolean>(false);

  useEffect(() => {
    if (!isOpen) {
      setIsConfirmStep(false);
      isConfirmInFlightRef.current = false;
    }
  }, [isOpen, currentEra]);

  useEffect(() => {
    if (!isOpen) return;
    const panel = dialogPanelRef.current;
    if (!panel || typeof panel.querySelectorAll !== 'function') return;
    const focusables = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
    if (focusables.length > 0 && typeof focusables[0].focus === 'function') {
      focusables[0].focus();
    }
  }, [isOpen, isConfirmStep, successEra]);

  if (!isOpen) return null;

  const effectiveEra = status?.currentEra ?? currentEra;
  const reqs = getEraAdvanceRequirements(effectiveEra);
  const nextEra = status?.nextEra ?? reqs?.nextEra ?? null;
  const isEnabled = Boolean(status?.enabled);
  const checks: readonly EraAdvanceCheckItem[] = status?.checks ?? [];
  const eligible = Boolean(status?.eligible);
  const feeCoins = status?.feeCoins ?? reqs?.feeCoins ?? 0;

  const currentEraLabel = getLocalizedEraName(locale, effectiveEra);
  const nextEraLabel = nextEra ? getLocalizedEraName(locale, nextEra) : '';
  const metCount = checks.filter((c) => c.met).length;
  const totalCount = checks.length;
  const progressPct = totalCount > 0 ? Math.round((metCount / totalCount) * 100) : 0;

  const resolveVillagerRoleLabel = (role: string): string => {
    switch (role) {
      case 'elder':
        return t('civ.villager.role.elder');
      case 'crafter':
        return t('civ.villager.role.crafter');
      case 'woodworker':
        return t('civ.villager.role.woodworker');
      default:
        return role;
    }
  };

  const renderCheckIcon = (id: EraAdvanceCheckItem['id']) => {
    if (id.startsWith('building:')) {
      return <Hammer className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400 shrink-0" />;
    }
    if (id.startsWith('villager:')) {
      return <Users className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />;
    }
    if (id === 'land_expansions') {
      return <Compass className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0" />;
    }
    if (id === 'player_level') {
      return <TrendingUp className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400 shrink-0" />;
    }
    if (id === 'total_focus_minutes') {
      return <Clock className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 shrink-0" />;
    }
    return <Coins className="w-3.5 h-3.5 text-amber-500 shrink-0" />;
  };

  const renderCheckLabel = (check: EraAdvanceCheckItem): string => {
    if (check.id.startsWith('building:')) {
      const defId = check.id.slice('building:'.length);
      const bReq = reqs?.buildingRequirements.find((r) => r.definitionId === defId);
      const buildingName = getLocalizedBuildingName(locale, defId);
      return t('civ.era.checkBuilding', {
        name: buildingName,
        minLevel: bReq?.minLevel ?? 1,
      });
    }
    if (check.id.startsWith('villager:')) {
      const role = check.id.slice('villager:'.length);
      return t('civ.era.checkVillager', {
        role: resolveVillagerRoleLabel(role),
      });
    }
    if (check.id === 'land_expansions') {
      return t('civ.era.checkLand');
    }
    if (check.id === 'player_level') {
      return t('civ.era.checkLevel');
    }
    if (check.id === 'total_focus_minutes') {
      return t('civ.era.checkFocus');
    }
    return t('civ.era.checkFee');
  };

  const renderCheckValue = (check: EraAdvanceCheckItem): string => {
    if (check.id === 'total_focus_minutes') {
      return t('civ.era.focusMinutesPair', {
        current: formatRewardAmount(check.current),
        required: formatRewardAmount(check.required),
      });
    }
    if (check.id === 'fee_coins') {
      return t('civ.era.coinsPair', {
        current: formatRewardAmount(check.current),
        required: formatRewardAmount(check.required),
      });
    }
    return t('civ.era.countPair', {
      current: check.current,
      required: check.required,
    });
  };

  const handleConfirmAdvance = async () => {
    if (!nextEra || !isEnabled || !eligible || isSubmitting || isConfirmInFlightRef.current) {
      return;
    }
    isConfirmInFlightRef.current = true;
    try {
      await onAdvanceEra(effectiveEra, nextEra);
    } finally {
      isConfirmInFlightRef.current = false;
    }
  };

  const handlePanelKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      if (!isSubmitting) {
        e.stopPropagation();
        onClose();
      }
      return;
    }
    if (e.key === 'Tab') {
      const panel = dialogPanelRef.current;
      if (!panel) return;
      const focusables = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  const isSuccessView = successEra !== null;
  const isAlreadyAdvancedNoNext = !isSuccessView && nextEra === null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="era-advance-modal-title"
      data-testid="era-advance-modal"
      onClick={() => {
        if (!isSubmitting) onClose();
      }}
      className="absolute inset-0 z-40 flex items-center justify-center bg-black/55 backdrop-blur-[1px] p-3"
    >
      <div
        ref={dialogPanelRef}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handlePanelKeyDown}
        className="w-full max-w-[356px] max-h-[520px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/80 dark:bg-slate-900/80 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800/60 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
              <Crown className="w-4 h-4" />
            </div>
            <h2
              id="era-advance-modal-title"
              className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate"
            >
              {t('civ.era.modalTitle')}
            </h2>
          </div>

          <button
            type="button"
            disabled={isSubmitting}
            aria-label={t('civ.era.closeAria')}
            onClick={onClose}
            className="w-7 h-7 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center justify-center cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        {isSuccessView ? (
          <div
            data-testid="era-advance-success-view"
            className="p-4 flex-1 overflow-y-auto space-y-3 text-center"
          >
            <div className="mx-auto w-11 h-11 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/70 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <Sparkles className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <h3
                data-testid="era-advance-success-heading"
                className="text-base font-bold text-emerald-800 dark:text-emerald-200"
              >
                {successEra === 'BRONZE_AGE'
                  ? t('civ.era.successBronze')
                  : t('civ.era.successGeneric', {
                      era: getLocalizedEraName(locale, successEra),
                    })}
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                {t('civ.era.successSubtext', {
                  era: getLocalizedEraName(locale, successEra),
                  cost: formatRewardAmount(paidFeeCoins ?? feeCoins),
                })}
              </p>
            </div>

            <div className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-[11px] font-medium text-slate-600 dark:text-slate-300">
              {t('civ.era.ironComingLater')}
            </div>

            <button
              type="button"
              data-testid="era-success-done-btn"
              onClick={onClose}
              className="w-full py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-colors cursor-pointer"
            >
              {t('civ.era.doneCloseBtn')}
            </button>
          </div>
        ) : isAlreadyAdvancedNoNext ? (
          <div
            data-testid="era-already-advanced-view"
            className="p-4 flex-1 overflow-y-auto space-y-3"
          >
            <div className="p-3 rounded-xl bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/70 space-y-1">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                {t('civ.era.currentLabel')}
              </div>
              <div className="text-sm font-bold text-emerald-900 dark:text-emerald-100">
                {currentEraLabel}
              </div>
              <p className="text-xs text-emerald-800/90 dark:text-emerald-200/90">
                {t('civ.era.alreadyBronzeDesc', { era: currentEraLabel })}
              </p>
            </div>

            <div
              data-testid="era-next-coming-later"
              className="px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-center gap-2 text-xs text-slate-700 dark:text-slate-200"
            >
              <Clock className="w-4 h-4 text-slate-500 shrink-0" />
              <span>{t('civ.era.ironComingLater')}</span>
            </div>
          </div>
        ) : (
          <>
            <div className="p-3.5 flex-1 overflow-y-auto space-y-3">
              {/* Era Transition Banner */}
              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-2">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <div className="min-w-0">
                    <div className="text-[10px] text-slate-500 dark:text-slate-400">
                      {t('civ.era.currentLabel')}
                    </div>
                    <div className="font-bold text-slate-900 dark:text-slate-100 truncate">
                      {currentEraLabel}
                    </div>
                  </div>
                  <span aria-hidden="true" className="text-slate-400 font-bold shrink-0">
                    →
                  </span>
                  <div className="min-w-0 text-right">
                    <div className="text-[10px] text-slate-500 dark:text-slate-400">
                      {t('civ.era.nextLabel')}
                    </div>
                    <div className="font-bold text-amber-700 dark:text-amber-300 truncate">
                      {nextEraLabel}
                    </div>
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[10px] text-slate-600 dark:text-slate-300 tabular-nums">
                    <span>{t('civ.era.checklistTitle')}</span>
                    <span className="font-semibold">
                      {t('civ.era.progressSummary', { met: metCount, total: totalCount })}
                    </span>
                  </div>
                  <div
                    role="progressbar"
                    aria-valuenow={metCount}
                    aria-valuemin={0}
                    aria-valuemax={Math.max(1, totalCount)}
                    className="h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden"
                  >
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        eligible
                          ? 'bg-emerald-600 dark:bg-emerald-500'
                          : 'bg-indigo-600 dark:bg-indigo-500'
                      }`}
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Kill-switch notice when feature switch is OFF */}
              {!isEnabled && (
                <div
                  data-testid="era-disabled-banner"
                  className="p-2.5 rounded-xl bg-amber-50/90 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/70 flex items-start gap-2 text-[11px] text-amber-900 dark:text-amber-200"
                >
                  <Lock className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                  <div className="min-w-0">
                    <div className="font-semibold">{t('civ.era.disabledNoticeTitle')}</div>
                    <div className="text-[10px] text-amber-800/90 dark:text-amber-300/90 mt-0.5 leading-snug">
                      {t('civ.era.disabledNoticeBody')}
                    </div>
                  </div>
                </div>
              )}

              {/* Requirements Checklist */}
              <div
                data-testid="era-checklist"
                className="rounded-xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-200/80 dark:divide-slate-800 bg-white dark:bg-slate-900"
              >
                {checks.map((check) => (
                  <div
                    key={check.id}
                    data-testid={`era-check-${check.id}`}
                    data-met={check.met ? 'true' : 'false'}
                    className="px-3 py-2 flex items-center justify-between gap-2 text-[11px]"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {renderCheckIcon(check.id)}
                      <span className="text-slate-800 dark:text-slate-200 font-medium truncate">
                        {renderCheckLabel(check)}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 tabular-nums">
                      <span
                        className={`font-semibold ${
                          check.met
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : 'text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {renderCheckValue(check)}
                      </span>
                      <span
                        className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold border ${
                          check.met
                            ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
                            : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {check.met ? (
                          <CheckCircle2 className="w-2.5 h-2.5 shrink-0" />
                        ) : (
                          <Circle className="w-2.5 h-2.5 shrink-0" />
                        )}
                        <span>{check.met ? t('civ.era.statusMet') : t('civ.era.statusUnmet')}</span>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Footer Actions */}
            <div className="px-3.5 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/70 space-y-2 shrink-0">
              {error && (
                <div
                  role="alert"
                  data-testid="era-advance-error"
                  className="flex items-start gap-1.5 text-[11px] text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 rounded-lg px-2.5 py-1.5"
                >
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>
                    {localizeErrorMessage(locale, error.message, error.code, error.params)}
                  </span>
                </div>
              )}

              {isConfirmStep && isEnabled && eligible && nextEra ? (
                <div
                  data-testid="era-advance-confirm-panel"
                  className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 space-y-2"
                >
                  <div className="flex items-start gap-2">
                    <Lock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <div className="text-[11px] font-bold text-amber-900 dark:text-amber-100">
                        {t('civ.era.confirmTitle')}
                      </div>
                      <p className="text-[10px] text-amber-800 dark:text-amber-200/90 mt-0.5 leading-snug">
                        {t('civ.era.confirmWarning', {
                          fromEra: currentEraLabel,
                          targetEra: nextEraLabel,
                          cost: formatRewardAmount(feeCoins),
                        })}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      data-testid="era-advance-cancel-btn"
                      disabled={isSubmitting}
                      onClick={() => setIsConfirmStep(false)}
                      className="flex-1 py-1.5 px-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-medium transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {t('civ.era.cancelBtn')}
                    </button>
                    <button
                      type="button"
                      data-testid="era-advance-confirm-btn"
                      disabled={isSubmitting}
                      onClick={() => void handleConfirmAdvance()}
                      className="flex-1 py-1.5 px-2.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isSubmitting
                        ? t('civ.era.confirmingBtn')
                        : t('civ.era.confirmBtn', { cost: formatRewardAmount(feeCoins) })}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  data-testid="era-advance-step1-btn"
                  disabled={!isEnabled || !eligible || !nextEra || isSubmitting}
                  onClick={() => setIsConfirmStep(true)}
                  className="w-full py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 dark:disabled:bg-slate-800 text-white disabled:text-slate-500 dark:disabled:text-slate-400 text-xs font-semibold transition-colors cursor-pointer disabled:cursor-not-allowed"
                >
                  {isEnabled && nextEra
                    ? t('civ.era.advanceBtn', { era: nextEraLabel })
                    : t('civ.era.disabledBtn')}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
