/**
 * OmniOTP Cloud - Serverless Cloudflare Worker
 * Free 1-Click Worldwide Serverless Deployment
 * 
 * Deploy to Cloudflare Workers:
 * 1. Go to https://dash.cloudflare.com -> Workers & Pages -> Create Application
 * 2. Paste this file into the Cloudflare Worker Editor
 * 3. Deploy! You now have a 100% free, 24/7 HTTPS Universal OTP API URL worldwide!
 */

const HTTPSMS_API_KEY = "YOUR_HTTPSMS_API_KEY";
const HTTPSMS_FROM = "+917852081659";
const MASTER_API_KEY = "sk_live_change_me_in_production";

// Global sessions map for worker runtime (or bind KV namespace "OTP_KV" for persistent multi-region storage)
const SESSIONS = new Map();

export default {
  async fetch(request, env, ctx) {
    // Enable CORS
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, x-api-key",
      "Content-Type": "application/json"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "");

    // 1. Health endpoint
    if (path === "/api/v1/health" || path === "" || path === "/") {
      return new Response(JSON.stringify({
        status: "healthy",
        platform: "OmniOTP Cloud Serverless Edge",
        engine: "httpSMS Android Gateway",
        gateway_from: HTTPSMS_FROM,
        time: new Date().toISOString()
      }), { headers: corsHeaders });
    }

    // Auth check
    const apiKey = request.headers.get("x-api-key") || (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const isValidPlatformKey = (key) => /^sk_live_[A-Za-z0-9_-]{12,}$/.test(key);
    if (!apiKey || (apiKey !== MASTER_API_KEY && !isValidPlatformKey(apiKey))) {
      return new Response(JSON.stringify({
        success: false,
        error: "Unauthorized. Header x-api-key: sk_live_... is missing or invalid."
      }), { status: 401, headers: corsHeaders });
    }

    // 2. Send OTP
    if (path === "/api/v1/otp/send" && request.method === "POST") {
      try {
        const body = await request.json();
        let phone = (body.phone || "").replace(/[\s\-\(\)]/g, "");
        if (/^\d{10}$/.test(phone)) phone = "+91" + phone;
        if (!phone.startsWith("+")) phone = "+" + phone;

        const length = Math.min(Math.max(parseInt(body.length, 10) || 6, 4), 8);
        const expiryMinutes = Math.min(Math.max(parseInt(body.expiry_minutes, 10) || 5, 1), 10);
        const appName = body.app_name || "OmniOTP";

        // Generate OTP
        const chars = "0123456789";
        const bytes = new Uint8Array(length);
        crypto.getRandomValues(bytes);
        let otp = "";
        for (let i = 0; i < length; i++) {
          otp += chars[bytes[i] % chars.length];
        }

        const sessionId = "sess_" + crypto.randomUUID().replace(/-/g, "").slice(0, 20);
        const expiresAt = Date.now() + expiryMinutes * 60 * 1000;

        const tpl = body.template || "Your verification code for {{app_name}} is {{otp}}. Valid for {{expiry}} minutes.";
        const message = tpl.replace("{{otp}}", otp).replace("{{expiry}}", expiryMinutes).replace("{{app_name}}", appName);

        // Send via httpSMS
        const smsRes = await fetch("https://api.httpsms.com/v1/messages/send", {
          method: "POST",
          headers: {
            "x-api-key": HTTPSMS_API_KEY,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            to: phone,
            from: HTTPSMS_FROM,
            content: message
          })
        });

        if (!smsRes.ok) {
          const err = await smsRes.json().catch(() => ({}));
          return new Response(JSON.stringify({ success: false, error: err.message || "httpSMS dispatch failed" }), { status: 502, headers: corsHeaders });
        }

        // Store session
        SESSIONS.set(sessionId, { sessionId, phone, otp, expiresAt, attemptsLeft: 3 });

        return new Response(JSON.stringify({
          success: true,
          session_id: sessionId,
          phone: phone,
          expires_in_seconds: expiryMinutes * 60,
          message: "OTP sent successfully via httpSMS"
        }), { headers: corsHeaders });
      } catch (e) {
        return new Response(JSON.stringify({ success: false, error: e.message }), { status: 500, headers: corsHeaders });
      }
    }

    // 3. Verify OTP
    if (path === "/api/v1/otp/verify" && request.method === "POST") {
      try {
        const body = await request.json();
        const userOtp = (body.otp || "").toString().trim();
        const sessionId = body.session_id;

        const session = SESSIONS.get(sessionId);
        if (!session) {
          return new Response(JSON.stringify({ success: false, verified: false, error: "Session not found or expired." }), { status: 404, headers: corsHeaders });
        }

        if (session.attemptsLeft <= 0) {
          SESSIONS.delete(sessionId);
          return new Response(JSON.stringify({ success: false, verified: false, error: "Maximum verification attempts exceeded." }), { status: 429, headers: corsHeaders });
        }

        if (Date.now() > session.expiresAt) {
          return new Response(JSON.stringify({ success: false, verified: false, error: "OTP expired." }), { status: 400, headers: corsHeaders });
        }

        if (session.otp === userOtp) {
          SESSIONS.delete(sessionId);
          return new Response(JSON.stringify({ success: true, verified: true, message: "OTP verified successfully!" }), { headers: corsHeaders });
        } else {
          session.attemptsLeft--;
          if (session.attemptsLeft <= 0) SESSIONS.delete(sessionId);
          return new Response(JSON.stringify({ success: false, verified: false, error: "Incorrect OTP code", attempts_left: session.attemptsLeft }), { status: 400, headers: corsHeaders });
        }
      } catch (e) {
        return new Response(JSON.stringify({ success: false, error: e.message }), { status: 500, headers: corsHeaders });
      }
    }

    // 4. Send Direct SMS
    if (path === "/api/v1/sms/send" && request.method === "POST") {
      const body = await request.json();
      let phone = (body.phone || "").replace(/[\s\-\(\)]/g, "");
      if (/^\d{10}$/.test(phone)) phone = "+91" + phone;

      const res = await fetch("https://api.httpsms.com/v1/messages/send", {
        method: "POST",
        headers: {
          "x-api-key": HTTPSMS_API_KEY,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          to: phone,
          from: HTTPSMS_FROM,
          content: body.message
        })
      });
      const data = await res.json();
      return new Response(JSON.stringify(data), { headers: corsHeaders });
    }

    return new Response(JSON.stringify({ error: "Endpoint not found" }), { status: 404, headers: corsHeaders });
  }
};
