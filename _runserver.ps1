Stop-Process -Id 22900 -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2
$env:PATH = 'c:\Users\XXX\node-v18.20.4-win-x64;' + $env:PATH
$env:PORT='5000'
$env:HTTPSMS_API_KEY='pk_JJwFKTe9zE8E_dwF-GsMjbo440Dnz-QC3ZubkHKMhGYzIIYQrC_6NK7FHr1d0fLo'
$env:HTTPSMS_FROM='+917852081659'
$env:SIMULATE_SMS='true'
if (Test-Path 'c:\Users\XXX\Desktop\test\server.log') { Remove-Item 'c:\Users\XXX\Desktop\test\server.log' }
Start-Process -FilePath 'c:\Users\XXX\node-v18.20.4-win-x64\node.exe' -ArgumentList 'c:\Users\XXX\Desktop\test\server.js' -WorkingDirectory 'c:\Users\XXX\Desktop\test' -WindowStyle Hidden -RedirectStandardOutput 'c:\Users\XXX\Desktop\test\server.log' -RedirectStandardError 'c:\Users\XXX\Desktop\test\server-err.log' -PassThru
'STARTED'