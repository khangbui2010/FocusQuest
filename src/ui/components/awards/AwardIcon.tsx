import React from 'react';
import { CivilizationEra } from '../../../core/civilization/buildingTypes.ts';
import { AwardIconSpec } from '../../../types/awards.ts';
import { getAwardToolKind } from '../civilization/constructionTools.ts';
import { ClockTileIcon, EraToolTileIcon, TileImage } from '../civilization/TileImage.tsx';
import { getAwardLevelBand, getAwardLevelFrameClass } from './awardFormatting.ts';

export interface AwardIconProps {
  icon: AwardIconSpec;
  unlocked: boolean;
  level?: number;
  isSingleLevel?: boolean;
  showLevelTag?: boolean;
  era?: CivilizationEra | string;
  size?: number;
  alt?: string;
  className?: string;
}

export const AwardIcon: React.FC<AwardIconProps> = ({
  icon,
  unlocked,
  level,
  isSingleLevel = false,
  showLevelTag = false,
  era = 'STONE_AGE',
  size = 28,
  alt = '',
  className = '',
}) => {
  const effectiveLevel =
    typeof level === 'number' && Number.isFinite(level)
      ? Math.max(0, Math.floor(level))
      : unlocked
      ? 1
      : 0;
  const isActuallyUnlocked = effectiveLevel > 0 || unlocked;
  const band = getAwardLevelBand(effectiveLevel, isSingleLevel);
  const frameClass = getAwardLevelFrameClass(effectiveLevel, isSingleLevel);
  const spriteFilterClass = isActuallyUnlocked ? '' : 'grayscale opacity-55';
  const toolKind = getAwardToolKind(icon);

  return (
    <div
      data-award-icon-unlocked={isActuallyUnlocked ? 'true' : 'false'}
      data-award-level={effectiveLevel}
      data-award-band={band}
      className={`relative w-10 h-10 rounded-lg border flex items-center justify-center shrink-0 ${frameClass} ${className}`}
    >
      {icon.kind === 'clock' ? (
        <ClockTileIcon
          tileIndex={icon.clockIndex}
          size={size}
          alt={alt}
          className={spriteFilterClass}
        />
      ) : toolKind !== null ? (
        <EraToolTileIcon
          toolKind={toolKind}
          era={era}
          size={size}
          alt={alt}
          className={spriteFilterClass}
        />
      ) : (
        <TileImage
          pack={icon.pack}
          tileIndex={icon.tileIndex}
          size={size}
          alt={alt}
          className={spriteFilterClass}
        />
      )}
      {showLevelTag && !isSingleLevel && effectiveLevel > 0 && (
        <span
          aria-hidden="true"
          className="absolute -bottom-1 -right-1 px-1 py-[1px] rounded bg-slate-900/90 dark:bg-slate-950 text-white text-[8px] font-mono font-bold tabular-nums leading-none border border-white/70 dark:border-slate-700"
        >
          {effectiveLevel}
        </span>
      )}
    </div>
  );
};
