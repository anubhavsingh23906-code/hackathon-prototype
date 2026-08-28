@echo off
cd /d "%~dp0"
echo Starting Healthcare Emergency Connect...
echo Frontend: http://localhost:5173
echo Backend:  http://localhost:8080
npm.cmd run dev
