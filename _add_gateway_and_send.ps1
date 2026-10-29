$h = @{ 'x-api-key' = 'sk_live_localdev_0123456789abcdef'; 'Content-Type' = 'application/json' }
$body = '{"name":"Primary","from":"7852081659","apiKey":"uk_wBxpD1neiGl12lD0pW736lzcEQIYasr253HFwsp4ZIE5dDB09OX8JdkZRqkMx1x7","cap":100}'
Write-Host "=== ADDING GATEWAY ==="
$gw = Invoke-RestMethod -Uri 'http://localhost:5000/api/v1/gateways' -Method Post -Headers $h -Body $body
$gw | ConvertTo-Json -Depth 5

Write-Host "`n=== SENDING OTP TO 7852081659 ==="
$ob = '{"phone":"7852081659","simulate":false,"app_name":"OmniOTP","length":6,"expiry_minutes":5}'
$otp = Invoke-RestMethod -Uri 'http://localhost:5000/api/v1/otp/send' -Method Post -Headers $h -Body $ob
$otp | ConvertTo-Json -Depth 5

Write-Host "`n=== OTP CODE ==="
Write-Host $otp.otp