@echo off
set PATH=%USERPROFILE%\node-v18.20.4-win-x64;%PATH%
cd /d c:\Users\XXX\Desktop\test
echo === LIST GATEWAYS ===
curl.exe -s http://localhost:5000/api/v1/gateways -H "x-api-key: sk_live_localdev_0123456789abcdef"
echo.
