/**
 * OmniOTP Cloud - Universal OTP & SMS Platform Engine
 * Production Node.js Express REST API Server
 * Powered by httpSMS Android Gateway
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 5000;

// Default Configurations
const CONFIG = {
  httpSMSApiKey: process.env.HTTPSMS_API_KEY || 'uk_wBxpD1neiGl12lD0pW736lzcEQIYasr253HFwsp4ZIE5dDB09OX8JdkZRqkMx1x7',
  gatewayFrom: process.env.HTTPSMS_FROM || '+918290866520',
  masterApiKey: process.env.MASTER_API_KEY || 'sk_live_omni_7a9f4c82b1d3e6'
};

// In-Memory Database (Replace with Redis or SQLite for large scale)
const SESSIONS = new Map();
const LOGS = [];
const VALID_KEYS = new Set([
  CONFIG.masterApiKey,
  'sk_live_android_app_demo',
  'sk_live_web_portal_demo'
]);

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend dashboard directly
app.use(express.static(path.join(__dirname)));

// Helper: Smart E.164 phone formatting
function formatPhone(phone, defaultCountry = '+91') {
  if (!phone) return null;
  let clean = phone.toString().replace(/[\s\-\(\)\.]/g, '');
  if (clean.startsWith('00')) clean = '+' + clean.slice(2);
  if (clean.startsWith('+')) return clean;
  if (clean.startsWith('0') && clean.length === 11) return defaultCountry + clean.slice(1);
  if (/^\d{10}$/.test(clean)) return defaultCountry + clean;
  if (/^91\d{10}$/.test(clean)) return '+' + clean;
  return '+' + clean;
}

// Helper: Cryptographic OTP generator
function generateSecureOTP(length = 6, type = 'numeric') {
  const chars = type === 'alphanumeric' ? '23456789ABCDEFGHJKLMNPQRSTUVWXYZ' : '0123456789';
  const bytes = crypto.randomBytes(length);
  let otp = '';
  for (let i = 0; i < length; i++) {
    otp += chars[bytes[i] % chars.length];
  }
  return otp;
}

// Helper: Dispatch SMS via httpSMS
async function sendViaHttpSMS(to, content, from = CONFIG.gatewayFrom) {
  const response = await fetch('https://api.httpsms.com/v1/messages/send', {
    method: 'POST',
    headers: {
      'x-api-key': CONFIG.httpSMSApiKey.trim(),
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify({
      to,
      from,
      content,
      request_id: 'req_node_' + crypto.randomBytes(6).toString('hex')
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || `httpSMS error: ${response.status}`);
  }
  return data;
}

// Authentication Middleware
function authenticateApiKey(req, res, next) {
  const headerKey = req.headers['x-api-key'];
  const bearerKey = req.headers['authorization']?.replace(/^Bearer\s+/i, '');
  const apiKey = (headerKey || bearerKey || '').trim();

  if (!apiKey || (!VALID_KEYS.has(apiKey) && !apiKey.startsWith('sk_live_'))) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized. Provide a valid platform key via header x-api-key: sk_live_... or Bearer token'
    });
  }
  next();
}

/* -------------------------------------------------------------
 * API ROUTES
 * ----------------------------------------------------------- */

// 1. Health & Server Info
app.get('/api/v1/health', (req, res) => {
  res.json({
    status: 'healthy',
    platform: 'OmniOTP Cloud Universal Gateway',
    engine: 'httpSMS Android Gateway',
    gateway_from: CONFIG.gatewayFrom,
    timestamp: new Date().toISOString(),
    endpoints: {
      send_otp: 'POST /api/v1/otp/send',
      verify_otp: 'POST /api/v1/otp/verify',
      send_sms: 'POST /api/v1/sms/send',
      bulk_sms: 'POST /api/v1/sms/bulk',
      logs: 'GET /api/v1/logs'
    }
  });
});

// 2. Dispatch OTP
app.post('/api/v1/otp/send', authenticateApiKey, async (req, res) => {
  try {
    const { phone: rawPhone, length = 6, type = 'numeric', expiry_minutes = 5, app_name = 'OmniOTP', template } = req.body;
    const phone = formatPhone(rawPhone);

    if (!phone) {
      return res.status(400).json({ success: false, error: "Valid 'phone' number is required." });
    }

    const otp = generateSecureOTP(Number(length), type);
    const sessionId = 'sess_' + crypto.randomBytes(10).toString('hex');
    const expiresAt = new Date(Date.now() + expiry_minutes * 60 * 1000);

    const defaultTpl = 'Your verification code for {{app_name}} is {{otp}}. Valid for {{expiry}} minutes. Do not share.';
    const message = (template || defaultTpl)
      .replace(/{{otp}}/g, otp)
      .replace(/{{expiry}}/g, expiry_minutes)
      .replace(/{{app_name}}/g, app_name)
      .replace(/{{phone}}/g, phone);

    // Send through httpSMS
    await sendViaHttpSMS(phone, message);

    // Save session
    SESSIONS.set(sessionId, {
      sessionId,
      phone,
      otp,
      expiresAt,
      attemptsLeft: 3,
      verified: false,
      createdAt: new Date()
    });

    // Save log
    const logItem = {
      id: 'log_' + Date.now(),
      timestamp: new Date().toISOString(),
      type: 'OTP_SENT',
      phone,
      code: otp,
      status: 'SENT',
      sessionId
    };
    LOGS.unshift(logItem);
    if (LOGS.length > 200) LOGS.pop();

    res.json({
      success: true,
      session_id: sessionId,
      phone,
      expires_in_seconds: expiry_minutes * 60,
      expires_at: expiresAt.toISOString(),
      message: 'OTP dispatched successfully via httpSMS'
    });
  } catch (error) {
    res.status(502).json({ success: false, error: error.message });
  }
});

// 3. Verify OTP
app.post('/api/v1/otp/verify', authenticateApiKey, (req, res) => {
  const { otp, session_id, phone: rawPhone } = req.body;
  const userOtp = (otp || '').toString().trim();
  const phone = formatPhone(rawPhone);

  if (!userOtp) {
    return res.status(400).json({ success: false, verified: false, error: "Field 'otp' is required." });
  }

  let session = null;
  if (session_id && SESSIONS.has(session_id)) {
    session = SESSIONS.get(session_id);
  } else if (phone) {
    // Find latest active unverified session for this phone
    for (const s of SESSIONS.values()) {
      if (s.phone === phone && !s.verified) {
        if (!session || s.createdAt > session.createdAt) {
          session = s;
        }
      }
    }
  }

  if (!session) {
    return res.status(404).json({ success: false, verified: false, error: 'No active OTP session found.' });
  }

  if (session.verified) {
    return res.json({ success: true, verified: true, message: 'OTP already verified previously.' });
  }

  if (new Date() > session.expiresAt) {
    return res.status(400).json({ success: false, verified: false, error: 'OTP has expired.' });
  }

  if (session.attemptsLeft <= 0) {
    return res.status(429).json({ success: false, verified: false, error: 'Maximum verification attempts exceeded.' });
  }

  if (session.otp === userOtp) {
    session.verified = true;
    LOGS.unshift({
      id: 'log_' + Date.now(),
      timestamp: new Date().toISOString(),
      type: 'OTP_VERIFIED',
      phone: session.phone,
      code: userOtp,
      status: 'VERIFIED',
      sessionId: session.sessionId
    });

    return res.json({
      success: true,
      verified: true,
      phone: session.phone,
      message: 'OTP verified successfully! Access granted.'
    });
  } else {
    session.attemptsLeft--;
    return res.status(400).json({
      success: false,
      verified: false,
      error: 'Invalid OTP code.',
      attempts_left: session.attemptsLeft
    });
  }
});

// 4. Send Direct Transactional SMS
app.post('/api/v1/sms/send', authenticateApiKey, async (req, res) => {
  try {
    const { phone: rawPhone, message } = req.body;
    const phone = formatPhone(rawPhone);

    if (!phone || !message) {
      return res.status(400).json({ success: false, error: "Fields 'phone' and 'message' are required." });
    }

    const result = await sendViaHttpSMS(phone, message);
    res.json({
      success: true,
      phone,
      message: 'SMS dispatched successfully via httpSMS',
      data: result
    });
  } catch (error) {
    res.status(502).json({ success: false, error: error.message });
  }
});

// 5. Send Bulk SMS
app.post('/api/v1/sms/bulk', authenticateApiKey, async (req, res) => {
  try {
    const { phones = [], message, delay_ms = 1000 } = req.body;

    if (!Array.isArray(phones) || phones.length === 0 || !message) {
      return res.status(400).json({ success: false, error: "Fields 'phones' (array) and 'message' (string) are required." });
    }

    const results = [];
    let sentCount = 0;
    let failCount = 0;

    for (const raw of phones) {
      const p = formatPhone(raw);
      if (!p) continue;
      try {
        await sendViaHttpSMS(p, message);
        sentCount++;
        results.push({ phone: p, status: 'SENT' });
      } catch (e) {
        failCount++;
        results.push({ phone: p, status: 'FAILED', error: e.message });
      }
      if (delay_ms > 0) {
        await new Promise(r => setTimeout(r, delay_ms));
      }
    }

    res.json({
      success: true,
      total: phones.length,
      sent_count: sentCount,
      failed_count: failCount,
      details: results
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 6. Audit Logs
app.get('/api/v1/logs', authenticateApiKey, (req, res) => {
  res.json({
    success: true,
    count: LOGS.length,
    logs: LOGS
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`⚡ OmniOTP Cloud Server listening on http://0.0.0.0:${PORT}`);
  console.log(`🔑 Master Platform Key: ${CONFIG.masterApiKey}`);
});
