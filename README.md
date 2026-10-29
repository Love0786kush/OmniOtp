# ⚡ OmniOTP Cloud — Universal SMS & OTP Platform

Production-grade Universal OTP Provider & SMS Cloud Platform powered by httpSMS Android Gateway. Turn any Android phone into an enterprise SMS API gateway with custom API keys, dynamic templates, bulk SMS broadcast, and ready-to-use Android & Website templates.

## Features
- OTP send/verify with hashed codes, attempt limits, expiry, cooldown
- Direct & bulk SMS dispatch via httpSMS
- Gateway pool with random selection and sent counters
- Platform API keys (add existing keys)
- SMS templates with Supabase sync
- Audit logs persisted to Supabase
- Interactive web panel with toast notifications

## Quick Start
1. Install dependencies:
   ```bash
   npm install
   ```
2. Configure `.env` (see `.env` example).
3. Run the server:
   ```bash
   npm start
   ```
4. Open `index.html` in your browser.

## REST API
Base URL: `http://localhost:5000`  
Auth: `x-api-key: sk_live_...`

- `GET  /api/v1/health`
- `GET  /api/v1/public-config`
- `POST /api/v1/otp/send`
- `POST /api/v1/otp/verify`
- `POST /api/v1/sms/send`
- `POST /api/v1/sms/bulk`
- `GET  /api/v1/logs`
- `GET  /api/v1/gateways`
- `POST /api/v1/gateways`

## Integration
- Web: `examples/web-integration.js`
- Android: `examples/android-integration.kt`
- curl: `examples/curl-examples.sh`

## Supabase
Run `supabase_schema.sql` in the Supabase SQL Editor to create tables. The server and frontend sync data to Supabase.

## Repository Structure
```
index.html
css/style.css
js/
  app.js
  httpsms.js
  otp-manager.js
  phone-mockup.js
  supabase.js
server.js
examples/
supabase_schema.sql
```
