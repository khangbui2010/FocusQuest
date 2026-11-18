import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { STONE_AGE_BUILDING_DEFINITIONS } from '../../../core/civilization/buildingCatalog.ts';
import { REUSED_TINY_TOWN_TILES } from './spriteData.ts';
import {
  PixelSprite,
  TileImage,
  getBuildingSprite,
  getTerrainTile,
} from './spriteRegistry.ts';
import {
  TERRAIN_DECOR_SEED,
  CANOPY_GROVE_2X2_GREEN,
  CANOPY_GROVE_2X2_ORANGE,
  CANOPY_CROSS_B_GREEN,
  CANOPY_CROSS_B_ORANGE,
  TALL_TREE_1X2_GREEN,
  TALL_TREE_1X2_ORANGE,
  LOCKED_FOREST_DARKEN_OPACITY,
  LOCKED_TREE_DARKEN_FACTOR,
  getCellDecor,
} from './terrainDecor.ts';
import { TerrainCellLayers } from './TerrainCellLayers.tsx';
import { StatsBarChart, StatsBarDatum } from '../StatsBarChart.tsx';
import { useTranslation } from '../../../i18n/I18nContext.tsx';
import {
  aggregateDayStats,
  aggregateMonthStats,
  aggregateYearStats,
} from '../../../core/stats/statsAggregator.ts';
import { buildSimulatedDailyStats } from '../../services/extensionClient.ts';

const PREVIEW_ANCHOR_DATE = '2026-11-17';
const PREVIEW_SIM_STATS = buildSimulatedDailyStats(PREVIEW_ANCHOR_DATE);
const PREVIEW_DAY = aggregateDayStats(PREVIEW_SIM_STATS, PREVIEW_ANCHOR_DATE);
const PREVIEW_MONTH = aggregateMonthStats(PREVIEW_SIM_STATS, '2026-11');
const PREVIEW_YEAR = aggregateYearStats(PREVIEW_SIM_STATS, '2026');

const PREVIEW_7_BARS: StatsBarDatum[] = PREVIEW_DAY.trend7Days.map((d) => ({
  key: d.dateISO,
  label: d.dateISO,
  axisLabel: d.dateISO.slice(5),
  value: d.focusMinutes,
  sessions: d.sessions,
  isCurrent: d.dateISO === PREVIEW_ANCHOR_DATE,
}));

const PREVIEW_30_BARS: StatsBarDatum[] = PREVIEW_MONTH.days.map((d) => ({
  key: d.dateISO,
  label: d.dateISO,
  axisLabel: `${d.dayNumber}`,
  value: d.focusMinutes,
  sessions: d.sessions,
  isCurrent: d.dateISO === PREVIEW_ANCHOR_DATE,
}));

const PREVIEW_12_BARS: StatsBarDatum[] = PREVIEW_YEAR.months.map((m) => ({
  key: m.monthKey,
  label: m.monthKey,
  axisLabel: `${m.monthNumber}`,
  value: m.focusMinutes,
  sessions: m.sessions,
  isCurrent: m.monthKey === '2026-11',
}));

const SCALES = [1, 2, 4] as const;
const TERRAIN_SAMPLE_COLS = 8;
const TERRAIN_SAMPLE_ROWS = 4;

const REUSED_TILE_INSPECTION_LIST = [
  { index: REUSED_TINY_TOWN_TILES.GRASS_PLAIN, label: '0 · Plain Grass' },
  { index: REUSED_TINY_TOWN_TILES.GRASS_TUFTS, label: '1 · Grass Tufts' },
  { index: REUSED_TINY_TOWN_TILES.GRASS_FLOWERS, label: '2 · Wildflowers' },
  { index: REUSED_TINY_TOWN_TILES.SPROUT, label: '17 · Sprout' },
  { index: REUSED_TINY_TOWN_TILES.MUSHROOMS, label: '29 · Mushrooms' },
  { index: REUSED_TINY_TOWN_TILES.MOSSY_STONE, label: '43 · Mossy Stone' },
  { index: REUSED_TINY_TOWN_TILES.DIRT_CENTER, label: '25 · Dirt Center' },
  { index: REUSED_TINY_TOWN_TILES.DIRT_NOTCH_TL, label: '39 · Dirt Notch TL' },
  { index: REUSED_TINY_TOWN_TILES.TREE_CONIFER_ORANGE, label: '3 · Autumn Tall Top (M1)' },
  { index: REUSED_TINY_TOWN_TILES.TREE_ROUND_ORANGE, label: '15 · Autumn Base (M1 Only)' },
  { index: REUSED_TINY_TOWN_TILES.TREE_CONIFER_GREEN, label: '4 · Green Tall Top (M2)' },
  { index: REUSED_TINY_TOWN_TILES.TREE_ROUND_GREEN, label: '16 · Green Base (M2 Only)' },
  { index: REUSED_TINY_TOWN_TILES.GREEN_BUSH, label: '5 · Green Bush (Sole Filler & Unlocked)' },
  { index: REUSED_TINY_TOWN_TILES.WOOD_LOG, label: '106 · Log' },
  { index: REUSED_TINY_TOWN_TILES.SUPPLY_SACK, label: '107 · Sack / Pot' },
  { index: REUSED_TINY_TOWN_TILES.WOODCUTTER_AXE, label: '127 · Woodcutter Axe' },
  { index: REUSED_TINY_TOWN_TILES.STORAGE_BARREL, label: '130 · Barrel / Basket' },
] as const;

const ASSEMBLED_CANOPY_SAMPLES: readonly {
  readonly id: string;
  readonly label: string;
  readonly subtitle: string;
  readonly cols: number;
  readonly rows: readonly (readonly (number | null)[])[];
}[] = [
  {
    id: 'tall_1x2_orange',
    label: 'M1 · Tall 1×2 Autumn Tree ([3] / [15])',
    subtitle: 'Two-cell vertical autumn tree (top #3 over trunk #15)',
    cols: 1,
    rows: [[TALL_TREE_1X2_ORANGE[0]], [TALL_TREE_1X2_ORANGE[1]]],
  },
  {
    id: 'tall_1x2_green',
    label: 'M2 · Tall 1×2 Green Tree ([4] / [16])',
    subtitle: 'Two-cell vertical green tree (top #4 over trunk #16)',
    cols: 1,
    rows: [[TALL_TREE_1X2_GREEN[0]], [TALL_TREE_1X2_GREEN[1]]],
  },
  {
    id: 'grove_2x2_green',
    label: 'M3 · 2×2 Green Cluster ([6, 8] / [30, 32])',
    subtitle: 'Seamless 4-tile green grove',
    cols: 2,
    rows: [
      [CANOPY_GROVE_2X2_GREEN[0][0], CANOPY_GROVE_2X2_GREEN[0][1]],
      [CANOPY_GROVE_2X2_GREEN[1][0], CANOPY_GROVE_2X2_GREEN[1][1]],
    ],
  },
  {
    id: 'grove_2x2_orange',
    label: 'M4 · 2×2 Autumn Cluster ([9, 11] / [33, 35])',
    subtitle: 'Seamless 4-tile autumn grove',
    cols: 2,
    rows: [
      [CANOPY_GROVE_2X2_ORANGE[0][0], CANOPY_GROVE_2X2_ORANGE[0][1]],
      [CANOPY_GROVE_2X2_ORANGE[1][0], CANOPY_GROVE_2X2_ORANGE[1][1]],
    ],
  },
  {
    id: 'cross_b_green',
    label: 'M5 · 3×3 Green Cross ([·, 7, ·] / [18, 19, 20] / [·, 31, ·])',
    subtitle: '5-tile cross with reserved "—" corners and interior #19 centered',
    cols: 3,
    rows: [
      [CANOPY_CROSS_B_GREEN[0][0], CANOPY_CROSS_B_GREEN[0][1], CANOPY_CROSS_B_GREEN[0][2]],
      [CANOPY_CROSS_B_GREEN[1][0], CANOPY_CROSS_B_GREEN[1][1], CANOPY_CROSS_B_GREEN[1][2]],
      [CANOPY_CROSS_B_GREEN[2][0], CANOPY_CROSS_B_GREEN[2][1], CANOPY_CROSS_B_GREEN[2][2]],
    ],
  },
  {
    id: 'cross_b_orange',
    label: 'M6 · 3×3 Autumn Cross ([·, 10, ·] / [21, 22, 23] / [·, 34, ·])',
    subtitle: '5-tile autumn cross with reserved "—" corners and interior #22 centered',
    cols: 3,
    rows: [
      [CANOPY_CROSS_B_ORANGE[0][0], CANOPY_CROSS_B_ORANGE[0][1], CANOPY_CROSS_B_ORANGE[0][2]],
      [CANOPY_CROSS_B_ORANGE[1][0], CANOPY_CROSS_B_ORANGE[1][1], CANOPY_CROSS_B_ORANGE[1][2]],
      [CANOPY_CROSS_B_ORANGE[2][0], CANOPY_CROSS_B_ORANGE[2][1], CANOPY_CROSS_B_ORANGE[2][2]],
    ],
  },
];

export interface SpriteGalleryProps {
  onBack?: () => void;
}

/**
 * Developer & artist visual review gallery accessible ONLY in standalone
 * web preview (!isChromeExtension() && location.hash === '#sprites').
 */
export const SpriteGallery: React.FC<SpriteGalleryProps> = ({ onBack }) => {
  const { t } = useTranslation();
  const formatTooltip = (bar: StatsBarDatum) =>
    t('stats.chart.tooltip', {
      minutes: Math.round(bar.value),
      sessions: bar.sessions ?? 0,
    });

  const handleBack = () => {
    if (onBack) {
      onBack();
      return;
    }
    if (typeof window !== 'undefined') {
      window.location.hash = '';
    }
  };

  return (
    <div
      data-testid="sprite-gallery-page"
      className="min-h-screen bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 p-6 font-sans"
    >
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
              Preview Only · #sprites
            </p>
            <h1 className="text-xl font-bold tracking-tight">
              Focus Quest — Stone Age Sprite Gallery (Stage 4a &amp; 4a-3)
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              6 công trình Stone Age + cảnh quan đất/cỏ/mầm/nấm (vùng mở) &amp; 6 mẫu cây M1–M6 + bụi filler #5 (~30% mật độ cây) với lớp phủ tối đồng đều cả nền và cây (vùng chưa mở).
            </p>
          </div>

          <button
            type="button"
            onClick={handleBack}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to App</span>
          </button>
        </header>

        {/* Section 1: Terrain Grass Patch at 1x, 2x, 4x */}
        <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-bold">
              Terrain Grass Patch ({TERRAIN_SAMPLE_COLS}×{TERRAIN_SAMPLE_ROWS} Deterministic Grid)
            </h2>
            <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
              Tiny Town CC0 · Tiles 0 (plain), 1 (tufts), 2 (flowers)
            </span>
          </div>

          <div className="flex flex-wrap items-start gap-6">
            {SCALES.map((scale) => {
              const tileSize = 16 * scale;
              return (
                <div key={scale} className="space-y-1.5">
                  <div className="text-[11px] font-mono font-semibold text-slate-600 dark:text-slate-300">
                    {`${scale}× (${tileSize}px/tile)`}
                  </div>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: `repeat(${TERRAIN_SAMPLE_COLS}, ${tileSize}px)`,
                      width: TERRAIN_SAMPLE_COLS * tileSize,
                    }}
                    className="rounded-lg overflow-hidden border border-slate-300 dark:border-slate-700 shadow-xs"
                  >
                    {Array.from({ length: TERRAIN_SAMPLE_ROWS }).map((_, rowIdx) =>
                      Array.from({ length: TERRAIN_SAMPLE_COLS }).map((__, colIdx) => {
                        const tile = getTerrainTile('grass', colIdx, rowIdx);
                        return (
                          <TileImage
                            key={`${colIdx}-${rowIdx}`}
                            pack={tile.pack}
                            tileIndex={tile.tileIndex}
                            size={tileSize}
                            className="block"
                          />
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Reused Tiny Town Tile Reference Strip */}
          <div className="pt-3 border-t border-slate-200 dark:border-slate-800">
            <div className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-2">
              CC0 Tiny Town Reference Tiles (at 2× / 32px)
            </div>
            <div className="flex flex-wrap gap-3">
              {REUSED_TILE_INSPECTION_LIST.map((item) => (
                <div
                  key={item.index}
                  className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 text-[11px]"
                >
                  <TileImage pack="tiny-town" tileIndex={item.index} size={32} />
                  <span className="font-mono text-slate-700 dark:text-slate-200">{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Section 2: All 6 Stone Age Buildings at 1x, 2x, 4x */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {STONE_AGE_BUILDING_DEFINITIONS.map((def) => {
            const sprite = getBuildingSprite(def.id);
            if (!sprite) return null;

            return (
              <div
                key={def.id}
                data-testid={`gallery-building-${def.id}`}
                className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                      {def.name}
                    </h3>
                    <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                      {`${def.id} · ${def.footprint.width}×${def.footprint.height} cells (${sprite.width}×${sprite.height}px)`}
                    </p>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] font-semibold text-slate-600 dark:text-slate-300">
                    {def.category}
                  </span>
                </div>

                <div className="flex flex-wrap items-end gap-5 pt-1">
                  {SCALES.map((scale) => {
                    const scaledW = sprite.width * scale;
                    const scaledH = sprite.height * scale;
                    return (
                      <div key={scale} className="space-y-1">
                        <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                          {`${scale}× (${scaledW}×${scaledH})`}
                        </div>
                        <div
                          style={{
                            width: scaledW,
                            height: scaledH,
                            backgroundColor: '#84c669',
                          }}
                          className="rounded border border-slate-300 dark:border-slate-700 flex items-center justify-center overflow-hidden"
                        >
                          <PixelSprite
                            sprite={sprite}
                            width={scaledW}
                            height={scaledH}
                            ariaLabel={`${def.name} ${scale}x`}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {sprite.reusedTiles.length > 0 && (
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-slate-800 pt-2">
                    Tiny Town ref: {sprite.reusedTiles.map((r) => `#${r.tileIndex}`).join(', ')}
                  </div>
                )}
              </div>
            );
          })}
        </section>

        {/* Section 3: Stage 4a-2 (V2) Assembled Canopy Forest Blocks + Unlocked vs Locked Landscape */}
        <section
          data-testid="gallery-landscape-v2"
          className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-5"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-bold">
              Visual Landscape &amp; 6 Locked Forest Recipes (M1–M6) — Stage 4a-3
            </h2>
            <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
              Pure UI decor · Ground &amp; trees darkened uniformly ({Math.round(LOCKED_FOREST_DARKEN_OPACITY * 100)}%, tree factor {LOCKED_TREE_DARKEN_FACTOR}×)
            </span>
          </div>

          {/* Assembled Multi-Tile Canopy Groves */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {ASSEMBLED_CANOPY_SAMPLES.map((sample) => (
              <div
                key={sample.id}
                data-testid={`gallery-canopy-${sample.id}`}
                className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 space-y-2.5 bg-slate-50/50 dark:bg-slate-800/30"
              >
                <div>
                  <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100">
                    {sample.label}
                  </h3>
                  <p className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                    {sample.subtitle}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-4">
                  {/* Normal grass preview */}
                  <div className="space-y-1">
                    <span className="text-[10px] font-mono text-slate-500">Full Light (2×)</span>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: `repeat(${sample.cols}, 32px)`,
                        width: sample.cols * 32,
                      }}
                      className="rounded border border-slate-300 dark:border-slate-700 overflow-hidden"
                    >
                      {sample.rows.flatMap((row, rIdx) =>
                        row.map((tileIdx, cIdx) => (
                          <div key={`${rIdx}-${cIdx}`} className="relative w-8 h-8">
                            <TileImage pack="tiny-town" tileIndex={0} size={32} className="block" />
                            {tileIdx !== null && (
                              <TileImage
                                pack="tiny-town"
                                tileIndex={tileIdx}
                                size={32}
                                className="absolute inset-0 block"
                              />
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Ground + tree overlay both under unified locked-forest darkening (UX-3) */}
                  <div className="space-y-1">
                    <span className="text-[10px] font-mono text-slate-500">
                      Locked Forest Darkened (2×)
                    </span>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: `repeat(${sample.cols}, 32px)`,
                        width: sample.cols * 32,
                      }}
                      className="rounded border border-slate-700 overflow-hidden"
                    >
                      {sample.rows.flatMap((row, rIdx) =>
                        row.map((tileIdx, cIdx) => (
                          <div key={`dark-${rIdx}-${cIdx}`} className="relative w-8 h-8 overflow-hidden">
                            <TerrainCellLayers
                              baseTile={0}
                              overlayTile={tileIdx}
                              isDarkened={true}
                              size={32}
                            />
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Side-by-side 8x4 Unlocked vs Locked Forest + L-shaped & Rectangular Chunk Boundaries */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-200 dark:border-slate-800">
            {[
              {
                id: 'unlocked_sample',
                title: '8×4 Unlocked Territory Sample (isUnlocked = true)',
                subtitle:
                  'Grass (0–2), dirt/notch patches (12–42), mossy stone (43), sprout (17), mushrooms (29), rare plain-grass bush (5)',
                cols: TERRAIN_SAMPLE_COLS,
                rows: TERRAIN_SAMPLE_ROWS,
                isCellUnlocked: () => true,
                offsetX: 0,
                offsetY: 0,
              },
              {
                id: 'locked_sample',
                title: '8×4 Locked Forest Border Sample (isUnlocked = false)',
                subtitle:
                  `Recipes M1–M6 + bush filler #5 (~30% trees) with ${Math.round(LOCKED_FOREST_DARKEN_OPACITY * 100)}% darkened ground & trees (${LOCKED_TREE_DARKEN_FACTOR}× tree factor)`,
                cols: TERRAIN_SAMPLE_COLS,
                rows: TERRAIN_SAMPLE_ROWS,
                isCellUnlocked: () => false,
                offsetX: -8,
                offsetY: 0,
              },
              {
                id: 'rect_border_sample',
                title: '8×4 Rectangular Chunk Boundary (Unlocked Left / Locked Right)',
                subtitle: 'Chunk (0,0) unlocked vs Chunk (4,0) locked forest (zero clipped units)',
                cols: 8,
                rows: 4,
                isCellUnlocked: (gx: number) => gx < 4,
                offsetX: 0,
                offsetY: 0,
              },
              {
                id: 'l_border_sample',
                title: '8×8 L-Shaped Chunk Boundary (3 Unlocked + 1 Locked Corner)',
                subtitle: 'Chunk (-4,-4) locked surrounded by unlocked chunks (-4,0), (0,-4), (0,0)',
                cols: 8,
                rows: 8,
                isCellUnlocked: (gx: number, gy: number) => !(gx < 0 && gy < 0),
                offsetX: -4,
                offsetY: -4,
              },
            ].map((panel) => (
              <div
                key={panel.id}
                data-testid={`gallery-${panel.id}`}
                className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 space-y-2 bg-slate-50/50 dark:bg-slate-800/30"
              >
                <div>
                  <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100">
                    {panel.title}
                  </h3>
                  <p className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                    {panel.subtitle}
                  </p>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: `repeat(${panel.cols}, 32px)`,
                    width: panel.cols * 32,
                  }}
                  className="rounded-lg overflow-hidden border border-slate-300 dark:border-slate-700 shadow-xs"
                >
                  {Array.from({ length: panel.rows }).map((_, rIdx) =>
                    Array.from({ length: panel.cols }).map((__, cIdx) => {
                      const gx = panel.offsetX + cIdx;
                      const gy = panel.offsetY + rIdx;
                      const decor = getCellDecor(
                        gx,
                        gy,
                        panel.isCellUnlocked(gx, gy),
                        TERRAIN_DECOR_SEED
                      );
                      return (
                        <div key={`${gx},${gy}`} className="relative w-8 h-8 overflow-hidden">
                          <TerrainCellLayers
                            baseTile={decor.baseTile}
                            overlayTile={decor.overlayTile}
                            isDarkened={decor.isDarkened}
                            size={32}
                          />
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Stage 4a-3 (b): Full 16x11 Locked Forest Algorithmic Patch */}
          <div
            data-testid="gallery-locked_forest_16x11"
            className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 space-y-2 bg-slate-50/50 dark:bg-slate-800/30"
          >
            <div>
              <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100">
                16×11 Locked Forest Algorithm Preview (Stage 4a-3 · M1–M6 + Bush #5 · ~30% Density)
              </h3>
              <p className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                Generated via getCellDecor(x, y, false, TERRAIN_DECOR_SEED) · Ground &amp; trees darkened ({Math.round(LOCKED_FOREST_DARKEN_OPACITY * 100)}%, tree factor {LOCKED_TREE_DARKEN_FACTOR}×) · Tiles 15/16 strictly M1/M2 bases
              </p>
            </div>

            <div className="overflow-x-auto">
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(16, 32px)',
                  width: 16 * 32,
                }}
                className="rounded-lg overflow-hidden border border-slate-300 dark:border-slate-700 shadow-xs"
              >
                {Array.from({ length: 11 }).map((_, rIdx) =>
                  Array.from({ length: 16 }).map((__, cIdx) => {
                    const gx = -8 + cIdx;
                    const gy = -8 + rIdx;
                    const decor = getCellDecor(
                      gx,
                      gy,
                      false,
                      TERRAIN_DECOR_SEED,
                      (cx, cy) => cx < -8 || cx >= 8 || cy < -8 || cy >= 3
                    );
                    return (
                      <div key={`16x11-${gx},${gy}`} className="relative w-8 h-8 overflow-hidden">
                        <TerrainCellLayers
                          baseTile={decor.baseTile}
                          overlayTile={decor.overlayTile}
                          isDarkened={decor.isDarkened}
                          size={32}
                        />
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Section 4: Stage 3 Pure SVG StatsBarChart Preview (368px popup width) */}
        <section
          data-testid="gallery-stats-bar-chart-preview"
          className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-4"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-bold">{t('stats.chart.previewHeading')}</h2>
            <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
              368px · Day (7) / Month (30) / Year (12)
            </span>
          </div>

          <div className="flex flex-wrap gap-4">
            <div className="w-[368px] max-w-full space-y-1.5">
              <div className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                {t('stats.chart.preview7Bars')}
              </div>
              <StatsBarChart
                bars={PREVIEW_7_BARS}
                highlightKey={PREVIEW_ANCHOR_DATE}
                tooltipFormatter={formatTooltip}
                ariaLabel={`${t('stats.chart.ariaLabel')} — ${t('stats.chart.preview7Bars')}`}
                emptyLabel={t('stats.chart.empty')}
              />
            </div>

            <div className="w-[368px] max-w-full space-y-1.5">
              <div className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                {t('stats.chart.preview30Bars')}
              </div>
              <StatsBarChart
                bars={PREVIEW_30_BARS}
                highlightKey={PREVIEW_ANCHOR_DATE}
                tooltipFormatter={formatTooltip}
                ariaLabel={`${t('stats.chart.ariaLabel')} — ${t('stats.chart.preview30Bars')}`}
                emptyLabel={t('stats.chart.empty')}
              />
            </div>

            <div className="w-[368px] max-w-full space-y-1.5">
              <div className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                {t('stats.chart.preview12Bars')}
              </div>
              <StatsBarChart
                bars={PREVIEW_12_BARS}
                highlightKey="2026-11"
                tooltipFormatter={formatTooltip}
                ariaLabel={`${t('stats.chart.ariaLabel')} — ${t('stats.chart.preview12Bars')}`}
                emptyLabel={t('stats.chart.empty')}
              />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
