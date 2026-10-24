@echo off
rem Iskljucuje CUVARA (brise zakazani zadatak NocniRun-Cuvar-...). Run ne dira.
title NOCNI RUN - cuvar
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0cuvar.ps1" -Uninstall
echo.
pause
