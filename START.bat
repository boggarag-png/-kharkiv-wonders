@echo off
cd /d "%~dp0"
start "7 wonders server" /min powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1"
