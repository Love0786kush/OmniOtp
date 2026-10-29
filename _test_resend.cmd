@echo off
cd /d c:\Users\XXX\Desktop\test
curl.exe -s -X POST http://localhost:5000/api/v1/otp/send -H "x-api-key: sk_live_localdev_0123456789abcdef" -H "Content-Type: application/json" -d "{\"phone\":\"7852081659\",\"simulate\":true}"
echo.
echo ---SEND2---
curl.exe -s -X POST http://localhost:5000/api/v1/otp/send -H "x-api-key: sk_live_localdev_0123456789abcdef" -H "Content-Type: application/json" -d "{\"phone\":\"7852081659\",\"simulate\":true}"
echo.
echo DONE