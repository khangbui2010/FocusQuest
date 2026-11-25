import React, { useEffect, useMemo, useState } from 'react';
import { Bell, BellOff } from 'lucide-react';
import { CivilizationEra } from '../../core/civilization/buildingTypes.ts';
import { CivilizationState } from '../../core/civilization/civilizationState.ts';
import { SessionSnapshot } from '../../types/session.ts';
import { useTranslation } from '../../i18n/I18nContext.tsx';
import { getLocalizedBuildingName } from '../utils/buildingI18n.ts';
import { REUSED_TINY_TOWN_TILES, STONE_AGE_SPRITE_DATA } from './civilization/spriteData.ts';
import {
  CLOCK_TILE_INDEX,
  ClockTileIcon,
  PixelSprite,
  TileImage,
  VillagerSprite,
  getBuildingSprite,
  getConstructionSprite,
} from './civilization/spriteRegistry.ts';
import { formatJobCountdown } from './civilization/jobProjection.ts';
import {
  SCENE_WANDER_TICK_MS,
  buildFocusSceneModel,
  getSceneVillagerRoute,
} from '../utils/focusSceneModel.ts';
import {
  WorkCrewMemberPose,
  buildWorkSubSceneModels,
  getWorkSceneGridClass,
} from '../utils/focusWorkSceneModel.ts';
import { computeWorkSubSceneLayout } from './civilization/civilizationScale.ts';

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
 * Era scene registry (Milestone Villager V4: dynamic Stone Age campsite reflecting
 * placed buildings and recruited villagers; falls back to STONE_AGE for future eras).
 */
export const FOCUS_SCENES: Partial<Record<CivilizationEra, FocusScenePalette>> = {
  STONE_AGE: {
    era: 'STONE_AGE',
    skyTop: '#6ec1f0',
    skyBottom: '#d4f0ff',
    hillBack: '#86efac',
    hillFront: '#34d399',
    shelterFill: '#78716c',
    silhouetteFill: '#1e293b',
  },
};

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
  civilizationState?: Partial<CivilizationState> | null;
  session?: SessionSnapshot | null;
  liveFocusSeconds?: number;
  alreadyProjected?: boolean;
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
  civilizationState = null,
  session = null,
  liveFocusSeconds = 0,
  alreadyProjected = false,
}) => {
  const { locale, t } = useTranslation();
  const palette = getFocusSceneConfig(era);
  const resolvedEra = palette.era;

  const isWorking = sceneState === 'working';
  const isPaused = sceneState === 'paused';
  const isResting = sceneState === 'resting';
  const allowAnimation = !reducedMotion && !isPaused;

  const workBundle = useMemo(
    () =>
      buildWorkSubSceneModels(civilizationState, {
        session,
        liveFocusSeconds,
        alreadyProjected,
      }),
    [civilizationState, session, liveFocusSeconds, alreadyProjected]
  );

  const workSubScenes = workBundle.activeSubScenes;
  const hasWorkScenes = workSubScenes.length > 0;

  const sceneModel = useMemo(
    () => buildFocusSceneModel(civilizationState),
    [civilizationState]
  );

  const [tick, setTick] = useState<number>(0);
  const [isDocumentHidden, setIsDocumentHidden] = useState<boolean>(() =>
    typeof document !== 'undefined' ? Boolean(document.hidden) : false
  );

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const handleVisibilityChange = () => {
      setIsDocumentHidden(Boolean(document.hidden));
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    if (hasWorkScenes || !allowAnimation || isDocumentHidden || sceneModel.villagers.length === 0) {
      return;
    }
    const timerId = setInterval(() => {
      setTick((prev) => prev + 1);
    }, SCENE_WANDER_TICK_MS);
    return () => {
      clearInterval(timerId);
    };
  }, [hasWorkScenes, allowAnimation, isDocumentHidden, sceneModel.villagers.length]);

  const effectiveTick = reducedMotion ? 0 : tick;

  const sceneAriaLabel = hasWorkScenes
    ? isPaused
      ? t('timer.scene.workAriaPaused', { count: workSubScenes.length })
      : isResting
      ? t('timer.scene.workAriaResting', { count: workSubScenes.length })
      : t('timer.scene.workAriaWorking', { count: workSubScenes.length })
    : sceneModel.isEmpty
    ? t('timer.scene.ariaEmpty')
    : isPaused
    ? t('timer.scene.ariaPaused')
    : isResting
    ? t('timer.scene.ariaResting')
    : t('timer.scene.ariaWorking');

  // Bright daytime skies across all 3 states (LOFI-2: zero dark night gradients)
  const skyGradient = isPaused
    ? 'from-[#cbd5e1] via-[#dbe4ee] to-[#edf2f7]'
    : isResting
    ? 'from-[#fed7aa] via-[#fbcfe8] to-[#e9d5ff]'
    : 'from-[#6ec1f0] via-[#a9dcf9] to-[#d4f0ff]';

  const dotColor = isPaused
    ? 'bg-amber-400'
    : isResting
    ? 'bg-orange-300'
    : 'bg-emerald-400';

  const hillBackFill = isPaused ? '#94a3b8' : isResting ? '#86efac' : palette.hillBack;
  const hillFrontFill = isPaused ? '#64748b' : isResting ? '#4ade80' : palette.hillFront;

  return (
    <div
      role="region"
      aria-label={sceneAriaLabel}
      data-testid="focus-scene-area"
      data-scene-state={sceneState}
      data-era={resolvedEra}
      data-reduced-motion={reducedMotion ? 'true' : 'false'}
      data-scene-empty={!hasWorkScenes && sceneModel.isEmpty ? 'true' : 'false'}
      data-work-scenes={hasWorkScenes ? workSubScenes.length : 0}
      className={`relative w-full flex-1 min-h-[160px] flex flex-col rounded-xl overflow-hidden border border-sky-200/80 dark:border-slate-700/80 bg-gradient-to-b ${skyGradient} select-none`}
    >
      {/* Top Corner Overlay Chips: Left = Status, Right = Chime Toggle */}
      <div className="absolute top-2.5 inset-x-2.5 z-10 flex items-center justify-between pointer-events-none">
        <div
          data-testid="focus-scene-status-chip"
          className="pointer-events-auto inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-900/75 border border-white/25 text-white backdrop-blur-xs shadow-xs"
        >
          <span className={`w-2 h-2 rounded-full shrink-0 ${dotColor}`} />
          <span className="text-[11px] font-bold tracking-wider text-white">
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
          className="pointer-events-auto p-1.5 rounded-full bg-slate-900/75 border border-white/25 text-white hover:bg-slate-900/90 backdrop-blur-xs transition-colors shadow-xs cursor-pointer"
        >
          {chimeEnabled ? (
            <Bell className="w-3.5 h-3.5 text-white" />
          ) : (
            <BellOff className="w-3.5 h-3.5 text-slate-300" />
          )}
        </button>
      </div>

      {hasWorkScenes ? (
        <div
          data-testid="focus-work-grid"
          data-work-count={workSubScenes.length}
          className={`flex-1 w-full h-full grid ${getWorkSceneGridClass(workSubScenes.length)} gap-[2px] bg-slate-900/20`}
        >
          {workSubScenes.map((sub) => {
            const count = workSubScenes.length;
            const isFourGrid = count === 4;
            const layout = computeWorkSubSceneLayout({
              jobCount: count,
              subjectFootprint: sub.subjectFootprint,
            });
            const shouldAnimateTool = isWorking && !reducedMotion;

            const localizedDefName = sub.definitionId
              ? getLocalizedBuildingName(locale, sub.definitionId)
              : '';
            const workLabel =
              sub.job.kind === 'expand'
                ? t('timer.scene.jobExpandLabel')
                : sub.job.kind === 'upgrade'
                ? t('timer.scene.jobUpgradeLabel', {
                    name: localizedDefName,
                    level: sub.job.targetLevel ?? 2,
                  })
                : t('timer.scene.jobPlaceLabel', { name: localizedDefName });

            const constructionSprite =
              sub.job.kind === 'place' && sub.definitionId
                ? getConstructionSprite(
                    sub.definitionId,
                    sub.remainingSeconds,
                    sub.totalSeconds
                  )
                : null;
            const upgradeSprite =
              sub.job.kind === 'upgrade' && sub.definitionId
                ? getBuildingSprite(sub.definitionId)
                : null;

            const leftMember = sub.members.find((m) => m.side === 'left');
            const rightMember = sub.members.find((m) => m.side === 'right');

            const renderCrewMember = (member: WorkCrewMemberPose, memberIndex: number) => (
              <div
                key={member.villager.id}
                data-testid={`focus-work-villager-${sub.job.id}-${member.villager.id}`}
                data-villager-id={member.villager.id}
                data-villager-role={member.villager.role}
                data-villager-facing={member.facing}
                data-villager-side={member.side}
                style={{
                  width: layout.villagerSizePx,
                  height: layout.villagerSizePx,
                }}
                className={`relative shrink-0 flex items-end justify-center ${
                  shouldAnimateTool
                    ? 'fq-scene-villager-work'
                    : isPaused
                    ? 'opacity-80'
                    : ''
                }`}
              >
                <VillagerSprite
                  role={member.villager.role}
                  animation="idle"
                  scale={layout.uniformScale}
                  reducedMotion={!allowAnimation}
                  testId={`focus-work-sprite-${sub.job.id}-${member.villager.id}-img`}
                  style={member.facing === 'left' ? { transform: 'scaleX(-1)' } : undefined}
                />

                {/* Hand-held work tool anchored inside villager hand: swings while working, rests in hand when paused/resting/reducedMotion */}
                <div
                  data-testid={
                    memberIndex === 0
                      ? `focus-work-tool-${sub.job.id}`
                      : `focus-work-tool-${sub.job.id}-${member.villager.id}`
                  }
                  data-work-tool-job={sub.job.id}
                  data-tool-hand-side={member.side}
                  data-tool-animated={shouldAnimateTool ? 'true' : 'false'}
                  style={{
                    width: layout.toolSizePx,
                    height: layout.toolSizePx,
                    bottom: Math.max(1, Math.round(layout.villagerSizePx * 0.14)),
                    ...(member.facing === 'right'
                      ? { right: -Math.round(layout.toolSizePx * 0.42) }
                      : { left: -Math.round(layout.toolSizePx * 0.42) }),
                  }}
                  className={`absolute pointer-events-none ${
                    shouldAnimateTool
                      ? `fq-tool-strike ${
                          member.facing === 'right'
                            ? 'fq-work-hand-tool-strike-right'
                            : 'fq-work-hand-tool-strike-left'
                        }`
                      : `${
                          member.facing === 'right'
                            ? 'fq-work-hand-tool-rest-right'
                            : 'fq-work-hand-tool-rest-left'
                        } ${isPaused ? 'opacity-75' : ''}`
                  }`}
                >
                  <div
                    style={
                      member.facing === 'left'
                        ? { transform: 'scaleX(-1)' }
                        : undefined
                    }
                  >
                    <TileImage
                      pack={sub.toolSpec.pack}
                      tileIndex={sub.toolSpec.tileIndex}
                      size={layout.toolSizePx}
                      className="block"
                    />
                  </div>
                </div>
              </div>
            );

            return (
              <div
                key={sub.job.id}
                role="group"
                aria-label={t('timer.scene.workAriaGroup', { label: workLabel })}
                data-testid={`focus-work-subscene-${sub.job.id}`}
                data-job-id={sub.job.id}
                data-job-kind={sub.job.kind}
                data-crew-count={sub.villagers.length}
                data-remaining-seconds={sub.remainingSeconds}
                data-uniform-scale={layout.uniformScale}
                data-villager-px={layout.villagerSizePx}
                data-subject-width-px={layout.subjectWidthPx}
                data-subject-height-px={layout.subjectHeightPx}
                className={`relative overflow-hidden flex flex-col justify-end items-center pb-1 px-1 bg-gradient-to-b ${skyGradient} ${
                  !reducedMotion ? 'fq-work-subscene-enter' : ''
                }`}
              >
                {/* Deterministic per-job sky & hills backdrop */}
                <svg
                  viewBox="0 0 180 110"
                  preserveAspectRatio="xMidYMax slice"
                  aria-hidden="true"
                  className="absolute inset-0 w-full h-full block pointer-events-none"
                >
                  <circle
                    cx={sub.sunX}
                    cy={isResting ? 36 : 26}
                    r={isWorking ? 11 : isResting ? 12 : 9}
                    fill={isResting ? '#fed7aa' : isPaused ? '#f1f5f9' : '#fef9c3'}
                    opacity={isPaused ? '0.55' : '0.68'}
                  />
                  <circle
                    cx={sub.sunX}
                    cy={isResting ? 36 : 26}
                    r={7}
                    fill={isResting ? '#fb923c' : isPaused ? '#f8fafc' : '#fde047'}
                    opacity={isPaused ? '0.8' : '0.95'}
                  />
                  <path
                    d={`M0 ${68 + sub.hillShift} Q50 ${54 - sub.hillShift} 95 66 T180 ${62 + sub.hillShift} L180 110 L0 110 Z`}
                    fill={hillBackFill}
                    opacity={isPaused ? '0.55' : '0.72'}
                  />
                  <path
                    d="M0 78 Q60 70 120 77 T180 74 L180 110 L0 110 Z"
                    fill={hillFrontFill}
                    opacity={isPaused ? '0.62' : '0.85'}
                  />
                  <path
                    d="M0 95 Q90 89 180 95 L180 110 L0 110 Z"
                    fill="#bd6c4a"
                    opacity={isPaused ? '0.32' : '0.46'}
                  />
                </svg>

                {/* Subtle deterministic forest framing */}
                <div
                  aria-hidden="true"
                  className={`absolute left-1 bottom-4 pointer-events-none ${
                    isPaused ? 'opacity-65' : 'opacity-90'
                  }`}
                >
                  <TileImage
                    pack="tiny-town"
                    tileIndex={sub.treeTiles[0]}
                    size={isFourGrid ? 14 : 18}
                    className="block"
                  />
                </div>
                <div
                  aria-hidden="true"
                  className={`absolute right-1 bottom-4 pointer-events-none ${
                    isPaused ? 'opacity-65' : 'opacity-90'
                  }`}
                >
                  <TileImage
                    pack="tiny-town"
                    tileIndex={sub.treeTiles[1]}
                    size={isFourGrid ? 14 : 18}
                    className="block"
                  />
                </div>

                {/* Central work subject & assigned non-duplicated crew at true Map proportions */}
                <div
                  className="relative z-[3] flex items-end justify-center mb-0.5 pointer-events-none"
                  style={{ gap: layout.gapPx }}
                >
                  {leftMember && renderCrewMember(leftMember, 0)}

                  {/* Building under construction / upgrading scaffold / single 1x1 tree */}
                  <div className="relative flex items-end justify-center shrink-0">
                    {sub.job.kind === 'expand' ? (
                      <div
                        data-testid={`focus-work-subject-${sub.job.id}`}
                        style={{
                          width: layout.subjectWidthPx,
                          height: layout.subjectHeightPx,
                        }}
                        className={`flex items-end justify-center shrink-0 ${
                          isPaused ? 'opacity-80' : ''
                        }`}
                      >
                        <TileImage
                          pack="tiny-town"
                          tileIndex={sub.expandTreeTile}
                          size={layout.subjectWidthPx}
                          className="block"
                        />
                      </div>
                    ) : sub.job.kind === 'upgrade' && upgradeSprite ? (
                      <div
                        data-testid={`focus-work-subject-${sub.job.id}`}
                        style={{
                          width: layout.subjectWidthPx,
                          height: layout.subjectHeightPx,
                        }}
                        className={`relative fq-construction-scaffold rounded-xs shrink-0 ${
                          isPaused ? 'opacity-80' : ''
                        }`}
                      >
                        <PixelSprite
                          sprite={upgradeSprite}
                          width={layout.subjectWidthPx}
                          height={layout.subjectHeightPx}
                        />
                      </div>
                    ) : constructionSprite ? (
                      <div
                        data-testid={`focus-work-subject-${sub.job.id}`}
                        style={{
                          width: layout.subjectWidthPx,
                          height: layout.subjectHeightPx,
                        }}
                        className={`shrink-0 ${isPaused ? 'opacity-80' : ''}`}
                      >
                        <PixelSprite
                          sprite={constructionSprite}
                          width={layout.subjectWidthPx}
                          height={layout.subjectHeightPx}
                        />
                      </div>
                    ) : null}
                  </div>

                  {rightMember && renderCrewMember(rightMember, 1)}
                </div>

                {/* Bottom compact clock + 1-second live countdown */}
                <div
                  data-testid={`focus-work-countdown-${sub.job.id}`}
                  className="relative z-[4] px-1.5 py-[2px] rounded bg-slate-950/80 border border-white/20 inline-flex items-center gap-1 text-[10px] font-mono font-semibold text-white tabular-nums leading-none shadow-2xs pointer-events-none"
                >
                  <ClockTileIcon
                    tileIndex={isWorking ? CLOCK_TILE_INDEX.CLOCK : CLOCK_TILE_INDEX.HOURGLASS}
                    size={11}
                  />
                  <span>{formatJobCountdown(sub.remainingSeconds)}</span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <>
          {/* Full-bleed Sky, Hills & Ground Clearing SVG Backdrop (0 active jobs) */}
          <svg
            viewBox="0 0 360 220"
            preserveAspectRatio="xMidYMax slice"
            aria-hidden="true"
            className="absolute inset-0 w-full h-full block pointer-events-none"
          >
            {/* Bright Daytime / Sunset Sun & Halo */}
            <circle
              cx="272"
              cy={isResting ? 98 : 70}
              r={isWorking ? 20 : isResting ? 22 : 16}
              fill={isResting ? '#fed7aa' : isPaused ? '#f1f5f9' : '#fef9c3'}
              opacity={isPaused ? '0.55' : '0.65'}
            />
            <circle
              cx="272"
              cy={isResting ? 98 : 70}
              r={isResting ? 13 : 12}
              fill={isResting ? '#fb923c' : isPaused ? '#f8fafc' : '#fde047'}
              opacity={isPaused ? '0.8' : '0.95'}
            />

            {/* Deterministic White Clouds */}
            <g
              className={allowAnimation ? 'fq-scene-cloud' : undefined}
              opacity={isPaused ? '0.82' : isResting ? '0.78' : '0.9'}
              fill={isResting ? '#fff1f2' : '#ffffff'}
            >
              <rect x="64" y="60" width="28" height="7" rx="3" />
              <rect x="70" y="54" width="14" height="6" rx="3" />
              <rect x="192" y="48" width="24" height="6" rx="3" />
              <rect x="198" y="43" width="12" height="5" rx="2.5" />
              {isPaused && <rect x="128" y="66" width="26" height="6" rx="3" />}
            </g>

            {/* Distant Hill Ridge (spans full width down to y=220) */}
            <path
              d="M0 144 Q92 114 185 138 T360 128 L360 220 L0 220 Z"
              fill={hillBackFill}
              opacity={isPaused ? '0.55' : '0.72'}
            />

            {/* Foreground Meadow (fills lower half cleanly to bottom edge y=220) */}
            <path
              d="M0 162 Q115 142 235 156 T360 150 L360 220 L0 220 Z"
              fill={hillFrontFill}
              opacity={isPaused ? '0.62' : '0.84'}
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

          {/* Dynamic Campsite Stage (anchored at bottom, leaving top chips clear) */}
          <div
            aria-hidden={sceneModel.isEmpty ? undefined : true}
            data-testid="focus-scene-stage"
            className="absolute inset-x-0 bottom-0 h-[120px] flex justify-center items-end pointer-events-none"
          >
            <div className="relative w-[336px] h-[120px] shrink-0">
              {sceneModel.isEmpty ? (
                <div className="absolute inset-x-3 bottom-3 flex justify-center">
                  <p
                    data-testid="scene-empty-hint"
                    className="px-2.5 py-1 rounded-lg bg-slate-900/65 border border-white/20 text-[10px] font-medium text-white/95 text-center shadow-2xs"
                  >
                    {t('timer.scene.emptyHint')}
                  </p>
                </div>
              ) : (
                <>
                  {/* Subtle Border Trees & Ground Props framing active camp */}
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

                  <div className={`absolute left-[112px] bottom-[8px] ${isPaused ? 'opacity-70' : ''}`}>
                    <TileImage
                      pack="tiny-town"
                      tileIndex={REUSED_TINY_TOWN_TILES.SPROUT}
                      size={18}
                      className="block"
                    />
                  </div>
                  <div className={`absolute left-[270px] bottom-[11px] ${isPaused ? 'opacity-75' : ''}`}>
                    <TileImage
                      pack="tiny-town"
                      tileIndex={REUSED_TINY_TOWN_TILES.WOOD_LOG}
                      size={20}
                      className="block"
                    />
                  </div>
                  <div className={`absolute left-[282px] bottom-[9px] ${isPaused ? 'opacity-75' : ''}`}>
                    <TileImage
                      pack="tiny-town"
                      tileIndex={REUSED_TINY_TOWN_TILES.MUSHROOMS}
                      size={20}
                      className="block"
                    />
                  </div>

                  {/* Campfire Warm Ember Glow (only when Campfire exists and not paused) */}
                  {sceneModel.hasCampfire && !isPaused && (
                    <div
                      className={`absolute left-[146px] bottom-[6px] w-[48px] h-[36px] rounded-full bg-amber-400/35 blur-[5px] z-[3] ${
                        allowAnimation
                          ? isResting
                            ? 'fq-scene-glow-rest'
                            : 'fq-scene-glow-work'
                          : 'opacity-50'
                      }`}
                    />
                  )}

                  {/* Built Stone Age Structures (strictly 1 sprite per built definitionId) */}
                  {sceneModel.buildings.map((building) => {
                    const sprite = STONE_AGE_SPRITE_DATA[building.definitionId];
                    if (!sprite) return null;
                    const isCampfire = building.definitionId === 'stone_age_campfire';

                    return (
                      <div
                        key={building.definitionId}
                        data-testid={`scene-building-${building.definitionId}`}
                        data-building-count={building.count}
                        className={`absolute ${isPaused ? 'opacity-75' : ''}`}
                        style={{
                          left: building.leftPx,
                          bottom: building.bottomPx,
                          zIndex: building.zIndex,
                        }}
                      >
                        <PixelSprite
                          sprite={sprite}
                          width={building.width}
                          height={building.height}
                        />
                        {isCampfire && isWorking && allowAnimation && (
                          <span
                            data-testid="scene-campfire-flame"
                            className="fq-scene-flame absolute left-[13px] top-[3px] w-[6px] h-[7px] bg-amber-300/80 rounded-t-xs"
                          />
                        )}
                      </div>
                    );
                  })}

                  {/* Rising Campfire Sparks (only if Campfire exists during working) */}
                  {sceneModel.hasCampfire &&
                    isWorking &&
                    allowAnimation &&
                    STONE_AGE_SPARK_OFFSETS.map((spark) => (
                      <span
                        key={spark.id}
                        className="fq-scene-spark absolute w-[3px] h-[3px] z-[4]"
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

                  {/* Recruited Villagers (max 6, live sprite sheets + seeded horizontal walk) */}
                  {sceneModel.villagers.map((villager) => {
                    const pose = getSceneVillagerRoute(villager, sceneModel, sceneState, effectiveTick);

                    return (
                      <div
                        key={villager.id}
                        data-testid={`scene-villager-${villager.id}`}
                        data-villager-role={villager.role}
                        data-villager-moving={pose.isMoving ? 'true' : 'false'}
                        className={`fq-scene-villager-mover absolute z-[5] ${
                          isPaused ? 'opacity-80' : ''
                        }`}
                        style={{
                          left: pose.xPx,
                          bottom: pose.bottomPx,
                          width: 32,
                          height: 32,
                          transition: allowAnimation
                            ? `left ${SCENE_WANDER_TICK_MS}ms linear`
                            : undefined,
                        }}
                      >
                        <VillagerSprite
                          role={villager.role}
                          animation={pose.animation}
                          scale={2}
                          reducedMotion={!allowAnimation}
                          testId={`scene-villager-sprite-${villager.id}`}
                        />

                        {/* Crafter hammer (#117) / Woodworker axe (#119) ONLY when working & standing */}
                        {pose.showTool && pose.toolTileIndex !== undefined && (
                          <div
                            data-testid={`scene-tool-${villager.id}`}
                            className={`absolute bottom-[2px] ${
                              pose.toolSide === 'left' ? '-left-[6px]' : '-right-[6px]'
                            } ${allowAnimation ? 'fq-scene-tool-swing' : ''}`}
                            style={{
                              width: 16,
                              height: 16,
                            }}
                          >
                            <TileImage
                              pack="tiny-dungeon"
                              tileIndex={pose.toolTileIndex}
                              size={16}
                              className="block"
                            />
                          </div>
                        )}

                        {/* Calm zZ indicator ONLY on recruited Elder during resting/break */}
                        {pose.showRestZzz && (
                          <span
                            data-testid="scene-rest-zzz"
                            className={`absolute -top-[10px] right-[1px] font-mono text-[9px] font-bold text-indigo-900 bg-white/80 px-0.5 rounded leading-none ${
                              allowAnimation ? 'fq-scene-zzz' : 'opacity-90'
                            }`}
                          >
                            zZ
                          </span>
                        )}
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
