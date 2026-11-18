import React, { useState } from 'react';

export interface StatsBarDatum {
  key: string;
  label: string;
  axisLabel?: string;
  value: number;
  sessions?: number;
  isCurrent?: boolean;
}

export interface StatsBarChartProps {
  bars: readonly StatsBarDatum[];
  highlightKey?: string;
  valueFormatter?: (value: number) => string;
  tooltipFormatter?: (bar: StatsBarDatum) => string;
  ariaLabel: string;
  emptyLabel: string;
  className?: string;
}

const SVG_WIDTH = 368;
const SVG_HEIGHT = 148;
const PAD_LEFT = 34;
const PAD_RIGHT = 8;
const PAD_TOP = 12;
const PAD_BOTTOM = 24;
const PLOT_WIDTH = SVG_WIDTH - PAD_LEFT - PAD_RIGHT;
const PLOT_HEIGHT = SVG_HEIGHT - PAD_TOP - PAD_BOTTOM;

function sanitizeValue(value: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0;
}

function computeNiceYAxisMax(maxVal: number): number {
  if (!Number.isFinite(maxVal) || maxVal <= 0) return 10;
  const rough = maxVal;
  const exp = Math.floor(Math.log10(rough));
  const base = Math.pow(10, exp);
  const candidates = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
  for (const c of candidates) {
    const scaled = c * base;
    if (scaled >= rough) {
      return Math.max(10, Math.ceil(scaled));
    }
  }
  return Math.max(10, Math.ceil(10 * base));
}

function shouldRenderXAxisLabel(index: number, total: number): boolean {
  if (total <= 12) return true;
  if (index === 0 || index === total - 1) return true;
  const stride = Math.ceil(total / 6);
  if (index % stride !== 0) return false;
  return total - 1 - index >= Math.max(2, Math.floor(stride / 2));
}

export const StatsBarChart: React.FC<StatsBarChartProps> = ({
  bars,
  highlightKey,
  valueFormatter,
  tooltipFormatter,
  ariaLabel,
  emptyLabel,
  className = '',
}) => {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const safeValues = bars.map((bar) => sanitizeValue(bar.value));
  const maxVal = safeValues.reduce((acc, v) => (v > acc ? v : acc), 0);
  const isEmpty = bars.length === 0 || maxVal <= 0;
  const formatVal = valueFormatter ?? ((v: number) => `${Math.round(v)}`);
  const formatTip =
    tooltipFormatter ?? ((bar: StatsBarDatum) => `${bar.label}: ${formatVal(sanitizeValue(bar.value))}`);

  if (isEmpty) {
    return (
      <div
        role="region"
        aria-label={ariaLabel}
        data-testid="stats-bar-chart-empty"
        className={`w-full h-[148px] rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center px-4 text-xs font-medium text-slate-300 ${className}`.trim()}
      >
        {emptyLabel}
      </div>
    );
  }

  const yMax = computeNiceYAxisMax(maxVal);
  const yTicks = [0, Math.round(yMax / 2), yMax];
  const slotWidth = PLOT_WIDTH / bars.length;
  const barWidth = Math.max(4, Math.min(24, slotWidth * 0.62));
  const baselineY = PAD_TOP + PLOT_HEIGHT;

  const activeBar =
    activeIndex !== null && activeIndex >= 0 && activeIndex < bars.length ? bars[activeIndex] : null;
  const activeCenterPct =
    activeIndex !== null
      ? ((PAD_LEFT + slotWidth * (activeIndex + 0.5)) / SVG_WIDTH) * 100
      : 50;
  const tooltipAlign: 'left' | 'center' | 'right' =
    activeCenterPct < 24 ? 'left' : activeCenterPct > 76 ? 'right' : 'center';

  return (
    <div
      data-testid="stats-bar-chart"
      className={`relative w-full rounded-xl bg-slate-900 border border-slate-800 p-1.5 select-none ${className}`.trim()}
    >
      {activeBar && (
        <div
          role="tooltip"
          data-testid="stats-bar-tooltip"
          data-tooltip-align={tooltipAlign}
          style={
            tooltipAlign === 'center'
              ? { left: `${activeCenterPct.toFixed(1)}%` }
              : undefined
          }
          className={`pointer-events-none absolute top-1.5 z-10 max-w-[220px] whitespace-nowrap rounded-md border border-slate-700 bg-slate-950/95 px-2 py-1 text-[11px] font-medium text-slate-100 shadow-lg motion-reduce:transition-none ${
            tooltipAlign === 'left'
              ? 'left-2'
              : tooltipAlign === 'right'
              ? 'right-2'
              : '-translate-x-1/2'
          }`}
        >
          <span className="font-semibold text-indigo-200">{activeBar.label}</span>
          <span className="mx-1 text-slate-500">·</span>
          <span>{formatTip(activeBar)}</span>
        </div>
      )}

      <svg
        viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
        role="img"
        aria-label={ariaLabel}
        className="w-full h-auto block overflow-visible"
      >
        {/* Horizontal Y-axis gridlines & labels */}
        {yTicks.map((tick) => {
          const ratio = yMax > 0 ? tick / yMax : 0;
          const y = baselineY - ratio * PLOT_HEIGHT;
          return (
            <g key={`tick-${tick}`}>
              <line
                x1={PAD_LEFT}
                x2={SVG_WIDTH - PAD_RIGHT}
                y1={y}
                y2={y}
                stroke={tick === 0 ? '#475569' : '#1e293b'}
                strokeWidth={tick === 0 ? 1.25 : 1}
                strokeDasharray={tick === 0 ? undefined : '3 3'}
              />
              <text
                x={PAD_LEFT - 5}
                y={y + 3}
                textAnchor="end"
                fill="#cbd5e1"
                fontSize={9}
                className="font-mono tabular-nums"
              >
                {formatVal(tick)}
              </text>
            </g>
          );
        })}

        {/* Bars & interactive focus targets */}
        {bars.map((bar, index) => {
          const val = safeValues[index];
          const isHighlighted =
            highlightKey !== undefined ? bar.key === highlightKey : Boolean(bar.isCurrent);
          const isActive = activeIndex === index;
          const slotX = PAD_LEFT + index * slotWidth;
          const barX = slotX + (slotWidth - barWidth) / 2;
          const barHeight = val > 0 ? Math.max(3, (val / yMax) * PLOT_HEIGHT) : 2;
          const barY = baselineY - barHeight;
          const barFill =
            val === 0
              ? isActive
                ? '#94a3b8'
                : '#475569'
              : isHighlighted
              ? isActive
                ? '#c7d2fe'
                : '#a5b4fc'
              : isActive
              ? '#818cf8'
              : '#6366f1';

          const barAria = `${bar.label}: ${formatTip(bar)}`;
          const xAxisText = bar.axisLabel ?? bar.label;

          return (
            <g key={bar.key}>
              <g
                tabIndex={0}
                role="button"
                aria-label={barAria}
                data-bar-key={bar.key}
                data-highlighted={isHighlighted ? 'true' : 'false'}
                data-zero-bar={val === 0 ? 'true' : 'false'}
                onMouseEnter={() => setActiveIndex(index)}
                onMouseLeave={() => setActiveIndex((prev) => (prev === index ? null : prev))}
                onFocus={() => setActiveIndex(index)}
                onBlur={() => setActiveIndex((prev) => (prev === index ? null : prev))}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setActiveIndex(null);
                  } else if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setActiveIndex((prev) => (prev === index ? null : index));
                  }
                }}
                className="cursor-pointer outline-none focus:outline-none"
              >
                <rect
                  x={slotX}
                  y={PAD_TOP}
                  width={slotWidth}
                  height={PLOT_HEIGHT}
                  fill="transparent"
                />
                {isActive && (
                  <rect
                    x={Math.max(PAD_LEFT, barX - 2)}
                    y={PAD_TOP}
                    width={barWidth + 4}
                    height={PLOT_HEIGHT}
                    rx={3}
                    fill="#334155"
                    opacity={0.35}
                  />
                )}
                <rect
                  x={barX}
                  y={barY}
                  width={barWidth}
                  height={barHeight}
                  rx={val > 0 ? 2 : 1}
                  fill={barFill}
                  className="transition-[fill,opacity] duration-150 motion-reduce:transition-none"
                />
              </g>

              {shouldRenderXAxisLabel(index, bars.length) && (
                <text
                  x={slotX + slotWidth / 2}
                  y={baselineY + 14}
                  textAnchor="middle"
                  fill={isHighlighted ? '#e0e7ff' : '#cbd5e1'}
                  fontSize={9}
                  fontWeight={isHighlighted ? 700 : 500}
                  data-x-label={xAxisText}
                  className="font-mono tabular-nums pointer-events-none"
                >
                  {xAxisText}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
};
