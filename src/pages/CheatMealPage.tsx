import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AppIcon } from '../components/AppIcon';
import { useAppState } from '../context/AppStateContext';
import type { CheatCalibrationPlan } from '../types/fitsync';
import { buildCheatMealPlan, DAYS_ORDER } from '../utils/calibrateEngine';
import { getRemainingTrainingDaysThisWeek } from '../utils/storage';

const CLIPBOARD_IMG = '/src/assets/images/cheat_success_clipboard_3d_1795105224108.jpg';

const PRESETS = [250, 500, 850, 1000];
const PIE_COLORS = ['#3D2C8E', '#7C3AED', '#22C55E', '#F97316', '#312373', '#64748B', '#9991C7'];

export function CheatMealPage() {
  const { state, metrics, todayAbbrev, eatenTodayKcal, applyCheatMeal } = useAppState();
  const navigate = useNavigate();

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [surplusKcal, setSurplusKcal] = useState<number>(850);
  const [note, setNote] = useState<string>('Pizza & dessert night');
  const [committedPlan, setCommittedPlan] = useState<CheatCalibrationPlan | null>(null);

  const previewPlan = useMemo(() => {
    const remaining = getRemainingTrainingDaysThisWeek(state.profile.trainingDays, todayAbbrev);
    return buildCheatMealPlan({
      surplusKcal: Math.max(50, surplusKcal || 0),
      note,
      remainingTrainingDays: remaining,
      nextWeekTrainingDays: state.profile.trainingDays,
      weightKg: state.profile.weightKg,
      overrides: metrics.medicalOverrides,
    });
  }, [surplusKcal, note, state.profile.trainingDays, todayAbbrev, state.profile.weightKg, metrics.medicalOverrides]);

  const surgeChartData = useMemo(
    () => [
      { label: 'Target', kcal: metrics.safeTargetKcal, fill: '#3D2C8E' },
      { label: 'Logged', kcal: eatenTodayKcal || Math.round(metrics.safeTargetKcal * 0.7), fill: '#22C55E' },
      {
        label: 'Cheat Surge',
        kcal: metrics.safeTargetKcal + Math.max(0, surplusKcal),
        fill: '#F97316',
      },
    ],
    [metrics.safeTargetKcal, eatenTodayKcal, surplusKcal]
  );

  const distributionPieData = useMemo(() => {
    const plan = committedPlan ?? previewPlan;
    return plan.allocatedDays.map((day, idx) => ({
      name: `${day} (${idx + 1})`,
      value: plan.dailyExtraBurnKcal,
      color: PIE_COLORS[idx % PIE_COLORS.length],
    }));
  }, [committedPlan, previewPlan]);

  const handleConfirmCalibration = () => {
    const plan = applyCheatMeal(Math.max(50, surplusKcal), note, previewPlan.exerciseId);
    setCommittedPlan(plan);
    setStep(4);
  };

  const activePlan = committedPlan ?? previewPlan;

  const STEP_TITLES: Record<1 | 2 | 3 | 4, string> = {
    1: 'Log Cheat Meal',
    2: 'Surge Visualization',
    3: 'Surplus Distributed',
    4: 'New Plan Calibrated!',
  };

  return (
    <div className="space-y-5 max-w-2xl mx-auto">
      {/* Header */}
      <header className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => (step > 1 && step < 4 ? setStep((s) => (s - 1) as 1 | 2 | 3) : navigate('/dashboard'))}
          aria-label="Back"
          className="w-11 h-11 rounded-full bg-[var(--card-surface)] border border-[var(--border-subtle)] flex items-center justify-center text-[var(--text-primary)] hover:bg-[var(--surface-inset)] transition-colors cursor-pointer"
        >
          <AppIcon name="chevronLeft" size={20} />
        </button>
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-[var(--primary)]">
            Step {step} of 4 · Cheat Meal Engine
          </p>
          <h1 className="text-xl sm:text-2xl font-extrabold text-[var(--text-primary)]">
            {STEP_TITLES[step]}
          </h1>
        </div>
      </header>

      {/* Step Indicator */}
      <div className="grid grid-cols-4 gap-2">
        {[1, 2, 3, 4].map((n) => (
          <div
            key={n}
            className={`h-2 rounded-full transition-colors ${
              n <= step ? 'bg-[var(--primary)]' : 'bg-[var(--border-subtle)]'
            }`}
          />
        ))}
      </div>

      {/* STEP 1: SURPLUS INPUT */}
      {step === 1 && (
        <section className="fitsync-card p-6 space-y-5">
          <div>
            <label htmlFor="surplus-kcal" className="block text-sm font-bold text-[var(--text-primary)] mb-2">
              Estimated Calorie Surplus (kcal)
            </label>
            <input
              id="surplus-kcal"
              type="number"
              min={50}
              max={4000}
              step={25}
              value={surplusKcal || ''}
              onChange={(e) => setSurplusKcal(Number(e.target.value))}
              className="w-full h-14 px-5 rounded-full bg-[var(--surface-inset)] border border-[var(--border-subtle)] text-2xl font-extrabold text-[var(--text-primary)] tabular-nums focus:outline-none focus:border-[var(--primary)]"
            />
          </div>

          <div>
            <span className="block text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)] mb-2">
              Quick Presets
            </span>
            <div className="grid grid-cols-4 gap-2">
              {PRESETS.map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setSurplusKcal(val)}
                  className={`h-11 rounded-full text-xs sm:text-sm font-bold tabular-nums transition-colors cursor-pointer border ${
                    surplusKcal === val
                      ? 'bg-[var(--primary)] text-white border-[var(--primary)]'
                      : 'bg-[var(--surface-inset)] text-[var(--text-primary)] border-transparent hover:border-[var(--border-subtle)]'
                  }`}
                >
                  +{val} kcal
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="cheat-note" className="block text-sm font-bold text-[var(--text-primary)] mb-2">
              Meal Note (Optional)
            </label>
            <input
              id="cheat-note"
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Burger, fries, birthday cake"
              className="w-full h-12 px-4 rounded-full bg-[var(--surface-inset)] border border-[var(--border-subtle)] text-sm font-medium text-[var(--text-primary)] focus:outline-none focus:border-[var(--primary)]"
            />
          </div>

          <button
            type="button"
            disabled={!surplusKcal || surplusKcal < 50}
            onClick={() => setStep(2)}
            className="w-full h-13 rounded-full bg-[var(--primary)] hover:bg-[var(--primary-hover)] disabled:bg-[var(--primary-disabled)] text-white font-bold text-base flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <span>Log Meal</span>
            <AppIcon name="arrowRight" size={18} />
          </button>
        </section>
      )}

      {/* STEP 2: SURGE VISUALIZATION */}
      {step === 2 && (
        <section className="fitsync-card p-6 space-y-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-extrabold text-[var(--text-primary)]">
                Caloric Surge Impact
              </h2>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                +{surplusKcal.toLocaleString()} kcal spike compared against your{' '}
                {metrics.safeTargetKcal.toLocaleString()} kcal daily baseline.
              </p>
            </div>
            <span className="px-3 py-1 rounded-full bg-orange-50 dark:bg-orange-950/60 text-[var(--status-surge)] text-xs font-extrabold tabular-nums">
              +{surplusKcal} kcal
            </span>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={surgeChartData} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: 'var(--text-secondary)', fontSize: 12, fontWeight: 600 }} />
                <YAxis tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} />
                <Tooltip
                  formatter={(value) => [`${Number(value).toLocaleString()} kcal`, 'Calories']}
                  contentStyle={{
                    borderRadius: '14px',
                    backgroundColor: 'var(--card-surface)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-primary)',
                  }}
                />
                <Bar dataKey="kcal" radius={[12, 12, 0, 0]} maxBarSize={64}>
                  {surgeChartData.map((entry) => (
                    <Cell key={entry.label} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="rounded-2xl bg-[var(--surface-inset)] p-4 text-xs text-[var(--text-secondary)]">
            Instead of crash-starving tomorrow, FITSYNC caps extra daily burn at{' '}
            <strong className="text-[var(--text-primary)]">300 kcal/day</strong> and distributes
            your surplus safely across{' '}
            <strong className="text-[var(--text-primary)]">{previewPlan.distributionWindowDays}</strong>{' '}
            training days using 2024 Compendium Net MET math.
          </div>

          <button
            type="button"
            onClick={() => setStep(3)}
            className="w-full h-13 rounded-full bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white font-bold text-base flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <span>Calculate Adaptive Distribution</span>
            <AppIcon name="arrowRight" size={18} />
          </button>
        </section>
      )}

      {/* STEP 3: SURPLUS DISTRIBUTED + CALIBRATION BLOCK */}
      {step === 3 && (
        <section className="space-y-4">
          <div className="fitsync-card p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-lg font-extrabold text-[var(--text-primary)]">
                  Adaptive Split ({activePlan.distributionWindowDays} Days)
                </h2>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5 tabular-nums">
                  {activePlan.dailyExtraBurnKcal} kcal/day cap-protected ·{' '}
                  {activePlan.rolledToNextWeek ? 'Rolled to next week training days' : 'Distributed this week'}
                </p>
              </div>
              <span className="px-3 py-1 rounded-full bg-[var(--surface-inset)] text-[var(--primary)] text-xs font-bold tabular-nums">
                ≤300 kcal/day cap
              </span>
            </div>

            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={distributionPieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={56}
                    outerRadius={86}
                    paddingAngle={4}
                  >
                    {distributionPieData.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value) => [`+${value} kcal`, 'Extra Burn']}
                    contentStyle={{
                      borderRadius: '14px',
                      backgroundColor: 'var(--card-surface)',
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--text-primary)',
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {activePlan.allocatedDays.map((day, idx) => (
                <div
                  key={`${day}-${idx}`}
                  className="rounded-2xl bg-[var(--surface-inset)] p-3 text-center"
                >
                  <span className="block text-xs font-bold text-[var(--text-secondary)]">{day}</span>
                  <span className="block text-sm font-extrabold text-[var(--primary)] tabular-nums mt-0.5">
                    +{activePlan.dailyExtraBurnKcal} kcal
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="fitsync-card p-5 space-y-3">
            <div className="flex items-center gap-2">
              <AppIcon name="shieldCheck" size={18} className="text-[var(--status-success)]" />
              <h3 className="text-base font-extrabold text-[var(--text-primary)]">
                Calibration Block Exercise
              </h3>
            </div>
            <div className="rounded-2xl bg-orange-50 dark:bg-orange-950/40 border border-[var(--status-surge)]/30 p-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-[var(--text-primary)]">
                  {activePlan.exerciseName} ({activePlan.exerciseMet} MET)
                </p>
                <p className="text-xs text-[var(--text-secondary)] mt-1 tabular-nums">
                  {activePlan.netDurationMinsPerDay} min/day Net MET · Burns +{activePlan.dailyExtraBurnKcal} kcal/day
                </p>
              </div>
              <span className="text-xs font-bold text-[var(--status-surge)] whitespace-nowrap">
                Medically Safe
              </span>
            </div>

            <button
              type="button"
              onClick={handleConfirmCalibration}
              className="w-full h-13 rounded-full bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white font-bold text-base flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <span>Apply to Workout Portal</span>
              <AppIcon name="check" size={18} />
            </button>
          </div>
        </section>
      )}

      {/* STEP 4: CALIBRATION SUCCESS */}
      {step === 4 && (
        <section className="fitsync-card p-6 text-center space-y-5">
          <div className="w-36 h-36 mx-auto rounded-3xl overflow-hidden bg-[var(--bg-canvas)] flex items-center justify-center">
            <img
              src={CLIPBOARD_IMG}
              alt="3D Clipboard with green checkmark"
              referrerPolicy="no-referrer"
              className="w-full h-full object-contain"
            />
          </div>

          <div>
            <h2 className="text-xl font-extrabold text-[var(--text-primary)]">
              Surplus Balanced Successfully
            </h2>
            <p className="text-sm text-[var(--text-secondary)] mt-1 tabular-nums">
              +{activePlan.surplusKcal.toLocaleString()} kcal balanced over{' '}
              {activePlan.distributionWindowDays} days ({activePlan.netDurationMinsPerDay} min/day of{' '}
              {activePlan.exerciseName}).
            </p>
          </div>

          <div className="rounded-2xl bg-[var(--surface-inset)] p-4 text-left">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                Adjusted Calendar
              </span>
              <span className="text-xs font-bold text-[var(--status-success)]">Active</span>
            </div>
            <div className="grid grid-cols-7 gap-1.5">
              {DAYS_ORDER.map((day) => {
                const isAdjusted = activePlan.allocatedDays.includes(day);
                return (
                  <div
                    key={day}
                    className={`py-2.5 rounded-xl flex flex-col items-center gap-1 ${
                      isAdjusted
                        ? 'bg-orange-100 dark:bg-orange-950/50 text-[var(--status-surge)] border border-[var(--status-surge)]/40'
                        : 'bg-[var(--card-surface)] text-[var(--text-secondary)]'
                    }`}
                  >
                    <span className="text-[10px] font-bold uppercase">{day}</span>
                    <AppIcon name={isAdjusted ? 'flame' : 'checkCircle'} size={14} />
                  </div>
                );
              })}
            </div>
          </div>

          <button
            type="button"
            onClick={() => navigate('/dashboard')}
            className="w-full h-13 rounded-full bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white font-bold text-base flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <span>Back to Dashboard</span>
            <AppIcon name="arrowRight" size={18} />
          </button>
        </section>
      )}
    </div>
  );
}
