import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppIcon } from '../components/AppIcon';
import { CycleLogoMark } from '../components/CycleLogoMark';
import { useAppState } from '../context/AppStateContext';
import type { GenderOption } from '../types/fitsync';
import { serializeCycleCsv, runCycleCalculationEngine } from '../utils/cycleEngine';

const GOAL_LABELS: Record<string, string> = {
  Extreme_Fat_Loss: 'Extreme Fat Loss',
  Fat_Loss: 'Fat Loss',
  Maintenance: 'Maintenance',
  Lean_Bulk: 'Lean Bulk',
  Aggressive_Bulk: 'Aggressive Bulk',
};

const GENDER_LABELS: Record<GenderOption, string> = {
  female: 'Female',
  male: 'Male',
  non_binary: 'Non-binary',
  prefer_not_to_say: 'Prefer not to say',
};

export function ProfilePage() {
  const {
    state,
    theme,
    setTheme,
    metrics,
    cycleTrackingEnabled,
    cycleState,
    updateProfileGender,
    deleteAllCycleHistory,
    resetAllData,
    showToast,
  } = useAppState();
  const navigate = useNavigate();
  const [confirmReset, setConfirmReset] = useState(false);
  const [genderSwitchModalOpen, setGenderSwitchModalOpen] = useState(false);

  const handleConfirmReset = () => {
    resetAllData();
    navigate('/onboarding');
  };

  const handleGenderChange = (nextGender: GenderOption) => {
    if (nextGender === state.profile.gender) return;
    const { switchedAwayFromFemale } = updateProfileGender(nextGender);
    const hasCycleRecords =
      Object.keys(cycleState.dailyLogs).length > 0 || cycleState.settings.onboardingCompleted;
    if (switchedAwayFromFemale && hasCycleRecords) {
      setGenderSwitchModalOpen(true);
    }
  };

  const handleExportCycleJson = () => {
    const payload = JSON.stringify(cycleState, null, 2);
    const blob = new Blob([payload], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fitsync-cycle-export-${state.todayDate}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Cycle data exported as JSON', 'success');
  };

  const handleExportCycleCsv = () => {
    const tempEngine = runCycleCalculationEngine(cycleState, state.todayDate);
    const csv = serializeCycleCsv(cycleState, tempEngine);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fitsync-cycle-export-${state.todayDate}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Cycle data exported as CSV', 'success');
  };

  return (
    <div className="space-y-5">
      {/* Hero Banner */}
      <section className="rounded-[24px] bg-gradient-to-r from-[var(--primary)] to-[var(--accent-violet)] text-white p-6 shadow-[0_8px_24px_-6px_rgba(61,44,142,0.3)]">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-white/15 flex items-center justify-center shrink-0">
              <AppIcon name="flame" size={30} className="text-orange-300" />
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl font-extrabold truncate">{state.profile.fullName}</h1>
              <p className="text-sm text-white/90 mt-0.5">
                {GOAL_LABELS[state.profile.goalKey]} · {state.profile.bodyType} ·{' '}
                {state.profile.dietPreference} · {GENDER_LABELS[state.profile.gender]}
              </p>
              <p className="text-xs text-white/75 mt-1 truncate">{state.profile.email}</p>
            </div>
          </div>

          {cycleTrackingEnabled && (
            <button
              type="button"
              onClick={() => navigate('/cycle')}
              className="h-11 px-4 rounded-full bg-white dark:bg-[#1E253B] text-[#BE123C] dark:text-rose-300 font-bold text-xs flex items-center gap-2 shadow-sm hover:bg-rose-50 dark:hover:bg-[#262F4A] transition-colors cursor-pointer"
            >
              <CycleLogoMark size={18} />
              <span>Open Period & Cycle Tracker</span>
            </button>
          )}
        </div>
      </section>

      {/* Appearance: Light & Dark Mode */}
      <section className="fitsync-card p-5 flex flex-wrap items-center justify-between gap-3" aria-labelledby="appearance-heading">
        <div>
          <h2 id="appearance-heading" className="text-base font-extrabold text-[var(--text-primary)]">
            Appearance
          </h2>
          <p className="text-xs text-[var(--text-secondary)]">
            Switch between bright Light surfaces and low-glare Dark mode across all screens.
          </p>
        </div>

        <div className="inline-flex items-center gap-1 p-1 rounded-full bg-[var(--surface-inset)] border border-[var(--border-subtle)]">
          <button
            type="button"
            onClick={() => setTheme('light')}
            className={`h-9 px-4 rounded-full text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
              theme === 'light'
                ? 'bg-[var(--primary)] text-white'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <AppIcon name="sun" size={14} />
            <span>Light</span>
          </button>
          <button
            type="button"
            onClick={() => setTheme('dark')}
            className={`h-9 px-4 rounded-full text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
              theme === 'dark'
                ? 'bg-[var(--primary)] text-white'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <AppIcon name="moon" size={14} />
            <span>Dark</span>
          </button>
        </div>
      </section>

      {/* Profile Gender Selector & Female-Only Module Gate */}
      <section className="fitsync-card p-5 space-y-3" aria-labelledby="gender-settings-heading">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 id="gender-settings-heading" className="text-base font-extrabold text-[var(--text-primary)]">
              Profile Gender & Module Personalization
            </h2>
            <p className="text-xs text-[var(--text-secondary)]">
              Period & Cycle Tracking is enabled strictly when Gender is set to Female.
            </p>
          </div>
          <span
            className={`px-3 py-1 rounded-full text-xs font-bold ${
              cycleTrackingEnabled
                ? 'bg-rose-50 dark:bg-rose-950/60 text-[#BE123C] dark:text-rose-300'
                : 'bg-[var(--surface-inset)] text-[var(--text-secondary)]'
            }`}
          >
            {cycleTrackingEnabled ? 'Cycle Module Active' : 'Cycle Module Hidden'}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {(['female', 'male', 'non_binary', 'prefer_not_to_say'] as GenderOption[]).map((g) => {
            const active = state.profile.gender === g;
            return (
              <button
                key={g}
                type="button"
                onClick={() => handleGenderChange(g)}
                className={`h-11 px-3 rounded-full text-xs font-bold transition-colors border cursor-pointer ${
                  active
                    ? 'bg-[var(--primary)] text-white border-[var(--primary)]'
                    : 'bg-[var(--surface-inset)] text-[var(--text-primary)] border-[var(--border-subtle)] hover:bg-[var(--card-surface)]'
                }`}
              >
                {GENDER_LABELS[g]}
              </button>
            );
          })}
        </div>
      </section>

      {/* Dietary Preference & Nutrient Focus */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-5 fitsync-card p-5 flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-[var(--surface-inset)] text-[var(--primary)] flex items-center justify-center shrink-0">
            <AppIcon name="utensils" size={20} />
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
              Dietary Preference
            </p>
            <p className="text-lg font-extrabold text-[var(--text-primary)] mt-0.5">
              {state.profile.dietPreference}
            </p>
          </div>
        </div>

        <div className="lg:col-span-7 fitsync-card p-5 space-y-2.5">
          <div className="flex items-center gap-2">
            <AppIcon name="heartPulse" size={18} className="text-[var(--accent-violet)]" />
            <h2 className="text-base font-extrabold text-[var(--text-primary)]">Nutrient Focus</h2>
          </div>
          <p className="text-xs text-[var(--text-secondary)]">
            Micronutrients to prioritize for your {state.profile.dietPreference} plan, per the
            FITSYNC ground-truth dataset:
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            {metrics.deficiencyFlags.map((flag) => (
              <span
                key={flag}
                className="px-3 py-1 rounded-full bg-[var(--surface-inset)] text-[var(--primary)] text-xs font-bold"
              >
                {flag.replace(/_/g, ' ')}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* 2x2 Biometrics Grid */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3.5" aria-label="Biometrics summary">
        <div className="fitsync-card p-4 sm:p-5">
          <AppIcon name="scale" size={18} className="text-[var(--text-secondary)]" />
          <p className="text-2xl font-extrabold text-[var(--text-primary)] tabular-nums mt-2">
            {state.profile.weightKg} Kg
          </p>
          <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary)] mt-1">
            Weight (BMI {metrics.bmi})
          </p>
        </div>

        <div className="fitsync-card p-4 sm:p-5">
          <AppIcon name="scale" size={18} className="text-[var(--text-secondary)]" />
          <p className="text-2xl font-extrabold text-[var(--text-primary)] tabular-nums mt-2">
            {state.profile.heightCm} Cm
          </p>
          <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary)] mt-1">
            Height ({metrics.age} yrs)
          </p>
        </div>

        <div className="fitsync-card p-4 sm:p-5">
          <AppIcon name="clock" size={18} className="text-[var(--text-secondary)]" />
          <p className="text-2xl font-extrabold text-[var(--text-primary)] tabular-nums mt-2">
            {state.profile.trainingTime}
          </p>
          <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary)] mt-1">
            Time Slot
          </p>
        </div>

        <div className="fitsync-card p-4 sm:p-5">
          <AppIcon name="flame" size={18} className="text-[var(--text-secondary)]" />
          <p className="text-2xl font-extrabold text-[var(--text-primary)] tabular-nums mt-2">
            {metrics.bmr.toLocaleString()} Kcal
          </p>
          <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary)] mt-1">
            BMR (Mifflin-St Jeor)
          </p>
        </div>
      </section>

      {/* Caloric Calibration & Somatotype Macros */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="fitsync-card p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-extrabold text-[var(--text-primary)]">
              TDEE & Safe Daily Target
            </h2>
            {metrics.safetyFloorTriggered && (
              <span className="px-3 py-1 rounded-full bg-orange-50 dark:bg-orange-950/60 text-[var(--status-surge)] text-xs font-bold">
                Safety Floor Clamped
              </span>
            )}
          </div>

          <div className="grid grid-cols-3 gap-2.5 text-center">
            <div className="rounded-2xl bg-[var(--surface-inset)] p-3">
              <span className="block text-[11px] font-semibold text-[var(--text-secondary)]">TDEE</span>
              <span className="block text-lg font-extrabold text-[var(--text-primary)] tabular-nums mt-0.5">
                {metrics.tdee.toLocaleString()}
              </span>
            </div>
            <div className="rounded-2xl bg-[var(--surface-inset)] p-3">
              <span className="block text-[11px] font-semibold text-[var(--text-secondary)]">Raw Target</span>
              <span className="block text-lg font-extrabold text-[var(--text-primary)] tabular-nums mt-0.5">
                {metrics.rawTargetKcal.toLocaleString()}
              </span>
            </div>
            <div className="rounded-2xl bg-[var(--primary)] text-white p-3">
              <span className="block text-[11px] font-semibold text-white/80">Safe Target</span>
              <span className="block text-lg font-extrabold tabular-nums mt-0.5">
                {metrics.safeTargetKcal.toLocaleString()}
              </span>
            </div>
          </div>

          {metrics.safetyFloorTriggered && (
            <p className="text-xs font-semibold text-[var(--status-surge)] flex items-start gap-2">
              <AppIcon name="alert" size={16} className="shrink-0 mt-0.5" />
              <span>
                Clinical safety floor enforced: raw target ({metrics.rawTargetKcal} kcal) clamped to{' '}
                {metrics.safetyFloorMinKcal.toLocaleString()} kcal minimum.
              </span>
            </p>
          )}
        </section>

        <section className="fitsync-card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-extrabold text-[var(--text-primary)]">
              Somatotype Macro Split ({state.profile.bodyType})
            </h2>
            {metrics.isAdjustedBodyWeight && (
              <span className="text-xs font-bold text-[var(--accent-violet)] tabular-nums">
                AdjBW: {metrics.adjustedProteinBasisKg} kg
              </span>
            )}
          </div>

          <div className="grid grid-cols-3 gap-2.5 text-center">
            <div className="rounded-2xl bg-[var(--surface-inset)] p-3">
              <span className="block text-[11px] font-semibold text-[var(--text-secondary)]">
                Protein ({metrics.macros.proteinPct}%)
              </span>
              <span className="block text-lg font-extrabold text-[var(--primary)] tabular-nums mt-0.5">
                {metrics.macros.proteinG}g
              </span>
            </div>
            <div className="rounded-2xl bg-[var(--surface-inset)] p-3">
              <span className="block text-[11px] font-semibold text-[var(--text-secondary)]">
                Carbs ({metrics.macros.carbsPct}%)
              </span>
              <span className="block text-lg font-extrabold text-[var(--text-primary)] tabular-nums mt-0.5">
                {metrics.macros.carbsG}g
              </span>
            </div>
            <div className="rounded-2xl bg-[var(--surface-inset)] p-3">
              <span className="block text-[11px] font-semibold text-[var(--text-secondary)]">
                Fats ({metrics.macros.fatsPct}%)
              </span>
              <span className="block text-lg font-extrabold text-[var(--text-primary)] tabular-nums mt-0.5">
                {metrics.macros.fatsG}g
              </span>
            </div>
          </div>

          <p className="text-xs text-[var(--text-secondary)] tabular-nums">
            WHO Safe Leucine: <strong className="text-[var(--text-primary)]">{metrics.aminoTargets.leucineMg.toLocaleString()} mg/day</strong> ·
            Water: <strong className="text-[var(--text-primary)]">{metrics.driTargets.waterL} L</strong> ·
            Sodium Cap: <strong className="text-[var(--text-primary)]">{metrics.driTargets.sodiumCapMg.toLocaleString()} mg</strong> ·
            Calcium: <strong className="text-[var(--text-primary)]">{metrics.driTargets.calciumMg.toLocaleString()} mg</strong>
          </p>
        </section>
      </div>

      {/* Active Medical Safety Overrides */}
      <section className="fitsync-card p-5 space-y-2.5">
        <div className="flex items-center gap-2">
          <AppIcon name="shieldCheck" size={18} className="text-[var(--status-success)]" />
          <h2 className="text-base font-extrabold text-[var(--text-primary)]">
            Active Medical Safety Rules
          </h2>
        </div>

        {metrics.medicalOverrides.notes.length > 0 ? (
          <ul className="space-y-1.5 text-xs font-medium text-[var(--text-primary)]">
            {metrics.medicalOverrides.notes.map((note, idx) => (
              <li key={idx}>• {note}</li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-[var(--text-secondary)]">
            No medical contraindications flagged. Standard 2024 Compendium MET and Atwater targets apply.
          </p>
        )}
      </section>

      {/* Reset & Re-Onboard */}
      <section className="fitsync-card p-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-extrabold text-[var(--text-primary)]">
            Recalibrate Profile
          </h2>
          <p className="text-xs text-[var(--text-secondary)]">
            Clear local data and restart the 5-step FITSYNC onboarding wizard.
          </p>
        </div>

        {!confirmReset ? (
          <button
            type="button"
            onClick={() => setConfirmReset(true)}
            className="h-11 px-5 rounded-full bg-[var(--surface-inset)] hover:bg-[var(--border-subtle)] text-[var(--text-primary)] text-xs font-bold transition-colors cursor-pointer"
          >
            Reset & Re-Onboard
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setConfirmReset(false)}
              className="h-10 px-4 rounded-full bg-[var(--surface-inset)] text-xs font-bold text-[var(--text-secondary)] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmReset}
              className="h-10 px-4 rounded-full bg-[var(--status-surge)] text-white text-xs font-bold cursor-pointer"
            >
              Confirm Reset
            </button>
          </div>
        )}
      </section>

      {/* Dialog shown when switching away from Female with existing cycle records */}
      {genderSwitchModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cycle-hide-dialog-title"
        >
          <div className="bg-[var(--card-surface)] border border-[var(--border-subtle)] rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-950/60 text-[#BE123C] dark:text-rose-300 flex items-center justify-center">
                <AppIcon name="shield" size={20} />
              </div>
              <div>
                <h3 id="cycle-hide-dialog-title" className="text-base font-extrabold text-[var(--text-primary)]">
                  Period & Cycle Tracking Hidden
                </h3>
                <p className="text-xs text-[var(--text-secondary)]">
                  All cycle tabs & reminders are immediately hidden and paused. Your historical logs remain untouched unless you delete them.
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => {
                  handleExportCycleJson();
                }}
                className="w-full h-11 rounded-full bg-[var(--primary)] text-white text-xs font-bold flex items-center justify-center gap-2 cursor-pointer"
              >
                <AppIcon name="download" size={16} />
                <span>Export Cycle Data (JSON)</span>
              </button>
              <button
                type="button"
                onClick={handleExportCycleCsv}
                className="w-full h-11 rounded-full bg-[var(--surface-inset)] text-[var(--text-primary)] text-xs font-bold flex items-center justify-center gap-2 cursor-pointer"
              >
                <AppIcon name="fileSpreadsheet" size={16} />
                <span>Export Cycle Data (CSV)</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  deleteAllCycleHistory();
                  setGenderSwitchModalOpen(false);
                }}
                className="w-full h-11 rounded-full bg-rose-600 text-white text-xs font-bold flex items-center justify-center gap-2 cursor-pointer"
              >
                <AppIcon name="trash2" size={16} />
                <span>Permanently Delete Cycle History</span>
              </button>
              <button
                type="button"
                onClick={() => setGenderSwitchModalOpen(false)}
                className="w-full h-10 rounded-full text-xs font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-inset)] cursor-pointer"
              >
                Keep Hidden Without Deleting
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
