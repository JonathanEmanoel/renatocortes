@echo off
cd /d "%~dp0frontend"
echo Starting Renato Cortes frontend on http://localhost:3000
npm.cmd run dev -- --hostname 0.0.0.0 --port 3000
