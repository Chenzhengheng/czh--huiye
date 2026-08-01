@echo off
cd /d "%~dp0"
start "" powershell.exe -NoLogo -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "%~dp0scripts\start-huiye-ui.ps1"
