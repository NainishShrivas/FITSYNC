import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { OutboundCallConfigReadiness, OutboundCallRecord } from '../types/fitsync';
import { maskE164Phone, normalizeAndValidatePhone } from '../utils/phoneValidation';

export interface SarvamOutboundEnvConfig {
  apiKey: string;
  orgId: string;
  workspaceId: string;
  agentId: string;
  agentVersion: number | null;
  rawAgentVersion: string;
  connectionId: string;
  agentPhoneNumber: string;
  webhookSecret: string;
  webhookUrl: string | null;
}

export interface StoredOutboundCallAttempt extends OutboundCallRecord {
  userKey: string;
  phoneHash: string;
}

export type MappedCallStatus = StoredOutboundCallAttempt['status'];

const DATA_DIR = path.resolve(process.cwd(), '.data');
const OUTBOUND_STORE_FILE = path.join(DATA_DIR, 'outbound-calls.json');

const DUPLICATE_COOLDOWN_MS = 120_000;
const USER_WINDOW_MS = 15 * 60_000;
const MAX_USER_CALLS_PER_WINDOW = 3;

function hashPhone(e164: string): string {
  return crypto.createHash('sha256').update(e164).digest('hex').slice(0, 24);
}

function isPlaceholder(val: string | undefined): boolean {
  const trimmed = (val ?? '').trim();
  return (
    !trimmed ||
    trimmed === 'MY_SARVAM_API_KEY' ||
    trimmed === 'MY_APP_URL' ||
    trimmed.startsWith('YOUR_')
  );
}

export function readSarvamOutboundEnvConfig(env: NodeJS.ProcessEnv = process.env): SarvamOutboundEnvConfig {
  const apiKey = isPlaceholder(env.SARVAM_API_KEY) ? '' : env.SARVAM_API_KEY!.trim();
  const orgId = isPlaceholder(env.SARVAM_ORG_ID) ? '' : env.SARVAM_ORG_ID!.trim();
  const workspaceId = isPlaceholder(env.SARVAM_WORKSPACE_ID) ? '' : env.SARVAM_WORKSPACE_ID!.trim();
  const agentId = isPlaceholder(env.SARVAM_AGENT_ID) ? '' : env.SARVAM_AGENT_ID!.trim();
  const rawAgentVersion = isPlaceholder(env.SARVAM_AGENT_VERSION) ? '' : env.SARVAM_AGENT_VERSION!.trim();
  const parsedVersion = rawAgentVersion ? Number.parseInt(rawAgentVersion, 10) : NaN;
  const agentVersion = Number.isInteger(parsedVersion) && parsedVersion > 0 ? parsedVersion : null;
  const connectionId = isPlaceholder(env.SARVAM_CONNECTION_ID) ? '' : env.SARVAM_CONNECTION_ID!.trim();
  const agentPhoneNumber = isPlaceholder(env.SARVAM_AGENT_PHONE_NUMBER)
    ? ''
    : env.SARVAM_AGENT_PHONE_NUMBER!.trim();
  const webhookSecret = isPlaceholder(env.SARVAM_WEBHOOK_SECRET) ? '' : env.SARVAM_WEBHOOK_SECRET!.trim();

  const appUrlRaw = isPlaceholder(env.APP_URL) ? '' : env.APP_URL!.trim().replace(/\/+$/, '');
  const webhookUrl =
    appUrlRaw && appUrlRaw.startsWith('https://')
      ? `${appUrlRaw}/api/sarvam/outbound/webhook`
      : null;

  return {
    apiKey,
    orgId,
    workspaceId,
    agentId,
    agentVersion,
    rawAgentVersion,
    connectionId,
    agentPhoneNumber,
    webhookSecret,
    webhookUrl,
  };
}

export function getSarvamOutboundReadiness(
  env: NodeJS.ProcessEnv = process.env
): OutboundCallConfigReadiness {
  const cfg = readSarvamOutboundEnvConfig(env);
  const missingVariables: string[] = [];

  if (!cfg.apiKey) missingVariables.push('SARVAM_API_KEY');
  if (!cfg.orgId) missingVariables.push('SARVAM_ORG_ID');
  if (!cfg.workspaceId) missingVariables.push('SARVAM_WORKSPACE_ID');
  if (!cfg.agentId) missingVariables.push('SARVAM_AGENT_ID');
  if (!cfg.agentVersion) missingVariables.push('SARVAM_AGENT_VERSION');
  if (!cfg.connectionId) missingVariables.push('SARVAM_CONNECTION_ID');
  if (!cfg.agentPhoneNumber) missingVariables.push('SARVAM_AGENT_PHONE_NUMBER');

  return {
    ready: missingVariables.length === 0,
    hasApiKey: Boolean(cfg.apiKey),
    hasOrgId: Boolean(cfg.orgId),
    hasWorkspaceId: Boolean(cfg.workspaceId),
    hasAgentId: Boolean(cfg.agentId),
    hasAgentVersion: Boolean(cfg.agentVersion),
    hasConnectionId: Boolean(cfg.connectionId),
    hasAgentPhoneNumber: Boolean(cfg.agentPhoneNumber),
    missingVariables,
    webhookUrl: cfg.webhookUrl,
  };
}

export function mapSarvamProviderStatus(
  rawStatus?: string | null,
  rawConnectivity?: string | null
): MappedCallStatus {
  const combined = `${rawConnectivity ?? ''} ${rawStatus ?? ''}`.trim().toLowerCase();
  if (!combined) return 'request_accepted';

  if (/\b(failed|error|no_answer|no answer|busy|rejected|declined|canceled|cancelled|not_connected|unreachable)\b/.test(combined)) {
    return 'failed';
  }
  if (/\b(completed|ended|finished|hangup|disconnected)\b/.test(combined)) {
    return 'completed';
  }
  if (/\b(connected|in_progress|in-progress|answered|active|live|talking)\b/.test(combined)) {
    return 'connected';
  }
  if (/\b(ringing|running|initiated|dialing|connecting|queued|pending)\b/.test(combined)) {
    return 'ringing';
  }
  return 'request_accepted';
}

export function sanitizeOutboundRecord(rec: StoredOutboundCallAttempt): OutboundCallRecord {
  return {
    attemptId: rec.attemptId,
    maskedPhone: rec.maskedPhone,
    countryCode: rec.countryCode,
    status: rec.status,
    providerStatus: rec.providerStatus,
    connectivityStatus: rec.connectivityStatus,
    durationSec: rec.durationSec,
    failureReason: rec.failureReason,
    interactionId: rec.interactionId,
    transcriptSummary: rec.transcriptSummary,
    createdAt: rec.createdAt,
    updatedAt: rec.updatedAt,
  };
}

export function verifySarvamWebhookSignature(
  rawBody: string,
  signatureHeader: string | undefined,
  timestampHeader: string | undefined,
  secret: string
): boolean {
  if (!secret) return true;
  if (!signatureHeader) return false;

  const cleanSig = signatureHeader.replace(/^sha256=/i, '').trim();
  const candidates = timestampHeader
    ? [`${timestampHeader}.${rawBody}`, rawBody]
    : [rawBody];

  for (const payload of candidates) {
    const hmacHex = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    const hmacB64 = crypto.createHmac('sha256', secret).update(payload).digest('base64');

    for (const expected of [hmacHex, hmacB64]) {
      const a = Buffer.from(cleanSig);
      const b = Buffer.from(expected);
      if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
        return true;
      }
    }
  }
  return false;
}

export class OutboundCallManager {
  private attemptsById = new Map<string, StoredOutboundCallAttempt>();
  private attemptOrder: string[] = [];
  private rateWindowByUser = new Map<string, number[]>();
  private persistToDisk: boolean;

  constructor(persistToDisk = true) {
    this.persistToDisk = persistToDisk;
    if (persistToDisk) {
      this.loadFromDisk();
    }
  }

  private loadFromDisk(): void {
    try {
      if (!fs.existsSync(OUTBOUND_STORE_FILE)) return;
      const raw = fs.readFileSync(OUTBOUND_STORE_FILE, 'utf8');
      const parsed = JSON.parse(raw) as StoredOutboundCallAttempt[];
      if (!Array.isArray(parsed)) return;
      for (const item of parsed) {
        if (item?.attemptId) {
          this.attemptsById.set(item.attemptId, item);
          this.attemptOrder.push(item.attemptId);
        }
      }
    } catch {
      // Ignore malformed persisted file
    }
  }

  private saveToDisk(): void {
    if (!this.persistToDisk) return;
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      const list = this.attemptOrder
        .map((id) => this.attemptsById.get(id))
        .filter((x): x is StoredOutboundCallAttempt => Boolean(x))
        .slice(0, 100);
      fs.writeFileSync(OUTBOUND_STORE_FILE, JSON.stringify(list, null, 2), 'utf8');
    } catch {
      // Non-fatal in read-only sandboxes
    }
  }

  checkRateLimitAndDuplicate(
    userKey: string,
    e164: string,
    nowMs = Date.now()
  ): { allowed: true } | { allowed: false; statusCode: number; error: string; retryAfterSec: number } {
    const phoneHash = hashPhone(e164);

    // 1. Check duplicate active/recent call to the exact same phone number
    for (const id of this.attemptOrder) {
      const existing = this.attemptsById.get(id);
      if (!existing || existing.phoneHash !== phoneHash) continue;
      const ageMs = nowMs - new Date(existing.createdAt).getTime();
      const isNonTerminal =
        existing.status === 'request_accepted' ||
        existing.status === 'ringing' ||
        existing.status === 'connected';

      if (ageMs < DUPLICATE_COOLDOWN_MS && isNonTerminal) {
        const retryAfterSec = Math.max(1, Math.ceil((DUPLICATE_COOLDOWN_MS - ageMs) / 1000));
        return {
          allowed: false,
          statusCode: 409,
          retryAfterSec,
          error: `A call to ${existing.maskedPhone} was just requested. Please wait ${retryAfterSec}s before initiating another call to the same number.`,
        };
      }
    }

    // 2. Per-user burst rate limiting
    const recent = (this.rateWindowByUser.get(userKey) ?? []).filter(
      (ts) => nowMs - ts < USER_WINDOW_MS
    );
    this.rateWindowByUser.set(userKey, recent);

    if (recent.length >= MAX_USER_CALLS_PER_WINDOW) {
      const oldest = recent[0];
      const retryAfterSec = Math.max(1, Math.ceil((USER_WINDOW_MS - (nowMs - oldest)) / 1000));
      return {
        allowed: false,
        statusCode: 429,
        retryAfterSec,
        error: `Outbound call limit reached (max ${MAX_USER_CALLS_PER_WINDOW} calls per 15 minutes). Please retry in ${Math.ceil(retryAfterSec / 60)} min.`,
      };
    }

    return { allowed: true };
  }

  recordAttempt(
    attemptId: string,
    userKey: string,
    e164: string,
    countryCode: string,
    nowMs = Date.now()
  ): StoredOutboundCallAttempt {
    const nowIso = new Date(nowMs).toISOString();
    const record: StoredOutboundCallAttempt = {
      attemptId,
      userKey,
      phoneHash: hashPhone(e164),
      maskedPhone: maskE164Phone(e164),
      countryCode,
      status: 'request_accepted',
      providerStatus: 'accepted',
      connectivityStatus: null,
      durationSec: null,
      failureReason: null,
      interactionId: null,
      transcriptSummary: null,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    this.attemptsById.set(attemptId, record);
    this.attemptOrder = [attemptId, ...this.attemptOrder.filter((id) => id !== attemptId)].slice(0, 100);

    const recent = (this.rateWindowByUser.get(userKey) ?? []).filter(
      (ts) => nowMs - ts < USER_WINDOW_MS
    );
    recent.push(nowMs);
    this.rateWindowByUser.set(userKey, recent);

    this.saveToDisk();
    return record;
  }

  getAttempt(attemptId: string): StoredOutboundCallAttempt | null {
    return this.attemptsById.get(attemptId) ?? null;
  }

  listAttemptsForUser(userKey: string): OutboundCallRecord[] {
    return this.attemptOrder
      .map((id) => this.attemptsById.get(id))
      .filter((item): item is StoredOutboundCallAttempt => Boolean(item && item.userKey === userKey))
      .slice(0, 10)
      .map(sanitizeOutboundRecord);
  }

  updateFromProviderEvent(
    attemptId: string,
    patch: {
      providerStatus?: string | null;
      connectivityStatus?: string | null;
      durationSec?: number | null;
      failureReason?: string | null;
      interactionId?: string | null;
      transcriptSummary?: string | null;
    }
  ): StoredOutboundCallAttempt | null {
    const existing = this.attemptsById.get(attemptId);
    if (!existing) return null;

    const nextProviderStatus = patch.providerStatus ?? existing.providerStatus;
    const nextConnectivity = patch.connectivityStatus ?? existing.connectivityStatus;
    const mapped = mapSarvamProviderStatus(nextProviderStatus, nextConnectivity);

    // Do not downgrade terminal states to non-terminal
    const isAlreadyTerminal = existing.status === 'completed' || existing.status === 'failed';
    const finalStatus = isAlreadyTerminal && (mapped === 'request_accepted' || mapped === 'ringing')
      ? existing.status
      : mapped;

    const updated: StoredOutboundCallAttempt = {
      ...existing,
      status: finalStatus,
      providerStatus: nextProviderStatus,
      connectivityStatus: nextConnectivity,
      durationSec: patch.durationSec ?? existing.durationSec,
      failureReason: patch.failureReason ?? existing.failureReason,
      interactionId: patch.interactionId ?? existing.interactionId,
      transcriptSummary: patch.transcriptSummary ?? existing.transcriptSummary,
      updatedAt: new Date().toISOString(),
    };

    this.attemptsById.set(attemptId, updated);
    this.saveToDisk();
    return updated;
  }
}

export interface InitiateCallInput {
  userKey: string;
  phoneNumber: string;
  countryCode?: string;
  confirmed: boolean;
}

export async function initiateSarvamOutboundCall(
  manager: OutboundCallManager,
  input: InitiateCallInput,
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch
): Promise<{ statusCode: number; body: Record<string, unknown> }> {
  if (!input.confirmed) {
    return {
      statusCode: 400,
      body: {
        error: 'Explicit user confirmation is required before initiating an AI phone call.',
      },
    };
  }

  const phoneCheck = normalizeAndValidatePhone(input.phoneNumber, input.countryCode || '+91');
  if (!phoneCheck.valid || !phoneCheck.e164) {
    return {
      statusCode: 400,
      body: {
        error: phoneCheck.error || 'Invalid mobile phone number.',
      },
    };
  }

  const readiness = getSarvamOutboundReadiness(env);
  if (!readiness.ready) {
    return {
      statusCode: 503,
      body: {
        error: `Sarvam Voice Agents outbound calling is missing required server credentials: ${readiness.missingVariables.join(', ')}.`,
        missingVariables: readiness.missingVariables,
        readiness,
      },
    };
  }

  const cfg = readSarvamOutboundEnvConfig(env);
  const guard = manager.checkRateLimitAndDuplicate(input.userKey, phoneCheck.e164);
  if (guard.allowed === false) {
    return {
      statusCode: guard.statusCode,
      body: {
        error: guard.error,
        retryAfterSec: guard.retryAfterSec,
      },
    };
  }

  const endpoint = `https://apps.sarvam.ai/api/outbounds/v1/orgs/${encodeURIComponent(cfg.orgId)}/workspaces/${encodeURIComponent(cfg.workspaceId)}/outbounds`;

  const payload: Record<string, unknown> = {
    app_config: {
      app_id: cfg.agentId,
      app_version: cfg.agentVersion,
      connection_config: {
        connection_id: cfg.connectionId,
        agent_phone_number: cfg.agentPhoneNumber,
      },
    },
    user_config: {
      user_phone_number: phoneCheck.e164,
    },
  };

  if (cfg.webhookUrl) {
    payload.webhook_config = {
      url: cfg.webhookUrl,
      ...(cfg.webhookSecret ? { secret: cfg.webhookSecret } : {}),
    };
  }

  try {
    const apiRes = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': cfg.apiKey,
      },
      body: JSON.stringify(payload),
    });

    const rawText = await apiRes.text();
    let parsedJson: Record<string, unknown> | null = null;
    try {
      parsedJson = JSON.parse(rawText) as Record<string, unknown>;
    } catch {
      parsedJson = null;
    }

    if (!apiRes.ok) {
      const providerDetail =
        (parsedJson && (String(parsedJson.detail || parsedJson.message || parsedJson.error || ''))) ||
        rawText.slice(0, 220);

      const authHint =
        apiRes.status === 401 || apiRes.status === 403
          ? ' Sarvam Voice Agents (apps.sarvam.ai) requires a Voice Agents Workspace API Key in X-API-Key (from Voice Agents -> Settings -> API Key); a standard Model API subscription key alone does not authorize outbound calls.'
          : '';

      return {
        statusCode: apiRes.status >= 400 && apiRes.status < 500 ? apiRes.status : 502,
        body: {
          error: `Sarvam outbound API rejected request (${apiRes.status}): ${providerDetail || 'Authorization or configuration error.'}${authHint}`,
        },
      };
    }

    const attemptId =
      typeof parsedJson?.attempt_id === 'string' && parsedJson.attempt_id.trim()
        ? parsedJson.attempt_id.trim()
        : '';

    if (!attemptId) {
      return {
        statusCode: 502,
        body: {
          error: 'Sarvam outbound API returned success without an attempt_id.',
        },
      };
    }

    const stored = manager.recordAttempt(
      attemptId,
      input.userKey,
      phoneCheck.e164,
      phoneCheck.countryCode
    );

    console.info(
      `[SarvamOutbound] Call request accepted: attemptId=${attemptId} to=${stored.maskedPhone}`
    );

    return {
      statusCode: 200,
      body: {
        ok: true,
        attempt: sanitizeOutboundRecord(stored),
      },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Network error calling Sarvam Voice Agents API.';
    return {
      statusCode: 502,
      body: {
        error: `Unable to reach Sarvam outbound service: ${msg}`,
      },
    };
  }
}

export async function refreshSarvamAttemptStatus(
  manager: OutboundCallManager,
  attemptId: string,
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch
): Promise<{ statusCode: number; body: Record<string, unknown> }> {
  const existing = manager.getAttempt(attemptId);
  if (!existing) {
    return {
      statusCode: 404,
      body: { error: 'Outbound call attempt not found.' },
    };
  }

  // If already in a terminal state (e.g. updated via webhook), return directly
  if (existing.status === 'completed' || existing.status === 'failed') {
    return {
      statusCode: 200,
      body: { ok: true, attempt: sanitizeOutboundRecord(existing) },
    };
  }

  const cfg = readSarvamOutboundEnvConfig(env);
  if (!cfg.apiKey || !cfg.orgId || !cfg.workspaceId || !cfg.agentId) {
    return {
      statusCode: 200,
      body: { ok: true, attempt: sanitizeOutboundRecord(existing) },
    };
  }

  try {
    const startDt = new Date(new Date(existing.createdAt).getTime() - 10 * 60_000).toISOString();
    const endDt = new Date(Date.now() + 5 * 60_000).toISOString();
    const filters = JSON.stringify([
      { field: 'channel_direction', operator: 'equals', value: 'outbound' },
    ]);

    const analyticsUrl =
      `https://apps.sarvam.ai/api/analytics/v1/${encodeURIComponent(cfg.orgId)}/${encodeURIComponent(cfg.workspaceId)}/${encodeURIComponent(cfg.agentId)}/attempts` +
      `?start_datetime=${encodeURIComponent(startDt)}&end_datetime=${encodeURIComponent(endDt)}&filter_conditions=${encodeURIComponent(filters)}`;

    const res = await fetchImpl(analyticsUrl, {
      method: 'GET',
      headers: {
        'X-API-Key': cfg.apiKey,
      },
    });

    if (res.ok) {
      const json = (await res.json()) as Record<string, unknown>;
      const list = (Array.isArray(json.attempts)
        ? json.attempts
        : Array.isArray(json.items)
          ? json.items
          : Array.isArray(json.data)
            ? json.data
            : []) as Array<Record<string, unknown>>;

      const match = list.find(
        (item) =>
          String(item.attempt_id ?? item.id ?? '') === attemptId
      );

      if (match) {
        const providerStatus =
          typeof match.status === 'string'
            ? match.status
            : typeof match.call_status === 'string'
              ? match.call_status
              : existing.providerStatus;
        const connectivityStatus =
          typeof match.connectivity_status === 'string'
            ? match.connectivity_status
            : existing.connectivityStatus;
        const durationSec =
          typeof match.duration === 'number'
            ? match.duration
            : typeof match.duration_seconds === 'number'
              ? match.duration_seconds
              : existing.durationSec;
        const failureReason =
          typeof match.failure_reason === 'string' && match.failure_reason.trim()
            ? match.failure_reason.trim()
            : existing.failureReason;
        const interactionId =
          typeof match.interaction_id === 'string'
            ? match.interaction_id
            : existing.interactionId;

        const updated = manager.updateFromProviderEvent(attemptId, {
          providerStatus,
          connectivityStatus,
          durationSec,
          failureReason,
          interactionId,
        });

        if (updated) {
          return {
            statusCode: 200,
            body: { ok: true, attempt: sanitizeOutboundRecord(updated) },
          };
        }
      }
    }
  } catch {
    // Non-fatal: keep truthful current stored status if analytics poll briefly errors
  }

  return {
    statusCode: 200,
    body: { ok: true, attempt: sanitizeOutboundRecord(existing) },
  };
}
