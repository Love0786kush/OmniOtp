/**
 * Interactive Smartphone Mockup Visualizer
 * Simulates receiving SMS notifications with dynamic island alerts,
 * Web Audio sound synthesis, chat thread, and 1-click auto-fill into verification.
 */

class PhoneMockupVisualizer {
  constructor() {
    this.container = null;
    this.messages = [];
    this.audioContext = null;
    this.initTimeUpdater();
  }

  init(containerId) {
    this.container = document.getElementById(containerId);
    if (!this.container) return;
    this.render();
  }

  initAudio() {
    if (!this.audioContext) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.audioContext = new AudioCtx();
      }
    }
    if (this.audioContext && this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }
  }

  playNotificationChime() {
    try {
      this.initAudio();
      if (!this.audioContext) return;

      const now = this.audioContext.currentTime;
      const osc1 = this.audioContext.createOscillator();
      const osc2 = this.audioContext.createOscillator();
      const gain = this.audioContext.createGain();

      osc1.type = 'sine';
      osc2.type = 'triangle';

      // Crisp glass chime frequencies (E6 -> B6)
      osc1.frequency.setValueAtTime(1318.5, now);
      osc1.frequency.exponentialRampToValueAtTime(1975.5, now + 0.12);

      osc2.frequency.setValueAtTime(1320, now);
      osc2.frequency.exponentialRampToValueAtTime(1980, now + 0.12);

      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(this.audioContext.destination);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.6);
      osc2.stop(now + 0.6);
    } catch (e) {
      // Audio autoplay policy fallback
    }
  }

  initTimeUpdater() {
    setInterval(() => {
      const now = new Date();
      const hours = now.getHours().toString().padStart(2, '0');
      const mins = now.getMinutes().toString().padStart(2, '0');
      const timeEls = document.querySelectorAll('.mockup-clock');
      timeEls.forEach(el => el.textContent = `${hours}:${mins}`);
    }, 1000);
  }

  /**
   * Push incoming SMS notification & thread entry
   */
  receiveSMS({ from, to, content, code }) {
    this.playNotificationChime();

    const msg = {
      id: 'phone_msg_' + Date.now(),
      from: from || 'httpSMS Service',
      to: to,
      content: content,
      code: code,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      timestamp: Date.now()
    };

    this.messages.push(msg);

    // Show dynamic island / push banner
    this.showBannerNotification(msg);

    // Update conversation view
    this.appendMessageBubble(msg);
  }

  showBannerNotification(msg) {
    const banner = document.getElementById('phone-push-banner');
    if (!banner) return;

    const senderEl = banner.querySelector('.push-sender');
    const textEl = banner.querySelector('.push-text');
    const timeEl = banner.querySelector('.push-time');
    const codePill = banner.querySelector('.push-code-pill');

    if (senderEl) senderEl.textContent = msg.from || 'SMS Gateway';
    if (textEl) textEl.textContent = msg.content;
    if (timeEl) timeEl.textContent = 'now';

    if (codePill) {
      if (msg.code) {
        codePill.textContent = `Code: ${msg.code}`;
        codePill.style.display = 'inline-flex';
      } else {
        codePill.style.display = 'none';
      }
    }

    banner.classList.remove('banner-hidden');
    banner.classList.add('banner-visible');

    // Click banner to autofill
    banner.onclick = () => {
      if (msg.code && window.app) {
        window.app.autoFillOTP(msg.code);
      }
    };

    // Auto dismiss banner after 7 seconds
    if (this.bannerTimeout) clearTimeout(this.bannerTimeout);
    this.bannerTimeout = setTimeout(() => {
      banner.classList.remove('banner-visible');
      banner.classList.add('banner-hidden');
    }, 7000);
  }

  appendMessageBubble(msg) {
    const chatContainer = document.getElementById('phone-chat-messages');
    if (!chatContainer) return;

    // Remove empty state placeholder if present
    const emptyState = chatContainer.querySelector('.mockup-empty-state');
    if (emptyState) {
      emptyState.remove();
    }

    const bubble = document.createElement('div');
    bubble.className = 'sms-bubble-wrapper animate-slide-in';
    bubble.innerHTML = `
      <div class="sms-sender-tag">httpSMS Gateway • ${msg.time}</div>
      <div class="sms-bubble">
        <div class="sms-text">${this.escapeHtml(msg.content)}</div>
        ${msg.code ? `
          <div class="sms-action-row">
            <span class="sms-code-highlight">${this.escapeHtml(msg.code)}</span>
            <button class="sms-autofill-btn" data-code="${this.escapeHtml(msg.code)}" title="Auto-fill into Verification Input">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
              Auto-fill Code
            </button>
          </div>
        ` : ''}
      </div>
    `;

    // Hook auto fill button
    const autoFillBtn = bubble.querySelector('.sms-autofill-btn');
    if (autoFillBtn) {
      autoFillBtn.addEventListener('click', () => {
        window.app?.autoFillOTP(msg.code);
      });
    }

    chatContainer.appendChild(bubble);
    chatContainer.scrollTop = chatContainer.scrollHeight;
  }

  escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>"']/g, m => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    })[m]);
  }

  clearChat() {
    this.messages = [];
    const chatContainer = document.getElementById('phone-chat-messages');
    if (chatContainer) {
      chatContainer.innerHTML = `
        <div class="mockup-empty-state">
          <div class="empty-icon-circle">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
          </div>
          <h4>No Messages Yet</h4>
          <p>Dispatched OTPs and SMS notifications will appear here in real-time.</p>
        </div>
      `;
    }
  }
}

// Global instance
window.phoneMockup = new PhoneMockupVisualizer();
