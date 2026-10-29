$h = @{ 'x-api-key' = 'sk_live_localdev_0123456789abcdef'; 'Content-Type' = 'application/json' }
$b = '{"phone":"7852081659","simulate":true}'
$r = Invoke-RestMethod -Uri 'http://localhost:5000/api/v1/otp/send' -Method Post -Headers $h -Body $b
$r | ConvertTo-Json -Depth 5