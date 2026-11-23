export interface LevelConfig {
  xpPerLevelBase: number; // Base XP for level calculation
}

export const DEFAULT_LEVEL_CONFIG: LevelConfig = {
  xpPerLevelBase: 100, // Proposed default: Level N requires N * 100 XP
};

export interface LevelProgress {
  level: number;
  currentLevelXP: number;    // XP gained towards current level
  xpForNextLevel: number;    // Total XP required to reach next level from current level
  progressPercentage: number;// Integer percentage [0, 100]
}

export class LevelSystem {
  constructor(private config: LevelConfig = DEFAULT_LEVEL_CONFIG) {}

  /**
   * Calculate player Level from lifetime accumulated totalXP.
   * Arithmetic progression model:
   * Level 1: 0 to 99 XP (requires 100 XP to reach Level 2)
   * Level 2: 100 to 299 XP (requires 200 XP to reach Level 3)
   * Level 3: 300 to 599 XP (requires 300 XP to reach Level 4)
   * Cumulative XP to reach Level L = (L - 1) * L / 2 * baseXP
   */
  calculateLevel(totalXP: number): LevelProgress {
    const safeXP = Math.max(0, Math.floor(totalXP));
    const base = this.config.xpPerLevelBase;

    let currentLevel = 1;
    let accumulatedForCurrentLevel = 0;

    while (true) {
      const xpNeededForThisStep = currentLevel * base;
      if (safeXP < accumulatedForCurrentLevel + xpNeededForThisStep) {
        const currentLevelXP = safeXP - accumulatedForCurrentLevel;
        const progressPercentage = Math.min(
          100,
          Math.max(0, Math.floor((currentLevelXP / xpNeededForThisStep) * 100))
        );

        return {
          level: currentLevel,
          currentLevelXP,
          xpForNextLevel: xpNeededForThisStep,
          progressPercentage,
        };
      }
      accumulatedForCurrentLevel += xpNeededForThisStep;
      currentLevel++;
    }
  }
}

export const defaultLevelSystem = new LevelSystem(DEFAULT_LEVEL_CONFIG);

/**
 * Calculates authoritative player level directly from cumulative lifetime totalXP.
 * Single source of truth across economy, civilization, and UI.
 */
export function calculatePlayerLevel(totalXP: number): number {
  return defaultLevelSystem.calculateLevel(totalXP).level;
}

/**
 * Calculates authoritative level progression details directly from cumulative lifetime totalXP.
 */
export function calculateLevelProgress(totalXP: number): LevelProgress {
  return defaultLevelSystem.calculateLevel(totalXP);
}
