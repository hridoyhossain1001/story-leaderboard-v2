@echo off
title Story Protocol - Missing Wallet Checker
color 0A
echo Starting Deep Scan for Missing Wallets...
node reimport_missing.js
echo.
echo Scan Complete.
pause
