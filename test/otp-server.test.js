/**
 * OmniOTP Cloud - Backend OTP/HTTP SMS tests
 *
 * Run:  npm install   (adds @supabase/supabase-js)
 *       node test/otp-server.test.js
 *
 * Spins the Express app in-process, mocks `fetch` (the httpSMS provider), and
 * asserts real request/response behaviour. No real SMS is sent; no Supabase
 * credentials are required (SUPABASE_* unset => in-memory fallback).
 */

'use strict';

process.env.NODE_ENV = 'test';
process.env.PORT = '0';
process.env.HTTPSMS_API_KEY = 'sk_test_httpsms_abcdef123456';
process.env.HTTPSMS_FROM = '+917852081659';
process.env.MASTER_API_KEY = 'sk_live_testmasterkey0001';
process.env.SUPABASE_URL = '';
process.env.SUPABASE_SERVICE_ROLE_KEY = '';
process.env.SUPABASE_ANON_KEY = '';
process.env.FRONTEND_ORIGIN = 'http://localhost:5500';

const assert = require('node:assert/strict');
const { describe, it, before, after, beforeEach, afterEach } = require('node:test');
const http = require('node:http');
const { app } = require('../server.js');

let server;
let port;
const API_KEY = process.env.MASTER_API_KEY;

const provider = { status: 200, body: { status: 'submitted', data: { id: 'msg_mock_1' } } };
const originalFetch = global.fetch;

beforeEach(() => {
  provider.status = 200;
  provider.body = { status: 'submitted', data: { id: 'msg_mock_1' } };
  global.fetch = async (url, opts) => {
    if (String(url).includes('api.httpsms.com')) {
      return {
        ok: provider.status >= 200 && provider.status < 300,
        status: provider.status,
        json: async () => provider.body,
        text: async () => JSON.stringify(provider.body)
      };
    }
    return originalFetch(url, opts);
  };
});

afterEach(() => { global.fetch = originalFetch; });

before(async () => {
  server = http.createServer(app);
  await new Promise((res) => server.listen(0, '127.0.0.1', res));
  const addr = server.address();
  port = typeof addr === 'object' ? addr.port : 0;
});

after(async () => { await new Promise((res) => server.close(res)); });

function headers(extra = {}) {
  return { 'Content-Type': 'application/json', 'x-api-key': API_KEY, ...extra };
}

function apiRequest(method, path, body, customHeaders) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path,
      method,
      headers: headers(customHeaders)
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        let parsed;
        try { parsed = data ? JSON.parse(data) : {}; } catch (e) { parsed = data; }
        resolve({ status: res.statusCode, headers: res.headers, body: parsed, raw: data });
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

describe('OmniOTP backend', () => {
  describe('Health', () => {
    it('reports healthy and lists endpoints', async () => {
      const r = await apiRequest('GET', '/api/v1/health');
      assert.strictEqual(r.status, 200);
      assert.strictEqual(r.body.status, 'healthy');
      assert.ok(r.body.endpoints['send_otp']);
      assert.ok(r.body.endpoints['verify_otp']);
    });
  });

  describe('POST /api/v1/otp/send', () => {
    it('dispatches via mocked httpSMS, returns session (no OTP)', async () => {
      provider.body = { status: 'submitted', data: { id: 'msg_valid_1' } };
      const r = await apiRequest('POST', '/api/v1/otp/send', {
        phone: '+919876543210', length: 6, expiry_minutes: 5, app_name: 'TestApp'
      });
      assert.strictEqual(r.status, 200, JSON.stringify(r.body));
      assert.strictEqual(r.body.success, true);
      assert.ok(r.body.session_id, 'session_id must be returned');
      assert.strictEqual(r.body.phone, '+919876543210');
      assert.ok(r.body.expires_in_seconds);
      assert.strictEqual(r.body.otp, undefined);
      assert.strictEqual(r.body.code, undefined);
      assert.strictEqual(r.body.provider_status, 'submitted');
    });

    it('rejects an invalid phone number', async () => {
      const r = await apiRequest('POST', '/api/v1/otp/send', { phone: 'not-a-phone', length: 6 });
      assert.strictEqual(r.status, 400);
      assert.strictEqual(r.body.success, false);
    });

    it('rejects missing phone', async () => {
      const r = await apiRequest('POST', '/api/v1/otp/send', { length: 6 });
      assert.strictEqual(r.status, 400);
    });

    it('fails with a clear error when httpSMS provider fails', async () => {
      provider.status = 502;
      provider.body = { message: 'Upstream gateway error' };
      const r = await apiRequest('POST', '/api/v1/otp/send', { phone: '+919876543210', length: 6 });
      assert.strictEqual(r.status, 502);
      assert.strictEqual(r.body.success, false);
      assert.ok(r.body.error);
    });

    it('requires a valid API key', async () => {
      const r = await apiRequest('POST', '/api/v1/otp/send', { phone: '+919876543210', length: 6 }, { 'x-api-key': 'bad_key' });
      assert.strictEqual(r.status, 401);
      assert.strictEqual(r.body.success, false);
    });

    it('enforces resend cooldown for the same phone', async () => {
      provider.body = { status: 'submitted', data: { id: 'msg_cooldown_1' } };
      const r1 = await apiRequest('POST', '/api/v1/otp/send', { phone: '+919876543211', length: 6 });
      assert.strictEqual(r1.status, 200);
      const r2 = await apiRequest('POST', '/api/v1/otp/send', { phone: '+919876543211', length: 6 });
      assert.strictEqual(r2.status, 429, 'second send within cooldown should be rate-limited');
      assert.ok(r2.body.error);
    });
  });

  describe('POST /api/v1/otp/verify', () => {
    let sessionId;
    beforeEach(async () => {
      provider.body = { status: 'submitted', data: { id: 'msg_verify_1' } };
      const r = await apiRequest('POST', '/api/v1/otp/send', {
        phone: '+919876543212', length: 6, expiry_minutes: 5
      });
      assert.strictEqual(r.status, 200);
      sessionId = r.body.session_id;
    });

    it('rejects verification with a wrong code (attempts decrement)', async () => {
      const r = await apiRequest('POST', '/api/v1/otp/verify', {
        session_id: sessionId, otp: '000000', phone: '+919876543212'
      });
      assert.strictEqual(r.status, 400);
      assert.strictEqual(r.body.verified, false);
      assert.ok(r.body.attempts_left <= 2);
    });

    it('locks out after excessive wrong attempts', async () => {
      for (let i = 0; i < 3; i++) {
        const r = await apiRequest('POST', '/api/v1/otp/verify', {
          session_id: sessionId, otp: '000000', phone: '+919876543212'
        });
        assert.ok([400, 429].includes(r.status));
      }
      const r = await apiRequest('POST', '/api/v1/otp/verify', {
        session_id: sessionId, otp: '000000', phone: '+919876543212'
      });
      assert.strictEqual(r.status, 429);
      assert.strictEqual(r.body.verified, false);
      assert.ok(r.body.error && r.body.error.includes('Maximum'));
    });

    it('rejects a missing session', async () => {
      const r = await apiRequest('POST', '/api/v1/otp/verify', {
        session_id: 'sess_does_not_exist', otp: '123456'
      });
      assert.strictEqual(r.status, 404);
      assert.strictEqual(r.body.verified, false);
    });

    it('requires an OTP code', async () => {
      const r = await apiRequest('POST', '/api/v1/otp/verify', { session_id: sessionId });
      assert.strictEqual(r.status, 400);
      assert.strictEqual(r.body.verified, false);
    });
  });

  describe('Security', () => {
    it('never returns the plaintext OTP', async () => {
      provider.body = { status: 'submitted', data: { id: 'msg_noprint_1' } };
      const r = await apiRequest('POST', '/api/v1/otp/send', { phone: '+919876543213', length: 6 });
      assert.strictEqual(r.body.otp, undefined);
      assert.strictEqual(r.body.code, undefined);
    });
  });
});

console.log('All OTP backend tests completed.');