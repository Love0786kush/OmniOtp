/**
 * OmniOTP Cloud - Master Application Controller
 * Powers all 11 tabs, metrics dashboard, API key management, template engine,
 * OTP lifecycle, bulk SMS broadcast, live API playground, SDK hub, and phone visualizer.
 */

class OmniOTPApp {
  constructor() {
    this.currentTab = 'overview';
    this.countdownInterval = null;
    this.resendInterval = null;
    this.bulkState = {
      isRunning: false,
      isPaused: false,
      numbers: [],
      message: '',
      delay: 1000,
      currentIndex: 0,
      sentCount: 0,
      failedCount: 0
    };
    this.init();
  }

  init() {
    this.setupTabs();
    this.setupMockupToggle();
    this.setupOverviewMetrics();
    this.setupApiKeysTab();
    this.setupTemplatesTab();
    this.setupSendOTP();
    this.setupVerifyOTP();
    this.setupQuickSMS();
    this.setupBulkSMS();
    this.setupPlayground();
    this.setupIntegrationHub();
    this.setupLogs();
    this.setupSettings();
    this.setupPhoneMockupIntegration();

    // Check if there is an existing pending session to resume
    this.resumeActiveSession();
  }

  /* -------------------------------------------------------------
   * NAVIGATION & TABS
   * ----------------------------------------------------------- */
  setupTabs() {
    const tabButtons = document.querySelectorAll('.nav-tab-btn');
    tabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const targetTab = btn.getAttribute('data-tab');
        this.switchTab(targetTab);
      });
    });

    document.querySelectorAll('[data-action="switch-tab"]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        const tab = el.getAttribute('data-target-tab');
        if (tab) this.switchTab(tab);
      });
    });
  }

  switchTab(tabId) {
    this.currentTab = tabId;

    document.querySelectorAll('.nav-tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
    });

    document.querySelectorAll('.tab-panel').forEach(panel => {
      panel.classList.toggle('active', panel.id === `tab-${tabId}`);
    });

    // Refresh tab-specific data
    if (tabId === 'overview') this.updateOverviewMetrics();
    if (tabId === 'api-keys') this.renderApiKeysTable();
    if (tabId === 'templates') this.renderTemplatesGrid();
    if (tabId === 'logs') this.renderLogs();
    if (tabId === 'api-playground') this.refreshPlaygroundKeys();
    if (tabId === 'integration') this.updateIntegrationSnippets();
  }

  setupMockupToggle() {
    const toggleBtn = document.getElementById('toggle-mockup-btn');
    const sidebar = document.getElementById('mockup-sidebar');
    if (toggleBtn && sidebar) {
      toggleBtn.addEventListener('click', () => {
        const isVisible = sidebar.style.display !== 'none';
        sidebar.style.display = isVisible ? 'none' : 'block';
      });
    }
    this.setupThemeToggle();
    this.setupDynamicHost();
  }

  setupThemeToggle() {
    const themeBtn = document.getElementById('theme-toggle-btn');
    const savedTheme = localStorage.getItem('omni_theme') || 'light';
    
    if (savedTheme === 'dark') {
      document.body.classList.add('dark-theme');
    } else {
      document.body.classList.remove('dark-theme');
    }

    if (themeBtn) {
      themeBtn.addEventListener('click', () => {
        const isDark = document.body.classList.toggle('dark-theme');
        localStorage.setItem('omni_theme', isDark ? 'dark' : 'light');
        this.showToast(isDark ? 'Dark Mode Activated' : 'Clean Light Mode Activated', 'info');
      });
    }
  }

  setupDynamicHost() {
    // If running from web server (Render, Railway, VPS, Localhost), auto-detect API origin
    if (window.location.protocol.startsWith('http') && window.location.origin && window.location.origin !== 'null') {
      const detected = window.location.origin;
      if (window.httpSMSClient) {
        window.httpSMSClient.config.serverUrl = detected;
      }
      const srvInput = document.getElementById('settings-server-url');
      if (srvInput && (!srvInput.value || srvInput.value.includes('localhost:5000'))) {
        srvInput.value = detected;
      }
    }
  }

  /* -------------------------------------------------------------
   * DASHBOARD OVERVIEW & METRICS
   * ----------------------------------------------------------- */
  setupOverviewMetrics() {
    this.updateOverviewMetrics();

    const copyQuickBtn = document.getElementById('btn-copy-quick-curl');
    if (copyQuickBtn) {
      copyQuickBtn.addEventListener('click', () => {
        const code = document.getElementById('quick-curl-code')?.textContent || '';
        this.copyToClipboard(code, 'cURL command copied!');
      });
    }
  }

  updateOverviewMetrics() {
    const stats = window.otpManager?.getStats() || {
      totalDispatched: 0,
      totalVerified: 0,
      successRate: 100
    };

    const keysCount = window.httpSMSClient?.apiKeys?.filter(k => k.status === 'ACTIVE').length || 3;
    const tplsCount = window.httpSMSClient?.templates?.length || 5;

    const elSent = document.getElementById('stat-total-dispatched');
    const elVer = document.getElementById('stat-total-verified');
    const elRate = document.getElementById('stat-success-rate');
    const elKeys = document.getElementById('stat-api-keys');
    const elTpls = document.getElementById('stat-templates-count');

    if (elSent) elSent.textContent = stats.totalDispatched;
    if (elVer) elVer.textContent = stats.totalVerified;
    if (elRate) elRate.textContent = `${stats.successRate}%`;
    if (elKeys) elKeys.textContent = `${keysCount} Active`;
    if (elTpls) elTpls.textContent = `${tplsCount} Saved`;
  }

  /* -------------------------------------------------------------
   * TAB 2: API KEYS HUB
   * ----------------------------------------------------------- */
  setupApiKeysTab() {
    const btnOpenCreate = document.getElementById('btn-open-create-key');
    const panelCreate = document.getElementById('create-key-container');
    const btnConfirm = document.getElementById('btn-confirm-create-key');
    const btnCancel = document.getElementById('btn-cancel-create-key');
    const inputName = document.getElementById('new-key-name-input');

    if (btnOpenCreate && panelCreate) {
      btnOpenCreate.addEventListener('click', () => {
        panelCreate.classList.toggle('hidden');
        if (!panelCreate.classList.contains('hidden')) {
          inputName?.focus();
        }
      });
    }

    if (btnCancel && panelCreate) {
      btnCancel.addEventListener('click', () => {
        panelCreate.classList.add('hidden');
      });
    }

    if (btnConfirm && inputName) {
      btnConfirm.addEventListener('click', () => {
        const name = inputName.value.trim() || 'Mobile App Client';
        const newKey = window.httpSMSClient.generateApiKey(name);
        inputName.value = '';
        panelCreate?.classList.add('hidden');
        this.renderApiKeysTable();
        this.updateOverviewMetrics();
        this.showToast(`New API Key generated for "${name}"!`, 'success');
      });
    }

    this.renderApiKeysTable();
  }

  renderApiKeysTable() {
    const tbody = document.getElementById('api-keys-table-body');
    if (!tbody) return;

    const keys = window.httpSMSClient?.apiKeys || [];
    tbody.innerHTML = '';

    if (!keys.length) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 2rem;">No API Keys generated yet.</td></tr>`;
      return;
    }

    keys.forEach(k => {
      const tr = document.createElement('tr');
      const isActive = k.status === 'ACTIVE';
      const maskedKey = k.key.substring(0, 12) + '••••••••••••' + k.key.substring(k.key.length - 4);

      tr.innerHTML = `
        <td><strong>${this.escapeHtml(k.name)}</strong></td>
        <td>
          <code style="color: var(--brand-cyan); font-family: var(--font-mono); font-size: 0.775rem;">${maskedKey}</code>
          <button type="button" class="btn-table-action btn-copy-key" data-key="${k.key}" style="margin-left: 6px;">Copy</button>
        </td>
        <td><span class="${isActive ? 'badge-active' : 'badge-revoked'}">${k.status}</span></td>
        <td>${new Date(k.created_at).toLocaleDateString()}</td>
        <td>${k.requests_count || 0}</td>
        <td>
          <button type="button" class="btn-table-action btn-toggle-key" data-id="${k.id}">
            ${isActive ? 'Revoke' : 'Activate'}
          </button>
          <button type="button" class="btn-table-action btn-delete-key" data-id="${k.id}" style="color: var(--brand-rose); margin-left: 4px;">
            Delete
          </button>
        </td>
      `;

      // Copy Button
      tr.querySelector('.btn-copy-key')?.addEventListener('click', () => {
        this.copyToClipboard(k.key, 'API Key copied to clipboard!');
      });

      // Toggle Active / Revoked
      tr.querySelector('.btn-toggle-key')?.addEventListener('click', () => {
        window.httpSMSClient.revokeApiKey(k.id);
        this.renderApiKeysTable();
        this.updateOverviewMetrics();
      });

      // Delete Key
      tr.querySelector('.btn-delete-key')?.addEventListener('click', () => {
        if (confirm(`Are you sure you want to delete "${k.name}"?`)) {
          window.httpSMSClient.deleteApiKey(k.id);
          this.renderApiKeysTable();
          this.updateOverviewMetrics();
          this.showToast('API Key removed', 'info');
        }
      });

      tbody.appendChild(tr);
    });
  }

  /* -------------------------------------------------------------
   * TAB 3: SMS TEMPLATES ENGINE
   * ----------------------------------------------------------- */
  setupTemplatesTab() {
    const btnOpenCreate = document.getElementById('btn-open-create-tpl');
    const panelEditor = document.getElementById('template-editor-panel');
    const btnSave = document.getElementById('btn-save-template');
    const btnCancel = document.getElementById('btn-cancel-template');
    const inputName = document.getElementById('tpl-name-input');
    const selectCat = document.getElementById('tpl-category-select');
    const inputText = document.getElementById('tpl-text-input');

    if (btnOpenCreate && panelEditor) {
      btnOpenCreate.addEventListener('click', () => {
        panelEditor.classList.toggle('hidden');
        if (!panelEditor.classList.contains('hidden')) {
          inputName?.focus();
        }
      });
    }

    if (btnCancel && panelEditor) {
      btnCancel.addEventListener('click', () => {
        panelEditor.classList.add('hidden');
      });
    }

    // Dynamic Tag insertion chips
    document.querySelectorAll('.var-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const tag = chip.getAttribute('data-var');
        if (!inputText || !tag) return;
        
        const start = inputText.selectionStart || inputText.value.length;
        const end = inputText.selectionEnd || inputText.value.length;
        inputText.value = inputText.value.substring(0, start) + tag + inputText.value.substring(end);
        inputText.focus();
        inputText.selectionStart = inputText.selectionEnd = start + tag.length;
        this.updateTemplateCounter();
      });
    });

    // Character counter
    if (inputText) {
      inputText.addEventListener('input', () => this.updateTemplateCounter());
    }

    if (btnSave && inputName && inputText) {
      btnSave.addEventListener('click', () => {
        const name = inputName.value.trim();
        const text = inputText.value.trim();
        const cat = selectCat?.value || 'CUSTOM';

        if (!name || !text) {
          this.showToast('Please provide both template title and content.', 'error');
          return;
        }

        window.httpSMSClient.addTemplate({ name, category: cat, text });
        inputName.value = '';
        inputText.value = '';
        panelEditor?.classList.add('hidden');
        this.renderTemplatesGrid();
        this.populateSendOtpTemplates();
        this.updateOverviewMetrics();
        this.showToast('SMS Template saved successfully!', 'success');
      });
    }

    this.renderTemplatesGrid();
    this.populateSendOtpTemplates();
  }

  updateTemplateCounter() {
    const text = document.getElementById('tpl-text-input')?.value || '';
    const charEl = document.getElementById('tpl-char-count');
    const partEl = document.getElementById('tpl-parts-count');
    const len = text.length;

    if (charEl) charEl.textContent = `${len} characters`;
    if (partEl) {
      const parts = Math.ceil(len / 160) || 1;
      partEl.textContent = `${parts} SMS part${parts > 1 ? 's' : ''} (GSM 7-bit)`;
    }
  }

  renderTemplatesGrid() {
    const grid = document.getElementById('templates-cards-grid');
    if (!grid) return;

    const templates = window.httpSMSClient?.templates || [];
    grid.innerHTML = '';

    templates.forEach(t => {
      const card = document.createElement('div');
      card.className = 'template-card';
      const highlighted = this.escapeHtml(t.text)
        .replace(/{{otp}}/g, '<code style="color:var(--brand-cyan)">{{otp}}</code>')
        .replace(/{{expiry}}/g, '<code style="color:var(--brand-cyan)">{{expiry}}</code>')
        .replace(/{{app_name}}/g, '<code style="color:var(--brand-cyan)">{{app_name}}</code>')
        .replace(/{{name}}/g, '<code style="color:var(--brand-cyan)">{{name}}</code>')
        .replace(/{{phone}}/g, '<code style="color:var(--brand-cyan)">{{phone}}</code>');

      card.innerHTML = `
        <div>
          <div class="tpl-card-top">
            <strong>${this.escapeHtml(t.name)}</strong>
            <span class="tpl-category-tag ${t.category}">${t.category}</span>
          </div>
          <p class="tpl-card-text">${highlighted}</p>
        </div>
        <div class="tpl-card-actions">
          <button type="button" class="btn-table-action btn-use-tpl" data-id="${t.id}">Use in Send OTP</button>
          <button type="button" class="btn-table-action btn-copy-tpl" data-text="${this.escapeHtml(t.text)}">Copy</button>
          <button type="button" class="btn-table-action btn-delete-tpl" data-id="${t.id}" style="color:var(--brand-rose); margin-left:auto;">Delete</button>
        </div>
      `;

      card.querySelector('.btn-use-tpl')?.addEventListener('click', () => {
        const otpTplInput = document.getElementById('otp-template-input');
        if (otpTplInput) {
          otpTplInput.value = t.text;
          this.updateTemplatePreview();
        }
        this.switchTab('send-otp');
        this.showToast(`Selected "${t.name}" template!`, 'info');
      });

      card.querySelector('.btn-copy-tpl')?.addEventListener('click', () => {
        this.copyToClipboard(t.text, 'Template text copied!');
      });

      card.querySelector('.btn-delete-tpl')?.addEventListener('click', () => {
        if (confirm(`Delete template "${t.name}"?`)) {
          window.httpSMSClient.deleteTemplate(t.id);
          this.renderTemplatesGrid();
          this.populateSendOtpTemplates();
          this.updateOverviewMetrics();
        }
      });

      grid.appendChild(card);
    });
  }

  populateSendOtpTemplates() {
    const selector = document.getElementById('otp-template-selector');
    if (!selector) return;

    const templates = window.httpSMSClient?.templates || [];
    selector.innerHTML = '';

    templates.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.id;
      opt.textContent = `${t.name} (${t.category})`;
      if (t.isDefault) opt.selected = true;
      selector.appendChild(opt);
    });

    selector.addEventListener('change', () => {
      const selectedId = selector.value;
      const t = templates.find(x => x.id === selectedId);
      if (t) {
        const tplInput = document.getElementById('otp-template-input');
        if (tplInput) {
          tplInput.value = t.text;
          this.updateTemplatePreview();
        }
      }
    });
  }

  /* -------------------------------------------------------------
   * TAB 4: SEND VERIFICATION OTP
   * ----------------------------------------------------------- */
  setupSendOTP() {
    const form = document.getElementById('send-otp-form');
    const phoneInput = document.getElementById('otp-phone-input');
    const templateInput = document.getElementById('otp-template-input');
    const expirySelect = document.getElementById('otp-expiry-select');
    const lengthSelect = document.getElementById('otp-length-select');
    const typeSelect = document.getElementById('otp-type-select');

    if (phoneInput) {
      phoneInput.addEventListener('input', () => this.updatePhoneIndicator());
    }

    if (templateInput) {
      templateInput.addEventListener('input', () => this.updateTemplatePreview());
    }

    if (expirySelect) {
      expirySelect.addEventListener('change', () => this.updateTemplatePreview());
    }

    // Quick test preset buttons
    document.querySelectorAll('.quick-num-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const phone = btn.getAttribute('data-phone');
        if (phoneInput && phone) {
          phoneInput.value = phone;
          this.updatePhoneIndicator();
          phoneInput.focus();
        }
      });
    });

    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        await this.handleSendOTP();
      });
    }

    this.updateTemplatePreview();
  }

  updatePhoneIndicator() {
    const phoneInput = document.getElementById('otp-phone-input');
    const ind = document.getElementById('phone-normalized-indicator');
    if (!phoneInput || !ind) return;

    const val = phoneInput.value.trim();
    if (!val) {
      ind.textContent = '';
      return;
    }

    const valid = window.httpSMSClient.validatePhoneNumber(val);
    if (valid.valid) {
      ind.innerHTML = `<span style="color: var(--color-success)">✓ Formatted to E.164: <strong>${valid.formatted}</strong></span>`;
    } else {
      ind.innerHTML = `<span style="color: var(--color-warning)">⚠ ${valid.error}</span>`;
    }
  }

  updateTemplatePreview() {
    const previewEl = document.getElementById('template-live-preview');
    const templateInput = document.getElementById('otp-template-input');
    const expirySelect = document.getElementById('otp-expiry-select');
    const lengthSelect = document.getElementById('otp-length-select');

    if (!previewEl || !templateInput) return;

    const len = lengthSelect ? parseInt(lengthSelect.value) : 6;
    const sampleOtp = '12345678'.substring(0, len);
    const expiry = expirySelect ? expirySelect.value : '5';

    const rendered = window.httpSMSClient.compileTemplate(templateInput.value, {
      otp: sampleOtp,
      expiry: expiry,
      appName: 'OmniOTP',
      phone: '+919876543210'
    });

    previewEl.textContent = rendered;
  }

  async handleSendOTP() {
    const btn = document.getElementById('btn-send-otp');
    const phoneInput = document.getElementById('otp-phone-input');
    const lengthSelect = document.getElementById('otp-length-select');
    const typeSelect = document.getElementById('otp-type-select');
    const expirySelect = document.getElementById('otp-expiry-select');
    const templateInput = document.getElementById('otp-template-input');

    const phone = phoneInput?.value.trim();
    const length = parseInt(lengthSelect?.value || '6');
    const type = typeSelect?.value || 'numeric';
    const expiry = parseInt(expirySelect?.value || '5');
    const template = templateInput?.value || null;

    if (!phone) {
      this.showToast('Please enter recipient mobile number', 'error');
      phoneInput?.focus();
      return;
    }

    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner-sm"></span> Dispatching SMS via httpSMS...`;
    }

    try {
      const session = await window.otpManager.sendOTP({
        phone,
        length,
        type,
        expiryMinutes: expiry,
        template
      });

      // Notify Smartphone Mockup visualizer with incoming SMS
      const generatedCode = window.otpManager.sessions[session.sessionId]?.code;
      const fullMessage = window.otpManager.sessions[session.sessionId]?.messageContent;
      
      window.phoneMockup.receiveSMS({
        from: window.httpSMSClient.config.fromNumber || '+918290866520',
        to: session.phone,
        content: fullMessage,
        code: generatedCode
      });

      this.showToast(`Passcode sent successfully to ${session.maskedPhone}!`, 'success');

      // Update and switch to verify tab
      this.setupActiveVerifySession(session.sessionId);
      this.switchTab('verify-otp');
      this.updateOverviewMetrics();
    } catch (err) {
      this.showToast(`Dispatch failed: ${err.message}`, 'error');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
          Send Verification OTP
        `;
      }
    }
  }

  /* -------------------------------------------------------------
   * TAB 5: VERIFY PASSCODE
   * ----------------------------------------------------------- */
  setupVerifyOTP() {
    const btnVerify = document.getElementById('btn-verify-otp');
    const btnResend = document.getElementById('btn-resend-otp');

    if (btnVerify) {
      btnVerify.addEventListener('click', () => this.handleVerifyOTP());
    }

    if (btnResend) {
      btnResend.addEventListener('click', () => this.handleResendOTP());
    }
  }

  setupActiveVerifySession(sessionId) {
    const session = window.otpManager.getSession(sessionId);
    if (!session) return;

    // Set Target Phone Number display
    const phoneDisplay = document.getElementById('verify-target-phone');
    if (phoneDisplay) {
      phoneDisplay.textContent = session.maskedPhone || session.phone;
    }

    // Build OTP digit boxes
    this.renderDigitBoxes(session.length || 6, session.type);

    // Start Expiry Timer
    this.startCountdownTimer(session.expiresAt);

    // Reset status banner
    const banner = document.getElementById('verify-result-banner');
    if (banner) {
      banner.className = 'verify-status-banner hidden';
      banner.innerHTML = '';
    }
  }

  renderDigitBoxes(length = 6, type = 'numeric') {
    const container = document.getElementById('otp-digits-container');
    if (!container) return;

    container.innerHTML = '';

    for (let i = 0; i < length; i++) {
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'otp-digit-box';
      input.maxLength = 1;
      input.dataset.index = i;
      input.autocomplete = 'off';

      if (type === 'numeric') {
        input.inputMode = 'numeric';
      }

      input.addEventListener('input', (e) => this.handleDigitInput(e, i, length));
      input.addEventListener('keydown', (e) => this.handleDigitKeydown(e, i));
      input.addEventListener('paste', (e) => this.handleDigitPaste(e, length));

      container.appendChild(input);
    }

    setTimeout(() => {
      const firstInput = container.querySelector('.otp-digit-box');
      if (firstInput) firstInput.focus();
    }, 150);
  }

  handleDigitInput(e, index, totalLength) {
    const input = e.target;
    let val = input.value;

    if (val.length > 1) {
      val = val.substring(val.length - 1);
      input.value = val;
    }

    if (val) {
      if (index < totalLength - 1) {
        const next = document.querySelector(`.otp-digit-box[data-index="${index + 1}"]`);
        if (next) next.focus();
      } else {
        // Auto-verify if all filled
        setTimeout(() => this.handleVerifyOTP(), 100);
      }
    }
  }

  handleDigitKeydown(e, index) {
    const input = e.target;
    if (e.key === 'Backspace' && !input.value && index > 0) {
      const prev = document.querySelector(`.otp-digit-box[data-index="${index - 1}"]`);
      if (prev) {
        prev.focus();
        prev.value = '';
      }
    }
  }

  handleDigitPaste(e, totalLength) {
    e.preventDefault();
    const pasteData = (e.clipboardData || window.clipboardData).getData('text').trim();
    if (!pasteData) return;

    this.autoFillOTP(pasteData);
  }

  autoFillOTP(code) {
    if (!code) return;
    this.switchTab('verify-otp');

    const cleanCode = code.toString().trim();
    const boxes = document.querySelectorAll('.otp-digit-box');
    boxes.forEach((box, i) => {
      if (i < cleanCode.length) {
        box.value = cleanCode[i];
      }
    });

    if (cleanCode.length >= boxes.length) {
      const last = boxes[boxes.length - 1];
      if (last) last.focus();
      setTimeout(() => this.handleVerifyOTP(), 200);
    }
  }

  startCountdownTimer(expiresAt) {
    clearInterval(this.countdownInterval);

    const textEl = document.getElementById('verify-countdown-text');
    const circleEl = document.getElementById('countdown-svg-circle');
    const totalCircumference = 251.2;

    const session = window.otpManager.getSession(window.otpManager.activeSessionId);
    const totalDuration = session ? (session.expiresAt - session.createdAt) : 300000;

    const tick = () => {
      const now = Date.now();
      const remain = Math.max(0, expiresAt - now);

      const mins = Math.floor(remain / 60000);
      const secs = Math.floor((remain % 60000) / 1000);
      if (textEl) {
        textEl.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
      }

      if (circleEl) {
        const fraction = remain / totalDuration;
        const offset = totalCircumference * (1 - fraction);
        circleEl.style.strokeDashoffset = offset;
      }

      if (remain <= 0) {
        clearInterval(this.countdownInterval);
        if (textEl) textEl.textContent = 'Expired';
        this.showToast('OTP code has expired. Please resend code.', 'warning');
      }
    };

    tick();
    this.countdownInterval = setInterval(tick, 1000);
  }

  async handleVerifyOTP() {
    const sessionId = window.otpManager.activeSessionId;
    if (!sessionId) {
      this.showToast('No active OTP session. Please request a new code.', 'error');
      return;
    }

    const boxes = document.querySelectorAll('.otp-digit-box');
    let enteredCode = '';
    boxes.forEach(b => enteredCode += b.value);

    if (!enteredCode) {
      this.showToast('Please enter the verification passcode', 'error');
      return;
    }

    const result = window.otpManager.verifyOTP(sessionId, enteredCode);
    const banner = document.getElementById('verify-result-banner');

    if (result.success) {
      clearInterval(this.countdownInterval);
      this.triggerConfetti();

      if (banner) {
        banner.className = 'verify-status-banner success';
        banner.innerHTML = `
          <strong>✓ Mobile Number Verified!</strong><br>
          ${result.message}
        `;
      }
      this.showToast('🎉 Mobile OTP verified successfully!', 'success');
      this.updateOverviewMetrics();
    } else {
      if (banner) {
        banner.className = 'verify-status-banner error';
        banner.innerHTML = `
          <strong>⚠ Verification Failed</strong><br>
          ${result.message}
        `;
      }
      this.showToast(result.message, 'error');
    }
  }

  async handleResendOTP() {
    const sessionId = window.otpManager.activeSessionId;
    if (!sessionId) {
      this.showToast('Session expired. Please send a new OTP.', 'error');
      return;
    }

    const btn = document.getElementById('btn-resend-otp');
    if (btn) btn.disabled = true;

    try {
      const newSession = await window.otpManager.resendOTP(sessionId);
      
      const generatedCode = window.otpManager.sessions[newSession.sessionId]?.code;
      const fullMessage = window.otpManager.sessions[newSession.sessionId]?.messageContent;
      
      window.phoneMockup.receiveSMS({
        from: window.httpSMSClient.config.fromNumber,
        to: newSession.phone,
        content: fullMessage,
        code: generatedCode
      });

      this.setupActiveVerifySession(newSession.sessionId);
      this.showToast('New verification code sent via SMS!', 'success');
    } catch (e) {
      this.showToast(e.message, 'error');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  resumeActiveSession() {
    if (window.otpManager.activeSessionId) {
      const s = window.otpManager.getSession(window.otpManager.activeSessionId);
      if (s && s.status === 'pending' && Date.now() < s.expiresAt) {
        this.setupActiveVerifySession(s.id);
      }
    }
  }

  /* -------------------------------------------------------------
   * TAB 6: QUICK DIRECT SMS
   * ----------------------------------------------------------- */
  setupQuickSMS() {
    const form = document.getElementById('direct-sms-form');
    const msgInput = document.getElementById('direct-sms-content');
    const toInput = document.getElementById('direct-sms-to');

    if (msgInput) {
      msgInput.addEventListener('input', () => {
        const len = msgInput.value.length;
        const charEl = document.getElementById('direct-char-count');
        const partEl = document.getElementById('direct-parts-count');
        if (charEl) charEl.textContent = `${len} characters`;
        if (partEl) {
          const parts = Math.ceil(len / 160) || 1;
          partEl.textContent = `${parts} SMS`;
        }
      });
    }

    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const to = toInput?.value.trim();
        const content = msgInput?.value.trim();

        if (!to || !content) {
          this.showToast('Please provide both recipient and message text.', 'error');
          return;
        }

        const btn = document.getElementById('btn-send-direct-sms');
        if (btn) {
          btn.disabled = true;
          btn.innerHTML = `<span class="spinner-sm"></span> Dispatching...`;
        }

        try {
          const res = await window.otpManager.sendCustomSMS({ phone: to, content });
          
          window.phoneMockup.receiveSMS({
            from: window.httpSMSClient.config.fromNumber,
            to: to,
            content: content
          });

          this.showToast('Custom SMS dispatched successfully!', 'success');
          this.updateOverviewMetrics();
        } catch (err) {
          this.showToast(`Failed to send SMS: ${err.message}`, 'error');
        } finally {
          if (btn) {
            btn.disabled = false;
            btn.innerHTML = `
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
              Dispatch Custom SMS
            `;
          }
        }
      });
    }
  }

  /* -------------------------------------------------------------
   * TAB 7: BULK SMS BROADCAST ENGINE
   * ----------------------------------------------------------- */
  setupBulkSMS() {
    const inputRecipients = document.getElementById('bulk-recipients-input');
    const fileInput = document.getElementById('bulk-file-input');
    const form = document.getElementById('bulk-sms-form');
    const btnPause = document.getElementById('btn-pause-bulk');
    const btnCancel = document.getElementById('btn-cancel-bulk');

    if (inputRecipients) {
      inputRecipients.addEventListener('input', () => this.validateBulkNumbers());
    }

    if (fileInput) {
      fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
          const text = event.target.result;
          if (inputRecipients) {
            inputRecipients.value = text;
            this.validateBulkNumbers();
            this.showToast(`Loaded ${file.name}!`, 'info');
          }
        };
        reader.readAsText(file);
      });
    }

    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        await this.startBulkDispatch();
      });
    }

    if (btnPause) {
      btnPause.addEventListener('click', () => {
        this.bulkState.isPaused = !this.bulkState.isPaused;
        btnPause.textContent = this.bulkState.isPaused ? 'Resume' : 'Pause';
        this.showToast(this.bulkState.isPaused ? 'Bulk broadcast paused' : 'Bulk broadcast resumed', 'info');
      });
    }

    if (btnCancel) {
      btnCancel.addEventListener('click', () => {
        this.bulkState.isRunning = false;
        this.showToast('Bulk broadcast cancelled', 'warning');
      });
    }

    this.validateBulkNumbers();
  }

  validateBulkNumbers() {
    const raw = document.getElementById('bulk-recipients-input')?.value || '';
    const validPill = document.getElementById('bulk-valid-count');
    const dupesPill = document.getElementById('bulk-dupes-count');

    // Split by commas, newlines, semicolons, whitespace
    const tokens = raw.split(/[\s,;\n\r]+/).filter(Boolean);
    const valid = [];
    const seen = new Set();
    let dupes = 0;

    tokens.forEach(tok => {
      const res = window.httpSMSClient.validatePhoneNumber(tok);
      if (res.valid) {
        if (seen.has(res.formatted)) {
          dupes++;
        } else {
          seen.add(res.formatted);
          valid.push(res.formatted);
        }
      }
    });

    if (validPill) validPill.textContent = `${valid.length} valid recipient${valid.length !== 1 ? 's' : ''} detected`;
    if (dupesPill) dupesPill.textContent = `${dupes} duplicate${dupes !== 1 ? 's' : ''}`;

    return valid;
  }

  async startBulkDispatch() {
    const numbers = this.validateBulkNumbers();
    const msg = document.getElementById('bulk-message-content')?.value.trim();
    const delay = parseInt(document.getElementById('bulk-delay-select')?.value || '1000');
    const progressPanel = document.getElementById('bulk-progress-card');
    const barFill = document.getElementById('bulk-progress-bar-fill');
    const currentEl = document.getElementById('bulk-progress-current');
    const totalEl = document.getElementById('bulk-progress-total');
    const stream = document.getElementById('bulk-results-log');

    if (!numbers.length) {
      this.showToast('Please enter at least one valid recipient phone number.', 'error');
      return;
    }

    if (!msg) {
      this.showToast('Please enter broadcast message text.', 'error');
      return;
    }

    this.bulkState = {
      isRunning: true,
      isPaused: false,
      numbers,
      message: msg,
      delay,
      currentIndex: 0,
      sentCount: 0,
      failedCount: 0
    };

    if (progressPanel) progressPanel.classList.remove('hidden');
    if (stream) stream.innerHTML = '';
    if (totalEl) totalEl.textContent = numbers.length;

    for (let i = 0; i < numbers.length; i++) {
      if (!this.bulkState.isRunning) break;

      while (this.bulkState.isPaused) {
        await new Promise(r => setTimeout(r, 400));
      }

      const phone = numbers[i];
      const pct = Math.round(((i + 1) / numbers.length) * 100);
      if (barFill) barFill.style.width = `${pct}%`;
      if (currentEl) currentEl.textContent = i + 1;

      try {
        await window.otpManager.sendCustomSMS({ phone, content: msg });
        this.bulkState.sentCount++;
        
        if (stream) {
          const row = document.createElement('div');
          row.style.color = '#34d399';
          row.textContent = `[${new Date().toLocaleTimeString()}] ✓ Dispatched to ${phone}`;
          stream.appendChild(row);
          stream.scrollTop = stream.scrollHeight;
        }
      } catch (err) {
        this.bulkState.failedCount++;
        if (stream) {
          const row = document.createElement('div');
          row.style.color = '#f87171';
          row.textContent = `[${new Date().toLocaleTimeString()}] ✕ Failed ${phone}: ${err.message}`;
          stream.appendChild(row);
          stream.scrollTop = stream.scrollHeight;
        }
      }

      if (delay > 0 && i < numbers.length - 1) {
        await new Promise(r => setTimeout(r, delay));
      }
    }

    this.bulkState.isRunning = false;
    this.showToast(`Bulk broadcast completed! Sent: ${this.bulkState.sentCount}, Failed: ${this.bulkState.failedCount}`, 'success');
    this.updateOverviewMetrics();
  }

  /* -------------------------------------------------------------
   * TAB 8: LIVE API PLAYGROUND
   * ----------------------------------------------------------- */
  setupPlayground() {
    const endpointSelect = document.getElementById('playground-endpoint-select');
    const jsonInput = document.getElementById('playground-json-input');
    const btnExecute = document.getElementById('btn-execute-api-playground');
    const btnCopyRes = document.getElementById('btn-copy-playground-res');

    if (endpointSelect && jsonInput) {
      endpointSelect.addEventListener('change', () => {
        const ep = endpointSelect.value;
        switch (ep) {
          case 'SEND_OTP':
            jsonInput.value = JSON.stringify({
              phone: '+918290866520',
              app_name: 'OmniOTP Demo',
              length: 6,
              expiry_minutes: 5
            }, null, 2);
            break;
          case 'VERIFY_OTP':
            jsonInput.value = JSON.stringify({
              phone: '+918290866520',
              otp: '123456'
            }, null, 2);
            break;
          case 'SEND_SMS':
            jsonInput.value = JSON.stringify({
              phone: '+918290866520',
              message: 'Hello from OmniOTP REST API Playground!'
            }, null, 2);
            break;
          case 'BULK_SMS':
            jsonInput.value = JSON.stringify({
              phones: ['+918290866520', '+919876543210'],
              message: 'Important broadcast message from OmniOTP!',
              delay_ms: 1000
            }, null, 2);
            break;
          case 'HEALTH':
            jsonInput.value = '{}';
            break;
        }
      });
    }

    if (btnExecute) {
      btnExecute.addEventListener('click', async () => {
        await this.executePlaygroundRequest();
      });
    }

    if (btnCopyRes) {
      btnCopyRes.addEventListener('click', () => {
        const resText = document.getElementById('playground-response-code')?.textContent || '';
        this.copyToClipboard(resText, 'API response copied!');
      });
    }

    this.refreshPlaygroundKeys();
  }

  refreshPlaygroundKeys() {
    const select = document.getElementById('playground-key-select');
    if (!select) return;

    const keys = window.httpSMSClient?.apiKeys || [];
    select.innerHTML = '';

    keys.forEach(k => {
      const opt = document.createElement('option');
      opt.value = k.key;
      opt.textContent = `${k.name} (${k.key.substring(0, 16)}...)`;
      if (k.status !== 'ACTIVE') opt.disabled = true;
      select.appendChild(opt);
    });
  }

  async executePlaygroundRequest() {
    const endpoint = document.getElementById('playground-endpoint-select')?.value;
    const apiKey = document.getElementById('playground-key-select')?.value;
    const bodyText = document.getElementById('playground-json-input')?.value;
    const statusBadge = document.getElementById('playground-status-badge');
    const latencyBadge = document.getElementById('playground-latency-badge');
    const codeBlock = document.getElementById('playground-response-code');
    const btnExecute = document.getElementById('btn-execute-api-playground');

    let bodyObj = {};
    try {
      bodyObj = JSON.parse(bodyText || '{}');
    } catch (e) {
      this.showToast('Invalid JSON in request payload', 'error');
      return;
    }

    if (btnExecute) {
      btnExecute.disabled = true;
      btnExecute.textContent = 'Executing...';
    }

    const startTime = performance.now();
    const serverBase = window.httpSMSClient.config.serverUrl || 'http://localhost:5000';

    try {
      let endpointPath = '';
      let method = 'POST';

      switch (endpoint) {
        case 'SEND_OTP': endpointPath = '/api/v1/otp/send'; break;
        case 'VERIFY_OTP': endpointPath = '/api/v1/otp/verify'; break;
        case 'SEND_SMS': endpointPath = '/api/v1/sms/send'; break;
        case 'BULK_SMS': endpointPath = '/api/v1/sms/bulk'; break;
        case 'HEALTH': endpointPath = '/api/v1/health'; method = 'GET'; break;
      }

      let responseData = null;
      let statusCode = 200;

      // Try calling live backend server if reachable, otherwise run client simulation
      try {
        const fetchOpts = {
          method,
          headers: {
            'x-api-key': apiKey,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          }
        };
        if (method !== 'GET') fetchOpts.body = JSON.stringify(bodyObj);

        const res = await fetch(`${serverBase}${endpointPath}`, fetchOpts);
        statusCode = res.status;
        responseData = await res.json().catch(() => ({}));
      } catch (networkErr) {
        // Fallback: Execute directly in-browser using client engine
        if (endpoint === 'SEND_OTP') {
          const sess = await window.otpManager.sendOTP({
            phone: bodyObj.phone,
            length: bodyObj.length || 6,
            expiryMinutes: bodyObj.expiry_minutes || 5,
            template: bodyObj.template
          });
          const code = window.otpManager.sessions[sess.sessionId]?.code;
          window.phoneMockup.receiveSMS({
            from: window.httpSMSClient.config.fromNumber,
            to: sess.phone,
            content: `Your OTP is ${code}. Valid for 5 mins.`,
            code: code
          });
          responseData = {
            success: true,
            session_id: sess.sessionId,
            phone: sess.phone,
            expires_in_seconds: 300,
            message: 'OTP dispatched successfully (Client Engine)'
          };
        } else if (endpoint === 'VERIFY_OTP') {
          const v = window.otpManager.verifyOTP(window.otpManager.activeSessionId, bodyObj.otp);
          responseData = v;
          statusCode = v.success ? 200 : 400;
        } else if (endpoint === 'SEND_SMS') {
          const s = await window.otpManager.sendCustomSMS({ phone: bodyObj.phone, content: bodyObj.message });
          responseData = { success: true, phone: bodyObj.phone, message: 'SMS dispatched' };
        } else {
          responseData = {
            status: 'healthy',
            platform: 'OmniOTP Cloud In-Browser Gateway',
            note: 'Local server not running. Dispatched in client direct mode.'
          };
        }
      }

      const latency = Math.round(performance.now() - startTime);

      if (statusBadge) {
        statusBadge.textContent = `${statusCode} ${statusCode === 200 ? 'OK' : 'Response'}`;
        statusBadge.style.color = statusCode === 200 ? '#34d399' : '#f87171';
      }
      if (latencyBadge) latencyBadge.textContent = `${latency} ms`;
      if (codeBlock) {
        codeBlock.textContent = JSON.stringify(responseData, null, 2);
      }

      this.showToast('API call completed successfully!', 'info');
      this.updateOverviewMetrics();
    } catch (err) {
      if (codeBlock) {
        codeBlock.textContent = JSON.stringify({ error: err.message }, null, 2);
      }
      if (statusBadge) {
        statusBadge.textContent = '500 Error';
        statusBadge.style.color = '#f87171';
      }
    } finally {
      if (btnExecute) {
        btnExecute.disabled = false;
        btnExecute.innerHTML = `
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
          Send Live Request
        `;
      }
    }
  }

  /* -------------------------------------------------------------
   * TAB 9: DEVELOPER SDKS & DROP-IN TEMPLATES
   * ----------------------------------------------------------- */
  setupIntegrationHub() {
    // Subtabs switcher (Android, Web, Backend, Servers)
    document.querySelectorAll('.subtab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const sub = btn.getAttribute('data-subtab');
        document.querySelectorAll('.subtab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        document.querySelectorAll('.subtab-panel').forEach(p => p.classList.remove('active'));
        document.getElementById(`subtab-content-${sub}`)?.classList.add('active');
      });
    });

    // Backend language switcher
    document.querySelectorAll('.code-lang-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const lang = btn.getAttribute('data-lang');
        document.querySelectorAll('.code-lang-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.renderBackendCodeSnippet(lang);
      });
    });

    // Copy code buttons with data-copy-target
    document.querySelectorAll('.btn-copy-code').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetId = btn.getAttribute('data-copy-target') || 'backend-snippet-code';
        const code = document.getElementById(targetId)?.textContent || '';
        this.copyToClipboard(code, 'Code snippet copied to clipboard!');
      });
    });

    this.renderBackendCodeSnippet('curl');
  }

  updateIntegrationSnippets() {
    // Refreshes active API key inside snippets
    const activeKey = window.httpSMSClient.getActiveApiKey();
    // Update code blocks if needed
  }

  renderBackendCodeSnippet(lang) {
    const titleEl = document.getElementById('backend-snippet-title');
    const codeEl = document.getElementById('backend-snippet-code');
    const key = window.httpSMSClient.getActiveApiKey();
    const serverUrl = window.httpSMSClient.config.serverUrl || 'http://localhost:5000';

    if (!codeEl) return;

    switch (lang) {
      case 'curl':
        if (titleEl) titleEl.textContent = 'cURL Terminal Command';
        codeEl.textContent = `curl -X POST "${serverUrl}/api/v1/otp/send" \\
  -H "x-api-key: ${key}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "phone": "+918290866520",
    "app_name": "OmniOTP",
    "length": 6,
    "expiry_minutes": 5
  }'`;
        break;

      case 'node':
        if (titleEl) titleEl.textContent = 'Node.js / Express (Fetch)';
        codeEl.textContent = `// npm install node-fetch or native fetch in Node 18+
const res = await fetch('${serverUrl}/api/v1/otp/send', {
  method: 'POST',
  headers: {
    'x-api-key': '${key}',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    phone: '+918290866520',
    app_name: 'My Service',
    length: 6,
    expiry_minutes: 5
  })
});
const data = await res.json();
console.log('Session ID:', data.session_id);`;
        break;

      case 'python':
        if (titleEl) titleEl.textContent = 'Python (Requests / FastAPI)';
        codeEl.textContent = `import requests

url = "${serverUrl}/api/v1/otp/send"
headers = {
    "x-api-key": "${key}",
    "Content-Type": "application/json"
}
payload = {
    "phone": "+918290866520",
    "app_name": "My Python Backend",
    "length": 6,
    "expiry_minutes": 5
}

response = requests.post(url, json=payload, headers=headers)
print(response.json())`;
        break;

      case 'php':
        if (titleEl) titleEl.textContent = 'PHP (cURL / WordPress)';
        codeEl.textContent = `<?php
$ch = curl_init("${serverUrl}/api/v1/otp/send");
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST => true,
    CURLOPT_HTTPHEADER => [
        "x-api-key: ${key}",
        "Content-Type: application/json"
    ],
    CURLOPT_POSTFIELDS => json_encode([
        "phone" => "+918290866520",
        "app_name" => "My Website",
        "length" => 6
    ])
]);
$response = json_decode(curl_exec($ch), true);
curl_close($ch);
print_r($response);`;
        break;

      case 'flutter':
        if (titleEl) titleEl.textContent = 'Flutter / Dart (http package)';
        codeEl.textContent = `import 'dart:convert';
import 'package:http/http.dart' as http;

Future<void> sendOtp(String phone) async {
  final url = Uri.parse('${serverUrl}/api/v1/otp/send');
  final res = await http.post(
    url,
    headers: {
      'x-api-key': '${key}',
      'Content-Type': 'application/json',
    },
    body: jsonEncode({
      'phone': phone,
      'app_name': 'Flutter App',
      'length': 6,
    }),
  );
  final data = jsonDecode(res.body);
  print('OTP Dispatched: \${data["success"]}');
}`;
        break;
    }
  }

  /* -------------------------------------------------------------
   * TAB 10: AUDIT & DISPATCH LOGS
   * ----------------------------------------------------------- */
  setupLogs() {
    const filterSelect = document.getElementById('logs-filter-status');
    const btnExportJson = document.getElementById('btn-export-logs');
    const btnExportCsv = document.getElementById('btn-export-csv');
    const btnClear = document.getElementById('btn-clear-logs');

    if (filterSelect) {
      filterSelect.addEventListener('change', () => this.renderLogs());
    }

    if (btnExportJson) {
      btnExportJson.addEventListener('click', () => {
        const logs = window.otpManager.logs;
        const blob = new Blob([JSON.stringify(logs, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `omni_otp_logs_${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
        this.showToast('Exported logs to JSON file', 'info');
      });
    }

    if (btnExportCsv) {
      btnExportCsv.addEventListener('click', () => {
        const logs = window.otpManager.logs;
        let csv = 'Timestamp,Type,Phone,Status,Code,LatencyMs\n';
        logs.forEach(l => {
          csv += `"${l.timestamp}","${l.type}","${l.phone || ''}","${l.status}","${l.code || ''}","${l.durationMs || 0}"\n`;
        });
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `omni_otp_logs_${Date.now()}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        this.showToast('Exported logs to CSV file', 'info');
      });
    }

    if (btnClear) {
      btnClear.addEventListener('click', () => {
        if (confirm('Clear all audit and dispatch logs?')) {
          window.otpManager.clearLogs();
          this.renderLogs();
          this.updateOverviewMetrics();
          this.showToast('Audit logs cleared', 'info');
        }
      });
    }

    this.renderLogs();
  }

  renderLogs() {
    const tbody = document.getElementById('logs-table-body');
    const filter = document.getElementById('logs-filter-status')?.value || 'ALL';
    if (!tbody) return;

    tbody.innerHTML = '';
    const logs = window.otpManager.logs.filter(l => {
      if (filter === 'ALL') return true;
      return l.status === filter;
    });

    if (!logs.length) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 2rem;">No logs found matching filter criteria.</td></tr>`;
      return;
    }

    logs.forEach(l => {
      const tr = document.createElement('tr');
      const time = new Date(l.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      
      let badgeClass = 'badge-tag';
      if (l.status === 'SENT') badgeClass = 'badge-active';
      if (l.status === 'VERIFIED') badgeClass = 'badge-active';
      if (l.status === 'FAILED' || l.status === 'EXHAUSTED' || l.status === 'INCORRECT') badgeClass = 'badge-revoked';

      tr.innerHTML = `
        <td><span style="font-family: var(--font-mono); font-size: 0.75rem;">${time}</span></td>
        <td><strong>${l.type}</strong></td>
        <td><code>${l.phone || 'N/A'}</code></td>
        <td><span class="${badgeClass}">${l.status}</span></td>
        <td><code style="color:var(--brand-cyan)">${l.code || '—'}</code></td>
        <td>${l.durationMs ? `${l.durationMs}ms` : '—'}</td>
        <td style="font-size: 0.725rem; color: var(--text-secondary);">${this.escapeHtml(l.message || l.error || l.content || 'OK')}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  /* -------------------------------------------------------------
   * TAB 11: SETTINGS
   * ----------------------------------------------------------- */
  setupSettings() {
    const form = document.getElementById('settings-form');
    const simToggle = document.getElementById('settings-sim-toggle');
    const apiKeyInput = document.getElementById('settings-api-key');
    const fromInput = document.getElementById('settings-from-number');
    const serverUrlInput = document.getElementById('settings-server-url');
    const btnToggleVis = document.getElementById('toggle-key-visibility');
    const btnTest = document.getElementById('btn-test-connection');

    const config = window.httpSMSClient.getConfig();

    if (simToggle) simToggle.checked = config.isSimulated;
    if (apiKeyInput) apiKeyInput.value = config.apiKey;
    if (fromInput) fromInput.value = config.fromNumber;
    if (serverUrlInput) serverUrlInput.value = config.serverUrl || 'http://localhost:5000';

    this.updateGatewayModeHeader(config.isSimulated);

    // Simulator Toggle
    if (simToggle) {
      simToggle.addEventListener('change', () => {
        window.httpSMSClient.saveConfig({ isSimulated: simToggle.checked });
        this.updateGatewayModeHeader(simToggle.checked);
        this.showToast(simToggle.checked ? 'Simulator Mode Activated (No SMS credits consumed)' : 'Live Mode Activated (SMS sent via real SIM card)', 'info');
      });
    }

    // Header badge click toggle
    const headerBadge = document.getElementById('header-mode-badge');
    if (headerBadge) {
      headerBadge.addEventListener('click', () => {
        const next = !window.httpSMSClient.config.isSimulated;
        window.httpSMSClient.saveConfig({ isSimulated: next });
        if (simToggle) simToggle.checked = next;
        this.updateGatewayModeHeader(next);
        this.showToast(next ? 'Simulator Mode Activated' : 'Live Mode Activated', 'info');
      });
    }

    // Toggle API Key Visibility
    if (btnToggleVis && apiKeyInput) {
      btnToggleVis.addEventListener('click', () => {
        const isPass = apiKeyInput.type === 'password';
        apiKeyInput.type = isPass ? 'text' : 'password';
        btnToggleVis.textContent = isPass ? 'Hide' : 'Show';
      });
    }

    // Test Connection
    if (btnTest) {
      btnTest.addEventListener('click', async () => {
        btnTest.disabled = true;
        btnTest.innerHTML = `<span class="spinner-sm"></span> Testing...`;
        const res = await window.httpSMSClient.testConnection(apiKeyInput?.value);
        this.showToast(res.message, res.success ? 'success' : 'error');
        btnTest.disabled = false;
        btnTest.innerHTML = `
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
          Test httpSMS Connection
        `;
      });
    }

    // Save Settings
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const apiKey = apiKeyInput?.value.trim();
        const fromNumber = fromInput?.value.trim();
        const serverUrl = serverUrlInput?.value.trim();

        window.httpSMSClient.saveConfig({ apiKey, fromNumber, serverUrl });
        this.showToast('Gateway settings saved successfully!', 'success');
        this.updateGatewayModeHeader(window.httpSMSClient.config.isSimulated);
      });
    }
  }

  updateGatewayModeHeader(isSimulated) {
    const badge = document.getElementById('header-mode-badge');
    const text = document.getElementById('header-mode-text');
    const pill = document.getElementById('gateway-status-pill');
    const fromNum = window.httpSMSClient.config.fromNumber || '+918290866520';

    if (badge && text) {
      if (isSimulated) {
        badge.className = 'status-badge mode-simulator';
        text.textContent = 'SIMULATOR SANDBOX';
      } else {
        badge.className = 'status-badge mode-live';
        text.textContent = `LIVE HTTPSMS (${fromNum})`;
      }
    }

    if (pill) {
      pill.textContent = isSimulated ? 'Simulator Mode Active' : `Live Gateway: ${fromNum}`;
    }
  }

  /* -------------------------------------------------------------
   * SMARTPHONE MOCKUP CONTROLS
   * ----------------------------------------------------------- */
  setupPhoneMockupIntegration() {
    const btnSound = document.getElementById('btn-toggle-sound');
    const btnClear = document.getElementById('btn-clear-mockup');

    if (btnSound) {
      btnSound.addEventListener('click', () => {
        const soundOn = !btnSound.classList.contains('active');
        btnSound.classList.toggle('active', soundOn);
        window.httpSMSClient.saveConfig({ soundEffects: soundOn });
        this.showToast(soundOn ? 'SMS chime sound enabled' : 'SMS sound muted', 'info');
      });
    }

    if (btnClear) {
      btnClear.addEventListener('click', () => {
        window.phoneMockup.clearChat();
        this.showToast('Smartphone messages cleared', 'info');
      });
    }
  }

  /* -------------------------------------------------------------
   * UTILITIES: TOASTS, CLIPBOARD & CONFETTI
   * ----------------------------------------------------------- */
  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    let icon = 'ℹ️';
    if (type === 'success') icon = '✓';
    if (type === 'error') icon = '✕';
    if (type === 'warning') icon = '⚠';

    toast.innerHTML = `
      <span class="toast-icon">${icon}</span>
      <span class="toast-msg">${this.escapeHtml(message)}</span>
      <button class="toast-close-btn">&times;</button>
    `;

    toast.querySelector('.toast-close-btn')?.addEventListener('click', () => {
      toast.remove();
    });

    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 4500);
  }

  copyToClipboard(text, successMsg = 'Copied to clipboard!') {
    if (!text) return;
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(() => {
        this.showToast(successMsg, 'success');
      }).catch(() => {
        this.fallbackCopy(text, successMsg);
      });
    } else {
      this.fallbackCopy(text, successMsg);
    }
  }

  fallbackCopy(text, successMsg) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      this.showToast(successMsg, 'success');
    } catch (e) {
      this.showToast('Could not copy to clipboard', 'error');
    }
    document.body.removeChild(ta);
  }

  triggerConfetti() {
    const canvas = document.getElementById('confetti-canvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const pieces = [];
    const colors = ['#00d2ff', '#0066ff', '#10b981', '#f59e0b', '#a855f7', '#ffffff'];

    for (let i = 0; i < 90; i++) {
      pieces.push({
        x: canvas.width / 2,
        y: canvas.height / 2,
        vx: (Math.random() - 0.5) * 18,
        vy: (Math.random() - 0.5) * 18 - 4,
        size: Math.random() * 8 + 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        rotation: Math.random() * 360,
        rSpeed: (Math.random() - 0.5) * 10,
        alpha: 1
      });
    }

    let frame = 0;
    const animate = () => {
      frame++;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      let activeCount = 0;
      pieces.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.35; // gravity
        p.vx *= 0.98;
        p.rotation += p.rSpeed;
        p.alpha -= 0.012;

        if (p.alpha > 0) {
          activeCount++;
          ctx.save();
          ctx.globalAlpha = p.alpha;
          ctx.translate(p.x, p.y);
          ctx.rotate((p.rotation * Math.PI) / 180);
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
          ctx.restore();
        }
      });

      if (activeCount > 0 && frame < 120) {
        requestAnimationFrame(animate);
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    };

    requestAnimationFrame(animate);
  }

  escapeHtml(str) {
    if (!str) return '';
    return str.toString().replace(/[&<>"']/g, m => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    })[m]);
  }
}

// Global App Initialization
document.addEventListener('DOMContentLoaded', () => {
  window.app = new OmniOTPApp();
});
