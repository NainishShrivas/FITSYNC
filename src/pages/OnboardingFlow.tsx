import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppIcon } from '../components/AppIcon';
import { useAppState } from '../context/AppStateContext';
import type {
  ActivityLevel,
  BiologicalSex,
  BodyType,
  DayAbbrev,
  DietPreference,
  FitnessGoalKey,
  UserProfile,
} from '../types/fitsync';
import { DAYS_ORDER, resolveMedicalOverrides } from '../utils/calibrateEngine';
import { createDefaultProfile, DEFAULT_HABITS } from '../utils/storage';

const WELCOME_BICEP_IMG = '/src/assets/images/welcome_bicep_3d_1795105224034.jpg';
const LETTUCE_IMG = '/src/assets/images/diet_vegetarian_lettuce_3d_1795105224223.jpg';
const STEAK_IMG = '/src/assets/images/diet_nonveg_steak_3d_1795105224029.jpg';

const PRESET_CONDITIONS = [
  'Joint Pain / Knee Issues',
  'Hypertension / High BP',
  'Diabetes Type 2',
  'Asthma',
];

const ACTIVITY_OPTIONS: Array<{ value: ActivityLevel; label: string; desc: string }> = [
  { value: 'sedentary', label: 'Sedentary', desc: 'Desk job, minimal exercise (1.2x)' },
  { value: 'lightly_active', label: 'Lightly Active', desc: '1–3 light sessions/wk (1.375x)' },
  { value: 'moderately_active', label: 'Moderately Active', desc: '3–5 workouts/wk (1.55x)' },
  { value: 'very_active', label: 'Very Active', desc: '6–7 intense days/wk (1.725x)' },
  { value: 'extra_active', label: 'Extra Active', desc: 'Physical job + daily training (1.9x)' },
];

const SOMATOTYPE_OPTIONS: Array<{ value: BodyType; label: string; split: string }> = [
  { value: 'Ectomorph', label: 'Ectomorph', split: '25P · 55C · 20F' },
  { value: 'Mesomorph', label: 'Mesomorph', split: '30P · 40C · 30F' },
  { value: 'Endomorph', label: 'Endomorph', split: '35P · 25C · 40F' },
];

type GoalCategory = 'bulking' | 'fat_loss' | 'maintenance';
type IntensityMode = 'moderate' | 'aggressive';

function goalKeyFromSelection(category: GoalCategory, intensity: IntensityMode): FitnessGoalKey {
  if (category === 'maintenance') return 'Maintenance';
  if (category === 'fat_loss') return intensity === 'aggressive' ? 'Extreme_Fat_Loss' : 'Fat_Loss';
  return intensity === 'aggressive' ? 'Aggressive_Bulk' : 'Lean_Bulk';
}

function parseGoalCategory(goalKey: FitnessGoalKey): { cat: GoalCategory; intensity: IntensityMode } {
  if (goalKey === 'Maintenance') return { cat: 'maintenance', intensity: 'moderate' };
  if (goalKey === 'Extreme_Fat_Loss') return { cat: 'fat_loss', intensity: 'aggressive' };
  if (goalKey === 'Fat_Loss') return { cat: 'fat_loss', intensity: 'moderate' };
  if (goalKey === 'Aggressive_Bulk') return { cat: 'bulking', intensity: 'aggressive' };
  return { cat: 'bulking', intensity: 'moderate' };
}

export function OnboardingFlow() {
  const { state, completeOnboarding } = useAppState();
  const navigate = useNavigate();

  const [step, setStep] = useState<number>(0); // 0 = Welcome, 1..5 = Steps
  const [draft, setDraft] = useState<UserProfile>(() =>
    state.profile.onboardingCompleted ? state.profile : createDefaultProfile(false)
  );
  const [customConditionInput, setCustomConditionInput] = useState('');
  const [customHabitInput, setCustomHabitInput] = useState('');
  const [extraHabitOptions, setExtraHabitOptions] = useState<string[]>([]);

  const { cat: goalCategory, intensity: goalIntensity } = useMemo(
    () => parseGoalCategory(draft.goalKey),
    [draft.goalKey]
  );

  const isStep1Valid = useMemo(() => {
    const validName = draft.fullName.trim().length >= 2;
    const validEmail = draft.email.includes('@') && draft.email.includes('.');
    const validHeight = Number.isFinite(draft.heightCm) && draft.heightCm >= 110 && draft.heightCm <= 240;
    const validWeight = Number.isFinite(draft.weightKg) && draft.weightKg >= 30 && draft.weightKg <= 250;
    const validDob = Boolean(draft.dob);
    return validName && validEmail && validHeight && validWeight && validDob;
  }, [draft.fullName, draft.email, draft.heightCm, draft.weightKg, draft.dob]);

  const previewOverrides = useMemo(
    () => resolveMedicalOverrides(draft.healthConditions, 30),
    [draft.healthConditions]
  );

  const allHabitChoices = useMemo(
    () => Array.from(new Set([...DEFAULT_HABITS, ...extraHabitOptions, ...draft.habits])),
    [extraHabitOptions, draft.habits]
  );

  const toggleCondition = (cond: string) => {
    setDraft((prev) => {
      if (cond === 'None') {
        return { ...prev, healthConditions: [] };
      }
      const exists = prev.healthConditions.includes(cond);
      const next = exists
        ? prev.healthConditions.filter((c) => c !== cond)
        : [...prev.healthConditions, cond];
      return { ...prev, healthConditions: next };
    });
  };

  const handleAddCustomCondition = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = customConditionInput.trim();
    if (!clean) return;
    setDraft((prev) => ({
      ...prev,
      healthConditions: prev.healthConditions.includes(clean)
        ? prev.healthConditions
        : [...prev.healthConditions, clean],
    }));
    setCustomConditionInput('');
  };

  const toggleDay = (day: DayAbbrev) => {
    setDraft((prev) => {
      const exists = prev.trainingDays.includes(day);
      const next = exists
        ? prev.trainingDays.filter((d) => d !== day)
        : [...prev.trainingDays, day];
      const ordered = DAYS_ORDER.filter((d) => next.includes(d));
      return { ...prev, trainingDays: ordered };
    });
  };

  const toggleHabit = (habit: string) => {
    setDraft((prev) => {
      const exists = prev.habits.includes(habit);
      return {
        ...prev,
        habits: exists ? prev.habits.filter((h) => h !== habit) : [...prev.habits, habit],
      };
    });
  };

  const handleAddCustomHabit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = customHabitInput.trim();
    if (!clean) return;
    setExtraHabitOptions((prev) => (prev.includes(clean) ? prev : [...prev, clean]));
    setDraft((prev) => ({
      ...prev,
      habits: prev.habits.includes(clean) ? prev.habits : [...prev.habits, clean],
    }));
    setCustomHabitInput('');
  };

  const handleGeneratePlan = () => {
    const safeTrainingDays: DayAbbrev[] =
      draft.trainingDays.length > 0 ? draft.trainingDays : ['Mon', 'Wed', 'Fri'];
    const safeHabits = draft.habits.length > 0 ? draft.habits : [DEFAULT_HABITS[0]];
    completeOnboarding({
      ...draft,
      trainingDays: safeTrainingDays,
      habits: safeHabits,
      onboardingCompleted: true,
    });
    navigate('/dashboard');
  };

  // Screen 0: Welcome Splash
  if (step === 0) {
    return (
      <div className="min-h-screen bg-[var(--bg-splash)] flex flex-col items-center justify-between px-6 py-10 sm:py-14">
        <div className="w-full max-w-md flex items-center justify-center">
          <span className="text-sm font-bold tracking-widest uppercase text-[var(--primary)]/80">
            FITSYNC · Calibrate Health
          </span>
        </div>

        <div className="flex flex-col items-center text-center max-w-md w-full my-auto py-8">
          <div className="w-64 h-64 sm:w-72 sm:h-72 flex items-center justify-center mb-8">
            <img
              src={WELCOME_BICEP_IMG}
              alt="FITSYNC 3D flexed muscle illustration with pastel spheres"
              referrerPolicy="no-referrer"
              className="w-full h-full object-contain [mask-image:radial-gradient(circle,black_56%,transparent_94%)]"
            />
          </div>
          <p className="text-lg font-medium text-[var(--text-primary)]">Welcome to</p>
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-[var(--text-primary)] mt-1">
            FITSYNC
          </h1>
          <p className="mt-3 text-sm text-[var(--text-secondary)] max-w-xs">
            Science-calibrated nutrition, adaptive cheat-meal balancing, and medically filtered training.
          </p>
        </div>

        <div className="w-full max-w-md">
          <button
            type="button"
            onClick={() => setStep(1)}
            className="w-full h-14 rounded-full bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white font-bold text-base flex items-center justify-center gap-2.5 shadow-[0_8px_24px_-6px_rgba(30,27,75,0.28)] transition-colors cursor-pointer"
          >
            <span>Get Started</span>
            <AppIcon name="arrowRight" size={18} />
          </button>
        </div>
      </div>
    );
  }

  const STEP_META: Record<number, { label: string; pct: number }> = {
    1: { label: 'Biometrics', pct: 20 },
    2: { label: 'Path & Diet', pct: 40 },
    3: { label: 'Health', pct: 60 },
    4: { label: 'Schedule', pct: 80 },
    5: { label: 'Habits', pct: 100 },
  };
  const meta = STEP_META[step];

  return (
    <div className="min-h-screen bg-[var(--bg-onboarding)] flex flex-col items-center px-4 py-6 sm:py-10">
      <div className="w-full max-w-xl flex flex-col flex-1">
        {/* Top Header + Progress Bar */}
        <header className="mb-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-11 h-11 rounded-full bg-[var(--bg-canvas)] flex items-center justify-center text-[var(--primary)]">
              <AppIcon name="dumbbell" size={20} />
            </div>
            <div>
              <span className="text-lg font-extrabold tracking-tight text-[var(--text-primary)] block leading-tight">
                FITSYNC
              </span>
              <span className="text-xs font-medium text-[var(--text-secondary)]">
                Let's set up your plan
              </span>
            </div>
          </div>

          <div
            className="w-full h-2 rounded-full bg-[var(--border-subtle)] overflow-hidden"
            role="progressbar"
            aria-valuenow={meta.pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Onboarding progress ${meta.pct}%`}
          >
            <div
              className="h-full rounded-full bg-[var(--primary)] transition-all duration-300"
              style={{ width: `${meta.pct}%` }}
            />
          </div>
          <div className="flex items-center justify-between mt-2 text-xs font-medium text-[var(--text-secondary)]">
            <span>Step {step} of 5</span>
            <span>{meta.label}</span>
          </div>
        </header>

        {/* Step Content */}
        <div className="flex-1 space-y-5 pb-28">
          {/* STEP 1: BIOMETRICS */}
          {step === 1 && (
            <section aria-labelledby="step1-heading" className="space-y-4">
              <div>
                <h1 id="step1-heading" className="text-2xl sm:text-3xl font-extrabold text-[var(--text-primary)]">
                  Tell us about yourself
                </h1>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">
                  We use these to calculate your Mifflin-St Jeor metabolic rate (BMR/TDEE).
                </p>
              </div>

              <div>
                <label htmlFor="full-name" className="block text-sm font-semibold text-[var(--text-primary)] mb-1.5">
                  Full Name
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]">
                    <AppIcon name="user" size={18} />
                  </span>
                  <input
                    id="full-name"
                    type="text"
                    value={draft.fullName}
                    onChange={(e) => setDraft({ ...draft, fullName: e.target.value })}
                    placeholder="Your full name"
                    className="w-full h-12 pl-11 pr-4 rounded-full bg-[var(--card-surface)] border border-[var(--border-subtle)] text-sm font-medium text-[var(--text-primary)] focus:outline-none focus:border-[var(--primary)]"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="email-input" className="block text-sm font-semibold text-[var(--text-primary)] mb-1.5">
                  Email
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]">
                    <AppIcon name="mail" size={18} />
                  </span>
                  <input
                    id="email-input"
                    type="email"
                    value={draft.email}
                    onChange={(e) => setDraft({ ...draft, email: e.target.value })}
                    placeholder="you@example.com"
                    className="w-full h-12 pl-11 pr-4 rounded-full bg-[var(--card-surface)] border border-[var(--border-subtle)] text-sm font-medium text-[var(--text-primary)] focus:outline-none focus:border-[var(--primary)]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="height-cm" className="block text-sm font-semibold text-[var(--text-primary)] mb-1.5">
                    Height (cm)
                  </label>
                  <input
                    id="height-cm"
                    type="number"
                    min={110}
                    max={240}
                    value={draft.heightCm || ''}
                    onChange={(e) => setDraft({ ...draft, heightCm: Number(e.target.value) })}
                    className="w-full h-12 px-4 rounded-full bg-[var(--card-surface)] border border-[var(--border-subtle)] text-sm font-semibold text-[var(--text-primary)] tabular-nums focus:outline-none focus:border-[var(--primary)]"
                  />
                </div>
                <div>
                  <label htmlFor="weight-kg" className="block text-sm font-semibold text-[var(--text-primary)] mb-1.5">
                    Weight (kg)
                  </label>
                  <input
                    id="weight-kg"
                    type="number"
                    min={30}
                    max={250}
                    step="0.5"
                    value={draft.weightKg || ''}
                    onChange={(e) => setDraft({ ...draft, weightKg: Number(e.target.value) })}
                    className="w-full h-12 px-4 rounded-full bg-[var(--card-surface)] border border-[var(--border-subtle)] text-sm font-semibold text-[var(--text-primary)] tabular-nums focus:outline-none focus:border-[var(--primary)]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="dob-input" className="block text-sm font-semibold text-[var(--text-primary)] mb-1.5">
                    Date of Birth
                  </label>
                  <input
                    id="dob-input"
                    type="date"
                    value={draft.dob}
                    onChange={(e) => setDraft({ ...draft, dob: e.target.value })}
                    className="w-full h-12 px-4 rounded-full bg-[var(--card-surface)] border border-[var(--border-subtle)] text-sm font-medium text-[var(--text-primary)] tabular-nums focus:outline-none focus:border-[var(--primary)]"
                  />
                </div>

                <div>
                  <label htmlFor="gender-select" className="block text-sm font-semibold text-[var(--text-primary)] mb-1.5">
                    Gender
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {(
                      [
                        { value: 'female', label: 'Female' },
                        { value: 'male', label: 'Male' },
                        { value: 'non_binary', label: 'Non-binary' },
                        { value: 'prefer_not_to_say', label: 'Prefer not to say' },
                      ] as const
                    ).map((g) => {
                      const active = draft.gender === g.value;
                      return (
                        <button
                          key={g.value}
                          type="button"
                          onClick={() =>
                            setDraft({
                              ...draft,
                              gender: g.value,
                              sex: g.value === 'female' ? 'female' : g.value === 'male' ? 'male' : draft.sex,
                            })
                          }
                          className={`h-10 px-3 rounded-full text-xs font-bold transition-colors cursor-pointer border ${
                            active
                              ? 'bg-[var(--primary)] text-white border-[var(--primary)]'
                              : 'bg-[var(--card-surface)] text-[var(--text-primary)] border-[var(--border-subtle)] hover:bg-[var(--surface-inset)]'
                          }`}
                        >
                          {g.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {(draft.gender === 'non_binary' || draft.gender === 'prefer_not_to_say') && (
                <div className="rounded-2xl bg-[var(--surface-inset)] border border-[var(--border-subtle)] p-3 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-[var(--text-secondary)]">
                    Mifflin-St Jeor & DRI metabolic reference:
                  </span>
                  <div className="flex items-center gap-2">
                    {(['female', 'male'] as BiologicalSex[]).map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setDraft({ ...draft, sex: s })}
                        className={`px-3 py-1 rounded-full text-xs font-bold capitalize cursor-pointer ${
                          draft.sex === s
                            ? 'bg-[var(--primary)] text-white'
                            : 'bg-white text-[var(--text-primary)] border border-[var(--border-subtle)]'
                        }`}
                      >
                        {s} formula
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label htmlFor="activity-select" className="block text-sm font-semibold text-[var(--text-primary)] mb-1.5">
                  Activity Level
                </label>
                <select
                  id="activity-select"
                  value={draft.activityLevel}
                  onChange={(e) => setDraft({ ...draft, activityLevel: e.target.value as ActivityLevel })}
                  className="w-full h-12 px-4 rounded-full bg-[var(--card-surface)] border border-[var(--border-subtle)] text-sm font-medium text-[var(--text-primary)] focus:outline-none focus:border-[var(--primary)]"
                >
                  {ACTIVITY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label} — {opt.desc}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <span className="block text-sm font-semibold text-[var(--text-primary)] mb-2">
                  Body Type (Somatotype Macro Split)
                </span>
                <div className="grid grid-cols-3 gap-2.5">
                  {SOMATOTYPE_OPTIONS.map((opt) => {
                    const active = draft.bodyType === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setDraft({ ...draft, bodyType: opt.value })}
                        className={`p-3 rounded-2xl text-center transition-colors border cursor-pointer ${
                          active
                            ? 'bg-[var(--primary)] text-white border-[var(--primary)] shadow-sm'
                            : 'bg-[var(--card-surface)] text-[var(--text-primary)] border-[var(--border-subtle)] hover:bg-[var(--surface-inset)]'
                        }`}
                      >
                        <span className="block text-xs sm:text-sm font-bold">{opt.label}</span>
                        <span
                          className={`block text-[11px] mt-1 tabular-nums ${
                            active ? 'text-white/80' : 'text-[var(--text-secondary)]'
                          }`}
                        >
                          {opt.split}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>
          )}

          {/* STEP 2: PATH & DIET */}
          {step === 2 && (
            <section aria-labelledby="step2-heading" className="space-y-5">
              <div>
                <h1 id="step2-heading" className="text-2xl sm:text-3xl font-extrabold text-[var(--text-primary)]">
                  Set your path
                </h1>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">
                  Your goal and diet shape your caloric offset and 7-day meal matrix.
                </p>
              </div>

              <div className="space-y-3">
                {(
                  [
                    {
                      cat: 'bulking' as GoalCategory,
                      title: 'Bulking',
                      sub: 'Maximize size (+250 / +500 kcal)',
                      icon: 'zap' as const,
                    },
                    {
                      cat: 'fat_loss' as GoalCategory,
                      title: 'Fat Loss',
                      sub: 'Shed excess fat (-500 / -750 kcal)',
                      icon: 'flame' as const,
                    },
                    {
                      cat: 'maintenance' as GoalCategory,
                      title: 'Maintenance',
                      sub: 'Stay balanced (0 kcal offset)',
                      icon: 'scale' as const,
                    },
                  ] as const
                ).map((g) => {
                  const active = goalCategory === g.cat;
                  return (
                    <button
                      key={g.cat}
                      type="button"
                      onClick={() =>
                        setDraft({
                          ...draft,
                          goalKey: goalKeyFromSelection(g.cat, goalIntensity),
                        })
                      }
                      className={`w-full p-4 rounded-2xl flex items-center justify-between text-left transition-colors border cursor-pointer ${
                        active
                          ? 'bg-[var(--primary)] text-white border-[var(--primary)] shadow-sm'
                          : 'bg-[var(--surface-inset)] text-[var(--text-primary)] border-[var(--border-subtle)] hover:bg-[var(--card-surface)]'
                      }`}
                    >
                      <div className="flex items-center gap-3.5">
                        <div
                          className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                            active ? 'bg-white/15 text-white' : 'bg-[var(--card-surface)] text-[var(--primary)]'
                          }`}
                        >
                          <AppIcon name={g.icon} size={20} />
                        </div>
                        <div>
                          <span className="block text-base font-bold">{g.title}</span>
                          <span
                            className={`block text-xs mt-0.5 ${
                              active ? 'text-white/80' : 'text-[var(--text-secondary)]'
                            }`}
                          >
                            {g.sub}
                          </span>
                        </div>
                      </div>
                      {active && <AppIcon name="check" size={20} />}
                    </button>
                  );
                })}
              </div>

              {goalCategory !== 'maintenance' && (
                <div className="fitsync-card p-4">
                  <span className="block text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)] mb-2.5">
                    Pace Intensity
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    {(
                      [
                        {
                          mode: 'moderate' as IntensityMode,
                          label: goalCategory === 'fat_loss' ? 'Moderate (-500 kcal)' : 'Lean Bulk (+250 kcal)',
                        },
                        {
                          mode: 'aggressive' as IntensityMode,
                          label: goalCategory === 'fat_loss' ? 'Extreme (-750 kcal)' : 'Aggressive (+500 kcal)',
                        },
                      ] as const
                    ).map((opt) => {
                      const active = goalIntensity === opt.mode;
                      return (
                        <button
                          key={opt.mode}
                          type="button"
                          onClick={() =>
                            setDraft({
                              ...draft,
                              goalKey: goalKeyFromSelection(goalCategory, opt.mode),
                            })
                          }
                          className={`py-2.5 px-3 rounded-full text-xs font-bold transition-colors cursor-pointer border ${
                            active
                              ? 'bg-[var(--primary)] text-white border-[var(--primary)]'
                              : 'bg-[var(--surface-inset)] text-[var(--text-primary)] border-transparent hover:border-[var(--border-subtle)]'
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div>
                <h2 className="text-base font-bold text-[var(--text-primary)] mb-2.5">
                  Dietary Preference
                </h2>
                <div className="grid grid-cols-2 gap-3">
                  {(
                    [
                      {
                        value: 'Vegetarian' as DietPreference,
                        desc: 'Plant-based & dairy',
                        img: LETTUCE_IMG,
                      },
                      {
                        value: 'Non-Vegetarian' as DietPreference,
                        desc: 'Includes meat & fish',
                        img: STEAK_IMG,
                      },
                    ] as const
                  ).map((d) => {
                    const active = draft.dietPreference === d.value;
                    return (
                      <button
                        key={d.value}
                        type="button"
                        onClick={() => setDraft({ ...draft, dietPreference: d.value })}
                        className={`p-4 rounded-2xl flex flex-col items-center text-center transition-colors border cursor-pointer ${
                          active
                            ? 'bg-[var(--primary)] text-white border-[var(--primary)] shadow-sm'
                            : 'bg-[var(--surface-inset)] text-[var(--text-primary)] border-[var(--border-subtle)] hover:bg-[var(--card-surface)]'
                        }`}
                      >
                        <div className="w-24 h-24 rounded-2xl bg-white overflow-hidden flex items-center justify-center mb-3 p-2">
                          <img
                            src={d.img}
                            alt={`${d.value} diet illustration`}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-contain"
                          />
                        </div>
                        <span className="text-sm font-bold">{d.value}</span>
                        <span
                          className={`text-xs mt-1 ${
                            active ? 'text-white/80' : 'text-[var(--text-secondary)]'
                          }`}
                        >
                          {d.desc}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>
          )}

          {/* STEP 3: HEALTH CONSIDERATIONS */}
          {step === 3 && (
            <section aria-labelledby="step3-heading" className="space-y-4">
              <div>
                <h1 id="step3-heading" className="text-2xl sm:text-3xl font-extrabold text-[var(--text-primary)]">
                  Health considerations
                </h1>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">
                  Select any that apply — we deterministically filter workouts and meal ingredients.
                </p>
              </div>

              <div className="space-y-2.5">
                <button
                  type="button"
                  onClick={() => toggleCondition('None')}
                  className={`w-full px-4 py-3.5 rounded-2xl flex items-center justify-between border transition-colors cursor-pointer ${
                    draft.healthConditions.length === 0
                      ? 'bg-[var(--primary)] text-white border-[var(--primary)]'
                      : 'bg-[var(--surface-inset)] text-[var(--text-primary)] border-[var(--border-subtle)] hover:bg-[var(--card-surface)]'
                  }`}
                >
                  <span className="flex items-center gap-3 text-sm font-bold">
                    <AppIcon name="heartPulse" size={18} />
                    <span>None</span>
                  </span>
                  <span
                    className={`w-6 h-6 rounded-full flex items-center justify-center border ${
                      draft.healthConditions.length === 0
                        ? 'bg-white text-[var(--primary)] border-white'
                        : 'border-[var(--border-subtle)]'
                    }`}
                  >
                    {draft.healthConditions.length === 0 && <AppIcon name="check" size={14} />}
                  </span>
                </button>

                {Array.from(new Set([...PRESET_CONDITIONS, ...draft.healthConditions])).map((cond) => {
                  const active = draft.healthConditions.includes(cond);
                  return (
                    <button
                      key={cond}
                      type="button"
                      onClick={() => toggleCondition(cond)}
                      className={`w-full px-4 py-3.5 rounded-2xl flex items-center justify-between border transition-colors cursor-pointer ${
                        active
                          ? 'bg-[var(--primary)] text-white border-[var(--primary)]'
                          : 'bg-[var(--surface-inset)] text-[var(--text-primary)] border-[var(--border-subtle)] hover:bg-[var(--card-surface)]'
                      }`}
                    >
                      <span className="flex items-center gap-3 text-sm font-bold">
                        <AppIcon name="heartPulse" size={18} />
                        <span>{cond}</span>
                      </span>
                      <span
                        className={`w-6 h-6 rounded-full flex items-center justify-center border ${
                          active
                            ? 'bg-white text-[var(--primary)] border-white'
                            : 'border-[var(--border-subtle)] bg-[var(--card-surface)]'
                        }`}
                      >
                        {active && <AppIcon name="check" size={14} />}
                      </span>
                    </button>
                  );
                })}
              </div>

              <form onSubmit={handleAddCustomCondition} className="flex items-center gap-2 pt-1">
                <input
                  type="text"
                  value={customConditionInput}
                  onChange={(e) => setCustomConditionInput(e.target.value)}
                  placeholder="Other condition (e.g. kidney stone)"
                  aria-label="Add custom health condition"
                  className="flex-1 h-12 px-4 rounded-full bg-[var(--card-surface)] border border-[var(--border-subtle)] text-sm font-medium text-[var(--text-primary)] focus:outline-none focus:border-[var(--primary)]"
                />
                <button
                  type="submit"
                  className="h-12 px-5 rounded-full bg-[var(--surface-inset)] hover:bg-[var(--border-subtle)] text-sm font-bold text-[var(--text-primary)] transition-colors cursor-pointer"
                >
                  Add
                </button>
              </form>

              <div className="rounded-2xl bg-[var(--surface-inset)] border border-[var(--border-subtle)] p-4 text-xs text-[var(--text-secondary)] space-y-1.5">
                {previewOverrides.notes.length > 0 ? (
                  previewOverrides.notes.map((note, idx) => (
                    <p key={idx} className="font-medium text-[var(--text-primary)]">
                      • {note}
                    </p>
                  ))
                ) : (
                  <p>
                    Selecting <strong className="text-[var(--text-primary)]">Joint Pain</strong> automatically
                    filters high-impact exercises from your Workout Portal. Adding{' '}
                    <strong className="text-[var(--text-primary)]">kidney stone</strong> sets 3.5 L hydration and
                    swaps high-oxalate foods.
                  </p>
                )}
              </div>
            </section>
          )}

          {/* STEP 4: TRAINING SCHEDULE */}
          {step === 4 && (
            <section aria-labelledby="step4-heading" className="space-y-5">
              <div>
                <h1 id="step4-heading" className="text-2xl sm:text-3xl font-extrabold text-[var(--text-primary)]">
                  When can you train?
                </h1>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">
                  Pick your workout days, preferred time slot, and session length.
                </p>
              </div>

              <div>
                <span className="block text-sm font-semibold text-[var(--text-primary)] mb-2.5">
                  Training Days
                </span>
                <div className="flex flex-wrap gap-2.5">
                  {DAYS_ORDER.map((day) => {
                    const active = draft.trainingDays.includes(day);
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() => toggleDay(day)}
                        className={`min-w-[68px] h-12 px-4 rounded-2xl text-sm font-bold transition-colors cursor-pointer border ${
                          active
                            ? 'bg-[var(--primary)] text-white border-[var(--primary)] shadow-sm'
                            : 'bg-[var(--surface-inset)] text-[var(--text-primary)] border-[var(--border-subtle)] hover:bg-[var(--card-surface)]'
                        }`}
                      >
                        {day}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label htmlFor="training-time" className="block text-sm font-semibold text-[var(--text-primary)] mb-2">
                  Training Time
                </label>
                <div className="relative">
                  <input
                    id="training-time"
                    type="time"
                    value={draft.trainingTime}
                    onChange={(e) => setDraft({ ...draft, trainingTime: e.target.value })}
                    className="w-full h-12 px-4 rounded-full bg-[var(--card-surface)] border border-[var(--border-subtle)] text-sm font-semibold text-[var(--text-primary)] tabular-nums focus:outline-none focus:border-[var(--primary)]"
                  />
                </div>
              </div>

              <div>
                <span className="block text-sm font-semibold text-[var(--text-primary)] mb-2">
                  Session Duration
                </span>
                <div className="grid grid-cols-4 gap-2">
                  {[15, 30, 45, 60].map((mins) => {
                    const active = draft.sessionDurationMins === mins;
                    return (
                      <button
                        key={mins}
                        type="button"
                        onClick={() => setDraft({ ...draft, sessionDurationMins: mins })}
                        className={`h-11 rounded-full text-xs sm:text-sm font-bold transition-colors cursor-pointer border tabular-nums ${
                          active
                            ? 'bg-[var(--primary)] text-white border-[var(--primary)]'
                            : 'bg-[var(--surface-inset)] text-[var(--text-primary)] border-[var(--border-subtle)] hover:bg-[var(--card-surface)]'
                        }`}
                      >
                        {mins === 60 ? '60+ min' : `${mins} min`}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-2xl bg-[var(--surface-inset)] border border-[var(--border-subtle)] px-4 py-3.5 text-sm text-[var(--text-secondary)]">
                Selected:{' '}
                <strong className="text-[var(--text-primary)]">
                  {draft.trainingDays.length > 0 ? draft.trainingDays.join(', ') : 'None'}
                </strong>{' '}
                · <span className="tabular-nums">{draft.trainingTime}</span> ·{' '}
                <span className="tabular-nums">{draft.sessionDurationMins} min</span>
              </div>
            </section>
          )}

          {/* STEP 5: HABITS & CALIBRATION */}
          {step === 5 && (
            <section aria-labelledby="step5-heading" className="space-y-4">
              <div>
                <h1 id="step5-heading" className="text-2xl sm:text-3xl font-extrabold text-[var(--text-primary)]">
                  Habits to track
                </h1>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">
                  Choose daily habits to build into your checklist.
                </p>
              </div>

              <div className="space-y-2.5">
                {allHabitChoices.map((habit) => {
                  const active = draft.habits.includes(habit);
                  return (
                    <button
                      key={habit}
                      type="button"
                      onClick={() => toggleHabit(habit)}
                      className={`w-full px-4 py-3.5 rounded-full flex items-center gap-3.5 text-left border transition-colors cursor-pointer ${
                        active
                          ? 'bg-[var(--primary)] text-white border-[var(--primary)] shadow-sm'
                          : 'bg-[var(--card-surface)] text-[var(--text-primary)] border-[var(--border-subtle)] hover:bg-[var(--surface-inset)]'
                      }`}
                    >
                      <span
                        className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                          active
                            ? 'bg-white text-[var(--primary)]'
                            : 'border border-[var(--border-subtle)] bg-[var(--surface-inset)]'
                        }`}
                      >
                        {active && <AppIcon name="check" size={14} />}
                      </span>
                      <span className="text-sm font-bold">{habit}</span>
                    </button>
                  );
                })}
              </div>

              <form onSubmit={handleAddCustomHabit} className="flex items-center gap-2 pt-1">
                <input
                  type="text"
                  value={customHabitInput}
                  onChange={(e) => setCustomHabitInput(e.target.value)}
                  placeholder="Add custom habit (e.g. quit smoking)"
                  aria-label="Add custom habit"
                  className="flex-1 h-12 px-4 rounded-full bg-[var(--card-surface)] border border-[var(--border-subtle)] text-sm font-medium text-[var(--text-primary)] focus:outline-none focus:border-[var(--primary)]"
                />
                <button
                  type="submit"
                  className="h-12 px-5 rounded-full bg-[var(--surface-inset)] hover:bg-[var(--border-subtle)] text-sm font-bold text-[var(--text-primary)] transition-colors cursor-pointer"
                >
                  Add
                </button>
              </form>
            </section>
          )}
        </div>

        {/* Sticky Bottom Action Bar */}
        <footer className="fixed bottom-0 left-0 right-0 bg-[var(--bg-onboarding)]/95 backdrop-blur-md border-t border-[var(--border-subtle)] px-4 py-3.5 z-20">
          <div className="max-w-xl mx-auto flex items-center gap-3">
            <button
              type="button"
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              aria-label="Back to previous step"
              className="w-12 h-12 rounded-full bg-[var(--card-surface)] border border-[var(--border-subtle)] flex items-center justify-center text-[var(--text-primary)] hover:bg-[var(--surface-inset)] transition-colors shrink-0 cursor-pointer"
            >
              <AppIcon name="chevronLeft" size={20} />
            </button>

            {step < 5 ? (
              <button
                type="button"
                disabled={step === 1 && !isStep1Valid}
                onClick={() => setStep((s) => Math.min(5, s + 1))}
                className={`flex-1 h-12 rounded-full font-bold text-sm flex items-center justify-center gap-2 transition-colors ${
                  step === 1 && !isStep1Valid
                    ? 'bg-[var(--primary-disabled)] text-white cursor-not-allowed'
                    : 'bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white cursor-pointer'
                }`}
              >
                <span>Continue</span>
                <AppIcon name="chevronRight" size={18} />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleGeneratePlan}
                className="flex-1 h-12 rounded-full bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <span>Generate My Plan</span>
                <AppIcon name="chevronRight" size={18} />
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}
