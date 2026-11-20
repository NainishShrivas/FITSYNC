import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppState } from '../context/AppStateContext';
import type {
  SarvamRecommendedChanges,
  WeeklyCheckInFeedback,
} from '../types/fitsync';
import {
  detectOutboundCallIntent,
  extractPhoneCandidateFromText,
} from '../utils/phoneValidation';
import {
  audioBlobToBase64,
  queryMicrophonePermission,
  requestMicrophoneStream,
  type MicPermissionState,
} from '../utils/microphonePermission';
import { AppIcon } from './AppIcon';
import { SarvamOutboundCallWidget } from './SarvamOutboundCallWidget';

interface CallTurn {
  role: 'coach' | 'user';
  text: string;
  timestamp: string;
  audioBase64?: string | null;
  audioMime?: string;
}

interface TurnSummaryDraft {
  weeklyProgressSummary: string;
  dietIssue: string;
  healthIssue: string;
  exerciseIssue: string;
  overallFeedback: string;
  sentiment: 'great' | 'mixed' | 'struggling';
  aiSummary: string;
}

const SARVAM_LANGUAGES = [
  { code: 'en-IN', label: 'English (India)' },
  { code: 'hi-IN', label: 'हिन्दी (Hindi)' },
  { code: 'ta-IN', label: 'தமிழ் (Tamil)' },
  { code: 'te-IN', label: 'తెలుగు (Telugu)' },
  { code: 'kn-IN', label: 'ಕನ್ನಡ (Kannada)' },
  { code: 'mr-IN', label: 'मराठी (Marathi)' },
  { code: 'bn-IN', label: 'বাংলা (Bengali)' },
];

const SARVAM_SPEAKERS = [
  { id: 'shubh', label: 'Shubh (Warm Coach)' },
  { id: 'priya', label: 'Priya (Calm & Clear)' },
  { id: 'rahul', label: 'Rahul (Energetic)' },
];

const QUICK_FEEDBACK_PROMPTS = [
  'My knees hurt during squats and the workouts feel too tiring this week.',
  'I feel very hungry at night on my diet and low energy before evening workouts.',
  'I had mild high blood pressure dizziness during planks and feel dehydrated.',
  'Great week overall! Workouts feel a bit too easy and I want to push harder.',
];

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = String(reader.result ?? '');
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error('Failed to encode audio'));
    reader.readAsDataURL(blob);
  });
}

function formatCallDuration(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function SarvamCheckInCall() {
  const {
    state,
    metrics,
    cycleTrackingEnabled,
    cycleEngine,
    submitWeeklyCheckInFeedback,
  } = useAppState();
  const navigate = useNavigate();

  const [languageCode, setLanguageCode] = useState('en-IN');
  const [speaker, setSpeaker] = useState('shubh');
  const [voiceOutputEnabled, setVoiceOutputEnabled] = useState(true);

  const [callState, setCallState] = useState<'idle' | 'connecting' | 'active' | 'ended'>('idle');
  const [callSeconds, setCallSeconds] = useState(0);
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [turns, setTurns] = useState<CallTurn[]>([]);
  const [userDraft, setUserDraft] = useState('');
  const [latestSummary, setLatestSummary] = useState<TurnSummaryDraft | null>(null);
  const [latestRec, setLatestRec] = useState<SarvamRecommendedChanges | undefined>(undefined);
  const [lastSavedRecord, setLastSavedRecord] = useState<WeeklyCheckInFeedback | null>(null);
  const [showOutboundPanel, setShowOutboundPanel] = useState(true);
  const [outboundInitialPhone, setOutboundInitialPhone] = useState('');
  const [micPermission, setMicPermission] = useState<MicPermissionState>('unknown');

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const profileSummary = useMemo(() => {
    const base = [
      `Name: ${state.profile.fullName}`,
      `Goal: ${state.profile.goalKey}`,
      `Weight: ${state.profile.weightKg} kg`,
      `Target: ${metrics.safeTargetKcal} kcal/day`,
      `Diet: ${state.profile.dietPreference}`,
      `Workouts: ${state.profile.trainingDays.length} days/wk (${state.profile.sessionDurationMins} min at ${state.profile.trainingTime})`,
      `Streak: ${state.streakDays} days`,
      `Health Conditions: ${state.profile.healthConditions.length ? state.profile.healthConditions.join(', ') : 'None'}`,
    ];
    if (cycleTrackingEnabled && cycleEngine) {
      base.push(`Cycle Phase: ${cycleEngine.currentPhase}`);
    }
    return base.join(' | ');
  }, [state.profile, state.streakDays, metrics.safeTargetKcal, cycleTrackingEnabled, cycleEngine]);

  useEffect(() => {
    if (callState !== 'active') return;
    const id = window.setInterval(() => setCallSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, [callState]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [turns, busy]);

  useEffect(() => {
    queryMicrophonePermission().then(setMicPermission);
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try {
          mediaRecorderRef.current.stop();
        } catch {
          // Ignore unmount stop errors
        }
      }
    };
  }, []);

  const playBase64Audio = (audioBase64?: string | null, audioMime = 'audio/mpeg') => {
    if (!audioBase64 || !voiceOutputEnabled) return;
    try {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      const audio = new Audio(`data:${audioMime};base64,${audioBase64}`);
      audioRef.current = audio;
      setSpeaking(true);
      audio.onended = () => setSpeaking(false);
      audio.onerror = () => setSpeaking(false);
      audio.play().catch(() => setSpeaking(false));
    } catch {
      setSpeaking(false);
    }
  };

  const stopAudioPlayback = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setSpeaking(false);
  };

  const startCall = async () => {
    setErrorMsg(null);
    setLastSavedRecord(null);
    setLatestSummary(null);
    setLatestRec(undefined);
    setTurns([]);
    setCallSeconds(0);
    setCallState('connecting');
    setBusy(true);

    try {
      const res = await fetch('/api/sarvam/checkin/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userName: state.profile.fullName,
          languageCode,
          speaker,
          profileSummary,
          withAudio: voiceOutputEnabled,
        }),
      });
      const data = (await res.json()) as {
        reply?: string;
        audioBase64?: string | null;
        audioMime?: string;
        error?: string;
      };
      if (!res.ok || !data.reply) {
        throw new Error(data.error || `Sarvam AI call failed (${res.status})`);
      }

      const coachTurn: CallTurn = {
        role: 'coach',
        text: data.reply,
        timestamp: new Date().toISOString(),
        audioBase64: data.audioBase64,
        audioMime: data.audioMime,
      };
      setTurns([coachTurn]);
      setCallState('active');
      playBase64Audio(data.audioBase64, data.audioMime);
    } catch (err) {
      setCallState('idle');
      setErrorMsg(err instanceof Error ? err.message : 'Unable to start Sarvam AI Check-In Call.');
    } finally {
      setBusy(false);
    }
  };

  const finalizeAndAutoFix = (
    fullTurns: CallTurn[],
    summary: TurnSummaryDraft | null,
    rec: SarvamRecommendedChanges | undefined
  ) => {
    const userMessages = fullTurns.filter((t) => t.role === 'user').map((t) => t.text);
    const fallbackText = userMessages.join(' | ') || 'Weekly check-in feedback recorded';

    const saved = submitWeeklyCheckInFeedback({
      languageCode,
      speaker,
      weeklyProgressSummary: summary?.weeklyProgressSummary || fallbackText,
      dietIssue: summary?.dietIssue || 'Reviewed in check-in',
      healthIssue: summary?.healthIssue || 'Reviewed in check-in',
      exerciseIssue: summary?.exerciseIssue || 'Reviewed in check-in',
      overallFeedback: summary?.overallFeedback || fallbackText,
      sentiment: summary?.sentiment || 'mixed',
      aiSummary:
        summary?.aiSummary ||
        'Saved your weekly progress & health feedback via Sarvam AI and auto-calibrated your plan.',
      transcript: fullTurns.map((t) => ({
        role: t.role,
        text: t.text,
        timestamp: t.timestamp,
      })),
      recommendedChanges: rec,
    });

    setLastSavedRecord(saved);
    setCallState('ended');
  };

  const sendUserReply = async (messageText?: string, finalizeNow = false) => {
    const clean = (messageText ?? userDraft).trim();
    if ((!clean && !finalizeNow) || busy) return;

    if (clean && detectOutboundCallIntent(clean)) {
      const candidate = extractPhoneCandidateFromText(clean) ?? '';
      setOutboundInitialPhone(candidate);
      setShowOutboundPanel(true);
    }

    const userTurn: CallTurn | null = clean
      ? { role: 'user', text: clean, timestamp: new Date().toISOString() }
      : null;
    const nextTurns = userTurn ? [...turns, userTurn] : [...turns];

    if (userTurn) {
      setTurns(nextTurns);
      if (!messageText) setUserDraft('');
    }
    setErrorMsg(null);
    setBusy(true);

    try {
      const res = await fetch('/api/sarvam/checkin/turn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript: turns.map((t) => ({ role: t.role, text: t.text })),
          userMessage: clean,
          languageCode,
          speaker,
          profileSummary,
          finalizeNow,
          withAudio: voiceOutputEnabled,
        }),
      });
      const data = (await res.json()) as {
        spokenReply?: string;
        audioBase64?: string | null;
        audioMime?: string;
        shouldConclude?: boolean;
        summary?: TurnSummaryDraft;
        recommendedChanges?: SarvamRecommendedChanges;
        error?: string;
      };
      if (!res.ok || !data.spokenReply) {
        throw new Error(data.error || `Sarvam AI turn error (${res.status})`);
      }

      const coachTurn: CallTurn = {
        role: 'coach',
        text: data.spokenReply,
        timestamp: new Date().toISOString(),
        audioBase64: data.audioBase64,
        audioMime: data.audioMime,
      };
      const updatedTurns = [...nextTurns, coachTurn];
      setTurns(updatedTurns);
      if (data.summary) setLatestSummary(data.summary);
      if (data.recommendedChanges) setLatestRec(data.recommendedChanges);
      playBase64Audio(data.audioBase64, data.audioMime);

      if (data.shouldConclude || finalizeNow) {
        finalizeAndAutoFix(
          updatedTurns,
          data.summary ?? latestSummary,
          data.recommendedChanges ?? latestRec
        );
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to send response to Sarvam AI.');
    } finally {
      setBusy(false);
    }
  };

  const handleEnableMic = async () => {
    setErrorMsg(null);
    const res = await requestMicrophoneStream(true);
    setMicPermission(res.state);
    if (res.stream) {
      res.stream.getTracks().forEach((t) => t.stop());
    }
    if (!res.granted && res.error) {
      setErrorMsg(res.error);
    }
  };

  const toggleVoiceRecording = async () => {
    if (recording) {
      // Stop recording and transcribe via Sarvam Saaras STT
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== 'inactive') {
        recorder.stop();
      }
      setRecording(false);
      return;
    }

    setErrorMsg(null);
    stopAudioPlayback();

    const micRes = await requestMicrophoneStream(true);
    setMicPermission(micRes.state);
    if (!micRes.granted || !micRes.stream) {
      setErrorMsg(
        micRes.error || 'Microphone permission unavailable — you can type or tap a quick reply below.'
      );
      setRecording(false);
      return;
    }

    const stream = micRes.stream;
    try {
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';
      const recorder = new MediaRecorder(stream, { mimeType });
      recordedChunksRef.current = [];

      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) recordedChunksRef.current.push(ev.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(recordedChunksRef.current, { type: mimeType });
        if (blob.size < 250) return;
        setBusy(true);
        try {
          const audioBase64 = await audioBlobToBase64(blob);
          const sttRes = await fetch('/api/sarvam/stt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ audioBase64, mimeType, languageCode }),
          });
          const sttData = (await sttRes.json()) as { transcript?: string; error?: string };
          if (!sttRes.ok) {
            throw new Error(sttData.error || 'Speech-to-text failed');
          }
          const spokenText = sttData.transcript?.trim();
          if (spokenText) {
            setBusy(false);
            await sendUserReply(spokenText, false);
          } else {
            setErrorMsg('No clear speech detected — please try speaking closer or type below.');
            setBusy(false);
          }
        } catch (err) {
          setErrorMsg(err instanceof Error ? err.message : 'Voice transcription error.');
          setBusy(false);
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch {
      stream.getTracks().forEach((t) => t.stop());
      setErrorMsg('Microphone recording failed to start — you can type or tap a quick reply below.');
      setRecording(false);
    }
  };

  const endCallEarly = () => {
    stopAudioPlayback();
    const hasUserInput = turns.some((t) => t.role === 'user');
    if (hasUserInput) {
      sendUserReply(undefined, true);
    } else {
      setCallState('idle');
      setTurns([]);
    }
  };

  const savedCheckIns = state.weeklyCheckIns ?? [];

  return (
    <div className="space-y-5">
      {/* Call Hero & Controls */}
      <section className="fitsync-card p-5 sm:p-6 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div
              className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
                callState === 'active'
                  ? 'bg-emerald-500 text-white shadow-md animate-pulse'
                  : 'bg-[var(--primary)]/15 text-[var(--primary)]'
              }`}
            >
              <AppIcon name={speaking ? 'volume2' : 'phone'} size={22} />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-extrabold text-[var(--text-primary)]">
                  Sarvam AI Weekly Check-In Call
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-indigo-50 dark:bg-indigo-950/60 text-[var(--primary)] border border-indigo-200 dark:border-indigo-800">
                  sarvam-105b · bulbul:v3 · saaras:v3
                </span>
              </div>
              <p className="text-xs sm:text-sm text-[var(--text-secondary)] mt-1">
                We call to ask about your weekly progress and any <strong>diet, health, or exercise</strong> problems — specifically to improve your exercise and health and auto-fix your plan.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {callState === 'active' && (
              <span
                data-testid="sarvam-call-timer"
                className="px-3 py-1.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-xs font-extrabold tabular-nums"
              >
                LIVE · {formatCallDuration(callSeconds)}
              </span>
            )}
            <button
              type="button"
              data-testid="sarvam-enable-mic-btn"
              onClick={handleEnableMic}
              className={`h-9 px-3 rounded-full border text-xs font-bold flex items-center gap-1.5 cursor-pointer ${
                micPermission === 'granted'
                  ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
                  : 'bg-[var(--surface-inset)] border-[var(--border-subtle)] text-[var(--text-primary)] hover:border-[var(--primary)]'
              }`}
            >
              <AppIcon
                name={micPermission === 'denied' ? 'micOff' : 'mic'}
                size={14}
                className={
                  micPermission === 'granted'
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-[var(--primary)]'
                }
              />
              <span>
                {micPermission === 'granted'
                  ? 'Mic Allowed'
                  : micPermission === 'denied'
                    ? 'Retry Mic'
                    : 'Enable Mic'}
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                if (voiceOutputEnabled) stopAudioPlayback();
                setVoiceOutputEnabled((v) => !v);
              }}
              aria-pressed={voiceOutputEnabled}
              className="h-9 px-3 rounded-full bg-[var(--surface-inset)] border border-[var(--border-subtle)] text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5 cursor-pointer"
            >
              <AppIcon name="volume2" size={14} className={voiceOutputEnabled ? 'text-[var(--primary)]' : 'text-[var(--text-secondary)]'} />
              <span>{voiceOutputEnabled ? 'Voice On' : 'Muted'}</span>
            </button>
          </div>
        </div>

        {/* Purpose Banner */}
        <div className="rounded-2xl bg-[var(--surface-inset)] border border-[var(--border-subtle)] p-3.5 flex items-start gap-3">
          <AppIcon name="heartPulse" size={18} className="text-[var(--primary)] shrink-0 mt-0.5" />
          <p className="text-xs text-[var(--text-primary)] leading-relaxed">
            <strong>Why we check in:</strong> Every answer you share about hunger, knee/joint discomfort, fatigue, schedule, or workout difficulty is stored securely in your feedback log and immediately triggers automatic recalibration of your calorie targets, hydration, warm-ups, medical guards, and Workout Portal exercises.
          </p>
        </div>

        {/* Language & Voice Config */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
          <div>
            <label htmlFor="sarvam-lang-select" className="text-[11px] font-bold text-[var(--text-secondary)] block">
              Call Language
            </label>
            <select
              id="sarvam-lang-select"
              value={languageCode}
              disabled={callState === 'active' || callState === 'connecting'}
              onChange={(e) => setLanguageCode(e.target.value)}
              className="mt-1 w-full h-10 px-3 rounded-xl bg-[var(--surface-inset)] border border-[var(--border-subtle)] text-xs font-bold text-[var(--text-primary)] disabled:opacity-60"
            >
              {SARVAM_LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="sarvam-speaker-select" className="text-[11px] font-bold text-[var(--text-secondary)] block">
              Sarvam Bulbul Voice
            </label>
            <select
              id="sarvam-speaker-select"
              value={speaker}
              disabled={callState === 'active' || callState === 'connecting'}
              onChange={(e) => setSpeaker(e.target.value)}
              className="mt-1 w-full h-10 px-3 rounded-xl bg-[var(--surface-inset)] border border-[var(--border-subtle)] text-xs font-bold text-[var(--text-primary)] disabled:opacity-60"
            >
              {SARVAM_SPEAKERS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            {callState !== 'active' ? (
              <button
                type="button"
                data-testid="sarvam-start-call-btn"
                disabled={busy}
                onClick={startCall}
                className="w-full h-10 px-5 rounded-full bg-[var(--primary)] hover:bg-[var(--primary-hover)] disabled:opacity-60 text-white text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-colors"
              >
                <AppIcon name="phone" size={15} />
                <span>
                  {callState === 'connecting'
                    ? 'Calling via Sarvam AI...'
                    : callState === 'ended'
                      ? 'Start Another Weekly Check-In'
                      : 'Start Weekly Check-In Call'}
                </span>
              </button>
            ) : (
              <button
                type="button"
                data-testid="sarvam-end-call-btn"
                disabled={busy}
                onClick={endCallEarly}
                className="w-full h-10 px-5 rounded-full bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-colors"
              >
                <AppIcon name="phoneOff" size={15} />
                <span>
                  {turns.some((t) => t.role === 'user')
                    ? 'End Call & Auto-Fix Plan'
                    : 'End Call'}
                </span>
              </button>
            )}
          </div>
        </div>

        {/* Live Call Transcript & Reply Controls */}
        {(turns.length > 0 || callState === 'connecting' || callState === 'active') && (
          <div className="space-y-3 pt-2 border-t border-[var(--border-subtle)]">
            <div
              ref={scrollRef}
              className="rounded-2xl bg-[var(--surface-inset)] border border-[var(--border-subtle)] p-4 max-h-[340px] overflow-y-auto space-y-3"
            >
              {turns.map((turn, idx) => {
                const isUser = turn.role === 'user';
                return (
                  <div
                    key={`${turn.timestamp}-${idx}`}
                    className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-3 text-xs sm:text-sm leading-relaxed ${
                        isUser
                          ? 'bg-[var(--primary)] text-white'
                          : 'bg-[var(--card-surface)] border border-[var(--border-subtle)] text-[var(--text-primary)]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3 mb-1">
                        <span
                          className={`text-[10px] font-extrabold uppercase tracking-wider ${
                            isUser ? 'text-white/80' : 'text-[var(--primary)]'
                          }`}
                        >
                          {isUser ? 'You' : 'Sarvam AI Coach'}
                        </span>
                        {!isUser && turn.audioBase64 && (
                          <button
                            type="button"
                            onClick={() => playBase64Audio(turn.audioBase64, turn.audioMime)}
                            className="inline-flex items-center gap-1 text-[10px] font-bold text-[var(--primary)] hover:underline cursor-pointer"
                          >
                            <AppIcon name="volume2" size={11} />
                            <span>Replay</span>
                          </button>
                        )}
                      </div>
                      <p>{turn.text}</p>
                    </div>
                  </div>
                );
              })}

              {busy && (
                <div className="text-xs font-semibold text-[var(--text-secondary)] animate-pulse">
                  {recording
                    ? 'Listening to your voice...'
                    : 'Sarvam AI is analyzing your progress & preparing next step...'}
                </div>
              )}
            </div>

            {/* Active Call Reply Bar (Mic Voice OR Type + Quick Feedback Chips) */}
            {callState === 'active' && (
              <div className="space-y-2.5">
                <div className="flex flex-wrap gap-1.5">
                  {QUICK_FEEDBACK_PROMPTS.map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      disabled={busy}
                      onClick={() => sendUserReply(chip, false)}
                      className="px-3 py-1.5 rounded-full bg-[var(--card-surface)] border border-[var(--border-subtle)] hover:border-[var(--primary)] text-[11px] font-semibold text-[var(--text-primary)] cursor-pointer transition-colors text-left"
                    >
                      {chip}
                    </button>
                  ))}
                </div>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    sendUserReply();
                  }}
                  className="flex flex-wrap sm:flex-nowrap gap-2"
                >
                  <button
                    type="button"
                    onClick={toggleVoiceRecording}
                    disabled={busy && !recording}
                    aria-label={recording ? 'Stop speaking' : 'Speak via microphone'}
                    className={`h-11 px-4 rounded-full text-xs font-bold flex items-center gap-1.5 shrink-0 cursor-pointer transition-colors ${
                      recording
                        ? 'bg-rose-600 text-white animate-pulse'
                        : 'bg-[var(--surface-inset)] border border-[var(--border-subtle)] text-[var(--text-primary)] hover:border-[var(--primary)]'
                    }`}
                  >
                    <AppIcon name={recording ? 'micOff' : 'mic'} size={15} />
                    <span>{recording ? 'Stop & Send Voice' : 'Speak'}</span>
                  </button>

                  <input
                    id="sarvam-feedback-input"
                    type="text"
                    value={userDraft}
                    onChange={(e) => setUserDraft(e.target.value)}
                    placeholder="Tell Sarvam AI about your weekly progress, diet, health, or exercise issues..."
                    className="flex-1 min-w-[200px] h-11 px-4 rounded-full bg-[var(--surface-inset)] border border-[var(--border-subtle)] text-xs sm:text-sm text-[var(--text-primary)] outline-none focus:border-[var(--primary)]"
                  />

                  <button
                    type="submit"
                    data-testid="sarvam-send-reply-btn"
                    disabled={busy || !userDraft.trim()}
                    className="h-11 px-5 rounded-full bg-[var(--primary)] hover:bg-[var(--primary-hover)] disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <AppIcon name="send" size={14} />
                    <span>Reply</span>
                  </button>

                  {turns.some((t) => t.role === 'user') && (
                    <button
                      type="button"
                      data-testid="sarvam-apply-fixes-btn"
                      disabled={busy}
                      onClick={() => sendUserReply(userDraft.trim() || undefined, true)}
                      className="h-11 px-4 rounded-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shrink-0"
                    >
                      <AppIcon name="wrench" size={14} />
                      <span>Save & Auto-Fix Plan</span>
                    </button>
                  )}
                </form>
              </div>
            )}
          </div>
        )}

        {errorMsg && (
          <div
            role="alert"
            className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-xs text-rose-900 dark:text-rose-200 flex items-center gap-2"
          >
            <AppIcon name="alert" size={16} className="text-rose-700 dark:text-rose-300 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}
      </section>

      {/* Real Outbound Mobile Call via Sarvam Voice Agents */}
      {showOutboundPanel && (
        <SarvamOutboundCallWidget
          key={outboundInitialPhone || 'default-outbound'}
          initialPhoneNumber={outboundInitialPhone}
          initialCountryCode="+91"
          initialStage="entering_number"
        />
      )}

      {/* Latest Saved Feedback & Auto-Applied Fixes Result Banner */}
      {lastSavedRecord && (
        <section
          data-testid="sarvam-autofix-summary"
          className="fitsync-card p-5 sm:p-6 border border-emerald-300 dark:border-emerald-700 bg-emerald-50/50 dark:bg-emerald-950/30 space-y-4"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
                <AppIcon name="checkCircle" size={20} />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-[var(--text-primary)]">
                  Feedback Stored & Plan Automatically Fixed
                </h3>
                <p className="text-xs text-[var(--text-secondary)]">
                  {lastSavedRecord.aiSummary}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => navigate('/plans')}
                className="px-3.5 py-2 rounded-full bg-[var(--primary)] text-white text-xs font-bold cursor-pointer"
              >
                View Updated Workouts
              </button>
              <button
                type="button"
                onClick={() => navigate('/dashboard')}
                className="px-3.5 py-2 rounded-full bg-[var(--card-surface)] border border-[var(--border-subtle)] text-xs font-bold text-[var(--text-primary)] cursor-pointer"
              >
                View Dashboard
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {lastSavedRecord.appliedFixes.map((fix, idx) => (
              <div
                key={`${fix.field}-${idx}`}
                className="p-3 rounded-2xl bg-[var(--card-surface)] border border-[var(--border-subtle)] space-y-1"
              >
                <div className="flex items-center gap-1.5 text-xs font-extrabold text-[var(--text-primary)]">
                  <AppIcon name="wrench" size={13} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span>{fix.label}</span>
                </div>
                <p className="text-[11px] font-bold text-[var(--primary)] tabular-nums">
                  {fix.before} → {fix.after}
                </p>
                <p className="text-[11px] text-[var(--text-secondary)]">{fix.reason}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Stored Weekly Feedback & Auto-Calibration Log */}
      <section className="fitsync-card p-5 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-extrabold text-[var(--text-primary)]">
              Stored Weekly Feedback & Calibration Log
            </h3>
            <p className="text-xs text-[var(--text-secondary)]">
              Saved across sessions to continuously improve your diet, health, and exercise calibration.
            </p>
          </div>
          <span className="px-3 py-1 rounded-full bg-[var(--surface-inset)] text-xs font-bold text-[var(--text-primary)] tabular-nums">
            {savedCheckIns.length} stored
          </span>
        </div>

        {savedCheckIns.length === 0 ? (
          <div className="rounded-2xl bg-[var(--surface-inset)] p-6 text-center text-xs text-[var(--text-secondary)]">
            No weekly check-in feedback stored yet. Press <strong>Start Weekly Check-In Call</strong> above to share how your diet, health, and workouts feel this week.
          </div>
        ) : (
          <div className="space-y-3">
            {savedCheckIns.map((entry) => (
              <article
                key={entry.id}
                data-testid={`stored-feedback-card-${entry.id}`}
                className="rounded-2xl bg-[var(--surface-inset)] border border-[var(--border-subtle)] p-4 space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-extrabold text-[var(--text-primary)]">
                      {new Date(entry.createdAt).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-[var(--card-surface)] border border-[var(--border-subtle)] text-[10px] font-bold text-[var(--text-secondary)] uppercase">
                      {entry.languageCode} · {entry.speaker}
                    </span>
                  </div>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                      entry.sentiment === 'great'
                        ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                        : entry.sentiment === 'struggling'
                          ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300'
                          : 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300'
                    }`}
                  >
                    {entry.sentiment}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-xs">
                  <div className="p-2.5 rounded-xl bg-[var(--card-surface)]">
                    <span className="text-[10px] font-bold uppercase text-[var(--text-secondary)] block">
                      Weekly Progress
                    </span>
                    <span className="text-[var(--text-primary)] font-semibold">{entry.weeklyProgressSummary}</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-[var(--card-surface)]">
                    <span className="text-[10px] font-bold uppercase text-[var(--text-secondary)] block">
                      Diet Feedback
                    </span>
                    <span className="text-[var(--text-primary)] font-semibold">{entry.dietIssue}</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-[var(--card-surface)]">
                    <span className="text-[10px] font-bold uppercase text-[var(--text-secondary)] block">
                      Health Feedback
                    </span>
                    <span className="text-[var(--text-primary)] font-semibold">{entry.healthIssue}</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-[var(--card-surface)]">
                    <span className="text-[10px] font-bold uppercase text-[var(--text-secondary)] block">
                      Exercise Feedback
                    </span>
                    <span className="text-[var(--text-primary)] font-semibold">{entry.exerciseIssue}</span>
                  </div>
                </div>

                {entry.appliedFixes.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {entry.appliedFixes.map((fix, fIdx) => (
                      <span
                        key={`${entry.id}-fix-${fIdx}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-100/80 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-200 text-[11px] font-bold"
                      >
                        <AppIcon name="wrench" size={11} />
                        <span>
                          {fix.label}: {fix.before} → {fix.after}
                        </span>
                      </span>
                    ))}
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
