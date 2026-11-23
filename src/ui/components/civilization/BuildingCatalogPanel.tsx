import React, { useState } from 'react';
import {
  X,
  Flame,
  Sparkles,
  BookOpen,
  Award,
  Compass,
  Archive,
  Lock,
  Coins,
  Hammer,
} from 'lucide-react';
import {
  BuildingCategory,
  BuildingDefinition,
  BuildingInstance,
  CivilizationEra,
  isEraUnlocked,
} from '../../../core/civilization/buildingTypes.ts';
import { getAllBuildingDefinitions } from '../../../core/civilization/buildingCatalog.ts';
import {
  canPlaceAnotherBuildingOfCategory,
  isBuildingDefinitionUpgradeable,
} from '../../../core/civilization/buildingUpgrade.ts';
import { getEffectiveMaxLevel } from '../../../core/civilization/eraRules.ts';
import { VILLAGE_CAVE_DEFINITION_ID } from '../../../core/civilization/villager.ts';
import { PixelSprite, getBuildingSprite } from './spriteRegistry.ts';
import { useTranslation } from '../../../i18n/I18nContext.tsx';
import { formatRewardAmount } from '../../utils/formatters.ts';
import { TranslationKey } from '../../../i18n/types.ts';
import {
  getLocalizedBuildingDescription,
  getLocalizedBuildingName,
} from '../../utils/buildingI18n.ts';

export interface BuildingCatalogPanelProps {
  isOpen: boolean;
  onClose: () => void;
  playerLevel: number;
  playerCoins: number;
  lifetimeFocusMinutes: number;
  currentEra?: CivilizationEra;
  placedBuildings?: readonly BuildingInstance[];
  onSelectBuilding: (def: BuildingDefinition) => void;
}

type CategoryFilter = 'ALL' | BuildingCategory;

const FILTER_TABS: readonly { id: CategoryFilter; labelKey: TranslationKey }[] = [
  { id: 'ALL', labelKey: 'civ.catalog.filter.all' },
  { id: 'DECORATIVE', labelKey: 'civ.catalog.filter.decor' },
  { id: 'FOCUS_SUPPORT', labelKey: 'civ.catalog.filter.focusSupport' },
  { id: 'ECONOMY_EFFECT', labelKey: 'civ.catalog.filter.economy' },
];

const CATEGORY_LABEL_KEYS: Record<BuildingCategory, TranslationKey> = {
  DECORATIVE: 'civ.catalog.category.DECORATIVE',
  FOCUS_SUPPORT: 'civ.catalog.category.FOCUS_SUPPORT',
  ECONOMY_EFFECT: 'civ.catalog.category.ECONOMY_EFFECT',
};

export function renderBuildingIcon(iconIdentifier: string, className = 'w-4 h-4'): React.ReactNode {
  switch (iconIdentifier) {
    case 'flame':
      return <Flame className={className} />;
    case 'sparkles':
      return <Sparkles className={className} />;
    case 'book-open':
      return <BookOpen className={className} />;
    case 'award':
      return <Award className={className} />;
    case 'compass':
      return <Compass className={className} />;
    case 'archive':
      return <Archive className={className} />;
    default:
      return <Hammer className={className} />;
  }
}

function getEffectSummary(
  def: BuildingDefinition,
  t: ReturnType<typeof useTranslation>['t']
): string {
  if (def.effects.length === 0) {
    return t('civ.catalog.effect.decor');
  }
  const parts = def.effects.map((eff) => {
    if (eff.type === 'COIN_BONUS') {
      return t('civ.catalog.effect.coinBonus', { rate: formatRewardAmount(eff.rate * 100) });
    }
    if (eff.type === 'FOCUS_FEATURE_UNLOCK') {
      return t('civ.catalog.effect.focusPreset');
    }
    return t('civ.catalog.effect.streakInsights');
  });
  if (def.id === VILLAGE_CAVE_DEFINITION_ID) {
    parts.unshift(t('civ.catalog.effect.caveCapacity'));
  }
  return parts.join(' · ');
}

export const BuildingCatalogPanel: React.FC<BuildingCatalogPanelProps> = ({
  isOpen,
  onClose,
  playerLevel,
  playerCoins,
  lifetimeFocusMinutes,
  currentEra = 'STONE_AGE',
  placedBuildings = [],
  onSelectBuilding,
}) => {
  const { locale, t } = useTranslation();
  const [activeFilter, setActiveFilter] = useState<CategoryFilter>('ALL');

  if (!isOpen) return null;

  const allBuildings = getAllBuildingDefinitions();
  const filteredBuildings =
    activeFilter === 'ALL'
      ? allBuildings
      : allBuildings.filter((b) => b.category === activeFilter);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="building-catalog-title"
      onClick={onClose}
      className="absolute inset-0 z-30 flex flex-col justify-end bg-black/50 backdrop-blur-[1px]"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 rounded-t-2xl shadow-2xl flex flex-col max-h-[88%] overflow-hidden"
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
          <div>
            <h2
              id="building-catalog-title"
              className="text-sm font-bold text-slate-900 dark:text-slate-100"
            >
              {t('civ.catalog.title')}
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
              {t('civ.catalog.summary', {
                level: playerLevel,
                coins: formatRewardAmount(playerCoins),
                minutes: lifetimeFocusMinutes,
              })}
            </p>
          </div>

          <button
            type="button"
            aria-label={t('civ.catalog.closeAria')}
            onClick={onClose}
            className="w-7 h-7 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center justify-center cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Category Filter Tabs */}
        <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/60 shrink-0">
          <div className="grid grid-cols-4 gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
            {FILTER_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveFilter(tab.id)}
                className={`py-1 px-1.5 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap truncate cursor-pointer ${
                  activeFilter === tab.id
                    ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {t(tab.labelKey)}
              </button>
            ))}
          </div>
        </div>

        {/* Building List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
          {filteredBuildings.map((def) => {
            const levelLocked = playerLevel < def.unlockRequirements.minPlayerLevel;
            const focusLocked = lifetimeFocusMinutes < def.unlockRequirements.minTotalFocusMinutes;
            const eraLocked = def.unlockRequirements.minEra
              ? !isEraUnlocked(currentEra, def.unlockRequirements.minEra)
              : false;
            const limitCheck = canPlaceAnotherBuildingOfCategory(def, placedBuildings);
            const capReached = !limitCheck.allowed;
            const insufficientCoins = playerCoins < def.baseCost;
            const isLocked = levelLocked || focusLocked || eraLocked;
            const canBuild = !isLocked && !capReached && !insufficientCoins;

            let actionLabel = t('civ.catalog.buildBtn');
            if (levelLocked) {
              actionLabel = t('civ.catalog.lockedLevel', {
                level: def.unlockRequirements.minPlayerLevel,
              });
            } else if (focusLocked) {
              actionLabel = t('civ.catalog.lockedFocus', {
                minutes: def.unlockRequirements.minTotalFocusMinutes,
              });
            } else if (eraLocked) {
              actionLabel = t('civ.catalog.lockedEra');
            } else if (capReached && limitCheck.limit !== null) {
              actionLabel = t('civ.catalog.economyCapReachedBtn', {
                current: limitCheck.currentCount,
                max: limitCheck.limit,
              });
            } else if (insufficientCoins) {
              actionLabel = t('civ.catalog.needCoins', { cost: formatRewardAmount(def.baseCost) });
            }

            const iconTone =
              def.category === 'ECONOMY_EFFECT'
                ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/60'
                : def.category === 'FOCUS_SUPPORT'
                ? 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800/60'
                : 'bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800/60';

            const sprite = getBuildingSprite(def.id);
            const thumbScale = sprite
              ? sprite.width === 16 && sprite.height === 16
                ? 2
                : sprite.height > 32
                ? 36 / sprite.height
                : 1
              : 1;

            const localizedName = getLocalizedBuildingName(locale, def, def.name);
            const localizedDescription = getLocalizedBuildingDescription(
              locale,
              def,
              def.description
            );

            return (
              <div
                key={def.id}
                className={`p-3 rounded-xl border transition-colors ${
                  isLocked
                    ? 'bg-slate-50/70 dark:bg-slate-800/40 border-slate-200/80 dark:border-slate-800'
                    : 'bg-white dark:bg-slate-800/70 border-slate-200 dark:border-slate-700/80'
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <div
                    className={`w-11 h-11 rounded-lg border flex items-center justify-center shrink-0 overflow-hidden ${
                      sprite
                        ? 'bg-[#84c669]/25 dark:bg-slate-800 border-[#65a556]/40 dark:border-slate-700'
                        : iconTone
                    }`}
                  >
                    {sprite ? (
                      <PixelSprite
                        sprite={sprite}
                        width={Math.round(sprite.width * thumbScale)}
                        height={Math.round(sprite.height * thumbScale)}
                      />
                    ) : (
                      renderBuildingIcon(def.iconIdentifier, 'w-4 h-4')
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                        {localizedName}
                      </h3>
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 dark:text-amber-300 tabular-nums whitespace-nowrap shrink-0">
                        <Coins className="w-3 h-3 text-amber-500 shrink-0" />
                        <span>{formatRewardAmount(def.baseCost)}</span>
                      </span>
                    </div>

                    <div className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5 flex-wrap">
                      <span>{t(CATEGORY_LABEL_KEYS[def.category])}</span>
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums">
                        {def.footprint.width}×{def.footprint.height}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>
                        {isBuildingDefinitionUpgradeable(def)
                          ? t('civ.catalog.maxLevel', {
                              maxLevel: getEffectiveMaxLevel(def, currentEra),
                            })
                          : t('civ.catalog.cantUpgrade')}
                      </span>
                      {limitCheck.limit !== null && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span
                            data-testid="catalog-economy-cap"
                            className={`font-semibold tabular-nums ${
                              limitCheck.currentCount >= limitCheck.limit
                                ? 'text-amber-600 dark:text-amber-400'
                                : 'text-emerald-600 dark:text-emerald-400'
                            }`}
                          >
                            {t('civ.catalog.economyCapBadge', {
                              current: limitCheck.currentCount,
                              max: limitCheck.limit,
                            })}
                          </span>
                        </>
                      )}
                    </div>

                    <p className="mt-1 text-[11px] text-slate-600 dark:text-slate-300 leading-snug">
                      {localizedDescription}
                    </p>

                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span
                        className={`text-[10px] font-medium ${
                          def.category === 'ECONOMY_EFFECT'
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : def.category === 'FOCUS_SUPPORT'
                            ? 'text-indigo-700 dark:text-indigo-400'
                            : 'text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        {getEffectSummary(def, t)}
                      </span>

                      <button
                        type="button"
                        disabled={!canBuild}
                        onClick={() => onSelectBuilding(def)}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                          canBuild
                            ? 'bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 border border-slate-200 dark:border-slate-700 cursor-not-allowed'
                        }`}
                      >
                        {isLocked && <Lock className="w-3 h-3 shrink-0" />}
                        <span>{actionLabel}</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
