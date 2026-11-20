import type { CycleModuleState } from '../types/cycle';
import type { AppState, DailyHistoryEntry, DayAbbrev, UserProfile } from '../types/fitsync';
import { calibrateProfile, DAYS_ORDER } from './calibrateEngine';
import { createDefaultCycleState, isCycleTrackingEnabled } from './cycleEngine';

const STORAGE_KEY = 'fitsync_calibrate_state_v3';
const CYCLE_STORAGE_KEY = 'fitsync_cycle_health_isolated_v1';

export const DEFAULT_HABITS = [
  'Drink 2L of water',
  '10,000 steps',
  '8 hours of sleep',
  'Meditate 5 min',
  'No added sugar',
  'Stretch after workout',
];

export const DAILY_MOTIVATIONS = [
  '"Strong is the new pretty."',
  '"Consistency calibrates results faster than perfection."',
  '"Small daily surpluses or deficits compound into transformation."',
  '"Train smart for your physiology, recover with purpose."',
];

export function createDefaultProfile(completed = false): UserProfile {
  return {
    fullName: 'Nainish Shrivas',
    email: 'nainishshrivas516@gmail.com',
    heightCm: 175,
    weightKg: 78,
    dob: '2000-05-16',
    sex: 'male',
    gender: 'male',
    activityLevel: 'moderately_active',
    bodyType: 'Mesomorph',
    goalKey: 'Fat_Loss',
    dietPreference: 'Non-Vegetarian',
    healthConditions: [],
    trainingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
    trainingTime: '07:00',
    sessionDurationMins: 30,
    habits: [...DEFAULT_HABITS],
    onboardingCompleted: completed,
  };
}

export function generate14DaySeededHistory(profile: UserProfile): DailyHistoryEntry[] {
  const metrics = calibrateProfile(profile);
  const baseWeight = profile.weightKg;
  const totalHabits = Math.max(1, profile.habits.length);

  // Realistic 14-day history ending today (2026-11-19)
  const habitPcts = [72, 84, 86, 65, 65, 96, 70, 96, 68, 96, 90, 82, 94, 83];
  const weightOffsets = [0.8, 0.7, 0.7, 0.6, 0.5, 0.5, 0.4, 0.3, 0.3, 0.2, 0.1, 0.1, 0.0, 0.0];
  const endDate = new Date('2026-11-19T12:00:00Z');

  return habitPcts.map((pct, i) => {
    const d = new Date(endDate);
    d.setUTCDate(endDate.getUTCDate() - (13 - i));
    const iso = d.toISOString().slice(0, 10);
    const dayLabel = iso.slice(5);
    const habitsCompleted = Math.min(totalHabits, Math.round((pct / 100) * totalHabits));
    const eatenVariance = ((i % 5) - 2) * 65;
    const isTraining = i % 7 < 5;

    return {
      date: iso,
      dayLabel,
      weightKg: Number((baseWeight + weightOffsets[i]).toFixed(1)),
      eatenKcal: Math.max(1200, metrics.safeTargetKcal + eatenVariance),
      burnedKcal: isTraining ? 210 + (i % 3) * 35 : 45,
      targetKcal: metrics.safeTargetKcal,
      habitsCompleted,
      habitsTotal: totalHabits,
      habitPct: Math.round((habitsCompleted / totalHabits) * 100),
      streakCount: i >= 9 ? i - 8 : (i % 4) + 1,
      workoutDone: isTraining,
    };
  });
}

export function createInitialAppState(profileOverride?: Partial<UserProfile>, autostart = false): AppState {
  const profile = {
    ...createDefaultProfile(autostart),
    ...profileOverride,
  };
  if (!profile.gender) {
    profile.gender = profile.sex === 'female' ? 'female' : 'male';
  }
  return {
    profile,
    todayDate: '2026-11-19',
    selectedMealDay: 1,
    checkedMealIds: [],
    checkedHabits: profile.habits.length > 1 ? [profile.habits[1]] : [],
    completedWorkoutDays: [],
    extraBurnedTodayKcal: 0,
    exerciseLogs: {},
    activeCheatPlan: null,
    cheatHistory: [],
    weeklyCheckIns: [],
    xp: 340,
    streakDays: 5,
    history14Days: generate14DaySeededHistory(profile),
  };
}

export function loadAppState(): AppState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return createInitialAppState();
    const parsed = JSON.parse(raw) as AppState;
    if (!parsed || !parsed.profile) return createInitialAppState();
    if (!parsed.profile.gender) {
      parsed.profile.gender = parsed.profile.sex === 'female' ? 'female' : 'male';
    }
    if (!Array.isArray(parsed.weeklyCheckIns)) {
      parsed.weeklyCheckIns = [];
    }
    return parsed;
  } catch {
    return createInitialAppState();
  }
}

export function saveAppState(state: AppState): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage quota errors in restricted sandboxes
  }
}

export function clearAppState(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore
  }
}

export function loadCycleState(): CycleModuleState {
  try {
    const raw = window.localStorage.getItem(CYCLE_STORAGE_KEY);
    if (!raw) return createDefaultCycleState();
    const parsed = JSON.parse(raw) as CycleModuleState;
    if (!parsed || !parsed.settings) return createDefaultCycleState();
    return {
      ...createDefaultCycleState(),
      ...parsed,
      settings: {
        ...createDefaultCycleState().settings,
        ...parsed.settings,
      },
      connect: {
        ...createDefaultCycleState().connect,
        ...(parsed.connect ?? {}),
      },
    };
  } catch {
    return createDefaultCycleState();
  }
}

export function saveCycleState(cycleState: CycleModuleState): void {
  try {
    window.localStorage.setItem(CYCLE_STORAGE_KEY, JSON.stringify(cycleState));
  } catch {
    // Ignore
  }
}

export function clearCycleState(): void {
  try {
    window.localStorage.removeItem(CYCLE_STORAGE_KEY);
  } catch {
    // Ignore
  }
}

export { isCycleTrackingEnabled };

export function getTodayDayAbbrev(): DayAbbrev {
  const jsDay = new Date().getDay(); // 0=Sun..6=Sat
  const map: Record<number, DayAbbrev> = {
    0: 'Sun',
    1: 'Mon',
    2: 'Tue',
    3: 'Wed',
    4: 'Thu',
    5: 'Fri',
    6: 'Sat',
  };
  return map[jsDay] ?? 'Thu';
}

export function getRemainingTrainingDaysThisWeek(
  trainingDays: DayAbbrev[],
  today: DayAbbrev = getTodayDayAbbrev()
): DayAbbrev[] {
  const todayIdx = DAYS_ORDER.indexOf(today);
  return DAYS_ORDER.slice(todayIdx + 1).filter((d) => trainingDays.includes(d));
}
