<?php
/**
 * OmniOTP Cloud - Universal OTP & SMS PHP Gateway
 * Drop this file into your Apache, Nginx, or cPanel public_html directory!
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, x-api-key');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$HTTPSMS_KEY = 'YOUR_HTTPSMS_API_KEY';
$GATEWAY_FROM = '+917852081659';
$PLATFORM_KEY = 'sk_live_change_me_in_production';

// Session file directory
$sessionDir = sys_get_temp_dir() . '/omni_otp_sessions';
if (!is_dir($sessionDir)) {
    @mkdir($sessionDir, 0777, true);
}

// Read JSON input
$input = json_decode(file_get_contents('php://input'), true) ?? [];
$headers = getallheaders();
$apiKey = $headers['x-api-key'] ?? $headers['X-Api-Key'] ?? '';
if (empty($apiKey) && isset($headers['Authorization'])) {
    $apiKey = preg_replace('/^Bearer\s+/i', '', $headers['Authorization']);
}

$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$action = basename($uri);

// Health check
if ($action === 'health' || $action === 'api.php') {
    echo json_encode([
        'status' => 'healthy',
        'platform' => 'OmniOTP PHP Gateway',
        'gateway_from' => $GATEWAY_FROM,
        'time' => date('c')
    ]);
    exit;
}

// Auth check
$isValidPlatformKey = function($key) {
    return (bool) preg_match('/^sk_live_[A-Za-z0-9_-]{12,}$/', $key);
};
if ($apiKey !== $PLATFORM_KEY && !$isValidPlatformKey($apiKey)) {
    http_response_code(401);
    echo json_encode(['success' => false, 'error' => 'Unauthorized: Invalid API Key']);
    exit;
}

function sendHttpSMS($to, $content, $from, $key) {
    $ch = curl_init('https://api.httpsms.com/v1/messages/send');
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_HTTPHEADER => [
            'x-api-key: ' . trim($key),
            'Content-Type: application/json',
            'Accept: application/json'
        ],
        CURLOPT_POSTFIELDS => json_encode([
            'to' => $to,
            'from' => $from,
            'content' => $content,
            'request_id' => 'req_php_' . bin2hex(random_bytes(6))
        ])
    ]);
    $res = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return ['code' => $httpCode, 'data' => json_decode($res, true)];
}

function normalizePhone($p) {
    $clean = preg_replace('/[\s\-\(\)]/', '', $p);
    if (str_starts_with($clean, '00')) $clean = '+' . substr($clean, 2);
    if (str_starts_with($clean, '+')) return $clean;
    if (str_starts_with($clean, '0') && strlen($clean) === 11) return '+91' . substr($clean, 1);
    if (preg_match('/^\d{10}$/', $clean)) return '+91' . $clean;
    if (preg_match('/^91\d{10}$/', $clean)) return '+' . $clean;
    if (!str_starts_with($clean, '+')) return '+' . $clean;
    return $clean;
}

// 1. Send OTP
if ($action === 'send' || str_ends_with($uri, '/otp/send')) {
    $phone = normalizePhone($input['phone'] ?? '');
    $length = (int)($input['length'] ?? 6);
    $expiryMinutes = (int)($input['expiry_minutes'] ?? 5);
    $appName = $input['app_name'] ?? 'OmniOTP';

    if (!$phone) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Phone number is required']);
        exit;
    }

    $otp = '';
    for ($i = 0; $i < $length; $i++) {
        $otp .= random_int(0, 9);
    }
    $sessionId = 'sess_' . bin2hex(random_bytes(8));
    $expiresAt = time() + ($expiryMinutes * 60);

    $template = $input['template'] ?? "Your verification code for {{app_name}} is {{otp}}. Valid for {{expiry}} mins.";
    $msg = str_replace(['{{otp}}', '{{expiry}}', '{{app_name}}'], [$otp, $expiryMinutes, $appName], $template);

    $dispatch = sendHttpSMS($phone, $msg, $GATEWAY_FROM, $HTTPSMS_KEY);
    if ($dispatch['code'] >= 200 && $dispatch['code'] < 300) {
        $sessionData = [
            'sessionId' => $sessionId,
            'phone' => $phone,
            'otp' => $otp,
            'expiresAt' => $expiresAt,
            'attemptsLeft' => 3
        ];
        file_put_contents("$sessionDir/$sessionId.json", json_encode($sessionData));
        echo json_encode([
            'success' => true,
            'session_id' => $sessionId,
            'phone' => $phone,
            'expires_in_seconds' => $expiryMinutes * 60,
            'message' => 'OTP dispatched successfully'
        ]);
    } else {
        http_response_code(502);
        echo json_encode(['success' => false, 'error' => $dispatch['data']['message'] ?? 'SMS dispatch failed']);
    }
    exit;
}

// 2. Verify OTP
if ($action === 'verify' || str_ends_with($uri, '/otp/verify')) {
    $sessionId = $input['session_id'] ?? '';
    $userOtp = trim($input['otp'] ?? '');
    $sessionFile = "$sessionDir/$sessionId.json";

    if (!$sessionId || !file_exists($sessionFile)) {
        http_response_code(404);
        echo json_encode(['success' => false, 'verified' => false, 'error' => 'Session not found']);
        exit;
    }

    $sess = json_decode(file_get_contents($sessionFile), true);
    if (time() > $sess['expiresAt']) {
        @unlink($sessionFile);
        http_response_code(400);
        echo json_encode(['success' => false, 'verified' => false, 'error' => 'OTP expired']);
        exit;
    }

    if ($sess['otp'] === $userOtp) {
        @unlink($sessionFile);
        echo json_encode(['success' => true, 'verified' => true, 'message' => 'OTP verified successfully']);
    } else {
        $sess['attemptsLeft']--;
        if ($sess['attemptsLeft'] <= 0) {
            @unlink($sessionFile);
            http_response_code(429);
            echo json_encode(['success' => false, 'verified' => false, 'error' => 'Max attempts exceeded']);
        } else {
            file_put_contents($sessionFile, json_encode($sess));
            http_response_code(400);
            echo json_encode(['success' => false, 'verified' => false, 'error' => 'Invalid OTP code', 'attempts_left' => $sess['attemptsLeft']]);
        }
    }
    exit;
}

// 3. Direct SMS
if ($action === 'sms' || str_ends_with($uri, '/sms/send')) {
    $phone = normalizePhone($input['phone'] ?? '');
    $msg = $input['message'] ?? '';
    $dispatch = sendHttpSMS($phone, $msg, $GATEWAY_FROM, $HTTPSMS_KEY);
    echo json_encode($dispatch['data']);
    exit;
}

echo json_encode(['error' => 'Endpoint not found']);
