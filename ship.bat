@echo off
cd /d "C:\Users\SAM\Documents\Umpiring app project"
echo Shipping latest changes to GitHub (auto-deploys to Firebase)...
echo.
git add -A
git commit -m "Update from Cowork"
git push origin main
echo.
echo ===== PUSHED. GitHub Actions will deploy in ~1 minute. =====
pause
