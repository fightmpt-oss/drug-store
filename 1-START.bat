@echo off
cd /d "%~dp0"

rem 1) Windowless start (server opens the browser itself when ready)
if exist "%~dp0START_SILENT.vbs" (
    start "" "%SystemRoot%\System32\wscript.exe" //nologo "%~dp0START_SILENT.vbs"
    exit /b 0
)

rem 2) Fallback: start server in a minimized console window
set "NODE_EXE=%~dp0bin\node.exe"
if not exist "%NODE_EXE%" set "NODE_EXE=node"
start "JHCIS Drug Stock Server" /min "%NODE_EXE%" "%~dp0backend\src\server.js" --open
exit /b 0
