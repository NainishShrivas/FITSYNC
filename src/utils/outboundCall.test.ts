import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  detectCallConfirmationReply,
  detectOutboundCallIntent,
  extractPhoneCandidateFromText,
  maskE164Phone,
  normalizeAndValidatePhone,
} from './phoneValidation';
import {
  getSarvamOutboundReadiness,
  initiateSarvamOutboundCall,
  mapSarvamProviderStatus,
  OutboundCallManager,
  verifySarvamWebhookSignature,
} from '../server/sarvamOutbound';

test('Indian mobile phone normalization and validation (+91)', () => {
  assert.equal(normalizeAndValidatePhone('9876543210', '+91').e164, '+919876543210');
  assert.equal(normalizeAndValidatePhone('09876543210', '+91').e164, '+919876543210');
  assert.equal(normalizeAndValidatePhone('91 98765-43210', '+91').e164, '+919876543210');
  assert.equal(normalizeAndValidatePhone('+91 98765 43210', '+91').e164, '+919876543210');

  assert.equal(normalizeAndValidatePhone('5876543210', '+91').valid, false);
  assert.equal(normalizeAndValidatePhone('9999999999', '+91').valid, false);
  assert.equal(normalizeAndValidatePhone('98765', '+91').valid, false);
  assert.equal(normalizeAndValidatePhone('98765abc10', '+91').valid, false);
});

test('International E.164 phone validation and masking', () => {
  const us = normalizeAndValidatePhone('415 555 0199', '+1');
  assert.equal(us.valid, true);
  assert.equal(us.e164, '+14155550199');
  assert.match(maskE164Phone(us.e164!), /^\+1 •+0199$/);

  const uk = normalizeAndValidatePhone('+44 7700 900123', '+91');
  assert.equal(uk.valid, true);
  assert.equal(uk.e164, '+447700900123');
});

test('Natural outbound call intent, phone extraction, and confirmation detection', () => {
  assert.equal(detectOutboundCallIntent('Call me.'), true);
  assert.equal(detectOutboundCallIntent('I want to talk to you on the phone.'), true);
  assert.equal(detectOutboundCallIntent('Can you explain my fitness plan over a call?'), true);
  assert.equal(detectOutboundCallIntent('What is so-called whey isolate?'), false);

  assert.equal(extractPhoneCandidateFromText('Call me at +91 98765 43210'), '+91 98765 43210');
  assert.equal(extractPhoneCandidateFromText('My calorie target is 2100 kcal'), null);

  assert.equal(detectCallConfirmationReply('Yes.'), 'confirm');
  assert.equal(detectCallConfirmationReply('Confirm'), 'confirm');
  assert.equal(detectCallConfirmationReply('Cancel'), 'cancel');
  assert.equal(detectCallConfirmationReply('Tell me my macros'), null);
});

test('Backend enforces explicit confirmation, credential readiness, and never falsely marks API accept as connected', async () => {
  const manager = new OutboundCallManager(false);

  const fullEnv: NodeJS.ProcessEnv = {
    SARVAM_API_KEY: 'test-workspace-key',
    SARVAM_ORG_ID: 'org_123',
    SARVAM_WORKSPACE_ID: 'ws_456',
    SARVAM_AGENT_ID: 'app_789',
    SARVAM_AGENT_VERSION: '2',
    SARVAM_CONNECTION_ID: 'conn_abc',
    SARVAM_AGENT_PHONE_NUMBER: '+918012345678',
  };

  // Unconfirmed must fail with 400
  const unconfirmed = await initiateSarvamOutboundCall(
    manager,
    { userKey: 'u1', phoneNumber: '9876543210', countryCode: '+91', confirmed: false },
    fullEnv
  );
  assert.equal(unconfirmed.statusCode, 400);

  // Missing credentials must return 503 with missing variable list (no mock attempt_id)
  const incompleteEnv: NodeJS.ProcessEnv = { SARVAM_API_KEY: 'only-key' };
  const readiness = getSarvamOutboundReadiness(incompleteEnv);
  assert.equal(readiness.ready, false);
  assert.ok(readiness.missingVariables.includes('SARVAM_ORG_ID'));
  assert.ok(readiness.missingVariables.includes('SARVAM_CONNECTION_ID'));

  const missingResp = await initiateSarvamOutboundCall(
    manager,
    { userKey: 'u1', phoneNumber: '9876543210', countryCode: '+91', confirmed: true },
    incompleteEnv
  );
  assert.equal(missingResp.statusCode, 503);

  // Successful API 200 creates attempt strictly as 'request_accepted', never 'connected'
  let capturedHeaders: Record<string, string> = {};
  let capturedUrl = '';
  let capturedBody: Record<string, unknown> = {};

  const mockFetch = (async (url: string | URL | Request, init?: RequestInit) => {
    capturedUrl = String(url);
    capturedHeaders = (init?.headers ?? {}) as Record<string, string>;
    capturedBody = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
    return new Response(JSON.stringify({ attempt_id: 'att_live_001' }), { status: 200 });
  }) as typeof fetch;

  const okResp = await initiateSarvamOutboundCall(
    manager,
    { userKey: 'u1', phoneNumber: '9876543210', countryCode: '+91', confirmed: true },
    fullEnv,
    mockFetch
  );
  assert.equal(okResp.statusCode, 200);
  assert.equal(
    capturedUrl,
    'https://apps.sarvam.ai/api/outbounds/v1/orgs/org_123/workspaces/ws_456/outbounds'
  );
  assert.equal(capturedHeaders['X-API-Key'], 'test-workspace-key');
  assert.deepEqual(capturedBody.user_config, { user_phone_number: '+919876543210' });

  const attempt = okResp.body.attempt as { attemptId: string; status: string };
  assert.equal(attempt.attemptId, 'att_live_001');
  assert.equal(attempt.status, 'request_accepted');

  // Duplicate call to exact same active number within cooldown is rejected with 409
  const dupResp = await initiateSarvamOutboundCall(
    manager,
    { userKey: 'u1', phoneNumber: '+91 98765 43210', countryCode: '+91', confirmed: true },
    fullEnv,
    mockFetch
  );
  assert.equal(dupResp.statusCode, 409);

  // Per-user burst limit (max 3 per 15m)
  await initiateSarvamOutboundCall(
    manager,
    { userKey: 'u1', phoneNumber: '9876543211', countryCode: '+91', confirmed: true },
    fullEnv,
    mockFetch
  );
  await initiateSarvamOutboundCall(
    manager,
    { userKey: 'u1', phoneNumber: '9876543212', countryCode: '+91', confirmed: true },
    fullEnv,
    mockFetch
  );
  const limited = await initiateSarvamOutboundCall(
    manager,
    { userKey: 'u1', phoneNumber: '9876543213', countryCode: '+91', confirmed: true },
    fullEnv,
    mockFetch
  );
  assert.equal(limited.statusCode, 429);
});

test('Provider status mapping & Sarvam HMAC-SHA256 webhook verification', () => {
  assert.equal(mapSarvamProviderStatus('running', null), 'ringing');
  assert.equal(mapSarvamProviderStatus('completed', 'connected'), 'completed');
  assert.equal(mapSarvamProviderStatus('in_progress', 'connected'), 'connected');
  assert.equal(mapSarvamProviderStatus('ended', 'no_answer'), 'failed');
  assert.equal(mapSarvamProviderStatus('failed', null), 'failed');

  const secret = 'whsec_test_123';
  const body = JSON.stringify({ attempt_id: 'att_1', status: 'completed', duration: 42 });
  const ts = '1760000000';
  const sig = crypto.createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex');

  assert.equal(verifySarvamWebhookSignature(body, sig, ts, secret), true);
  assert.equal(verifySarvamWebhookSignature(body, 'deadbeef', ts, secret), false);
});
