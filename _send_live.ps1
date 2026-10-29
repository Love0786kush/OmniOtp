$h = @{ 'x-api-key' = 'sk_live_localdev_0123456789abcdef'; 'Content-Type' = 'application/json' }
$b = '{"phone":"7877080266","simulate":false,"app_name":"Rwash","length":6,"expiry_minutes":5,"template":"Rwash Login key is {{otp}}. Do not share this code with anyone."}'
try {
  $r = Invoke-RestMethod -Uri 'http://localhost:5000/api/v1/otp/send' -Method Post -Headers $h -Body $b -TimeoutSec 30
  $r | ConvertTo-Json -Depth 5 | Out-File -FilePath 'c:\Users\XXX\Desktop\test\otp_template_test.txt'
} catch {
  $_.Exception.Message | Out-File -FilePath 'c:\Users\XXX\Desktop\test\otp_template_error.txt'
}