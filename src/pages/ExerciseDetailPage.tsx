import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AppIcon } from '../components/AppIcon';
import { ExercisePostureAnimator } from '../components/ExercisePostureAnimator';
import { useAppState } from '../context/AppStateContext';
import dataset from '../data/calibrate_dataset.json';
import {
  EXERCISE_POSTURE_SPECS,
  getExerciseItemForSpec,
  type ExerciseAnimationKey,
} from '../data/exerciseAnimations';
import type { DayAbbrev, ExerciseItem, ExerciseSetLog } from '../types/fitsync';
import { calculateNetMetBurnKcal, getSafeExercisesForDay } from '../utils/calibrateEngine';

const STOPWATCH_IMG = '/src/assets/images/rest_stopwatch_3d_1795105223994.jpg';

export function ExerciseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { state, metrics, todayAbbrev, completeExerciseSession } = useAppState();

  const dayParam = (searchParams.get('day') as DayAbbrev) || todayAbbrev;
  const isCalibrationBlock = searchParams.get('calibration') === '1';
  const variantParam = searchParams.get('variant') as ExerciseAnimationKey | null;
  const validVariant =
    variantParam && variantParam in EXERCISE_POSTURE_SPECS ? variantParam : undefined;

  const exercise: ExerciseItem = useMemo(() => {
    if (validVariant) {
      return getExerciseItemForSpec(EXERCISE_POSTURE_SPECS[validVariant]);
    }
    const safeSession = getSafeExercisesForDay(dayParam, state.profile, metrics);
    const fromSafe = safeSession.exercises.find((e) => e.id === id);
    if (fromSafe) return fromSafe;
    const raw = (dataset.exercises as ExerciseItem[]).find((e) => e.id === id);
    return raw ?? (dataset.exercises[0] as ExerciseItem);
  }, [validVariant, id, dayParam, state.profile, metrics]);

  const [sets, setSets] = useState<ExerciseSetLog[]>(() => {
    const existing = state.exerciseLogs[exercise.id];
    if (existing && existing.length > 0) return existing;
    const count = isCalibrationBlock ? 1 : exercise.defaultSets;
    const defaultVal =
      isCalibrationBlock && state.activeCheatPlan
        ? state.activeCheatPlan.netDurationMinsPerDay * 60
        : exercise.mode === 'reps'
          ? exercise.defaultReps ?? 12
          : exercise.defaultDurationSec ?? 45;
    return Array.from({ length: count }, (_, idx) => ({
      setNumber: idx + 1,
      weightKg: exercise.defaultWeightKg,
      value: defaultVal,
      completed: false,
    }));
  });

  const [restSeconds, setRestSeconds] = useState<number>(60);
  const [restRunning, setRestRunning] = useState<boolean>(false);

  useEffect(() => {
    if (!restRunning) return;
    if (restSeconds <= 0) {
      setRestRunning(false);
      return;
    }
    const timer = window.setInterval(() => {
      setRestSeconds((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [restRunning, restSeconds]);

  const updateSetField = (index: number, field: 'weightKg' | 'value', delta: number, direct?: number) => {
    setSets((prev) =>
      prev.map((s, idx) => {
        if (idx !== index) return s;
        const nextVal = direct !== undefined ? Math.max(0, direct) : Math.max(0, s[field] + delta);
        return { ...s, [field]: nextVal };
      })
    );
  };

  const handleAddSet = () => {
    const last = sets[sets.length - 1];
    setSets((prev) => [
      ...prev,
      {
        setNumber: prev.length + 1,
        weightKg: last ? last.weightKg : exercise.defaultWeightKg,
        value: last ? last.value : exercise.mode === 'reps' ? 12 : 45,
        completed: false,
      },
    ]);
  };

  const estimatedEarnedKcal = useMemo(() => {
    if (isCalibrationBlock && state.activeCheatPlan) {
      return state.activeCheatPlan.dailyExtraBurnKcal;
    }
    const mins =
      exercise.mode === 'duration'
        ? Math.max(1, Math.round(sets.reduce((acc, s) => acc + s.value, 0) / 60))
        : Math.max(4, sets.length * 2);
    return calculateNetMetBurnKcal(exercise.met, state.profile.weightKg, mins);
  }, [isCalibrationBlock, state.activeCheatPlan, exercise, sets, state.profile.weightKg]);

  const handleCompleteWorkout = () => {
    const marked = sets.map((s) => ({ ...s, completed: true }));
    completeExerciseSession(exercise.id, marked, estimatedEarnedKcal);
    navigate('/dashboard');
  };

  return (
    <div className="space-y-5 max-w-3xl mx-auto">
      {/* Header */}
      <header className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label="Back to Workout Portal"
          className="w-11 h-11 rounded-full bg-[var(--card-surface)] border border-[var(--border-subtle)] flex items-center justify-center text-[var(--text-primary)] hover:bg-[var(--surface-inset)] transition-colors cursor-pointer"
        >
          <AppIcon name="chevronLeft" size={20} />
        </button>
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-[var(--text-primary)]">
            {exercise.shortName} — Set {sets.length}
          </h1>
          <p className="text-xs text-[var(--text-secondary)] tabular-nums">
            {exercise.category} · {exercise.met} MET (2024 Compendium) · Est. +{estimatedEarnedKcal} Net kcal
          </p>
        </div>
      </header>

      {exercise.safetyNote && (
        <div className="rounded-2xl bg-[var(--surface-inset)] border border-[var(--status-success)]/40 p-3.5 text-xs font-semibold text-[var(--text-primary)] flex items-start gap-2.5">
          <AppIcon name="shieldCheck" size={18} className="text-[var(--status-success)] shrink-0 mt-0.5" />
          <span>{exercise.safetyNote}</span>
        </div>
      )}

      {/* GymVisual-Style Animated Posture & Muscle Engagement Guide */}
      <ExercisePostureAnimator
        exercise={exercise}
        animationKeyOverride={validVariant}
        variant="studio"
      />

      {/* Sets Editor */}
      <section className="space-y-3" aria-label="Exercise sets">
        {sets.map((s, idx) => (
          <div key={s.setNumber} className="fitsync-card p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-extrabold uppercase tracking-wider text-[var(--primary)]">
                Set {s.setNumber}
              </span>
              <span className="text-xs text-[var(--text-secondary)]">{exercise.notes}</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-[var(--surface-inset)] p-3 text-center">
                <label
                  htmlFor={`weight-set-${s.setNumber}`}
                  className="block text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary)]"
                >
                  Weight (kg)
                </label>
                <div className="mt-2 flex items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => updateSetField(idx, 'weightKg', -2.5)}
                    aria-label={`Decrease weight for set ${s.setNumber}`}
                    className="w-8 h-8 rounded-full bg-[var(--card-surface)] border border-[var(--border-subtle)] font-bold text-[var(--text-primary)] cursor-pointer"
                  >
                    -
                  </button>
                  <input
                    id={`weight-set-${s.setNumber}`}
                    type="number"
                    min={0}
                    step="0.5"
                    value={s.weightKg}
                    onChange={(e) => updateSetField(idx, 'weightKg', 0, Number(e.target.value))}
                    className="w-16 text-center text-lg font-extrabold text-[var(--text-primary)] bg-transparent tabular-nums focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => updateSetField(idx, 'weightKg', 2.5)}
                    aria-label={`Increase weight for set ${s.setNumber}`}
                    className="w-8 h-8 rounded-full bg-[var(--card-surface)] border border-[var(--border-subtle)] font-bold text-[var(--text-primary)] cursor-pointer"
                  >
                    +
                  </button>
                </div>
              </div>

              <div className="rounded-2xl bg-[var(--surface-inset)] p-3 text-center">
                <label
                  htmlFor={`val-set-${s.setNumber}`}
                  className="block text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary)]"
                >
                  {exercise.mode === 'reps' ? 'Reps' : 'Seconds'}
                </label>
                <div className="mt-2 flex items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => updateSetField(idx, 'value', exercise.mode === 'reps' ? -1 : -15)}
                    aria-label={`Decrease ${exercise.mode} for set ${s.setNumber}`}
                    className="w-8 h-8 rounded-full bg-[var(--card-surface)] border border-[var(--border-subtle)] font-bold text-[var(--text-primary)] cursor-pointer"
                  >
                    -
                  </button>
                  <input
                    id={`val-set-${s.setNumber}`}
                    type="number"
                    min={1}
                    value={s.value}
                    onChange={(e) => updateSetField(idx, 'value', 0, Number(e.target.value))}
                    className="w-16 text-center text-lg font-extrabold text-[var(--text-primary)] bg-transparent tabular-nums focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => updateSetField(idx, 'value', exercise.mode === 'reps' ? 1 : 15)}
                    aria-label={`Increase ${exercise.mode} for set ${s.setNumber}`}
                    className="w-8 h-8 rounded-full bg-[var(--card-surface)] border border-[var(--border-subtle)] font-bold text-[var(--text-primary)] cursor-pointer"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}

        <button
          type="button"
          onClick={handleAddSet}
          className="w-full h-11 rounded-full bg-[var(--card-surface)] border border-[var(--border-subtle)] hover:bg-[var(--surface-inset)] text-sm font-bold text-[var(--primary)] flex items-center justify-center gap-2 transition-colors cursor-pointer"
        >
          <AppIcon name="plus" size={16} />
          <span>Add Set</span>
        </button>
      </section>

      {/* Interactive 3D Stopwatch Rest Timer */}
      <section className="fitsync-card p-6 flex flex-col items-center text-center">
        <div className="w-28 h-28 rounded-3xl bg-white dark:bg-[#1E253B] overflow-hidden flex items-center justify-center mb-3 p-1">
          <img
            src={STOPWATCH_IMG}
            alt="3D Rest Timer Stopwatch"
            referrerPolicy="no-referrer"
            className="w-full h-full object-contain"
          />
        </div>
        <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
          Rest Timer
        </p>
        <p className="text-4xl font-extrabold text-[var(--text-primary)] tabular-nums mt-1">
          {String(Math.floor(restSeconds / 60)).padStart(2, '0')}:
          {String(restSeconds % 60).padStart(2, '0')}
        </p>

        <div className="flex items-center gap-2 mt-4">
          {[30, 60, 90].map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => {
                setRestRunning(false);
                setRestSeconds(preset);
              }}
              className={`px-3 py-1.5 rounded-full text-xs font-bold tabular-nums cursor-pointer ${
                restSeconds === preset
                  ? 'bg-[var(--primary)] text-white'
                  : 'bg-[var(--surface-inset)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              {preset}s
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3 mt-4 w-full max-w-xs">
          <button
            type="button"
            onClick={() => setRestRunning((r) => !r)}
            className="flex-1 h-11 rounded-full bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white text-sm font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <AppIcon name={restRunning ? 'pause' : 'play'} size={16} />
            <span>{restRunning ? 'Pause' : 'Start Rest'}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setRestRunning(false);
              setRestSeconds(60);
            }}
            aria-label="Reset rest timer"
            className="w-11 h-11 rounded-full bg-[var(--surface-inset)] hover:bg-[var(--border-subtle)] text-[var(--text-primary)] flex items-center justify-center transition-colors cursor-pointer"
          >
            <AppIcon name="rotateCcw" size={17} />
          </button>
        </div>
      </section>

      {/* Complete Workout CTA */}
      <button
        type="button"
        onClick={handleCompleteWorkout}
        className="w-full h-13 rounded-full bg-[var(--status-success)] hover:bg-emerald-600 text-white font-bold text-base flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer"
      >
        <AppIcon name="check" size={18} />
        <span>Done / Complete Workout (+{estimatedEarnedKcal} kcal)</span>
      </button>
    </div>
  );
}
