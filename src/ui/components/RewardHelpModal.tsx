import React from 'react';
import { X, HelpCircle, Flame, Award, Coins, Clock, Sparkles } from 'lucide-react';
import { useTranslation } from '../../i18n/I18nContext.tsx';

interface RewardHelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const RewardHelpModal: React.FC<RewardHelpModalProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation();

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="help-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 animate-fade-in"
    >
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-[350px] max-h-[520px] shadow-2xl flex flex-col overflow-hidden text-left">
        {/* Header */}
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <HelpCircle className="w-3.5 h-3.5" />
            </div>
            <h2 id="help-modal-title" className="text-sm font-bold text-slate-900 dark:text-slate-100">
              {t('help.title')}
            </h2>
          </div>
          <button
            type="button"
            aria-label={t('help.closeAria')}
            onClick={onClose}
            className="w-7 h-7 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center justify-center cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4 text-xs text-slate-600 dark:text-slate-300">
          {/* Section 1: Reward Formula */}
          <section className="space-y-1.5">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              <span>{t('help.formulaHeading')}</span>
            </h3>
            <div className="p-2.5 bg-indigo-50/60 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/50 rounded-xl font-mono text-[11px] text-indigo-950 dark:text-indigo-200 text-center font-semibold">
              {t('help.formulaText')}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
              {t('help.formulaNote')}
            </p>
          </section>

          {/* Section 2: Base Rate Table */}
          <section className="space-y-1.5">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
              <Coins className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              <span>{t('help.baseRateHeading')}</span>
            </h3>
            <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <table className="w-full text-[11px]">
                <thead className="bg-slate-100/70 dark:bg-slate-800/70 text-slate-700 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-1.5 px-2.5 text-left">{t('help.colMode')}</th>
                    <th className="py-1.5 px-2 text-right">{t('help.colCoinsMin')}</th>
                    <th className="py-1.5 px-2.5 text-right">{t('help.colXpMin')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                  <tr>
                    <td className="py-1.5 px-2.5 text-slate-800 dark:text-slate-200">{t('help.modeCountdown')}</td>
                    <td className="py-1.5 px-2 text-right text-amber-600 dark:text-amber-400 font-mono">1.5</td>
                    <td className="py-1.5 px-2.5 text-right text-indigo-600 dark:text-indigo-400 font-mono">5.0</td>
                  </tr>
                  <tr>
                    <td className="py-1.5 px-2.5 text-slate-800 dark:text-slate-200">{t('help.modeStopwatch')}</td>
                    <td className="py-1.5 px-2 text-right text-amber-600 dark:text-amber-400 font-mono">1.0</td>
                    <td className="py-1.5 px-2.5 text-right text-indigo-600 dark:text-indigo-400 font-mono">3.0</td>
                  </tr>
                  <tr>
                    <td className="py-1.5 px-2.5 text-slate-800 dark:text-slate-200">{t('help.modePomoCountdown')}</td>
                    <td className="py-1.5 px-2 text-right text-amber-600 dark:text-amber-400 font-mono">1.5</td>
                    <td className="py-1.5 px-2.5 text-right text-indigo-600 dark:text-indigo-400 font-mono">5.0</td>
                  </tr>
                  <tr>
                    <td className="py-1.5 px-2.5 text-slate-800 dark:text-slate-200">{t('help.modePomoStopwatch')}</td>
                    <td className="py-1.5 px-2 text-right text-amber-600 dark:text-amber-400 font-mono">1.0</td>
                    <td className="py-1.5 px-2.5 text-right text-indigo-600 dark:text-indigo-400 font-mono">3.0</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* Section 3: Unified Multiplier Bonus Table */}
          <section className="space-y-1.5">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
              <Flame className="w-3.5 h-3.5 text-rose-500 shrink-0" />
              <span>{t('help.multiplierHeading')}</span>
            </h3>
            <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <table className="w-full text-[11px]">
                <thead className="bg-slate-100/70 dark:bg-slate-800/70 text-slate-700 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-1.5 px-2.5 text-left">{t('help.colTotalFocusTime')}</th>
                    <th className="py-1.5 px-2.5 text-right">{t('help.colMultiplier')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono text-[11px]">
                  <tr>
                    <td className="py-1.5 px-2.5 text-slate-700 dark:text-slate-300">{t('help.tier1')}</td>
                    <td className="py-1.5 px-2.5 text-right font-bold text-slate-800 dark:text-slate-200">×1.0</td>
                  </tr>
                  <tr>
                    <td className="py-1.5 px-2.5 text-slate-700 dark:text-slate-300">{t('help.tier2')}</td>
                    <td className="py-1.5 px-2.5 text-right font-bold text-indigo-600 dark:text-indigo-400">×1.2</td>
                  </tr>
                  <tr>
                    <td className="py-1.5 px-2.5 text-slate-700 dark:text-slate-300">{t('help.tier3')}</td>
                    <td className="py-1.5 px-2.5 text-right font-bold text-indigo-600 dark:text-indigo-400">×1.4</td>
                  </tr>
                  <tr>
                    <td className="py-1.5 px-2.5 text-slate-700 dark:text-slate-300">{t('help.tier4')}</td>
                    <td className="py-1.5 px-2.5 text-right font-bold text-indigo-600 dark:text-indigo-400">×1.6</td>
                  </tr>
                  <tr>
                    <td className="py-1.5 px-2.5 text-slate-700 dark:text-slate-300">{t('help.tier5')}</td>
                    <td className="py-1.5 px-2.5 text-right font-bold text-indigo-600 dark:text-indigo-400">×1.8</td>
                  </tr>
                  <tr>
                    <td className="py-1.5 px-2.5 text-slate-700 dark:text-slate-300">{t('help.tier6')}</td>
                    <td className="py-1.5 px-2.5 text-right font-bold text-indigo-600 dark:text-indigo-400">×2.0</td>
                  </tr>
                  <tr className="bg-amber-50/50 dark:bg-amber-950/20">
                    <td className="py-1.5 px-2.5 font-bold text-amber-700 dark:text-amber-300">{t('help.tier7')}</td>
                    <td className="py-1.5 px-2.5 text-right font-bold text-amber-700 dark:text-amber-300">×2.5</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-amber-700 dark:text-amber-400 leading-relaxed font-medium bg-amber-50/60 dark:bg-amber-950/30 p-2 rounded-lg border border-amber-200/60 dark:border-amber-900/40">
              ⚡ <strong>{t('help.capLead')}</strong> {t('help.capBody')}
            </p>
          </section>

          {/* Section 4: Pomodoro Rules */}
          <section className="space-y-1.5">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400 shrink-0" />
              <span>{t('help.pomoCalcHeading')}</span>
            </h3>
            <div className="p-2.5 bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-xl space-y-1.5 text-[11px]">
              <p className="leading-relaxed">
                • <strong>{t('help.pomoCdLabel')}</strong> {t('help.pomoCdBefore')} <em>{t('help.pomoCdEm')}</em>.
              </p>
              <p className="leading-relaxed">
                • <strong>{t('help.pomoSwLabel')}</strong> {t('help.pomoSwBefore')} <em>{t('help.pomoSwEm')}</em>.
              </p>
              <p className="leading-relaxed text-indigo-600 dark:text-indigo-400 font-medium">
                {t('help.pomoExample')}
              </p>
              <p className="leading-relaxed text-slate-500 dark:text-slate-400 border-t border-slate-200/60 dark:border-slate-700/60 pt-1">
                ⚠️ {t('help.pomoWarningBefore')} <strong>{t('help.pomoWarningStrong')}</strong> {t('help.pomoWarningAfter')}
              </p>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs rounded-xl transition-colors shadow-xs cursor-pointer"
          >
            {t('help.gotItBtn')}
          </button>
        </div>
      </div>
    </div>
  );
};
