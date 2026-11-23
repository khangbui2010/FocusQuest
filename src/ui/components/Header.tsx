import React from 'react';
import { Coins, Award, Shield } from 'lucide-react';
import { PlayerEconomy } from '../../types/economy.ts';
import { FocusProfile } from '../../types/profiles.ts';
import { CivilizationEra } from '../../core/civilization/buildingTypes.ts';
import { LevelSystem } from '../../core/economy/levelSystem.ts';
import { formatRewardAmount } from '../utils/formatters.ts';
import { useTranslation } from '../../i18n/I18nContext.tsx';
import { SupportedLocale, TranslationKey } from '../../i18n/types.ts';
import { ActiveTab } from './Navbar.tsx';

export interface HeaderProps {
  economy: PlayerEconomy;
  activeProfile?: FocusProfile | null;
  onOpenProfiles?: () => void;
  onOpenHelp?: () => void;
  isBlockingActive?: boolean;
  isSessionActive?: boolean;
  era?: CivilizationEra | string;
  activeView?: ActiveTab;
  onNavigateHome?: () => void;
  onToggleLanguage?: (locale: SupportedLocale) => void | Promise<void>;
}

const levelSystem = new LevelSystem();

const ERA_TRANSLATION_KEYS: Record<string, TranslationKey> = {
  STONE_AGE: 'eras.STONE_AGE',
  BRONZE_AGE: 'eras.BRONZE_AGE',
  IRON_AGE: 'eras.IRON_AGE',
  MEDIEVAL: 'eras.MEDIEVAL',
  EARLY_MODERN: 'eras.EARLY_MODERN',
  MODERN: 'eras.MODERN',
  FUTURISTIC: 'eras.FUTURISTIC',
  INTERPLANETARY: 'eras.INTERPLANETARY',
};

const ERA_SHORT_TRANSLATION_KEYS: Record<string, TranslationKey> = {
  STONE_AGE: 'header.eraShort.STONE_AGE',
  BRONZE_AGE: 'header.eraShort.BRONZE_AGE',
  IRON_AGE: 'header.eraShort.IRON_AGE',
  MEDIEVAL: 'header.eraShort.MEDIEVAL',
  EARLY_MODERN: 'header.eraShort.EARLY_MODERN',
  MODERN: 'header.eraShort.MODERN',
  FUTURISTIC: 'header.eraShort.FUTURISTIC',
  INTERPLANETARY: 'header.eraShort.INTERPLANETARY',
};

export const Header: React.FC<HeaderProps> = ({
  economy,
  activeProfile,
  onOpenProfiles,
  onOpenHelp,
  isBlockingActive = false,
  isSessionActive = false,
  era = 'STONE_AGE',
  activeView: _activeView = 'map',
  onNavigateHome,
  onToggleLanguage,
}) => {
  const { locale, setLocale, t } = useTranslation();
  const levelProgress = levelSystem.calculateLevel(economy.totalXP);

  const eraKey = ERA_TRANSLATION_KEYS[era] ?? 'eras.STONE_AGE';
  const eraShortKey = ERA_SHORT_TRANSLATION_KEYS[era] ?? 'header.eraShort.STONE_AGE';
  const eraLabel = t(eraKey);
  const eraShortLabel = t(eraShortKey);
  const nextLocale: SupportedLocale = locale === 'en' ? 'vi' : 'en';
  const showActiveShield = Boolean((isSessionActive || isBlockingActive) && activeProfile);

  const handleLanguageClick = () => {
    if (onToggleLanguage) {
      void onToggleLanguage(nextLocale);
    } else {
      void setLocale(nextLocale);
    }
  };

  return (
    <header
      data-testid="compact-header"
      className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-1.5 shrink-0"
    >
      {/* Row 1: Brand + Era badge | Coins + Level + Help + EN/VI */}
      <div className="flex items-center justify-between gap-1.5 h-[26px]">
        <div className="flex-1 min-w-0 flex items-center gap-1.5 overflow-hidden">
          {onNavigateHome ? (
            <button
              type="button"
              data-testid="header-brand-home"
              onClick={onNavigateHome}
              aria-label={t('header.goHomeAria')}
              className="flex items-center gap-1.5 shrink-0 hover:opacity-85 transition-opacity cursor-pointer"
            >
              <div className="w-5 h-5 rounded-md bg-indigo-600 flex items-center justify-center text-white font-bold text-[10px] shadow-2xs shrink-0">
                FQ
              </div>
              <span className="font-bold text-slate-900 dark:text-slate-100 tracking-tight text-xs uppercase whitespace-nowrap">
                {t('header.brandTitle')}
              </span>
            </button>
          ) : (
            <div className="flex items-center gap-1.5 shrink-0">
              <div className="w-5 h-5 rounded-md bg-indigo-600 flex items-center justify-center text-white font-bold text-[10px] shadow-2xs shrink-0">
                FQ
              </div>
              <span className="font-bold text-slate-900 dark:text-slate-100 tracking-tight text-xs uppercase whitespace-nowrap">
                {t('header.brandTitle')}
              </span>
            </div>
          )}

          <span
            data-testid="header-era-badge"
            title={t('header.eraTitle', { era: eraLabel })}
            className="min-w-0 px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200/80 dark:border-emerald-800/60 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300 whitespace-nowrap truncate max-w-[82px]"
          >
            {eraShortLabel}
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {/* Coins */}
          <div className="flex items-center gap-1 px-1.5 py-0.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-800/60 rounded text-[11px] font-semibold text-amber-900 dark:text-amber-200 tabular-nums whitespace-nowrap">
            <Coins className="w-3 h-3 text-amber-600 dark:text-amber-400 shrink-0" />
            <span>{formatRewardAmount(economy.focusCoins)}</span>
          </div>

          {/* Level Badge */}
          <div className="flex items-center gap-0.5 px-1.5 py-0.5 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200/80 dark:border-indigo-800/60 rounded text-[11px] font-semibold text-indigo-900 dark:text-indigo-200 tabular-nums whitespace-nowrap">
            <Award className="w-3 h-3 text-indigo-600 dark:text-indigo-400 shrink-0" />
            <span>{t('header.levelShort', { level: levelProgress.level })}</span>
          </div>

          {/* Help button */}
          {onOpenHelp && (
            <button
              type="button"
              data-testid="help-btn"
              aria-label={t('header.helpAria')}
              onClick={onOpenHelp}
              title={t('header.helpTitle')}
              className="w-5 h-5 rounded-full border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:border-indigo-400 text-[10px] font-bold flex items-center justify-center transition-colors cursor-pointer shrink-0"
            >
              ?
            </button>
          )}

          {/* 1-tap EN | VI language toggle */}
          <button
            type="button"
            data-testid="language-toggle-btn"
            onClick={handleLanguageClick}
            aria-label={t('common.language.switchAria', {
              language: nextLocale === 'vi' ? 'Tiếng Việt' : 'English',
            })}
            title={`${t('common.language.label')}: ${locale.toUpperCase()}`}
            className="h-5 px-1.5 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:border-indigo-400 text-[10px] font-bold tracking-tight flex items-center gap-0.5 transition-colors cursor-pointer shrink-0"
          >
            <span
              className={
                locale === 'en'
                  ? 'text-indigo-600 dark:text-indigo-400'
                  : 'text-slate-400 dark:text-slate-500'
              }
            >
              {t('common.language.en')}
            </span>
            <span className="text-slate-300 dark:text-slate-600">|</span>
            <span
              className={
                locale === 'vi'
                  ? 'text-indigo-600 dark:text-indigo-400'
                  : 'text-slate-400 dark:text-slate-500'
              }
            >
              {t('common.language.vi')}
            </span>
          </button>
        </div>
      </div>

      {/* Row 2: Slim XP progress + Compact Active Shield */}
      <div className="mt-1 flex items-center justify-between gap-2 h-[16px] text-[10px] leading-none">
        <div className="flex-1 min-w-0 flex items-center gap-1.5">
          <span className="font-semibold text-slate-600 dark:text-slate-300 shrink-0">
            {t('header.xpLabel')}
          </span>
          <div className="flex-1 bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
            <div
              className="bg-indigo-600 dark:bg-indigo-500 h-full transition-all duration-300 rounded-full"
              style={{ width: `${levelProgress.progressPercentage}%` }}
            />
          </div>
          <span className="tabular-nums font-mono text-[10px] text-slate-500 dark:text-slate-400 shrink-0">
            {levelProgress.currentLevelXP}/{levelProgress.xpForNextLevel}
          </span>
        </div>

        {showActiveShield && (
          <button
            type="button"
            data-testid="header-shield-badge"
            onClick={onOpenProfiles}
            title={t('header.shieldTitle', {
              name: activeProfile?.name || t('header.defaultProfile'),
            })}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200/80 dark:border-emerald-800/60 text-[10px] font-medium text-emerald-700 dark:text-emerald-300 truncate max-w-[118px] shrink-0 cursor-pointer hover:bg-emerald-100/70 dark:hover:bg-emerald-900/50 transition-colors"
          >
            <Shield className="w-2.5 h-2.5 text-emerald-500 shrink-0" />
            <span className="truncate">
              {t('header.shieldOnLabel', {
                name: activeProfile?.name || t('header.defaultProfile'),
              })}
            </span>
          </button>
        )}
      </div>
    </header>
  );
};
