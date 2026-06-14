@echo off
cd /d "%~dp0\.."
call npm run dev >> ".codex-dev-live.log" 2>&1
