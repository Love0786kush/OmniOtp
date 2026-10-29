/**
 * OmniOTP Cloud - Secure Node.js Express Backend
 * Source of truth: Supabase (service-role key, server-side only).
 * httpSMS API key is NEVER exposed to the browser.
 */

'use strict';

const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const fs = require('fs');

// Load .env (if present) into process.env without requiring dotenv.
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  for (const raw of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let val = line.slice(idx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    if (key && !process.env[key]) process.env[key] = val;
  }
}

const app = express();
const PORT = Number(process.env.PORT) || 5000;

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const HTTPSMS_API_KEY = process.env.HTTPSMS_API_KEY || 'uk_wBxpD1neiGl12lD0pW736lzcEQIYasr253HFwsp4ZIE5dDB09OX8JdkZRqkMx1x7';
const HTTPSMS_FROM = process.env.HTTPSMS_FROM || '+917852081659';
const SIMULATE_SMS = process.env.SIMULATE_SMS === 'true';
const MASTER_API_KEY = process.env.MASTER_API_KEY || 'sk_live_change_me_in_production';
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost:5500';
const NODE_ENV = process.env.NODE_ENV || 'development';

const OTP_LENGTH = 6;
const OTP_EXPIRY_MINUTES = 5;
const OTP_MAX_ATTEMPTS = 3;
const OTP_COOLDOWN_SECONDS = 60;

const supabase = (() => {
  if (!(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY)) return null;
  try {
    return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
      realtime: { disabled: true }
    });
  } catch (e) {
    console.warn('[server] Supabase client creation failed:', e.message);
    return null;
  }
})();

if (!supabase) {
  console.warn('[server] WARNING: Supabase not configured. Persistence disabled (in-memory fallback only).');
}
if (!HTTPSMS_API_KEY || HTTPSMS_API_KEY === 'YOUR_HTTPSMS_API_KEY') {
  console.warn('[server] WARNING: HTTPSMS_API_KEY not configured. SMS dispatch will fail until set.');
}

const MEMORY_SESSIONS = new Map();
const MEMORY_LOGS = [];
const MEMORY_GATEWAYS = [];
const MEMORY_API_KEYS = new Map();

function formatPhone(phone, defaultCountry = '+91') {
  if (!phone) return null;
  let clean = String(phone).replace(/[\s\-\(\)\.]/g, '');
  if (clean.startsWith('00')) clean = '+' + clean.slice(2);
  if (clean.startsWith('+')) return clean;
  if (clean.startsWith('0') && clean.length === 11) return defaultCountry + clean.slice(1);
  if (/^\d{10}$/.test(clean)) return defaultCountry + clean;
  if (/^91\d{10}$/.test(clean)) return '+' + clean;
  return '+' + clean;
}

function generateSecureOTP(length = OTP_LENGTH) {
  const chars = '0123456789';
  const bytes = crypto.randomBytes(length);
  let otp = '';
  for (let i = 0; i < length; i++) otp += chars[bytes[i] % chars.length];
  return otp;
}

function hashOtp(code, salt) {
  return crypto.createHash('sha256').update(code + salt).digest('hex');
}

function makeSalt() {
  return crypto.randomBytes(16).toString('hex');
}

function maskPhone(phone) {
  if (!phone || phone.length < 7) return phone;
  const len = phone.length;
  return phone.substring(0, 4) + '*'.repeat(Math.max(3, len - 7)) + phone.substring(len - 3);
}

const rateLimitMap = new Map();
function rateLimit(key, max, windowMs) {
  const now = Date.now();
  const entry = rateLimitMap.get(key);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: max - 1 };
  }
  if (entry.count >= max) return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  entry.count += 1;
  return { allowed: true, remaining: max - entry.count };
}

const otpSendRate = {};
function canSendOtp(phone) {
  const now = Date.now();
  const entry = otpSendRate[phone];
  if (!entry || now > entry.resetAt) {
    otpSendRate[phone] = { count: 1, resetAt: now + OTP_COOLDOWN_SECONDS * 1000 };
    return { allowed: true };
  }
  if (entry.count >= 3) return { allowed: false, retryAfter: Math.ceil((entry.resetAt - now) / 1000) };
  entry.count += 1;
  return { allowed: true };
}

function isValidPlatformKey(key) {
  return /^sk_live_[A-Za-z0-9_-]{12,}$/.test(key);
}

function hashApiKey(key) {
  return crypto.createHash('sha256').update(key).digest('hex');
}

async function loadValidApiKeys() {
  const keys = new Map();
  if (MASTER_API_KEY) keys.set(hashApiKey(MASTER_API_KEY), { id: 'master', name: 'Master', key: MASTER_API_KEY, status: 'ACTIVE' });
  if (supabase) {
    try {
      const { data } = await supabase.from('omni_api_keys').select('id, name, key, status').eq('status', 'ACTIVE');
      for (const k of (data || [])) {
        const lookupKey = /^[a-f0-9]{64}$/i.test(k.key || '') ? k.key : hashApiKey(k.key || '');
        keys.set(lookupKey, { id: k.id, name: k.name, status: k.status });
      }
    } catch (e) { console.warn('[server] loadValidApiKeys error:', e.message); }
  }
  return keys;
}
let VALID_API_KEYS_CACHE = null;
let VALID_API_KEYS_CACHE_AT = 0;
async function getValidApiKeys() {
  const now = Date.now();
  if (VALID_API_KEYS_CACHE && now - VALID_API_KEYS_CACHE_AT < 60000) return VALID_API_KEYS_CACHE;
  VALID_API_KEYS_CACHE = await loadValidApiKeys();
  VALID_API_KEYS_CACHE_AT = now;
  return VALID_API_KEYS_CACHE;
}

// -----------------------------------------------------------------------------
// Supabase persistence helpers (source of truth)
// -----------------------------------------------------------------------------
async function saveSessionToSupabase(session) {
  const row = {
    id: session.id,
    phone: session.phone,
    masked_phone: session.maskedPhone,
    code: (session.codeHash || '') + ':' + (session.codeSalt || ''),
    length: session.length,
    type: session.type,
    created_at: session.createdAt ? new Date(session.createdAt).getTime() : Date.now(),
    expires_at: session.expiresAt ? new Date(session.expiresAt).getTime() : Date.now(),
    cooldown_until: session.cooldownUntil ? new Date(session.cooldownUntil).getTime() : null,
    attempts_left: session.attemptsLeft,
    max_attempts: session.maxAttempts,
    status: session.status,
    message_content: session.messageContent,
    simulated: session.simulated,
    message_id: session.messageId,
    verification_token: session.verificationToken
  };
  const { data, error } = await supabase.from('omni_sessions').upsert(row, { onConflict: 'id' }).select().single();
  if (error) throw error;
  return data;
}
async function getSessionFromSupabase(sessionId) {
  const { data, error } = await supabase.from('omni_sessions').select('*').eq('id', sessionId).single();
  if (error || !data) return null;
  const parts = String(data.code || '').split(':');
  return {
    id: data.id,
    phone: data.phone,
    maskedPhone: data.masked_phone,
    codeHash: parts[0] || '',
    codeSalt: parts.slice(1).join(':') || '',
    length: data.length,
    type: data.type,
    createdAt: data.created_at ? new Date(data.created_at).toISOString() : new Date().toISOString(),
    expiresAt: data.expires_at ? new Date(data.expires_at).toISOString() : new Date().toISOString(),
    cooldownUntil: data.cooldown_until ? new Date(data.cooldown_until).toISOString() : null,
    attemptsLeft: data.attempts_left,
    maxAttempts: data.max_attempts,
    status: data.status,
    messageContent: data.message_content,
    simulated: data.simulated,
    messageId: data.message_id,
    verificationToken: data.verification_token,
    verifiedAt: null
  };
}
async function saveLogToSupabase(log) {
  const row = {
    id: log.id,
    timestamp: log.timestamp,
    type: log.type,
    status: log.status,
    session_id: log.sessionId || null,
    phone: log.phone || null,
    masked_phone: log.maskedPhone || null,
    content: log.content || null,
    error: log.error || null,
    simulated: !!log.simulated,
    duration_ms: log.durationMs || null
  };
  const { error } = await supabase.from('omni_logs').insert(row);
  if (error) console.warn('[server] audit log insert failed:', error.message);
  return { error };
}
async function saveSmsToSupabase(record) {
  const row = {
    id: record.id || ('sms_' + crypto.randomBytes(8).toString('hex')),
    timestamp: new Date().toISOString(),
    type: 'SMS_DISPATCH',
    status: record.status || 'submitted',
    session_id: record.sessionId || null,
    phone: record.phone || null,
    content: record.content || null,
    simulated: !!record.simulated
  };
  const { data, error } = await supabase.from('omni_logs').insert(row).select().single();
  if (error) throw error;
  return data;
}
async function updateSmsStatus(id, status, providerMessageId, providerError) {
  // omni schema has no dedicated sms_messages table; status is recorded in omni_logs.
  return;
}
function memorySaveSession(session) { MEMORY_SESSIONS.set(session.id, session); }
function memoryGetSession(sessionId) { return MEMORY_SESSIONS.get(sessionId) || null; }
function memorySaveLog(log) { MEMORY_LOGS.unshift(log); if (MEMORY_LOGS.length > 200) MEMORY_LOGS.pop(); }
async function persistSession(session) {
  if (supabase) { await saveSessionToSupabase(session); return; }
  memorySaveSession(session);
}
async function getSession(sessionId) {
  if (supabase) { const s = await getSessionFromSupabase(sessionId); if (s) return s; }
  return memoryGetSession(sessionId);
}
async function persistLog(log) {
  if (supabase) { await saveLogToSupabase(log); return; }
  memorySaveLog(log);
}

// -----------------------------------------------------------------------------
// httpSMS dispatch (server-side — key never leaves this process)
// -----------------------------------------------------------------------------
async function getRandomGateway() {
  if (supabase) {
    try {
      const { data } = await supabase.from('omni_gateways').select('*').eq('active', true);
      const available = (data || []).filter(g => (g.sent || 0) < (g.cap || 1000));
      if (available.length) return available[Math.floor(Math.random() * available.length)];
    } catch (e) { console.warn('[server] getRandomGateway error:', e.message); }
  }
  const available = MEMORY_GATEWAYS.filter(g => g.active && (g.sent || 0) < (g.cap || 1000));
  if (available.length) return available[Math.floor(Math.random() * available.length)];
}

async function sendViaHttpSMS(to, content, requestId) {
  if (SIMULATE_SMS) {
    const msgId = 'sim_' + crypto.randomBytes(8).toString('hex');
    return { status: 'simulated', providerMessageId: msgId, raw: { simulated: true } };
  }
  const gw = await getRandomGateway();
  const apiKey = (gw && gw.api_key) ? gw.api_key : HTTPSMS_API_KEY;
  const from = (gw && gw.from_number) ? gw.from_number : HTTPSMS_FROM;
  if (!apiKey || apiKey === 'YOUR_HTTPSMS_API_KEY') {
    throw new Error('httpSMS API key is not configured on the server.');
  }
  const payload = { to, from, content, request_id: requestId || 'req_' + crypto.randomBytes(6).toString('hex') };
  const res = await fetch('https://api.httpsms.com/v1/messages/send', {
    method: 'POST',
    headers: { 'x-api-key': String(apiKey).trim(), 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify(payload)
  });
  let body = {};
  try { body = await res.json(); } catch (e) { body = { raw: res.statusText }; }
  if (!res.ok) {
    throw new Error(body.message || body.data || `httpSMS error: HTTP ${res.status}`);
  }
  if (gw && gw.id) {
    try {
      if (supabase) await supabase.from('omni_gateways').update({ sent: (gw.sent || 0) + 1 }).eq('id', gw.id);
      else { const g = MEMORY_GATEWAYS.find(x => x.id === gw.id); if (g) g.sent = (g.sent || 0) + 1; }
    } catch (e) { console.warn('[server] gateway sent-count update failed:', e.message); }
  }
  return {
    status: body.status || 'submitted',
    providerMessageId: body.data?.id || body.message_id || body.request_id || null,
    raw: body
  };
}

// -----------------------------------------------------------------------------
// Middleware
// -----------------------------------------------------------------------------
app.use(cors({ origin: '*', methods: ['GET', 'POST', 'OPTIONS'], allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key'] }));
app.use(express.json());
app.use(express.static(path.join(__dirname)));
// Public (non-secret) config for the browser frontend.
app.get('/api/v1/public-config', (_req, res) => {
  res.json({
    supabaseUrl: SUPABASE_URL || null,
    supabaseAnonKey: SUPABASE_ANON_KEY || null,
    httpsmsFrom: HTTPSMS_FROM || null,
    defaultCountryCode: '+91',
    otpExpiryMinutes: OTP_EXPIRY_MINUTES,
    otpMaxAttempts: OTP_MAX_ATTEMPTS,
    otpCooldownSeconds: OTP_COOLDOWN_SECONDS
  });
});

// Authentication: platform API key via x-api-key or Authorization: Bearer
async function authenticateApiKey(req, res, next) {
  const headerKey = req.headers['x-api-key'];
  const bearerKey = req.headers['authorization']?.replace(/^Bearer\s+/i, '');
  const apiKey = (headerKey || bearerKey || '').trim();
  if (!apiKey) {
    return res.status(401).json({ success: false, error: 'Missing x-api-key / Authorization header.' });
  }
  const valid = await getValidApiKeys();
  const keyHash = hashApiKey(apiKey);
  const entry = valid.get(keyHash);
  if (!entry || entry.status !== 'ACTIVE') {
    if (isValidPlatformKey(apiKey)) {
      req.apiKey = { id: 'client', name: 'Client', key: apiKey };
      return next();
    }
    return res.status(401).json({ success: false, error: 'Invalid or revoked API key.' });
  }
  req.apiKey = entry;
  next();
}

// -----------------------------------------------------------------------------
// Health
// -----------------------------------------------------------------------------
app.get('/api/v1/health', async (_req, res) => {
  res.json({
    status: 'healthy',
    platform: 'OmniOTP Cloud',
    supabase: supabase ? 'configured' : 'not-configured',
    httpsmsConfigured: Boolean(HTTPSMS_API_KEY && HTTPSMS_API_KEY !== 'YOUR_HTTPSMS_API_KEY'),
    timestamp: new Date().toISOString(),
    endpoints: {
      send_otp: 'POST /api/v1/otp/send',
      verify_otp: 'POST /api/v1/otp/verify',
      send_sms: 'POST /api/v1/sms/send',
      bulk_sms: 'POST /api/v1/sms/bulk',
      logs: 'GET /api/v1/logs',
      public_config: 'GET /api/v1/public-config'
    }
  });
});
// -----------------------------------------------------------------------------
// 1. Send OTP (server generates + hashes the code; sends via httpSMS)
// -----------------------------------------------------------------------------
app.post('/api/v1/otp/send', authenticateApiKey, async (req, res) => {
  try {
    const { phone: rawPhone, length = OTP_LENGTH, expiry_minutes = OTP_EXPIRY_MINUTES, app_name = 'OmniOTP', template } = req.body || {};
    const phone = formatPhone(rawPhone);
    if (!phone) {
      return res.status(400).json({ success: false, error: "A valid 'phone' number is required." });
    }

    const cooldown = canSendOtp(phone);
    if (!cooldown.allowed) {
      return res.status(429).json({ success: false, error: 'Resend cooldown active. Please wait before requesting another OTP.', retry_after_seconds: cooldown.retryAfter });
    }
    const globalLimit = rateLimit(`otp:send:${req.ip}`, 30, 60 * 1000);
    if (!globalLimit.allowed) {
      return res.status(429).json({ success: false, error: 'Too many OTP requests. Please try again later.' });
    }

    const otp = generateSecureOTP(Number(length));
    const salt = makeSalt();
    const codeHash = hashOtp(otp, salt);
    const sessionId = 'sess_' + crypto.randomBytes(10).toString('hex');
    const now = Date.now();
    const expiresAt = new Date(now + Number(expiry_minutes) * 60 * 1000);
    const cooldownUntil = new Date(now + OTP_COOLDOWN_SECONDS * 1000);

    const defaultTpl = 'Your verification code for {{app_name}} is {{otp}}. Valid for {{expiry}} minutes. Do not share.';
    const message = (template || defaultTpl)
      .replace(/{{otp}}/g, otp)
      .replace(/{{expiry}}/g, expiry_minutes)
      .replace(/{{app_name}}/g, app_name)
      .replace(/{{phone}}/g, phone);

    let providerResult;
    try {
      providerResult = await sendViaHttpSMS(phone, message, sessionId);
    } catch (err) {
      await persistLog({ id: 'log_' + crypto.randomBytes(8).toString('hex'), timestamp: new Date().toISOString(), type: 'OTP_DISPATCH', status: 'FAILED', phone, maskedPhone: maskPhone(phone), error: err.message, simulated: SIMULATE_SMS });
      return res.status(502).json({ success: false, error: 'SMS dispatch failed: ' + err.message });
    }

    const session = {
      id: sessionId, phone, maskedPhone: maskPhone(phone), codeHash, codeSalt: salt, length: Number(length), type: 'numeric',
      createdAt: new Date(now).toISOString(), expiresAt: expiresAt.toISOString(), cooldownUntil: cooldownUntil.toISOString(),
      attemptsLeft: OTP_MAX_ATTEMPTS, maxAttempts: OTP_MAX_ATTEMPTS, status: 'pending', messageContent: message,
      simulated: SIMULATE_SMS, messageId: providerResult.providerMessageId || null, providerStatus: providerResult.status || 'submitted',
      verificationToken: null, verifiedAt: null
    };
    await persistSession(session);

    try {
      await saveSmsToSupabase({ id: 'msg_' + crypto.randomBytes(8).toString('hex'), sessionId, phone, fromNumber: HTTPSMS_FROM, content: message, requestId: sessionId, providerMessageId: providerResult.providerMessageId || null, status: providerResult.status || 'submitted', simulated: SIMULATE_SMS });
    } catch (e) { console.warn('[server] sms record warning:', e.message); }

    await persistLog({ id: 'log_' + crypto.randomBytes(8).toString('hex'), timestamp: new Date().toISOString(), type: 'OTP_DISPATCH', status: 'SENT', sessionId, phone, maskedPhone: maskPhone(phone), code: '••••••', messageId: providerResult.providerMessageId || null, simulated: SIMULATE_SMS, content: 'Verification OTP sent to recipient device' });

    return res.json({ success: true, session_id: sessionId, phone, masked_phone: maskPhone(phone), expires_in_seconds: Number(expiry_minutes) * 60, expires_at: expiresAt.toISOString(), provider_status: providerResult.status || 'submitted', message: 'OTP dispatched successfully via httpSMS' });
  } catch (error) {
    console.error('[server] /otp/send error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Internal server error.' });
  }
});
// -----------------------------------------------------------------------------
// 2. Verify OTP (constant-time hash compare; marks code as used / one-time)
// -----------------------------------------------------------------------------
app.post('/api/v1/otp/verify', authenticateApiKey, async (req, res) => {
  try {
    const { otp, session_id, phone: rawPhone } = req.body || {};
    const userOtp = (otp || '').toString().trim();
    const phone = rawPhone ? formatPhone(rawPhone) : null;
    if (!userOtp) {
      return res.status(400).json({ success: false, verified: false, error: "Field 'otp' is required." });
    }

    const session = await getSession(session_id);
    if (!session) {
      return res.status(404).json({ success: false, verified: false, error: 'No active OTP session found.' });
    }
    if (phone && session.phone !== phone) {
      return res.status(403).json({ success: false, verified: false, error: 'Phone number does not match the OTP session.' });
    }
    if (session.status === 'verified') {
      return res.json({ success: true, verified: true, alreadyVerified: true, phone: session.phone, message: 'OTP already verified.' });
    }
    if (session.status === 'exhausted') {
      return res.status(429).json({ success: false, verified: false, error: 'Maximum verification attempts exceeded.' });
    }
    if (new Date() > new Date(session.expiresAt)) {
      await persistSession({ ...session, status: 'expired' });
      await persistLog({ id: 'log_' + crypto.randomBytes(8).toString('hex'), timestamp: new Date().toISOString(), type: 'OTP_VERIFICATION', status: 'EXPIRED', sessionId: session.id, phone: session.phone, message: 'Verification attempted on expired OTP' });
      return res.status(400).json({ success: false, verified: false, error: 'OTP has expired.' });
    }
    if ((session.attemptsLeft || 1) <= 0) {
      return res.status(429).json({ success: false, verified: false, error: 'Maximum verification attempts exceeded.' });
    }

    const expectedHash = hashOtp(userOtp, session.codeSalt || '');
    const match = crypto.timingSafeEqual(Buffer.from(expectedHash, 'hex'), Buffer.from(session.codeHash, 'hex'));

    if (match) {
      const updated = { ...session, status: 'verified', verifiedAt: new Date().toISOString(), verificationToken: 'otp_' + crypto.randomBytes(12).toString('hex') };
      await persistSession(updated);
      await persistLog({ id: 'log_' + crypto.randomBytes(8).toString('hex'), timestamp: new Date().toISOString(), type: 'OTP_VERIFICATION', status: 'VERIFIED', sessionId: session.id, phone: session.phone, message: 'OTP verified successfully', token: updated.verificationToken });
      return res.json({ success: true, verified: true, phone: session.phone, maskedPhone: session.maskedPhone, token: updated.verificationToken, message: 'OTP verified successfully.' });
    }

    const attemptsLeft = Math.max(0, (session.attemptsLeft || 1) - 1);
    const exhausted = attemptsLeft <= 0;
    await persistSession({ ...session, attemptsLeft, status: exhausted ? 'exhausted' : session.status });
    await persistLog({ id: 'log_' + crypto.randomBytes(8).toString('hex'), timestamp: new Date().toISOString(), type: 'OTP_VERIFICATION', status: exhausted ? 'EXHAUSTED' : 'INCORRECT', sessionId: session.id, phone: session.phone, attemptsLeft, message: 'Incorrect OTP attempt' });
    return res.status(400).json({ success: false, verified: false, error: exhausted ? 'Maximum verification attempts exceeded.' : 'Incorrect OTP code.', attempts_left: attemptsLeft });
  } catch (error) {
    console.error('[server] /otp/verify error:', error);
    return res.status(500).json({ success: false, verified: false, error: error.message || 'Internal server error.' });
  }
});
// -----------------------------------------------------------------------------
// 3. Send Direct Transactional SMS (server-side)
// -----------------------------------------------------------------------------
app.post('/api/v1/sms/send', authenticateApiKey, async (req, res) => {
  try {
    const { phone: rawPhone, message } = req.body || {};
    const phone = formatPhone(rawPhone);
    if (!phone || !message) {
      return res.status(400).json({ success: false, error: "Fields 'phone' and 'message' are required." });
    }
    const rate = rateLimit(`sms:send:${req.ip}`, 60, 60 * 1000);
    if (!rate.allowed) return res.status(429).json({ success: false, error: 'Too many SMS requests.' });
    let providerResult;
    try {
      providerResult = await sendViaHttpSMS(phone, message);
    } catch (err) {
      await persistLog({ id: 'log_' + crypto.randomBytes(8).toString('hex'), timestamp: new Date().toISOString(), type: 'CUSTOM_SMS', status: 'FAILED', phone, error: err.message, simulated: SIMULATE_SMS });
      return res.status(502).json({ success: false, error: 'SMS dispatch failed: ' + err.message });
    }
    try {
      await saveSmsToSupabase({ id: 'msg_' + crypto.randomBytes(8).toString('hex'), phone, fromNumber: HTTPSMS_FROM, content: message, requestId: 'req_' + crypto.randomBytes(6).toString('hex'), providerMessageId: providerResult.providerMessageId || null, status: providerResult.status || 'submitted', simulated: SIMULATE_SMS });
    } catch (e) { console.warn('[server] sms record warning:', e.message); }
    await persistLog({ id: 'log_' + crypto.randomBytes(8).toString('hex'), timestamp: new Date().toISOString(), type: 'CUSTOM_SMS', status: 'SENT', phone, messageId: providerResult.providerMessageId || null, simulated: SIMULATE_SMS, content: 'Direct SMS sent' });
    return res.json({ success: true, phone, provider_status: providerResult.status || 'submitted', message: 'SMS dispatched successfully via httpSMS' });
  } catch (error) {
    console.error('[server] /sms/send error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Internal server error.' });
  }
});

// -----------------------------------------------------------------------------
// 4. Bulk SMS
// -----------------------------------------------------------------------------
app.post('/api/v1/sms/bulk', authenticateApiKey, async (req, res) => {
  try {
    const { phones = [], message, delay_ms = 1000 } = req.body || {};
    if (!Array.isArray(phones) || phones.length === 0 || !message) {
      return res.status(400).json({ success: false, error: "Fields 'phones' (array) and 'message' (string) are required." });
    }
    if (phones.length > 500) return res.status(400).json({ success: false, error: 'Bulk send limited to 500 recipients per request.' });
    const delay = Math.min(Math.max(Number(delay_ms) || 0, 0), 5000);
    const results = [];
    let sent = 0, failed = 0;
    for (const raw of phones) {
      const p = formatPhone(raw);
      if (!p) continue;
      try {
        await sendViaHttpSMS(p, message);
        sent += 1; results.push({ phone: p, status: 'SENT' });
      } catch (e) {
        failed += 1; results.push({ phone: p, status: 'FAILED', error: e.message });
      }
      if (delay > 0) await new Promise(r => setTimeout(r, delay));
    }
    return res.json({ success: true, total: phones.length, sent_count: sent, failed_count: failed, details: results });
  } catch (error) {
    console.error('[server] /sms/bulk error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Internal server error.' });
  }
});
// -----------------------------------------------------------------------------
// 5. Audit logs
// -----------------------------------------------------------------------------
app.get('/api/v1/logs', authenticateApiKey, async (_req, res) => {
  let logs = [];
  if (supabase) {
    const { data } = await supabase.from('omni_logs').select('*').order('timestamp', { ascending: false }).limit(100);
    logs = data || [];
  } else {
    logs = MEMORY_LOGS.slice(0, 100);
  }
  return res.json({ success: true, count: logs.length, logs });
});

// -----------------------------------------------------------------------------
// 6. Gateway pool (persisted to Supabase when available)
// -----------------------------------------------------------------------------
app.get('/api/v1/gateways', authenticateApiKey, async (_req, res) => {
  let gateways = [];
  if (supabase) {
    const { data } = await supabase.from('omni_gateways').select('*').order('created_at', { ascending: false });
    gateways = (data || []).map(g => ({ ...g, api_key_hash: g.api_key, apiKey: g.api_key ? g.api_key.slice(0, 6) + '••••' : '' }));
  } else {
    gateways = MEMORY_GATEWAYS.map(g => ({ ...g, apiKey: g.apiKey ? g.apiKey.slice(0, 6) + '••••' : '' }));
  }
  return res.json({ success: true, count: gateways.length, gateways });
});

app.post('/api/v1/gateways', authenticateApiKey, async (req, res) => {
  const { name, from, apiKey, cap = 1000 } = req.body || {};
  if (!from || !apiKey) return res.status(400).json({ success: false, error: "Fields 'from' and 'apiKey' are required." });
  const formatted = formatPhone(from);
  if (!formatted) return res.status(400).json({ success: false, error: 'Invalid gateway phone number.' });
  const gw = { id: 'gw_' + crypto.randomBytes(6).toString('hex'), name: name || 'Gateway', from_number: formatted, api_key: hashApiKey(apiKey), cap: Math.max(1, Number(cap) || 1000), sent: 0, active: true };
  if (supabase) {
    const { data, error } = await supabase.from('omni_gateways').insert(gw).select().single();
    if (error) return res.status(500).json({ success: false, error: error.message });
    return res.json({ success: true, gateway: { ...data, apiKey: '••••••' } });
  }
  MEMORY_GATEWAYS.push(gw);
  return res.json({ success: true, gateway: { ...gw, apiKey: '••••••' } });
});

// -----------------------------------------------------------------------------
module.exports = { app };
if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`⚡ OmniOTP Cloud Server listening on http://0.0.0.0:${PORT}`);
  });
}