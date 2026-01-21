@echo off
echo Starting Domain Update Process...

echo 1. Fetching latest domains from Contract...
node fetch_all_domains.js

echo 2. Merging updates...
node merge_domains.js

echo 3. Committed and Pushing to GitHub...
git add public/known_domains.json
git commit -m "Auto-update domains"
git push origin main

echo Done!
pause
