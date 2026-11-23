import React from 'react';
import {
  X,
  HelpCircle,
  Flame,
  Coins,
  Clock,
  Sparkles,
  Building2,
  ShieldAlert,
  ScrollText,
} from 'lucide-react';
import { useTranslation } from '../../i18n/I18nContext.tsx';
import { DEFAULT_REWARD_CONFIG } from '../../core/reward/rewardEngine.ts';
import { MultiplierRules } from '../../core/reward/multiplierRules.ts';
import {
  VILLAGER_COMPLETE_TRIBE_COIN_BONUS,
  VILLAGER_CRAFTER_COIN_BONUS_CAP,
  VILLAGER_CRAFTER_COIN_BONUS_RATE,
  VILLAGER_ELDER_UPGRADE_DISCOUNT_CAP,
  VILLAGER_ELDER_UPGRADE_DISCOUNT_RATE,
  VILLAGER_WOODWORKER_EXPANSION_DISCOUNT_CAP,
  VILLAGER_WOODWORKER_EXPANSION_DISCOUNT_RATE,
} from '../../core/civilization/constants.ts';

interface RewardHelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const MULTIPLIER_TIER_ROWS = [
  { key: 'help.tier1', sampleMinutes: 5, highlight: false },
  { key: 'help.tier2', sampleMinutes: 30, highlight: false },
  { key: 'help.tier3', sampleMinutes: 60, highlight: false },
  { key: 'help.tier4', sampleMinutes: 90, highlight: false },
  { key: 'help.tier5', sampleMinutes: 120, highlight: false },
  { key: 'help.tier6', sampleMinutes: 150, highlight: false },
  { key: 'help.tier7', sampleMinutes: 180, highlight: true },
] as const;

export const RewardHelpModal: React.FC<RewardHelpModalProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation();

  if (!isOpen) return null;

  const cdCoinsRate = DEFAULT_REWARD_CONFIG.countdownBaseCoinPerMinute.toFixed(1);
  const cdXpRate = DEFAULT_REWARD_CONFIG.countdownBaseXpPerMinute.toFixed(1);
  const swCoinsRate = DEFAULT_REWARD_CONFIG.stopwatchBaseCoinPerMinute.toFixed(1);
  const swXpRate = DEFAULT_REWARD_CONFIG.stopwatchBaseXpPerMinute.toFixed(1);
  const minSwMinutes = DEFAULT_REWARD_CONFIG.stopwatchMinMinutesThreshold;

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

          {/* Section 2: Base Rate Table (bound to DEFAULT_REWARD_CONFIG) */}
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
                    <td className="py-1.5 px-2 text-right text-amber-600 dark:text-amber-400 font-mono">{cdCoinsRate}</td>
                    <td className="py-1.5 px-2.5 text-right text-indigo-600 dark:text-indigo-400 font-mono">{cdXpRate}</td>
                  </tr>
                  <tr>
                    <td className="py-1.5 px-2.5 text-slate-800 dark:text-slate-200">{t('help.modeStopwatch')}</td>
                    <td className="py-1.5 px-2 text-right text-amber-600 dark:text-amber-400 font-mono">{swCoinsRate}</td>
                    <td className="py-1.5 px-2.5 text-right text-indigo-600 dark:text-indigo-400 font-mono">{swXpRate}</td>
                  </tr>
                  <tr>
                    <td className="py-1.5 px-2.5 text-slate-800 dark:text-slate-200">{t('help.modePomoCountdown')}</td>
                    <td className="py-1.5 px-2 text-right text-amber-600 dark:text-amber-400 font-mono">{cdCoinsRate}</td>
                    <td className="py-1.5 px-2.5 text-right text-indigo-600 dark:text-indigo-400 font-mono">{cdXpRate}</td>
                  </tr>
                  <tr>
                    <td className="py-1.5 px-2.5 text-slate-800 dark:text-slate-200">{t('help.modePomoStopwatch')}</td>
                    <td className="py-1.5 px-2 text-right text-amber-600 dark:text-amber-400 font-mono">{swCoinsRate}</td>
                    <td className="py-1.5 px-2.5 text-right text-indigo-600 dark:text-indigo-400 font-mono">{swXpRate}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
              {t('help.swThresholdNote', { min: minSwMinutes })}
            </p>
          </section>

          {/* Section 3: Unified Multiplier Bonus Table (bound to MultiplierRules) */}
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
                  {MULTIPLIER_TIER_ROWS.map((row) => {
                    const value = MultiplierRules.getSessionMultiplier(row.sampleMinutes).toFixed(1);
                    return (
                      <tr
                        key={row.key}
                        className={row.highlight ? 'bg-amber-50/50 dark:bg-amber-950/20' : undefined}
                      >
                        <td
                          className={
                            row.highlight
                              ? 'py-1.5 px-2.5 font-bold text-amber-700 dark:text-amber-300'
                              : 'py-1.5 px-2.5 text-slate-700 dark:text-slate-300'
                          }
                        >
                          {t(row.key)}
                        </td>
                        <td
                          className={
                            row.highlight
                              ? 'py-1.5 px-2.5 text-right font-bold text-amber-700 dark:text-amber-300'
                              : value === '1.0'
                              ? 'py-1.5 px-2.5 text-right font-bold text-slate-800 dark:text-slate-200'
                              : 'py-1.5 px-2.5 text-right font-bold text-indigo-600 dark:text-indigo-400'
                          }
                        >
                          {`×${value}`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-amber-700 dark:text-amber-400 leading-relaxed font-medium bg-amber-50/60 dark:bg-amber-950/30 p-2 rounded-lg border border-amber-200/60 dark:border-amber-900/40">
              ⚡ <strong>{t('help.capLead')}</strong> {t('help.capBody')}
            </p>
          </section>

          {/* Section 4: Civilization CoinBonus & Zero Passive Income */}
          <section className="space-y-1.5">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>{t('help.coinBonusHeading')}</span>
            </h3>
            <p className="p-2.5 bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200/70 dark:border-emerald-900/50 rounded-xl text-[11px] leading-relaxed text-slate-700 dark:text-slate-300">
              {t('help.coinBonusBody')}
            </p>
            <div
              data-testid="help-villager-buffs"
              className="p-2.5 bg-indigo-50/50 dark:bg-indigo-950/30 border border-indigo-200/70 dark:border-indigo-900/50 rounded-xl space-y-1 text-[11px] leading-relaxed text-slate-700 dark:text-slate-300"
            >
              <div className="font-semibold text-slate-900 dark:text-slate-100">
                {t('help.villagerBuffsHeading')}
              </div>
              <p>
                •{' '}
                {t('help.villagerCrafterRule', {
                  rate: Math.round(VILLAGER_CRAFTER_COIN_BONUS_RATE * 100),
                  cap: Math.round(VILLAGER_CRAFTER_COIN_BONUS_CAP * 100),
                })}
              </p>
              <p>
                •{' '}
                {t('help.villagerWoodworkerRule', {
                  rate: Math.round(VILLAGER_WOODWORKER_EXPANSION_DISCOUNT_RATE * 100),
                  cap: Math.round(VILLAGER_WOODWORKER_EXPANSION_DISCOUNT_CAP * 100),
                })}
              </p>
              <p>
                •{' '}
                {t('help.villagerElderRule', {
                  rate: Math.round(VILLAGER_ELDER_UPGRADE_DISCOUNT_RATE * 100),
                  cap: Math.round(VILLAGER_ELDER_UPGRADE_DISCOUNT_CAP * 100),
                })}
              </p>
              <p>
                •{' '}
                {t('help.villagerTribeRule', {
                  rate: Math.round(VILLAGER_COMPLETE_TRIBE_COIN_BONUS * 100),
                })}
              </p>
            </div>
          </section>

          {/* Section 5: All-or-Nothing & Interruption Settlement */}
          <section className="space-y-1.5">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
              <span>{t('help.settlementHeading')}</span>
            </h3>
            <div className="p-2.5 bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-xl space-y-1.5 text-[11px] leading-relaxed">
              <p>• {t('help.settlementCountdownRule')}</p>
              <p>• {t('help.settlementStopwatchRule', { min: minSwMinutes })}</p>
              <p>• {t('help.settlementPomoSwRule')}</p>
            </div>
          </section>

          {/* Section 6: Pomodoro Rules */}
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

          {/* Section 7: Daily/Weekly Quests & Numeric Precision */}
          <section className="space-y-1.5">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
              <ScrollText className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
              <span>{t('help.questsPrecisionHeading')}</span>
            </h3>
            <div className="p-2.5 bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-xl space-y-1.5 text-[11px] leading-relaxed">
              <p>• {t('help.questsFlatRule')}</p>
              <p>• {t('help.precisionRule')}</p>
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
