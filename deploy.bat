@echo off
cd /d "C:\Users\SAM\Documents\Umpiring app project"
echo Deploying Cricket Umpire to Firebase Hosting...
echo.
call firebase deploy --only hosting
echo.
echo ===== DEPLOY FINISHED (exit code %errorlevel%) =====
pause
