$Headers = @{ "x-api-key" = "sk_live_localdev_0123456789abcdef"; "Content-Type" = "application/json" }
$sendBody = '{"phone":"7852081659","app_name":"DemoApp","length":6,"expiry_minutes":5,"simulate":true}'
"=== SEND #1 (test number resend, should not be rate-limited) ==="
$send = Invoke-RestMethod -Uri "http://localhost:5000/api/v1/otp/send" -Method Post -Headers $Headers -Body $sendBody
$send | ConvertTo-Json -Compress
"=== SEND #2 immediately (cooldown bypass confirmed?) ==="
$send2 = Invoke-RestMethod -Uri "http://localhost:5000/api/v1/otp/send" -Method Post -Headers $Headers -Body $sendBody
$send2 | ConvertTo-Json -Compress
$otp = $send.otp
"USING OTP: $otp"
"=== VERIFY (correct) ==="
$verifyBody = '{"otp":"' + $otp + '","session_id":"' + $send.session_id + '"}'
$verify = Invoke-RestMethod -Uri "http://localhost:5000/api/v1/otp/verify" -Method Post -Headers $Headers -Body $verifyBody
"VERIFY RESULT:"; $verify | ConvertTo-Json -Compress
"=== LIST GATEWAYS ==="
Invoke-RestMethod -Uri "http://localhost:5000/api/v1/gateways" -Method Get -Headers $Headers | ConvertTo-Json -Compress

