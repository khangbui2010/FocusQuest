import React, { useState } from 'react';
import { Users, AlertCircle, CheckCircle2, Lock } from 'lucide-react';
import {
  VILLAGER_CRAFTER_COIN_BONUS_CAP,
  VILLAGER_CRAFTER_COIN_BONUS_RATE,
  VILLAGER_ELDER_UPGRADE_DISCOUNT_CAP,
  VILLAGER_ELDER_UPGRADE_DISCOUNT_RATE,
  VILLAGER_WOODWORKER_EXPANSION_DISCOUNT_CAP,
  VILLAGER_WOODWORKER_EXPANSION_DISCOUNT_RATE,
} from '../../../core/civilization/constants.ts';
import { VILLAGER_ROLES, VillagerRole, VillagerSprite } from './spriteRegistry.ts';
import { useTranslation } from '../../../i18n/I18nContext.tsx';
import { localizeErrorMessage, UiErrorPayload } from '../../../i18n/errorTranslator.ts';

export interface FounderPickerModalProps {
  isOpen: boolean;
  onSelectFounder: (role: VillagerRole) => Promise<void>;
  isSubmitting?: boolean;
  error?: UiErrorPayload | null;
}

export const FounderPickerModal: React.FC<FounderPickerModalProps> = ({
  isOpen,
  onSelectFounder,
  isSubmitting = false,
  error = null,
}) => {
  const { locale, t } = useTranslation();
  const [selectedRole, setSelectedRole] = useState<VillagerRole>('crafter');

  if (!isOpen) return null;

  const renderRoleBuffText = (role: VillagerRole): string => {
    if (role === 'elder') {
      return t('civ.details.roleBuff.elder', {
        rate: Math.round(VILLAGER_ELDER_UPGRADE_DISCOUNT_RATE * 100),
        cap: Math.round(VILLAGER_ELDER_UPGRADE_DISCOUNT_CAP * 100),
      });
    }
    if (role === 'crafter') {
      return t('civ.details.roleBuff.crafter', {
        rate: Math.round(VILLAGER_CRAFTER_COIN_BONUS_RATE * 100),
        cap: Math.round(VILLAGER_CRAFTER_COIN_BONUS_CAP * 100),
      });
    }
    return t('civ.details.roleBuff.woodworker', {
      rate: Math.round(VILLAGER_WOODWORKER_EXPANSION_DISCOUNT_RATE * 100),
      cap: Math.round(VILLAGER_WOODWORKER_EXPANSION_DISCOUNT_CAP * 100),
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="founder-picker-title"
      data-testid="founder-picker-modal"
      className="absolute inset-0 z-40 flex items-center justify-center bg-black/55 backdrop-blur-[1px] p-3"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[356px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
      >
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2.5 bg-amber-50/70 dark:bg-amber-950/30">
          <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/60 border border-amber-200 dark:border-amber-800/60 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0">
            <Users className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h2
              id="founder-picker-title"
              className="text-sm font-bold text-slate-900 dark:text-slate-100 leading-tight"
            >
              {t('civ.founder.title')}
            </h2>
            <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5 leading-snug">
              {t('civ.founder.subtitle')}
            </p>
          </div>
        </div>

        <div className="p-3.5 space-y-3">
          <div className="space-y-2">
            {VILLAGER_ROLES.map((role) => {
              const roleLabel = t(`civ.villager.role.${role}`);
              const isSelected = selectedRole === role;
              return (
                <button
                  key={role}
                  type="button"
                  data-testid={`founder-role-${role}`}
                  aria-label={t('civ.founder.selectRoleAria', { role: roleLabel })}
                  aria-pressed={isSelected}
                  disabled={isSubmitting}
                  onClick={() => setSelectedRole(role)}
                  className={`w-full flex items-center gap-2.5 p-2 rounded-xl border text-left transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${
                    isSelected
                      ? 'border-indigo-500 bg-indigo-50/80 dark:bg-indigo-950/50 dark:border-indigo-400'
                      : 'border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <div className="shrink-0 w-9 h-9 rounded-lg bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700/80 flex items-center justify-center">
                    <VillagerSprite
                      role={role}
                      animation="idle"
                      scale={2}
                      reducedMotion={true}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                        {roleLabel}
                      </span>
                      {isSelected && (
                        <CheckCircle2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                      )}
                    </div>
                    <p className="text-[10px] text-slate-600 dark:text-slate-300 leading-snug mt-0.5">
                      {renderRoleBuffText(role)}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-1.5 text-[10px] text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-800/60 rounded-lg px-2.5 py-1.5">
            <Lock className="w-3.5 h-3.5 shrink-0" />
            <span>{t('civ.founder.permanentWarning')}</span>
          </div>

          {error && (
            <div
              role="alert"
              data-testid="founder-picker-error"
              className="flex items-start gap-1.5 text-[11px] text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 rounded-lg px-2.5 py-1.5"
            >
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>
                {localizeErrorMessage(locale, error.message, error.code, error.params)}
              </span>
            </div>
          )}

          <button
            type="button"
            data-testid="founder-confirm-btn"
            disabled={isSubmitting}
            onClick={() => void onSelectFounder(selectedRole)}
            className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-xs font-semibold rounded-xl transition-colors shadow-xs disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
          >
            {isSubmitting ? t('civ.founder.submittingBtn') : t('civ.founder.confirmBtn')}
          </button>
        </div>
      </div>
    </div>
  );
};
