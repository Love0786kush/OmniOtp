$Headers = New-Object 'System.Collections.Generic.Dictionary[[String],[String]]'
$Headers.Add('x-api-key', 'sk_live_localdev_0123456789abcdef')
$Headers.Add('Content-Type', 'application/json')
$Body = '{"phone":"7852081659","simulate":false,"app_name":"OmniOTP","length":6,"expiry_minutes":5}'
try {
  $Response = Invoke-RestMethod -Uri 'http://localhost:5000/api/v1/otp/send' -Method Post -Headers $Headers -Body $Body -TimeoutSec 30
  $Response | ConvertTo-Json -Depth 5 | Out-File -FilePath 'c:\Users\XXX\Desktop\test\otp_result.txt'
} catch {
  $_.Exception.Message | Out-File -FilePath 'c:\Users\XXX\Desktop\test\otp_error.txt'
}