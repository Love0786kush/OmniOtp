<#
================================================================================
OmniOTP Cloud - Standalone Native Windows PowerShell REST API Server
Universal OTP & SMS Gateway powered by httpSMS
================================================================================
No Node.js, Python, or external dependencies required!
Runs directly using .NET HttpListener built into Windows.

How to Run:
  powershell -ExecutionPolicy Bypass -File .\api-server.ps1
  or in PowerShell:
  .\api-server.ps1 -Port 5000

Endpoints Provided:
  GET  /api/v1/health       - Health check & gateway status
  POST /api/v1/otp/send     - Dispatch OTP to any mobile phone
  POST /api/v1/otp/verify   - Verify OTP code
  POST /api/v1/sms/send     - Send direct transactional SMS
  POST /api/v1/sms/bulk     - Send bulk SMS to multiple numbers
  GET  /api/v1/logs         - Retrieve recent audit logs
================================================================================
#>

param(
    [int]$Port = 5000,
    [string]$HttpSMSApiKey = "uk_wBxpD1neiGl12lD0pW736lzcEQIYasr253HFwsp4ZIE5dDB09OX8JdkZRqkMx1x7",
    [string]$GatewayPhone = "+918290866520",
    [string]$PlatformApiKey = "sk_live_omni_7a9f4c82b1d3e6"
)

# In-memory storage for sessions, logs, and valid platform API keys
$Global:Sessions = @{}
$Global:Logs = [System.Collections.ArrayList]::new()
$Global:ValidKeys = @($PlatformApiKey, "sk_live_android_app_demo", "sk_live_web_portal_demo")

# Ensure UTF-8 output
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Log-Message {
    param([string]$Msg, [string]$Type = "INFO")
    $timestamp = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
    Write-Host "[$timestamp] [$Type] $Msg" -ForegroundColor $(
        switch ($Type) {
            "SUCCESS" { "Green" }
            "ERROR"   { "Red" }
            "WARN"    { "Yellow" }
            default   { "Cyan" }
        }
    )
}

function Send-HttpSMSDirect {
    param(
        [string]$To,
        [string]$Content,
        [string]$From = $GatewayPhone
    )

    $url = "https://api.httpsms.com/v1/messages/send"
    $headers = @{
        "x-api-key"    = $HttpSMSApiKey.Trim()
        "Content-Type" = "application/json"
        "Accept"       = "application/json"
    }

    $bodyObj = @{
        to         = $To
        content    = $Content
        from       = $From
        request_id = "req_ps_" + [Guid]::NewGuid().ToString("N").Substring(0, 10)
    }
    $jsonBody = $bodyObj | ConvertTo-Json -Compress

    try {
        $response = Invoke-RestMethod -Uri $url -Method Post -Headers $headers -Body $jsonBody -TimeoutSec 15
        return @{ Success = $true; Data = $response }
    }
    catch {
        $err = $_.Exception.Message
        if ($_.Exception.Response) {
            try {
                $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
                $err = $reader.ReadToEnd()
            } catch {}
        }
        return @{ Success = $false; Error = $err }
    }
}

function Format-PhoneNumber {
    param([string]$Phone, [string]$DefaultCountry = "+91")
    if ([string]::IsNullOrWhiteSpace($Phone)) { return $null }
    $clean = $Phone -replace "[\s\-\(\)\.]", ""
    if ($clean.StartsWith("00")) { $clean = "+" + $clean.Substring(2) }
    if ($clean.StartsWith("+")) { return $clean }
    if ($clean.StartsWith("0") -and $clean.Length -eq 11) { return $DefaultCountry + $clean.Substring(1) }
    if ($clean -match "^\d{10}$") { return $DefaultCountry + $clean }
    if ($clean -match "^91\d{10}$") { return "+" + $clean }
    return "+" + $clean
}

function Generate-SecureOTP {
    param([int]$Length = 6, [string]$Type = "numeric")
    $charset = if ($Type -eq "alphanumeric") { "23456789ABCDEFGHJKLMNPQRSTUVWXYZ" } else { "0123456789" }
    $bytes = New-Object byte[] $Length
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    $rng.GetBytes($bytes)
    $otp = ""
    for ($i = 0; $i -lt $Length; $i++) {
        $idx = $bytes[$i] % $charset.Length
        $otp += $charset[$idx]
    }
    return $otp
}

# Start HttpListener
$prefix = "http://*:$Port/"
$listener = New-Object System.Net.HttpListener
try {
    $listener.Prefixes.Add($prefix)
    $listener.Start()
}
catch {
    # If wildcard binding requires admin, fall back to localhost
    $prefix = "http://localhost:$Port/"
    $listener = New-Object System.Net.HttpListener
    $listener.Prefixes.Add($prefix)
    $listener.Start()
}

# Clear-Host
Write-Host "==========================================================================" -ForegroundColor Cyan
Write-Host "     ⚡ OmniOTP Cloud - Universal OTP & SMS Platform Engine              " -ForegroundColor Yellow
Write-Host "     Powered by httpSMS Android Gateway                                   " -ForegroundColor White
Write-Host "==========================================================================" -ForegroundColor Cyan
Write-Host " [✓] Server listening on : $prefix" -ForegroundColor Green
Write-Host " [✓] Default Platform Key: $PlatformApiKey" -ForegroundColor Green
Write-Host " [✓] httpSMS Gateway From : $GatewayPhone" -ForegroundColor Green
Write-Host " [✓] CORS Enabled for all Android apps, Websites, and Curl clients" -ForegroundColor White
Write-Host "--------------------------------------------------------------------------"
Write-Host " Endpoints Ready:" -ForegroundColor Yellow
Write-Host "   • POST /api/v1/otp/send       - Send OTP code via SMS"
Write-Host "   • POST /api/v1/otp/verify     - Verify user OTP code"
Write-Host "   • POST /api/v1/sms/send       - Send direct transactional SMS"
Write-Host "   • POST /api/v1/sms/bulk       - Send bulk SMS"
Write-Host "   • GET  /api/v1/health         - Check gateway health"
Write-Host "   • GET  /api/v1/logs           - Get recent dispatch audit logs"
Write-Host "--------------------------------------------------------------------------"
Write-Host " Press Ctrl+C in this console to stop server.`n" -ForegroundColor DarkGray

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        # Add CORS headers to all responses
        $response.Headers.Add("Access-Control-Allow-Origin", "*")
        $response.Headers.Add("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        $response.Headers.Add("Access-Control-Allow-Headers", "Content-Type, Authorization, x-api-key, Accept")
        $response.ContentType = "application/json; charset=utf-8"

        # Handle Preflight OPTIONS
        if ($request.HttpMethod -eq "OPTIONS") {
            $response.StatusCode = 204
            $response.Close()
            continue
        }

        $path = $request.Url.AbsolutePath.ToLower().TrimEnd('/')
        $method = $request.HttpMethod.ToUpper()

        # Static file handler for Web Dashboard
        if (-not $path.StartsWith("/api/")) {
            $relPath = if ([string]::IsNullOrWhiteSpace($path) -or $path -eq "/") { "index.html" } else { $request.Url.AbsolutePath.TrimStart('/') }
            $localFile = Join-Path $PSScriptRoot $relPath
            if (Test-Path $localFile -PathType Leaf) {
                $ext = [System.IO.Path]::GetExtension($localFile).ToLower()
                switch ($ext) {
                    ".html" { $response.ContentType = "text/html; charset=utf-8" }
                    ".css"  { $response.ContentType = "text/css; charset=utf-8" }
                    ".js"   { $response.ContentType = "application/javascript; charset=utf-8" }
                    ".json" { $response.ContentType = "application/json; charset=utf-8" }
                    ".png"  { $response.ContentType = "image/png" }
                    ".svg"  { $response.ContentType = "image/svg+xml" }
                    default { $response.ContentType = "application/octet-stream" }
                }
                $fileBytes = [System.IO.File]::ReadAllBytes($localFile)
                $response.StatusCode = 200
                $response.ContentLength64 = $fileBytes.Length
                $response.OutputStream.Write($fileBytes, 0, $fileBytes.Length)
                $response.Close()
                continue
            }
        }

        # Read JSON body if present
        $bodyJson = ""
        $body = @{}
        if ($request.HasEntityBody) {
            $reader = New-Object System.IO.StreamReader($request.InputStream, [System.Text.Encoding]::UTF8)
            $bodyJson = $reader.ReadToEnd()
            if (-not [string]::IsNullOrWhiteSpace($bodyJson)) {
                try {
                    $body = $bodyJson | ConvertFrom-Json
                } catch {
                    $body = @{}
                }
            }
        }

        # Check API Key Authentication for protected endpoints
        $apiKeyHeader = $request.Headers["x-api-key"]
        $authHeader = $request.Headers["Authorization"]
        $clientKey = if ($apiKeyHeader) { $apiKeyHeader.Trim() } elseif ($authHeader -and $authHeader.StartsWith("Bearer ")) { $authHeader.Substring(7).Trim() } else { "" }

        # Route Handler
        $responseObj = @{}
        $statusCode = 200

        try {
            # 1. Health Check
            if ($path -eq "/api/v1/health" -or $path -eq "" -or $path -eq "/api/v1") {
                $responseObj = @{
                    status       = "healthy"
                    platform     = "OmniOTP Cloud Universal Gateway"
                    engine       = "httpSMS Android Gateway"
                    gateway_from = $GatewayPhone
                    time         = (Get-Date).ToString("o")
                    endpoints    = @{
                        send_otp   = "POST /api/v1/otp/send"
                        verify_otp = "POST /api/v1/otp/verify"
                        send_sms   = "POST /api/v1/sms/send"
                        bulk_sms   = "POST /api/v1/sms/bulk"
                    }
                }
            }
            # 2. Check Auth for remaining endpoints
            elseif (-not ($Global:ValidKeys -contains $clientKey) -and $clientKey -ne $PlatformApiKey -and -not $clientKey.StartsWith("sk_live_")) {
                $statusCode = 401
                $responseObj = @{
                    success = $false
                    error   = "Unauthorized: Missing or invalid API key. Pass 'x-api-key: sk_live_...' or 'Authorization: Bearer sk_live_...'"
                }
            }
            # 3. Send OTP Endpoint
            elseif ($path -eq "/api/v1/otp/send" -and $method -eq "POST") {
                $phone = Format-PhoneNumber -Phone $body.phone
                if (-not $phone) {
                    $statusCode = 400
                    $responseObj = @{ success = $false; error = "Field 'phone' is required (e.g. +919876543210)" }
                }
                else {
                    $otpLength = if ($body.length) { [int]$body.length } else { 6 }
                    $otpType = if ($body.type) { $body.type } else { "numeric" }
                    $expiryMins = if ($body.expiry_minutes) { [int]$body.expiry_minutes } else { 5 }
                    $appName = if ($body.app_name) { $body.app_name } else { "OmniOTP" }

                    $otpCode = Generate-SecureOTP -Length $otpLength -Type $otpType
                    $sessionId = "sess_" + [Guid]::NewGuid().ToString("N").Substring(0, 16)
                    $expiresAt = (Get-Date).AddMinutes($expiryMins)

                    # Template compilation
                    $template = if ($body.template) { $body.template } else { "Your verification code for {{app_name}} is {{otp}}. Valid for {{expiry}} minutes. Do not share." }
                    $messageText = $template.Replace("{{otp}}", $otpCode).Replace("{{expiry}}", $expiryMins.ToString()).Replace("{{app_name}}", $appName).Replace("{{phone}}", $phone)

                    Log-Message -Msg "Sending OTP to $phone (Code: $otpCode, Session: $sessionId)" -Type "INFO"

                    # Dispatch via httpSMS
                    $dispatchResult = Send-HttpSMSDirect -To $phone -Content $messageText

                    if ($dispatchResult.Success) {
                        # Save session state
                        $Global:Sessions[$sessionId] = @{
                            sessionId    = $sessionId
                            phone        = $phone
                            otp          = $otpCode
                            expiresAt    = $expiresAt
                            attemptsLeft = 3
                            verified     = $false
                            createdAt    = Get-Date
                        }

                        # Save log entry
                        $logEntry = @{
                            id        = "log_" + [Guid]::NewGuid().ToString("N").Substring(0, 8)
                            timestamp = (Get-Date).ToString("o")
                            type      = "OTP_SENT"
                            phone     = $phone
                            code      = $otpCode
                            status    = "SENT"
                            channel   = "httpSMS"
                            sessionId = $sessionId
                        }
                        [void]$Global:Logs.Add($logEntry)

                        $responseObj = @{
                            success            = $true
                            session_id         = $sessionId
                            phone              = $phone
                            expires_in_seconds = ($expiryMins * 60)
                            expires_at         = $expiresAt.ToString("o")
                            message            = "OTP dispatched successfully via httpSMS"
                        }
                    }
                    else {
                        $statusCode = 502
                        $responseObj = @{
                            success = $false
                            error   = "httpSMS Gateway dispatch failed: $($dispatchResult.Error)"
                        }
                    }
                }
            }
            # 4. Verify OTP Endpoint
            elseif ($path -eq "/api/v1/otp/verify" -and $method -eq "POST") {
                $userOtp = if ($body.otp) { $body.otp.ToString().Trim() } else { "" }
                $sessionId = if ($body.session_id) { $body.session_id.ToString().Trim() } else { "" }
                $phone = Format-PhoneNumber -Phone $body.phone

                if (-not $userOtp) {
                    $statusCode = 400
                    $responseObj = @{ success = $false; verified = $false; error = "Field 'otp' is required" }
                }
                else {
                    # Locate session by sessionId or phone
                    $targetSession = $null
                    if ($sessionId -and $Global:Sessions.ContainsKey($sessionId)) {
                        $targetSession = $Global:Sessions[$sessionId]
                    }
                    elseif ($phone) {
                        # Find latest active session for this phone
                        foreach ($key in $Global:Sessions.Keys) {
                            $s = $Global:Sessions[$key]
                            if ($s.phone -eq $phone -and -not $s.verified) {
                                if ($targetSession -eq $null -or $s.createdAt -gt $targetSession.createdAt) {
                                    $targetSession = $s
                                }
                            }
                        }
                    }

                    if ($null -eq $targetSession) {
                        $statusCode = 404
                        $responseObj = @{ success = $false; verified = $false; error = "No active OTP verification session found for this phone or session_id." }
                    }
                    elseif ($targetSession.verified) {
                        $responseObj = @{ success = $true; verified = $true; message = "This OTP was already verified previously." }
                    }
                    elseif ((Get-Date) -gt $targetSession.expiresAt) {
                        $statusCode = 400
                        $responseObj = @{ success = $false; verified = $false; error = "OTP has expired. Please request a new code." }
                    }
                    elseif ($targetSession.attemptsLeft -le 0) {
                        $statusCode = 429
                        $responseObj = @{ success = $false; verified = $false; error = "Maximum verification attempts exceeded. Session locked for security." }
                    }
                    elseif ($targetSession.otp -eq $userOtp) {
                        $targetSession.verified = $true
                        Log-Message -Msg "OTP Verified successfully for $($targetSession.phone)!" -Type "SUCCESS"

                        $logEntry = @{
                            id        = "log_" + [Guid]::NewGuid().ToString("N").Substring(0, 8)
                            timestamp = (Get-Date).ToString("o")
                            type      = "OTP_VERIFIED"
                            phone     = $targetSession.phone
                            code      = $userOtp
                            status    = "VERIFIED"
                            sessionId = $targetSession.sessionId
                        }
                        [void]$Global:Logs.Add($logEntry)

                        $responseObj = @{
                            success   = $true
                            verified  = $true
                            phone     = $targetSession.phone
                            message   = "OTP verified successfully! Access granted."
                        }
                    }
                    else {
                        $targetSession.attemptsLeft--
                        Log-Message -Msg "Incorrect OTP entered for $($targetSession.phone). Attempts remaining: $($targetSession.attemptsLeft)" -Type "WARN"

                        $statusCode = 400
                        $responseObj = @{
                            success       = $false
                            verified      = $false
                            error         = "Invalid OTP code entered."
                            attempts_left = $targetSession.attemptsLeft
                        }
                    }
                }
            }
            # 5. Direct SMS Send Endpoint
            elseif ($path -eq "/api/v1/sms/send" -and $method -eq "POST") {
                $phone = Format-PhoneNumber -Phone $body.phone
                $content = $body.message
                if (-not $phone -or -not $content) {
                    $statusCode = 400
                    $responseObj = @{ success = $false; error = "Fields 'phone' and 'message' are required." }
                }
                else {
                    $dispatch = Send-HttpSMSDirect -To $phone -Content $content
                    if ($dispatch.Success) {
                        $responseObj = @{
                            success = $true
                            phone   = $phone
                            message = "SMS dispatched successfully via httpSMS"
                            data    = $dispatch.Data
                        }
                    } else {
                        $statusCode = 502
                        $responseObj = @{ success = $false; error = $dispatch.Error }
                    }
                }
            }
            # 6. Bulk SMS Send Endpoint
            elseif ($path -eq "/api/v1/sms/bulk" -and $method -eq "POST") {
                $phones = $body.phones
                $content = $body.message
                $delayMs = if ($body.delay_ms) { [int]$body.delay_ms } else { 1000 }

                if (-not $phones -or $phones.Count -eq 0 -or -not $content) {
                    $statusCode = 400
                    $responseObj = @{ success = $false; error = "Fields 'phones' (array) and 'message' (string) are required." }
                }
                else {
                    $results = @()
                    $successCount = 0
                    $failCount = 0

                    foreach ($p in $phones) {
                        $formatted = Format-PhoneNumber -Phone $p
                        if ($formatted) {
                            $res = Send-HttpSMSDirect -To $formatted -Content $content
                            if ($res.Success) {
                                $successCount++
                                $results += @{ phone = $formatted; status = "SENT" }
                            } else {
                                $failCount++
                                $results += @{ phone = $formatted; status = "FAILED"; error = $res.Error }
                            }
                            Start-Sleep -Milliseconds $delayMs
                        }
                    }

                    $responseObj = @{
                        success       = $true
                        total         = $phones.Count
                        sent_count    = $successCount
                        failed_count  = $failCount
                        details       = $results
                    }
                }
            }
            # 7. Audit Logs Endpoint
            elseif ($path -eq "/api/v1/logs" -and $method -eq "GET") {
                $responseObj = @{
                    success = $true
                    count   = $Global:Logs.Count
                    logs    = $Global:Logs
                }
            }
            else {
                $statusCode = 404
                $responseObj = @{ success = $false; error = "Endpoint not found: $method $path" }
            }
        }
        catch {
            $statusCode = 500
            $responseObj = @{ success = $false; error = $_.Exception.Message }
        }

        # Send JSON response
        $response.StatusCode = $statusCode
        $jsonOut = $responseObj | ConvertTo-Json -Depth 6 -Compress
        $buffer = [System.Text.Encoding]::UTF8.GetBytes($jsonOut)
        $response.ContentLength64 = $buffer.Length
        $response.OutputStream.Write($buffer, 0, $buffer.Length)
        $response.Close()
    }
}
finally {
    $listener.Stop()
    $listener.Close()
    Write-Host "`nServer stopped." -ForegroundColor Yellow
}
