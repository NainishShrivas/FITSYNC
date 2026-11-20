import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI, LiveServerMessage, Modality, ThinkingLevel } from '@google/genai';
import { WebSocketServer } from 'ws';
import {
  getSarvamOutboundReadiness,
  initiateSarvamOutboundCall,
  OutboundCallManager,
  readSarvamOutboundEnvConfig,
  refreshSarvamAttemptStatus,
  sanitizeOutboundRecord,
  verifySarvamWebhookSignature,
} from './src/server/sarvamOutbound';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function resolvePort(): number {
  const portFlagIdx = process.argv.indexOf('--port');
  if (portFlagIdx !== -1 && process.argv[portFlagIdx + 1]) {
    const parsed = Number(process.argv[portFlagIdx + 1]);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return Number(process.env.PORT || 3000);
}

const PORT = resolvePort();

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured in Settings > Secrets.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function getSarvamApiKey(): string {
  const apiKey = process.env.SARVAM_API_KEY?.trim();
  if (!apiKey || apiKey === 'MY_SARVAM_API_KEY') {
    throw new Error('SARVAM_API_KEY is not configured on the server.');
  }
  return apiKey;
}

const FEEDBACK_DATA_DIR = path.resolve(__dirname, '.data');
const FEEDBACK_DATA_FILE = path.join(FEEDBACK_DATA_DIR, 'weekly-feedback.json');
const weeklyFeedbackByUser = new Map<string, unknown[]>();

function loadPersistedFeedbackStore(): void {
  try {
    if (!fs.existsSync(FEEDBACK_DATA_FILE)) return;
    const raw = fs.readFileSync(FEEDBACK_DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Record<string, unknown[]>;
    for (const [k, v] of Object.entries(parsed)) {
      if (Array.isArray(v)) weeklyFeedbackByUser.set(k, v);
    }
  } catch {
    // Ignore corrupt cache file cleanly
  }
}

function savePersistedFeedbackStore(): void {
  try {
    if (!fs.existsSync(FEEDBACK_DATA_DIR)) {
      fs.mkdirSync(FEEDBACK_DATA_DIR, { recursive: true });
    }
    const obj: Record<string, unknown[]> = {};
    for (const [k, v] of weeklyFeedbackByUser.entries()) {
      obj[k] = v;
    }
    fs.writeFileSync(FEEDBACK_DATA_FILE, JSON.stringify(obj, null, 2), 'utf8');
  } catch {
    // Non-fatal in read-only sandboxes
  }
}

loadPersistedFeedbackStore();

async function callSarvamChat(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  maxTokens = 700,
  temperature = 0.3
): Promise<string> {
  const apiKey = getSarvamApiKey();
  const res = await fetch('https://api.sarvam.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-subscription-key': apiKey,
    },
    body: JSON.stringify({
      model: 'sarvam-105b-conversations',
      messages,
      max_tokens: maxTokens,
      temperature,
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Sarvam AI chat error (${res.status}): ${errText.slice(0, 220)}`);
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>;
  };
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error('Sarvam AI returned an empty response.');
  }
  return content;
}

async function synthesizeSarvamSpeech(
  text: string,
  languageCode = 'en-IN',
  speaker = 'shubh'
): Promise<{ audioBase64: string | null; audioMime: string }> {
  try {
    const apiKey = getSarvamApiKey();
    const trimmed = text.replace(/\s+/g, ' ').trim().slice(0, 480);
    if (!trimmed) return { audioBase64: null, audioMime: 'audio/mpeg' };
    const allowedSpeakers = new Set(['shubh', 'priya', 'rahul', 'ritu']);
    const safeSpeaker = allowedSpeakers.has(speaker) ? speaker : 'shubh';

    const res = await fetch('https://api.sarvam.ai/text-to-speech', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-subscription-key': apiKey,
      },
      body: JSON.stringify({
        text: trimmed,
        target_language_code: languageCode || 'en-IN',
        speaker: safeSpeaker,
        model: 'bulbul:v3',
        output_audio_codec: 'mp3',
        pace: 1.0,
      }),
    });
    if (!res.ok) {
      return { audioBase64: null, audioMime: 'audio/mpeg' };
    }
    const json = (await res.json()) as { audios?: string[] };
    const first = json.audios?.[0] ?? null;
    return { audioBase64: first, audioMime: 'audio/mpeg' };
  } catch {
    return { audioBase64: null, audioMime: 'audio/mpeg' };
  }
}

function extractJsonObject(raw: string): Record<string, unknown> | null {
  const cleaned = raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  try {
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
      } catch {
        return null;
      }
    }
    return null;
  }
}

// Isolated server-side store for female cycle health records (never shared with general analytics)
const isolatedCycleStore = new Map<string, unknown>();

const outboundCallManager = new OutboundCallManager(true);

async function startServer() {
  const app = express();
  app.use(
    express.json({
      limit: '10mb',
      verify: (req, _res, buf) => {
        (req as express.Request & { rawBody?: string }).rawBody = buf.toString('utf8');
      },
    })
  );

  // Female-only guard middleware for all /api/cycle/* endpoints
  const requireFemaleGender: express.RequestHandler = (req, res, next) => {
    const headerGender = String(req.headers['x-fitsync-gender'] ?? '').toLowerCase();
    const bodyGender =
      typeof req.body === 'object' && req.body !== null && 'gender' in req.body
        ? String((req.body as { gender?: unknown }).gender ?? '').toLowerCase()
        : '';
    const effectiveGender = headerGender || bodyGender;
    if (effectiveGender !== 'female') {
      res.status(403).json({
        error: 'Cycle tracking endpoints are strictly restricted to profiles with gender === "female".',
      });
      return;
    }
    next();
  };

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'fitsync-calibrate' });
  });

  app.get('/api/cycle/state', requireFemaleGender, (req, res) => {
    const userKey = String(req.headers['x-fitsync-user'] ?? 'default');
    res.json({ data: isolatedCycleStore.get(userKey) ?? null });
  });

  app.put('/api/cycle/state', requireFemaleGender, (req, res) => {
    const userKey = String(req.headers['x-fitsync-user'] ?? 'default');
    const payload = (req.body as { cycleState?: unknown })?.cycleState ?? null;
    if (!payload) {
      res.status(400).json({ error: 'Missing cycleState payload.' });
      return;
    }
    isolatedCycleStore.set(userKey, payload);
    res.json({ ok: true });
  });

  app.delete('/api/cycle/state', requireFemaleGender, (req, res) => {
    const userKey = String(req.headers['x-fitsync-user'] ?? 'default');
    isolatedCycleStore.delete(userKey);
    res.json({ ok: true, deleted: true });
  });

  // ==================== SARVAM AI WEEKLY CHECK-IN CALL & FEEDBACK ROUTES ====================
  app.get('/api/sarvam/status', (_req, res) => {
    const configured = Boolean(
      process.env.SARVAM_API_KEY && process.env.SARVAM_API_KEY !== 'MY_SARVAM_API_KEY'
    );
    res.json({ ok: true, configured, models: { chat: 'sarvam-105b-conversations', tts: 'bulbul:v3', stt: 'saaras:v3' } });
  });

  app.get('/api/sarvam/feedback', (req, res) => {
    const userKey = String(req.headers['x-fitsync-user'] ?? 'default');
    res.json({ items: weeklyFeedbackByUser.get(userKey) ?? [] });
  });

  app.post('/api/sarvam/feedback', (req, res) => {
    const userKey = String(req.headers['x-fitsync-user'] ?? 'default');
    const item = (req.body as { feedback?: unknown })?.feedback;
    if (!item || typeof item !== 'object') {
      res.status(400).json({ error: 'Missing feedback payload.' });
      return;
    }
    const existing = weeklyFeedbackByUser.get(userKey) ?? [];
    const itemId = (item as { id?: string }).id;
    const deduped = itemId ? existing.filter((e) => (e as { id?: string }).id !== itemId) : existing;
    const updated = [item, ...deduped].slice(0, 30);
    weeklyFeedbackByUser.set(userKey, updated);
    savePersistedFeedbackStore();
    res.json({ ok: true, count: updated.length });
  });

  app.post('/api/sarvam/checkin/start', async (req, res) => {
    try {
      const {
        userName = 'Athlete',
        languageCode = 'en-IN',
        speaker = 'shubh',
        profileSummary = '',
        withAudio = true,
      } = req.body as {
        userName?: string;
        languageCode?: string;
        speaker?: string;
        profileSummary?: string;
        withAudio?: boolean;
      };

      const firstName = String(userName).trim().split(' ')[0] || 'there';
      const languageNames: Record<string, string> = {
        'en-IN': 'natural Indian English',
        'hi-IN': 'natural conversational Hindi (with common English fitness terms)',
        'ta-IN': 'natural conversational Tamil',
        'te-IN': 'natural conversational Telugu',
        'kn-IN': 'natural conversational Kannada',
        'mr-IN': 'natural conversational Marathi',
        'bn-IN': 'natural conversational Bengali',
      };
      const targetLangDesc = languageNames[languageCode] ?? 'natural Indian English';

      const systemPrompt = `You are Sarvam Coach calling ${firstName} from FITSYNC for their Weekly Wellness & Fitness Check-In Call.
Speak in ${targetLangDesc}. Keep your spoken greeting warm, concise (2-3 short sentences, under 360 characters), and conversational.
CRITICAL: You MUST explicitly tell ${firstName} that you are asking for their weekly progress and feedback specifically to improve their exercise and health, and ask if they faced any problems with their diet, health, or workouts this week.
User metrics context: ${profileSummary || 'Standard FITSYNC plan'}.`;

      const reply = await callSarvamChat(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: 'Start the weekly check-in call now.' },
        ],
        240,
        0.4
      );

      const tts = withAudio
        ? await synthesizeSarvamSpeech(reply, languageCode, speaker)
        : { audioBase64: null, audioMime: 'audio/mpeg' };

      res.json({
        reply,
        audioBase64: tts.audioBase64,
        audioMime: tts.audioMime,
        languageCode,
        speaker,
        modelUsed: 'sarvam-105b-conversations',
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to start Sarvam AI check-in call.';
      res.status(message.includes('SARVAM_API_KEY') ? 500 : 502).json({ error: message });
    }
  });

  app.post('/api/sarvam/checkin/turn', async (req, res) => {
    try {
      const {
        transcript = [],
        userMessage,
        languageCode = 'en-IN',
        speaker = 'shubh',
        profileSummary = '',
        finalizeNow = false,
        withAudio = true,
      } = req.body as {
        transcript?: Array<{ role: 'coach' | 'user'; text: string }>;
        userMessage?: string;
        languageCode?: string;
        speaker?: string;
        profileSummary?: string;
        finalizeNow?: boolean;
        withAudio?: boolean;
      };

      const cleanMsg = String(userMessage ?? '').trim();
      if (!cleanMsg && !finalizeNow) {
        res.status(400).json({ error: 'User message is required.' });
        return;
      }

      const fullHistory = cleanMsg
        ? [...transcript, { role: 'user' as const, text: cleanMsg }]
        : [...transcript];
      const userTurnCount = fullHistory.filter((t) => t.role === 'user').length;

      const languageNames: Record<string, string> = {
        'en-IN': 'natural Indian English',
        'hi-IN': 'natural conversational Hindi',
        'ta-IN': 'natural conversational Tamil',
        'te-IN': 'natural conversational Telugu',
        'kn-IN': 'natural conversational Kannada',
        'mr-IN': 'natural conversational Marathi',
        'bn-IN': 'natural conversational Bengali',
      };
      const targetLangDesc = languageNames[languageCode] ?? 'natural Indian English';

      const systemPrompt = `You are Sarvam Coach conducting a Weekly Fitness, Diet & Health Check-In Call for FITSYNC.
Current user profile context: ${profileSummary || 'Standard profile'}.
Speak in ${targetLangDesc}.

Your job:
1. Acknowledge the user's feedback warmly and remind them you are asking specifically to improve their exercise, diet, and health.
2. Check if they have shared enough across weekly progress, diet problems, health/pain issues, and exercise difficulty. If ${finalizeNow ? 'TRUE (finalize now!)' : userTurnCount >= 2 ? 'user already answered 2+ turns or covered their issues' : 'they only answered briefly and haven\'t mentioned diet/health/exercise'}, decide whether to ask 1 brief clarifying follow-up OR conclude and auto-adjust their plan.
3. Return ONLY valid JSON (no markdown fences) matching this exact TypeScript shape:
{
  "spokenReply": "2-3 concise spoken sentences (< 380 chars) in ${targetLangDesc}. If shouldConclude is true, explicitly confirm their feedback is saved and their workout/diet/health plan is being updated automatically.",
  "shouldConclude": boolean,
  "summary": {
    "weeklyProgressSummary": "concise summary of weekly progress",
    "dietIssue": "any diet/hunger/digestion/food issue reported, or 'None reported'",
    "healthIssue": "any pain/health/energy/sleep/cycle issue reported, or 'None reported'",
    "exerciseIssue": "any workout/schedule/intensity/time issue reported, or 'None reported'",
    "overallFeedback": "overall takeaway",
    "sentiment": "great" | "mixed" | "struggling",
    "aiSummary": "1-2 sentence clinical summary of what was reported and improved"
  },
  "recommendedChanges": {
    "addHealthConditions": ["optional: only from 'Joint Pain / Knee Issues', 'Hypertension / High BP', 'Diabetes Type 2', 'Asthma', 'Kidney Stones'"],
    "calorieDeltaKcal": number_or_0,
    "sessionDurationMins": number_or_null,
    "trainingDaysPerWeek": number_or_null,
    "preferredTimeOfDay": "morning" | "afternoon" | "evening" | null,
    "dietPreference": "Vegetarian" | "Non-Vegetarian" | null,
    "lowImpactOnly": boolean,
    "extraWarmupMins": number_or_null,
    "waterBoostL": number_or_0,
    "addHabits": ["optional habit strings like 'Drink 2L of water' or '8 hours of sleep' or 'Stretch after workout'"],
    "easeGoalDeficit": boolean,
    "increaseChallenge": boolean
  }
}`;

      const chatMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
        { role: 'system', content: systemPrompt },
      ];
      for (const turn of fullHistory) {
        chatMessages.push({
          role: turn.role === 'coach' ? 'assistant' : 'user',
          content: turn.text,
        });
      }
      if (finalizeNow && !cleanMsg) {
        chatMessages.push({
          role: 'user',
          content: 'Please wrap up the check-in, save my feedback, and summarize the automatic fixes for my plan.',
        });
      }

      const rawOutput = await callSarvamChat(chatMessages, 650, 0.2);
      const parsed = extractJsonObject(rawOutput);

      const spokenReply =
        typeof parsed?.spokenReply === 'string' && parsed.spokenReply.trim()
          ? parsed.spokenReply.trim()
          : 'Thank you for sharing your weekly feedback! I have saved your notes to improve your exercise and health, and I am automatically calibrating your plan now.';

      const shouldConclude =
        finalizeNow ||
        Boolean(parsed?.shouldConclude) ||
        userTurnCount >= 3;

      const rawSummary = (parsed?.summary as Record<string, unknown> | undefined) ?? {};
      const summary = {
        weeklyProgressSummary: String(rawSummary.weeklyProgressSummary || cleanMsg || 'Weekly check-in completed'),
        dietIssue: String(rawSummary.dietIssue || 'None reported'),
        healthIssue: String(rawSummary.healthIssue || 'None reported'),
        exerciseIssue: String(rawSummary.exerciseIssue || 'None reported'),
        overallFeedback: String(rawSummary.overallFeedback || cleanMsg || 'Saved via Sarvam AI Check-In'),
        sentiment: (['great', 'mixed', 'struggling'].includes(String(rawSummary.sentiment))
          ? String(rawSummary.sentiment)
          : 'mixed') as 'great' | 'mixed' | 'struggling',
        aiSummary: String(
          rawSummary.aiSummary ||
            'Stored user feedback via Sarvam AI check-in call and queued automatic calibration updates.'
        ),
      };

      const rawRec = (parsed?.recommendedChanges as Record<string, unknown> | undefined) ?? {};
      const recommendedChanges = {
        addHealthConditions: Array.isArray(rawRec.addHealthConditions)
          ? rawRec.addHealthConditions.map(String)
          : undefined,
        calorieDeltaKcal:
          typeof rawRec.calorieDeltaKcal === 'number' && rawRec.calorieDeltaKcal !== 0
            ? rawRec.calorieDeltaKcal
            : undefined,
        sessionDurationMins:
          typeof rawRec.sessionDurationMins === 'number' ? rawRec.sessionDurationMins : undefined,
        trainingDaysPerWeek:
          typeof rawRec.trainingDaysPerWeek === 'number' ? rawRec.trainingDaysPerWeek : undefined,
        preferredTimeOfDay:
          rawRec.preferredTimeOfDay === 'morning' ||
          rawRec.preferredTimeOfDay === 'afternoon' ||
          rawRec.preferredTimeOfDay === 'evening'
            ? rawRec.preferredTimeOfDay
            : undefined,
        dietPreference:
          rawRec.dietPreference === 'Vegetarian' || rawRec.dietPreference === 'Non-Vegetarian'
            ? rawRec.dietPreference
            : undefined,
        lowImpactOnly: typeof rawRec.lowImpactOnly === 'boolean' ? rawRec.lowImpactOnly : undefined,
        extraWarmupMins:
          typeof rawRec.extraWarmupMins === 'number' ? rawRec.extraWarmupMins : undefined,
        waterBoostL:
          typeof rawRec.waterBoostL === 'number' && rawRec.waterBoostL > 0
            ? rawRec.waterBoostL
            : undefined,
        addHabits: Array.isArray(rawRec.addHabits) ? rawRec.addHabits.map(String) : undefined,
        easeGoalDeficit: Boolean(rawRec.easeGoalDeficit),
        increaseChallenge: Boolean(rawRec.increaseChallenge),
      };

      const tts = withAudio
        ? await synthesizeSarvamSpeech(spokenReply, languageCode, speaker)
        : { audioBase64: null, audioMime: 'audio/mpeg' };

      res.json({
        spokenReply,
        audioBase64: tts.audioBase64,
        audioMime: tts.audioMime,
        shouldConclude,
        summary,
        recommendedChanges,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sarvam AI turn processing failed.';
      res.status(message.includes('SARVAM_API_KEY') ? 500 : 502).json({ error: message });
    }
  });

  app.post('/api/sarvam/stt', async (req, res) => {
    try {
      const { audioBase64, mimeType = 'audio/webm', languageCode = 'unknown' } = req.body as {
        audioBase64?: string;
        mimeType?: string;
        languageCode?: string;
      };
      if (!audioBase64) {
        res.status(400).json({ error: 'Missing recorded audio payload.' });
        return;
      }

      const apiKey = getSarvamApiKey();
      const buffer = Buffer.from(audioBase64, 'base64');
      const ext = mimeType.includes('wav')
        ? 'wav'
        : mimeType.includes('mp4') || mimeType.includes('m4a')
          ? 'm4a'
          : mimeType.includes('ogg')
            ? 'ogg'
            : 'webm';

      const formData = new FormData();
      formData.append('file', new Blob([buffer], { type: mimeType }), `checkin.${ext}`);
      formData.append('model', 'saaras:v3');
      formData.append('mode', 'transcribe');
      if (languageCode && languageCode !== 'unknown') {
        formData.append('language_code', languageCode);
      }

      const sttRes = await fetch('https://api.sarvam.ai/speech-to-text', {
        method: 'POST',
        headers: {
          'api-subscription-key': apiKey,
        },
        body: formData,
      });

      if (!sttRes.ok) {
        const errText = await sttRes.text();
        throw new Error(`Sarvam STT error (${sttRes.status}): ${errText.slice(0, 200)}`);
      }

      const data = (await sttRes.json()) as { transcript?: string; language_code?: string };
      res.json({
        transcript: data.transcript ?? '',
        languageCode: data.language_code ?? languageCode,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Speech-to-text transcription failed.';
      res.status(message.includes('SARVAM_API_KEY') ? 500 : 502).json({ error: message });
    }
  });

  // ==================== SARVAM AI VOICE AGENTS OUTBOUND PHONE CALLING ====================
  app.get('/api/sarvam/outbound/config', (_req, res) => {
    res.json(getSarvamOutboundReadiness());
  });

  app.get('/api/sarvam/outbound/history', (req, res) => {
    const userKey = String(req.headers['x-fitsync-user'] ?? req.ip ?? 'default');
    res.json({
      items: outboundCallManager.listAttemptsForUser(userKey),
    });
  });

  app.post('/api/sarvam/outbound/initiate', async (req, res) => {
    const userKey = String(req.headers['x-fitsync-user'] ?? req.ip ?? 'default');
    const body = (req.body ?? {}) as {
      phoneNumber?: unknown;
      countryCode?: unknown;
      confirmed?: unknown;
    };

    const result = await initiateSarvamOutboundCall(outboundCallManager, {
      userKey,
      phoneNumber: String(body.phoneNumber ?? ''),
      countryCode: typeof body.countryCode === 'string' ? body.countryCode : '+91',
      confirmed: body.confirmed === true,
    });

    res.status(result.statusCode).json(result.body);
  });

  app.get('/api/sarvam/outbound/status/:attemptId', async (req, res) => {
    const attemptId = String(req.params.attemptId ?? '').trim();
    if (!attemptId) {
      res.status(400).json({ error: 'Missing attemptId parameter.' });
      return;
    }
    const result = await refreshSarvamAttemptStatus(outboundCallManager, attemptId);
    res.status(result.statusCode).json(result.body);
  });

  app.post('/api/sarvam/outbound/webhook', (req, res) => {
    const cfg = readSarvamOutboundEnvConfig();
    const rawBody =
      (req as express.Request & { rawBody?: string }).rawBody ?? JSON.stringify(req.body ?? {});
    const signature = req.header('Sarvam-Signature') ?? req.header('x-sarvam-signature');
    const timestamp = req.header('Sarvam-Timestamp') ?? req.header('x-sarvam-timestamp');

    if (!verifySarvamWebhookSignature(rawBody, signature, timestamp, cfg.webhookSecret)) {
      res.status(401).json({ error: 'Invalid Sarvam webhook signature.' });
      return;
    }

    const payload = (req.body ?? {}) as Record<string, unknown>;
    const attemptId = String(payload.attempt_id ?? payload.attemptId ?? '').trim();
    if (!attemptId) {
      res.status(400).json({ error: 'Missing attempt_id in webhook payload.' });
      return;
    }

    const providerStatus =
      typeof payload.status === 'string'
        ? payload.status
        : typeof payload.event === 'string'
          ? payload.event
          : null;
    const connectivityStatus =
      typeof payload.connectivity_status === 'string'
        ? payload.connectivity_status
        : null;
    const durationSec =
      typeof payload.duration === 'number'
        ? payload.duration
        : typeof payload.duration_seconds === 'number'
          ? payload.duration_seconds
          : null;
    const failureReason =
      typeof payload.failure_reason === 'string' && payload.failure_reason.trim()
        ? payload.failure_reason.trim()
        : null;
    const interactionId =
      typeof payload.interaction_id === 'string' ? payload.interaction_id : null;

    let transcriptSummary: string | null = null;
    if (typeof payload.interaction_transcript === 'string' && payload.interaction_transcript.trim()) {
      transcriptSummary = payload.interaction_transcript.trim().slice(0, 500);
    } else if (Array.isArray(payload.interaction_transcript)) {
      transcriptSummary = payload.interaction_transcript
        .map((t) =>
          typeof t === 'object' && t !== null
            ? `${String((t as { role?: unknown }).role ?? 'speaker')}: ${String((t as { text?: unknown; content?: unknown }).text ?? (t as { content?: unknown }).content ?? '')}`
            : String(t)
        )
        .join(' | ')
        .slice(0, 500);
    }

    const updated = outboundCallManager.updateFromProviderEvent(attemptId, {
      providerStatus,
      connectivityStatus,
      durationSec,
      failureReason,
      interactionId,
      transcriptSummary,
    });

    res.json({
      ok: true,
      attempt: updated ? sanitizeOutboundRecord(updated) : null,
    });
  });

  // Multi-Turn AI Coach Chat + Optional Google Search Grounding (Free-tier Gemini models)
  app.post('/api/ai/chat', async (req, res) => {
    try {
      const {
        messages,
        model = 'gemini-4-hydrogen',
        deepReasoning = false,
        enableSearch = false,
        coachRole = 'general',
        profileSummary = '',
      } = req.body as {
        messages?: Array<{ role: 'user' | 'model'; text: string }>;
        model?: 'gemini-4-hydrogen' | 'gemini-3.1-flash-lite';
        deepReasoning?: boolean;
        enableSearch?: boolean;
        coachRole?: string;
        profileSummary?: string;
      };

      if (!Array.isArray(messages) || messages.length === 0) {
        res.status(400).json({ error: 'Conversation messages are required.' });
        return;
      }

      // Only allow verified free-tier models
      const allowedModels = new Set(['gemini-4-hydrogen', 'gemini-3.1-flash-lite']);
      const selectedModel = enableSearch
        ? 'gemini-4-hydrogen'
        : allowedModels.has(model)
          ? model
          : 'gemini-4-hydrogen';

      const roleInstructions: Record<string, string> = {
        nutrition:
          'You are a precision sports nutritionist for FITSYNC. Focus on macros, leucine targets, glycemic index, hydration, and practical food swaps.',
        trainer:
          'You are an evidence-based strength & conditioning coach for FITSYNC. Focus on safe progressive overload, biomechanics, form cues, and Net MET pacing.',
        cycle_wellness:
          'You are a science-oriented wellness & recovery coach. Align training intensity, sleep, and micronutrient recovery with energy fluctuations without offering contraception advice.',
        general:
          'You are the FITSYNC Calibrate Health coach. Give concise, actionable, science-backed guidance tailored to the user profile.',
      };

      const systemInstruction = `${roleInstructions[coachRole] ?? roleInstructions.general}\n\nUser Context:\n${profileSummary || 'Standard FITSYNC profile'}\n\nKeep answers clear, structured with short bullets, and grounded in physiology.`;

      const ai = getGeminiClient();

      // Build multi-turn contents
      const contents = messages.map((m) => ({
        role: m.role === 'model' ? 'model' : 'user',
        parts: [{ text: m.text }],
      }));

      const config: Record<string, unknown> = {
        systemInstruction,
      };

      if (enableSearch && selectedModel === 'gemini-4-hydrogen') {
        config.tools = [{ googleSearch: {} }];
      }

      if (selectedModel === 'gemini-4-hydrogen' && deepReasoning) {
        config.thinkingConfig = {
          thinkingLevel: ThinkingLevel.HIGH,
        };
      }

      const response = await ai.models.generateContent({
        model: selectedModel,
        contents,
        config,
      });

      const rawChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
      const sources = rawChunks
        .map((chunk) => {
          const web = (chunk as { web?: { uri?: string; title?: string } }).web;
          if (!web?.uri) return null;
          return { uri: web.uri, title: web.title || web.uri };
        })
        .filter((s): s is { uri: string; title: string } => s !== null);

      res.json({
        reply: response.text ?? '',
        sources,
        modelUsed: selectedModel,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Gemini API request failed.';
      const status = message.includes('GEMINI_API_KEY') ? 500 : 502;
      res.status(status).json({ error: message });
    }
  });

  const server = http.createServer(app);

  // Real-Time Voice Coach WebSocket Bridge (gemini-3.8-live)
  const wss = new WebSocketServer({ server, path: '/api/ai/live' });
  wss.on('connection', async (clientWs, req) => {
    let liveSession: Awaited<ReturnType<GoogleGenAI['live']['connect']>> | null = null;
    try {
      const url = new URL(req.url || '/api/ai/live', `http://${req.headers.host || 'localhost'}`);
      const goal = url.searchParams.get('goal') || 'Fitness & Recovery';
      const target = url.searchParams.get('target') || '2000 kcal';

      const ai = getGeminiClient();
      liveSession = await ai.live.connect({
        model: 'gemini-3.8-live',
        config: {
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
          },
          systemInstruction: `You are the FITSYNC Live Voice Coach. Keep spoken coaching energetic, supportive, and concise (2-3 sentences per turn). User goal: ${goal}, daily calorie target: ${target}.`,
        },
        callbacks: {
          onopen: () => {
            if (clientWs.readyState === clientWs.OPEN) {
              clientWs.send(JSON.stringify({ connected: true }));
            }
          },
          onmessage: (message: LiveServerMessage) => {
            if (clientWs.readyState !== clientWs.OPEN) return;
            const content = message.serverContent;
            if (content?.inputTranscription?.text) {
              clientWs.send(JSON.stringify({ inputTranscript: content.inputTranscription.text }));
            }
            if (content?.outputTranscription?.text) {
              clientWs.send(JSON.stringify({ outputTranscript: content.outputTranscription.text }));
            }
            for (const part of content?.modelTurn?.parts ?? []) {
              if (part.inlineData?.data) {
                clientWs.send(JSON.stringify({ audio: part.inlineData.data }));
              }
            }
            if (content?.interrupted) {
              clientWs.send(JSON.stringify({ interrupted: true }));
            }
          },
          onerror: (err) => {
            if (clientWs.readyState === clientWs.OPEN) {
              clientWs.send(JSON.stringify({ error: String((err as { message?: string })?.message || 'Live API error') }));
            }
          },
        },
      });

      clientWs.on('message', (raw) => {
        if (!liveSession) return;
        try {
          const parsed = JSON.parse(raw.toString()) as { audio?: string; text?: string };
          if (parsed.audio) {
            liveSession.sendRealtimeInput({
              audio: { data: parsed.audio, mimeType: 'audio/pcm;rate=16000' },
            });
          } else if (parsed.text) {
            liveSession.sendRealtimeInput({ text: parsed.text });
          }
        } catch {
          // Ignore malformed frame
        }
      });

      clientWs.on('close', () => {
        try {
          liveSession?.close();
        } catch {
          // Ignore close cleanup errors
        }
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to start Gemini Live session.';
      if (clientWs.readyState === clientWs.OPEN) {
        clientWs.send(JSON.stringify({ error: message }));
        clientWs.close();
      }
    }
  });

  let viteServer: { close: () => Promise<void>; middlewares: express.RequestHandler } | null = null;

  if (process.env.NODE_ENV !== 'production') {
    const vitePromise = (async () => {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: {
          middlewareMode: true,
          hmr: false,
          watch: null,
        },
        appType: 'spa',
      });
      viteServer = vite;
      return vite;
    })();

    app.use(async (req, res, next) => {
      try {
        const vite = await vitePromise;
        vite.middlewares(req, res, next);
      } catch (err) {
        next(err);
      }
    });
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`FITSYNC server running on http://localhost:${PORT}`);
  });

  const shutdown = () => {
    wss.close();
    viteServer?.close().catch(() => {});
    server.close(() => process.exit(0));
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

startServer();
