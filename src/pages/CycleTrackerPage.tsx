import { useEffect, useMemo, useState } from 'react';
import {
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
import { CycleLogoMark } from '../components/CycleLogoMark';
import { CycleMoreDrawer } from '../components/cycle/CycleMoreDrawer';
import { CycleOnboarding } from '../components/cycle/CycleOnboarding';
import { useAppState } from '../context/AppStateContext';
import type { BleedingFlow, DailyCycleLog, TrackingCategoryDef } from '../types/cycle';
import {
  CYCLE_MODE_LABELS,
  SCIENCE_ARTICLES,
  TRACKING_CATEGORIES,
  addDaysIso,
  buildDayVisualMap,
  createEmptyDailyLog,
  diffDaysIso,
} from '../utils/cycleEngine';

type CycleTab = 'cycle' | 'calendar' | 'track' | 'analysis' | 'content';

const CATEGORY_MAP = new Map<string, TrackingCategoryDef>(
  TRACKING_CATEGORIES.map((c) => [c.id, c])
);

const FLOW_TO_NUM: Record<BleedingFlow, number> = {
  none: 0,
  spotting: 1,
  light: 2,
  medium: 3,
  heavy: 4,
};

function formatShortDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function getMonthDays(year: number, monthIndex0: number): {
  label: string;
  firstWeekday: number;
  dates: string[];
} {
  const first = new Date(Date.UTC(year, monthIndex0, 1));
  const label = first.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  // Monday=0 ... Sunday=6
  const utcDay = first.getUTCDay();
  const firstWeekday = (utcDay + 6) % 7;
  const daysInMonth = new Date(Date.UTC(year, monthIndex0 + 1, 0)).getUTCDate();
  const dates: string[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    dates.push(
      `${first.getUTCFullYear()}-${String(first.getUTCMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    );
  }
  return { label, firstWeekday, dates };
}

export function CycleTrackerPage() {
  const {
    state,
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
    showToast,
  } = useAppState();

  const [activeTab, setActiveTab] = useState<CycleTab>('cycle');
  const [moreOpen, setMoreOpen] = useState(false);

  // Calendar view states
  const [monthOffset, setMonthOffset] = useState(0);
  const [inspectedDate, setInspectedDate] = useState(state.todayDate);
  const [symptomFilter, setSymptomFilter] = useState<string>('all');
  const [fastTrackOpen, setFastTrackOpen] = useState(false);
  const [fastTrackSelection, setFastTrackSelection] = useState<string[]>([]);

  // Track view states
  const [trackDate, setTrackDate] = useState(state.todayDate);
  const [ruleHelperMsg, setRuleHelperMsg] = useState<string | null>(null);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [learnMoreCat, setLearnMoreCat] = useState<TrackingCategoryDef | null>(null);
  const [newTagInput, setNewTagInput] = useState('');
  const [tagToDelete, setTagToDelete] = useState<{ tagId: string; label: string } | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [bbtDraft, setBbtDraft] = useState('');

  // Analysis view states
  const [openCycleMenuId, setOpenCycleMenuId] = useState<string | null>(null);

  // Content view states
  const [articleQuery, setArticleQuery] = useState('');

  const currentTrackLog: DailyCycleLog = useMemo(
    () => cycleState.dailyLogs[trackDate] ?? createEmptyDailyLog(trackDate),
    [cycleState.dailyLogs, trackDate]
  );

  useEffect(() => {
    setNoteDraft(currentTrackLog.dailyNote);
    setBbtDraft(currentTrackLog.bbtCelsius !== null ? String(currentTrackLog.bbtCelsius) : '');
  }, [trackDate, currentTrackLog.dailyNote, currentTrackLog.bbtCelsius]);

  const [baseYear, baseMonth] = useMemo(() => {
    const [y, m] = state.todayDate.split('-').map(Number);
    return [y, m - 1];
  }, [state.todayDate]);

  const calendarMonth = useMemo(() => {
    const dt = new Date(Date.UTC(baseYear, baseMonth + monthOffset, 1));
    return getMonthDays(dt.getUTCFullYear(), dt.getUTCMonth());
  }, [baseYear, baseMonth, monthOffset]);

  const visualMap = useMemo(() => {
    if (!cycleEngine || calendarMonth.dates.length === 0) return {};
    return buildDayVisualMap(
      cycleState,
      cycleEngine,
      calendarMonth.dates[0],
      calendarMonth.dates[calendarMonth.dates.length - 1]
    );
  }, [cycleState, cycleEngine, calendarMonth.dates]);

  const allSymptomFilterOptions = useMemo(() => {
    const opts: Array<{ value: string; label: string }> = [
      { value: 'all', label: 'All Days (No Filter)' },
      { value: 'period:any', label: 'Any Bleeding / Period Flow' },
      { value: 'pms:true', label: 'PMS Logged' },
    ];
    for (const cat of TRACKING_CATEGORIES) {
      if (cat.id === 'period') continue;
      opts.push({ value: `cat:${cat.id}`, label: `Category: ${cat.label}` });
    }
    return opts;
  }, []);

  const trackStripDates = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => addDaysIso(trackDate, i - 3));
  }, [trackDate]);

  const flowChartData = useMemo(() => {
    return Object.keys(cycleState.dailyLogs)
      .sort()
      .slice(-14)
      .map((date) => ({
        date: date.slice(5),
        flow: FLOW_TO_NUM[cycleState.dailyLogs[date].bleedingFlow],
      }));
  }, [cycleState.dailyLogs]);

  const crampsChartData = useMemo(() => {
    if (!cycleEngine) return [];
    return cycleEngine.cycles.slice(-6).map((c, idx) => {
      const end = c.endDate ?? state.todayDate;
      const crampDays = Object.keys(cycleState.dailyLogs).filter(
        (d) =>
          d >= c.startDate &&
          d <= end &&
          (cycleState.dailyLogs[d]?.selectedSymptoms.pain ?? []).includes('Cramps')
      ).length;
      return {
        label: `C${idx + 1} (${c.startDate.slice(5)})`,
        cramps: crampDays,
      };
    });
  }, [cycleEngine, cycleState.dailyLogs, state.todayDate]);

  const bbtChartData = useMemo(() => {
    return Object.keys(cycleState.dailyLogs)
      .sort()
      .map((date) => ({
        date: date.slice(5),
        bbt: cycleState.dailyLogs[date].bbtCelsius,
      }))
      .filter((x): x is { date: string; bbt: number } => x.bbt !== null)
      .slice(-20);
  }, [cycleState.dailyLogs]);

  const filteredArticles = useMemo(() => {
    const q = articleQuery.trim().toLowerCase();
    if (!q) return SCIENCE_ARTICLES;
    return SCIENCE_ARTICLES.filter(
      (a) =>
        a.title.toLowerCase().includes(q) ||
        a.category.toLowerCase().includes(q) ||
        a.summary.toLowerCase().includes(q) ||
        a.takeaways.some((t) => t.toLowerCase().includes(q))
    );
  }, [articleQuery]);

  if (!cycleTrackingEnabled || !cycleEngine) {
    return null;
  }

  if (!cycleState.settings.onboardingCompleted) {
    return (
      <div className="space-y-4">
        <CycleOnboarding todayDate={state.todayDate} onComplete={completeCycleOnboarding} />
      </div>
    );
  }

  const { settings } = cycleState;
  const isConceive = settings.activeMode === 'conceive';
  const isPregnancy = settings.activeMode === 'pregnancy';
  const isDiscreet = settings.discreetMode;
  const fertileColor = isConceive ? '#0284C7' : '#0D9488';
  const fertileBgClass = isConceive
    ? 'bg-sky-100 dark:bg-sky-900/60 text-sky-900 dark:text-sky-100 border-sky-400 dark:border-sky-600'
    : 'bg-teal-100 dark:bg-teal-900/60 text-teal-900 dark:text-teal-100 border-teal-400 dark:border-teal-600';

  const upcomingPred =
    cycleEngine.predictions.find((p) => p.predictedPeriodStart >= state.todayDate) ??
    cycleEngine.predictions[1] ??
    cycleEngine.predictions[0];

  const currentPred = cycleEngine.predictions[0];
  const daysUntilNextPeriod = upcomingPred
    ? diffDaysIso(upcomingPred.predictedPeriodStart, state.todayDate)
    : null;

  const openTrackForDate = (date: string) => {
    setTrackDate(date);
    setRuleHelperMsg(null);
    setActiveTab('track');
  };

  const commitDailyLog = (nextLog: DailyCycleLog) => {
    const res = saveCycleDailyLog(nextLog);
    setRuleHelperMsg(res.helperMessage);
  };

  const handleBleedingSelect = (flow: BleedingFlow) => {
    const nextFlow: BleedingFlow = currentTrackLog.bleedingFlow === flow ? 'none' : flow;
    commitDailyLog({
      ...currentTrackLog,
      bleedingFlow: nextFlow,
    });
  };

  const handleSymptomToggle = (cat: TrackingCategoryDef, optionId: string) => {
    const prevList = currentTrackLog.selectedSymptoms[cat.id] ?? [];
    let nextList: string[];
    if (cat.selectionMode === 'single') {
      nextList = prevList.includes(optionId) ? [] : [optionId];
    } else {
      nextList = prevList.includes(optionId)
        ? prevList.filter((x) => x !== optionId)
        : [...prevList, optionId];
    }
    const nextSymptoms = {
      ...currentTrackLog.selectedSymptoms,
      [cat.id]: nextList,
    };
    const feelings = nextSymptoms.feelings ?? [];
    commitDailyLog({
      ...currentTrackLog,
      selectedSymptoms: nextSymptoms,
      pmsLogged: feelings.includes('PMS'),
    });
  };

  const handleSaveNoteAndBbt = () => {
    const parsedBbt = bbtDraft.trim() ? Number(bbtDraft) : null;
    const validBbt =
      parsedBbt !== null && Number.isFinite(parsedBbt) && parsedBbt >= 34 && parsedBbt <= 42
        ? Number(parsedBbt.toFixed(2))
        : null;
    commitDailyLog({
      ...currentTrackLog,
      dailyNote: noteDraft,
      bbtCelsius: validBbt,
    });
  };

  const handleStartCycleToday = () => {
    const existing = cycleState.dailyLogs[state.todayDate] ?? createEmptyDailyLog(state.todayDate);
    commitDailyLog({
      ...existing,
      cycleStartMarker: true,
    });
    showToast(`Started new cycle on ${state.todayDate}`, 'success');
  };

  const handleMoveCategory = (index: number, delta: -1 | 1) => {
    const list = [...settings.enabledCategories];
    const target = index + delta;
    if (target < 0 || target >= list.length) return;
    const [moved] = list.splice(index, 1);
    list.splice(target, 0, moved);
    updateCycleSettings({ enabledCategories: list });
  };

  const handleToggleCategoryEnabled = (id: string) => {
    if (id === 'period' && settings.activeMode === 'period_tracking') return;
    const list = settings.enabledCategories.map((c) =>
      c.id === id ? { ...c, enabled: !c.enabled } : c
    );
    updateCycleSettings({ enabledCategories: list });
  };

  const doesDateMatchFilter = (date: string): boolean => {
    if (symptomFilter === 'all') return false;
    const log = cycleState.dailyLogs[date];
    if (!log) return false;
    if (symptomFilter === 'period:any') return log.bleedingFlow !== 'none';
    if (symptomFilter === 'pms:true') return log.pmsLogged;
    if (symptomFilter.startsWith('cat:')) {
      const catId = symptomFilter.slice(4);
      return (log.selectedSymptoms[catId]?.length ?? 0) > 0;
    }
    return false;
  };

  const inspectedVisual = visualMap[inspectedDate];
  const inspectedLog = cycleState.dailyLogs[inspectedDate];

  return (
    <div className="space-y-5">
      {/* Header with Cycle Logo + Mode badge + Top-right More Menu (=) */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <CycleLogoMark size={38} />
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl sm:text-3xl font-extrabold text-[var(--text-primary)] tracking-tight">
                {isDiscreet ? 'Wellness Rhythm' : 'Period & Cycle Tracker'}
              </h1>
              <span className="px-2.5 py-0.5 rounded-full bg-rose-50 dark:bg-rose-950/60 text-[#BE123C] dark:text-rose-300 border border-rose-200 dark:border-rose-800 text-xs font-bold">
                {CYCLE_MODE_LABELS[settings.activeMode].title}
              </span>
            </div>
            <p className="text-xs sm:text-sm text-[var(--text-secondary)] mt-0.5">
              Science-calibrated predictions · Female profile isolated storage
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setFastTrackSelection(
                Object.keys(cycleState.dailyLogs).filter(
                  (d) => cycleState.dailyLogs[d].bleedingFlow !== 'none'
                )
              );
              setFastTrackOpen(true);
            }}
            className="h-10 px-3.5 rounded-full bg-[var(--card-surface)] border border-[var(--border-subtle)] text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--surface-inset)] flex items-center gap-1.5 cursor-pointer"
          >
            <AppIcon name="calendar" size={14} className="text-[#BE123C]" />
            <span>Fast Track</span>
          </button>

          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            data-testid="cycle-more-menu-btn"
            aria-label="Open Cycle More Menu"
            className="h-10 px-4 rounded-full bg-[#BE123C] hover:bg-[#9F1239] text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
          >
            <AppIcon name="menu" size={16} />
            <span>More (=)</span>
          </button>
        </div>
      </header>

      {/* Shared Read-Only Connect Banner */}
      {cycleState.connect.viewingOwnerName && (
        <div className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 flex flex-wrap items-center justify-between gap-2 text-xs text-emerald-950 dark:text-emerald-200">
          <div className="flex items-center gap-2">
            <AppIcon name="share2" size={15} className="text-emerald-700 dark:text-emerald-300" />
            <span>
              <strong>Cycle Connect Read-Only Preview:</strong> Viewing calendar predictions shared under{' '}
              <code>{cycleState.connect.viewingCode}</code> ({cycleState.connect.viewingOwnerName}).
            </span>
          </div>
          <button
            type="button"
            onClick={() => updateConnectState({ viewingCode: null, viewingOwnerName: null })}
            className="px-3 py-1 rounded-full bg-[var(--card-surface)] border border-emerald-300 dark:border-emerald-700 text-emerald-900 dark:text-emerald-200 font-bold cursor-pointer"
          >
            Return to My Cycle
          </button>
        </div>
      )}

      {/* 5 Clue Navigation Surfaces */}
      <nav
        aria-label="Cycle Tracker Views"
        className="flex gap-1.5 overflow-x-auto bg-[var(--card-surface)] p-1.5 rounded-full border border-[var(--border-subtle)]"
      >
        {(
          [
            { id: 'cycle', label: 'Cycle View', icon: 'droplet' },
            { id: 'calendar', label: 'Calendar View', icon: 'calendar' },
            { id: 'track', label: 'Track', icon: 'plus' },
            { id: 'analysis', label: 'Analysis', icon: 'barChart' },
            { id: 'content', label: 'Content', icon: 'bookOpen' },
          ] as const
        ).map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              data-testid={`cycle-tab-${tab.id}`}
              className={`flex-1 min-w-[105px] h-10 px-3.5 rounded-full text-xs font-bold flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors ${
                active
                  ? 'bg-[#BE123C] text-white shadow-sm'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-inset)]'
              }`}
            >
              <AppIcon name={tab.icon} size={14} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>

      {/* ==================== 1. CYCLE VIEW ==================== */}
      {activeTab === 'cycle' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            {/* Cycle Wheel Card */}
            <section className="md:col-span-5 fitsync-card p-6 flex flex-col items-center justify-center text-center">
              <div className="relative w-48 h-48 rounded-full border-[10px] border-rose-100 dark:border-rose-900/50 flex flex-col items-center justify-center bg-gradient-to-b from-[var(--card-surface)] to-rose-50/40 dark:to-rose-950/30 shadow-inner">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#BE123C] dark:text-rose-300">
                  {isDiscreet ? 'Wellness Rhythm' : 'Current Cycle'}
                </span>
                <span className="text-4xl font-extrabold text-[var(--text-primary)] tabular-nums mt-1">
                  {cycleEngine.currentCycleDay ? `Day ${cycleEngine.currentCycleDay}` : 'Ready'}
                </span>
                <span className="text-xs font-semibold text-[var(--text-secondary)] mt-1 px-4">
                  {isDiscreet
                    ? 'Private phase summary active'
                    : cycleEngine.currentPhase}
                </span>
              </div>

              <div className="mt-5 flex flex-wrap justify-center gap-2">
                <button
                  type="button"
                  onClick={() => openTrackForDate(state.todayDate)}
                  className="h-10 px-5 rounded-full bg-[#BE123C] hover:bg-[#9F1239] text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <AppIcon name="plus" size={15} />
                  <span>Log Today ({formatShortDate(state.todayDate)})</span>
                </button>

                {settings.activeMode === 'tracking_without_period' && (
                  <button
                    type="button"
                    onClick={handleStartCycleToday}
                    className="h-10 px-4 rounded-full bg-[var(--primary)] text-white text-xs font-bold cursor-pointer"
                  >
                    Start New Cycle Today
                  </button>
                )}
              </div>
            </section>

            {/* Forecast Breakdown Card */}
            <section className="md:col-span-7 fitsync-card p-6 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-base font-extrabold text-[var(--text-primary)]">
                  {isDiscreet ? 'Upcoming Check-In Windows' : 'Upcoming Cycle Predictions'}
                </h2>
                <span className="text-xs font-bold text-[var(--text-secondary)] tabular-nums">
                  {cycleEngine.effectiveCycleLength}d cycle · {cycleEngine.effectivePeriodLength}d bleed
                </span>
              </div>

              {isPregnancy ? (
                <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-xs text-rose-950 dark:text-rose-200">
                  <strong>Pregnancy Mode Active:</strong> Menstrual and ovulation forecasts are paused. Use the{' '}
                  <strong>Track</strong> tab to log energy, sleep, cravings, and daily notes.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="p-4 rounded-2xl bg-rose-50/70 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-[#BE123C] dark:text-rose-300">
                      {isDiscreet ? 'Next Check-In' : 'Next Predicted Period'}
                    </span>
                    <p className="text-lg font-extrabold text-[var(--text-primary)] mt-1 tabular-nums">
                      {upcomingPred ? formatShortDate(upcomingPred.predictedPeriodStart) : '—'}
                    </p>
                    <p className="text-xs text-[var(--text-secondary)] mt-0.5 tabular-nums">
                      {daysUntilNextPeriod !== null
                        ? daysUntilNextPeriod === 0
                          ? 'Due today'
                          : `In ${daysUntilNextPeriod} days`
                        : 'Log a bleed day to calibrate'}
                    </p>
                  </div>

                  <div
                    className={`p-4 rounded-2xl border ${
                      settings.showFertileWindow
                        ? isConceive
                          ? 'bg-sky-50 dark:bg-sky-950/40 border-sky-200 dark:border-sky-800'
                          : 'bg-teal-50 dark:bg-teal-950/40 border-teal-200 dark:border-teal-800'
                        : 'bg-[var(--surface-inset)] border-[var(--border-subtle)]'
                    }`}
                  >
                    <span
                      className="text-[11px] font-bold uppercase tracking-wider"
                      style={{ color: settings.showFertileWindow ? fertileColor : 'var(--text-secondary)' }}
                    >
                      {isDiscreet
                        ? 'Estimated Peak Window'
                        : settings.showFertileWindow
                          ? '7-Day Fertile Window'
                          : 'Fertile Window Hidden'}
                    </span>
                    <p className="text-lg font-extrabold text-[var(--text-primary)] mt-1 tabular-nums">
                      {settings.showFertileWindow && currentPred
                        ? `${formatShortDate(currentPred.fertileWindowStart)} – ${formatShortDate(currentPred.fertileWindowEnd)}`
                        : 'Hidden in Settings'}
                    </p>
                    <p className="text-xs text-[var(--text-secondary)] mt-0.5 tabular-nums">
                      {settings.showOvulation && currentPred
                        ? `Est. Ovulation: ${formatShortDate(currentPred.predictedOvulationDate)} (Luteal ${cycleEngine.observedLutealLength}d)`
                        : 'Ovulation indicator disabled'}
                    </p>
                  </div>
                </div>
              )}

              {/* PMS Window Status */}
              <div className="p-3.5 rounded-2xl bg-[var(--surface-inset)] flex flex-wrap items-center justify-between gap-2 text-xs">
                <div>
                  <span className="font-bold text-[var(--text-primary)]">Predicted PMS Clouds: </span>
                  {cycleEngine.pmsEnabled && currentPred?.predictedPmsStart ? (
                    <span className="text-[var(--text-secondary)] tabular-nums">
                      {formatShortDate(currentPred.predictedPmsStart)} –{' '}
                      {formatShortDate(currentPred.predictedPmsEnd!)} ({cycleEngine.pmsAvgDuration}d)
                    </span>
                  ) : (
                    <span className="text-[var(--text-secondary)]">
                      Inactive — log <strong>PMS</strong> in Feelings or set Typical PMS Days to enable.
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('calendar')}
                  className="text-[#BE123C] font-bold hover:underline cursor-pointer"
                >
                  Open Calendar →
                </button>
              </div>
            </section>
          </div>

          {/* Clue 7-Item Color Legend */}
          <section className="fitsync-card p-5 space-y-3">
            <h2 className="text-sm font-extrabold text-[var(--text-primary)]">
              Calendar Color & Symbol Legend
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
              <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-[var(--surface-inset)]">
                <span className="flex gap-1 shrink-0">
                  <span className="w-3 h-3 rounded-full bg-[#FDA4AF]" />
                  <span className="w-3 h-3 rounded-full bg-[#F43F5E]" />
                  <span className="w-3 h-3 rounded-full bg-[#BE123C]" />
                </span>
                <span className="font-semibold">Tracked flow (Light/Med/Heavy)</span>
              </div>

              <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-[var(--surface-inset)]">
                <span className="w-4 h-4 rounded-full bg-[#FBCFE8] border border-[#EC4899] shrink-0" />
                <span className="font-semibold">Predicted period (Pink)</span>
              </div>

              <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-[var(--surface-inset)]">
                <span className="w-4 h-4 rounded-full bg-[#9CA3AF] shrink-0" />
                <span className="font-semibold">Tracked spotting (Gray)</span>
              </div>

              <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-[var(--surface-inset)]">
                <span
                  className="w-4 h-4 rounded-full border-2 shrink-0"
                  style={{
                    borderColor: fertileColor,
                    backgroundColor: isConceive ? '#E0F2FE' : '#CCFBF1',
                  }}
                />
                <span className="font-semibold">
                  Fertile window ({isConceive ? 'Conceive Blue' : 'Teal'})
                </span>
              </div>

              <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-[var(--surface-inset)]">
                <span className="w-3.5 h-3.5 rounded-full bg-[#38BDF8] ring-2 ring-sky-200 shrink-0" />
                <span className="font-semibold">Est. ovulation (Light blue dot)</span>
              </div>

              <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-[var(--surface-inset)]">
                <AppIcon name="cloud" size={16} className="text-slate-500 fill-white shrink-0" />
                <span className="font-semibold">Predicted / tracked PMS (White cloud)</span>
              </div>

              <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-[var(--surface-inset)] sm:col-span-2">
                <span className="flex gap-1 shrink-0">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#F97316]" />
                  <span className="w-2.5 h-2.5 rounded-full bg-[#8B5CF6]" />
                  <span className="w-2.5 h-2.5 rounded-full bg-[#10B981]" />
                </span>
                <span className="font-semibold">Small colored dots = tracked daily symptoms</span>
              </div>
            </div>
          </section>

          {/* Non-Contraception Safety Notice */}
          <div className="rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 p-4 text-xs text-amber-950 dark:text-amber-200 flex items-start gap-2.5">
            <AppIcon name="alert" size={16} className="text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
            <p>
              <strong>Non-Contraception Notice:</strong> Predicted ovulation and fertile-window dates are statistical estimates for cycle literacy only and{' '}
              <strong>must never</strong> be used to prevent pregnancy.
            </p>
          </div>
        </div>
      )}

      {/* ==================== 2. CALENDAR VIEW ==================== */}
      {activeTab === 'calendar' && (
        <div className="space-y-4">
          <section className="fitsync-card p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setMonthOffset((m) => Math.max(-12, m - 1))}
                  aria-label="Previous Month"
                  className="w-9 h-9 rounded-full bg-[var(--surface-inset)] flex items-center justify-center cursor-pointer hover:bg-[var(--border-subtle)]"
                >
                  <AppIcon name="chevronLeft" size={16} />
                </button>
                <h2 className="text-base sm:text-lg font-extrabold text-[var(--text-primary)] min-w-[160px] text-center">
                  {calendarMonth.label}
                </h2>
                <button
                  type="button"
                  onClick={() => setMonthOffset((m) => Math.min(12, m + 1))}
                  aria-label="Next Month"
                  className="w-9 h-9 rounded-full bg-[var(--surface-inset)] flex items-center justify-center cursor-pointer hover:bg-[var(--border-subtle)]"
                >
                  <AppIcon name="chevronRight" size={16} />
                </button>
                {monthOffset !== 0 && (
                  <button
                    type="button"
                    onClick={() => setMonthOffset(0)}
                    className="px-3 py-1 rounded-full bg-rose-50 dark:bg-rose-950/60 text-[#BE123C] dark:text-rose-300 text-xs font-bold cursor-pointer"
                  >
                    Today
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <label htmlFor="calendar-symptom-filter" className="text-xs font-bold text-[var(--text-secondary)]">
                  Filter:
                </label>
                <select
                  id="calendar-symptom-filter"
                  value={symptomFilter}
                  onChange={(e) => setSymptomFilter(e.target.value)}
                  className="h-9 px-3 rounded-full bg-[var(--surface-inset)] border border-[var(--border-subtle)] text-xs font-semibold"
                >
                  {allSymptomFilterOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <p className="text-[11px] text-[var(--text-secondary)]">
              Tip: Click any date to inspect, or <strong>double-click / double-tap</strong> a date to jump straight into Track.
            </p>

            {/* Weekday Header */}
            <div className="grid grid-cols-7 gap-1.5 text-center text-[11px] font-bold text-[var(--text-secondary)]">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
                <div key={d} className="py-1">
                  {d}
                </div>
              ))}
            </div>

            {/* Calendar Grid */}
            <div className="grid grid-cols-7 gap-1.5">
              {Array.from({ length: calendarMonth.firstWeekday }).map((_, idx) => (
                <div key={`pad-${idx}`} className="h-16 sm:h-20 rounded-xl bg-[var(--surface-inset)]/30" />
              ))}

              {calendarMonth.dates.map((iso) => {
                const v = visualMap[iso];
                const dayNum = Number(iso.slice(8));
                const isToday = iso === state.todayDate;
                const isInspected = iso === inspectedDate;
                const matchesFilter = doesDateMatchFilter(iso);

                // Visual classes according to Clue color hierarchy & overlap support
                let bgStyle = 'bg-[var(--surface-inset)] text-[var(--text-primary)]';
                if (v?.loggedFlow === 'heavy') {
                  bgStyle = 'bg-[#BE123C] text-white';
                } else if (v?.loggedFlow === 'medium') {
                  bgStyle = 'bg-[#F43F5E] text-white';
                } else if (v?.loggedFlow === 'light') {
                  bgStyle = 'bg-[#FDA4AF] text-rose-950';
                } else if (v?.loggedFlow === 'spotting') {
                  bgStyle = 'bg-slate-300 dark:bg-slate-600 text-slate-900 dark:text-white';
                } else if (v?.isPredictedPeriod) {
                  bgStyle = 'bg-[#FBCFE8] dark:bg-pink-900/75 text-rose-950 dark:text-pink-100 border border-pink-400 dark:border-pink-600';
                } else if (v?.isFertileWindow) {
                  bgStyle = fertileBgClass;
                }

                // Overlap ring when BOTH period (tracked or predicted) AND fertile window occur on same day
                const overlapClass = v?.isOverlapPeriodAndFertile
                  ? isConceive
                    ? 'ring-2 ring-[#0284C7] ring-offset-1'
                    : 'ring-2 ring-[#0D9488] ring-offset-1'
                  : '';

                return (
                  <button
                    key={iso}
                    type="button"
                    data-testid={`cal-day-${iso}`}
                    onClick={() => setInspectedDate(iso)}
                    onDoubleClick={() => openTrackForDate(iso)}
                    className={`relative h-16 sm:h-20 p-1.5 rounded-xl border text-left flex flex-col justify-between transition-all cursor-pointer ${bgStyle} ${overlapClass} ${
                      isInspected ? 'border-2 border-[var(--text-primary)]' : 'border-transparent'
                    } ${matchesFilter ? 'ring-2 ring-amber-400' : ''}`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span
                        className={`text-xs font-extrabold tabular-nums ${
                          isToday ? 'underline decoration-2' : ''
                        }`}
                      >
                        {dayNum}
                      </span>

                      <div className="flex items-center gap-0.5">
                        {v?.isOvulationDay && (
                          <span
                            title="Estimated Ovulation Day"
                            data-testid={`ovulation-dot-${iso}`}
                            className="w-2.5 h-2.5 rounded-full bg-[#38BDF8] ring-1 ring-white"
                          />
                        )}
                        {(v?.isTrackedPms || v?.isPredictedPms) && (
                          <span title="PMS Window" data-testid={`pms-cloud-${iso}`}>
                            <AppIcon
                              name="cloud"
                              size={12}
                              className="text-slate-600 fill-white drop-shadow-xs"
                            />
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Bottom small colored symptom dots */}
                    <div className="flex items-center gap-0.5 flex-wrap">
                      {v?.symptomColors.map((color, idx) => (
                        <span
                          key={`${iso}-dot-${idx}`}
                          className="w-2 h-2 rounded-full border border-white/80"
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Inspected Day Summary Bar */}
            <div className="p-4 rounded-2xl bg-[var(--surface-inset)] flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <p className="text-xs font-extrabold text-[var(--text-primary)]">
                  Selected Date: {inspectedDate}
                </p>
                <div className="flex flex-wrap gap-1.5 text-[11px]">
                  {inspectedLog?.bleedingFlow && inspectedLog.bleedingFlow !== 'none' && (
                    <span className="px-2 py-0.5 rounded-full bg-rose-100 text-[#BE123C] font-bold capitalize">
                      Flow: {inspectedLog.bleedingFlow}
                    </span>
                  )}
                  {inspectedVisual?.isPredictedPeriod && (
                    <span className="px-2 py-0.5 rounded-full bg-pink-100 text-pink-900 font-bold">
                      Predicted Period
                    </span>
                  )}
                  {inspectedVisual?.isFertileWindow && (
                    <span
                      className="px-2 py-0.5 rounded-full font-bold"
                      style={{
                        backgroundColor: isConceive ? '#E0F2FE' : '#CCFBF1',
                        color: fertileColor,
                      }}
                    >
                      Fertile Window
                    </span>
                  )}
                  {inspectedVisual?.isOvulationDay && (
                    <span className="px-2 py-0.5 rounded-full bg-sky-100 text-sky-900 font-bold">
                      Est. Ovulation
                    </span>
                  )}
                  {(inspectedVisual?.isTrackedPms || inspectedVisual?.isPredictedPms) && (
                    <span className="px-2 py-0.5 rounded-full bg-white text-slate-700 border border-slate-200 font-bold">
                      PMS Cloud
                    </span>
                  )}
                  {inspectedVisual?.isOverlapPeriodAndFertile && (
                    <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 font-bold">
                      Short-Cycle Overlap (Period + Fertile)
                    </span>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={() => openTrackForDate(inspectedDate)}
                className="h-9 px-4 rounded-full bg-[#BE123C] text-white text-xs font-bold cursor-pointer"
              >
                Track This Date →
              </button>
            </div>
          </section>
        </div>
      )}

      {/* ==================== 3. TRACK VIEW ==================== */}
      {activeTab === 'track' && (
        <div className="space-y-4">
          {/* Date Strip + Customize Button */}
          <section className="fitsync-card p-4 sm:p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-extrabold text-[var(--text-primary)]">
                  Track Daily Signals · {trackDate}
                </h2>
                <p className="text-xs text-[var(--text-secondary)]">
                  Scroll days or jump to any date to log flow, mood, tests, and notes
                </p>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={trackDate}
                  onChange={(e) => {
                    if (e.target.value) {
                      setTrackDate(e.target.value);
                      setRuleHelperMsg(null);
                    }
                  }}
                  aria-label="Jump to track date"
                  className="h-9 px-3 rounded-full border border-[var(--border-subtle)] bg-[var(--surface-inset)] text-xs font-bold text-[var(--text-primary)]"
                />
                <button
                  type="button"
                  onClick={() => setCustomizeOpen(true)}
                  className="h-9 px-3.5 rounded-full bg-[var(--surface-inset)] hover:bg-[var(--border-subtle)] text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <AppIcon name="sliders" size={14} />
                  <span>Customize</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-1.5">
              {trackStripDates.map((iso) => {
                const active = iso === trackDate;
                const hasLog = Boolean(cycleState.dailyLogs[iso]);
                const dt = new Date(`${iso}T12:00:00Z`);
                const wk = dt.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
                return (
                  <button
                    key={iso}
                    type="button"
                    onClick={() => {
                      setTrackDate(iso);
                      setRuleHelperMsg(null);
                    }}
                      className={`py-2 rounded-2xl text-center transition-colors cursor-pointer ${
                        active
                          ? 'bg-[#BE123C] text-white'
                          : 'bg-[var(--surface-inset)] text-[var(--text-primary)] hover:bg-rose-50 dark:hover:bg-rose-950/40'
                      }`}
                    >
                      <span className="text-[10px] font-bold block opacity-80">{wk}</span>
                      <span className="text-xs font-extrabold tabular-nums">{Number(iso.slice(8))}</span>
                      {hasLog && (
                        <span
                          className={`block w-1.5 h-1.5 rounded-full mx-auto mt-0.5 ${
                            active ? 'bg-white' : 'bg-[#BE123C]'
                          }`}
                        />
                      )}
                    </button>
                  );
                })}
              </div>

              {ruleHelperMsg && (
                <div
                  role="alert"
                  data-testid="ten-day-rule-alert"
                  className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 text-xs text-amber-950 dark:text-amber-200 flex items-start justify-between gap-3"
                >
                  <div className="flex items-start gap-2">
                    <AppIcon name="info" size={16} className="text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
                    <span>{ruleHelperMsg}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setRuleHelperMsg(null)}
                    className="font-bold text-amber-800 dark:text-amber-300 cursor-pointer"
                  >
                    ×
                  </button>
                </div>
              )}
          </section>

          {/* Enabled Tracking Categories */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {settings.enabledCategories
              .filter((pref) => pref.enabled)
              .map((pref) => {
                const cat = CATEGORY_MAP.get(pref.id);
                if (!cat) return null;

                if (cat.id === 'period') {
                  return (
                    <section key={cat.id} className="fitsync-card p-5 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: cat.dotColor }}
                          />
                          <h3 className="text-sm font-extrabold text-[var(--text-primary)]">
                            {cat.label}
                          </h3>
                        </div>
                        <button
                          type="button"
                          onClick={() => setLearnMoreCat(cat)}
                          className="text-xs font-bold text-[#BE123C] hover:underline flex items-center gap-1 cursor-pointer"
                        >
                          <AppIcon name="info" size={13} />
                          <span>Learn more</span>
                        </button>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {cat.options.map((opt) => {
                          const flowId = opt.id as BleedingFlow;
                          const active = currentTrackLog.bleedingFlow === flowId;
                          return (
                            <button
                              key={opt.id}
                              type="button"
                              data-testid={`track-flow-${opt.id}`}
                              onClick={() => handleBleedingSelect(flowId)}
                              className={`h-11 rounded-2xl text-xs font-bold border transition-colors cursor-pointer ${
                                active
                                  ? 'bg-[#BE123C] text-white border-[#BE123C]'
                                  : 'bg-[var(--surface-inset)] text-[var(--text-primary)] border-transparent hover:border-rose-300'
                              }`}
                            >
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                      <p className="text-[11px] text-[var(--text-secondary)]">
                        Light, Medium, or Heavy starts/extends a period; Spotting never starts a new cycle.
                      </p>
                    </section>
                  );
                }

                const selected = currentTrackLog.selectedSymptoms[cat.id] ?? [];
                return (
                  <section key={cat.id} className="fitsync-card p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: cat.dotColor }}
                        />
                        <h3 className="text-sm font-extrabold text-[var(--text-primary)]">
                          {cat.label}
                        </h3>
                      </div>
                      <button
                        type="button"
                        onClick={() => setLearnMoreCat(cat)}
                        className="text-xs font-bold text-[#BE123C] hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <AppIcon name="info" size={13} />
                        <span>Learn more</span>
                      </button>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {cat.options.map((opt) => {
                        const active = selected.includes(opt.id);
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            data-testid={`track-${cat.id}-${opt.id}`}
                            onClick={() => handleSymptomToggle(cat, opt.id)}
                            className={`px-3 py-2 rounded-2xl text-xs font-bold border transition-colors cursor-pointer ${
                              active
                                ? 'bg-[var(--primary)] text-white border-[var(--primary)]'
                                : 'bg-[var(--surface-inset)] text-[var(--text-primary)] border-transparent hover:border-[var(--border-subtle)]'
                            }`}
                          >
                            {opt.label}
                            {opt.badge && (
                              <span
                                className={`ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full ${
                                  active ? 'bg-white/20 text-white' : 'bg-rose-100 text-[#BE123C]'
                                }`}
                              >
                                {opt.badge}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </section>
                );
              })}

            {/* Tests (Ovulation LH + BBT) & Manual Cycle Start */}
            <section className="fitsync-card p-5 space-y-3">
              <h3 className="text-sm font-extrabold text-[var(--text-primary)]">
                Ovulation Test (LH), BBT & Cycle Start
              </h3>

              <div>
                <span className="text-xs font-bold text-[var(--text-secondary)] block mb-1.5">
                  Ovulation Test (Positive tests refine luteal predictions; Negative tests ignored)
                </span>
                <div className="grid grid-cols-3 gap-2">
                  {(['none', 'positive', 'negative'] as const).map((res) => {
                    const active = currentTrackLog.ovulationTest === res;
                    return (
                      <button
                        key={res}
                        type="button"
                        onClick={() =>
                          commitDailyLog({ ...currentTrackLog, ovulationTest: res })
                        }
                        className={`h-10 rounded-2xl text-xs font-bold capitalize cursor-pointer ${
                          active
                            ? 'bg-sky-600 text-white'
                            : 'bg-[var(--surface-inset)] text-[var(--text-primary)]'
                        }`}
                      >
                        {res}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label
                    htmlFor="track-bbt-input"
                    className="text-xs font-bold text-[var(--text-secondary)] block"
                  >
                    Basal Body Temp (BBT °C)
                  </label>
                  <input
                    id="track-bbt-input"
                    type="text"
                    inputMode="decimal"
                    maxLength={5}
                    placeholder="e.g. 36.65"
                    value={bbtDraft}
                    onChange={(e) => {
                      const clean = e.target.value
                        .replace(/[^0-9.]/g, '')
                        .replace(/(\..*)\./g, '$1');
                      setBbtDraft(clean);
                    }}
                    className="mt-1 w-full h-10 px-3 rounded-xl bg-[var(--surface-inset)] border border-[var(--border-subtle)] text-xs font-bold text-[var(--text-primary)] tabular-nums focus:outline-none focus:border-[#BE123C]"
                  />
                </div>

                <div className="flex items-end">
                  <label className="w-full h-10 px-3 rounded-xl bg-[var(--surface-inset)] flex items-center justify-between text-xs font-bold cursor-pointer">
                    <span>Manual Cycle Start Marker</span>
                    <input
                      type="checkbox"
                      checked={currentTrackLog.cycleStartMarker}
                      onChange={(e) =>
                        commitDailyLog({
                          ...currentTrackLog,
                          cycleStartMarker: e.target.checked,
                        })
                      }
                      className="w-4 h-4 accent-[#BE123C]"
                    />
                  </label>
                </div>
              </div>
            </section>

            {/* My Tags + Daily Note */}
            <section className="fitsync-card p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-extrabold text-[var(--text-primary)]">
                  My Tags & Daily Note
                </h3>
                <span className="text-[11px] text-[var(--text-secondary)]">
                  Tag deletion removes from all history
                </span>
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={newTagInput}
                  onChange={(e) => setNewTagInput(e.target.value)}
                  placeholder="Add custom tag (e.g. Iron pill, Travel)..."
                  className="flex-1 h-10 px-3.5 rounded-full bg-[var(--surface-inset)] text-xs"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (newTagInput.trim()) {
                      createCustomTag(newTagInput);
                      setNewTagInput('');
                    }
                  }}
                  className="h-10 px-4 rounded-full bg-[var(--primary)] text-white text-xs font-bold cursor-pointer"
                >
                  Add Tag
                </button>
              </div>

              {cycleState.customTags.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {cycleState.customTags.map((tag) => {
                    const active = currentTrackLog.customTagIds.includes(tag.tagId);
                    return (
                      <div
                        key={tag.tagId}
                        className={`inline-flex items-center gap-1 rounded-full pl-3 pr-1.5 py-1 text-xs font-bold border ${
                          active
                            ? 'bg-[#BE123C] text-white border-[#BE123C]'
                            : 'bg-[var(--surface-inset)] text-[var(--text-primary)] border-transparent'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            const nextTags = active
                              ? currentTrackLog.customTagIds.filter((id) => id !== tag.tagId)
                              : [...currentTrackLog.customTagIds, tag.tagId];
                            commitDailyLog({ ...currentTrackLog, customTagIds: nextTags });
                          }}
                          className="cursor-pointer"
                        >
                          #{tag.label}
                        </button>
                        <button
                          type="button"
                          aria-label={`Delete custom tag ${tag.label}`}
                          onClick={() => setTagToDelete(tag)}
                          className={`w-5 h-5 rounded-full flex items-center justify-center text-xs cursor-pointer ${
                            active ? 'hover:bg-white/20' : 'hover:bg-rose-200 text-rose-700'
                          }`}
                        >
                          ×
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              <div>
                <label
                  htmlFor="cycle-daily-note"
                  className="text-xs font-bold text-[var(--text-secondary)] block mb-1"
                >
                  Daily Note
                </label>
                <textarea
                  id="cycle-daily-note"
                  rows={2}
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  placeholder="Write private context about symptoms, training load, or sleep..."
                  className="w-full p-3 rounded-2xl bg-[var(--surface-inset)] text-xs resize-none"
                />
              </div>

              <button
                type="button"
                onClick={handleSaveNoteAndBbt}
                className="w-full h-10 rounded-full bg-[#BE123C] hover:bg-[#9F1239] text-white text-xs font-bold cursor-pointer"
              >
                Save BBT & Daily Note for {trackDate}
              </button>
            </section>
          </div>
        </div>
      )}

      {/* ==================== 4. ANALYSIS VIEW ==================== */}
      {activeTab === 'analysis' && (
        <div className="space-y-4">
          {/* 6-Cycle Valid Averages */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
            <div className="fitsync-card p-4">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                Avg Cycle (6 Cycles)
              </span>
              <p className="text-2xl font-extrabold text-[var(--text-primary)] tabular-nums mt-1">
                {cycleEngine.avgCycleLength6} days
              </p>
            </div>
            <div className="fitsync-card p-4">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                Avg Period (6 Cycles)
              </span>
              <p className="text-2xl font-extrabold text-[#BE123C] tabular-nums mt-1">
                {cycleEngine.avgPeriodLength6} days
              </p>
            </div>
            <div className="fitsync-card p-4">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                Observed Luteal
              </span>
              <p className="text-2xl font-extrabold text-sky-600 tabular-nums mt-1">
                {cycleEngine.observedLutealLength} days
              </p>
            </div>
            <div className="fitsync-card p-4">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                Valid Cycles Logged
              </span>
              <p className="text-2xl font-extrabold text-[var(--text-primary)] tabular-nums mt-1">
                {cycleEngine.cycles.filter((c) => !c.isExcludedFromCalculations).length}
              </p>
            </div>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <section className="fitsync-card p-5">
              <h3 className="text-sm font-extrabold text-[var(--text-primary)] mb-3">
                Period Flow Intensity (1=Spotting · 4=Heavy)
              </h3>
              <div className="h-52">
                {flowChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={flowChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                      <XAxis dataKey="date" tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} />
                      <YAxis domain={[0, 4]} ticks={[0, 1, 2, 3, 4]} tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} />
                      <Tooltip
                        contentStyle={{
                          borderRadius: '14px',
                          backgroundColor: 'var(--card-surface)',
                          borderColor: 'var(--border-subtle)',
                          color: 'var(--text-primary)',
                        }}
                      />
                      <Bar dataKey="flow" fill="#E11D48" radius={[6, 6, 0, 0]} isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-xs text-[var(--text-secondary)]">
                    Log flow days in Track to view flow intensity bars.
                  </div>
                )}
              </div>
            </section>

            <section className="fitsync-card p-5">
              <h3 className="text-sm font-extrabold text-[var(--text-primary)] mb-3">
                Cramps Days per Cycle & BBT Curve
              </h3>
              <div className="h-52">
                {bbtChartData.length >= 2 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={bbtChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                      <XAxis dataKey="date" tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} />
                      <YAxis domain={[35.5, 38.0]} tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} />
                      <Tooltip
                        contentStyle={{
                          borderRadius: '14px',
                          backgroundColor: 'var(--card-surface)',
                          borderColor: 'var(--border-subtle)',
                          color: 'var(--text-primary)',
                        }}
                      />
                      <Line type="monotone" dataKey="bbt" stroke="#0284C7" strokeWidth={2.5} dot isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : crampsChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={crampsChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                      <XAxis dataKey="label" tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} />
                      <YAxis allowDecimals={false} tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} />
                      <Tooltip
                        contentStyle={{
                          borderRadius: '14px',
                          backgroundColor: 'var(--card-surface)',
                          borderColor: 'var(--border-subtle)',
                          color: 'var(--text-primary)',
                        }}
                      />
                      <Bar dataKey="cramps" fill="#F97316" radius={[6, 6, 0, 0]} isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-xs text-[var(--text-secondary)]">
                    Log BBT or Pain cramps to chart cycle trends.
                  </div>
                )}
              </div>
            </section>
          </div>

          {/* Cycle History Horizontal Bars + Hide This Cycle */}
          <section className="fitsync-card p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-extrabold text-[var(--text-primary)]">
                  Cycle History
                </h3>
                <p className="text-xs text-[var(--text-secondary)]">
                  Red = Period days · Blue = Est. Ovulation · Green = PMS days · Hide atypical cycles via (...)
                </p>
              </div>
            </div>

            {cycleEngine.cycles.length === 0 ? (
              <p className="text-xs text-[var(--text-secondary)] py-4">
                No cycles detected yet. Mark period days in Track or Fast Track.
              </p>
            ) : (
              <div className="space-y-2.5">
                {[...cycleEngine.cycles].reverse().map((cycle) => {
                  const totalLen = cycle.cycleLength ?? cycleEngine.effectiveCycleLength;
                  const periodPct = Math.min(100, Math.round((cycle.periodLength / Math.max(1, totalLen)) * 100));
                  const ovuDayOffset = Math.max(1, totalLen - cycleEngine.observedLutealLength);
                  const ovuPct = Math.min(92, Math.round((ovuDayOffset / Math.max(1, totalLen)) * 100));
                  const pmsPct =
                    cycle.pmsDaysCount > 0
                      ? Math.min(25, Math.round((cycle.pmsDaysCount / Math.max(1, totalLen)) * 100))
                      : 0;
                  const menuOpen = openCycleMenuId === cycle.cycleId;

                  return (
                    <div
                      key={cycle.cycleId}
                      data-testid={`cycle-history-row-${cycle.cycleId}`}
                      className={`p-3.5 rounded-2xl border transition-opacity ${
                        cycle.isExcludedFromCalculations
                          ? 'bg-slate-100 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 opacity-55'
                          : 'bg-[var(--surface-inset)] border-transparent'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-extrabold text-[var(--text-primary)] tabular-nums">
                            {formatShortDate(cycle.startDate)}
                            {cycle.endDate ? ` – ${formatShortDate(cycle.endDate)}` : ' (Ongoing)'}
                          </span>
                          <span className="px-2 py-0.5 rounded-full bg-[var(--card-surface)] text-[11px] font-bold text-[var(--text-secondary)] tabular-nums">
                            {cycle.cycleLength ? `${cycle.cycleLength}d cycle` : 'Active'} · {cycle.periodLength}d flow
                          </span>
                          {cycle.isExcludedFromCalculations && (
                            <span className="px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-[10px] font-bold flex items-center gap-1">
                              <AppIcon name="eyeOff" size={11} />
                              <span>Hidden from averages</span>
                            </span>
                          )}
                        </div>

                        <div className="relative">
                          <button
                            type="button"
                            aria-label={`Cycle actions for ${cycle.startDate}`}
                            data-testid={`cycle-menu-${cycle.cycleId}`}
                            onClick={() =>
                              setOpenCycleMenuId(menuOpen ? null : cycle.cycleId)
                            }
                            className="w-8 h-8 rounded-full bg-[var(--card-surface)] flex items-center justify-center text-[var(--text-primary)] hover:bg-rose-50 dark:hover:bg-rose-950/50 cursor-pointer"
                          >
                            <AppIcon name="moreHorizontal" size={16} />
                          </button>

                          {menuOpen && (
                            <div className="absolute right-0 mt-1 w-48 rounded-2xl bg-[var(--card-surface)] shadow-xl border border-[var(--border-subtle)] p-1.5 z-20">
                              <button
                                type="button"
                                onClick={() => {
                                  toggleHideCycle(cycle.cycleId);
                                  setOpenCycleMenuId(null);
                                }}
                                className="w-full px-3 py-2 rounded-xl text-left text-xs font-bold hover:bg-rose-50 dark:hover:bg-rose-950/50 text-[var(--text-primary)] flex items-center gap-2 cursor-pointer"
                              >
                                <AppIcon name="eyeOff" size={14} className="text-[#BE123C]" />
                                <span>
                                  {cycle.isExcludedFromCalculations
                                    ? 'Include this cycle'
                                    : 'Hide this cycle'}
                                </span>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Horizontal Clue Bar */}
                      <div className="relative h-3 rounded-full bg-[var(--card-surface)] overflow-hidden border border-[var(--border-subtle)]">
                        {/* Red Period Days */}
                        <div
                          className="absolute inset-y-0 left-0 bg-[#E11D48] rounded-l-full"
                          style={{ width: `${periodPct}%` }}
                          title={`Period: ${cycle.periodLength} days`}
                        />
                        {/* Blue Ovulation Marker */}
                        <div
                          className="absolute inset-y-0 w-2 bg-[#38BDF8]"
                          style={{ left: `${ovuPct}%` }}
                          title={`Estimated Ovulation (~Day ${ovuDayOffset})`}
                        />
                        {/* Green PMS Days */}
                        {pmsPct > 0 && (
                          <div
                            className="absolute inset-y-0 right-0 bg-emerald-500 rounded-r-full"
                            style={{ width: `${pmsPct}%` }}
                            title={`Logged PMS: ${cycle.pmsDaysCount} days`}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}

      {/* ==================== 5. CONTENT TAB ==================== */}
      {activeTab === 'content' && (
        <div className="space-y-4">
          <div className="fitsync-card p-4 flex items-center gap-3">
            <AppIcon name="search" size={18} className="text-[var(--text-secondary)]" />
            <input
              type="text"
              value={articleQuery}
              onChange={(e) => setArticleQuery(e.target.value)}
              placeholder="Search cycle science (e.g. PCOS, endometriosis, ovulation, perimenopause, PMS)..."
              className="flex-1 text-sm bg-transparent outline-none"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredArticles.map((art) => (
              <article key={art.id} className="fitsync-card p-5 space-y-3">
                <div className="flex items-center justify-between gap-2 text-[11px] font-bold text-[#BE123C] dark:text-rose-300">
                  <span className="px-2.5 py-0.5 rounded-full bg-rose-50 dark:bg-rose-950/60">{art.category}</span>
                  <span className="text-[var(--text-secondary)]">{art.readTime}</span>
                </div>
                <h3 className="text-base font-extrabold text-[var(--text-primary)]">{art.title}</h3>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">{art.summary}</p>
                <ul className="space-y-1.5 pt-1 border-t border-[var(--border-subtle)]">
                  {art.takeaways.map((item) => (
                    <li key={item} className="text-xs text-[var(--text-primary)] flex items-start gap-2">
                      <AppIcon name="check" size={13} className="text-[#BE123C] shrink-0 mt-0.5" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </div>
      )}

      {/* ==================== MODALS & DRAWERS ==================== */}
      <CycleMoreDrawer
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        cycleState={cycleState}
        cycleEngine={cycleEngine}
        userName={state.profile.fullName}
        todayDate={state.todayDate}
        onUpdateSettings={updateCycleSettings}
        onUpdateReminders={updateReminders}
        onUpdateConnect={updateConnectState}
        onDeleteAll={deleteAllCycleHistory}
        onToast={showToast}
      />

      {/* Customize Categories Drawer */}
      {customizeOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-[var(--card-surface)] border border-[var(--border-subtle)] rounded-3xl max-w-md w-full max-h-[85vh] flex flex-col p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-extrabold text-[var(--text-primary)]">
                Customize Track Categories
              </h3>
              <button
                type="button"
                onClick={() => setCustomizeOpen(false)}
                className="w-8 h-8 rounded-full bg-[var(--surface-inset)] flex items-center justify-center cursor-pointer"
              >
                <AppIcon name="x" size={16} />
              </button>
            </div>

            <p className="text-xs text-[var(--text-secondary)]">
              Toggle categories on/off and reorder their display sequence in Track.
            </p>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {settings.enabledCategories.map((pref, idx) => {
                const cat = CATEGORY_MAP.get(pref.id);
                if (!cat) return null;
                return (
                  <div
                    key={pref.id}
                    className="p-3 rounded-2xl bg-[var(--surface-inset)] flex items-center justify-between gap-2"
                  >
                    <div className="flex items-center gap-2.5">
                      <AppIcon name="grip" size={15} className="text-[var(--text-secondary)]" />
                      <span
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: cat.dotColor }}
                      />
                      <span className="text-xs font-bold text-[var(--text-primary)]">{cat.label}</span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() => handleMoveCategory(idx, -1)}
                        className="px-2 py-1 rounded bg-[var(--card-surface)] text-[11px] font-bold disabled:opacity-40 cursor-pointer"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        disabled={idx === settings.enabledCategories.length - 1}
                        onClick={() => handleMoveCategory(idx, 1)}
                        className="px-2 py-1 rounded bg-[var(--card-surface)] text-[11px] font-bold disabled:opacity-40 cursor-pointer"
                      >
                        ↓
                      </button>
                      <input
                        type="checkbox"
                        checked={pref.enabled}
                        onChange={() => handleToggleCategoryEnabled(pref.id)}
                        className="ml-1 w-4 h-4 accent-[#BE123C]"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Learn More Guidance Modal */}
      {learnMoreCat && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-[var(--card-surface)] border border-[var(--border-subtle)] rounded-3xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-extrabold text-[var(--text-primary)]">
                About: {learnMoreCat.label}
              </h3>
              <button
                type="button"
                onClick={() => setLearnMoreCat(null)}
                className="w-8 h-8 rounded-full bg-[var(--surface-inset)] flex items-center justify-center cursor-pointer"
              >
                <AppIcon name="x" size={16} />
              </button>
            </div>
            <div className="space-y-3 text-xs">
              <div className="p-3 rounded-2xl bg-[var(--surface-inset)]">
                <span className="font-extrabold block text-[var(--text-primary)]">Typical Range</span>
                <p className="text-[var(--text-secondary)] mt-0.5">{learnMoreCat.learnMore.typicalRange}</p>
              </div>
              <div className="p-3 rounded-2xl bg-[var(--surface-inset)]">
                <span className="font-extrabold block text-[var(--text-primary)]">Why Track This</span>
                <p className="text-[var(--text-secondary)] mt-0.5">{learnMoreCat.learnMore.whyTrack}</p>
              </div>
              <div className="p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800">
                <span className="font-extrabold block text-[#BE123C] dark:text-rose-300">When to Consult a Doctor</span>
                <p className="text-rose-950 dark:text-rose-200 mt-0.5">{learnMoreCat.learnMore.whenToConsult}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cascade Delete Custom Tag Confirmation Modal */}
      {tagToDelete && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-[var(--card-surface)] border border-[var(--border-subtle)] rounded-3xl max-w-sm w-full p-6 space-y-4">
            <h3 className="text-base font-extrabold text-[var(--text-primary)]">
              Permanently Delete &ldquo;#{tagToDelete.label}&rdquo;?
            </h3>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              Deleting this custom tag removes it permanently from all historical and future cycle logs. This cannot be undone.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setTagToDelete(null)}
                className="flex-1 h-10 rounded-full bg-[var(--surface-inset)] text-xs font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  deleteCustomTag(tagToDelete.tagId);
                  setTagToDelete(null);
                }}
                className="flex-1 h-10 rounded-full bg-rose-600 text-white text-xs font-bold cursor-pointer"
              >
                Delete Everywhere
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fast Track Bulk Period Selector Modal */}
      {fastTrackOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-[var(--card-surface)] border border-[var(--border-subtle)] rounded-3xl max-w-xl w-full max-h-[85vh] flex flex-col p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-extrabold text-[var(--text-primary)]">
                Fast Track: Bulk Mark Period Dates
              </h3>
              <button
                type="button"
                onClick={() => setFastTrackOpen(false)}
                className="w-8 h-8 rounded-full bg-[var(--surface-inset)] flex items-center justify-center cursor-pointer"
              >
                <AppIcon name="x" size={16} />
              </button>
            </div>
            <p className="text-xs text-[var(--text-secondary)]">
              Tap past period days across recent months to immediately calibrate your 6-cycle average and 12-cycle predictions.
            </p>
            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {[2, 1, 0].map((backOffset) => {
                const dt = new Date(Date.UTC(baseYear, baseMonth - backOffset, 1));
                const mData = getMonthDays(dt.getUTCFullYear(), dt.getUTCMonth());
                return (
                  <div key={mData.label} className="p-3 rounded-2xl bg-[var(--surface-inset)]">
                    <p className="text-xs font-extrabold text-[var(--text-secondary)] mb-2">
                      {mData.label}
                    </p>
                    <div className="grid grid-cols-7 gap-1.5">
                      {mData.dates
                        .filter((d) => d <= state.todayDate)
                        .map((iso) => {
                          const active = fastTrackSelection.includes(iso);
                          return (
                            <button
                              key={iso}
                              type="button"
                              onClick={() =>
                                setFastTrackSelection((prev) =>
                                  prev.includes(iso)
                                    ? prev.filter((x) => x !== iso)
                                    : [...prev, iso].sort()
                                )
                              }
                              className={`h-8 rounded-xl text-xs font-bold tabular-nums cursor-pointer ${
                                active
                                  ? 'bg-[#BE123C] text-white'
                                  : 'bg-[var(--card-surface)] text-[var(--text-primary)] hover:bg-rose-50 dark:hover:bg-rose-950/50'
                              }`}
                            >
                              {Number(iso.slice(8))}
                            </button>
                          );
                        })}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex gap-2 pt-2 border-t border-[var(--border-subtle)]">
              <button
                type="button"
                onClick={() => setFastTrackOpen(false)}
                className="flex-1 h-10 rounded-full bg-[var(--surface-inset)] text-xs font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  bulkMarkFastTrackPeriods(fastTrackSelection);
                  setFastTrackOpen(false);
                }}
                className="flex-1 h-10 rounded-full bg-[#BE123C] text-white text-xs font-bold cursor-pointer"
              >
                Save {fastTrackSelection.length} Period Days
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
