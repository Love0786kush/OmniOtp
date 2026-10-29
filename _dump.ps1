$env:PATH = 'c:\Users\XXX\node-v18.20.4-win-x64;' + $env:PATH
$files = @(
  'c:\Users\XXX\Desktop\test\js\httpsms.js',
  'c:\Users\XXX\Desktop\test\js\otp-manager.js',
  'c:\Users\XXX\Desktop\test\js\app.js',
  'c:\Users\XXX\Desktop\test\js\phone-mockup.js'
)
foreach ($f in $files) {
  try {
    $out = & node --check $f 2>&1
    if ($LASTEXITCODE -eq 0) { Write-Host "OK: $f" } else { Write-Host "FAIL: $f`n$out" }
  } catch {
    Write-Host "ERROR: $f`n$_"
  }
}

