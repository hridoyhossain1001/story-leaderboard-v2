@echo off
echo ==========================================
echo   Story Protocol Leaderboard - Local Host
echo ==========================================
echo.
echo 1. Starting Background Scanner (New Window)...
start "Story Scanner" node scan_domains.js
echo.
echo 2. Starting Web Server...
echo    Access at: http://localhost:3000
echo.
npm start
pause
