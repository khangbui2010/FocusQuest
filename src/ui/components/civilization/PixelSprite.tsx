import React, { useMemo } from 'react';
import { PixelSpriteMatrix, TINY_TOWN_PALETTE } from './spriteData.ts';

export interface SpriteRectRun {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly fill: string;
}

/**
 * Pure run-length encoder that groups horizontally adjacent same-color pixels
 * in each row into single <rect> segments. Zero DOM/canvas access (SSR safe).
 */
export function computeSpriteRects(sprite: PixelSpriteMatrix): readonly SpriteRectRun[] {
  const runs: SpriteRectRun[] = [];

  for (let y = 0; y < sprite.rows.length; y++) {
    const row = sprite.rows[y];
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      if (ch === '.' || !TINY_TOWN_PALETTE[ch]) {
        x++;
        continue;
      }
      let runEnd = x + 1;
      while (runEnd < row.length && row[runEnd] === ch) {
        runEnd++;
      }
      runs.push({
        x,
        y,
        width: runEnd - x,
        fill: TINY_TOWN_PALETTE[ch],
      });
      x = runEnd;
    }
  }

  return runs;
}

export interface PixelSpriteProps {
  sprite: PixelSpriteMatrix;
  width?: number;
  height?: number;
  className?: string;
  title?: string;
  ariaLabel?: string;
}

/**
 * Renders a pixel-art sprite matrix as crisp inline SVG (<rect> runs per row)
 * with shape-rendering="crispEdges". Safe for React SSR on Node.js.
 */
export const PixelSprite: React.FC<PixelSpriteProps> = ({
  sprite,
  width,
  height,
  className,
  title,
  ariaLabel,
}) => {
  const runs = useMemo(() => computeSpriteRects(sprite), [sprite]);

  return (
    <svg
      viewBox={`0 0 ${sprite.width} ${sprite.height}`}
      width={width ?? sprite.width}
      height={height ?? sprite.height}
      shapeRendering="crispEdges"
      preserveAspectRatio="xMidYMid meet"
      data-sprite-id={sprite.id}
      role={ariaLabel ? 'img' : undefined}
      aria-label={ariaLabel}
      aria-hidden={ariaLabel ? undefined : true}
      className={className}
    >
      {title && <title>{title}</title>}
      {runs.map((run) => (
        <rect
          key={`${run.y}-${run.x}`}
          x={run.x}
          y={run.y}
          width={run.width}
          height={1}
          fill={run.fill}
        />
      ))}
    </svg>
  );
};
