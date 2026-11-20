import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type {
  CycleConnectState,
  CycleEngineOutput,
  CycleModuleState,
  CycleReminder,
  DailyCycleLog,
  UserCycleSettings,
} from '../types/cycle';
import type {
  AppState,
  BiologicalSex,
  CalibratedMetrics,
  CheatCalibrationPlan,
  DayAbbrev,
  ExerciseSetLog,
  GenderOption,
  SarvamRecommendedChanges,
  UserProfile,
  WeeklyCheckInFeedback,
} from '../types/fitsync';
import {
  buildCheatMealPlan,
  calibrateProfile,
  getSafeExercisesForDay,
  getScaledMealsForDay,
} from '../utils/calibrateEngine';
import { applyFeedbackAutoCalibration } from '../utils/feedbackCalibration';
import {
  applyDailyCycleLogUpdate,
  createDefaultCycleState,
  createEmptyDailyLog,
  isCycleTrackingEnabled,
  runCycleCalculationEngine,
} from '../utils/cycleEngine';
import {
  clearAppState,
  clearCycleState,
  createInitialAppState,
  generate14DaySeededHistory,
  getRemainingTrainingDaysThisWeek,
  getTodayDayAbbrev,
  loadAppState,
  loadCycleState,
  saveAppState,
  saveCycleState,
} from '../utils/storage';

export type ThemeMode = 'light' | 'dark';

interface ToastMessage {
  id: number;
  text: string;
  tone: 'xp' | 'success' | 'info';
}

interface AppStateContextValue {
  state: AppState;
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
  metrics: CalibratedMetrics;
  todayAbbrev: DayAbbrev;
  eatenTodayKcal: number;
  eatenMacros: { protein: number; carbs: number; fats: number };
  burnedTodayKcal: number;
  toast: ToastMessage | null;
  dismissToast: () => void;
  showToast: (text: string, tone?: ToastMessage['tone']) => void;
  completeOnboarding: (profile: UserProfile) => void;
  updateProfileGender: (gender: GenderOption, sexBasis?: BiologicalSex) => { switchedAwayFromFemale: boolean };
  setSelectedMealDay: (day: number) => void;
  toggleMealCheck: (mealId: string) => void;
  toggleHabitCheck: (habit: string) => void;
  completeExerciseSession: (exerciseId: string, sets: ExerciseSetLog[], earnedNetKcal: number) => void;
  applyCheatMeal: (surplusKcal: number, note: string, preferredExerciseId?: string) => CheatCalibrationPlan;
  logWeightEntry: (weightKg: number) => void;
  submitWeeklyCheckInFeedback: (input: {
    languageCode: string;
    speaker: string;
    weeklyProgressSummary: string;
    dietIssue: string;
    healthIssue: string;
    exerciseIssue: string;
    overallFeedback: string;
    sentiment: 'great' | 'mixed' | 'struggling';
    aiSummary: string;
    transcript: Array<{ role: 'coach' | 'user'; text: string; timestamp: string }>;
    recommendedChanges?: SarvamRecommendedChanges;
  }) => WeeklyCheckInFeedback;
  resetAllData: () => void;
  // Female-only Clue Period & Cycle Tracking state + actions
  cycleTrackingEnabled: boolean;
  cycleState: CycleModuleState;
  cycleEngine: CycleEngineOutput | null;
  completeCycleOnboarding: (
    settingsPatch: Partial<UserCycleSettings>,
    fastTrackPeriodDates: string[]
  ) => void;
  saveCycleDailyLog: (log: DailyCycleLog) => { helperMessage: string | null };
  bulkMarkFastTrackPeriods: (dates: string[]) => void;
  updateCycleSettings: (patch: Partial<UserCycleSettings>) => void;
  toggleHideCycle: (cycleId: string) => void;
  createCustomTag: (label: string) => void;
  deleteCustomTag: (tagId: string) => void;
  updateReminders: (reminders: CycleReminder[]) => void;
  updateConnectState: (patch: Partial<CycleConnectState>) => void;
  deleteAllCycleHistory: () => void;
}

const AppStateContext = createContext<AppStateContextValue | null>(null);

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppState>(() => {
    const params = new URLSearchParams(window.location.search);
    const autostart = params.get('autostart') === '1';
    const loaded = loadAppState();
    if (autostart && !loaded.profile.onboardingCompleted) {
      const seeded = createInitialAppState({}, true);
      saveAppState(seeded);
      return seeded;
    }
    return loaded;
  });

  const [cycleState, setCycleState] = useState<CycleModuleState>(() => loadCycleState());
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    try {
      const saved = window.localStorage.getItem('fitsync_theme_v1');
      if (saved === 'dark' || saved === 'light') return saved;
      if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) return 'dark';
    } catch {
      // Ignore storage errors
    }
    return 'light';
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    try {
      window.localStorage.setItem('fitsync_theme_v1', theme);
    } catch {
      // Ignore storage errors
    }
  }, [theme]);

  const setTheme = (next: ThemeMode) => setThemeState(next);
  const toggleTheme = () => setThemeState((prev) => (prev === 'dark' ? 'light' : 'dark'));

  const cycleTrackingEnabled = useMemo(
    () => isCycleTrackingEnabled(state.profile.gender),
    [state.profile.gender]
  );

  useEffect(() => {
    saveAppState(state);
  }, [state]);

  useEffect(() => {
    saveCycleState(cycleState);
  }, [cycleState]);

  // Sync isolated cycle state with backend guard ONLY when female
  useEffect(() => {
    if (!cycleTrackingEnabled) return;
    fetch('/api/cycle/state', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-fitsync-gender': state.profile.gender,
        'x-fitsync-user': state.profile.email || 'default',
      },
      body: JSON.stringify({ gender: state.profile.gender, cycleState }),
    }).catch(() => {
      // Offline / local fallback already saved cleanly
    });
  }, [cycleState, cycleTrackingEnabled, state.profile.gender, state.profile.email]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const showToast = (text: string, tone: ToastMessage['tone'] = 'xp') => {
    setToast({ id: Date.now(), text, tone });
  };

  const metrics = useMemo(() => calibrateProfile(state.profile), [state.profile]);
  const todayAbbrev = useMemo(() => getTodayDayAbbrev(), []);

  const cycleEngine = useMemo(() => {
    if (!cycleTrackingEnabled) return null;
    return runCycleCalculationEngine(cycleState, state.todayDate);
  }, [cycleTrackingEnabled, cycleState, state.todayDate]);

  const currentDayMeals = useMemo(
    () =>
      getScaledMealsForDay(
        state.selectedMealDay,
        state.profile.dietPreference,
        metrics.safeTargetKcal,
        metrics.medicalOverrides
      ),
    [state.selectedMealDay, state.profile.dietPreference, metrics.safeTargetKcal, metrics.medicalOverrides]
  );

  const eatenStats = useMemo(() => {
    const checked = currentDayMeals.meals.filter((m) => state.checkedMealIds.includes(m.id));
    return checked.reduce(
      (acc, m) => ({
        kcal: acc.kcal + m.kcal,
        protein: acc.protein + m.protein,
        carbs: acc.carbs + m.carbs,
        fats: acc.fats + m.fats,
      }),
      { kcal: 0, protein: 0, carbs: 0, fats: 0 }
    );
  }, [currentDayMeals.meals, state.checkedMealIds]);

  const completeOnboarding = (profile: UserProfile) => {
    const completedProfile: UserProfile = {
      ...profile,
      sex: profile.gender === 'female' ? 'female' : profile.gender === 'male' ? 'male' : profile.sex,
      onboardingCompleted: true,
    };
    const freshHistory = generate14DaySeededHistory(completedProfile);
    const nextState: AppState = {
      ...createInitialAppState(completedProfile, true),
      profile: completedProfile,
      history14Days: freshHistory,
      checkedHabits: [],
      checkedMealIds: [],
      xp: 120,
      streakDays: 5,
    };
    setState(nextState);
    showToast('Plan calibrated! +120 XP unlocked', 'success');
  };

  const updateProfileGender = (gender: GenderOption, sexBasis?: BiologicalSex) => {
    const wasFemale = state.profile.gender === 'female';
    const switchedAwayFromFemale = wasFemale && gender !== 'female';

    setState((prev) => {
      const nextSex: BiologicalSex =
        gender === 'female' ? 'female' : gender === 'male' ? 'male' : sexBasis ?? prev.profile.sex;
      const nextProfile: UserProfile = {
        ...prev.profile,
        gender,
        sex: nextSex,
      };
      return {
        ...prev,
        profile: nextProfile,
      };
    });

    if (gender === 'female') {
      showToast('Period & Cycle Tracking unlocked in navigation', 'success');
    }

    return { switchedAwayFromFemale };
  };

  const setSelectedMealDay = (day: number) => {
    setState((prev) => ({
      ...prev,
      selectedMealDay: Math.max(1, Math.min(7, day)),
      checkedMealIds: [],
    }));
  };

  const toggleMealCheck = (mealId: string) => {
    setState((prev) => {
      const exists = prev.checkedMealIds.includes(mealId);
      const nextChecked = exists
        ? prev.checkedMealIds.filter((id) => id !== mealId)
        : [...prev.checkedMealIds, mealId];
      if (!exists) {
        showToast('Meal logged! +15 XP', 'xp');
      }
      return {
        ...prev,
        checkedMealIds: nextChecked,
        xp: exists ? Math.max(0, prev.xp - 15) : prev.xp + 15,
      };
    });
  };

  const toggleHabitCheck = (habit: string) => {
    setState((prev) => {
      const exists = prev.checkedHabits.includes(habit);
      const nextHabits = exists
        ? prev.checkedHabits.filter((h) => h !== habit)
        : [...prev.checkedHabits, habit];
      const total = Math.max(1, prev.profile.habits.length);
      const nextPct = Math.round((nextHabits.length / total) * 100);
      const updatedHistory = prev.history14Days.map((entry, idx) =>
        idx === prev.history14Days.length - 1
          ? {
              ...entry,
              habitsCompleted: nextHabits.length,
              habitsTotal: total,
              habitPct: nextPct,
            }
          : entry
      );
      if (!exists) {
        showToast('Habit complete! +25 XP', 'xp');
      }
      return {
        ...prev,
        checkedHabits: nextHabits,
        xp: exists ? Math.max(0, prev.xp - 25) : prev.xp + 25,
        history14Days: updatedHistory,
      };
    });
  };

  const completeExerciseSession = (
    exerciseId: string,
    sets: ExerciseSetLog[],
    earnedNetKcal: number
  ) => {
    setState((prev) => {
      const nextBurned = prev.extraBurnedTodayKcal + earnedNetKcal;
      const nextCompletedDays = prev.completedWorkoutDays.includes(todayAbbrev)
        ? prev.completedWorkoutDays
        : [...prev.completedWorkoutDays, todayAbbrev];
      const updatedHistory = prev.history14Days.map((entry, idx) =>
        idx === prev.history14Days.length - 1
          ? {
              ...entry,
              burnedKcal: nextBurned,
              workoutDone: true,
            }
          : entry
      );
      return {
        ...prev,
        extraBurnedTodayKcal: nextBurned,
        completedWorkoutDays: nextCompletedDays,
        exerciseLogs: {
          ...prev.exerciseLogs,
          [exerciseId]: sets,
        },
        xp: prev.xp + 50,
        history14Days: updatedHistory,
      };
    });
    showToast(`Workout logged! +${earnedNetKcal} kcal burned · +50 XP`, 'success');
  };

  const applyCheatMeal = (
    surplusKcal: number,
    note: string,
    preferredExerciseId?: string
  ): CheatCalibrationPlan => {
    const remaining = getRemainingTrainingDaysThisWeek(state.profile.trainingDays, todayAbbrev);
    const plan = buildCheatMealPlan({
      surplusKcal,
      note,
      remainingTrainingDays: remaining,
      nextWeekTrainingDays: state.profile.trainingDays,
      weightKg: state.profile.weightKg,
      overrides: metrics.medicalOverrides,
      preferredExerciseId,
    });
    setState((prev) => ({
      ...prev,
      activeCheatPlan: plan,
      cheatHistory: [plan, ...prev.cheatHistory],
      xp: prev.xp + 30,
    }));
    showToast('Cheat surplus calibrated safely! +30 XP', 'info');
    return plan;
  };

  const logWeightEntry = (weightKg: number) => {
    if (!Number.isFinite(weightKg) || weightKg < 30 || weightKg > 250) return;
    setState((prev) => {
      const rounded = Number(weightKg.toFixed(1));
      const nextProfile: UserProfile = { ...prev.profile, weightKg: rounded };
      const nextMetrics = calibrateProfile(nextProfile);
      const updatedHistory = prev.history14Days.map((entry, idx) =>
        idx === prev.history14Days.length - 1
          ? {
              ...entry,
              weightKg: rounded,
              targetKcal: nextMetrics.safeTargetKcal,
            }
          : entry
      );
      return {
        ...prev,
        profile: nextProfile,
        history14Days: updatedHistory,
        xp: prev.xp + 20,
      };
    });
    showToast(`Logged ${weightKg.toFixed(1)} kg · Targets recalibrated`, 'success');
  };

  const submitWeeklyCheckInFeedback = (input: {
    languageCode: string;
    speaker: string;
    weeklyProgressSummary: string;
    dietIssue: string;
    healthIssue: string;
    exerciseIssue: string;
    overallFeedback: string;
    sentiment: 'great' | 'mixed' | 'struggling';
    aiSummary: string;
    transcript: Array<{ role: 'coach' | 'user'; text: string; timestamp: string }>;
    recommendedChanges?: SarvamRecommendedChanges;
  }): WeeklyCheckInFeedback => {
    const userLines = input.transcript
      .filter((t) => t.role === 'user')
      .map((t) => t.text)
      .join(' ');
    const combinedText = [
      userLines,
      input.weeklyProgressSummary,
      input.dietIssue,
      input.healthIssue,
      input.exerciseIssue,
      input.overallFeedback,
    ]
      .filter(Boolean)
      .join(' ');

    const { nextProfile, appliedFixes } = applyFeedbackAutoCalibration(
      state.profile,
      input.recommendedChanges,
      combinedText
    );
    const nextMetrics = calibrateProfile(nextProfile);

    const record: WeeklyCheckInFeedback = {
      id: `checkin-${Date.now()}`,
      createdAt: new Date().toISOString(),
      languageCode: input.languageCode,
      speaker: input.speaker,
      weeklyProgressSummary: input.weeklyProgressSummary,
      dietIssue: input.dietIssue,
      healthIssue: input.healthIssue,
      exerciseIssue: input.exerciseIssue,
      overallFeedback: input.overallFeedback,
      sentiment: input.sentiment,
      aiSummary: input.aiSummary,
      transcript: input.transcript,
      appliedFixes,
    };

    setState((prev) => {
      const updatedHistory = prev.history14Days.map((entry, idx) =>
        idx === prev.history14Days.length - 1
          ? {
              ...entry,
              targetKcal: nextMetrics.safeTargetKcal,
              habitsTotal: Math.max(1, nextProfile.habits.length),
              habitPct: Math.round(
                (prev.checkedHabits.length / Math.max(1, nextProfile.habits.length)) * 100
              ),
            }
          : entry
      );
      return {
        ...prev,
        profile: nextProfile,
        weeklyCheckIns: [record, ...(prev.weeklyCheckIns ?? [])],
        xp: prev.xp + 40,
        history14Days: updatedHistory,
      };
    });

    fetch('/api/sarvam/feedback', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-fitsync-user': state.profile.email || 'default',
      },
      body: JSON.stringify({ feedback: record }),
    }).catch(() => {
      // Stored locally in AppState as primary source
    });

    showToast(
      `Feedback saved · ${appliedFixes.length} plan fix${appliedFixes.length === 1 ? '' : 'es'} auto-applied · +40 XP`,
      'success'
    );
    return record;
  };

  const resetAllData = () => {
    clearAppState();
    clearCycleState();
    setState(createInitialAppState({}, false));
    setCycleState(createDefaultCycleState());
  };

  // --- Cycle Module Actions (only functional when female) ---
  const completeCycleOnboarding = (
    settingsPatch: Partial<UserCycleSettings>,
    fastTrackPeriodDates: string[]
  ) => {
    if (!cycleTrackingEnabled) return;
    setCycleState((prev) => {
      const nextLogs = { ...prev.dailyLogs };
      for (const date of fastTrackPeriodDates) {
        const existing = nextLogs[date] ?? createEmptyDailyLog(date);
        nextLogs[date] = {
          ...existing,
          bleedingFlow: existing.bleedingFlow === 'none' ? 'medium' : existing.bleedingFlow,
        };
      }
      return {
        ...prev,
        settings: {
          ...prev.settings,
          ...settingsPatch,
          onboardingCompleted: true,
        },
        dailyLogs: nextLogs,
      };
    });
    showToast('Cycle Tracker personalized!', 'success');
  };

  const saveCycleDailyLog = (log: DailyCycleLog): { helperMessage: string | null } => {
    if (!cycleTrackingEnabled) return { helperMessage: null };
    const result = applyDailyCycleLogUpdate(
      cycleState.dailyLogs,
      log,
      cycleState.settings.activeMode
    );
    setCycleState((prev) => ({
      ...prev,
      dailyLogs: result.nextLogs,
    }));
    showToast(result.helperMessage ? 'Saved inside active cycle (10-day rule)' : `Cycle log saved for ${log.logDate}`, 'info');
    return { helperMessage: result.helperMessage };
  };

  const bulkMarkFastTrackPeriods = (dates: string[]) => {
    if (!cycleTrackingEnabled) return;
    setCycleState((prev) => {
      const nextLogs = { ...prev.dailyLogs };
      const selectedSet = new Set(dates);
      // Add selected dates as medium flow if currently none
      for (const d of selectedSet) {
        const cur = nextLogs[d] ?? createEmptyDailyLog(d);
        if (cur.bleedingFlow === 'none') {
          nextLogs[d] = { ...cur, bleedingFlow: 'medium' };
        }
      }
      return { ...prev, dailyLogs: nextLogs };
    });
    showToast(`Fast Track saved ${dates.length} period dates`, 'success');
  };

  const updateCycleSettings = (patch: Partial<UserCycleSettings>) => {
    if (!cycleTrackingEnabled) return;
    setCycleState((prev) => ({
      ...prev,
      settings: {
        ...prev.settings,
        ...patch,
      },
    }));
  };

  const toggleHideCycle = (cycleId: string) => {
    if (!cycleTrackingEnabled) return;
    setCycleState((prev) => {
      const exists = prev.excludedCycleIds.includes(cycleId);
      return {
        ...prev,
        excludedCycleIds: exists
          ? prev.excludedCycleIds.filter((id) => id !== cycleId)
          : [...prev.excludedCycleIds, cycleId],
      };
    });
    showToast('Cycle visibility updated · Predictions recalculated', 'info');
  };

  const createCustomTag = (label: string) => {
    if (!cycleTrackingEnabled) return;
    const clean = label.trim();
    if (!clean) return;
    setCycleState((prev) => ({
      ...prev,
      customTags: [...prev.customTags, { tagId: `tag-${Date.now()}`, label: clean }],
    }));
  };

  const deleteCustomTag = (tagId: string) => {
    if (!cycleTrackingEnabled) return;
    setCycleState((prev) => {
      const nextLogs: Record<string, DailyCycleLog> = {};
      for (const [date, log] of Object.entries(prev.dailyLogs)) {
        nextLogs[date] = {
          ...log,
          customTagIds: log.customTagIds.filter((id) => id !== tagId),
        };
      }
      return {
        ...prev,
        customTags: prev.customTags.filter((t) => t.tagId !== tagId),
        dailyLogs: nextLogs,
      };
    });
    showToast('Custom tag deleted from all historical logs', 'info');
  };

  const updateReminders = (reminders: CycleReminder[]) => {
    if (!cycleTrackingEnabled) return;
    setCycleState((prev) => ({ ...prev, reminders }));
    showToast('Cycle reminders updated', 'success');
  };

  const updateConnectState = (patch: Partial<CycleConnectState>) => {
    if (!cycleTrackingEnabled) return;
    setCycleState((prev) => ({
      ...prev,
      connect: { ...prev.connect, ...patch },
    }));
  };

  const deleteAllCycleHistory = () => {
    clearCycleState();
    setCycleState(createDefaultCycleState());
    fetch('/api/cycle/state', {
      method: 'DELETE',
      headers: {
        'x-fitsync-gender': state.profile.gender,
        'x-fitsync-user': state.profile.email || 'default',
      },
    }).catch(() => {});
    showToast('All cycle history permanently deleted', 'info');
  };

  const todaySession = useMemo(
    () => getSafeExercisesForDay(todayAbbrev, state.profile, metrics),
    [todayAbbrev, state.profile, metrics]
  );
  void todaySession;

  return (
    <AppStateContext.Provider
      value={{
        state,
        theme,
        setTheme,
        toggleTheme,
        metrics,
        todayAbbrev,
        eatenTodayKcal: eatenStats.kcal,
        eatenMacros: {
          protein: eatenStats.protein,
          carbs: eatenStats.carbs,
          fats: eatenStats.fats,
        },
        burnedTodayKcal: state.extraBurnedTodayKcal,
        toast,
        dismissToast: () => setToast(null),
        showToast,
        completeOnboarding,
        updateProfileGender,
        setSelectedMealDay,
        toggleMealCheck,
        toggleHabitCheck,
        completeExerciseSession,
        applyCheatMeal,
        logWeightEntry,
        submitWeeklyCheckInFeedback,
        resetAllData,
        cycleTrackingEnabled,
        cycleState,
        cycleEngine,
        completeCycleOnboarding,
        saveCycleDailyLog,
        bulkMarkFastTrackPeriods,
        updateCycleSettings,
        toggleHideCycle,
        createCustomTag,
        deleteCustomTag,
        updateReminders,
        updateConnectState,
        deleteAllCycleHistory,
      }}
    >
      {children}
    </AppStateContext.Provider>
  );
}

export function useAppState() {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error('useAppState must be used inside AppStateProvider');
  return ctx;
}
