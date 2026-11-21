import React from 'react';
import {
  VILLAGER_CELL_PX,
  VILLAGER_SHEET_COLUMNS,
  VILLAGER_ANIMATIONS,
  VillagerRole,
  VillagerAnimationName,
  getVillagerSheetUrl,
} from './spriteRegistry.ts';

export interface VillagerSpriteProps {
  role: VillagerRole;
  animation?: VillagerAnimationName;
  scale?: number;
  reducedMotion?: boolean;
  className?: string;
  style?: React.CSSProperties;
  title?: string;
  ariaLabel?: string;
  testId?: string;
}

/**
 * SSR-safe, CSS-stepped sprite renderer for Stone Age villagers.
 * Uses 64x64 RGBA native sheets (4 columns x 4 rows, 16x16 px cells).
 */
export const VillagerSprite: React.FC<VillagerSpriteProps> = ({
  role,
  animation = 'idle',
  scale = 2,
  reducedMotion = false,
  className = '',
  style,
  title,
  ariaLabel,
  testId,
}) => {
  const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 2;
  const sizePx = VILLAGER_CELL_PX * safeScale;
  const sheetSizePx = VILLAGER_CELL_PX * VILLAGER_SHEET_COLUMNS * safeScale;

  const anim = VILLAGER_ANIMATIONS[animation] ?? VILLAGER_ANIMATIONS.idle;
  const durationMs = anim.durationMs;
  const sheetUrl = getVillagerSheetUrl(role);

  const combinedStyle: React.CSSProperties = {
    width: `${sizePx}px`,
    height: `${sizePx}px`,
    backgroundImage: sheetUrl ? `url('${sheetUrl}')` : undefined,
    backgroundRepeat: 'no-repeat',
    backgroundSize: `${sheetSizePx}px ${sheetSizePx}px`,
    backgroundPosition: `0px -${anim.row * sizePx}px`,
    imageRendering: 'pixelated',
    pointerEvents: 'none',
    transformOrigin: 'bottom center',
    display: 'inline-block',
    animation: reducedMotion
      ? 'none'
      : `fq-villager-steps-${anim.frames} ${durationMs}ms steps(${anim.frames}) infinite`,
    ['--villager-end-x' as string]: `-${anim.frames * sizePx}px`,
    ['--villager-duration' as string]: `${durationMs}ms`,
    ...style,
  };

  const animClass = reducedMotion
    ? ''
    : anim.frames === 2
    ? 'fq-villager-anim-2'
    : 'fq-villager-anim-4';

  const fullClassName = ['block select-none', animClass, className]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      role={ariaLabel ? 'img' : undefined}
      aria-label={ariaLabel}
      title={title}
      data-testid={testId ?? `villager-sprite-${role}`}
      data-villager-role={role}
      data-villager-animation={animation}
      className={fullClassName}
      style={combinedStyle}
    />
  );
};
