@echo off
cd /d "%~dp0"
"%SystemRoot%\System32\wscript.exe" //nologo "%~dp0CREATE_SHORTCUTS.vbs"
exit /b 0
