import { useEffect, useState } from 'react';
import type {
  CycleConnectState,
  CycleEngineOutput,
  CycleMode,
  CycleModuleState,
  CycleReminder,
  UserCycleSettings,
} from '../../types/cycle';
import {
  CYCLE_MODE_LABELS,
  resolveModeManualOverrides,
  serializeCycleCsv,
} from '../../utils/cycleEngine';
import { AppIcon } from '../AppIcon';

type MenuSection = 'personalization' | 'reminders' | 'connect' | 'privacy';

interface CycleNumericInputProps {
  id?: string;
  ariaLabel?: string;
  value: number | null;
  min: number;
  max: number;
  allowEmpty: boolean;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  onCommit: (next: number | null) => void;
}

function CycleNumericInput({
  id,
  ariaLabel,
  value,
  min,
  max,
  allowEmpty,
  disabled,
  placeholder,
  className,
  onCommit,
}: CycleNumericInputProps) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState<string>(value !== null ? String(value) : '');

  useEffect(() => {
    if (!focused) {
      setDraft(value !== null ? String(value) : '');
    }
  }, [value, focused]);

  return (
    <input
      id={id}
      aria-label={ariaLabel}
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      maxLength={2}
      disabled={disabled}
      value={draft}
      placeholder={placeholder}
      onFocus={() => setFocused(true)}
      onChange={(e) => {
        const clean = e.target.value.replace(/\D/g, '').slice(0, 2);
        setDraft(clean);
        if (clean === '') {
          if (allowEmpty) onCommit(null);
          return;
        }
        const n = Number(clean);
        if (n >= min && n <= max) {
          onCommit(n);
        }
      }}
      onBlur={() => {
        setFocused(false);
        const trimmed = draft.trim();
        if (trimmed === '') {
          if (allowEmpty) {
            onCommit(null);
            setDraft('');
          } else {
            const fallback = value !== null ? value : min;
            onCommit(fallback);
            setDraft(String(fallback));
          }
          return;
        }
        const clamped = Math.max(min, Math.min(max, Math.round(Number(trimmed) || min)));
        onCommit(clamped);
        setDraft(String(clamped));
      }}
      className={className}
    />
  );
}

interface Props {
  open: boolean;
  onClose: () => void;
  cycleState: CycleModuleState;
  cycleEngine: CycleEngineOutput;
  userName: string;
  todayDate: string;
  onUpdateSettings: (patch: Partial<UserCycleSettings>) => void;
  onUpdateReminders: (reminders: CycleReminder[]) => void;
  onUpdateConnect: (patch: Partial<CycleConnectState>) => void;
  onDeleteAll: () => void;
  onToast: (msg: string, tone?: 'xp' | 'success' | 'info') => void;
}

export function CycleMoreDrawer({
  open,
  onClose,
  cycleState,
  cycleEngine,
  userName,
  todayDate,
  onUpdateSettings,
  onUpdateReminders,
  onUpdateConnect,
  onDeleteAll,
  onToast,
}: Props) {
  const [section, setSection] = useState<MenuSection>('personalization');
  const [recipientInput, setRecipientInput] = useState('');
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);

  if (!open) return null;

  const { settings, reminders, connect } = cycleState;
  const { allowManualCycle, allowManualPeriod } = resolveModeManualOverrides(settings);

  const handleToggleReminder = (id: CycleReminder['id']) => {
    onUpdateReminders(
      reminders.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r))
    );
  };

  const handleUpdateReminderField = (
    id: CycleReminder['id'],
    patch: Partial<CycleReminder>
  ) => {
    onUpdateReminders(reminders.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const handleGenerateInvite = () => {
    if (!connect.consentChecked) return;
    const code = `SYNC-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
    onUpdateConnect({
      inviteCode: code,
      shareStatus: 'pending',
      recipientName: null,
    });
    onToast(`Invite code ${code} generated`, 'success');
  };

  const handleSimulateRecipientAccept = () => {
    onUpdateConnect({
      shareStatus: 'active',
      recipientName: 'Partner Account',
    });
    onToast('Cycle Connect sharing active (Read-Only)', 'success');
  };

  const handleAcceptInviteCode = () => {
    const clean = recipientInput.trim().toUpperCase();
    if (!clean) return;
    onUpdateConnect({
      viewingCode: clean,
      viewingOwnerName: `${userName} (Shared View)`,
    });
    setRecipientInput('');
    onToast(`Viewing shared read-only calendar (${clean})`, 'info');
  };

  const handleExportJson = () => {
    const blob = new Blob([JSON.stringify(cycleState, null, 2)], {
      type: 'application/json;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fitsync-cycle-data-${todayDate}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    onToast('Exported GDPR cycle copy (JSON)', 'success');
  };

  const handleExportCsv = () => {
    const csv = serializeCycleCsv(cycleState, cycleEngine);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fitsync-cycle-data-${todayDate}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    onToast('Exported cycle spreadsheet (CSV)', 'success');
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-label="Cycle More Menu"
    >
      <div className="bg-[var(--card-surface)] border-l border-[var(--border-subtle)] w-full max-w-lg h-full flex flex-col shadow-2xl">
        {/* Drawer Header */}
        <div className="px-5 py-4 border-b border-[var(--border-subtle)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AppIcon name="menu" size={18} className="text-[#BE123C]" />
            <h2 className="text-base font-extrabold text-[var(--text-primary)]">
              Cycle Settings & More (=)
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close More Menu"
            className="w-9 h-9 rounded-full bg-[var(--surface-inset)] flex items-center justify-center text-[var(--text-primary)] cursor-pointer"
          >
            <AppIcon name="x" size={18} />
          </button>
        </div>

        {/* Section Tabs */}
        <div className="px-4 py-2.5 border-b border-[var(--border-subtle)] flex gap-1.5 overflow-x-auto">
          {(
            [
              { id: 'personalization', label: 'Mode & Overrides', icon: 'sliders' },
              { id: 'reminders', label: 'Reminders', icon: 'bell' },
              { id: 'connect', label: 'Cycle Connect', icon: 'share2' },
              { id: 'privacy', label: 'Privacy & Data', icon: 'shield' },
            ] as const
          ).map((tab) => {
            const active = section === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSection(tab.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 shrink-0 cursor-pointer transition-colors ${
                  active
                    ? 'bg-[#BE123C] text-white'
                    : 'bg-[var(--surface-inset)] text-[var(--text-primary)] hover:bg-[var(--border-subtle)]'
                }`}
              >
                <AppIcon name={tab.icon} size={14} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Drawer Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* 1. PERSONALIZATION & MODE */}
          {section === 'personalization' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-extrabold text-[var(--text-primary)] mb-2">
                  Active Cycle Mode
                </h3>
                <div className="space-y-2">
                  {(Object.keys(CYCLE_MODE_LABELS) as CycleMode[]).map((mode) => {
                    const active = settings.activeMode === mode;
                    return (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => onUpdateSettings({ activeMode: mode })}
                        className={`w-full p-3 rounded-2xl border text-left transition-colors cursor-pointer ${
                          active
                            ? 'bg-rose-50 dark:bg-rose-950/60 border-[#BE123C] text-[#9F1239] dark:text-rose-200'
                            : 'bg-[var(--card-surface)] border-[var(--border-subtle)] hover:bg-[var(--surface-inset)]'
                        }`}
                      >
                        <span className="text-xs font-extrabold block">
                          {CYCLE_MODE_LABELS[mode].title}
                        </span>
                        <span className="text-[11px] text-[var(--text-secondary)] block mt-0.5">
                          {CYCLE_MODE_LABELS[mode].subtitle}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Manual Length Overrides (Mode-Specific) */}
              <div className="rounded-2xl bg-[var(--surface-inset)] p-4 space-y-3">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-[var(--text-secondary)]">
                  Manual Length Overrides
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="manual-cycle-length-input"
                      className="text-xs font-bold text-[var(--text-primary)] block"
                    >
                      Manual Cycle Length
                    </label>
                    <CycleNumericInput
                      id="manual-cycle-length-input"
                      min={18}
                      max={60}
                      allowEmpty
                      disabled={!allowManualCycle}
                      value={settings.manualCycleLength}
                      placeholder={`Auto (${cycleEngine.effectiveCycleLength}d)`}
                      onCommit={(next) => onUpdateSettings({ manualCycleLength: next })}
                      className="mt-1.5 w-full h-10 px-3 rounded-xl bg-[var(--card-surface)] border border-[var(--border-subtle)] text-xs font-bold text-[var(--text-primary)] tabular-nums disabled:opacity-50 focus:outline-none focus:border-[#BE123C]"
                    />
                    {!allowManualCycle && (
                      <span className="text-[10px] text-[var(--text-secondary)]">
                        Disabled in {CYCLE_MODE_LABELS[settings.activeMode].title}
                      </span>
                    )}
                  </div>

                  <div>
                    <label
                      htmlFor="manual-period-length-input"
                      className="text-xs font-bold text-[var(--text-primary)] block"
                    >
                      Manual Period Length
                    </label>
                    <CycleNumericInput
                      id="manual-period-length-input"
                      min={2}
                      max={14}
                      allowEmpty
                      disabled={!allowManualPeriod}
                      value={settings.manualPeriodLength}
                      placeholder={`Auto (${cycleEngine.effectivePeriodLength}d)`}
                      onCommit={(next) => onUpdateSettings({ manualPeriodLength: next })}
                      className="mt-1.5 w-full h-10 px-3 rounded-xl bg-[var(--card-surface)] border border-[var(--border-subtle)] text-xs font-bold text-[var(--text-primary)] tabular-nums disabled:opacity-50 focus:outline-none focus:border-[#BE123C]"
                    />
                    {!allowManualPeriod && (
                      <span className="text-[10px] text-[var(--text-secondary)]">
                        Disabled in {CYCLE_MODE_LABELS[settings.activeMode].title}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Ovulation & Fertile Window Toggles */}
              <div className="space-y-2.5">
                <label className="p-3.5 rounded-2xl border border-[var(--border-subtle)] flex items-center justify-between cursor-pointer">
                  <div>
                    <span className="text-xs font-bold text-[var(--text-primary)] block">
                      Show Predicted Ovulation Day
                    </span>
                    <span className="text-[11px] text-[var(--text-secondary)]">
                      Light blue dot anchored to Next Period − 13 days (or +LH / BBT)
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.showOvulation}
                    onChange={(e) => onUpdateSettings({ showOvulation: e.target.checked })}
                    className="w-4 h-4 accent-[#BE123C]"
                  />
                </label>

                <label className="p-3.5 rounded-2xl border border-[var(--border-subtle)] flex items-center justify-between cursor-pointer">
                  <div>
                    <span className="text-xs font-bold text-[var(--text-primary)] block">
                      Show 7-Day Fertile Window
                    </span>
                    <span className="text-[11px] text-[var(--text-secondary)]">
                      Toggle off if taking hormonal birth control
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.showFertileWindow}
                    onChange={(e) => onUpdateSettings({ showFertileWindow: e.target.checked })}
                    className="w-4 h-4 accent-[#BE123C]"
                  />
                </label>
              </div>

              {/* Non-Contraception Disclaimer */}
              <div className="rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 p-3.5 text-xs text-amber-950 dark:text-amber-200 space-y-1">
                <p className="font-extrabold flex items-center gap-1.5">
                  <AppIcon name="alert" size={15} className="text-amber-700 dark:text-amber-400" />
                  <span>Non-Contraception Disclaimer</span>
                </p>
                <p>
                  Predicted ovulation and fertile-window estimates are informational only and{' '}
                  <strong>must not</strong> be used to prevent pregnancy or replace birth control.
                </p>
              </div>
            </div>
          )}

          {/* 2. CUSTOMIZABLE REMINDERS */}
          {section === 'reminders' && (
            <div className="space-y-3">
              <p className="text-xs text-[var(--text-secondary)]">
                Customize delivery time, advance-day offset, and message text (emojis supported). Reminders only trigger while profile gender is Female.
              </p>
              {reminders.map((rem) => (
                <div
                  key={rem.id}
                  className="p-3.5 rounded-2xl border border-[var(--border-subtle)] space-y-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-extrabold text-[var(--text-primary)]">
                      {rem.label}
                    </span>
                    <input
                      type="checkbox"
                      checked={rem.enabled}
                      onChange={() => handleToggleReminder(rem.id)}
                      className="w-4 h-4 accent-[#BE123C]"
                    />
                  </div>
                  {rem.enabled && (
                    <div className="space-y-2 pt-1">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] font-bold text-[var(--text-secondary)] block">
                            Time
                          </label>
                          <input
                            type="time"
                            value={rem.time}
                            onChange={(e) =>
                              handleUpdateReminderField(rem.id, { time: e.target.value })
                            }
                            className="w-full h-9 px-2.5 rounded-xl bg-[var(--surface-inset)] text-xs font-semibold"
                          />
                        </div>
                        <div>
                          <label
                            htmlFor={`reminder-advance-${rem.id}`}
                            className="text-[10px] font-bold text-[var(--text-secondary)] block"
                          >
                            Days Advance (0–7)
                          </label>
                          <CycleNumericInput
                            id={`reminder-advance-${rem.id}`}
                            ariaLabel={`${rem.label} days advance`}
                            min={0}
                            max={7}
                            allowEmpty={false}
                            value={rem.advanceDays}
                            placeholder="0–7"
                            onCommit={(next) =>
                              handleUpdateReminderField(rem.id, {
                                advanceDays: next ?? 0,
                              })
                            }
                            className="w-full h-9 px-2.5 rounded-xl bg-[var(--surface-inset)] border border-[var(--border-subtle)] text-xs font-semibold text-[var(--text-primary)] tabular-nums focus:outline-none focus:border-[#BE123C]"
                          />
                        </div>
                      </div>
                      <input
                        type="text"
                        value={rem.message}
                        onChange={(e) =>
                          handleUpdateReminderField(rem.id, { message: e.target.value })
                        }
                        aria-label={`${rem.label} message`}
                        className="w-full h-9 px-3 rounded-xl bg-[var(--surface-inset)] text-xs"
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* 3. CONSENT-GATED CYCLE CONNECT */}
          {section === 'connect' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-[var(--surface-inset)] space-y-3">
                <h3 className="text-sm font-extrabold text-[var(--text-primary)]">
                  Share Your Cycle (Read-Only)
                </h3>
                <label className="flex items-start gap-2.5 text-xs text-[var(--text-primary)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={connect.consentChecked}
                    onChange={(e) => onUpdateConnect({ consentChecked: e.target.checked })}
                    className="mt-0.5 w-4 h-4 accent-[#BE123C]"
                  />
                  <span>
                    I agree to sharing my cycle calendar predictions and logged period dates with my invited recipient in read-only mode.
                  </span>
                </label>

                {connect.shareStatus === 'none' && (
                  <button
                    type="button"
                    disabled={!connect.consentChecked}
                    onClick={handleGenerateInvite}
                    className={`w-full h-10 rounded-full text-xs font-bold text-white ${
                      connect.consentChecked
                        ? 'bg-[#BE123C] hover:bg-[#9F1239] cursor-pointer'
                        : 'bg-rose-300 cursor-not-allowed'
                    }`}
                  >
                    Generate One-Time Invite Code
                  </button>
                )}

                {connect.shareStatus === 'pending' && connect.inviteCode && (
                  <div className="p-3 rounded-xl bg-[var(--card-surface)] border border-amber-200 dark:border-amber-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-amber-800 dark:text-amber-300">
                        Status: Pending Acceptance
                      </span>
                      <code className="px-2 py-0.5 rounded bg-rose-50 dark:bg-rose-950/60 text-[#BE123C] dark:text-rose-300 font-mono text-xs font-bold">
                        {connect.inviteCode}
                      </code>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={handleSimulateRecipientAccept}
                        className="flex-1 h-9 rounded-full bg-[var(--primary)] text-white text-xs font-bold cursor-pointer"
                      >
                        Verify Recipient Join
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateConnect({
                            inviteCode: null,
                            shareStatus: 'none',
                            recipientName: null,
                          })
                        }
                        className="h-9 px-3 rounded-full bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-200 text-xs font-bold cursor-pointer"
                      >
                        Revoke
                      </button>
                    </div>
                  </div>
                )}

                {connect.shareStatus === 'active' && (
                  <div className="p-3 rounded-xl bg-[var(--card-surface)] border border-emerald-200 dark:border-emerald-800 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-emerald-700 dark:text-emerald-300">
                        Connected: {connect.recipientName || 'Recipient'}
                      </span>
                      <span className="text-[11px] font-mono text-[var(--text-secondary)]">
                        {connect.inviteCode}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateConnect({
                          inviteCode: null,
                          shareStatus: 'none',
                          recipientName: null,
                        })
                      }
                      className="w-full h-10 rounded-full bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold cursor-pointer"
                    >
                      Remove Connection
                    </button>
                  </div>
                )}
              </div>

              <div className="p-4 rounded-2xl border border-[var(--border-subtle)] space-y-2.5">
                <h3 className="text-sm font-extrabold text-[var(--text-primary)]">
                  Enter an Invite Code
                </h3>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={recipientInput}
                    onChange={(e) => setRecipientInput(e.target.value)}
                    placeholder="e.g. SYNC-4X9K"
                    className="flex-1 h-10 px-3 rounded-full border border-[var(--border-subtle)] text-xs font-mono"
                  />
                  <button
                    type="button"
                    onClick={handleAcceptInviteCode}
                    className="h-10 px-4 rounded-full bg-[var(--primary)] text-white text-xs font-bold cursor-pointer"
                  >
                    Connect
                  </button>
                </div>
                {connect.viewingOwnerName && (
                  <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-xs text-emerald-900 dark:text-emerald-200 flex items-center justify-between">
                    <span>
                      Read-Only View Active: <strong>{connect.viewingOwnerName}</strong>
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateConnect({ viewingCode: null, viewingOwnerName: null })
                      }
                      className="text-rose-700 dark:text-rose-300 font-bold cursor-pointer"
                    >
                      Disconnect
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 4. PRIVACY & DATA PORTABILITY */}
          {section === 'privacy' && (
            <div className="space-y-4">
              <label className="p-4 rounded-2xl border border-[var(--border-subtle)] flex items-center justify-between gap-3 cursor-pointer">
                <div>
                  <span className="text-xs font-extrabold text-[var(--text-primary)] block">
                    Discreet View Mode
                  </span>
                  <span className="text-[11px] text-[var(--text-secondary)]">
                    Masks cycle labels on cards & PDF reports for shoulder-surfing privacy.
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={settings.discreetMode}
                  onChange={(e) => onUpdateSettings({ discreetMode: e.target.checked })}
                  className="w-4 h-4 accent-[#BE123C]"
                />
              </label>

              <label className="p-4 rounded-2xl border border-[var(--border-subtle)] flex items-center justify-between gap-3 cursor-pointer">
                <div>
                  <span className="text-xs font-extrabold text-[var(--text-primary)] block">
                    Optional Research Analytics Opt-In
                  </span>
                  <span className="text-[11px] text-[var(--text-secondary)]">
                    Toggle off anytime. Zero reproductive data goes to ad networks.
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={settings.privacyConsents.optionalAnalytics}
                  onChange={(e) =>
                    onUpdateSettings({
                      privacyConsents: {
                        ...settings.privacyConsents,
                        optionalAnalytics: e.target.checked,
                      },
                    })
                  }
                  className="w-4 h-4 accent-[#BE123C]"
                />
              </label>

              <div className="space-y-2">
                <button
                  type="button"
                  onClick={handleExportJson}
                  className="w-full h-11 rounded-full bg-[var(--primary)] text-white text-xs font-bold flex items-center justify-center gap-2 cursor-pointer"
                >
                  <AppIcon name="download" size={16} />
                  <span>Export Full GDPR Data Copy (JSON)</span>
                </button>
                <button
                  type="button"
                  onClick={handleExportCsv}
                  className="w-full h-11 rounded-full bg-[var(--surface-inset)] text-[var(--text-primary)] text-xs font-bold flex items-center justify-center gap-2 cursor-pointer"
                >
                  <AppIcon name="fileSpreadsheet" size={16} />
                  <span>Export Cycle Logs (CSV)</span>
                </button>
              </div>

              <div className="pt-3 border-t border-[var(--border-subtle)]">
                {!confirmDeleteAll ? (
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteAll(true)}
                    className="w-full h-11 rounded-full border border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/50 text-xs font-bold flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <AppIcon name="trash2" size={16} />
                    <span>Permanently Delete All Cycle History</span>
                  </button>
                ) : (
                  <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 space-y-2.5">
                    <p className="text-xs font-bold text-rose-900 dark:text-rose-200">
                      This permanently erases all cycle logs, custom tags, and predictions.
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteAll(false)}
                        className="flex-1 h-9 rounded-full bg-[var(--card-surface)] text-xs font-bold cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onDeleteAll();
                          setConfirmDeleteAll(false);
                          onClose();
                        }}
                        className="flex-1 h-9 rounded-full bg-rose-600 text-white text-xs font-bold cursor-pointer"
                      >
                        Confirm Erase
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
