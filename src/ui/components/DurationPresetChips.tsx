import React from 'react';
import { useTranslation } from '../../i18n/I18nContext.tsx';

export const DEFAULT_DURATION_PRESETS: readonly number[] = [15, 25, 45, 60];

export interface DurationPresetChipsProps {
  selectedMinutes: number;
  onSelectMinutes: (minutes: number) => void;
  presets?: readonly number[];
  disabled?: boolean;
}

export const DurationPresetChips: React.FC<DurationPresetChipsProps> = ({
  selectedMinutes,
  onSelectMinutes,
  presets = DEFAULT_DURATION_PRESETS,
  disabled = false,
}) => {
  const { t } = useTranslation();

  return (
    <div data-testid="duration-preset-chips" className="space-y-1.5">
      <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
        {t('timer.setup.quickPresets')}
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {presets.map((mins) => {
          const isSelected = selectedMinutes === mins;
          return (
            <button
              key={mins}
              type="button"
              data-testid={`duration-preset-${mins}`}
              aria-pressed={isSelected}
              disabled={disabled}
              onClick={() => onSelectMinutes(mins)}
              className={`py-1.5 px-2 rounded-lg text-xs font-semibold tabular-nums border transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                isSelected
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                  : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-indigo-400 dark:hover:border-indigo-500'
              }`}
            >
              {`${mins}m`}
            </button>
          );
        })}
      </div>
    </div>
  );
};
