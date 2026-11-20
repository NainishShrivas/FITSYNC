import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AppIcon } from '../components/AppIcon';
import { SarvamCheckInCall } from '../components/SarvamCheckInCall';
import { SarvamOutboundCallWidget } from '../components/SarvamOutboundCallWidget';
import { useAppState } from '../context/AppStateContext';
import type { OutboundCallRecord, OutboundCallStatus } from '../types/fitsync';
import {
  detectCallConfirmationReply,
  detectOutboundCallIntent,
  extractPhoneCandidateFromText,
  normalizeAndValidatePhone,
} from '../utils/phoneValidation';
import {
  audioBlobToBase64,
  queryMicrophonePermission,
  requestMicrophoneStream,
  type MicPermissionState,
} from '../utils/microphonePermission';

interface ChatSource {
  uri: string;
  title: string;
}

interface ChatCallCardState {
  initialPhoneNumber: string;
  initialCountryCode: string;
  initialStage: 'entering_number' | 'awaiting_confirmation';
  confirmSignal: number;
  cancelSignal: number;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  sources?: ChatSource[];
  modelUsed?: string;
  callCard?: ChatCallCardState;
}

type CoachMode = 'weekly-call' | 'chat' | 'voice';
type SelectedModel = 'gemini-4-hydrogen' | 'gemini-3.1-flash-lite';
type CoachRole = 'general' | 'nutrition' | 'trainer' | 'cycle_wellness';

function float32ToInt16Base64(float32: Float32Array): string {
  const int16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  const bytes = new Uint8Array(int16.buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64Pcm24kToAudioBuffer(base64: string, ctx: AudioContext): AudioBuffer {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const int16 = new Int16Array(bytes.buffer);
  const float32 = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) {
    float32[i] = int16[i] / 32768;
  }
  const audioBuffer = ctx.createBuffer(1, float32.length, 24000);
  audioBuffer.getChannelData(0).set(float32);
  return audioBuffer;
}

export function AiCoachPage() {
  const { state, metrics, cycleTrackingEnabled, cycleEngine } = useAppState();
  const [searchParams, setSearchParams] = useSearchParams();

  const initialTabParam = searchParams.get('tab');
  const [tab, setTab] = useState<CoachMode>(
    initialTabParam === 'chat' || initialTabParam === 'voice' || initialTabParam === 'weekly-call'
      ? initialTabParam
      : 'weekly-call'
  );
  const [selectedModel, setSelectedModel] = useState<SelectedModel>('gemini-4-hydrogen');
  const [deepReasoning, setDeepReasoning] = useState(false);
  const [enableSearch, setEnableSearch] = useState(true);
  const [coachRole, setCoachRole] = useState<CoachRole>('general');
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [micPermission, setMicPermission] = useState<MicPermissionState>('unknown');
  const [chatRecording, setChatRecording] = useState(false);
  const [chatTranscribing, setChatTranscribing] = useState(false);
  const [speakReplies, setSpeakReplies] = useState(false);
  const [activeCallMsgId, setActiveCallMsgId] = useState<string | null>(null);
  const [activeCallStage, setActiveCallStage] = useState<OutboundCallStatus>('idle');
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'model',
      text: `Hi ${state.profile.fullName.split(' ')[0]}! I am your FITSYNC Calibrate Coach powered by free-tier Gemini models & Sarvam Voice Agents. Ask about your ${metrics.safeTargetKcal} kcal plan, training form, macro swaps — or say "Call me" if you want a real AI voice call on your mobile phone.`,
      modelUsed: 'gemini-4-hydrogen',
    },
  ]);

  // Live Voice Coach refs & state (avoid stale closures in audio callbacks)
  const [voiceActive, setVoiceActive] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState<string>('Ready to start a real-time spoken session');
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [transcripts, setTranscripts] = useState<Array<{ speaker: 'You' | 'Coach'; text: string }>>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const inputCtxRef = useRef<AudioContext | null>(null);
  const outputCtxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const chatRecorderRef = useRef<MediaRecorder | null>(null);
  const chatChunksRef = useRef<Blob[]>([]);

  const profileSummary = useMemo(() => {
    const base = `Goal: ${state.profile.goalKey}, Weight: ${state.profile.weightKg} kg, Height: ${state.profile.heightCm} cm, Diet: ${state.profile.dietPreference}, Target: ${metrics.safeTargetKcal} kcal/day (P ${metrics.macros.proteinG}g / C ${metrics.macros.carbsG}g / F ${metrics.macros.fatsG}g), Conditions: ${
      state.profile.healthConditions.length > 0 ? state.profile.healthConditions.join(', ') : 'None'
    }`;
    if (cycleTrackingEnabled && cycleEngine) {
      return `${base}, Cycle Day: ${cycleEngine.currentCycleDay ?? 'Unlogged'}, Phase: ${cycleEngine.currentPhase}`;
    }
    return base;
  }, [state.profile, metrics, cycleTrackingEnabled, cycleEngine]);

  const stopVoiceSession = () => {
    if (processorRef.current) {
      try {
        processorRef.current.disconnect();
      } catch {}
      processorRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (inputCtxRef.current) {
      inputCtxRef.current.close().catch(() => {});
      inputCtxRef.current = null;
    }
    activeSourcesRef.current.forEach((src) => {
      try {
        src.stop();
      } catch {}
    });
    activeSourcesRef.current.clear();
    if (outputCtxRef.current) {
      outputCtxRef.current.close().catch(() => {});
      outputCtxRef.current = null;
    }
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {}
      wsRef.current = null;
    }
    nextStartTimeRef.current = 0;
    setVoiceActive(false);
    setVoiceStatus('Session ended');
  };

  useEffect(() => {
    const param = searchParams.get('tab');
    if (param === 'weekly-call' || param === 'chat' || param === 'voice') {
      setTab(param);
    }
  }, [searchParams]);

  useEffect(() => {
    queryMicrophonePermission().then(setMicPermission);
    return () => {
      stopVoiceSession();
      if (chatRecorderRef.current && chatRecorderRef.current.state !== 'inactive') {
        try {
          chatRecorderRef.current.stop();
        } catch {}
      }
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        try {
          window.speechSynthesis.cancel();
        } catch {}
      }
    };
  }, []);

  useEffect(() => {
    const el = chatScrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, activeCallStage, loading]);

  const switchTab = (next: CoachMode) => {
    setTab(next);
    setSearchParams({ tab: next }, { replace: true });
  };

  const handleSendChat = async (promptOverride?: string) => {
    const text = (promptOverride ?? input).trim();
    if (!text || loading) return;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      text,
    };
    const nextHistory = [...messages, userMsg];
    setMessages(nextHistory);
    if (!promptOverride) setInput('');
    setChatError(null);

    // 1. Handle conversational phone-call workflow naturally inside existing chatbot
    if (activeCallMsgId && activeCallStage === 'awaiting_confirmation') {
      const replyDecision = detectCallConfirmationReply(text);
      if (replyDecision === 'confirm') {
        setMessages((prev) => [
          ...prev.map((m) =>
            m.id === activeCallMsgId && m.callCard
              ? { ...m, callCard: { ...m.callCard, confirmSignal: m.callCard.confirmSignal + 1 } }
              : m
          ),
          {
            id: `m-${Date.now()}-confirm`,
            role: 'model',
            text: 'Submitting your outbound call request now. Please keep your phone nearby while Sarvam Voice Agents initiates the call.',
            modelUsed: 'sarvam-voice-agent',
          },
        ]);
        return;
      }
      if (replyDecision === 'cancel') {
        setMessages((prev) => [
          ...prev.map((m) =>
            m.id === activeCallMsgId && m.callCard
              ? { ...m, callCard: { ...m.callCard, cancelSignal: m.callCard.cancelSignal + 1 } }
              : m
          ),
          {
            id: `m-${Date.now()}-cancel`,
            role: 'model',
            text: 'No problem — I cancelled the outbound call request. Feel free to keep chatting here or ask anytime you want a call.',
            modelUsed: 'sarvam-voice-agent',
          },
        ]);
        setActiveCallMsgId(null);
        setActiveCallStage('idle');
        return;
      }
    }

    if (activeCallMsgId && activeCallStage === 'entering_number') {
      const candidate = extractPhoneCandidateFromText(text);
      if (candidate) {
        const validation = normalizeAndValidatePhone(candidate, '+91');
        if (!validation.valid || !validation.e164) {
          setMessages((prev) => [
            ...prev,
            {
              id: `m-${Date.now()}-badnum`,
              role: 'model',
              text: `${validation.error || 'That mobile number does not look valid.'} Please enter a valid mobile number (for example +91 9876543210) in the calling card above.`,
              modelUsed: 'sarvam-voice-agent',
            },
          ]);
          return;
        }

        const confirmCardMsgId = `m-${Date.now()}-conf`;
        setActiveCallMsgId(confirmCardMsgId);
        setActiveCallStage('awaiting_confirmation');
        setMessages((prev) => [
          ...prev,
          {
            id: confirmCardMsgId,
            role: 'model',
            text: `You are about to receive an AI-generated phone call from FITSYNC at ${validation.e164}. Do you want to proceed?`,
            modelUsed: 'sarvam-voice-agent',
            callCard: {
              initialPhoneNumber: validation.nationalNumber,
              initialCountryCode: validation.countryCode,
              initialStage: 'awaiting_confirmation',
              confirmSignal: 0,
              cancelSignal: 0,
            },
          },
        ]);
        return;
      }
    }

    if (detectOutboundCallIntent(text)) {
      const candidate = extractPhoneCandidateFromText(text);
      if (candidate) {
        const validation = normalizeAndValidatePhone(candidate, '+91');
        if (validation.valid && validation.e164) {
          const confirmCardMsgId = `m-${Date.now()}-call`;
          setActiveCallMsgId(confirmCardMsgId);
          setActiveCallStage('awaiting_confirmation');
          setMessages((prev) => [
            ...prev,
            {
              id: confirmCardMsgId,
              role: 'model',
              text: `You are about to receive an AI-generated phone call from FITSYNC at ${validation.e164}. Do you want to proceed?`,
              modelUsed: 'sarvam-voice-agent',
              callCard: {
                initialPhoneNumber: validation.nationalNumber,
                initialCountryCode: validation.countryCode,
                initialStage: 'awaiting_confirmation',
                confirmSignal: 0,
                cancelSignal: 0,
              },
            },
          ]);
          return;
        }
      }

      const callMsgId = `m-${Date.now()}-call`;
      setActiveCallMsgId(callMsgId);
      setActiveCallStage('entering_number');
      setMessages((prev) => [
        ...prev,
        {
          id: callMsgId,
          role: 'model',
          text: 'Sure! Please share your mobile number below so I can call you on your phone.',
          modelUsed: 'sarvam-voice-agent',
          callCard: {
            initialPhoneNumber: '',
            initialCountryCode: '+91',
            initialStage: 'entering_number',
            confirmSignal: 0,
            cancelSignal: 0,
          },
        },
      ]);
      return;
    }

    // 2. Standard multi-turn Gemini coach response
    setLoading(true);

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: nextHistory
            .filter((m) => m.id !== 'welcome')
            .map((m) => ({ role: m.role, text: m.text })),
          model: selectedModel,
          deepReasoning: selectedModel === 'gemini-4-hydrogen' && deepReasoning,
          enableSearch,
          coachRole,
          profileSummary,
        }),
      });
      const data = (await res.json()) as {
        reply?: string;
        sources?: ChatSource[];
        modelUsed?: string;
        error?: string;
      };
      if (!res.ok || !data.reply) {
        throw new Error(data.error || `Server error (${res.status})`);
      }
      setMessages((prev) => [
        ...prev,
        {
          id: `m-${Date.now()}`,
          role: 'model',
          text: data.reply!,
          sources: data.sources ?? [],
          modelUsed: data.modelUsed,
        },
      ]);
    } catch (err) {
      setChatError(err instanceof Error ? err.message : 'Unable to reach Gemini AI Coach.');
    } finally {
      setLoading(false);
    }
  };

  const handleWidgetAttemptUpdated = (
    msgId: string,
    _record: OutboundCallRecord | null,
    status: OutboundCallStatus
  ) => {
    setActiveCallMsgId(msgId);
    setActiveCallStage(status);
  };

  const handleEnableMicrophone = async () => {
    setChatError(null);
    setVoiceError(null);
    const res = await requestMicrophoneStream(true);
    setMicPermission(res.state);
    if (res.stream) {
      res.stream.getTracks().forEach((t) => t.stop());
    }
    if (!res.granted && res.error) {
      setChatError(res.error);
      setVoiceError(res.error);
    }
  };

  const toggleChatMicRecording = async () => {
    if (chatRecording) {
      const recorder = chatRecorderRef.current;
      if (recorder && recorder.state !== 'inactive') {
        recorder.stop();
      }
      setChatRecording(false);
      return;
    }

    setChatError(null);
    const micRes = await requestMicrophoneStream(true);
    setMicPermission(micRes.state);
    if (!micRes.granted || !micRes.stream) {
      setChatError(
        micRes.error || 'Please allow microphone access to speak with the chatbot.'
      );
      return;
    }

    const stream = micRes.stream;
    try {
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';
      const recorder = new MediaRecorder(stream, { mimeType });
      chatChunksRef.current = [];

      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) chatChunksRef.current.push(ev.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chatChunksRef.current, { type: mimeType });
        if (blob.size < 250) return;

        setChatTranscribing(true);
        try {
          const audioBase64 = await audioBlobToBase64(blob);
          const sttRes = await fetch('/api/sarvam/stt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ audioBase64, mimeType, languageCode: 'unknown' }),
          });
          const sttData = (await sttRes.json()) as { transcript?: string; error?: string };
          if (!sttRes.ok) {
            throw new Error(sttData.error || 'Speech-to-text transcription failed.');
          }
          const spoken = sttData.transcript?.trim();
          if (spoken) {
            await handleSendChat(spoken);
          } else {
            setChatError('No clear speech detected — please try speaking closer to your mic.');
          }
        } catch (err) {
          setChatError(err instanceof Error ? err.message : 'Unable to transcribe recorded speech.');
        } finally {
          setChatTranscribing(false);
        }
      };

      chatRecorderRef.current = recorder;
      recorder.start();
      setChatRecording(true);
    } catch {
      stream.getTracks().forEach((t) => t.stop());
      setChatError('Audio recording is not supported in this browser.');
      setChatRecording(false);
    }
  };

  useEffect(() => {
    if (!speakReplies || messages.length === 0) return;
    const latest = messages[messages.length - 1];
    if (latest.role !== 'model' || latest.id === 'welcome') return;
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(latest.text.slice(0, 500));
      utterance.rate = 1.02;
      window.speechSynthesis.speak(utterance);
    } catch {
      // Ignore synthesis availability issues
    }
  }, [messages, speakReplies]);

  const startVoiceSession = async () => {
    setVoiceError(null);
    setVoiceStatus('Requesting microphone permission & connecting to Gemini Live...');
    try {
      const micRes = await requestMicrophoneStream({
        sampleRate: 16000,
        channelCount: 1,
        echoCancellation: true,
      });
      setMicPermission(micRes.state);
      if (!micRes.granted || !micRes.stream) {
        setVoiceError(
          micRes.error || 'Microphone permission is required for Live Voice coaching.'
        );
        setVoiceStatus('Microphone access required');
        return;
      }
      const stream = micRes.stream;
      streamRef.current = stream;

      const inputCtx = new AudioContext({ sampleRate: 16000 });
      const outputCtx = new AudioContext({ sampleRate: 24000 });
      inputCtxRef.current = inputCtx;
      outputCtxRef.current = outputCtx;
      nextStartTimeRef.current = outputCtx.currentTime;

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/api/ai/live?goal=${encodeURIComponent(
        state.profile.goalKey
      )}&target=${encodeURIComponent(`${metrics.safeTargetKcal} kcal`)}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setVoiceActive(true);
        setVoiceStatus('Listening — speak naturally with your FITSYNC Live Coach');

        const source = inputCtx.createMediaStreamSource(stream);
        const processor = inputCtx.createScriptProcessor(4096, 1, 1);
        processorRef.current = processor;

        processor.onaudioprocess = (event) => {
          if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
          const float32 = event.inputBuffer.getChannelData(0);
          wsRef.current.send(JSON.stringify({ audio: float32ToInt16Base64(float32) }));
        };

        source.connect(processor);
        processor.connect(inputCtx.destination);
      };

      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(String(event.data)) as {
            connected?: boolean;
            audio?: string;
            inputTranscript?: string;
            outputTranscript?: string;
            interrupted?: boolean;
            error?: string;
          };

          if (payload.error) {
            setVoiceError(payload.error);
            stopVoiceSession();
            return;
          }

          if (payload.interrupted) {
            activeSourcesRef.current.forEach((s) => {
              try {
                s.stop();
              } catch {}
            });
            activeSourcesRef.current.clear();
            if (outputCtxRef.current) {
              nextStartTimeRef.current = outputCtxRef.current.currentTime;
            }
            return;
          }

          if (payload.inputTranscript) {
            setTranscripts((prev) => [...prev, { speaker: 'You', text: payload.inputTranscript! }]);
          }
          if (payload.outputTranscript) {
            setTranscripts((prev) => [
              ...prev,
              { speaker: 'Coach', text: payload.outputTranscript! },
            ]);
          }

          if (payload.audio && outputCtxRef.current) {
            const ctx = outputCtxRef.current;
            const buffer = base64Pcm24kToAudioBuffer(payload.audio, ctx);
            const src = ctx.createBufferSource();
            src.buffer = buffer;
            src.connect(ctx.destination);
            const startAt = Math.max(ctx.currentTime, nextStartTimeRef.current);
            src.start(startAt);
            nextStartTimeRef.current = startAt + buffer.duration;
            activeSourcesRef.current.add(src);
            src.onended = () => activeSourcesRef.current.delete(src);
          }
        } catch {
          // Ignore invalid JSON payload
        }
      };

      ws.onerror = () => {
        setVoiceError('Live Voice WebSocket connection failed.');
        stopVoiceSession();
      };

      ws.onclose = () => {
        setVoiceActive(false);
      };
    } catch (err) {
      setVoiceError(
        err instanceof Error
          ? err.message
          : 'Microphone access or Live Voice connection could not be started.'
      );
      stopVoiceSession();
    }
  };

  const quickPrompts = useMemo(() => {
    const base = [
      'Call me to explain my fitness plan',
      `Build a high-protein ${state.profile.dietPreference === 'Vegetarian' ? 'vegetarian' : 'balanced'} meal plan around ${metrics.safeTargetKcal} kcal`,
      'What does current sports science say about optimal weekly protein timing and hypertrophy?',
      'Give me safe joint-friendly progression cues for dumbbell goblet squats',
    ];
    if (cycleTrackingEnabled && cycleEngine) {
      base.push(`How should I pace strength training during my ${cycleEngine.currentPhase}?`);
    }
    return base;
  }, [state.profile.dietPreference, metrics.safeTargetKcal, cycleTrackingEnabled, cycleEngine]);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[var(--text-primary)] tracking-tight">
            AI Coach & Weekly Check-In
          </h1>
          <p className="text-sm text-[var(--text-secondary)] mt-0.5">
            Sarvam AI weekly progress check-in call, Gemini coaching & real-time Live Voice
          </p>
        </div>

        <div className="bg-[var(--card-surface)] p-1 rounded-full border border-[var(--border-subtle)] flex flex-wrap items-center gap-1">
          <button
            type="button"
            data-testid="coach-tab-weekly-call"
            onClick={() => switchTab('weekly-call')}
            className={`px-4 py-2 rounded-full text-xs font-bold flex items-center gap-1.5 cursor-pointer ${
              tab === 'weekly-call' ? 'bg-[var(--primary)] text-white' : 'text-[var(--text-secondary)]'
            }`}
          >
            <AppIcon name="phone" size={14} />
            <span>Sarvam Weekly Call</span>
          </button>
          <button
            type="button"
            data-testid="coach-tab-chat"
            onClick={() => switchTab('chat')}
            className={`px-4 py-2 rounded-full text-xs font-bold flex items-center gap-1.5 cursor-pointer ${
              tab === 'chat' ? 'bg-[var(--primary)] text-white' : 'text-[var(--text-secondary)]'
            }`}
          >
            <AppIcon name="sparkles" size={14} />
            <span>AI Coach Chat</span>
          </button>
          <button
            type="button"
            data-testid="coach-tab-voice"
            onClick={() => switchTab('voice')}
            className={`px-4 py-2 rounded-full text-xs font-bold flex items-center gap-1.5 cursor-pointer ${
              tab === 'voice' ? 'bg-[var(--primary)] text-white' : 'text-[var(--text-secondary)]'
            }`}
          >
            <AppIcon name="mic" size={14} />
            <span>Live Voice Coach</span>
          </button>
        </div>
      </header>

      {/* ==================== TAB 0: SARVAM AI WEEKLY CHECK-IN CALL ==================== */}
      {tab === 'weekly-call' && <SarvamCheckInCall />}

      {/* ==================== TAB 1: MULTI-TURN CHAT + SEARCH GROUNDING ==================== */}
      {tab === 'chat' && (
        <div className="space-y-4">
          {/* Controls Strip */}
          <section className="fitsync-card p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label htmlFor="ai-role-select" className="text-[11px] font-bold text-[var(--text-secondary)] block">
                Coach Persona
              </label>
              <select
                id="ai-role-select"
                value={coachRole}
                onChange={(e) => setCoachRole(e.target.value as CoachRole)}
                className="mt-1 w-full h-9 px-3 rounded-xl bg-[var(--surface-inset)] text-xs font-bold"
              >
                <option value="general">Calibrate Health Coach</option>
                <option value="nutrition">Sports Nutritionist</option>
                <option value="trainer">Strength & Biomechanics</option>
                {cycleTrackingEnabled && (
                  <option value="cycle_wellness">Cycle & Recovery Coach</option>
                )}
              </select>
            </div>

            <div>
              <label htmlFor="ai-model-select" className="text-[11px] font-bold text-[var(--text-secondary)] block">
                Free-Tier Model
              </label>
              <select
                id="ai-model-select"
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value as SelectedModel)}
                className="mt-1 w-full h-9 px-3 rounded-xl bg-[var(--surface-inset)] text-xs font-bold"
              >
                <option value="gemini-4-hydrogen">Gemini 4 Hydrogen (Smart + Search)</option>
                <option value="gemini-3.1-flash-lite">Gemini 3.1 Flash-Lite (Fast Q&A)</option>
              </select>
            </div>

            <label className="p-2.5 rounded-xl bg-[var(--surface-inset)] flex items-center justify-between cursor-pointer">
              <div>
                <span className="text-xs font-bold text-[var(--text-primary)] block">
                  Google Search Grounding
                </span>
                <span className="text-[10px] text-[var(--text-secondary)]">
                  Live web citations
                </span>
              </div>
              <input
                type="checkbox"
                checked={enableSearch}
                onChange={(e) => setEnableSearch(e.target.checked)}
                className="w-4 h-4 accent-[var(--primary)]"
              />
            </label>

            <label className="p-2.5 rounded-xl bg-[var(--surface-inset)] flex items-center justify-between cursor-pointer">
              <div>
                <span className="text-xs font-bold text-[var(--text-primary)] block">
                  Deep Reasoning
                </span>
                <span className="text-[10px] text-[var(--text-secondary)]">
                  ThinkingLevel.HIGH
                </span>
              </div>
              <input
                type="checkbox"
                disabled={selectedModel !== 'gemini-4-hydrogen'}
                checked={deepReasoning && selectedModel === 'gemini-4-hydrogen'}
                onChange={(e) => setDeepReasoning(e.target.checked)}
                className="w-4 h-4 accent-[var(--primary)]"
              />
            </label>
          </section>

          {/* Microphone & Voice Controls Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-[var(--card-surface)] border border-[var(--border-subtle)] px-4 py-2.5">
            <div className="flex items-center gap-2 text-xs">
              <AppIcon
                name={micPermission === 'denied' ? 'micOff' : 'mic'}
                size={15}
                className={
                  micPermission === 'granted'
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : micPermission === 'denied'
                      ? 'text-rose-600 dark:text-rose-400'
                      : 'text-[var(--primary)]'
                }
              />
              <span className="font-bold text-[var(--text-primary)]">
                {micPermission === 'granted'
                  ? 'Microphone enabled — tap Mic below to talk with the chatbot'
                  : micPermission === 'denied'
                    ? 'Microphone blocked by browser — allow access in site permissions'
                    : 'Allow microphone access to speak directly with the FITSYNC chatbot'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                data-testid="enable-mic-btn"
                onClick={handleEnableMicrophone}
                className={`h-8 px-3.5 rounded-full text-xs font-bold flex items-center gap-1.5 cursor-pointer border transition-colors ${
                  micPermission === 'granted'
                    ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                    : 'bg-[var(--primary)] text-white border-[var(--primary)] hover:bg-[var(--primary-hover)]'
                }`}
              >
                <AppIcon name="mic" size={13} />
                <span>
                  {micPermission === 'granted'
                    ? 'Mic Allowed'
                    : micPermission === 'denied'
                      ? 'Retry Mic Permission'
                      : 'Enable Mic'}
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  if (speakReplies && typeof window !== 'undefined' && 'speechSynthesis' in window) {
                    window.speechSynthesis.cancel();
                  }
                  setSpeakReplies((v) => !v);
                }}
                aria-pressed={speakReplies}
                className={`h-8 px-3 rounded-full text-xs font-bold flex items-center gap-1.5 cursor-pointer border ${
                  speakReplies
                    ? 'bg-[var(--primary)]/15 text-[var(--primary)] border-[var(--primary)]/30'
                    : 'bg-[var(--surface-inset)] text-[var(--text-secondary)] border-[var(--border-subtle)]'
                }`}
              >
                <AppIcon name="volume2" size={13} />
                <span>{speakReplies ? 'Voice Replies On' : 'Voice Replies Off'}</span>
              </button>
            </div>
          </div>

          {/* Quick Prompt Suggestions */}
          <div className="flex flex-wrap gap-2">
            {quickPrompts.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => handleSendChat(prompt)}
                className="px-3.5 py-2 rounded-full bg-[var(--card-surface)] border border-[var(--border-subtle)] hover:border-[var(--primary)] text-xs font-semibold text-[var(--text-primary)] cursor-pointer transition-colors"
              >
                {prompt}
              </button>
            ))}
          </div>

          {/* Chat Thread */}
          <section className="fitsync-card p-4 sm:p-5 flex flex-col gap-3 min-h-[420px] max-h-[820px]">
            <div ref={chatScrollRef} className="flex-1 overflow-y-auto space-y-3 pr-1">
              {messages.map((msg) => {
                const isUser = msg.role === 'user';
                return (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
                  >
                    <div
                      className={`max-w-[88%] rounded-2xl px-4 py-3 text-xs sm:text-sm whitespace-pre-wrap leading-relaxed ${
                        isUser
                          ? 'bg-[var(--primary)] text-white'
                          : 'bg-[var(--surface-inset)] text-[var(--text-primary)]'
                      }`}
                    >
                      {msg.text}
                    </div>
                    {msg.callCard && (
                      <div className="mt-2 w-full max-w-[600px]">
                        <SarvamOutboundCallWidget
                          compact
                          initialPhoneNumber={msg.callCard.initialPhoneNumber}
                          initialCountryCode={msg.callCard.initialCountryCode}
                          initialStage={msg.callCard.initialStage}
                          externalConfirmSignal={msg.callCard.confirmSignal}
                          externalCancelSignal={msg.callCard.cancelSignal}
                          onAttemptUpdated={(rec, status) =>
                            handleWidgetAttemptUpdated(msg.id, rec, status)
                          }
                          onCancel={() => {
                            setActiveCallMsgId(null);
                            setActiveCallStage('idle');
                          }}
                        />
                      </div>
                    )}
                    {msg.sources && msg.sources.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1.5 max-w-[85%]">
                        {msg.sources.slice(0, 4).map((src, idx) => (
                          <a
                            key={`${msg.id}-src-${idx}`}
                            href={src.uri}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[var(--card-surface)] border border-[var(--border-subtle)] text-[11px] font-semibold text-[var(--primary)] hover:underline"
                          >
                            <AppIcon name="externalLink" size={11} />
                            <span className="truncate max-w-[180px]">{src.title}</span>
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

              {loading && (
                <div className="text-xs font-semibold text-[var(--text-secondary)] animate-pulse">
                  Gemini Coach is analyzing your request...
                </div>
              )}
            </div>

            {chatError && (
              <div
                role="alert"
                className="p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-xs text-rose-900 dark:text-rose-200 flex items-center gap-2"
              >
                <AppIcon name="alert" size={15} className="text-rose-700 dark:text-rose-300 shrink-0" />
                <span>{chatError}</span>
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendChat();
              }}
              className="flex flex-wrap sm:flex-nowrap gap-2 pt-2 border-t border-[var(--border-subtle)]"
            >
              <button
                type="button"
                data-testid="ai-chat-mic-btn"
                disabled={loading || chatTranscribing}
                onClick={toggleChatMicRecording}
                aria-label={chatRecording ? 'Stop recording and send' : 'Speak into microphone'}
                className={`h-11 px-4 rounded-full text-xs font-bold flex items-center gap-1.5 shrink-0 cursor-pointer transition-colors ${
                  chatRecording
                    ? 'bg-rose-600 text-white animate-pulse'
                    : 'bg-[var(--surface-inset)] border border-[var(--border-subtle)] text-[var(--text-primary)] hover:border-[var(--primary)]'
                }`}
              >
                <AppIcon name={chatRecording ? 'micOff' : 'mic'} size={15} />
                <span>
                  {chatTranscribing
                    ? 'Transcribing...'
                    : chatRecording
                      ? 'Stop & Send'
                      : 'Speak'}
                </span>
              </button>
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Type or click Speak — ask about nutrition, workouts, or say 'Call me'..."
                className="flex-1 min-w-[200px] h-11 px-4 rounded-full bg-[var(--surface-inset)] text-sm outline-none"
              />
              <button
                type="submit"
                data-testid="ai-chat-submit-btn"
                disabled={loading || chatTranscribing || !input.trim()}
                className="h-11 px-5 rounded-full bg-[var(--primary)] hover:bg-[var(--primary-hover)] disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <AppIcon name="send" size={15} />
                <span>Send</span>
              </button>
            </form>
          </section>
        </div>
      )}

      {/* ==================== TAB 2: LIVE VOICE COACH ==================== */}
      {tab === 'voice' && (
        <section className="fitsync-card p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div
                className={`w-12 h-12 rounded-2xl flex items-center justify-center ${
                  voiceActive
                    ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 animate-pulse'
                    : 'bg-[var(--surface-inset)] text-[var(--primary)]'
                }`}
              >
                <AppIcon name={voiceActive ? 'volume2' : 'mic'} size={22} />
              </div>
              <div>
                <h2 className="text-base font-extrabold text-[var(--text-primary)]">
                  Live Voice Session (gemini-3.8-live)
                </h2>
                <p className="text-xs text-[var(--text-secondary)]">{voiceStatus}</p>
              </div>
            </div>

            {!voiceActive ? (
              <button
                type="button"
                onClick={startVoiceSession}
                className="h-11 px-6 rounded-full bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white text-xs font-bold flex items-center gap-2 cursor-pointer"
              >
                <AppIcon name="mic" size={16} />
                <span>Start Voice Coaching</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={stopVoiceSession}
                className="h-11 px-6 rounded-full bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center gap-2 cursor-pointer"
              >
                <AppIcon name="micOff" size={16} />
                <span>End Voice Session</span>
              </button>
            )}
          </div>

          {voiceError && (
            <div
              role="alert"
              className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-xs text-rose-900 dark:text-rose-200 flex items-center gap-2"
            >
              <AppIcon name="alert" size={16} className="text-rose-700 dark:text-rose-300 shrink-0" />
              <span>{voiceError}</span>
            </div>
          )}

          <div className="rounded-2xl bg-[var(--surface-inset)] p-4 min-h-[220px] max-h-[340px] overflow-y-auto space-y-2.5">
            {transcripts.length === 0 ? (
              <p className="text-xs text-[var(--text-secondary)] text-center py-12">
                Press <strong>Start Voice Coaching</strong> and allow microphone access to talk hands-free during sets or meal prep.
              </p>
            ) : (
              transcripts.map((t, idx) => (
                <div key={idx} className="text-xs">
                  <strong
                    className={
                      t.speaker === 'Coach' ? 'text-[var(--primary)]' : 'text-[var(--text-primary)]'
                    }
                  >
                    {t.speaker}:{' '}
                  </strong>
                  <span className="text-[var(--text-primary)]">{t.text}</span>
                </div>
              ))
            )}
          </div>
        </section>
      )}
    </div>
  );
}
