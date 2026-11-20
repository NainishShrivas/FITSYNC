import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppIcon } from '../components/AppIcon';
import { ExercisePostureAnimator } from '../components/ExercisePostureAnimator';
import { useAppState } from '../context/AppStateContext';
import {
  ALL_POSTURE_KEYS,
  EXERCISE_POSTURE_SPECS,
  getExerciseItemForSpec,
  type ExerciseAnimationKey,
} from '../data/exerciseAnimations';
import type { DayAbbrev } from '../types/fitsync';
import { DAYS_ORDER, getSafeExercisesForDay } from '../utils/calibrateEngine';

type PlansTab = 'schedule' | 'library';
type LibraryFilter = 'All' | 'Strength' | 'Cardio' | 'Core & Joint-Safe';

export function PlansPage() {
  const { state, metrics, todayAbbrev } = useAppState();
  const navigate = useNavigate();
  const [selectedDay, setSelectedDay] = useState<DayAbbrev>(todayAbbrev);
  const [activeTab, setActiveTab] = useState<PlansTab>('schedule');
  const [libraryFilter, setLibraryFilter] = useState<LibraryFilter>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [inspectedKey, setInspectedKey] = useState<ExerciseAnimationKey | null>(null);

  useEffect(() => {
    if (!inspectedKey) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setInspectedKey(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [inspectedKey]);

  const session = useMemo(
    () => getSafeExercisesForDay(selectedDay, state.profile, metrics),
    [selectedDay, state.profile, metrics]
  );

  const hasCheatBurnForDay = state.activeCheatPlan?.allocatedDays.includes(selectedDay) ?? false;
  const totalEstimatedBurn = useMemo(() => {
    const base = session.exercises.reduce((acc, ex) => acc + (ex.estimatedNetKcal ?? 0), 0);
    return base + (hasCheatBurnForDay ? state.activeCheatPlan?.dailyExtraBurnKcal ?? 0 : 0);
  }, [session.exercises, hasCheatBurnForDay, state.activeCheatPlan]);

  const isCompleted = state.completedWorkoutDays.includes(selectedDay);
  const hasMedicalOverrides = metrics.medicalOverrides.activeKeys.length > 0;

  const filteredSpecs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return ALL_POSTURE_KEYS.map((k) => EXERCISE_POSTURE_SPECS[k]).filter((spec) => {
      if (libraryFilter !== 'All' && spec.category !== libraryFilter) return false;
      if (!q) return true;
      const haystack = `${spec.title} ${spec.shortName} ${spec.equipment} ${spec.primaryMuscles.join(' ')} ${spec.category}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [libraryFilter, searchQuery]);

  const inspectedSpec = inspectedKey ? EXERCISE_POSTURE_SPECS[inspectedKey] : null;
  const inspectedExercise = useMemo(
    () => (inspectedSpec ? getExerciseItemForSpec(inspectedSpec) : null),
    [inspectedSpec]
  );

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[var(--text-primary)] tracking-tight">
            Workout Portal
          </h1>
          <p className="text-sm text-[var(--text-secondary)] mt-0.5">
            Your calibrated schedule and correct-posture movement demonstrations
          </p>
        </div>

        {hasMedicalOverrides && (
          <div className="rounded-full bg-[var(--card-surface)] border border-[var(--status-success)]/40 px-3.5 py-2 flex items-center gap-2 text-xs font-bold text-[var(--text-primary)]">
            <AppIcon name="shieldCheck" size={16} className="text-[var(--status-success)]" />
            <span>
              Medical Safety Filter Active ({metrics.medicalOverrides.activeKeys.length})
            </span>
          </div>
        )}
      </header>

      {/* Segmented Workspace Mode Switch */}
      <div
        className="inline-flex items-center gap-1 p-1 rounded-xl bg-[var(--card-surface)] border border-[var(--border-subtle)]"
        role="tablist"
        aria-label="Workout portal views"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'schedule'}
          onClick={() => setActiveTab('schedule')}
          data-testid="plans-weekly-schedule-tab"
          className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            activeTab === 'schedule'
              ? 'bg-[var(--primary)] text-white'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          Weekly Schedule
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'library'}
          onClick={() => setActiveTab('library')}
          data-testid="plans-posture-library-tab"
          className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer tabular-nums ${
            activeTab === 'library'
              ? 'bg-[var(--primary)] text-white'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          Posture Animations ({ALL_POSTURE_KEYS.length})
        </button>
      </div>

      {activeTab === 'schedule' ? (
        <>
          {/* Active Medical Safety Rules Banner */}
          {metrics.medicalOverrides.notes.length > 0 && (
            <div className="fitsync-card p-4 bg-[var(--surface-inset)] border border-[var(--border-subtle)] space-y-1">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[var(--primary)]">
                <AppIcon name="heartPulse" size={15} />
                <span>Deterministic Medical Overrides Applied</span>
              </div>
              {metrics.medicalOverrides.notes.map((n, i) => (
                <p key={i} className="text-xs text-[var(--text-primary)] font-medium">
                  • {n}
                </p>
              ))}
            </div>
          )}

          {/* Horizontal Mon-Sun Calendar Strip */}
          <section className="fitsync-card p-4 sm:p-5" aria-labelledby="plans-week-heading">
            <div className="flex items-center gap-2 mb-3">
              <AppIcon name="calendar" size={18} className="text-[var(--primary)]" />
              <h2 id="plans-week-heading" className="text-base font-extrabold text-[var(--text-primary)]">
                This Week
              </h2>
            </div>

            <div className="grid grid-cols-7 gap-2">
              {DAYS_ORDER.map((day) => {
                const active = day === selectedDay;
                const isToday = day === todayAbbrev;
                const isTraining = state.profile.trainingDays.includes(day);
                const hasCheat = state.activeCheatPlan?.allocatedDays.includes(day) ?? false;
                const done = state.completedWorkoutDays.includes(day);

                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => setSelectedDay(day)}
                    className={`py-3 px-1 rounded-2xl flex flex-col items-center justify-center gap-1 transition-colors cursor-pointer ${
                      active
                        ? 'bg-[var(--primary)] text-white shadow-sm'
                        : 'bg-[var(--surface-inset)] text-[var(--text-primary)] hover:bg-[var(--border-subtle)]/70'
                    }`}
                  >
                    <span className={`text-[11px] font-bold uppercase ${active ? 'text-white' : 'text-[var(--text-secondary)]'}`}>
                      {day}
                    </span>
                    <div className="w-6 h-6 flex items-center justify-center">
                      {done ? (
                        <AppIcon name="checkCircle" size={16} className={active ? 'text-white' : 'text-[var(--status-success)]'} />
                      ) : hasCheat ? (
                        <AppIcon name="flame" size={16} className={active ? 'text-orange-300' : 'text-[var(--status-surge)]'} />
                      ) : isTraining ? (
                        <AppIcon name="dumbbell" size={16} className={active ? 'text-white' : 'text-[var(--primary)]'} />
                      ) : (
                        <AppIcon name="moon" size={15} className={active ? 'text-white/80' : 'text-[var(--text-secondary)]'} />
                      )}
                    </div>
                    {isToday && (
                      <span className={`text-[10px] font-bold ${active ? 'text-white/90' : 'text-[var(--primary)]'}`}>
                        Today
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>

          {/* Active Day Session Card */}
          <section className="fitsync-card p-5 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-extrabold text-[var(--text-primary)]">
                  {selectedDay} — {session.sessionTitle}
                </h2>
                <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs font-medium text-[var(--text-secondary)] tabular-nums">
                  <span className="inline-flex items-center gap-1">
                    <AppIcon name="clock" size={14} /> {state.profile.sessionDurationMins} min
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="inline-flex items-center gap-1 text-[var(--accent-violet)] font-semibold">
                    <AppIcon name="flame" size={14} /> ~{totalEstimatedBurn} kcal Net MET
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{session.exercises.length} exercises</span>
                  <span aria-hidden="true">·</span>
                  <span>{session.warmupMinutes} min warm-up</span>
                </div>
              </div>

              <span
                className={`px-3 py-1 rounded-full text-xs font-bold ${
                  isCompleted
                    ? 'bg-[var(--status-success)]/15 text-[var(--status-success)]'
                    : 'bg-[var(--surface-inset)] text-[var(--text-secondary)]'
                }`}
              >
                {isCompleted ? 'Completed' : 'Pending'}
              </span>
            </div>

            {/* Exercise Rows with Live Correct-Posture Animations */}
            <div className="space-y-3">
              {session.exercises.map((ex, idx) => (
                <button
                  key={ex.id}
                  type="button"
                  onClick={() => navigate(`/plans/exercise/${ex.id}?day=${selectedDay}`)}
                  className="w-full p-3.5 sm:p-4 rounded-2xl bg-[var(--surface-inset)] hover:bg-[var(--border-subtle)]/70 transition-colors flex items-center justify-between gap-3 text-left cursor-pointer"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <ExercisePostureAnimator
                      exercise={ex}
                      variant="thumb"
                      className="w-20 h-16 sm:w-24 sm:h-[72px]"
                    />
                    <div className="min-w-0">
                      <span className="block text-[11px] font-bold uppercase tracking-wider text-[var(--primary)] tabular-nums">
                        Exercise 0{idx + 1} · Live Form Guide
                      </span>
                      <span className="block text-sm sm:text-base font-bold text-[var(--text-primary)] truncate">
                        {ex.shortName}
                      </span>
                      <span className="block text-xs text-[var(--text-secondary)] mt-0.5 tabular-nums">
                        {ex.mode === 'reps'
                          ? `${ex.defaultSets} sets × ${ex.defaultReps} reps`
                          : `${ex.defaultSets} sets × ${ex.defaultDurationSec} sec`}{' '}
                        · {ex.category} · {ex.impact} Impact · ~{ex.estimatedNetKcal} kcal
                      </span>
                      {ex.wasSwappedFrom && (
                        <span className="block text-[11px] font-semibold text-[var(--status-success)] mt-1">
                          Safety Swap from {ex.wasSwappedFrom}
                        </span>
                      )}
                    </div>
                  </div>
                  <AppIcon name="chevronRight" size={18} className="text-[var(--text-secondary)] shrink-0" />
                </button>
              ))}

              {/* Injected Calibration Block Row when Cheat Plan active on this day */}
              {hasCheatBurnForDay && state.activeCheatPlan && (
                <button
                  type="button"
                  onClick={() =>
                    navigate(`/plans/exercise/${state.activeCheatPlan!.exerciseId}?day=${selectedDay}&calibration=1`)
                  }
                  className="w-full p-3.5 sm:p-4 rounded-2xl bg-orange-50 dark:bg-orange-950/40 border border-[var(--status-surge)]/40 hover:bg-orange-100/70 dark:hover:bg-orange-950/60 transition-colors flex items-center justify-between gap-3 text-left cursor-pointer"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <ExercisePostureAnimator
                      exercise={{
                        id: state.activeCheatPlan.exerciseId,
                        name: state.activeCheatPlan.exerciseName,
                        shortName: state.activeCheatPlan.exerciseName,
                      }}
                      variant="thumb"
                      className="w-20 h-16 sm:w-24 sm:h-[72px]"
                    />
                    <div className="min-w-0">
                      <span className="block text-xs font-bold uppercase tracking-wider text-[var(--status-surge)]">
                        Cheat Meal Calibration Block
                      </span>
                      <span className="block text-sm sm:text-base font-bold text-[var(--text-primary)] truncate">
                        {state.activeCheatPlan.exerciseName}
                      </span>
                      <span className="block text-xs text-[var(--text-secondary)] mt-0.5 tabular-nums">
                        {state.activeCheatPlan.netDurationMinsPerDay} min ·{' '}
                        +{state.activeCheatPlan.dailyExtraBurnKcal} kcal Net MET burn
                      </span>
                    </div>
                  </div>
                  <AppIcon name="chevronRight" size={18} className="text-[var(--status-surge)] shrink-0" />
                </button>
              )}
            </div>
          </section>
        </>
      ) : (
        /* Complete 11-Exercise Correct-Posture Animation Library */
        <section className="space-y-4" aria-label="Complete Exercise Posture Library">
          <div className="fitsync-card p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              {(['All', 'Strength', 'Cardio', 'Core & Joint-Safe'] as LibraryFilter[]).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setLibraryFilter(cat)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    libraryFilter === cat
                      ? 'bg-[var(--primary)] text-white'
                      : 'bg-[var(--surface-inset)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {cat === 'All' ? `All (${ALL_POSTURE_KEYS.length})` : cat}
                </button>
              ))}
            </div>

            <div className="relative w-full sm:w-64">
              <AppIcon
                name="search"
                size={15}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter by exercise or muscle..."
                aria-label="Filter exercise posture animations"
                className="w-full h-9 pl-9 pr-3 rounded-lg bg-[var(--surface-inset)] border border-[var(--border-subtle)] text-xs font-medium text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] focus:outline-none focus:border-[var(--primary)]"
              />
            </div>
          </div>

          {filteredSpecs.length === 0 ? (
            <div className="fitsync-card p-8 text-center space-y-2">
              <p className="text-sm font-bold text-[var(--text-primary)]">
                No exercises match "{searchQuery}"
              </p>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setLibraryFilter('All');
                }}
                className="px-4 py-2 rounded-lg bg-[var(--primary)] text-white text-xs font-bold cursor-pointer"
              >
                Reset Filters
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredSpecs.map((spec) => {
                const exItem = getExerciseItemForSpec(spec);
                return (
                  <article
                    key={spec.key}
                    className="fitsync-card p-4 flex flex-col justify-between gap-3"
                  >
                    <div className="space-y-3">
                      <button
                        type="button"
                        onClick={() => setInspectedKey(spec.key)}
                        className="w-full block text-left cursor-pointer group"
                      >
                        <ExercisePostureAnimator
                          exercise={exItem}
                          animationKeyOverride={spec.key}
                          variant="thumb"
                          className="w-full h-40 group-hover:border-[var(--primary)] transition-colors"
                        />
                      </button>

                      <div>
                        <p className="text-[11px] font-semibold text-[var(--text-secondary)]">
                          {spec.category} · {spec.equipment}
                        </p>
                        <h3 className="text-base font-extrabold text-[var(--text-primary)] mt-0.5">
                          {spec.title}
                        </h3>
                        <p className="text-xs text-[var(--text-secondary)] mt-1">
                          <span className="font-bold text-[#E11D48] dark:text-[#FB7185]">Target:</span>{' '}
                          {spec.primaryMuscles.join(', ')}
                        </p>
                        {spec.safetySwapNote && (
                          <p className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 mt-1">
                            {spec.safetySwapNote}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-2 border-t border-[var(--border-subtle)]">
                      <button
                        type="button"
                        onClick={() => setInspectedKey(spec.key)}
                        data-testid={`inspect-posture-${spec.key}`}
                        className="flex-1 h-9 rounded-lg bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                      >
                        <AppIcon name="play" size={13} />
                        <span>Inspect Form</span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          navigate(`/plans/exercise/${spec.linkedExerciseId}?variant=${spec.key}`)
                        }
                        className="h-9 px-3 rounded-lg bg-[var(--surface-inset)] hover:bg-[var(--border-subtle)] text-[var(--text-primary)] text-xs font-bold transition-colors cursor-pointer whitespace-nowrap"
                      >
                        Log Sets
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Interactive Posture Studio Modal */}
      {inspectedSpec && inspectedExercise && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-label={`${inspectedSpec.title} full posture guide`}
          onClick={() => setInspectedKey(null)}
        >
          <div
            className="w-full max-w-3xl my-auto space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 px-1">
              <button
                type="button"
                onClick={() =>
                  navigate(
                    `/plans/exercise/${inspectedSpec.linkedExerciseId}?variant=${inspectedSpec.key}`
                  )
                }
                className="h-9 px-4 rounded-lg bg-[var(--card-surface)] border border-[var(--border-subtle)] text-xs font-bold text-[var(--primary)] hover:bg-[var(--surface-inset)] transition-colors cursor-pointer"
              >
                Open Sets Logger &amp; Rest Timer →
              </button>
              <button
                type="button"
                onClick={() => setInspectedKey(null)}
                data-testid="close-posture-modal"
                aria-label="Close posture inspector"
                className="h-9 px-3.5 rounded-lg bg-[var(--card-surface)] border border-[var(--border-subtle)] text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--surface-inset)] flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <AppIcon name="x" size={15} />
                <span>Close</span>
              </button>
            </div>

            <ExercisePostureAnimator
              exercise={inspectedExercise}
              animationKeyOverride={inspectedSpec.key}
              variant="studio"
            />
          </div>
        </div>
      )}
    </div>
  );
}
