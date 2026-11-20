import React, { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AppIcon } from '../components/AppIcon';
import { ProgressRing } from '../components/ProgressRing';
import { useAppState } from '../context/AppStateContext';
import { generateHistoryCsv } from '../utils/calibrateEngine';
import { downloadFitSyncPdfReport } from '../utils/pdfReport';

type Timeframe = 'Daily' | 'Weekly' | 'Monthly';

export function AnalyticsPage() {
  const {
    state,
    metrics,
    eatenTodayKcal,
    burnedTodayKcal,
    cycleState,
    cycleEngine,
    logWeightEntry,
    showToast,
  } = useAppState();
  const [timeframe, setTimeframe] = useState<Timeframe>('Weekly');
  const [weightInput, setWeightInput] = useState<string>('');

  const filteredHistory = useMemo(() => {
    if (timeframe === 'Daily') return state.history14Days.slice(-5);
    if (timeframe === 'Weekly') return state.history14Days;
    // Monthly: combine prior 16-day baseline trend with 14-day recent log
    const earliest = state.history14Days[0];
    if (!earliest) return state.history14Days;
    const priorDays = Array.from({ length: 16 }, (_, idx) => {
      const d = new Date('2026-11-06T12:00:00Z');
      d.setUTCDate(d.getUTCDate() - (16 - idx));
      const iso = d.toISOString().slice(0, 10);
      return {
        ...earliest,
        date: iso,
        dayLabel: iso.slice(5),
        weightKg: Number((earliest.weightKg + 0.6 - idx * 0.03).toFixed(1)),
        habitPct: [74, 78, 80, 68, 72, 85, 82, 76, 79, 88, 84, 72, 75, 81, 79, 83][idx],
        streakCount: (idx % 4) + 1,
      };
    });
    return [...priorDays, ...state.history14Days];
  }, [state.history14Days, timeframe]);

  const kpis = useMemo(() => {
    const first = state.history14Days[0]?.weightKg ?? state.profile.weightKg;
    const current = state.profile.weightKg;
    const change = Number((current - first).toFixed(1));
    const avgHabitPct = Math.round(
      filteredHistory.reduce((acc, d) => acc + d.habitPct, 0) / Math.max(1, filteredHistory.length)
    );
    return {
      currentWeight: current,
      totalChange: change,
      currentStreak: state.streakDays,
      avgHabits: avgHabitPct,
    };
  }, [state.history14Days, state.profile.weightKg, state.streakDays, filteredHistory]);

  const handleLogWeight = (e: React.FormEvent) => {
    e.preventDefault();
    const num = Number(weightInput);
    if (!Number.isFinite(num) || num < 30 || num > 250) return;
    logWeightEntry(num);
    setWeightInput('');
  };

  const handleExportCsv = () => {
    const csv = generateHistoryCsv(state.history14Days, state.profile);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fitsync-analytics-${state.todayDate}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadPdf = () => {
    downloadFitSyncPdfReport({
      state,
      metrics,
      eatenTodayKcal,
      burnedTodayKcal,
      avgHabitsPct: kpis.avgHabits,
      cycleState,
      cycleEngine,
    });
    showToast(`Downloaded fitsync-report-${state.todayDate}.pdf`, 'success');
  };

  return (
    <div className="space-y-5">
      {/* Header + Segmented Timeframe Toggle */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[var(--text-primary)] tracking-tight">
            Analytics
          </h1>
          <p className="text-sm text-[var(--text-secondary)] mt-0.5">
            Track your progress over time
          </p>
        </div>

        <div
          className="inline-flex items-center bg-[var(--card-surface)] border border-[var(--border-subtle)] rounded-full p-1 shadow-[0_8px_24px_-6px_rgba(30,27,75,0.08)]"
          role="tablist"
          aria-label="Analytics timeframe"
        >
          {(['Daily', 'Weekly', 'Monthly'] as Timeframe[]).map((tf) => {
            const active = timeframe === tf;
            return (
              <button
                key={tf}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTimeframe(tf)}
                className={`px-4 py-2 rounded-full text-xs sm:text-sm font-bold transition-colors cursor-pointer ${
                  active
                    ? 'bg-[var(--primary)] text-white'
                    : 'text-[var(--text-primary)] hover:bg-[var(--surface-inset)]'
                }`}
              >
                {tf}
              </button>
            );
          })}
        </div>
      </header>

      {/* 2x2 KPI Grid */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3.5" aria-label="Key performance metrics">
        <div className="fitsync-card p-4 sm:p-5">
          <AppIcon name="scale" size={18} className="text-[var(--text-secondary)]" />
          <p className="text-2xl font-extrabold text-[var(--text-primary)] tabular-nums mt-2">
            {kpis.currentWeight} kg
          </p>
          <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary)] mt-1">
            Current Weight
          </p>
        </div>

        <div className="fitsync-card p-4 sm:p-5">
          <AppIcon name="activity" size={18} className="text-[var(--text-secondary)]" />
          <p className="text-2xl font-extrabold text-[var(--accent-violet)] tabular-nums mt-2">
            {kpis.totalChange > 0 ? `+${kpis.totalChange}` : kpis.totalChange} kg
          </p>
          <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary)] mt-1">
            Total Change
          </p>
        </div>

        <div className="fitsync-card p-4 sm:p-5">
          <AppIcon name="flame" size={18} className="text-[var(--text-secondary)]" />
          <p className="text-2xl font-extrabold text-[var(--accent-violet)] tabular-nums mt-2">
            {kpis.currentStreak} days
          </p>
          <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary)] mt-1">
            Current Streak
          </p>
        </div>

        <div className="fitsync-card p-4 sm:p-5">
          <AppIcon name="activity" size={18} className="text-[var(--text-secondary)]" />
          <p className="text-2xl font-extrabold text-[var(--primary)] tabular-nums mt-2">
            {kpis.avgHabits}%
          </p>
          <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary)] mt-1">
            Avg Habits
          </p>
        </div>
      </section>

      {/* Export Buttons + Weekly Weight Input */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="no-print lg:col-span-5 flex flex-col gap-3">
          <button
            type="button"
            onClick={handleDownloadPdf}
            className="w-full h-13 rounded-full bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <AppIcon name="download" size={18} />
            <span>Download PDF Report</span>
          </button>
          <button
            type="button"
            onClick={handleExportCsv}
            className="w-full h-13 rounded-full bg-[var(--surface-inset)] hover:bg-[var(--border-subtle)] text-[var(--text-primary)] border border-[var(--border-subtle)] font-bold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <AppIcon name="fileSpreadsheet" size={18} />
            <span>Export CSV</span>
          </button>
        </div>

        <form
          onSubmit={handleLogWeight}
          className="no-print lg:col-span-7 fitsync-card p-5 flex flex-wrap items-center justify-between gap-3"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[var(--surface-inset)] text-[var(--primary)] flex items-center justify-center">
              <AppIcon name="scale" size={18} />
            </div>
            <div>
              <label htmlFor="log-weight-kg" className="text-base font-extrabold text-[var(--text-primary)] block">
                Weekly Weight
              </label>
              <span className="text-xs text-[var(--text-secondary)]">
                Updates BMR, TDEE & Net MET targets live
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-1 sm:flex-initial justify-end">
            <input
              id="log-weight-kg"
              type="number"
              min={30}
              max={250}
              step="0.1"
              value={weightInput}
              onChange={(e) => setWeightInput(e.target.value)}
              placeholder="Log kg"
              className="w-28 h-11 px-4 rounded-full bg-[var(--surface-inset)] border border-[var(--border-subtle)] text-sm font-semibold text-[var(--text-primary)] tabular-nums focus:outline-none focus:border-[var(--primary)]"
            />
            <button
              type="submit"
              className="h-11 px-5 rounded-full bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white text-sm font-bold transition-colors cursor-pointer"
            >
              Log
            </button>
          </div>
        </form>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Weight Trend AreaChart */}
        <section className="fitsync-card p-5" aria-labelledby="weight-chart-heading">
          <div className="flex items-center justify-between mb-3">
            <h2 id="weight-chart-heading" className="text-base font-extrabold text-[var(--text-primary)]">
              Weight Trend (kg)
            </h2>
            <span className="text-xs font-semibold text-[var(--text-secondary)] tabular-nums">
              Target {metrics.safeTargetKcal} kcal/day
            </span>
          </div>
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={filteredHistory} margin={{ top: 10, right: 12, left: -12, bottom: 0 }}>
                <defs>
                  <linearGradient id="weightArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="var(--primary)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
                <XAxis dataKey="dayLabel" tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} />
                <YAxis domain={['dataMin - 1', 'dataMax + 1']} tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} />
                <Tooltip
                  formatter={(v) => [`${v} kg`, 'Weight']}
                  contentStyle={{
                    borderRadius: '14px',
                    backgroundColor: 'var(--card-surface)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-primary)',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="weightKg"
                  stroke="var(--primary)"
                  strokeWidth={2.5}
                  fill="url(#weightArea)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Habit Completion BarChart */}
        <section className="fitsync-card p-5" aria-labelledby="habit-chart-heading">
          <div className="flex items-center gap-2 mb-3">
            <AppIcon name="activity" size={18} className="text-[var(--primary)]" />
            <h2 id="habit-chart-heading" className="text-base font-extrabold text-[var(--text-primary)]">
              Habit Completion
            </h2>
          </div>
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={filteredHistory} margin={{ top: 10, right: 12, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
                <XAxis dataKey="dayLabel" tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} />
                <YAxis domain={[0, 100]} tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} />
                <Tooltip
                  formatter={(v) => [`${v}%`, 'Habits Completed']}
                  contentStyle={{
                    borderRadius: '14px',
                    backgroundColor: 'var(--card-surface)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-primary)',
                  }}
                />
                <Bar dataKey="habitPct" fill="var(--primary)" radius={[8, 8, 0, 0]} maxBarSize={18} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Avg Completion Donut Card */}
        <section className="fitsync-card p-6 flex flex-col items-center justify-center" aria-labelledby="avg-completion-heading">
          <h2 id="avg-completion-heading" className="text-base font-extrabold text-[var(--text-primary)] mb-4">
            Avg Completion
          </h2>
          <ProgressRing
            value={kpis.avgHabits}
            max={100}
            color="var(--primary)"
            size={146}
            strokeWidth={14}
            label=""
            centerDisplay={`${kpis.avgHabits}%`}
            sublabel={`last ${filteredHistory.length} days`}
          />
        </section>

        {/* Streak History Chart */}
        <section className="fitsync-card p-5" aria-labelledby="streak-history-heading">
          <div className="flex items-center gap-2 mb-3">
            <AppIcon name="flame" size={18} className="text-[var(--accent-violet)]" />
            <h2 id="streak-history-heading" className="text-base font-extrabold text-[var(--text-primary)]">
              Streak History
            </h2>
          </div>
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={filteredHistory} margin={{ top: 10, right: 12, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
                <XAxis dataKey="dayLabel" tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} />
                <Tooltip
                  formatter={(v) => [`${v} days`, 'Streak']}
                  contentStyle={{
                    borderRadius: '14px',
                    backgroundColor: 'var(--card-surface)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-primary)',
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="streakCount"
                  stroke="var(--accent-violet)"
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: 'var(--accent-violet)' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>
    </div>
  );
}
