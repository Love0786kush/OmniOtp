// OmniOTP Web Integration Example
const OMNIOTP_BASE_URL = 'https://omniotp.onrender.com';
const OMNIOTP_API_KEY = 'sk_live_change_me_in_production';

async function sendOtp(phone) {
  const res = await fetch(`${OMNIOTP_BASE_URL}/api/v1/otp/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': OMNIOTP_API_KEY },
    body: JSON.stringify({ phone, length: 6, expiry_minutes: 5 })
  });
  return res.json();
}

async function verifyOtp(sessionId, otp, phone) {
  const res = await fetch(`${OMNIOTP_BASE_URL}/api/v1/otp/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': OMNIOTP_API_KEY },
    body: JSON.stringify({ session_id: sessionId, otp, phone })
  });
  return res.json();
}

async function sendSms(phone, message) {
  const res = await fetch(`${OMNIOTP_BASE_URL}/api/v1/sms/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': OMNIOTP_API_KEY },
    body: JSON.stringify({ phone, message })
  });
  return res.json();
}

// Example usage:
// sendOtp('+919876543210').then(console.log);
// verifyOtp('sess_...', '123456', '+919876543210').then(console.log);
// sendSms('+919876543210', 'Hello from OmniOTP').then(console.log);
