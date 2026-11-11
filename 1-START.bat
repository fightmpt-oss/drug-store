@echo off
cd /d "%~dp0"
start "" "%SystemRoot%\System32\wscript.exe" //nologo "%~dp0START_SILENT.vbs"
exit /b 0
