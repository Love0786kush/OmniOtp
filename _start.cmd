@echo off
set PATH=%USERPROFILE%\node-v18.20.4-win-x64;%PATH%
cd /d c:\Users\XXX\Desktop\test
set PORT=5000
set HTTPSMS_API_KEY=pk_JJwFKTe9zE8E_dwF-GsMjbo440Dnz-QC3ZubkHKMhGYzIIYQrC_6NK7FHr1d0fLo
set HTTPSMS_FROM=+917852081659
set SIMULATE_SMS=true
set MASTER_API_KEY=sk_live_localdev_0123456789abcdef
del /q server.log 2>nul
start /b "" cmd /c "node server.js > server.log 2>&1"
exit 0
