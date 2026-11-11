@echo off
title Close JHCIS Drug Stock
echo ========================================================================
echo   [JHCIS Drug Stock] Stopping System Server...
echo ========================================================================

for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5000" ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)

echo.
echo   [OK] System Server stopped successfully.
echo.
timeout /t 2 >nul
