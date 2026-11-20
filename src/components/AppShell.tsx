import React from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAppState } from '../context/AppStateContext';
import { AppIcon, type AppIconName } from './AppIcon';
import { CycleLogoMark } from './CycleLogoMark';

interface NavItem {
  to: string;
  label: string;
  icon: AppIconName;
}

const BASE_NAV_ITEMS: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: 'home' },
  { to: '/analytics', label: 'Analytics', icon: 'barChart' },
  { to: '/plans', label: 'Plans', icon: 'dumbbell' },
  { to: '/rewards', label: 'Rewards', icon: 'gift' },
  { to: '/profile', label: 'Profile', icon: 'user' },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { state, theme, toggleTheme, metrics, toast, dismissToast, cycleTrackingEnabled } = useAppState();
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[var(--bg-canvas)] text-[var(--text-primary)] flex flex-col min-[840px]:flex-row">
      {/* Desktop Fixed Sidebar (>= 840px) */}
      <aside
        aria-label="Primary Navigation"
        className="no-print hidden min-[840px]:flex min-[840px]:flex-col min-[840px]:w-[260px] min-[840px]:shrink-0 min-[840px]:fixed min-[840px]:inset-y-0 min-[840px]:left-0 bg-[var(--brand-royal)] text-white p-6 justify-between z-30 overflow-y-auto"
      >
        <div>
          <div className="flex items-center gap-3 pb-6 border-b border-white/15">
            <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center">
              <AppIcon name="dumbbell" size={20} className="text-white" />
            </div>
            <div>
              <span className="text-xl font-extrabold tracking-tight block leading-none">FITSYNC</span>
              <span className="text-xs text-white/75 font-medium mt-1 block">Calibrate Health</span>
            </div>
          </div>

          <nav className="mt-6 flex flex-col gap-1.5" aria-label="Main sections">
            {BASE_NAV_ITEMS.map((item) => {
              const isActive =
                location.pathname === item.to || location.pathname.startsWith(`${item.to}/`);
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={`flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-semibold transition-colors whitespace-nowrap shrink-0 ${
                    isActive
                      ? 'bg-white dark:bg-[#1E253B] text-[var(--primary)] dark:text-white shadow-sm'
                      : 'text-white/80 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <AppIcon name={item.icon} size={18} />
                  <span>{item.label}</span>
                </NavLink>
              );
            })}

            {/* Female-Only Cycle & Period Tracking directly below core nav with dedicated logo */}
            {cycleTrackingEnabled && (
              <NavLink
                to="/cycle"
                data-testid="nav-cycle-desktop"
                className={`flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  location.pathname === '/cycle' || location.pathname.startsWith('/cycle/')
                    ? 'bg-white dark:bg-[#1E253B] text-[#BE123C] dark:text-rose-300 shadow-sm'
                    : 'bg-rose-500/20 text-white hover:bg-rose-500/30 border border-rose-300/25'
                }`}
              >
                <CycleLogoMark size={20} />
                <span>Period & Cycle</span>
              </NavLink>
            )}

            <div className="my-2 border-t border-white/15" />

            <NavLink
              to="/cheat-meal"
              className={`flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-semibold transition-colors whitespace-nowrap shrink-0 ${
                location.pathname === '/cheat-meal'
                  ? 'bg-white dark:bg-[#1E253B] text-[var(--primary)] dark:text-white shadow-sm'
                  : 'text-white/80 hover:bg-white/10 hover:text-white'
              }`}
            >
              <AppIcon name="pizza" size={18} />
              <span>Cheat Meal</span>
            </NavLink>

            <NavLink
              to="/ai-coach"
              className={`flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-semibold transition-colors whitespace-nowrap shrink-0 ${
                location.pathname === '/ai-coach'
                  ? 'bg-white dark:bg-[#1E253B] text-[var(--primary)] dark:text-white shadow-sm'
                  : 'text-white/80 hover:bg-white/10 hover:text-white'
              }`}
            >
              <AppIcon name="sparkles" size={18} />
              <span>AI Coach & Voice</span>
            </NavLink>

            <NavLink
              to="/studio-3d"
              className={`flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-semibold transition-colors whitespace-nowrap shrink-0 ${
                location.pathname === '/studio-3d'
                  ? 'bg-white dark:bg-[#1E253B] text-[var(--primary)] dark:text-white shadow-sm'
                  : 'text-white/80 hover:bg-white/10 hover:text-white'
              }`}
            >
              <AppIcon name="box" size={18} />
              <span>3D Form Studio</span>
            </NavLink>
          </nav>
        </div>

        <div className="space-y-3 mt-6">
          <button
            type="button"
            onClick={toggleTheme}
            data-testid="theme-toggle-desktop"
            aria-pressed={theme === 'dark'}
            aria-label={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            className="w-full flex items-center justify-between px-4 py-2.5 rounded-2xl bg-white/10 hover:bg-white/15 text-xs font-bold text-white transition-colors cursor-pointer"
          >
            <span className="flex items-center gap-2.5">
              <AppIcon name={theme === 'dark' ? 'sun' : 'moon'} size={16} className="text-amber-300" />
              <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
            </span>
            <span className="px-2 py-0.5 rounded-full bg-white/15 text-[10px] uppercase tracking-wider">
              {theme === 'dark' ? 'Dark' : 'Light'}
            </span>
          </button>

          <div className="rounded-2xl bg-white/10 p-4 text-xs">
            <p className="font-semibold text-white truncate">{state.profile.fullName}</p>
            <p className="mt-1 text-white/75 tabular-nums">
              Target: {metrics.safeTargetKcal.toLocaleString()} kcal · {state.streakDays}d streak
            </p>
          </div>
        </div>
      </aside>

      {/* Mobile Compact Top Strip (< 840px) for direct AI Coach, 3D Studio, Theme Toggle, and Female Cycle Logo shortcut */}
      <header className="no-print min-[840px]:hidden sticky top-0 z-30 bg-[var(--card-surface)]/95 backdrop-blur-md border-b border-[var(--border-subtle)] px-4 h-13 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => navigate('/dashboard')}
          className="flex items-center gap-2 cursor-pointer"
        >
          <div className="w-8 h-8 rounded-lg bg-[var(--primary)] text-white flex items-center justify-center">
            <AppIcon name="dumbbell" size={16} />
          </div>
          <span className="text-sm font-extrabold tracking-tight text-[var(--text-primary)]">FITSYNC</span>
        </button>

            <div className="flex items-center gap-1.5">
              {cycleTrackingEnabled && (
                <button
                  type="button"
                  onClick={() => navigate('/cycle')}
                  data-testid="nav-cycle-mobile-logo"
                  aria-label="Open Period and Cycle Tracker"
                  className={`h-8 px-2.5 rounded-full flex items-center gap-1.5 text-xs font-bold transition-colors cursor-pointer ${
                    location.pathname.startsWith('/cycle')
                      ? 'bg-[#BE123C] text-white'
                      : 'bg-rose-50 dark:bg-rose-950/60 text-[#BE123C] dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                  }`}
                >
                  <CycleLogoMark size={16} />
                  <span>Cycle</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => navigate('/ai-coach')}
                aria-label="Open AI Coach"
                className={`h-8 px-2.5 rounded-full flex items-center gap-1 text-xs font-bold transition-colors cursor-pointer ${
                  location.pathname === '/ai-coach'
                    ? 'bg-[var(--primary)] text-white'
                    : 'bg-[var(--surface-inset)] text-[var(--primary)]'
                }`}
              >
                <AppIcon name="sparkles" size={14} />
                <span>AI</span>
              </button>
              <button
                type="button"
                onClick={() => navigate('/studio-3d')}
                aria-label="Open 3D Form Studio"
                className={`h-8 px-2.5 rounded-full flex items-center gap-1 text-xs font-bold transition-colors cursor-pointer ${
                  location.pathname === '/studio-3d'
                    ? 'bg-[var(--primary)] text-white'
                    : 'bg-[var(--surface-inset)] text-[var(--text-primary)]'
                }`}
              >
                <AppIcon name="box" size={14} />
                <span>3D</span>
              </button>
              <button
                type="button"
                onClick={toggleTheme}
                data-testid="theme-toggle-mobile"
                aria-pressed={theme === 'dark'}
                aria-label={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                className="w-8 h-8 rounded-full bg-[var(--surface-inset)] text-[var(--text-primary)] flex items-center justify-center transition-colors cursor-pointer"
              >
                <AppIcon name={theme === 'dark' ? 'sun' : 'moon'} size={15} />
              </button>
            </div>
          </header>

      {/* Main Content Stage */}
      <main className="flex-1 min-[840px]:pl-[260px] pb-24 min-[840px]:pb-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-5 min-[840px]:py-8">
          {children}
        </div>
      </main>

      {/* Mobile Persistent BottomNav (< 840px) */}
      <nav
        aria-label="Mobile Navigation"
        className={`no-print min-[840px]:hidden fixed bottom-0 left-0 right-0 z-40 bg-[var(--card-surface)]/95 backdrop-blur-md border-t border-[var(--border-subtle)] px-1 h-16 grid ${
          cycleTrackingEnabled ? 'grid-cols-6' : 'grid-cols-5'
        } items-center`}
      >
        {BASE_NAV_ITEMS.slice(0, 3).map((item) => {
          const isActive =
            location.pathname === item.to || location.pathname.startsWith(`${item.to}/`);
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={`flex flex-col items-center justify-center h-full min-h-[44px] transition-colors ${
                isActive ? 'text-[var(--primary)] font-bold' : 'text-[var(--text-secondary)] font-medium'
              }`}
            >
              <AppIcon name={item.icon} size={19} strokeWidth={isActive ? 2.3 : 1.8} />
              <span className="text-[10px] mt-1 leading-none whitespace-nowrap">
                {cycleTrackingEnabled && item.label === 'Dashboard' ? 'Home' : item.label}
              </span>
            </NavLink>
          );
        })}

        {cycleTrackingEnabled && (
          <NavLink
            to="/cycle"
            data-testid="nav-cycle-mobile-tab"
            className={`flex flex-col items-center justify-center h-full min-h-[44px] transition-colors ${
              location.pathname.startsWith('/cycle')
                ? 'text-[#BE123C] font-bold'
                : 'text-[var(--text-secondary)] font-medium'
            }`}
          >
            <CycleLogoMark size={20} />
            <span className="text-[10px] mt-1 leading-none whitespace-nowrap">Cycle</span>
          </NavLink>
        )}

        {BASE_NAV_ITEMS.slice(3).map((item) => {
          const isActive =
            location.pathname === item.to || location.pathname.startsWith(`${item.to}/`);
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={`flex flex-col items-center justify-center h-full min-h-[44px] transition-colors ${
                isActive ? 'text-[var(--primary)] font-bold' : 'text-[var(--text-secondary)] font-medium'
              }`}
            >
              <AppIcon name={item.icon} size={19} strokeWidth={isActive ? 2.3 : 1.8} />
              <span className="text-[10px] mt-1 leading-none whitespace-nowrap">{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      {/* Subtle XP / Status Toast */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="no-print fixed bottom-20 min-[840px]:bottom-6 right-4 min-[840px]:right-6 z-50 flex items-center gap-2.5 bg-[#1E1B4B] dark:bg-[#1E253B] border border-white/10 text-white px-4 py-2.5 rounded-full shadow-lg text-sm font-semibold"
        >
          <AppIcon
            name={toast.tone === 'success' ? 'checkCircle' : 'sparkles'}
            size={16}
            className="text-[var(--status-success)]"
          />
          <span>{toast.text}</span>
          <button
            type="button"
            onClick={dismissToast}
            aria-label="Dismiss notification"
            className="ml-1 text-white/70 hover:text-white cursor-pointer"
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
