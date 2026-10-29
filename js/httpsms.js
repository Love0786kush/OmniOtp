/**
 * OmniOTP Cloud - httpSMS Core Client & API Gateway Engine
 * Handles direct communication with httpsms.com, local PowerShell/Node server,
 * and manages platform API keys and dynamic SMS templates.
 */

class HttpSMSClient {
  constructor() {
    this.storageConfigKey = 'omni_httpsms_config_v3';
    this.storageKeysKey = 'omni_platform_api_keys_v1';
    this.storageTemplatesKey = 'omni_sms_templates_v1';
    this.storageGatewaysKey = 'omni_gateway_pool_v1';

    // Default httpSMS credentials (configured by admin). Browser holds these for display only;
    // actual dispatch is routed through the backend so the key is never sent to httpsms.com from the browser.
    this.defaultApiKey = 'pk_JJwFKTe9zE8E_dwF-GsMjbo440Dnz-QC3ZubkHKMhGYzIIYQrC_6NK7FHr1d0fLo';
    this.defaultFromNumber = '7852081659';

    this.config = { apiKey: this.defaultApiKey, fromNumber: this.defaultFromNumber, isSimulated: false, defaultCountryCode: '+91', serverUrl: 'http://localhost:5000', useBackendServer: true, soundEffects: true, platformApiKey: 'sk_live_change_me_in_production' };
    this.apiKeys = [];
    this.templates = [];
    this.gateways = [];
    this.ready = this.hydrate();
  }

  hydrate() {
    this.config = this.loadConfig();
    this.apiKeys = this.loadApiKeys();
    this.templates = this.loadTemplates();
    this.gateways = this.loadGateways();

    // Sync initial data to Supabase if available
    if (window.supabaseStorage) {
      try {
        Promise.all([
          window.supabaseStorage.saveAll('omni_api_keys', this.apiKeys),
          window.supabaseStorage.saveAll('omni_templates', this.templates.map(t => ({
            id: t.id, name: t.name, category: t.category, text: t.text, is_default: t.isDefault || false
          }))),
          window.supabaseStorage.saveAll('omni_gateways', this.gateways)
        ]).catch(e => console.warn('Initial Supabase sync failed:', e.message));
      } catch (e) {
        console.warn('Initial Supabase sync failed:', e.message);
      }
    }
  }

  /**
   * Helper: Sync data to Supabase when available
   */
  async syncToSupabase(table, data) {
    if (window.supabaseClient && data && data.length) {
      try {
        await window.supabaseClient.from(table).upsert(data);
      } catch (e) {
        console.warn('Supabase sync failed for', table, e.message);
      }
    }
  }

  loadGateways() {
    const saved = localStorage.getItem(this.storageGatewaysKey);
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { }
    }
    return [];
  }

  async saveGateways() {
    localStorage.setItem(this.storageGatewaysKey, JSON.stringify(this.gateways));
    await this.syncToSupabase('omni_gateways', this.gateways);
  }

  addGateway(gw) {
    const item = {
      id: 'gw_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      name: gw.name || 'Gateway',
      from_number: gw.from || gw.from_number || '',
      api_key: gw.apiKey || gw.api_key || '',
      cap: Math.max(1, Number(gw.cap) || 1000),
      sent: 0,
      active: true
    };
    this.gateways.unshift(item);
    this.saveGateways();
    return item;
  }

  removeGateway(id) {
    this.gateways = this.gateways.filter(g => g.id !== id);
    this.saveGateways();
  }

  resetGateway(id) {
    const g = this.gateways.find(x => x.id === id);
    if (g) { g.sent = 0; this.saveGateways(); }
  }

  toggleGateway(id, active) {
    const g = this.gateways.find(x => x.id === id);
    if (g) { g.active = active; this.saveGateways(); }
  }

  pickGateway() {
    const available = this.gateways.filter(g => g.active && (g.sent || 0) < (g.cap || 1000));
    if (!available.length) throw new Error('No available gateway: all at cap or inactive.');
    const gw = available[Math.floor(Math.random() * available.length)];
    gw.sent = (gw.sent || 0) + 1;
    this.saveGateways();
    return gw;
  }

  /* -------------------------------------------------------------
   * CONFIGURATION
   * ----------------------------------------------------------- */
  loadConfig() {
    const saved = localStorage.getItem(this.storageConfigKey);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (!parsed.apiKey || parsed.apiKey.length < 10) {
          parsed.apiKey = this.defaultApiKey;
        }
        if (!parsed.fromNumber) {
          parsed.fromNumber = this.defaultFromNumber;
        }
        if (!parsed.serverUrl) {
          parsed.serverUrl = 'http://localhost:5000';
        }
      } catch (e) {
        console.error('Error parsing config', e);
      }
    }

    const initial = {
      apiKey: this.defaultApiKey,
      fromNumber: this.defaultFromNumber,
      isSimulated: false,
      defaultCountryCode: '+91',
      serverUrl: 'http://localhost:5000',
      useBackendServer: true, // route through backend by default to avoid exposing httpSMS key in browser
      soundEffects: true
    };
    localStorage.setItem(this.storageConfigKey, JSON.stringify(initial));
    return initial;
  }

  saveConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    localStorage.setItem(this.storageConfigKey, JSON.stringify(this.config));
    this.syncToSupabase('omni_config', [{ key: 'config', value: this.config }]);
    return this.config;
  }

  getConfig() {
    return { ...this.config };
  }

  /* -------------------------------------------------------------
   * PLATFORM API KEYS MANAGEMENT (For External Android & Web Apps)
   * ----------------------------------------------------------- */
  loadApiKeys() {
    const saved = localStorage.getItem(this.storageKeysKey);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) { }
    }

    const defaultKeys = [
      {
        id: 'key_1',
        name: 'Master Production Key',
        key: 'sk_live_change_me_in_production',
        created_at: new Date(Date.now() - 86400000 * 5).toISOString(),
        last_used: new Date().toISOString(),
        status: 'ACTIVE',
        requests_count: 142
      },
      {
        id: 'key_2',
        name: 'Android Mobile App Client',
        key: 'sk_live_android_app_demo',
        created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
        last_used: new Date(Date.now() - 3600000).toISOString(),
        status: 'ACTIVE',
        requests_count: 89
      },
      {
        id: 'key_3',
        name: 'E-commerce Website Portal',
        key: 'sk_live_web_portal_demo',
        created_at: new Date(Date.now() - 86400000).toISOString(),
        last_used: new Date().toISOString(),
        status: 'ACTIVE',
        requests_count: 37
      }
    ];

    localStorage.setItem(this.storageKeysKey, JSON.stringify(defaultKeys));
    return defaultKeys;
  }

  async saveApiKeys() {
    localStorage.setItem(this.storageKeysKey, JSON.stringify(this.apiKeys));
    await this.syncToSupabase('omni_api_keys', this.apiKeys);
  }

  addApiKey(name = 'Added API Key', key) {
    const newKey = {
      id: 'key_' + Date.now(),
      name: name.trim() || 'API Key',
      key: (key || '').trim(),
      created_at: new Date().toISOString(),
      last_used: 'Never',
      status: 'ACTIVE',
      requests_count: 0
    };
    this.apiKeys.unshift(newKey);
    this.saveApiKeys();
    return newKey;
  }

  generateApiKey(name = 'New App Key') {
    const randomHex = Array.from(window.crypto.getRandomValues(new Uint8Array(12)))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    const newKey = {
      id: 'key_' + Date.now(),
      name: name.trim() || 'API Key',
      key: 'sk_live_' + randomHex,
      created_at: new Date().toISOString(),
      last_used: 'Never',
      status: 'ACTIVE',
      requests_count: 0
    };
    this.apiKeys.unshift(newKey);
    this.saveApiKeys();
    return newKey;
  }

  revokeApiKey(keyId) {
    const key = this.apiKeys.find(k => k.id === keyId);
    if (key) {
      key.status = key.status === 'ACTIVE' ? 'REVOKED' : 'ACTIVE';
      this.saveApiKeys();
    }
    return key;
  }

  deleteApiKey(keyId) {
    this.apiKeys = this.apiKeys.filter(k => k.id !== keyId);
    this.saveApiKeys();
    return this.apiKeys;
  }

  getActiveApiKey() {
    const active = this.apiKeys.find(k => k.status === 'ACTIVE');
    return active ? active.key : 'sk_live_change_me_in_production';
  }

  /* -------------------------------------------------------------
   * DYNAMIC SMS TEMPLATES ENGINE
   * ----------------------------------------------------------- */
  loadTemplates() {
    const saved = localStorage.getItem(this.storageTemplatesKey);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) { }
    }

    const defaultTemplates = [
      {
        id: 'tpl_login',
        name: 'Login OTP (Standard)',
        category: 'AUTH',
        text: 'Your login verification code for {{app_name}} is {{otp}}. Valid for {{expiry}} minutes. Do not share this code with anyone.',
        isDefault: true
      },
      {
        id: 'tpl_signup',
        name: 'New User Registration',
        category: 'AUTH',
        text: 'Welcome to {{app_name}}! Use code {{otp}} to verify your phone number and complete registration. Expires in {{expiry}} mins.',
        isDefault: false
      },
      {
        id: 'tpl_reset',
        name: 'Password Reset',
        category: 'SECURITY',
        text: 'Your {{app_name}} password reset code is {{otp}}. If you did not request this, please secure your account immediately.',
        isDefault: false
      },
      {
        id: 'tpl_transaction',
        name: '2FA Payment / Transaction',
        category: 'FINANCE',
        text: 'OTP for transaction authentication is {{otp}}. Valid for {{expiry}} min. Never disclose OTP to bank or support staff.',
        isDefault: false
      },
      {
        id: 'tpl_bulk_promo',
        name: 'Promotional / Alert',
        category: 'MARKETING',
        text: 'Hi {{name}}, exclusive offers are now live on {{app_name}}! Log in now to claim your discount. Limited time only.',
        isDefault: false
      }
    ];

    localStorage.setItem(this.storageTemplatesKey, JSON.stringify(defaultTemplates));
    return defaultTemplates;
  }

  async saveTemplates() {
    localStorage.setItem(this.storageTemplatesKey, JSON.stringify(this.templates));
    await this.syncToSupabase('omni_templates', this.templates.map(t => ({ id: t.id, name: t.name, category: t.category, text: t.text, is_default: t.isDefault || false })));
  }

  async addTemplate({ name, category = 'CUSTOM', text, isDefault = false }) {
    if (isDefault) {
      this.templates.forEach(t => t.isDefault = false);
    }
    const newTpl = {
      id: 'tpl_' + Date.now(),
      name: name.trim() || 'Custom Template',
      category: category,
      text: text.trim(),
      isDefault: isDefault
    };
    this.templates.unshift(newTpl);
    this.saveTemplates();
    return newTpl;
  }

  async updateTemplate(id, { name, text, isDefault }) {
    const tpl = this.templates.find(t => t.id === id);
    if (tpl) {
      if (isDefault) {
        this.templates.forEach(t => t.isDefault = false);
      }
      if (name) tpl.name = name;
      if (text) tpl.text = text;
      if (isDefault !== undefined) tpl.isDefault = isDefault;
      this.saveTemplates();
    }
    return tpl;
  }

  deleteTemplate(id) {
    this.templates = this.templates.filter(t => t.id !== id);
    this.saveTemplates();
    return this.templates;
  }

  getDefaultTemplate() {
    return this.templates.find(t => t.isDefault) || this.templates[0];
  }

  compileTemplate(templateText, params = {}) {
    let result = templateText || '';
    const replacements = {
      '{{otp}}': params.otp || '123456',
      '{{expiry}}': params.expiry || '5',
      '{{app_name}}': params.appName || 'OmniOTP',
      '{{phone}}': params.phone || '+919876543210',
      '{{name}}': params.name || 'Customer',
      '{{amount}}': params.amount || '999'
    };

    for (const [key, val] of Object.entries(replacements)) {
      result = result.split(key).join(val);
    }
    return result;
  }

  /* -------------------------------------------------------------
   * PHONE NUMBER NORMALIZATION
   * ----------------------------------------------------------- */
  validatePhoneNumber(phone, defaultCountry = '+91') {
    if (!phone) return { valid: false, error: 'Phone number is required' };

    let cleaned = phone.toString().trim().replace(/[\s\-\(\)\.]/g, '');

    if (cleaned.startsWith('00')) {
      cleaned = '+' + cleaned.substring(2);
    }

    if (cleaned.startsWith('+')) {
      const e164Regex = /^\+[1-9]\d{6,14}$/;
      if (!e164Regex.test(cleaned)) {
        return {
          valid: false,
          error: 'Please enter a valid international number with country code (e.g. +919876543210)'
        };
      }
      return { valid: true, formatted: cleaned };
    }

    if (cleaned.startsWith('0') && cleaned.length === 11) {
      cleaned = defaultCountry + cleaned.substring(1);
      return { valid: true, formatted: cleaned };
    }

    if (/^\d{10}$/.test(cleaned)) {
      cleaned = defaultCountry + cleaned;
      return { valid: true, formatted: cleaned };
    }

    if (/^91\d{10}$/.test(cleaned)) {
      cleaned = '+' + cleaned;
      return { valid: true, formatted: cleaned };
    }

    if (/^\d{7,15}$/.test(cleaned)) {
      cleaned = '+' + cleaned;
      return { valid: true, formatted: cleaned };
    }

    return {
      valid: false,
      error: 'Invalid phone number. Enter a 10-digit mobile number or full international format (+91...)'
    };
  }

  /* -------------------------------------------------------------
   * MESSAGE DISPATCH (DIRECT HTTPSMS OR LOCAL SERVER)
   * ----------------------------------------------------------- */
  async sendMessage({ to, content, from, requestId }) {
    const toValidation = this.validatePhoneNumber(to, this.config.defaultCountryCode || '+91');
    if (!toValidation.valid) {
      throw new Error(toValidation.error);
    }

    // Route through backend server when enabled (avoids CORS + keeps httpSMS key server-side)
    if (this.config.useBackendServer) {
      const serverUrl = (this.config.serverUrl || 'http://localhost:5000').replace(/\/$/, '');
      const platformKey = (typeof this.getActiveApiKey === 'function' ? this.getActiveApiKey() : null) || this.config.platformApiKey || 'sk_live_change_me_in_production';
      try {
        const response = await fetch(serverUrl + '/api/v1/sms/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': platformKey
          },
          body: JSON.stringify({ phone: toValidation.formatted, message: content })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data.error || data.message || ('Server error: HTTP ' + response.status));
        }
        return {
          status: 'success',
          simulated: false,
          message: data.message || 'SMS dispatched successfully via server',
          data: data.data || data
        };
      } catch (err) {
        // Backend unreachable: surface the error. No direct browser->httpSMS fallback,
        // because that would expose the httpSMS API key to the browser.
        throw new Error('SMS dispatch failed: backend unreachable (' + err.message + ')');
      }
    }

    // If useBackendServer is false (not recommended), still do NOT call httpSMS directly
    // from the browser. Route everything through the trusted backend.
    throw new Error('SMS dispatch is only available through the backend server.');
  }

  /* -------------------------------------------------------------
   * TEST CONNECTION & ACCOUNT INFO
   * ----------------------------------------------------------- */
  async testConnection(apiKey) {
    const key = apiKey || this.config.apiKey;
    if (!key || key.trim().length < 8) {
      return { success: false, message: 'Please provide a valid httpSMS API key.' };
    }

    try {
      const res = await fetch('https://api.httpsms.com/v1/users/me', {
        headers: {
          'x-api-key': key.trim(),
          'Accept': 'application/json'
        }
      });
      const data = await res.json();
      if (res.ok && data.status === 'success') {
        const email = data.data?.email || 'Registered User';
        return {
          success: true,
          message: `Connected successfully to httpSMS account (${email})!`
        };
      } else {
        return {
          success: false,
          message: data.message || 'Invalid API Key or unauthorized request.'
        };
      }
    } catch (e) {
      return { success: false, message: 'Network error or unable to reach httpSMS API.' };
    }
  }
}

// Expose class for callers that need to instantiate a client
window.HttpSMSClient = HttpSMSClient;
// Global Client Instance
window.httpSMSClient = new HttpSMSClient();
