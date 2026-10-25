# ⚡ OmniOTP Cloud — Universal SMS & OTP Platform

> **Production-grade Universal OTP Provider & SMS Cloud Platform powered by httpSMS Android Gateway.**  
> Turn any Android phone into an enterprise SMS API gateway with custom API keys, dynamic templates engine, bulk SMS broadcast, interactive smartphone visualizer, and ready-to-use Android & Website drop-in templates.

---

## 🌟 Key Architecture & Features

### 1. 🔑 Universal Platform API Keys Hub
- Generate unique Platform API Keys (`sk_live_...`) for different clients:
  - **Android Mobile Apps**
  - **E-Commerce Websites / Web Portals**
  - **CRM Systems & Microservices**
- Full authentication via `x-api-key: sk_live_...` or `Authorization: Bearer sk_live_...`.
- 1-click key revocation, generation, and copy.

### 2. 💬 SMS & OTP Templates Engine
- Create custom message templates with dynamic placeholders:
  - `{{otp}}` — Generated numeric or alphanumeric passcode
  - `{{expiry}}` — Minutes until expiration (1, 3, 5, 10 min)
  - `{{app_name}}` — Your client application name
  - `{{name}}` — Customer name
  - `{{phone}}` — Recipient phone number
  - `{{amount}}` — Transaction amount
- 5 built-in presets: Login OTP, Signup Verification, Password Reset, 2FA Payment, and Promotional Alert.
- GSM 7-bit character counter and SMS parts calculator (160 characters = 1 SMS).

### 3. 📱 Send & Verify OTP Engine
- **Configurable Passcode Parameters**:
  - Code length: 4, 6, or 8 digits.
  - Character set: Numeric (`0-9`) or Alphanumeric (`A-Z`, `2-9`).
  - TTL Expiry: 1, 3, 5, or 10 minutes.
- **Radial SVG Animated Countdown Clock**:
  - Real-time countdown ring and text.
  - Anti-brute force protection (Maximum 3 attempts before lockout).
  - 60s resend throttle per recipient phone number.

### 4. 🚀 High-Volume Bulk SMS Engine
- Send SMS broadcasts to multiple recipients simultaneously.
- Import phone numbers via direct paste (comma/newline separated) or **CSV / TXT upload**.
- Automatic recipient deduplication and validation.
- Carrier-safe dispatch throttle delay (500ms - 3000ms) to protect Android SIM cards from carrier throttling.
- Live progress bar, Sent / Failed counters, Pause / Resume controls, and delivery stream.

### 5. 🧪 Interactive Live API Playground
- Test REST API endpoints directly in your browser:
  - `POST /api/v1/otp/send`
  - `POST /api/v1/otp/verify`
  - `POST /api/v1/sms/send`
  - `POST /api/v1/sms/bulk`
  - `GET /api/v1/health`
- Live response inspector showing HTTP status badge (`200 OK`), request latency in milliseconds, and pretty-printed JSON response.

### 6. 📱 Interactive Smartphone Mockup Visualizer
- Flagship phone frame with Dynamic Island notch, clock, and battery indicator.
- Incoming slide-down push notification banner with synthesized audio chime.
- Real-time SMS conversation thread showing exact delivered text.
- **1-Click Auto-Fill**: Tap "Auto-Fill Code" in the mockup or notification banner to immediately paste the OTP into the verification form!

---

## 🚀 Quick Start Guide

### Option 1: Open the Web Panel Immediately (No Setup Required)
Simply open `index.html` in your favorite browser (Google Chrome, Microsoft Edge, Brave, Firefox):
```powershell
Start-Process msedge "c:\Users\XXX\Desktop\test\index.html"
# or
Start-Process chrome "c:\Users\XXX\Desktop\test\index.html"
```
The application runs 100% in client mode with direct httpSMS connectivity and full simulation mode!

---

### Option 2: Run the Native Windows PowerShell REST API Server
If you want an external Android phone, emulator, or website to make HTTP REST API calls to your machine:
```powershell
powershell -ExecutionPolicy Bypass -File .\api-server.ps1 -Port 5000
```
- **Port**: `http://localhost:5000` (or `http://YOUR_LOCAL_IP:5000` on your Wi-Fi network)
- **Zero dependencies**: Uses native .NET `HttpListener` built into Windows.
- Full CORS enabled for Android apps and Web browsers.

---

### Option 3: Deploy to Render.com (100% Free 24/7 Hosting)
1. Push this repository to your GitHub account (`git push`).
2. Log in to [dashboard.render.com](https://dashboard.render.com) and click **New +** → **Blueprint** or **Web Service**.
3. Select your repository. Render will automatically detect [`render.yaml`](file:///c:/Users/XXX/Desktop/test/render.yaml) and deploy your app in 2 minutes!
4. Your live URL will be ready at: `https://your-app-name.onrender.com`.

---

### Option 4: Deploy to Vercel
1. Install Vercel CLI (`npm i -g vercel`) or connect your GitHub repo at [vercel.com](https://vercel.com).
2. Run `vercel` in this folder. Vercel automatically uses [`vercel.json`](file:///c:/Users/XXX/Desktop/test/vercel.json) to deploy.

---

### Option 5: Deploy with Docker / Railway / Fly.io
Use the included production [`Dockerfile`](file:///c:/Users/XXX/Desktop/test/Dockerfile):
```bash
docker build -t omni-otp-cloud .
docker run -p 5000:5000 omni-otp-cloud
```

---

### Option 6: Deploy Free Serverless Cloudflare Worker (Worldwide Edge)
Deploy [`cloudflare-worker.js`](file:///c:/Users/XXX/Desktop/test/cloudflare-worker.js) to Cloudflare Workers for instant free serverless endpoints:
1. Log in to [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages** → **Create Application**.
2. Paste the contents of `cloudflare-worker.js`.
3. Click **Deploy**! Your API URL will be: `https://your-worker-name.workers.dev/api/v1/otp/send`.

---

## 📱 How to Integrate into an Android App

### Step 1: Add Retrofit to `app/build.gradle`
```groovy
implementation 'com.squareup.retrofit2:retrofit:2.9.0'
implementation 'com.squareup.retrofit2:converter-gson:2.9.0'
```

### Step 2: Use the Provided Android Template Files
Copy the ready-to-use template files from `templates/android-app/`:
- [`OtpApiService.kt`](file:///c:/Users/XXX/Desktop/test/templates/android-app/OtpApiService.kt) — Retrofit service definition.
- [`OtpVerificationActivity.kt`](file:///c:/Users/XXX/Desktop/test/templates/android-app/OtpVerificationActivity.kt) — Full Activity logic (Send OTP, Countdown Timer, Verify Code).
- [`activity_otp_verification.xml`](file:///c:/Users/XXX/Desktop/test/templates/android-app/activity_otp_verification.xml) — UI XML layout.

### Step 3: Call from Kotlin
```kotlin
val api = OtpApiService.create()
val apiKey = "sk_live_omni_7a9f4c82b1d3e6" // From your OmniOTP Dashboard

// 1. Send OTP
val sendRes = api.sendOtp(apiKey, SendOtpRequest(phone = "+919876543210", app_name = "My App"))
val sessionId = sendRes.body()?.session_id

// 2. Verify OTP
val verifyRes = api.verifyOtp(apiKey, VerifyOtpRequest(session_id = sessionId!!, otp = "123456"))
if (verifyRes.body()?.verified == true) {
    // Phone verified! Continue to Home Screen
}
```

---

## 🌐 How to Integrate into Any Website

Open [`templates/web-widget/otp-login-widget.html`](file:///c:/Users/XXX/Desktop/test/templates/web-widget/otp-login-widget.html) for a complete drop-in modal component ready to copy-paste into WordPress, PHP, React, Vue, or static HTML!

```html
<script>
const API_URL = "http://localhost:5000"; // Or your deployed Cloudflare Worker URL
const API_KEY = "sk_live_omni_7a9f4c82b1d3e6";

// Send OTP
fetch(`${API_URL}/api/v1/otp/send`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
  body: JSON.stringify({ phone: "+919876543210", app_name: "My Website" })
});
</script>
```

---

## 📡 REST API Reference

### 1. Send OTP
`POST /api/v1/otp/send`
- **Headers**: `x-api-key: sk_live_...`, `Content-Type: application/json`
- **Request Body**:
```json
{
  "phone": "+919876543210",
  "app_name": "My App",
  "length": 6,
  "expiry_minutes": 5,
  "type": "numeric"
}
```
- **Response**:
```json
{
  "success": true,
  "session_id": "sess_8f3d1b9a2c",
  "phone": "+919876543210",
  "expires_in_seconds": 300,
  "message": "OTP dispatched successfully via httpSMS"
}
```

### 2. Verify OTP
`POST /api/v1/otp/verify`
- **Headers**: `x-api-key: sk_live_...`, `Content-Type: application/json`
- **Request Body**:
```json
{
  "session_id": "sess_8f3d1b9a2c",
  "otp": "123456"
}
```
- **Response**:
```json
{
  "success": true,
  "verified": true,
  "message": "OTP verified successfully! Access granted."
}
```

### 3. Send Direct SMS
`POST /api/v1/sms/send`
- **Request Body**:
```json
{
  "phone": "+919876543210",
  "message": "Hello from OmniOTP Cloud!"
}
```

### 4. Bulk SMS
`POST /api/v1/sms/bulk`
- **Request Body**:
```json
{
  "phones": ["+919876543210", "+918290866520"],
  "message": "Special announcement for all users!",
  "delay_ms": 1000
}
```

---

## 📁 Repository Structure

```
├── index.html                   # Universal Master Control Panel (11 feature tabs)
├── css/
│   └── style.css                # Obsidian Dark & Electric Cyan design system
├── js/
│   ├── httpsms.js               # httpSMS client, API keys store & template engine
│   ├── otp-manager.js           # Cryptographic OTP lifecycle & audit logs
│   ├── phone-mockup.js          # Interactive Smartphone Mockup with sound chime
│   └── app.js                   # Application controller & state machine
├── api-server.ps1               # Native Windows PowerShell REST API Server
├── server.js                    # Node.js Express REST API Server
├── package.json                 # Node dependencies
├── cloudflare-worker.js         # Serverless Cloudflare Worker script
├── api.php                      # PHP Gateway for Apache / cPanel
├── templates/
│   ├── android-app/             # Complete Android Studio project templates
│   │   ├── OtpApiService.kt
│   │   ├── OtpVerificationActivity.kt
│   │   └── activity_otp_verification.xml
│   └── web-widget/              # Drop-in Website Widget
│       └── otp-login-widget.html
└── README.md                    # Platform documentation
```
#   O m n i O t p  
 