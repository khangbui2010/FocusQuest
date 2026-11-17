import { DailyStatRecord } from '../../types/storageSchema.ts';

/**
 * Calculates authoritative cumulative lifetime focus minutes from all daily stat records.
 * Single source of truth across background, civilization unlock gates, and UI stats.
 * Pause and break times are strictly excluded by the timer domain models.
 */
export function calculateLifetimeFocusMinutes(
  dailyStats: Record<string, DailyStatRecord> | null | undefined
): number {
  if (!dailyStats || typeof dailyStats !== 'object') {
    return 0;
  }
  let total = 0;
  for (const record of Object.values(dailyStats)) {
    if (
      record &&
      typeof record.totalFocusMinutes === 'number' &&
      Number.isFinite(record.totalFocusMinutes)
    ) {
      total += Math.max(0, record.totalFocusMinutes);
    }
  }
  return total;
}
