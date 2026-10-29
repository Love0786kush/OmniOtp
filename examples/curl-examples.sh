#!/usr/bin/env bash
# OmniOTP curl examples
BASE="http://localhost:5000"
KEY="sk_live_change_me_in_production"

# Health
curl -s "$BASE/api/v1/health"

# Send OTP
curl -s -X POST "$BASE/api/v1/otp/send" \
  -H "Content-Type: application/json" \
  -H "x-api-key: $KEY" \
  -d '{"phone":"+919876543210","length":6,"expiry_minutes":5}'

# Verify OTP
curl -s -X POST "$BASE/api/v1/otp/verify" \
  -H "Content-Type: application/json" \
  -H "x-api-key: $KEY" \
  -d '{"session_id":"sess_...","otp":"123456","phone":"+919876543210"}'

# Send SMS
curl -s -X POST "$BASE/api/v1/sms/send" \
  -H "Content-Type: application/json" \
  -H "x-api-key: $KEY" \
  -d '{"phone":"+919876543210","message":"Hello from OmniOTP"}'

# Bulk SMS
curl -s -X POST "$BASE/api/v1/sms/bulk" \
  -H "Content-Type: application/json" \
  -H "x-api-key: $KEY" \
  -d '{"phones":["+919876543210","+919876543211"],"message":"Bulk hello","delay_ms":200}'

# Logs
curl -s "$BASE/api/v1/logs" -H "x-api-key: $KEY"

# Gateways
curl -s "$BASE/api/v1/gateways" -H "x-api-key: $KEY"
curl -s -X POST "$BASE/api/v1/gateways" \
  -H "Content-Type: application/json" \
  -H "x-api-key: $KEY" \
  -d '{"name":"Primary","from":"+917852081659","apiKey":"uk_...","cap":1000}'
