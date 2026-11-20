import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppIcon } from '../components/AppIcon';
import { ExercisePostureAnimator } from '../components/ExercisePostureAnimator';
import { ProgressRing } from '../components/ProgressRing';
import { useAppState } from '../context/AppStateContext';
import { DAYS_ORDER, getSafeExercisesForDay, getScaledMealsForDay } from '../utils/calibrateEngine';
import { DAILY_MOTIVATIONS } from '../utils/storage';

export function DashboardPage() {
  const {
    state,
    metrics,
    todayAbbrev,
    eatenTodayKcal,
    eatenMacros,
    burnedTodayKcal,
    setSelectedMealDay,
    toggleMealCheck,
    toggleHabitCheck,
  } = useAppState();
  const navigate = useNavigate();

  const todaySession = useMemo(
    () => getSafeExercisesForDay(todayAbbrev, state.profile, metrics),
    [todayAbbrev, state.profile, metrics]
  );

  const estimatedSessionBurn = useMemo(
    () => todaySession.exercises.reduce((acc, ex) => acc + (ex.estimatedNetKcal ?? 0), 0),
    [todaySession.exercises]
  );

  const dayMeals = useMemo(
    () =>
      getScaledMealsForDay(
        state.selectedMealDay,
        state.profile.dietPreference,
        metrics.safeTargetKcal,
        metrics.medicalOverrides
      ),
    [state.selectedMealDay, state.profile.dietPreference, metrics.safeTargetKcal, metrics.medicalOverrides]
  );

  const isTodayWorkoutDone = state.completedWorkoutDays.includes(todayAbbrev);
  const totalHabits = state.profile.habits.length;
  const completedHabitsCount = state.checkedHabits.length;
  const completedMealsCount = state.checkedMealIds.length;
  const totalTasks = totalHabits + dayMeals.meals.length + 1;
  const doneTasks = completedHabitsCount + completedMealsCount + (isTodayWorkoutDone ? 1 : 0);
  const dailyProgressPct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  const netCaloriesToday = eatenTodayKcal - burnedTodayKcal;
  const caloriesLeft = Math.max(0, metrics.safeTargetKcal - netCaloriesToday);
  const motivationQuote = DAILY_MOTIVATIONS[(state.selectedMealDay - 1) % DAILY_MOTIVATIONS.length];

  return (
    <div className="space-y-5">
      {/* Header Row */}
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[var(--text-primary)] tracking-tight">
            Today's Agenda
          </h1>
          <p className="text-sm text-[var(--text-secondary)] mt-0.5">Let's make it count</p>
        </div>

        <div className="bg-[var(--card-surface)] border border-[var(--border-subtle)] rounded-full px-3.5 py-2 shadow-[0_8px_24px_-6px_rgba(30,27,75,0.08)] flex items-center gap-1.5 shrink-0">
          <AppIcon name="flame" size={16} className="text-[var(--accent-violet)]" />
          <span className="text-sm font-bold text-[var(--text-primary)] tabular-nums">
            {state.streakDays}
          </span>
          <span className="text-xs font-medium text-[var(--text-secondary)]">day streak</span>
        </div>
      </header>

      {/* Dual Calorie Ring Cards + Motivation */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
        <div className="lg:col-span-7 grid grid-cols-2 gap-3.5">
          <div className="fitsync-card p-5 flex flex-col items-center justify-center">
            <ProgressRing
              value={eatenTodayKcal}
              max={metrics.safeTargetKcal}
              color="var(--status-success)"
              label="EATEN"
              sublabel={`of ${metrics.safeTargetKcal.toLocaleString()} kcal`}
              centerDisplay={eatenTodayKcal.toLocaleString()}
            />
            <div className="mt-3 w-full flex items-center justify-center gap-2 text-[11px] font-semibold text-[var(--text-secondary)] tabular-nums">
              <span>P {eatenMacros.protein}g</span>
              <span aria-hidden="true">·</span>
              <span>C {eatenMacros.carbs}g</span>
              <span aria-hidden="true">·</span>
              <span>F {eatenMacros.fats}g</span>
            </div>
          </div>

          <div className="fitsync-card p-5 flex flex-col items-center justify-center">
            <ProgressRing
              value={burnedTodayKcal}
              max={Math.max(250, estimatedSessionBurn)}
              color="var(--status-surge)"
              label="BURNED"
              sublabel="burned today"
              centerDisplay={burnedTodayKcal.toLocaleString()}
            />
            <p className="mt-3 text-[11px] font-semibold text-[var(--text-secondary)] tabular-nums">
              Target burn ~{estimatedSessionBurn} kcal
            </p>
          </div>
        </div>

        {/* Daily Motivation + Net Calories */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          <div className="rounded-[20px] bg-[var(--surface-inset)] border border-[var(--border-subtle)] p-4 flex items-start gap-3">
            <AppIcon name="quote" size={22} className="text-[var(--text-secondary)] shrink-0 mt-0.5" />
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                Daily Motivation
              </p>
              <p className="text-sm font-semibold italic text-[var(--text-primary)] mt-1">
                {motivationQuote}
              </p>
            </div>
          </div>

          <div className="fitsync-card p-5 flex-1 flex flex-col justify-between">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                  Net Calories Today
                </p>
                <p className="text-2xl font-extrabold text-[var(--primary)] tabular-nums mt-1">
                  {netCaloriesToday.toLocaleString()} kcal
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs font-semibold text-[var(--text-secondary)]">Daily Progress</p>
                <p className="text-xl font-extrabold text-[var(--text-primary)] tabular-nums mt-0.5">
                  {dailyProgressPct}%
                </p>
              </div>
            </div>

            <div className="mt-3">
              <div className="w-full h-2.5 rounded-full bg-[var(--surface-inset)] overflow-hidden">
                <div
                  className="h-full rounded-full bg-[var(--primary)] transition-all duration-300"
                  style={{ width: `${Math.max(4, dailyProgressPct)}%` }}
                />
              </div>
              <div className="flex items-center justify-between mt-2 text-xs font-medium text-[var(--text-secondary)] tabular-nums">
                <span>
                  {doneTasks}/{totalTasks} tasks done
                </span>
                <span>{caloriesLeft.toLocaleString()} kcal left</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Log Cheat Meal Full-Width CTA */}
      <button
        type="button"
        onClick={() => navigate('/cheat-meal')}
        className="w-full h-13 rounded-full bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white font-bold text-sm sm:text-base flex items-center justify-center gap-2.5 shadow-[0_8px_24px_-6px_rgba(61,44,142,0.35)] transition-colors cursor-pointer"
      >
        <AppIcon name="pizza" size={18} />
        <span>Log Cheat Meal</span>
      </button>

      {/* Sarvam AI Weekly Check-In Call & Auto-Calibration Banner */}
      <section className="fitsync-card p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4 border border-[var(--border-subtle)]">
        <div className="flex items-start gap-3.5 max-w-2xl">
          <div className="w-11 h-11 rounded-2xl bg-[var(--primary)]/15 text-[var(--primary)] flex items-center justify-center shrink-0">
            <AppIcon name="phone" size={20} />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm sm:text-base font-extrabold text-[var(--text-primary)]">
                Sarvam AI Weekly Check-In Call
              </h2>
              {(state.weeklyCheckIns?.length ?? 0) > 0 && (
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-[10px] font-extrabold uppercase">
                  {state.weeklyCheckIns.length} saved · Auto-calibrated
                </span>
              )}
            </div>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              {(state.weeklyCheckIns?.length ?? 0) > 0
                ? `Latest feedback saved (${state.weeklyCheckIns[0].appliedFixes.length} plan fix${
                    state.weeklyCheckIns[0].appliedFixes.length === 1 ? '' : 'es'
                  } applied): "${state.weeklyCheckIns[0].aiSummary}"`
                : 'Take a quick Sarvam AI call to review your weekly progress and share any diet, health, or exercise issues — your plan automatically adjusts to fix them.'}
            </p>
          </div>
        </div>

        <button
          type="button"
          data-testid="dashboard-sarvam-checkin-btn"
          onClick={() => navigate('/ai-coach?tab=weekly-call')}
          className="h-10 px-4 rounded-full bg-[var(--surface-inset)] hover:bg-[var(--primary)] hover:text-white border border-[var(--border-subtle)] text-xs font-bold text-[var(--text-primary)] flex items-center gap-2 transition-colors cursor-pointer shrink-0"
        >
          <AppIcon name="phone" size={14} />
          <span>{(state.weeklyCheckIns?.length ?? 0) > 0 ? 'New Check-In Call' : 'Start Check-In Call'}</span>
        </button>
      </section>

      {/* This Week 7-Day Strip */}
      <section className="fitsync-card p-5" aria-labelledby="this-week-heading">
        <div className="flex items-center justify-between mb-3.5">
          <div className="flex items-center gap-2">
            <AppIcon name="calendar" size={18} className="text-[var(--primary)]" />
            <h2 id="this-week-heading" className="text-base font-extrabold text-[var(--text-primary)]">
              This Week
            </h2>
          </div>
          {state.activeCheatPlan && (
            <span className="text-xs font-semibold text-[var(--status-surge)] tabular-nums">
              +{state.activeCheatPlan.dailyExtraBurnKcal} kcal/day cheat burn active
            </span>
          )}
        </div>

        <div className="grid grid-cols-7 gap-2">
          {DAYS_ORDER.map((day) => {
            const isToday = day === todayAbbrev;
            const isWorkoutDay = state.profile.trainingDays.includes(day);
            const isDone = state.completedWorkoutDays.includes(day);
            const hasCheatBurn = state.activeCheatPlan?.allocatedDays.includes(day) ?? false;

            return (
              <button
                key={day}
                type="button"
                onClick={() => navigate('/plans')}
                className={`py-3 px-1 rounded-2xl flex flex-col items-center justify-center gap-1.5 transition-colors border cursor-pointer ${
                  isToday
                    ? 'border-[var(--primary)] bg-[var(--surface-inset)]'
                    : 'border-transparent bg-[var(--surface-inset)]/70 hover:bg-[var(--surface-inset)]'
                }`}
              >
                <span className="text-[11px] font-bold uppercase text-[var(--text-secondary)]">
                  {day}
                </span>
                <div className="w-7 h-7 rounded-full flex items-center justify-center">
                  {isDone ? (
                    <AppIcon name="checkCircle" size={18} className="text-[var(--status-success)]" />
                  ) : hasCheatBurn ? (
                    <AppIcon name="flame" size={18} className="text-[var(--status-surge)]" />
                  ) : isWorkoutDay ? (
                    <AppIcon name="dumbbell" size={17} className="text-[var(--primary)]" />
                  ) : (
                    <AppIcon name="moon" size={16} className="text-[var(--text-secondary)]" />
                  )}
                </div>
              </button>
            );
          })}
        </div>

        <div className="mt-3.5 flex flex-wrap items-center gap-4 text-xs text-[var(--text-secondary)]">
          <span className="inline-flex items-center gap-1.5">
            <AppIcon name="dumbbell" size={14} className="text-[var(--primary)]" /> Workout day
          </span>
          <span className="inline-flex items-center gap-1.5">
            <AppIcon name="flame" size={14} className="text-[var(--status-surge)]" /> Cheat Burn
          </span>
          <span className="inline-flex items-center gap-1.5">
            <AppIcon name="checkCircle" size={14} className="text-[var(--status-success)]" /> Done
          </span>
        </div>
      </section>

      {/* Main Checklists Grid: Workout + Habits + Meals */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-5 space-y-5">
          {/* Today's Workout Card */}
          <section className="fitsync-card p-5" aria-labelledby="todays-workout-heading">
            <div className="flex items-center justify-between mb-3.5">
              <div className="flex items-center gap-2">
                <AppIcon name="dumbbell" size={18} className="text-[var(--primary)]" />
                <h2 id="todays-workout-heading" className="text-base font-extrabold text-[var(--text-primary)]">
                  Today's Workout
                </h2>
              </div>
              <span className="text-xs font-bold text-[var(--text-secondary)] tabular-nums">
                {isTodayWorkoutDone ? '1/1' : '0/1'}
              </span>
            </div>

            <button
              type="button"
              onClick={() => navigate('/plans')}
              className="w-full p-4 rounded-2xl bg-[var(--surface-inset)] hover:bg-[var(--border-subtle)]/60 transition-colors flex items-center justify-between gap-3 text-left cursor-pointer"
            >
              <div className="flex items-center gap-3.5">
                {todaySession.exercises[0] ? (
                  <ExercisePostureAnimator
                    exercise={todaySession.exercises[0]}
                    variant="thumb"
                    className="w-16 h-14"
                  />
                ) : (
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                      isTodayWorkoutDone
                        ? 'bg-[var(--status-success)] text-white'
                        : 'border-2 border-[var(--border-subtle)] bg-[var(--card-surface)]'
                    }`}
                  >
                    {isTodayWorkoutDone && <AppIcon name="check" size={16} />}
                  </div>
                )}
                <div>
                  <span className="block text-sm font-bold text-[var(--text-primary)]">
                    {todaySession.sessionTitle}
                  </span>
                  <span className="block text-xs text-[var(--text-secondary)] mt-0.5 tabular-nums">
                    Burn ~{estimatedSessionBurn} kcal · {state.profile.sessionDurationMins} min ·{' '}
                    {todaySession.exercises.length} exercises
                  </span>
                </div>
              </div>
              <AppIcon name="chevronRight" size={18} className="text-[var(--text-secondary)] shrink-0" />
            </button>
          </section>

          {/* Habits Checklist Card */}
          <section className="fitsync-card p-5" aria-labelledby="habits-heading">
            <div className="flex items-center justify-between mb-3.5">
              <div className="flex items-center gap-2">
                <AppIcon name="checkCircle" size={18} className="text-[var(--primary)]" />
                <h2 id="habits-heading" className="text-base font-extrabold text-[var(--text-primary)]">
                  Habits
                </h2>
              </div>
              <span className="text-xs font-bold text-[var(--text-secondary)] tabular-nums">
                {completedHabitsCount}/{totalHabits}
              </span>
            </div>

            <div className="space-y-2.5">
              {state.profile.habits.map((habit) => {
                const checked = state.checkedHabits.includes(habit);
                return (
                  <button
                    key={habit}
                    type="button"
                    onClick={() => toggleHabitCheck(habit)}
                    className={`w-full px-4 py-3.5 rounded-2xl flex items-center gap-3.5 text-left transition-colors border cursor-pointer ${
                      checked
                        ? 'bg-[var(--surface-inset)] border-[var(--primary)]/20'
                        : 'bg-[var(--card-surface)] border-[var(--border-subtle)] hover:bg-[var(--surface-inset)]/60'
                    }`}
                  >
                    <span
                      className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                        checked
                          ? 'bg-[var(--primary)] text-white'
                          : 'border-2 border-[var(--border-subtle)] bg-[var(--card-surface)]'
                      }`}
                    >
                      {checked && <AppIcon name="check" size={14} />}
                    </span>
                    <span
                      className={`text-sm font-semibold ${
                        checked
                          ? 'line-through text-[var(--text-secondary)]'
                          : 'text-[var(--text-primary)]'
                      }`}
                    >
                      {habit}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        </div>

        {/* Today's Meals Card */}
        <section className="lg:col-span-7 fitsync-card p-5 flex flex-col" aria-labelledby="meals-heading">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2">
              <AppIcon name="utensils" size={18} className="text-[var(--primary)]" />
              <div>
                <h2 id="meals-heading" className="text-base font-extrabold text-[var(--text-primary)]">
                  Today's Meals ({state.profile.dietPreference})
                </h2>
                <p className="text-xs text-[var(--text-secondary)] tabular-nums">
                  Scaled to {metrics.safeTargetKcal.toLocaleString()} kcal · Water target{' '}
                  {metrics.driTargets.waterL} L
                </p>
              </div>
            </div>

            {/* Day 1-7 Meal Switcher */}
            <div className="flex items-center gap-1 bg-[var(--surface-inset)] p-1 rounded-xl" role="tablist" aria-label="Meal template day">
              {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                <button
                  key={d}
                  type="button"
                  role="tab"
                  aria-selected={state.selectedMealDay === d}
                  onClick={() => setSelectedMealDay(d)}
                  className={`w-7 h-7 rounded-lg text-xs font-bold tabular-nums transition-colors cursor-pointer ${
                    state.selectedMealDay === d
                      ? 'bg-[var(--primary)] text-white'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3 flex-1">
            {dayMeals.meals.map((meal) => {
              const checked = state.checkedMealIds.includes(meal.id);
              return (
                <button
                  key={meal.id}
                  type="button"
                  onClick={() => toggleMealCheck(meal.id)}
                  className={`w-full p-4 rounded-2xl flex items-start justify-between gap-3 text-left border transition-colors cursor-pointer ${
                    checked
                      ? 'bg-[var(--surface-inset)] border-[var(--status-success)]/40'
                      : 'bg-[var(--card-surface)] border-[var(--border-subtle)] hover:bg-[var(--surface-inset)]/60'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={`mt-0.5 w-6 h-6 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                        checked
                          ? 'bg-[var(--status-success)] text-white'
                          : 'border-2 border-[var(--border-subtle)] bg-[var(--card-surface)]'
                      }`}
                    >
                      {checked && <AppIcon name="check" size={14} />}
                    </span>
                    <div>
                      <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--primary)]">
                        {meal.slot}
                      </span>
                      <p
                        className={`text-sm font-bold mt-0.5 ${
                          checked
                            ? 'line-through text-[var(--text-secondary)]'
                            : 'text-[var(--text-primary)]'
                        }`}
                      >
                        {meal.name}
                      </p>
                      <p className="text-xs text-[var(--text-secondary)] mt-1 tabular-nums">
                        {meal.protein}g P · {meal.carbs}g C · {meal.fats}g F
                      </p>
                      {(meal.oxalateSwapped || meal.carbCapNotice) && (
                        <p className="text-[11px] font-semibold text-[var(--status-success)] mt-1">
                          {meal.oxalateSwapped ? 'Low-oxalate renal swap applied' : meal.carbCapNotice}
                        </p>
                      )}
                    </div>
                  </div>
                  <span className="text-sm font-extrabold text-[var(--text-primary)] tabular-nums shrink-0">
                    {meal.kcal} kcal
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
