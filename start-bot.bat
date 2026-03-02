@echo off
echo Starting ELORA Discord Bot...

REM Navigate to bot directory
cd /d "C:\Users\OMAR\Desktop\ELORA"

REM Try to resurrect saved PM2 processes first
pm2 resurrect

REM Wait 3 seconds to see if resurrect worked
timeout /t 3 /nobreak >nul

REM Check if bot is running, if not start it manually
pm2 list | findstr "elora" | findstr "online" >nul
if errorlevel 1 (
    echo Bot not running, starting manually...
    pm2 start src/bot.js --name elora
    pm2 save
) else (
    echo Bot already running!
)

echo ELORA Bot startup complete!
REM Keep window open for 3 seconds to show status
timeout /t 3 /nobreak >nul
exit
