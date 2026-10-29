/**
 * OmniOTP Cloud - OTP Manager & Lifecycle Engine (backend-driven)
 *
 * SECURITY: The OTP code is generated and verified by the trusted backend only.
 * The browser never generates, stores, or compares the plaintext OTP. It only
 * holds session metadata (id, phone, maskedPhone, status, expiry).
 */

class OTPManager {
  constructor(smsClient) {
    this.smsClient = smsClient || window.httpSMSClient;
    this.sessionsStorageKey = 'omni_otp_sessions_v2';
    this.logsStorageKey = 'omni_otp_logs_v2';

    this.supabaseStorage = window.supabaseStorage || null;

    this.sessions = this.loadSessions();
    this.logs = this.loadLogs();
    this.activeSessionId = null;

    // Default settings (expiry/cooldown/attempts are enforced by the backend too)
    this.defaultSettings = {
      otpLength: 6,
      otpType: 'numeric',
      expiryMinutes: 5,
      maxAttempts: 3,
      cooldownSeconds: 60,
      template: 'Your verification code is {{otp}}. Valid for {{expiry}} minutes. Never share this code with anyone.'
    };

    this.enabled = !!this.supabaseStorage;
  }

  /** Save sessions to local storage */
  saveSessions() {
    try { localStorage.setItem(this.sessionsStorageKey, JSON.stringify(this.sessions)); } catch (e) { console.warn('Could not save sessions', e); }
  }
  loadSessions() {
    try { const d = localStorage.getItem(this.sessionsStorageKey); return d ? JSON.parse(d) : {}; } catch (e) { return {}; }
  }
  loadLogs() {
    try { const d = localStorage.getItem(this.logsStorageKey); return d ? JSON.parse(d) : []; } catch (e) { return []; }
  }
  saveLogs() {
    try { localStorage.setItem(this.logsStorageKey, JSON.stringify(this.logs)); } catch (e) { console.warn('Could not save logs', e); }
  }
  addLog(entry) {
    const logItem = { id: 'log_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6), timestamp: new Date().toISOString(), ...entry };
    this.logs.unshift(logItem);
    if (this.logs.length > 100) this.logs = this.logs.slice(0, 100);
    this.saveLogs();
    if (window.supabaseClient) {
      const row = {
        id: logItem.id,
        timestamp: logItem.timestamp,
        type: logItem.type || 'CLIENT',
        status: logItem.status || 'INFO',
        session_id: logItem.sessionId || null,
        phone: logItem.phone || null,
        masked_phone: logItem.maskedPhone || null,
        content: logItem.content || logItem.message || null,
        error: logItem.error || null,
        simulated: !!logItem.simulated,
        duration_ms: logItem.durationMs || null
      };
      window.supabaseClient.from('omni_logs').insert(row).then(({ error }) => {
        if (error) console.warn('Supabase log sync failed:', error.message);
      }).catch(e => console.warn('Supabase log sync failed:', e.message));
    }
    return logItem;
  }

  /** Mask phone number for display only */
  maskPhoneNumber(phone) {
    if (!phone || phone.length < 7) return phone;
    const len = phone.length;
    return phone.substring(0, 4) + '*'.repeat(Math.max(3, len - 7)) + phone.substring(len - 3);
  }

  /** Format message template (client-side preview only) */
  formatTemplate(template, { otp, expiryMinutes, phone }) {
    return template
      .replace(/{{otp}}/gi, otp)
      .replace(/{{expiry}}/gi, expiryMinutes)
      .replace(/{{phone}}/gi, phone);
  }

  /** Backend base URL + platform key from httpSMS config */
  _apiBase() {
    const cfg = this.smsClient.getConfig && this.smsClient.getConfig();
    return (cfg && cfg.serverUrl ? cfg.serverUrl.replace(/\/$/, '') : 'http://localhost:5000');
  }
  _platformKey() {
    const cfg = this.smsClient.getConfig && this.smsClient.getConfig();
    return (cfg && cfg.platformApiKey) || 'sk_live_change_me_in_production';
  }

  /** Get active session by ID (metadata only - no OTP code) */
  getSession(sessionId) {
    return this.sessions[sessionId] || null;
  }

  /** Find most recent pending session for a phone number */
  getActiveSessionForPhone(phone) {
    const list = Object.values(this.sessions).filter((s) => s.phone === phone);
    if (!list.length) return null;
    list.sort((a, b) => b.createdAt - a.createdAt);
    return list[0];
  }

  /** Send a new OTP via the backend (backend generates + sends the code; browser never sees it) */
  async sendOTP({ phone, length = 6, type = 'numeric', expiryMinutes = 5, template = null }) {
    const cleanPhone = phone ? phone.trim() : '';
    const valid = this.smsClient.validatePhoneNumber(cleanPhone);
    if (!valid.valid) {
      throw new Error(valid.error);
    }
    const recipientPhone = valid.formatted;

    const startTime = performance.now();
    let data;
    try {
      const res = await fetch(this._apiBase() + '/api/v1/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': this._platformKey() },
        body: JSON.stringify({ phone: recipientPhone, length, type, expiry_minutes: expiryMinutes, template })
      });
      data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'OTP dispatch failed (HTTP ' + res.status + ')');
      }
    } catch (err) {
      this.addLog({
        type: 'OTP_DISPATCH', status: 'FAILED', phone: recipientPhone,
        maskedPhone: this.maskPhoneNumber(recipientPhone), error: err.message, simulated: false,
        durationMs: Math.round(performance.now() - startTime)
      });
      throw err;
    }

    const latency = Math.round(performance.now() - startTime);
    const cooldownSeconds = data.expires_in_seconds ? Math.round(data.expires_in_seconds / 60) : this.defaultSettings.cooldownSeconds;

    const sessionData = {
      id: data.session_id,
      phone: data.phone,
      maskedPhone: data.masked_phone || this.maskPhoneNumber(data.phone),
      length, type,
      createdAt: Date.now(),
      expiresAt: data.expires_at,
      cooldownUntil: Date.now() + (cooldownSeconds * 1000),
      attemptsLeft: this.defaultSettings.maxAttempts,
      maxAttempts: this.defaultSettings.maxAttempts,
      status: 'pending',
      messageContent: null,
      simulated: false,
      messageId: null,
      verificationToken: null
    };

    this.sessions[sessionData.id] = sessionData;
    this.activeSessionId = sessionData.id;
    this.saveSessions();
    if (this.supabaseStorage) {
      try { await this.supabaseStorage.saveAllRows('otp_sessions', [{ id: sessionData.id, phone: sessionData.phone, masked_phone: sessionData.maskedPhone, status: 'pending', expires_at: sessionData.expiresAt, attempts_left: sessionData.attemptsLeft, max_attempts: sessionData.maxAttempts, simulated: false, provider_status: data.provider_status }]); } catch (e) { console.warn('Supabase session sync failed:', e); }
    }

    this.addLog({
      type: 'OTP_DISPATCH', status: 'SENT', sessionId: sessionData.id, phone: sessionData.phone,
      maskedPhone: sessionData.maskedPhone, code: '••••••', messageId: data.message_id || null,
      simulated: false, content: 'Verification OTP sent via backend', durationMs: latency
    });

    return {
      sessionId: sessionData.id,
      phone: sessionData.phone,
      maskedPhone: sessionData.maskedPhone,
      expiresAt: sessionData.expiresAt,
      cooldownSeconds,
      provider_status: data.provider_status,
      simulated: false
    };
  }

  /** Resend an OTP for the same phone */
  async resendOTP(sessionId) {
    const session = this.sessions[sessionId];
    if (!session) throw new Error('Session not found.');
    return await this.sendOTP({ phone: session.phone, length: session.length, type: session.type, expiryMinutes: this.defaultSettings.expiryMinutes });
  }

  /** Send custom transactional SMS (backend) */
  async sendCustomSMS({ phone, content, from }) {
    const startTime = performance.now();
    try {
      const res = await fetch(this._apiBase() + '/api/v1/sms/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': this._platformKey() },
        body: JSON.stringify({ phone, message: content })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Direct SMS failed');
      this.addLog({ type: 'CUSTOM_SMS', status: 'SENT', phone, content, simulated: false, durationMs: Math.round(performance.now() - startTime) });
      return data;
    } catch (err) {
      this.addLog({ type: 'CUSTOM_SMS', status: 'FAILED', phone, content, error: err.message, durationMs: Math.round(performance.now() - startTime) });
      throw err;
    }
  }

  /** Verify an OTP via the backend (backend compares the hash; client never sees the code) */
  async verifyOTP(sessionId, enteredCode) {
    const session = this.sessions[sessionId];
    if (!session) {
      return { success: false, reason: 'SESSION_NOT_FOUND', message: 'No OTP session found. Please request a new code.' };
    }
    if (session.status === 'verified') {
      return { success: true, alreadyVerified: true, message: 'This code was already verified.', token: session.verificationToken, phone: session.phone };
    }
    if (session.status === 'expired') {
      return { success: false, reason: 'EXPIRED', message: 'OTP has expired. Please request a new verification code.' };
    }
    if (session.status === 'exhausted' || ((session.attemptsLeft || 1) <= 0)) {
      return { success: false, reason: 'MAX_ATTEMPTS_EXCEEDED', message: 'Maximum verification attempts exceeded. Please request a new code.' };
    }

    const startTime = performance.now();
    try {
      const res = await fetch(this._apiBase() + '/api/v1/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': this._platformKey() },
        body: JSON.stringify({ session_id: sessionId, otp: enteredCode, phone: session.phone })
      });
      const data = await res.json().catch(() => ({}));
      const latency = Math.round(performance.now() - startTime);

      if (!res.ok) {
        if (data.attempts_left !== undefined) {
          session.attemptsLeft = data.attempts_left;
          if (data.attempts_left <= 0) session.status = 'exhausted';
          this.saveSessions();
        }
        if (res.status === 429) session.status = 'exhausted';
        this.addLog({
          type: 'OTP_VERIFICATION', status: res.status === 429 ? 'EXHAUSTED' : 'INCORRECT',
          sessionId, phone: session.phone, attemptsLeft: session.attemptsLeft,
          message: data.error || 'Incorrect OTP attempt', durationMs: latency
        });
        return {
          success: false,
          reason: res.status === 429 ? 'MAX_ATTEMPTS_EXCEEDED' : (data.error && data.error.includes('expired') ? 'EXPIRED' : 'INVALID_CODE'),
          message: data.error || 'Incorrect OTP code.',
          attemptsLeft: data.attempts_left !== undefined ? data.attempts_left : session.attemptsLeft
        };
      }

      session.status = 'verified';
      session.verifiedAt = Date.now();
      session.verificationToken = data.token || ('otp_' + cryptoRandom());
      this.saveSessions();
      this.addLog({
        type: 'OTP_VERIFICATION', status: 'VERIFIED', sessionId, phone: session.phone,
        token: session.verificationToken, message: 'OTP verified successfully', durationMs: latency
      });
      return {
        success: true, message: data.message || 'OTP verified successfully',
        token: session.verificationToken, phone: session.phone, maskedPhone: session.maskedPhone,
        verifiedAt: session.verifiedAt
      };
    } catch (err) {
      this.addLog({ type: 'OTP_VERIFICATION', status: 'ERROR', sessionId, phone: session.phone, error: err.message, message: 'Verification request failed' });
      return { success: false, reason: 'NETWORK_ERROR', message: 'Verification request failed: ' + err.message };
    }
  }

  /** Calculate summary metrics (local logs) */
  getStats() {
    const totalDispatched = this.logs.filter(l => l.status === 'SENT').length;
    const totalVerified = this.logs.filter(l => l.status === 'VERIFIED').length;
    const totalFailed = this.logs.filter(l => l.status === 'FAILED').length;
    const otpSessionsCount = Object.keys(this.sessions).length;
    const successRate = totalDispatched > 0 ? Math.round((totalVerified / Math.max(1, totalDispatched)) * 100) : 100;
    return { totalDispatched, totalVerified, totalFailed, otpSessionsCount, successRate: Math.min(100, successRate) };
  }

  /** Normalize phone to E.164 (+91 default) */
  normalizePhone(phone) {
    let cleaned = phone.trim().replace(/[\s\-\(\)\.]/g, '');
    if (cleaned.startsWith('+91')) return '+' + cleaned.slice(3);
    if (cleaned.startsWith('00')) return '+' + cleaned.slice(2);
    if (cleaned.startsWith('0') && cleaned.length === 11) return '+91' + cleaned.slice(1);
    if (/^\d{10}$/.test(cleaned)) return '+91' + cleaned;
    if (/^91\d{10}$/.test(cleaned)) return '+' + cleaned;
    return '+' + cleaned;
  }
}

// Global instance
window.otpManager = new OTPManager(window.httpSMSClient);

function cryptoRandom() {
  return Array.from(crypto.getRandomValues(new Uint8Array(12))).map(b => b.toString(36)).join('');
}