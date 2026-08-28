@echo off
cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -File scripts\stop-ports.ps1
echo Ports 5173 and 8080 are now free.
