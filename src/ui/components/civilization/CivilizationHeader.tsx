import React from 'react';
import { Coins, Clock, TrendingUp, Hammer, Compass, X, Users, ChevronRight } from 'lucide-react';
import { BuildingDefinition } from '../../../core/civilization/buildingTypes.ts';
import { formatRewardAmount } from '../../utils/formatters.ts';
import { getLocalizedBuildingName, getLocalizedEraName } from '../../utils/buildingI18n.ts';
import { useTranslation } from '../../../i18n/I18nContext.tsx';

export interface CivilizationHeaderProps {
  era: string;
  focusCoins: number;
  lifetimeFocusMinutes: number;
  activeBonusRate: number;
  busyCrew?: number;
  totalCrew?: number;
  isPlacementMode: boolean;
  selectedBuildingDef: BuildingDefinition | null;
  onCancelPlacement: () => void;
  onOpenCatalog: () => void;
  onOpenExpansion: () => void;
  isExpansionMode?: boolean;
  isExpansionLocked?: boolean;
  canCancelExpansion?: boolean;
  onCancelExpansion?: () => void;
  onOpenEraModal?: () => void;
  eraAdvanceEligible?: boolean;
  eraAdvanceEnabled?: boolean;
}

export const CivilizationHeader: React.FC<CivilizationHeaderProps> = ({
  era,
  focusCoins,
  lifetimeFocusMinutes,
  activeBonusRate,
  busyCrew = 0,
  totalCrew = 0,
  isPlacementMode,
  selectedBuildingDef,
  onCancelPlacement,
  onOpenCatalog,
  onOpenExpansion,
  isExpansionMode = false,
  isExpansionLocked = false,
  canCancelExpansion = isExpansionMode && !isExpansionLocked,
  onCancelExpansion,
  onOpenEraModal,
  eraAdvanceEligible = false,
  eraAdvanceEnabled = false,
}) => {
  const { locale, t } = useTranslation();
  const eraLabel = getLocalizedEraName(locale, era);
  const bonusPercent = formatRewardAmount(Math.max(0, activeBonusRate) * 100);
  const hasBonus = activeBonusRate > 0;
  const isEraReady = eraAdvanceEligible && eraAdvanceEnabled;
  const placingBuildingName = selectedBuildingDef
    ? getLocalizedBuildingName(locale, selectedBuildingDef, selectedBuildingDef.name)
    : '';

  return (
    <div className="relative z-20 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/80 shrink-0">
      {/* Main Civilization Status & Action Row */}
      <div className="px-3 py-2 flex items-center justify-between gap-2">
        {/* Era & Metrics */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-900 dark:text-slate-100">
            <button
              type="button"
              data-testid="civ-era-badge-btn"
              onClick={onOpenEraModal}
              aria-label={t('civ.header.eraBadgeAria', { era: eraLabel })}
              title={t('civ.header.eraBadgeTitle')}
              className={`min-w-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-xs font-semibold transition-colors cursor-pointer ${
                isEraReady
                  ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-200 hover:bg-emerald-100 dark:hover:bg-emerald-900/60'
                  : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}
            >
              <span className="truncate">{eraLabel}</span>
              {isEraReady && (
                <span
                  data-testid="civ-era-ready-dot"
                  aria-hidden="true"
                  className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0"
                />
              )}
              <ChevronRight className="w-3 h-3 text-slate-400 dark:text-slate-500 shrink-0" />
            </button>
            <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">·</span>
            <span
              className={`inline-flex items-center gap-0.5 text-[11px] font-semibold tabular-nums whitespace-nowrap ${
                hasBonus
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
              title={t('civ.header.coinBonusTitle')}
            >
              <TrendingUp className="w-3 h-3 shrink-0" />
              <span>{`+${bonusPercent}%`}</span>
            </span>
          </div>

          <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 tabular-nums flex-wrap">
            <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-300 font-medium">
              <Coins className="w-3 h-3 text-amber-500 shrink-0" />
              <span>{formatRewardAmount(focusCoins)}</span>
            </span>
            <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">·</span>
            <span
              className="inline-flex items-center gap-1 whitespace-nowrap"
              title={t('civ.header.lifetimeFocusTitle')}
            >
              <Clock className="w-3 h-3 text-indigo-500 shrink-0" />
              <span>{`${lifetimeFocusMinutes}m`}</span>
            </span>
            <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">·</span>
            <span
              data-testid="civ-header-crew"
              className="inline-flex items-center gap-1 whitespace-nowrap text-slate-600 dark:text-slate-300 font-medium"
              title={t('civ.header.crewTitle')}
            >
              <Users className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>{t('civ.header.crewBadge', { busy: busyCrew, total: totalCrew })}</span>
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            disabled={isExpansionLocked}
            onClick={isExpansionLocked ? undefined : onOpenExpansion}
            aria-pressed={isExpansionMode}
            title={t('civ.expand.title')}
            className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium border rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
              isExpansionMode
                ? 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700 shadow-2xs'
                : 'text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border-slate-200 dark:border-slate-700'
            }`}
          >
            <Compass
              className={`w-3.5 h-3.5 shrink-0 ${
                isExpansionMode ? 'text-white' : 'text-indigo-600 dark:text-indigo-400'
              }`}
            />
            <span>{t('civ.header.expandBtn')}</span>
          </button>

          <button
            type="button"
            disabled={isExpansionLocked}
            onClick={isExpansionLocked ? undefined : onOpenCatalog}
            title={t('civ.header.openCatalogTitle')}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 dark:disabled:bg-indigo-800 rounded-md transition-colors shadow-2xs whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <Hammer className="w-3.5 h-3.5 shrink-0" />
            <span>{t('civ.header.buildBtn')}</span>
          </button>
        </div>
      </div>

      {/* Placement Mode Active Banner */}
      {isPlacementMode && selectedBuildingDef && (
        <div className="px-3 py-1.5 bg-indigo-50 dark:bg-indigo-950/60 border-t border-indigo-200 dark:border-indigo-800/80 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold text-indigo-900 dark:text-indigo-200 truncate">
              {t('civ.header.placingTitle', {
                name: placingBuildingName,
                width: selectedBuildingDef.footprint.width,
                height: selectedBuildingDef.footprint.height,
              })}
            </div>
            <div className="text-[10px] text-indigo-700/80 dark:text-indigo-300/80 truncate">
              {t('civ.header.placingHint')}
            </div>
          </div>

          <button
            type="button"
            onClick={onCancelPlacement}
            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-indigo-700 dark:text-indigo-200 bg-white dark:bg-slate-900 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 border border-indigo-200 dark:border-indigo-700 rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <X className="w-3 h-3 shrink-0" />
            <span>{t('civ.header.cancelEsc')}</span>
          </button>
        </div>
      )}

      {/* Expansion Mode Active Banner (overlay so map viewport size never changes) */}
      {isExpansionMode && !isPlacementMode && (
        <div
          data-testid="expansion-mode-banner"
          className="absolute top-full inset-x-0 z-20 px-3 py-1.5 bg-emerald-50/95 dark:bg-emerald-950/95 backdrop-blur-xs border-b border-emerald-200 dark:border-emerald-800/80 shadow-sm flex items-center justify-between gap-2"
        >
          <div className="min-w-0">
            <div className="text-[11px] font-semibold text-emerald-900 dark:text-emerald-200 truncate">
              {t('civ.expand.modeTitle')}
            </div>
            <div className="text-[10px] text-emerald-700/85 dark:text-emerald-300/85 truncate">
              {t('civ.expand.modeHint')}
            </div>
          </div>

          <button
            type="button"
            disabled={!canCancelExpansion}
            onClick={canCancelExpansion ? onCancelExpansion : undefined}
            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-200 bg-white dark:bg-slate-900 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 border border-emerald-200 dark:border-emerald-700 rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
          >
            <X className="w-3 h-3 shrink-0" />
            <span>{t('civ.expand.cancelEsc')}</span>
          </button>
        </div>
      )}
    </div>
  );
};
