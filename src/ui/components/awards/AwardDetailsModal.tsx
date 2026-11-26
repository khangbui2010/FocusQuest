import React, { useEffect } from 'react';
import { CheckCircle2, Lock, X } from 'lucide-react';
import { AwardViewModel } from '../../../types/awards.ts';
import { useTranslation } from '../../../i18n/I18nContext.tsx';
import { TranslationKey } from '../../../i18n/types.ts';
import { AwardIcon } from './AwardIcon.tsx';
import {
  formatAwardMetricValue,
  formatAwardUnlockDate,
  getAwardEffectiveLevel,
  getAwardLevelDisplay,
  isSingleLevelAward,
} from './awardFormatting.ts';

export interface AwardDetailsModalProps {
  award: AwardViewModel | null;
  onClose: () => void;
}

export const AwardDetailsModal: React.FC<AwardDetailsModalProps> = ({ award, onClose }) => {
  const { t, locale } = useTranslation();

  useEffect(() => {
    if (!award || typeof window === 'undefined') return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [award, onClose]);

  if (!award) {
    return null;
  }

  const title = t(award.titleKey as TranslationKey);
  const description = t(award.descriptionKey as TranslationKey);
  const effectiveLevel = getAwardEffectiveLevel(award);
  const singleLevel = isSingleLevelAward(award);
  const levelDisplay = getAwardLevelDisplay(award, t);
  const currentProgressText = formatAwardMetricValue(award.unit, award.currentMetric, t);

  return (
    <div
      data-testid="award-details-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby={`award-modal-title-${award.id}`}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-950/55 backdrop-blur-[1px]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[360px] max-h-[500px] flex flex-col rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2.5 px-4 py-3 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-start gap-2.5 min-w-0">
            <AwardIcon
              icon={award.icon}
              unlocked={effectiveLevel > 0}
              level={effectiveLevel}
              isSingleLevel={singleLevel}
              showLevelTag={!singleLevel}
              size={28}
            />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                <span>{levelDisplay}</span>
                {award.isMaxed && !singleLevel && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="font-semibold text-emerald-700 dark:text-emerald-300">
                      {t('awards.maxedBadge')}
                    </span>
                  </>
                )}
              </div>
              <h3
                id={`award-modal-title-${award.id}`}
                className="text-sm font-bold text-slate-900 dark:text-slate-100 leading-snug"
              >
                {title}
              </h3>
            </div>
          </div>

          <button
            type="button"
            data-testid="award-details-close"
            aria-label={t('awards.modal.closeAria')}
            onClick={onClose}
            className="p-1.5 rounded-md text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            {description}
          </p>

          <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 text-xs">
            <span className="font-medium text-slate-600 dark:text-slate-400">
              {t('awards.modal.currentProgress')}
            </span>
            <span className="font-mono tabular-nums font-bold text-slate-900 dark:text-slate-100">
              {currentProgressText}
            </span>
          </div>

          <div className="space-y-1.5">
            <h4 className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              {t('awards.modal.tiersHeading')}
            </h4>
            <ul className="space-y-1.5">
              {award.tiers.map((tier) => {
                const targetLabel = formatAwardMetricValue(award.unit, tier.threshold, t);
                const remaining = Math.max(0, tier.threshold - award.currentMetric);
                const remainingLabel =
                  award.unit === 'boolean'
                    ? t('awards.unit.booleanPending')
                    : t('awards.modal.lockedRemaining', {
                        remaining: formatAwardMetricValue(award.unit, remaining, t),
                      });

                return (
                  <li
                    key={tier.tier}
                    data-testid={`award-modal-tier-${tier.tier}`}
                    data-tier-unlocked={tier.unlocked ? 'true' : 'false'}
                    className={`flex items-center justify-between gap-2.5 px-3 py-2 rounded-lg border text-xs ${
                      tier.unlocked
                        ? 'bg-emerald-50/70 dark:bg-emerald-950/25 border-emerald-300/80 dark:border-emerald-700/70'
                        : 'bg-slate-50/80 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700/70'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {tier.unlocked ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      ) : (
                        <Lock className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 shrink-0" />
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 font-semibold text-slate-900 dark:text-slate-100">
                          <span>
                            {singleLevel
                              ? tier.unlocked
                                ? t('awards.singleAchieved')
                                : t('awards.singleNotAchieved')
                              : t('awards.levelBadge', { level: tier.tier })}
                          </span>
                          <span aria-hidden="true" className="text-slate-400">
                            ·
                          </span>
                          <span className="font-mono tabular-nums text-slate-700 dark:text-slate-200">
                            {targetLabel}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          {tier.unlocked && tier.unlockedAt !== null
                            ? t('awards.modal.unlockedOn', {
                                date: formatAwardUnlockDate(tier.unlockedAt, locale),
                              })
                            : remainingLabel}
                        </p>
                      </div>
                    </div>

                    <span
                      className={`text-[11px] font-semibold whitespace-nowrap shrink-0 ${
                        tier.unlocked
                          ? 'text-emerald-700 dark:text-emerald-300'
                          : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {tier.unlocked
                        ? t('awards.modal.unlockedBadge')
                        : t('awards.modal.lockedBadge')}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};
