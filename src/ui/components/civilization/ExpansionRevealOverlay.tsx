import React, { useMemo } from 'react';
import { GridCoordinate } from '../../../core/civilization/types.ts';
import {
  ActiveExpansionReveal,
  buildExpansionAnimationPlan,
} from './expansionReveal.ts';
import { TileImage } from './TileImage.tsx';

export interface ExpansionRevealOverlayProps {
  reveal: ActiveExpansionReveal | null;
  renderMinX: number;
  renderMinY: number;
  cellSize: number;
}

export const ExpansionRevealOverlay: React.FC<ExpansionRevealOverlayProps> = ({
  reveal,
  renderMinX,
  renderMinY,
  cellSize,
}) => {
  const plan = useMemo(
    () => (reveal && !reveal.reducedMotion ? buildExpansionAnimationPlan(reveal.origin, cellSize) : null),
    [reveal, cellSize]
  );

  if (!reveal || !plan) {
    return null;
  }

  const left = (plan.origin.x - renderMinX) * cellSize;
  const top = (plan.origin.y - renderMinY) * cellSize;

  const overlayStyle = {
    left,
    top,
    width: plan.chunkWidthPx,
    height: plan.chunkHeightPx,
    ['--fq-impact-delay' as string]: `${plan.impactDelayMs}ms`,
    ['--fq-shake-duration' as string]: `${plan.shakeDurationMs}ms`,
    ['--fq-total-duration' as string]: `${plan.totalDurationMs}ms`,
  } as React.CSSProperties;

  return (
    <div
      key={reveal.id}
      aria-hidden="true"
      data-testid="expansion-reveal-overlay"
      data-reveal-origin={`${plan.origin.x},${plan.origin.y}`}
      data-impact-delay-ms={plan.impactDelayMs}
      style={overlayStyle}
      className="fq-expansion-overlay absolute z-30 pointer-events-none overflow-visible"
    >
      {/* Impact flash across 4x4 chunk */}
      <div
        className="fq-expansion-flash absolute inset-0 rounded-sm bg-amber-100/80 ring-2 ring-emerald-300/90"
        style={{ animationDelay: 'var(--fq-impact-delay, 680ms)' }}
      />

      {/* Dust & wood chips bursting from center */}
      {plan.particles.map((particle) => (
        <span
          key={particle.id}
          style={
            {
              left: plan.centerPxX - particle.sizePx / 2,
              top: plan.centerPxY - particle.sizePx / 2,
              width: particle.sizePx,
              height: particle.sizePx,
              backgroundColor: particle.colorHex,
              animationDelay: 'var(--fq-impact-delay, 680ms)',
              ['--fq-tx' as string]: `${particle.txPx}px`,
              ['--fq-ty' as string]: `${particle.tyPx}px`,
            } as React.CSSProperties
          }
          className="fq-expansion-particle absolute rounded-[1px] shadow-2xs"
        />
      ))}

      {/* Dropping & chopping CC0 Tiny Town woodcutter axe */}
      <div
        data-axe-tile-index={plan.axeTileIndex}
        style={{
          left: plan.centerPxX - 20,
          top: plan.centerPxY - 24,
          width: 40,
          height: 40,
        }}
        className="fq-expansion-axe absolute flex items-center justify-center drop-shadow-[0_2px_4px_rgba(15,23,42,0.65)]"
      >
        <TileImage
          pack={plan.axePack}
          tileIndex={plan.axeTileIndex}
          size={40}
          className="block pointer-events-none"
        />
      </div>
    </div>
  );
};

export function formatRevealCoordsLabel(origin: GridCoordinate): string {
  return `(${origin.x}, ${origin.y})`;
}
