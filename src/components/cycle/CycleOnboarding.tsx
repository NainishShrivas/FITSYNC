import { useMemo, useState } from 'react';
import type { CycleMode, UserCycleSettings } from '../../types/cycle';
import { CYCLE_MODE_LABELS, addDaysIso } from '../../utils/cycleEngine';
import { AppIcon } from '../AppIcon';
import { CycleLogoMark } from '../CycleLogoMark';

interface Props {
  todayDate: string;
  onComplete: (settingsPatch: Partial<UserCycleSettings>, fastTrackDates: string[]) => void;
}

function buildPastMonths(referenceDate: string): Array<{ label: string; days: string[] }> {
  const [y, m] = referenceDate.split('-').map(Number);
  const months: Array<{ label: string; days: string[] }> = [];
  for (let offset = 2; offset >= 0; offset--) {
    const dt = new Date(Date.UTC(y, m - 1 - offset, 1));
    const yr = dt.getUTCFullYear();
    const mo = dt.getUTCMonth();
    const label = dt.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    const daysInMonth = new Date(Date.UTC(yr, mo + 1, 0)).getUTCDate();
    const days: string[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const iso = `${yr}-${String(mo + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      if (iso <= referenceDate) days.push(iso);
    }
    months.push({ label, days });
  }
  return months;
}

export function CycleOnboarding({ todayDate, onComplete }: Props) {
  const [step, setStep] = useState<number>(1);
  const [essentialConsent, setEssentialConsent] = useState(true);
  const [optionalAnalytics, setOptionalAnalytics] = useState(false);
  const [fastTrackDates, setFastTrackDates] = useState<string[]>([]);
  const [typicalCycle, setTypicalCycle] = useState(28);
  const [typicalPeriod, setTypicalPeriod] = useState(5);
  const [typicalPms, setTypicalPms] = useState(0);
  const [cycleLenText, setCycleLenText] = useState('28');
  const [periodLenText, setPeriodLenText] = useState('5');
  const [pmsLenText, setPmsLenText] = useState('0');
  const [selectedMode, setSelectedMode] = useState<CycleMode>('period_tracking');

  const pastMonths = useMemo(() => buildPastMonths(todayDate), [todayDate]);

  const toggleFastTrackDate = (date: string) => {
    setFastTrackDates((prev) =>
      prev.includes(date) ? prev.filter((d) => d !== date) : [...prev, date].sort()
    );
  };

  const quickFillSample3Months = () => {
    // Convenience helper to pre-select two clean 5-day cycles ending recently
    const c1Start = addDaysIso(todayDate, -56);
    const c2Start = addDaysIso(todayDate, -28);
    const dates: string[] = [];
    for (let i = 0; i < 5; i++) dates.push(addDaysIso(c1Start, i));
    for (let i = 0; i < 5; i++) dates.push(addDaysIso(c2Start, i));
    setFastTrackDates(dates);
  };

  const resolveClampedBaselines = () => {
    const parseOrDefault = (raw: string, fallback: number, min: number, max: number) => {
      const trimmed = raw.trim();
      if (!trimmed) return fallback;
      const n = Number(trimmed);
      if (!Number.isFinite(n)) return fallback;
      return Math.max(min, Math.min(max, Math.round(n)));
    };
    return {
      cycle: parseOrDefault(cycleLenText, typicalCycle, 18, 60),
      period: parseOrDefault(periodLenText, typicalPeriod, 2, 12),
      pms: parseOrDefault(pmsLenText, typicalPms, 0, 10),
    };
  };

  const commitBaselineField = (
    field: 'cycle' | 'period' | 'pms',
    raw: string,
    min: number,
    max: number,
    fallback: number
  ) => {
    const trimmed = raw.trim();
    const n = trimmed === '' ? fallback : Math.max(min, Math.min(max, Math.round(Number(trimmed) || fallback)));
    if (field === 'cycle') {
      setTypicalCycle(n);
      setCycleLenText(String(n));
    } else if (field === 'period') {
      setTypicalPeriod(n);
      setPeriodLenText(String(n));
    } else {
      setTypicalPms(n);
      setPmsLenText(String(n));
    }
  };

  const handleFinish = () => {
    const resolved = resolveClampedBaselines();
    onComplete(
      {
        activeMode: selectedMode,
        setupTypicalCycleLength: resolved.cycle,
        setupTypicalPeriodLength: resolved.period,
        setupTypicalPmsDays: resolved.pms,
        privacyConsents: {
          essentialHealthStorage: essentialConsent,
          optionalAnalytics,
          consentTimestamp: new Date().toISOString(),
        },
      },
      fastTrackDates
    );
  };

  return (
    <div className="max-w-2xl mx-auto fitsync-card p-6 sm:p-8 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <CycleLogoMark size={34} />
          <div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-[var(--text-primary)]">
              Cycle Tracker Setup
            </h1>
            <p className="text-xs text-[var(--text-secondary)]">
              Step {step} of 4 · Science-calibrated private cycle tracking
            </p>
          </div>
        </div>
        <span className="px-3 py-1 rounded-full bg-rose-50 dark:bg-rose-950/60 text-[#BE123C] dark:text-rose-300 text-xs font-bold tabular-nums">
          {step * 25}%
        </span>
      </div>

      <div className="w-full h-2 rounded-full bg-[var(--surface-inset)] overflow-hidden">
        <div
          className="h-full rounded-full bg-[#E11D48] transition-all duration-300"
          style={{ width: `${step * 25}%` }}
        />
      </div>

      {/* Step 1: Granular Privacy Consents */}
      {step === 1 && (
        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-extrabold text-[var(--text-primary)]">
              Your Reproductive Health Privacy
            </h2>
            <p className="text-xs sm:text-sm text-[var(--text-secondary)] mt-1">
              Cycle records are isolated from general fitness telemetry and never sent to third-party advertising SDKs.
            </p>
          </div>

          <label className="p-4 rounded-2xl bg-[var(--surface-inset)] border border-[var(--border-subtle)] flex items-start justify-between gap-4 cursor-pointer">
            <div>
              <span className="text-sm font-bold text-[var(--text-primary)] block">
                Essential Cycle & Health Data Storage (Required)
              </span>
              <span className="text-xs text-[var(--text-secondary)] block mt-0.5">
                Stores your daily bleeding, symptom, and prediction logs locally and in your isolated profile store.
              </span>
            </div>
            <input
              type="checkbox"
              checked={essentialConsent}
              onChange={(e) => setEssentialConsent(e.target.checked)}
              className="mt-1 w-5 h-5 accent-[#E11D48]"
            />
          </label>

          <label className="p-4 rounded-2xl bg-[var(--card-surface)] border border-[var(--border-subtle)] flex items-start justify-between gap-4 cursor-pointer">
            <div>
              <span className="text-sm font-bold text-[var(--text-primary)] block">
                Optional Anonymous Science Insights
              </span>
              <span className="text-xs text-[var(--text-secondary)] block mt-0.5">
                Opt-in only. Off by default — zero marketing or third-party ad tracking.
              </span>
            </div>
            <input
              type="checkbox"
              checked={optionalAnalytics}
              onChange={(e) => setOptionalAnalytics(e.target.checked)}
              className="mt-1 w-5 h-5 accent-[#E11D48]"
            />
          </label>
        </section>
      )}

      {/* Step 2: Fast Track Historical Period Selector */}
      {step === 2 && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-extrabold text-[var(--text-primary)]">
                Fast Track: Mark Past Periods
              </h2>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                Tap past period days across recent months so predictions start calibrated right away (optional).
              </p>
            </div>
            <button
              type="button"
              onClick={quickFillSample3Months}
              className="px-3 py-1.5 rounded-full bg-rose-50 dark:bg-rose-950/60 text-[#BE123C] dark:text-rose-300 text-xs font-bold hover:bg-rose-100 dark:hover:bg-rose-950 cursor-pointer"
            >
              Auto-fill 2 recent cycles
            </button>
          </div>

          <div className="space-y-4 max-h-72 overflow-y-auto pr-1">
            {pastMonths.map((month) => (
              <div key={month.label} className="rounded-2xl bg-[var(--surface-inset)] p-3.5">
                <p className="text-xs font-extrabold uppercase tracking-wider text-[var(--text-secondary)] mb-2">
                  {month.label}
                </p>
                <div className="grid grid-cols-7 gap-1.5">
                  {month.days.map((iso) => {
                    const selected = fastTrackDates.includes(iso);
                    const dayNum = Number(iso.slice(8));
                    return (
                      <button
                        key={iso}
                        type="button"
                        onClick={() => toggleFastTrackDate(iso)}
                        className={`h-9 rounded-xl text-xs font-bold tabular-nums transition-colors cursor-pointer ${
                          selected
                            ? 'bg-[#E11D48] text-white shadow-sm'
                            : 'bg-[var(--card-surface)] text-[var(--text-primary)] hover:bg-rose-50 dark:hover:bg-rose-950/40'
                        }`}
                      >
                        {dayNum}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <p className="text-xs font-semibold text-[var(--text-secondary)] tabular-nums">
            Selected past period dates: <strong className="text-[#BE123C]">{fastTrackDates.length}</strong>
          </p>
        </section>
      )}

      {/* Step 3: Optional Setup Defaults */}
      {step === 3 && (
        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-extrabold text-[var(--text-primary)]">
              Typical Cycle Baselines
            </h2>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              Used for cold-start forecasts until your 6- and 12-cycle rolling logs take over.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <div className="p-4 rounded-2xl bg-[var(--surface-inset)]">
              <label htmlFor="setup-cycle-len" className="text-xs font-bold text-[var(--text-secondary)] block">
                Typical Cycle (days)
              </label>
              <input
                id="setup-cycle-len"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={2}
                placeholder="28"
                value={cycleLenText}
                onChange={(e) => {
                  const clean = e.target.value.replace(/\D/g, '').slice(0, 2);
                  setCycleLenText(clean);
                  if (clean !== '') {
                    const num = Number(clean);
                    if (num >= 18 && num <= 60) setTypicalCycle(num);
                  }
                }}
                onBlur={() => commitBaselineField('cycle', cycleLenText, 18, 60, 28)}
                className="mt-2 w-full h-11 px-3.5 rounded-xl bg-[var(--card-surface)] border border-[var(--border-subtle)] text-base font-extrabold text-[var(--text-primary)] tabular-nums focus:outline-none focus:border-[#E11D48]"
              />
              <span className="mt-1.5 block text-[11px] text-[var(--text-secondary)] tabular-nums">
                Range: 18–60 days
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-[var(--surface-inset)]">
              <label htmlFor="setup-period-len" className="text-xs font-bold text-[var(--text-secondary)] block">
                Typical Period (days)
              </label>
              <input
                id="setup-period-len"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={2}
                placeholder="5"
                value={periodLenText}
                onChange={(e) => {
                  const clean = e.target.value.replace(/\D/g, '').slice(0, 2);
                  setPeriodLenText(clean);
                  if (clean !== '') {
                    const num = Number(clean);
                    if (num >= 2 && num <= 12) setTypicalPeriod(num);
                  }
                }}
                onBlur={() => commitBaselineField('period', periodLenText, 2, 12, 5)}
                className="mt-2 w-full h-11 px-3.5 rounded-xl bg-[var(--card-surface)] border border-[var(--border-subtle)] text-base font-extrabold text-[var(--text-primary)] tabular-nums focus:outline-none focus:border-[#E11D48]"
              />
              <span className="mt-1.5 block text-[11px] text-[var(--text-secondary)] tabular-nums">
                Range: 2–12 days
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-[var(--surface-inset)]">
              <label htmlFor="setup-pms-len" className="text-xs font-bold text-[var(--text-secondary)] block">
                Typical PMS Days
              </label>
              <input
                id="setup-pms-len"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={2}
                placeholder="0"
                value={pmsLenText}
                onChange={(e) => {
                  const clean = e.target.value.replace(/\D/g, '').slice(0, 2);
                  setPmsLenText(clean);
                  if (clean !== '') {
                    const num = Number(clean);
                    if (num >= 0 && num <= 10) setTypicalPms(num);
                  }
                }}
                onBlur={() => commitBaselineField('pms', pmsLenText, 0, 10, 0)}
                className="mt-2 w-full h-11 px-3.5 rounded-xl bg-[var(--card-surface)] border border-[var(--border-subtle)] text-base font-extrabold text-[var(--text-primary)] tabular-nums focus:outline-none focus:border-[#E11D48]"
              />
              <span className="mt-1.5 block text-[11px] text-[var(--text-secondary)] tabular-nums">
                Range: 0–10 days
              </span>
            </div>
          </div>

          <p className="text-xs text-[var(--text-secondary)] bg-rose-50/70 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-2xl p-3.5">
            Note: Predicted white PMS clouds appear only if Typical PMS Days &gt; 0 here or when you log{' '}
            <strong>PMS</strong> inside the Feelings category on Track.
          </p>
        </section>
      )}

      {/* Step 4: Mode Selector */}
      {step === 4 && (
        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-extrabold text-[var(--text-primary)]">
              Choose Tracking Mode
            </h2>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              Switch modes anytime from the top-right More Menu (=).
            </p>
          </div>

          <div className="space-y-2.5">
            {(Object.keys(CYCLE_MODE_LABELS) as CycleMode[]).map((modeKey) => {
              const info = CYCLE_MODE_LABELS[modeKey];
              const active = selectedMode === modeKey;
              return (
                <button
                  key={modeKey}
                  type="button"
                  onClick={() => setSelectedMode(modeKey)}
                  className={`w-full p-4 rounded-2xl text-left border transition-colors flex items-center justify-between gap-3 cursor-pointer ${
                    active
                      ? 'bg-[#BE123C] text-white border-[#BE123C]'
                      : 'bg-[var(--surface-inset)] text-[var(--text-primary)] border-[var(--border-subtle)] hover:bg-[var(--card-surface)]'
                  }`}
                >
                  <div>
                    <span className="text-sm font-extrabold block">{info.title}</span>
                    <span className={`text-xs block mt-0.5 ${active ? 'text-white/85' : 'text-[var(--text-secondary)]'}`}>
                      {info.subtitle}
                    </span>
                  </div>
                  {active && <AppIcon name="check" size={18} />}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Navigation Controls */}
      <div className="flex items-center justify-between gap-3 pt-2 border-t border-[var(--border-subtle)]">
        <button
          type="button"
          disabled={step === 1}
          onClick={() => setStep((s) => Math.max(1, s - 1))}
          className={`h-11 px-5 rounded-full text-xs font-bold border ${
            step === 1
              ? 'opacity-40 cursor-not-allowed border-[var(--border-subtle)]'
              : 'bg-[var(--card-surface)] border-[var(--border-subtle)] hover:bg-[var(--surface-inset)] cursor-pointer'
          }`}
        >
          Back
        </button>

        {step < 4 ? (
          <button
            type="button"
            disabled={step === 1 && !essentialConsent}
            onClick={() => {
              if (step === 3) {
                commitBaselineField('cycle', cycleLenText, 18, 60, 28);
                commitBaselineField('period', periodLenText, 2, 12, 5);
                commitBaselineField('pms', pmsLenText, 0, 10, 0);
              }
              setStep((s) => Math.min(4, s + 1));
            }}
            className={`h-11 px-6 rounded-full text-xs font-bold text-white flex items-center gap-1.5 ${
              step === 1 && !essentialConsent
                ? 'bg-rose-300 cursor-not-allowed'
                : 'bg-[#BE123C] hover:bg-[#9F1239] cursor-pointer'
            }`}
          >
            <span>Continue</span>
            <AppIcon name="chevronRight" size={16} />
          </button>
        ) : (
          <button
            type="button"
            onClick={handleFinish}
            className="h-11 px-6 rounded-full bg-[#BE123C] hover:bg-[#9F1239] text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
          >
            <span>Open Cycle Tracker</span>
            <AppIcon name="check" size={16} />
          </button>
        )}
      </div>
    </div>
  );
}
