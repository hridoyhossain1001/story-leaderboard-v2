@echo off
title Story Protocol - SUPER SLOW SCANNER
color 0E
echo ==============================================
echo   SUPER SLOW MODE (2 Seconds per Wallet)
echo   Searching for missed .ip domains...
echo ==============================================
echo.
node reimport_slow.js
echo.
echo Scan Finished.
pause
