import React, { useEffect, useMemo, useRef, useState } from 'react';
import type {
  OutboundCallConfigReadiness,
  OutboundCallRecord,
  OutboundCallStatus,
} from '../types/fitsync';
import {
  COUNTRY_DIAL_OPTIONS,
  normalizeAndValidatePhone,
} from '../utils/phoneValidation';
import { AppIcon } from './AppIcon';

export interface SarvamOutboundCallWidgetProps {
  compact?: boolean;
  initialPhoneNumber?: string;
  initialCountryCode?: string;
  initialStage?: 'entering_number' | 'awaiting_confirmation';
  externalConfirmSignal?: number;
  externalCancelSignal?: number;
  onAttemptUpdated?: (record: OutboundCallRecord | null, status: OutboundCallStatus, errorMessage?: string) => void;
  onCancel?: () => void;
}

const STATUS_DISPLAY: Record<
  Exclude<OutboundCallStatus, 'idle'>,
  { label: string; description: string; tone: 'neutral' | 'amber' | 'indigo' | 'emerald' | 'rose' }
> = {
  entering_number: {
    label: 'Enter phone number',
    description: 'Provide a valid mobile number to receive a real AI phone call from FITSYNC.',
    tone: 'neutral',
  },
  awaiting_confirmation: {
    label: 'Waiting for confirmation',
    description: 'Explicit confirmation required before dialing your phone.',
    tone: 'amber',
  },
  initiating: {
    label: 'Initiating call',
    description: 'Sending secure outbound request to Sarvam Voice Agents API...',
    tone: 'indigo',
  },
  request_accepted: {
    label: 'Call request accepted',
    description: 'Sarvam accepted the call request. Waiting for carrier ring & provider events.',
    tone: 'indigo',
  },
  ringing: {
    label: 'Ringing / connecting',
    description: 'Your mobile phone is ringing. Please keep your phone nearby.',
    tone: 'amber',
  },
  connected: {
    label: 'Call connected',
    description: 'Provider confirmed your phone call is live with FITSYNC Voice Agent.',
    tone: 'emerald',
  },
  completed: {
    label: 'Call completed',
    description: 'Outbound phone conversation finished cleanly.',
    tone: 'emerald',
  },
  failed: {
    label: 'Call failed',
    description: 'The outbound call could not be completed.',
    tone: 'rose',
  },
};

const PIPELINE_STEPS: Array<{ key: Exclude<OutboundCallStatus, 'idle'>; short: string }> = [
  { key: 'entering_number', short: '1. Number' },
  { key: 'awaiting_confirmation', short: '2. Confirm' },
  { key: 'initiating', short: '3. Dialing' },
  { key: 'request_accepted', short: '4. Queued' },
  { key: 'ringing', short: '5. Ringing' },
  { key: 'connected', short: '6. Live' },
  { key: 'completed', short: '7. Done' },
];

export function SarvamOutboundCallWidget({
  compact = false,
  initialPhoneNumber = '',
  initialCountryCode = '+91',
  initialStage = 'entering_number',
  externalConfirmSignal = 0,
  externalCancelSignal = 0,
  onAttemptUpdated,
  onCancel,
}: SarvamOutboundCallWidgetProps) {
  const [countryCode, setCountryCode] = useState(initialCountryCode);
  const [phoneInput, setPhoneInput] = useState(initialPhoneNumber);
  const [stage, setStage] = useState<Exclude<OutboundCallStatus, 'idle'>>(initialStage);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [callError, setCallError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState<OutboundCallRecord | null>(null);
  const [readiness, setReadiness] = useState<OutboundCallConfigReadiness | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(true);

  const pollTimerRef = useRef<number | null>(null);
  const lastExternalConfirmRef = useRef(externalConfirmSignal);
  const lastExternalCancelRef = useRef(externalCancelSignal);

  useEffect(() => {
    let active = true;
    fetch('/api/sarvam/outbound/config')
      .then((res) => res.json())
      .then((data: OutboundCallConfigReadiness) => {
        if (active) setReadiness(data);
      })
      .catch(() => {
        // Non-fatal config check
      })
      .finally(() => {
        if (active) setLoadingConfig(false);
      });

    return () => {
      active = false;
      if (pollTimerRef.current !== null) {
        window.clearInterval(pollTimerRef.current);
      }
    };
  }, []);

  // Poll provider status strictly when attemptId is active & non-terminal
  useEffect(() => {
    if (pollTimerRef.current !== null) {
      window.clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }

    const shouldPoll =
      attempt?.attemptId &&
      (stage === 'request_accepted' || stage === 'ringing' || stage === 'connected');

    if (!shouldPoll || !attempt) return;

    const pollOnce = async () => {
      try {
        const res = await fetch(`/api/sarvam/outbound/status/${encodeURIComponent(attempt.attemptId)}`);
        const data = (await res.json()) as { ok?: boolean; attempt?: OutboundCallRecord };
        if (res.ok && data.attempt) {
          setAttempt(data.attempt);
          setStage(data.attempt.status);
          if (data.attempt.status === 'failed' && data.attempt.failureReason) {
            setCallError(data.attempt.failureReason);
          }
          onAttemptUpdated?.(
            data.attempt,
            data.attempt.status,
            data.attempt.failureReason ?? undefined
          );
        }
      } catch {
        // Keep current status on transient poll hiccup
      }
    };

    pollOnce();
    pollTimerRef.current = window.setInterval(pollOnce, 3000);

    return () => {
      if (pollTimerRef.current !== null) {
        window.clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [attempt?.attemptId, stage]);

  const phoneCheck = useMemo(
    () => normalizeAndValidatePhone(phoneInput, countryCode),
    [phoneInput, countryCode]
  );

  const selectedDialOption = useMemo(
    () => COUNTRY_DIAL_OPTIONS.find((c) => c.code === countryCode) ?? COUNTRY_DIAL_OPTIONS[0],
    [countryCode]
  );

  const handleProceedToConfirm = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setCallError(null);
    if (!phoneCheck.valid || !phoneCheck.e164) {
      setValidationError(phoneCheck.error || 'Please enter a valid mobile number.');
      return;
    }
    setValidationError(null);
    setStage('awaiting_confirmation');
    onAttemptUpdated?.(null, 'awaiting_confirmation');
  };

  const handleConfirmAndCall = async () => {
    if (!phoneCheck.valid || !phoneCheck.e164) {
      setValidationError(phoneCheck.error || 'Invalid mobile number.');
      setStage('entering_number');
      return;
    }

    setValidationError(null);
    setCallError(null);
    setStage('initiating');
    onAttemptUpdated?.(null, 'initiating');

    try {
      const res = await fetch('/api/sarvam/outbound/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumber: phoneInput,
          countryCode,
          confirmed: true,
        }),
      });

      const data = (await res.json()) as {
        ok?: boolean;
        attempt?: OutboundCallRecord;
        error?: string;
      };

      if (!res.ok || !data.attempt) {
        const message = data.error || `Call initiation failed (${res.status}).`;
        setCallError(message);
        setStage('failed');
        onAttemptUpdated?.(null, 'failed', message);
        return;
      }

      setAttempt(data.attempt);
      // Backend strictly sets status = 'request_accepted' (never falsely 'connected')
      setStage(data.attempt.status);
      onAttemptUpdated?.(data.attempt, data.attempt.status);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Network error initiating outbound call.';
      setCallError(message);
      setStage('failed');
      onAttemptUpdated?.(null, 'failed', message);
    }
  };

  const handleRetry = () => {
    setAttempt(null);
    setCallError(null);
    setValidationError(null);
    setStage('entering_number');
    onAttemptUpdated?.(null, 'entering_number');
  };

  const handleCancelFlow = () => {
    setAttempt(null);
    setCallError(null);
    setValidationError(null);
    setStage('entering_number');
    onCancel?.();
  };

  // Support chat-driven "Yes" / "Cancel" text confirmations
  useEffect(() => {
    if (externalConfirmSignal !== lastExternalConfirmRef.current) {
      lastExternalConfirmRef.current = externalConfirmSignal;
      if (stage === 'awaiting_confirmation') {
        void handleConfirmAndCall();
      }
    }
  }, [externalConfirmSignal]);

  useEffect(() => {
    if (externalCancelSignal !== lastExternalCancelRef.current) {
      lastExternalCancelRef.current = externalCancelSignal;
      handleCancelFlow();
    }
  }, [externalCancelSignal]);

  const statusMeta = STATUS_DISPLAY[stage];

  const toneClasses: Record<typeof statusMeta.tone, string> = {
    neutral: 'bg-[var(--surface-inset)] text-[var(--text-primary)] border-[var(--border-subtle)]',
    amber: 'bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-200 border-amber-200 dark:border-amber-800',
    indigo: 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-800 dark:text-indigo-200 border-indigo-200 dark:border-indigo-800',
    emerald: 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-800',
    rose: 'bg-rose-50 dark:bg-rose-950/60 text-rose-800 dark:text-rose-200 border-rose-200 dark:border-rose-800',
  };

  const currentStepIdx = PIPELINE_STEPS.findIndex((s) => s.key === stage);

  return (
    <div
      data-testid="sarvam-outbound-widget"
      className={`rounded-2xl border border-[var(--border-subtle)] bg-[var(--card-surface)] ${
        compact ? 'p-3.5 sm:p-4' : 'p-5 sm:p-6'
      } space-y-4`}
    >
      {/* Header & Live Status Badge */}
      <div className="flex flex-wrap items-start justify-between gap-2.5">
        <div className="flex items-center gap-2.5">
          <div
            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
              stage === 'connected' || stage === 'completed'
                ? 'bg-emerald-500 text-white'
                : stage === 'failed'
                  ? 'bg-rose-600 text-white'
                  : 'bg-[var(--primary)]/15 text-[var(--primary)]'
            }`}
          >
            <AppIcon
              name={stage === 'failed' ? 'phoneOff' : stage === 'connected' || stage === 'ringing' ? 'phoneCall' : 'phone'}
              size={18}
            />
          </div>
          <div>
            <h3 className="text-sm font-extrabold text-[var(--text-primary)]">
              FITSYNC Real Phone Call (Sarvam Voice Agent)
            </h3>
            <p className="text-[11px] text-[var(--text-secondary)]">
              Calls your actual mobile number over PSTN telephony (Hindi / English / Hinglish)
            </p>
          </div>
        </div>

        <span
          data-testid="outbound-call-status-badge"
          className={`px-3 py-1 rounded-full border text-[11px] font-extrabold ${toneClasses[statusMeta.tone]}`}
        >
          {statusMeta.label}
        </span>
      </div>

      {/* Missing Credentials Readiness Notice (Honest, no mock) */}
      {!loadingConfig && readiness && !readiness.ready && (
        <div
          data-testid="outbound-missing-config-banner"
          className="rounded-xl bg-amber-50/80 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 p-3 space-y-1.5 text-xs"
        >
          <div className="flex items-center gap-1.5 font-extrabold text-amber-900 dark:text-amber-200">
            <AppIcon name="alert" size={14} className="shrink-0" />
            <span>Sarvam Voice Agent Credentials Incomplete</span>
          </div>
          <p className="text-[11px] text-amber-900/90 dark:text-amber-200/90 leading-relaxed">
            Configure these server secrets in AI Studio Settings &gt; Secrets before real outbound phone calls can connect:{' '}
            <strong className="font-mono">{readiness.missingVariables.join(', ')}</strong>.
          </p>
        </div>
      )}

      {/* Visual Status Stepper */}
      <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5" aria-label="Call status progress">
        {PIPELINE_STEPS.map((step, idx) => {
          const isFailed = stage === 'failed' && idx >= 2;
          const isCurrent = step.key === stage;
          const isDone = !isFailed && currentStepIdx > idx;
          return (
            <div
              key={step.key}
              className={`px-2 py-1.5 rounded-lg text-[10px] font-bold text-center border transition-colors ${
                isCurrent
                  ? 'bg-[var(--primary)] text-white border-[var(--primary)]'
                  : isDone
                    ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                    : 'bg-[var(--surface-inset)] text-[var(--text-secondary)] border-[var(--border-subtle)]'
              }`}
            >
              {step.short}
            </div>
          );
        })}
      </div>

      {/* Stage 1: Enter Phone Number */}
      {stage === 'entering_number' && (
        <form onSubmit={handleProceedToConfirm} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
            <div className="sm:col-span-5">
              <label
                htmlFor="outbound-country-code"
                className="block text-[11px] font-bold text-[var(--text-secondary)] mb-1"
              >
                Country Code
              </label>
              <select
                id="outbound-country-code"
                data-testid="outbound-country-select"
                value={countryCode}
                onChange={(e) => {
                  setCountryCode(e.target.value);
                  setValidationError(null);
                }}
                className="w-full h-10 px-3 rounded-xl bg-[var(--surface-inset)] border border-[var(--border-subtle)] text-xs font-bold text-[var(--text-primary)]"
              >
                {COUNTRY_DIAL_OPTIONS.map((opt) => (
                  <option key={opt.code} value={opt.code}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-7">
              <label
                htmlFor="outbound-mobile-input"
                className="block text-[11px] font-bold text-[var(--text-secondary)] mb-1"
              >
                Mobile Number
              </label>
              <input
                id="outbound-mobile-input"
                data-testid="outbound-mobile-input"
                type="tel"
                inputMode="tel"
                value={phoneInput}
                onChange={(e) => {
                  setPhoneInput(e.target.value);
                  if (validationError) setValidationError(null);
                }}
                placeholder={`e.g., ${selectedDialOption.example}`}
                className="w-full h-10 px-3.5 rounded-xl bg-[var(--surface-inset)] border border-[var(--border-subtle)] text-sm font-semibold text-[var(--text-primary)] outline-none focus:border-[var(--primary)] tabular-nums"
              />
            </div>
          </div>

          {validationError && (
            <p
              role="alert"
              data-testid="outbound-validation-error"
              className="text-xs font-semibold text-rose-600 dark:text-rose-400 flex items-center gap-1.5"
            >
              <AppIcon name="alert" size={13} />
              <span>{validationError}</span>
            </p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <span className="text-[11px] text-[var(--text-secondary)]">
              {phoneCheck.valid && phoneCheck.e164
                ? `Normalized: ${phoneCheck.e164}`
                : 'Validated in E.164 format before dialing'}
            </span>
            <div className="flex items-center gap-2">
              {onCancel && (
                <button
                  type="button"
                  data-testid="outbound-cancel-btn"
                  onClick={handleCancelFlow}
                  className="h-9 px-4 rounded-full bg-[var(--surface-inset)] border border-[var(--border-subtle)] text-xs font-bold text-[var(--text-primary)] cursor-pointer"
                >
                  Cancel
                </button>
              )}
              <button
                type="submit"
                data-testid="outbound-review-btn"
                className="h-9 px-5 rounded-full bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <AppIcon name="phone" size={14} />
                <span>Continue</span>
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Stage 2: Explicit Confirmation */}
      {stage === 'awaiting_confirmation' && (
        <div
          data-testid="outbound-confirmation-box"
          className="rounded-xl bg-[var(--surface-inset)] border border-[var(--border-subtle)] p-4 space-y-3"
        >
          <div className="space-y-1">
            <p className="text-xs sm:text-sm font-bold text-[var(--text-primary)]">
              You are about to receive an AI-generated phone call from FITSYNC. Do you want to proceed?
            </p>
            <p className="text-xs text-[var(--text-secondary)] tabular-nums">
              Target number: <strong className="text-[var(--text-primary)]">{phoneCheck.e164}</strong>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              data-testid="outbound-confirm-call-btn"
              onClick={handleConfirmAndCall}
              className="h-10 px-5 rounded-full bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <AppIcon name="phoneCall" size={14} />
              <span>Confirm &amp; Call</span>
            </button>
            <button
              type="button"
              data-testid="outbound-edit-number-btn"
              onClick={() => setStage('entering_number')}
              className="h-10 px-4 rounded-full bg-[var(--card-surface)] border border-[var(--border-subtle)] text-xs font-bold text-[var(--text-primary)] cursor-pointer"
            >
              Edit Number
            </button>
            <button
              type="button"
              data-testid="outbound-cancel-confirm-btn"
              onClick={handleCancelFlow}
              className="h-10 px-4 rounded-full bg-[var(--card-surface)] border border-[var(--border-subtle)] text-xs font-bold text-[var(--text-secondary)] cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Stage 3..8: Live Call Tracking / Result */}
      {stage !== 'entering_number' && stage !== 'awaiting_confirmation' && (
        <div
          data-testid="outbound-live-status-box"
          className="rounded-xl bg-[var(--surface-inset)] border border-[var(--border-subtle)] p-4 space-y-3"
        >
          <p className="text-xs font-semibold text-[var(--text-primary)]">
            {statusMeta.description}
          </p>

          {attempt && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
              <div className="p-2 rounded-lg bg-[var(--card-surface)] border border-[var(--border-subtle)]">
                <span className="text-[var(--text-secondary)] block">Destination</span>
                <strong className="text-[var(--text-primary)] tabular-nums">{attempt.maskedPhone}</strong>
              </div>
              <div className="p-2 rounded-lg bg-[var(--card-surface)] border border-[var(--border-subtle)]">
                <span className="text-[var(--text-secondary)] block">Provider Status</span>
                <strong className="text-[var(--text-primary)]">{attempt.providerStatus}</strong>
              </div>
              <div className="p-2 rounded-lg bg-[var(--card-surface)] border border-[var(--border-subtle)]">
                <span className="text-[var(--text-secondary)] block">Attempt ID</span>
                <strong className="text-[var(--text-primary)] font-mono truncate block">
                  {attempt.attemptId}
                </strong>
              </div>
              <div className="p-2 rounded-lg bg-[var(--card-surface)] border border-[var(--border-subtle)]">
                <span className="text-[var(--text-secondary)] block">Duration</span>
                <strong className="text-[var(--text-primary)] tabular-nums">
                  {attempt.durationSec !== null ? `${attempt.durationSec}s` : 'Pending'}
                </strong>
              </div>
            </div>
          )}

          {attempt?.transcriptSummary && (
            <div className="p-2.5 rounded-lg bg-[var(--card-surface)] border border-[var(--border-subtle)] text-[11px] text-[var(--text-primary)]">
              <strong className="block text-[10px] uppercase text-[var(--text-secondary)] mb-0.5">
                Call Transcript Summary
              </strong>
              <span>{attempt.transcriptSummary}</span>
            </div>
          )}

          {callError && (
            <div
              role="alert"
              data-testid="outbound-call-error"
              className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-xs text-rose-900 dark:text-rose-200 flex items-start gap-2"
            >
              <AppIcon name="alert" size={14} className="text-rose-700 dark:text-rose-300 shrink-0 mt-0.5" />
              <span>{callError}</span>
            </div>
          )}

          {(stage === 'failed' || stage === 'completed') && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                data-testid="outbound-retry-btn"
                onClick={handleRetry}
                className="h-9 px-4 rounded-full bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <AppIcon name="rotateCcw" size={13} />
                <span>{stage === 'failed' ? 'Retry Call' : 'Place Another Call'}</span>
              </button>
              {onCancel && (
                <button
                  type="button"
                  onClick={handleCancelFlow}
                  className="h-9 px-4 rounded-full bg-[var(--card-surface)] border border-[var(--border-subtle)] text-xs font-bold text-[var(--text-primary)] cursor-pointer"
                >
                  Close
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
