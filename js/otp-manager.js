/**
 * OTP Manager & Lifecycle Engine
 * Handles cryptographic code generation, templates, session state,
 * verification verification checks, attempt ratelimiting, and audit logging.
 */

class OTPManager {
  constructor(smsClient) {
    this.smsClient = smsClient || window.httpSMSClient;
    this.storageSessionsKey = 'httpsms_otp_sessions_v1';
    this.storageLogsKey = 'httpsms_otp_logs_v1';

    this.sessions = this.loadSessions();
    this.logs = this.loadLogs();
    this.activeSessionId = null;

    // Default settings
    this.defaultSettings = {
      otpLength: 6,
      otpType: 'numeric', // 'numeric' | 'alphanumeric'
      expiryMinutes: 5,
      maxAttempts: 3,
      cooldownSeconds: 60,
      template: 'Your verification code is {{otp}}. Valid for {{expiry}} minutes. Never share this code with anyone.'
    };
  }

  loadSessions() {
    try {
      const data = localStorage.getItem(this.storageSessionsKey);
      return data ? JSON.parse(data) : {};
    } catch (e) {
      return {};
    }
  }

  saveSessions() {
    try {
      localStorage.setItem(this.storageSessionsKey, JSON.stringify(this.sessions));
    } catch (e) {
      console.warn('Could not save sessions to storage', e);
    }
  }

  loadLogs() {
    try {
      const data = localStorage.getItem(this.storageLogsKey);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      return [];
    }
  }

  saveLogs() {
    try {
      localStorage.setItem(this.storageLogsKey, JSON.stringify(this.logs));
    } catch (e) {
      console.warn('Could not save logs to storage', e);
    }
  }

  addLog(entry) {
    const logItem = {
      id: 'log_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      timestamp: new Date().toISOString(),
      ...entry
    };
    this.logs.unshift(logItem);
    // Keep last 100 entries
    if (this.logs.length > 100) {
      this.logs = this.logs.slice(0, 100);
    }
    this.saveLogs();
    return logItem;
  }

  clearLogs() {
    this.logs = [];
    this.saveLogs();
  }

  /**
   * Cryptographically secure random OTP generation
   */
  generateOTP(length = 6, type = 'numeric') {
    const charset = type === 'alphanumeric' 
      ? '23456789ABCDEFGHJKLMNPQRSTUVWXYZ' 
      : '0123456789';
    
    const randomValues = new Uint32Array(length);
    window.crypto.getRandomValues(randomValues);
    
    let otp = '';
    for (let i = 0; i < length; i++) {
      otp += charset[randomValues[i] % charset.length];
    }
    return otp;
  }

  /**
   * Mask phone number for security display (+1 800 *** *199)
   */
  maskPhoneNumber(phone) {
    if (!phone || phone.length < 7) return phone;
    const len = phone.length;
    const start = phone.substring(0, 4);
    const end = phone.substring(len - 3);
    const masked = '*'.repeat(Math.max(3, len - 7));
    return `${start} ${masked} ${end}`;
  }

  /**
   * Format message content with dynamic template variables
   */
  formatTemplate(template, { otp, expiryMinutes, phone }) {
    return template
      .replace(/{{otp}}/gi, otp)
      .replace(/{{expiry}}/gi, expiryMinutes)
      .replace(/{{phone}}/gi, phone);
  }

  /**
   * Send a new OTP
   */
  async sendOTP({ phone, length = 6, type = 'numeric', expiryMinutes = 5, template = null }) {
    const cleanPhone = phone ? phone.trim() : '';
    const valid = this.smsClient.validatePhoneNumber(cleanPhone);
    if (!valid.valid) {
      throw new Error(valid.error);
    }

    const recipientPhone = valid.formatted;

    // Check cooldown for this specific phone number
    const existingSession = this.getActiveSessionForPhone(recipientPhone);
    if (existingSession && existingSession.cooldownUntil && Date.now() < existingSession.cooldownUntil) {
      const waitSec = Math.ceil((existingSession.cooldownUntil - Date.now()) / 1000);
      throw new Error(`Please wait ${waitSec}s before requesting a new OTP for this number.`);
    }

    const otpCode = this.generateOTP(length, type);
    const tpl = template || this.defaultSettings.template;
    const messageContent = this.formatTemplate(tpl, {
      otp: otpCode,
      expiryMinutes: expiryMinutes,
      phone: recipientPhone
    });

    const sessionId = 'otp_sess_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    const now = Date.now();
    const expiresAt = now + (expiryMinutes * 60 * 1000);
    const cooldownUntil = now + (this.defaultSettings.cooldownSeconds * 1000);

    const startTime = performance.now();

    // Call httpSMS Client
    let dispatchResult;
    try {
      dispatchResult = await this.smsClient.sendMessage({
        to: recipientPhone,
        content: messageContent,
        requestId: sessionId
      });
    } catch (err) {
      // Record failure in logs
      this.addLog({
        type: 'OTP_DISPATCH',
        status: 'FAILED',
        phone: recipientPhone,
        maskedPhone: this.maskPhoneNumber(recipientPhone),
        error: err.message,
        simulated: this.smsClient.config.isSimulated || !this.smsClient.config.apiKey,
        durationMs: Math.round(performance.now() - startTime)
      });
      throw err;
    }

    const latency = Math.round(performance.now() - startTime);

    // Save Session
    const sessionData = {
      id: sessionId,
      phone: recipientPhone,
      maskedPhone: this.maskPhoneNumber(recipientPhone),
      code: otpCode, // stored securely in session for verification
      length: length,
      type: type,
      createdAt: now,
      expiresAt: expiresAt,
      cooldownUntil: cooldownUntil,
      attemptsLeft: this.defaultSettings.maxAttempts,
      maxAttempts: this.defaultSettings.maxAttempts,
      status: 'pending', // 'pending' | 'verified' | 'expired' | 'exhausted'
      messageContent: messageContent,
      simulated: dispatchResult.simulated || false,
      messageId: dispatchResult.data?.id || 'msg_' + Date.now(),
      verificationToken: null
    };

    this.sessions[sessionId] = sessionData;
    this.activeSessionId = sessionId;
    this.saveSessions();

    // Log success dispatch (code masked for security)
    this.addLog({
      type: 'OTP_DISPATCH',
      status: 'SENT',
      sessionId: sessionId,
      phone: recipientPhone,
      maskedPhone: this.maskPhoneNumber(recipientPhone),
      code: '••••••', // never expose plain OTP in audit logs
      messageId: sessionData.messageId,
      simulated: sessionData.simulated,
      content: 'Verification OTP sent to recipient device',
      durationMs: latency
    });

    return {
      sessionId: sessionId,
      phone: recipientPhone,
      maskedPhone: sessionData.maskedPhone,
      expiresAt: expiresAt,
      cooldownSeconds: this.defaultSettings.cooldownSeconds,
      simulated: sessionData.simulated
    };
  }

  /**
   * Get active session by ID
   */
  getSession(sessionId) {
    return this.sessions[sessionId] || null;
  }

  /**
   * Find most recent pending session for a phone number
   */
  getActiveSessionForPhone(phone) {
    const list = Object.values(this.sessions).filter(s => s.phone === phone);
    if (!list.length) return null;
    list.sort((a, b) => b.createdAt - a.createdAt);
    return list[0];
  }

  /**
   * Verify an OTP
   */
  verifyOTP(sessionId, enteredCode) {
    const session = this.sessions[sessionId];
    if (!session) {
      return { success: false, reason: 'SESSION_NOT_FOUND', message: 'No OTP session found. Please request a new code.' };
    }

    // Check if already verified
    if (session.status === 'verified') {
      return {
        success: true,
        alreadyVerified: true,
        message: 'This code was already verified.',
        token: session.verificationToken,
        phone: session.phone
      };
    }

    // Check expiration
    if (Date.now() > session.expiresAt) {
      session.status = 'expired';
      this.saveSessions();
      this.addLog({
        type: 'OTP_VERIFICATION',
        status: 'EXPIRED',
        sessionId: session.id,
        phone: session.phone,
        message: 'Attempted verification on expired OTP'
      });
      return { success: false, reason: 'EXPIRED', message: 'OTP has expired. Please request a new verification code.' };
    }

    // Check attempts
    if (session.attemptsLeft <= 0 || session.status === 'exhausted') {
      session.status = 'exhausted';
      this.saveSessions();
      return {
        success: false,
        reason: 'MAX_ATTEMPTS_EXCEEDED',
        message: 'Maximum verification attempts exceeded. Please request a new code.'
      };
    }

    const cleanEntered = enteredCode ? enteredCode.toString().trim().toUpperCase() : '';
    const expected = session.code.toString().trim().toUpperCase();

    if (cleanEntered === expected) {
      // Success!
      session.status = 'verified';
      session.verifiedAt = Date.now();
      session.verificationToken = 'jwt_otp_' + btoa(`${session.phone}:${Date.now()}:${Math.random().toString(36)}`);
      this.saveSessions();

      this.addLog({
        type: 'OTP_VERIFICATION',
        status: 'VERIFIED',
        sessionId: session.id,
        phone: session.phone,
        token: session.verificationToken,
        message: 'OTP verified successfully'
      });

      return {
        success: true,
        message: 'Sahi OTP! Mobile number successfully verify ho gaya.',
        token: session.verificationToken,
        phone: session.phone,
        maskedPhone: session.maskedPhone,
        verifiedAt: session.verifiedAt
      };
    } else {
      // Incorrect code
      session.attemptsLeft -= 1;
      const exhausted = session.attemptsLeft <= 0;
      if (exhausted) {
        session.status = 'exhausted';
      }
      this.saveSessions();

      this.addLog({
        type: 'OTP_VERIFICATION',
        status: exhausted ? 'EXHAUSTED' : 'INCORRECT',
        sessionId: session.id,
        phone: session.phone,
        attemptsLeft: session.attemptsLeft,
        message: 'Incorrect OTP attempt'
      });

      return {
        success: false,
        reason: exhausted ? 'MAX_ATTEMPTS_EXCEEDED' : 'INVALID_CODE',
        attemptsLeft: session.attemptsLeft,
        message: exhausted
          ? 'Galat OTP! Jyada baar galat code dala gaya hai. Session block ho gaya hai.'
          : `Galat OTP! (Incorrect Code). Kripya apne phone ka SMS check karein aur sahi code dalein. (${session.attemptsLeft} attempts bache hain)`
      };
    }
  }

  /**
   * Resend OTP for existing session
   */
  async resendOTP(sessionId) {
    const session = this.sessions[sessionId];
    if (!session) {
      throw new Error('Session not found.');
    }

    return await this.sendOTP({
      phone: session.phone,
      length: session.length,
      type: session.type,
      expiryMinutes: Math.round((session.expiresAt - session.createdAt) / 60000) || 5
    });
  }

  /**
   * Send custom transactional or alert SMS
   */
  async sendCustomSMS({ phone, content, from }) {
    const startTime = performance.now();
    try {
      const result = await this.smsClient.sendMessage({
        to: phone,
        content: content,
        from: from
      });

      this.addLog({
        type: 'CUSTOM_SMS',
        status: 'SENT',
        phone: phone,
        content: content,
        simulated: result.simulated,
        durationMs: Math.round(performance.now() - startTime)
      });

      return result;
    } catch (err) {
      this.addLog({
        type: 'CUSTOM_SMS',
        status: 'FAILED',
        phone: phone,
        content: content,
        error: err.message,
        durationMs: Math.round(performance.now() - startTime)
      });
      throw err;
    }
  }

  /**
   * Calculate summary metrics for executive dashboard
   */
  getStats() {
    const totalDispatched = this.logs.filter(l => l.status === 'SENT').length;
    const totalVerified = this.logs.filter(l => l.status === 'VERIFIED').length;
    const totalFailed = this.logs.filter(l => l.status === 'FAILED').length;
    const otpSessionsCount = Object.keys(this.sessions).length;
    const successRate = totalDispatched > 0 
      ? Math.round((totalVerified / Math.max(1, totalDispatched)) * 100) 
      : 100;

    return {
      totalDispatched,
      totalVerified,
      totalFailed,
      otpSessionsCount,
      successRate: Math.min(100, successRate)
    };
  }
}

// Global instance
window.otpManager = new OTPManager(window.httpSMSClient);
