import React from 'react';
import { Bell, BellOff } from 'lucide-react';
import { CivilizationEra } from '../../core/civilization/buildingTypes.ts';
import { SessionSnapshot } from '../../types/session.ts';
import { useTranslation } from '../../i18n/I18nContext.tsx';
import { REUSED_TINY_TOWN_TILES, STONE_AGE_SPRITE_DATA } from './civilization/spriteData.ts';
import { PixelSprite } from './civilization/PixelSprite.tsx';
import { TileImage } from './civilization/TileImage.tsx';

export type FocusSceneState = 'working' | 'paused' | 'resting';

export interface FocusScenePalette {
  era: CivilizationEra;
  skyTop: string;
  skyBottom: string;
  hillBack: string;
  hillFront: string;
  shelterFill: string;
  silhouetteFill: string;
}

/**
 * Era scene registry (Stage 4b: animated Stone Age campsite with CC0 Tiny Dungeon
 * villagers and Tiny Town palette structures; falls back to STONE_AGE for future eras).
 */
export const FOCUS_SCENES: Partial<Record<CivilizationEra, FocusScenePalette>> = {
  STONE_AGE: {
    era: 'STONE_AGE',
    skyTop: '#dbeafe',
    skyBottom: '#f0fdf4',
    hillBack: '#86efac',
    hillFront: '#4ade80',
    shelterFill: '#78716c',
    silhouetteFill: '#1e293b',
  },
};

export interface SceneVillagerConfig {
  readonly id: 'elder' | 'crafter' | 'woodworker';
  readonly tileIndex: number;
  readonly toolTileIndex?: number;
  readonly toolSide?: 'left' | 'right';
  readonly animDelaySec: number;
  readonly positions: Readonly<Record<FocusSceneState, { readonly leftPx: number; readonly bottomPx: number }>>;
}

/**
 * Deterministic Stone Age villager group using CC0 Kenney Tiny Dungeon tiles:
 * - 100: grey-haired tribal elder with wooden staff
 * - 88: brown-haired settler in earth-tone fur tunic (with Tiny Dungeon hammer #117)
 * - 86: bald bearded craftsman in brown vest (with Tiny Dungeon axe #119)
 */
export const STONE_AGE_VILLAGER_SPRITES: readonly SceneVillagerConfig[] = Object.freeze([
  {
    id: 'elder',
    tileIndex: 100,
    animDelaySec: 0,
    positions: {
      working: { leftPx: 96, bottomPx: 14 },
      paused: { leftPx: 96, bottomPx: 14 },
      resting: { leftPx: 100, bottomPx: 12 },
    },
  },
  {
    id: 'crafter',
    tileIndex: 88,
    toolTileIndex: 117,
    toolSide: 'right',
    animDelaySec: 0.3,
    positions: {
      working: { leftPx: 124, bottomPx: 12 },
      paused: { leftPx: 124, bottomPx: 12 },
      resting: { leftPx: 128, bottomPx: 10 },
    },
  },
  {
    id: 'woodworker',
    tileIndex: 86,
    toolTileIndex: 119,
    toolSide: 'left',
    animDelaySec: 0.6,
    positions: {
      working: { leftPx: 192, bottomPx: 12 },
      paused: { leftPx: 192, bottomPx: 12 },
      resting: { leftPx: 184, bottomPx: 10 },
    },
  },
]);

export interface SceneSparkConfig {
  readonly id: string;
  readonly leftPx: number;
  readonly bottomPx: number;
  readonly dxPx: number;
  readonly delaySec: number;
  readonly color: string;
}

export const STONE_AGE_SPARK_OFFSETS: readonly SceneSparkConfig[] = Object.freeze([
  { id: 'spark-1', leftPx: 164, bottomPx: 34, dxPx: -4, delaySec: 0, color: '#fdbe53' },
  { id: 'spark-2', leftPx: 170, bottomPx: 36, dxPx: 3, delaySec: 0.6, color: '#f28462' },
  { id: 'spark-3', leftPx: 175, bottomPx: 33, dxPx: 5, delaySec: 1.2, color: '#fde68a' },
]);

export function resolveFocusSceneEra(era?: CivilizationEra | string): CivilizationEra {
  if (era && era in FOCUS_SCENES) {
    return era as CivilizationEra;
  }
  return 'STONE_AGE';
}

export function getFocusSceneConfig(era?: CivilizationEra | string): FocusScenePalette {
  const resolved = resolveFocusSceneEra(era);
  return FOCUS_SCENES[resolved] ?? FOCUS_SCENES.STONE_AGE!;
}

export function resolveFocusSceneState(session: SessionSnapshot): FocusSceneState {
  if (session.status === 'PAUSED') {
    return 'paused';
  }
  const isPomodoro =
    session.mode === 'POMODORO_COUNTDOWN' || session.mode === 'POMODORO_STOPWATCH';
  if (isPomodoro && session.pomodoroState && session.pomodoroState.currentPhase !== 'FOCUS') {
    return 'resting';
  }
  return 'working';
}

export interface FocusSceneAreaProps {
  era?: CivilizationEra | string;
  sceneState: FocusSceneState;
  statusLabel: string;
  chimeEnabled: boolean;
  onToggleChime: () => void;
  chimeAriaLabel: string;
  chimeTitle: string;
  reducedMotion?: boolean;
}

export const FocusSceneArea: React.FC<FocusSceneAreaProps> = ({
  era,
  sceneState,
  statusLabel,
  chimeEnabled,
  onToggleChime,
  chimeAriaLabel,
  chimeTitle,
  reducedMotion = false,
}) => {
  const { t } = useTranslation();
  const palette = getFocusSceneConfig(era);
  const resolvedEra = palette.era;

  const isWorking = sceneState === 'working';
  const isPaused = sceneState === 'paused';
  const isResting = sceneState === 'resting';
  const allowAnimation = !reducedMotion && !isPaused;

  const sceneAriaLabel = isPaused
    ? t('timer.scene.ariaPaused')
    : isResting
    ? t('timer.scene.ariaResting')
    : t('timer.scene.ariaWorking');

  const skyGradient = isPaused
    ? 'from-slate-200 via-amber-50 to-slate-200 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900'
    : isResting
    ? 'from-indigo-100 via-cyan-50 to-emerald-50 dark:from-slate-900 dark:via-indigo-950/70 dark:to-slate-900'
    : 'from-sky-100 via-emerald-50 to-amber-50 dark:from-slate-900 dark:via-emerald-950/40 dark:to-slate-900';

  const dotColor = isPaused
    ? 'bg-amber-500'
    : isResting
    ? 'bg-cyan-500'
    : 'bg-emerald-500';

  const statusTextColor = isPaused
    ? 'text-amber-700 dark:text-amber-300'
    : isResting
    ? 'text-cyan-700 dark:text-cyan-300'
    : 'text-emerald-700 dark:text-emerald-300';

  const hillBackFill = isPaused ? '#94a3b8' : isResting ? '#6ee7b7' : palette.hillBack;
  const hillFrontFill = isPaused ? '#64748b' : isResting ? '#34d399' : palette.hillFront;

  return (
    <div
      role="region"
      aria-label={sceneAriaLabel}
      data-testid="focus-scene-area"
      data-scene-state={sceneState}
      data-era={resolvedEra}
      data-reduced-motion={reducedMotion ? 'true' : 'false'}
      className={`relative w-full flex-1 min-h-[160px] flex flex-col rounded-xl overflow-hidden border border-slate-200/80 dark:border-slate-700/80 bg-gradient-to-b ${skyGradient} select-none`}
    >
      {/* Top Corner Overlay Chips: Left = Status, Right = Chime Toggle */}
      <div className="absolute top-2.5 inset-x-2.5 z-10 flex items-center justify-between pointer-events-none">
        <div
          data-testid="focus-scene-status-chip"
          className="pointer-events-auto inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/85 dark:bg-slate-900/85 border border-slate-200/80 dark:border-slate-700/80 shadow-2xs"
        >
          <span className={`w-2 h-2 rounded-full shrink-0 ${dotColor}`} />
          <span className={`text-[11px] font-bold tracking-wider ${statusTextColor}`}>
            {statusLabel}
          </span>
        </div>

        <button
          type="button"
          data-testid="chime-toggle-btn"
          onClick={onToggleChime}
          aria-label={chimeAriaLabel}
          aria-pressed={chimeEnabled}
          title={chimeTitle}
          className="pointer-events-auto p-1.5 rounded-full bg-white/85 dark:bg-slate-900/85 border border-slate-200/80 dark:border-slate-700/80 text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 transition-colors shadow-2xs cursor-pointer"
        >
          {chimeEnabled ? (
            <Bell className="w-3.5 h-3.5" />
          ) : (
            <BellOff className="w-3.5 h-3.5 text-slate-400" />
          )}
        </button>
      </div>

      {/* Full-bleed Sky, Hills & Ground Clearing SVG Backdrop */}
      <svg
        viewBox="0 0 360 220"
        preserveAspectRatio="xMidYMax slice"
        aria-hidden="true"
        className="absolute inset-0 w-full h-full block pointer-events-none"
      >
        {/* Celestial Body & Atmospheric Accents */}
        {isWorking && (
          <circle cx="272" cy="74" r="18" fill="#fef3c7" opacity="0.5" />
        )}
        <circle
          cx="272"
          cy="74"
          r="11"
          fill={isResting ? '#bae6fd' : isPaused ? '#cbd5e1' : '#fde68a'}
          opacity={isPaused ? '0.65' : '0.9'}
        />
        {isResting && (
          <circle cx="276" cy="71" r="8" fill="#e0f2fe" opacity="0.45" />
        )}

        {/* Deterministic Pixel Clouds (working) */}
        {isWorking && (
          <g className={allowAnimation ? 'fq-scene-cloud' : undefined} opacity="0.72" fill="#ffffff">
            <rect x="64" y="62" width="24" height="6" rx="2" />
            <rect x="70" y="57" width="12" height="5" rx="2" />
            <rect x="196" y="50" width="20" height="5" rx="2" />
            <rect x="200" y="46" width="10" height="4" rx="2" />
          </g>
        )}

        {/* Deterministic Twinkling Stars (resting break) */}
        {isResting && (
          <g fill="#fef08a">
            <rect
              x="92"
              y="56"
              width="3"
              height="3"
              className={allowAnimation ? 'fq-scene-star' : undefined}
            />
            <rect
              x="176"
              y="44"
              width="3"
              height="3"
              className={allowAnimation ? 'fq-scene-star' : undefined}
              style={{ animationDelay: '0.9s' }}
            />
            <rect
              x="232"
              y="60"
              width="2.5"
              height="2.5"
              className={allowAnimation ? 'fq-scene-star' : undefined}
              style={{ animationDelay: '1.7s' }}
            />
          </g>
        )}

        {/* Distant Hill Ridge (spans full width down to y=220) */}
        <path
          d="M0 144 Q92 114 185 138 T360 128 L360 220 L0 220 Z"
          fill={hillBackFill}
          opacity={isPaused ? '0.42' : '0.52'}
        />

        {/* Foreground Meadow (fills lower half cleanly to bottom edge y=220) */}
        <path
          d="M0 162 Q115 142 235 156 T360 150 L360 220 L0 220 Z"
          fill={hillFrontFill}
          opacity={isPaused ? '0.48' : '0.68'}
        />

        {/* Grounded Stone Age Camp Earth Clearing */}
        <path
          d="M0 198 Q180 186 360 198 L360 220 L0 220 Z"
          fill="#bd6c4a"
          opacity={isPaused ? '0.32' : '0.45'}
        />
        <ellipse
          cx="180"
          cy="202"
          rx="96"
          ry="11"
          fill="#eaa56c"
          opacity={isPaused ? '0.28' : '0.46'}
        />
        <ellipse
          cx="180"
          cy="203"
          rx="42"
          ry="6"
          fill="#763b36"
          opacity={isPaused ? '0.18' : '0.28'}
        />
      </svg>

      {/* Stone Age Pixel Sprite Campsite Stage (anchored at bottom, leaving top chips clear) */}
      <div
        aria-hidden="true"
        data-testid="focus-scene-stage"
        className="absolute inset-x-0 bottom-0 h-[120px] flex justify-center items-end pointer-events-none"
      >
        <div className="relative w-[336px] h-[120px] shrink-0">
          {/* Left Tree: CC0 Tiny Town M2 Tall Green Tree (#4 over #16) + Bush (#5) */}
          <div
            data-testid="scene-tree-left"
            className={`absolute left-[6px] bottom-[14px] w-[28px] h-[56px] flex flex-col ${
              isPaused ? 'opacity-75' : ''
            }`}
          >
            <TileImage
              pack="tiny-town"
              tileIndex={REUSED_TINY_TOWN_TILES.TREE_CONIFER_GREEN}
              size={28}
              className="block"
            />
            <TileImage
              pack="tiny-town"
              tileIndex={REUSED_TINY_TOWN_TILES.TREE_ROUND_GREEN}
              size={28}
              className="block"
            />
          </div>
          <div
            className={`absolute left-[30px] bottom-[12px] ${isPaused ? 'opacity-75' : ''}`}
          >
            <TileImage
              pack="tiny-town"
              tileIndex={REUSED_TINY_TOWN_TILES.GREEN_BUSH}
              size={22}
              className="block"
            />
          </div>

          {/* Stone Age Shelter: Meditation Cave (Tiny Town palette PixelSprite) */}
          <div
            data-testid="scene-shelter"
            className={`absolute left-[42px] bottom-[14px] ${isPaused ? 'opacity-80' : ''}`}
          >
            <PixelSprite
              sprite={STONE_AGE_SPRITE_DATA.stone_age_study_cave}
              width={64}
              height={64}
            />
          </div>

          {/* Right Tree: CC0 Tiny Town M1 Tall Autumn Tree (#3 over #15) */}
          <div
            data-testid="scene-tree-right"
            className={`absolute left-[298px] bottom-[14px] w-[28px] h-[56px] flex flex-col ${
              isPaused ? 'opacity-75' : ''
            }`}
          >
            <TileImage
              pack="tiny-town"
              tileIndex={REUSED_TINY_TOWN_TILES.TREE_CONIFER_ORANGE}
              size={28}
              className="block"
            />
            <TileImage
              pack="tiny-town"
              tileIndex={REUSED_TINY_TOWN_TILES.TREE_ROUND_ORANGE}
              size={28}
              className="block"
            />
          </div>

          {/* Ground Micro-Props: Sprout (#17), Wood Log (#106), Mushrooms (#29) */}
          <div
            className={`absolute left-[108px] bottom-[9px] ${isPaused ? 'opacity-70' : ''}`}
          >
            <TileImage
              pack="tiny-town"
              tileIndex={REUSED_TINY_TOWN_TILES.SPROUT}
              size={18}
              className="block"
            />
          </div>
          <div
            className={`absolute left-[228px] bottom-[11px] ${isPaused ? 'opacity-75' : ''}`}
          >
            <TileImage
              pack="tiny-town"
              tileIndex={REUSED_TINY_TOWN_TILES.WOOD_LOG}
              size={20}
              className="block"
            />
          </div>
          <div
            className={`absolute left-[272px] bottom-[11px] ${isPaused ? 'opacity-75' : ''}`}
          >
            <TileImage
              pack="tiny-town"
              tileIndex={REUSED_TINY_TOWN_TILES.MUSHROOMS}
              size={20}
              className="block"
            />
          </div>

          {/* Central Stone Age Campfire + Ember Glow + Sparks */}
          {!isPaused && (
            <div
              className={`absolute left-[146px] bottom-[6px] w-[48px] h-[36px] rounded-full bg-amber-400/35 blur-[5px] ${
                allowAnimation
                  ? isResting
                    ? 'fq-scene-glow-rest'
                    : 'fq-scene-glow-work'
                  : 'opacity-50'
              }`}
            />
          )}
          <div
            data-testid="scene-campfire"
            className={`absolute left-[154px] bottom-[10px] ${isPaused ? 'opacity-65' : ''}`}
          >
            <PixelSprite
              sprite={STONE_AGE_SPRITE_DATA.stone_age_campfire}
              width={32}
              height={32}
            />
            {/* Crisp animated pixel flame tip when working */}
            {isWorking && allowAnimation && (
              <span
                className="fq-scene-flame absolute left-[13px] top-[3px] w-[6px] h-[7px] bg-amber-300/80 rounded-t-xs"
              />
            )}
          </div>

          {/* Deterministic Rising Sparks during Focus */}
          {isWorking &&
            allowAnimation &&
            STONE_AGE_SPARK_OFFSETS.map((spark) => (
              <span
                key={spark.id}
                className="fq-scene-spark absolute w-[3px] h-[3px]"
                style={
                  {
                    left: spark.leftPx,
                    bottom: spark.bottomPx,
                    backgroundColor: spark.color,
                    animationDelay: `${spark.delaySec}s`,
                    ['--fq-spark-dx' as string]: `${spark.dxPx}px`,
                  } as React.CSSProperties
                }
              />
            ))}

          {/* Group of 3 CC0 Tiny Dungeon Villagers */}
          {STONE_AGE_VILLAGER_SPRITES.map((villager) => {
            const pos = villager.positions[sceneState];
            const villagerAnimClass = !allowAnimation
              ? ''
              : isResting
              ? 'fq-scene-villager-rest'
              : 'fq-scene-villager-work';

            return (
              <div
                key={villager.id}
                data-testid={`scene-villager-${villager.id}`}
                data-tile-index={villager.tileIndex}
                className={`absolute z-[2] ${villagerAnimClass} ${
                  isPaused ? 'opacity-80' : ''
                }`}
                style={{
                  left: pos.leftPx,
                  bottom: pos.bottomPx,
                  width: 32,
                  height: 32,
                  animationDelay: allowAnimation ? `${villager.animDelaySec}s` : undefined,
                }}
              >
                <TileImage
                  pack="tiny-dungeon"
                  tileIndex={villager.tileIndex}
                  size={32}
                  className="block"
                />

                {/* Handheld Stone Age tool during active focusing */}
                {isWorking && villager.toolTileIndex !== undefined && (
                  <div
                    data-testid={`scene-tool-${villager.id}`}
                    className={`absolute bottom-[2px] ${
                      villager.toolSide === 'left' ? '-left-[6px]' : '-right-[6px]'
                    } ${allowAnimation ? 'fq-scene-tool-swing' : ''}`}
                    style={{
                      width: 16,
                      height: 16,
                      animationDelay: allowAnimation ? `${villager.animDelaySec}s` : undefined,
                    }}
                  >
                    <TileImage
                      pack="tiny-dungeon"
                      tileIndex={villager.toolTileIndex}
                      size={16}
                      className="block"
                    />
                  </div>
                )}

                {/* Calm Zzz indicator above resting elder during Break */}
                {isResting && villager.id === 'elder' && (
                  <span
                    data-testid="scene-rest-zzz"
                    className={`absolute -top-[10px] right-[1px] font-mono text-[9px] font-bold text-cyan-700 dark:text-cyan-200 leading-none ${
                      allowAnimation ? 'fq-scene-zzz' : 'opacity-80'
                    }`}
                  >
                    zZ
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
