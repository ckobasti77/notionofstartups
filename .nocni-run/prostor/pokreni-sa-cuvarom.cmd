@echo off
rem Ukljuci CUVARA pa pokreni run (isto kao: cuvar-ukljuci.cmd, pa pokreni.cmd). Prozor ostavi otvoren.
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0cuvar.ps1" -Install
call "%~dp0pokreni.cmd" %*
