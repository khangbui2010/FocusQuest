import React from 'react';
import { ConstructionJobStatus } from '../../../core/civilization/jobs.ts';

export interface ConstructionFenceProps {
  /** Base map-space width in pixels (e.g. 32, 64, 96, 128). Scales automatically with camera zoom. */
  width: number;
  /** Base map-space height in pixels (e.g. 32, 64, 96, 128). Scales automatically with camera zoom. */
  height: number;
  /** Job status: ACTIVE sways gently; PENDING stays static and subtly dimmed. */
  status: ConstructionJobStatus;
  /** Respects user prefers-reduced-motion preference (forces static ribbons). */
  reducedMotion?: boolean;
  /** Visual context tag for diagnostics/testing. */
  variant?: 'building' | 'clearing';
  /** Root data-testid (preserves `building-tarp-*` / `clearing-tarp-*` selectors). */
  testId?: string;
  /** Optional extra classes on root wrapper. */
  className?: string;
}

// Tiny Town palette colors (no magic / no external assets)
const COLOR_OUTLINE = '#3f2631';
const COLOR_SHADOW = '#262b44';
const COLOR_WOOD_DARK = '#763b36';
const COLOR_WOOD_MID = '#bd6c4a';
const COLOR_WOOD_LIGHT = '#eaa56c';
const COLOR_TIE = '#cf8254';
const COLOR_FABRIC_BASE = '#fef3c7';
const COLOR_FABRIC_SHADE = '#f5deb3';
const COLOR_STRIPE = '#e38628';

interface StakeRect {
  readonly key: 'tl' | 'tr' | 'bl' | 'br';
  readonly x: number;
  readonly y: number;
}

/**
 * Pixel-art perimeter construction fence:
 * - 4 wooden corner stakes with subtle ground shadow dots & protruding heads
 * - 4 light beige/ivory perimeter ribbons tied between stakes (back & sides taller, front thinner/lower)
 * - 100% transparent interior so construction sprite stages & clearing terrain remain unobstructed
 */
export const ConstructionFence: React.FC<ConstructionFenceProps> = ({
  width,
  height,
  status,
  reducedMotion = false,
  variant = 'building',
  testId,
  className = '',
}) => {
  const safeW = Math.max(24, Math.round(Number.isFinite(width) ? width : 32));
  const safeH = Math.max(24, Math.round(Number.isFinite(height) ? height : 32));
  const minDim = Math.min(safeW, safeH);

  const isActive = status === 'ACTIVE';
  const isPending = status === 'PENDING';
  const isAnimated = isActive && !reducedMotion;

  // Responsive pixel dimensions anchored strictly inside [0..safeW, 0..safeH]
  const stakeW = minDim >= 64 ? 4 : 3;
  const stakeH = Math.round(Math.min(18, Math.max(11, minDim * 0.24)));
  const headProtrude = minDim >= 64 ? 3 : 2;

  // Ribbon thickness: ~1/4 - 1/3 of stake height for back/sides, thinner/lower on front edge
  const backThickness = Math.max(3, Math.min(5, Math.round(stakeH * 0.3)));
  const sideThickness = Math.max(2, Math.min(4, Math.round(stakeH * 0.24)));
  const frontThickness = Math.max(2, Math.min(3, Math.round(stakeH * 0.18)));

  const padX = 1;
  const topY = 0;
  const bottomY = Math.max(0, safeH - stakeH - 1);
  const leftX = padX;
  const rightX = Math.max(padX, safeW - padX - stakeW);

  const stakes: readonly StakeRect[] = [
    { key: 'tl', x: leftX, y: topY },
    { key: 'tr', x: rightX, y: topY },
    { key: 'bl', x: leftX, y: bottomY },
    { key: 'br', x: rightX, y: bottomY },
  ];

  // Ribbon anchor coordinates (strictly perimeter, never entering the sprite center)
  const backAttachY = topY + headProtrude;
  const backSag = minDim >= 96 ? 2.5 : 1.5;
  const backSpanStartX = leftX + stakeW - 1;
  const backSpanEndX = rightX + 1;
  const midX = (backSpanStartX + backSpanEndX) / 2;

  const frontAttachY = bottomY + stakeH - frontThickness - 1;
  const frontSag = minDim >= 96 ? 1.5 : 1;

  const leftRibbonX = leftX + 0.5;
  const rightRibbonX = rightX + stakeW - sideThickness - 0.5;
  const sideStartY = topY + headProtrude + Math.max(1, backThickness - 1);
  const sideEndY = bottomY + Math.max(2, stakeH - frontThickness - 1);
  const sideMidY = (sideStartY + sideEndY) / 2;
  const sideSag = minDim >= 96 ? 2 : 1;

  const hSwayClass = isAnimated ? 'fq-fence-ribbon-sway' : undefined;
  const vSwayClass = isAnimated ? 'fq-fence-ribbon-sway-side' : undefined;

  return (
    <div
      data-testid={testId}
      data-fence-status={status}
      data-fence-animated={isAnimated ? 'true' : 'false'}
      data-fence-variant={variant}
      aria-hidden="true"
      className={`absolute inset-0 pointer-events-none overflow-hidden select-none ${
        isPending ? 'opacity-65' : ''
      } ${className}`.trim()}
    >
      <svg
        width={safeW}
        height={safeH}
        viewBox={`0 0 ${safeW} ${safeH}`}
        fill="none"
        shapeRendering="crispEdges"
        className="block w-full h-full pointer-events-none"
      >
        {/* Back (top) perimeter ribbon — slightly taller, tied below protruding stake heads */}
        <g data-testid="fence-ribbon-back" className={hSwayClass}>
          <path
            d={`M ${backSpanStartX} ${backAttachY} Q ${midX} ${backAttachY + backSag} ${backSpanEndX} ${backAttachY} L ${backSpanEndX} ${
              backAttachY + backThickness
            } Q ${midX} ${backAttachY + backThickness + backSag} ${backSpanStartX} ${
              backAttachY + backThickness
            } Z`}
            fill={COLOR_FABRIC_BASE}
            stroke={COLOR_WOOD_DARK}
            strokeWidth={0.75}
          />
          <path
            d={`M ${backSpanStartX + 1} ${backAttachY + backThickness * 0.5} Q ${midX} ${
              backAttachY + backThickness * 0.5 + backSag
            } ${backSpanEndX - 1} ${backAttachY + backThickness * 0.5}`}
            stroke={COLOR_STRIPE}
            strokeWidth={1}
          />
          {/* Knot ties at top-left & top-right stakes */}
          <rect x={leftX} y={backAttachY} width={stakeW} height={2} fill={COLOR_TIE} />
          <rect x={rightX} y={backAttachY} width={stakeW} height={2} fill={COLOR_TIE} />
        </g>

        {/* Left & Right perimeter side ribbons — gentle inward sag along outer edge */}
        <g data-testid="fence-ribbon-left" className={vSwayClass}>
          <path
            d={`M ${leftRibbonX} ${sideStartY} Q ${leftRibbonX + sideSag} ${sideMidY} ${leftRibbonX} ${sideEndY} L ${
              leftRibbonX + sideThickness
            } ${sideEndY} Q ${leftRibbonX + sideThickness + sideSag} ${sideMidY} ${
              leftRibbonX + sideThickness
            } ${sideStartY} Z`}
            fill={COLOR_FABRIC_SHADE}
            stroke={COLOR_WOOD_DARK}
            strokeWidth={0.75}
          />
          <path
            d={`M ${leftRibbonX + sideThickness * 0.5} ${sideStartY + 1} Q ${
              leftRibbonX + sideThickness * 0.5 + sideSag
            } ${sideMidY} ${leftRibbonX + sideThickness * 0.5} ${sideEndY - 1}`}
            stroke={COLOR_STRIPE}
            strokeWidth={0.85}
          />
        </g>

        <g data-testid="fence-ribbon-right" className={vSwayClass}>
          <path
            d={`M ${rightRibbonX} ${sideStartY} Q ${rightRibbonX - sideSag} ${sideMidY} ${rightRibbonX} ${sideEndY} L ${
              rightRibbonX + sideThickness
            } ${sideEndY} Q ${rightRibbonX + sideThickness - sideSag} ${sideMidY} ${
              rightRibbonX + sideThickness
            } ${sideStartY} Z`}
            fill={COLOR_FABRIC_SHADE}
            stroke={COLOR_WOOD_DARK}
            strokeWidth={0.75}
          />
          <path
            d={`M ${rightRibbonX + sideThickness * 0.5} ${sideStartY + 1} Q ${
              rightRibbonX + sideThickness * 0.5 - sideSag
            } ${sideMidY} ${rightRibbonX + sideThickness * 0.5} ${sideEndY - 1}`}
            stroke={COLOR_STRIPE}
            strokeWidth={0.85}
          />
        </g>

        {/* Front (bottom) perimeter ribbon — thinner & lower so center sprite stays clear */}
        <g data-testid="fence-ribbon-front" className={hSwayClass}>
          <path
            d={`M ${backSpanStartX} ${frontAttachY} Q ${midX} ${frontAttachY + frontSag} ${backSpanEndX} ${frontAttachY} L ${backSpanEndX} ${
              frontAttachY + frontThickness
            } Q ${midX} ${frontAttachY + frontThickness + frontSag} ${backSpanStartX} ${
              frontAttachY + frontThickness
            } Z`}
            fill={COLOR_FABRIC_BASE}
            stroke={COLOR_WOOD_DARK}
            strokeWidth={0.7}
          />
          <path
            d={`M ${backSpanStartX + 1} ${frontAttachY + frontThickness * 0.5} Q ${midX} ${
              frontAttachY + frontThickness * 0.5 + frontSag
            } ${backSpanEndX - 1} ${frontAttachY + frontThickness * 0.5}`}
            stroke={COLOR_STRIPE}
            strokeWidth={0.8}
          />
          {/* Knot ties at bottom-left & bottom-right stakes */}
          <rect x={leftX} y={frontAttachY} width={stakeW} height={1.5} fill={COLOR_TIE} />
          <rect x={rightX} y={frontAttachY} width={stakeW} height={1.5} fill={COLOR_TIE} />
        </g>

        {/* 4 Wooden Corner Stakes (drawn over ribbon ties with ground shadow dots) */}
        {stakes.map((s) => (
          <g key={s.key} data-testid={`fence-stake-${s.key}`}>
            {/* Small pixel ground shadow dot on the grass at stake foot */}
            <rect
              data-testid={`fence-stake-shadow-${s.key}`}
              x={Math.max(0, s.x - 1)}
              y={Math.min(safeH - 2, s.y + stakeH - 1)}
              width={stakeW + 2}
              height={2}
              fill={COLOR_SHADOW}
              fillOpacity={0.45}
            />
            {/* Dark pixel outline */}
            <rect x={s.x} y={s.y} width={stakeW} height={stakeH} fill={COLOR_OUTLINE} />
            {/* Mid-brown wooden shaft */}
            <rect
              x={s.x + 1}
              y={s.y + 1}
              width={Math.max(1, stakeW - 2)}
              height={Math.max(1, stakeH - 2)}
              fill={COLOR_WOOD_MID}
            />
            {/* Right-edge dark grain shadow */}
            {stakeW >= 4 && (
              <rect
                x={s.x + stakeW - 2}
                y={s.y + 2}
                width={1}
                height={Math.max(1, stakeH - 3)}
                fill={COLOR_WOOD_DARK}
              />
            )}
            {/* Top stake head highlight protruding above the ribbon */}
            <rect
              x={s.x + 1}
              y={s.y + 1}
              width={Math.max(1, stakeW - 2)}
              height={1}
              fill={COLOR_WOOD_LIGHT}
            />
          </g>
        ))}
      </svg>
    </div>
  );
};
