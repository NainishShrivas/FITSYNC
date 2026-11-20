import { useMemo, useState } from 'react';
import { AppIcon, type AppIconName } from '../components/AppIcon';
import { useAppState } from '../context/AppStateContext';

type AchievementCategory = 'Streaks' | 'Workouts' | 'Nutrition' | 'Consistency';
type FilterTab = 'All' | 'Unlocked' | 'In Progress' | AchievementCategory;
type BadgeTier = 'Bronze' | 'Silver' | 'Gold' | 'Platinum';

interface AchievementSpec {
  id: string;
  title: string;
  desc: string;
  category: AchievementCategory;
  tier: BadgeTier;
  icon: AppIconName;
  current: number;
  target: number;
  unit: string;
  xpBonus: number;
}

const TIER_STYLES: Record<BadgeTier, { chip: string; bar: string; iconBg: string }> = {
  Bronze: {
    chip: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300',
    bar: 'bg-amber-500',
    iconBg: 'bg-amber-100/80 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300',
  },
  Silver: {
    chip: 'bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-200',
    bar: 'bg-slate-500 dark:bg-slate-300',
    iconBg: 'bg-slate-200/80 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
  },
  Gold: {
    chip: 'bg-violet-100 text-[var(--primary)] dark:bg-violet-950/70 dark:text-violet-300',
    bar: 'bg-[var(--primary)]',
    iconBg: 'bg-violet-100 text-[var(--primary)] dark:bg-violet-950/60 dark:text-violet-300',
  },
  Platinum: {
    chip: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300',
    bar: 'bg-emerald-500',
    iconBg: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
  },
};

function getRankInfo(xp: number): {
  rank: string;
  nextRank: string | null;
  minXp: number;
  nextXp: number;
  pct: number;
} {
  if (xp >= 1000) {
    return { rank: 'Platinum Apex', nextRank: null, minXp: 1000, nextXp: 1000, pct: 100 };
  }
  if (xp >= 500) {
    return {
      rank: 'Gold Vanguard',
      nextRank: 'Platinum Apex',
      minXp: 500,
      nextXp: 1000,
      pct: Math.round(((xp - 500) / 500) * 100),
    };
  }
  if (xp >= 250) {
    return {
      rank: 'Silver Athlete',
      nextRank: 'Gold Vanguard',
      minXp: 250,
      nextXp: 500,
      pct: Math.round(((xp - 250) / 250) * 100),
    };
  }
  return {
    rank: 'Bronze Calibrator',
    nextRank: 'Silver Athlete',
    minXp: 0,
    nextXp: 250,
    pct: Math.round((xp / 250) * 100),
  };
}

export function RewardsPage() {
  const { state } = useAppState();
  const [filter, setFilter] = useState<FilterTab>('All');

  const historyWorkoutDays = useMemo(
    () => state.history14Days.filter((d) => d.workoutDone).length,
    [state.history14Days]
  );

  const highHabitDays = useMemo(
    () => state.history14Days.filter((d) => d.habitPct >= 80).length,
    [state.history14Days]
  );

  const achievements: AchievementSpec[] = useMemo(
    () => [
      {
        id: 'first-step',
        title: 'First Step',
        desc: 'Complete personalized biometric onboarding',
        category: 'Consistency',
        tier: 'Bronze',
        icon: 'zap',
        current: state.profile.onboardingCompleted ? 1 : 0,
        target: 1,
        unit: 'step',
        xpBonus: 120,
      },
      {
        id: 'on-fire',
        title: 'On Fire',
        desc: 'Maintain an active 3-day streak',
        category: 'Streaks',
        tier: 'Bronze',
        icon: 'flame',
        current: state.streakDays,
        target: 3,
        unit: 'days',
        xpBonus: 50,
      },
      {
        id: 'week-warrior',
        title: 'Week Warrior',
        desc: 'Maintain an active 7-day streak',
        category: 'Streaks',
        tier: 'Silver',
        icon: 'award',
        current: state.streakDays,
        target: 7,
        unit: 'days',
        xpBonus: 100,
      },
      {
        id: 'fortnight-focus',
        title: 'Fortnight Focus',
        desc: 'Reach a 14-day unbroken training streak',
        category: 'Streaks',
        tier: 'Gold',
        icon: 'trophy',
        current: state.streakDays,
        target: 14,
        unit: 'days',
        xpBonus: 200,
      },
      {
        id: 'iron-logger',
        title: 'Iron Logger',
        desc: 'Complete a guided workout session',
        category: 'Workouts',
        tier: 'Bronze',
        icon: 'dumbbell',
        current: Math.max(
          state.completedWorkoutDays.length,
          state.extraBurnedTodayKcal > 0 ? 1 : 0
        ),
        target: 1,
        unit: 'session',
        xpBonus: 50,
      },
      {
        id: 'training-momentum',
        title: 'Training Momentum',
        desc: 'Complete 3 workout sessions this week',
        category: 'Workouts',
        tier: 'Silver',
        icon: 'activity',
        current: state.completedWorkoutDays.length,
        target: 3,
        unit: 'sessions',
        xpBonus: 150,
      },
      {
        id: 'active-fortnight',
        title: '14-Day Engine',
        desc: 'Log 10 active training days in your 14-day log',
        category: 'Workouts',
        tier: 'Gold',
        icon: 'target',
        current: historyWorkoutDays,
        target: 10,
        unit: 'days',
        xpBonus: 150,
      },
      {
        id: 'macro-master',
        title: 'Macro Master',
        desc: 'Check off 3 or more meals in one day',
        category: 'Nutrition',
        tier: 'Bronze',
        icon: 'utensils',
        current: state.checkedMealIds.length,
        target: 3,
        unit: 'meals',
        xpBonus: 45,
      },
      {
        id: 'cheat-strategist',
        title: 'Cheat Strategist',
        desc: 'Calibrate a cheat meal surplus safely',
        category: 'Nutrition',
        tier: 'Silver',
        icon: 'pizza',
        current: state.cheatHistory.length,
        target: 1,
        unit: 'plan',
        xpBonus: 30,
      },
      {
        id: 'habit-hero',
        title: 'Habit Hero',
        desc: 'Complete 4 or more daily habits today',
        category: 'Consistency',
        tier: 'Bronze',
        icon: 'checkCircle',
        current: state.checkedHabits.length,
        target: 4,
        unit: 'habits',
        xpBonus: 100,
      },
      {
        id: 'eighty-club',
        title: '80% Consistency Club',
        desc: 'Achieve 80%+ daily habit score on 7 days',
        category: 'Consistency',
        tier: 'Gold',
        icon: 'shieldCheck',
        current: highHabitDays,
        target: 7,
        unit: 'days',
        xpBonus: 150,
      },
      {
        id: 'unstoppable',
        title: 'Unstoppable',
        desc: 'Accumulate 500 total calibration XP',
        category: 'Consistency',
        tier: 'Platinum',
        icon: 'sparkles',
        current: state.xp,
        target: 500,
        unit: 'XP',
        xpBonus: 250,
      },
    ],
    [
      state.profile.onboardingCompleted,
      state.streakDays,
      state.completedWorkoutDays.length,
      state.extraBurnedTodayKcal,
      historyWorkoutDays,
      state.checkedMealIds.length,
      state.cheatHistory.length,
      state.checkedHabits.length,
      highHabitDays,
      state.xp,
    ]
  );

  const enriched = useMemo(
    () =>
      achievements.map((a) => {
        const clamped = Math.min(a.current, a.target);
        const pct = Math.min(100, Math.round((clamped / Math.max(1, a.target)) * 100));
        const unlocked = a.current >= a.target;
        return { ...a, clamped, pct, unlocked };
      }),
    [achievements]
  );

  const unlockedCount = enriched.filter((a) => a.unlocked).length;
  const totalPct = Math.round((unlockedCount / enriched.length) * 100);
  const rankInfo = getRankInfo(state.xp);

  const visibleAchievements = useMemo(() => {
    if (filter === 'All') return enriched;
    if (filter === 'Unlocked') return enriched.filter((a) => a.unlocked);
    if (filter === 'In Progress') return enriched.filter((a) => !a.unlocked);
    return enriched.filter((a) => a.category === filter);
  }, [enriched, filter]);

  const filterTabs: FilterTab[] = [
    'All',
    'Unlocked',
    'In Progress',
    'Streaks',
    'Workouts',
    'Nutrition',
    'Consistency',
  ];

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[var(--text-primary)] tracking-tight">
            Achievements & Rewards
          </h1>
          <p className="text-sm text-[var(--text-secondary)] mt-0.5">
            Track fitness milestones, unlock badges, and level up your calibration rank
          </p>
        </div>
        <span className="px-3.5 py-1.5 rounded-full bg-[var(--card-surface)] border border-[var(--border-subtle)] text-xs font-extrabold text-[var(--primary)] tabular-nums">
          {rankInfo.rank}
        </span>
      </header>

      {/* XP, Rank & Overall Milestone Completion Banner */}
      <section
        aria-label="Achievement summary"
        className="rounded-[24px] bg-gradient-to-r from-[var(--brand-royal)] to-[var(--accent-violet)] text-white p-6 shadow-[0_8px_24px_-6px_rgba(61,44,142,0.3)]"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
          <div>
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-white/15 flex items-center justify-center shrink-0">
                <AppIcon name="trophy" size={28} />
              </div>
              <div>
                <p className="text-3xl font-extrabold tabular-nums leading-none">
                  {unlockedCount}/{enriched.length}
                </p>
                <p className="text-xs font-medium text-white/85 mt-1.5">
                  Milestones unlocked · {totalPct}% collection complete
                </p>
              </div>
            </div>
            <div className="mt-4 w-full h-2.5 rounded-full bg-white/20 overflow-hidden">
              <div
                className="h-full rounded-full bg-white transition-all duration-300"
                style={{ width: `${Math.max(4, totalPct)}%` }}
              />
            </div>
          </div>

          <div className="rounded-2xl bg-white/10 p-4 border border-white/15 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold uppercase tracking-wider text-white/80">
                XP Rank Progress
              </span>
              <span className="font-extrabold tabular-nums">
                {state.xp.toLocaleString()} XP
              </span>
            </div>
            <div className="w-full h-2 rounded-full bg-white/20 overflow-hidden">
              <div
                className="h-full rounded-full bg-emerald-300 transition-all duration-300"
                style={{ width: `${Math.max(6, rankInfo.pct)}%` }}
              />
            </div>
            <p className="text-[11px] text-white/85 tabular-nums">
              {rankInfo.nextRank
                ? `${Math.max(0, rankInfo.nextXp - state.xp)} XP to reach ${rankInfo.nextRank}`
                : 'Maximum rank achieved'}
            </p>
          </div>
        </div>
      </section>

      {/* Filter Bar */}
      <nav aria-label="Achievement categories" className="flex flex-wrap gap-2">
        {filterTabs.map((tab) => {
          const active = filter === tab;
          const count =
            tab === 'All'
              ? enriched.length
              : tab === 'Unlocked'
                ? unlockedCount
                : tab === 'In Progress'
                  ? enriched.length - unlockedCount
                  : enriched.filter((a) => a.category === tab).length;
          return (
            <button
              key={tab}
              type="button"
              onClick={() => setFilter(tab)}
              data-testid={`achievement-filter-${tab.toLowerCase().replace(/\s+/g, '-')}`}
              className={`h-9 px-3.5 rounded-full text-xs font-bold transition-colors border cursor-pointer tabular-nums ${
                active
                  ? 'bg-[var(--primary)] text-white border-[var(--primary)]'
                  : 'bg-[var(--card-surface)] text-[var(--text-primary)] border-[var(--border-subtle)] hover:bg-[var(--surface-inset)]'
              }`}
            >
              {tab} ({count})
            </button>
          );
        })}
      </nav>

      {/* Achievement Milestones Grid with Badges & Progress Bars */}
      <section aria-label="Achievement milestones" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {visibleAchievements.map((item) => {
          const tier = TIER_STYLES[item.tier];
          return (
            <article
              key={item.id}
              data-testid={`achievement-card-${item.id}`}
              className={`fitsync-card p-5 flex flex-col justify-between gap-4 transition-all ${
                item.unlocked ? '' : 'opacity-90'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3.5">
                  <div
                    className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
                      item.unlocked
                        ? tier.iconBg
                        : 'bg-[var(--surface-inset)] text-[var(--text-secondary)]'
                    }`}
                  >
                    <AppIcon name={item.unlocked ? item.icon : 'lock'} size={22} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <h2 className="text-sm font-extrabold text-[var(--text-primary)]">
                        {item.title}
                      </h2>
                    </div>
                    <p className="text-xs text-[var(--text-secondary)] mt-0.5 leading-snug">
                      {item.desc}
                    </p>
                  </div>
                </div>

                <span
                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider shrink-0 ${
                    item.unlocked
                      ? tier.chip
                      : 'bg-[var(--surface-inset)] text-[var(--text-secondary)]'
                  }`}
                >
                  {item.tier}
                </span>
              </div>

              <div className="space-y-2 pt-2 border-t border-[var(--border-subtle)]">
                <div className="flex items-center justify-between text-xs tabular-nums">
                  <span className="font-bold text-[var(--text-primary)]">
                    {item.clamped.toLocaleString()} / {item.target.toLocaleString()} {item.unit}
                  </span>
                  <span
                    className={`font-extrabold ${
                      item.unlocked ? 'text-[var(--status-success)]' : 'text-[var(--text-secondary)]'
                    }`}
                  >
                    {item.unlocked ? 'Unlocked' : `${item.pct}%`}
                  </span>
                </div>

                <div
                  role="progressbar"
                  aria-valuenow={item.pct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`${item.title} progress ${item.pct}%`}
                  className="w-full h-2.5 rounded-full bg-[var(--surface-inset)] overflow-hidden"
                >
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      item.unlocked ? 'bg-[var(--status-success)]' : tier.bar
                    }`}
                    style={{ width: `${item.pct === 0 ? 0 : Math.max(6, item.pct)}%` }}
                  />
                </div>

                <div className="flex items-center justify-between text-[11px] text-[var(--text-secondary)]">
                  <span>{item.category}</span>
                  <span className="font-bold text-[var(--primary)] tabular-nums">
                    +{item.xpBonus} XP milestone
                  </span>
                </div>
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
}
