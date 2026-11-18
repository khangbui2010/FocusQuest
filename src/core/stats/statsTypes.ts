export interface DayTrendPoint {
  dateISO: string;
  focusMinutes: number;
  sessions: number;
  completed: number;
  abandoned: number;
}

export interface DayStatsSummary {
  dateISO: string;
  focusMinutes: number;
  completed: number;
  abandoned: number;
  sessions: number;
  coins: number;
  xp: number;
  trend7Days: DayTrendPoint[];
}

export interface MonthDayBarStat {
  dayNumber: number;
  dateISO: string;
  focusMinutes: number;
  sessions: number;
  completed: number;
  abandoned: number;
  coins: number;
  xp: number;
}

export interface PeakDayStat {
  dateISO: string;
  dayNumber: number;
  focusMinutes: number;
  sessions: number;
}

export interface MonthStatsSummary {
  monthKey: string;
  year: number;
  month: number;
  daysInMonth: number;
  totalFocusMinutes: number;
  averageFocusPerCalendarDay: number;
  averageFocusPerActiveDay: number;
  activeDays: number;
  completed: number;
  abandoned: number;
  completionRate: number | null;
  coins: number;
  xp: number;
  peakDay: PeakDayStat | null;
  days: MonthDayBarStat[];
}

export interface YearMonthBarStat {
  monthNumber: number;
  monthKey: string;
  focusMinutes: number;
  sessions: number;
  completed: number;
  abandoned: number;
  coins: number;
  xp: number;
  activeDays: number;
}

export interface BestMonthStat {
  monthKey: string;
  monthNumber: number;
  focusMinutes: number;
  sessions: number;
  activeDays: number;
}

export interface YearStatsSummary {
  yearKey: string;
  year: number;
  totalFocusMinutes: number;
  activeDays: number;
  completed: number;
  abandoned: number;
  completionRate: number | null;
  coins: number;
  xp: number;
  bestMonth: BestMonthStat | null;
  months: YearMonthBarStat[];
}

export interface FocusStreakSummary {
  current: number;
  longest: number;
}
