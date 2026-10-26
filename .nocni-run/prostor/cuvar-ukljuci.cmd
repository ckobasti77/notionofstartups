@echo off
rem Ukljucuje CUVARA: Windows zakazani zadatak koji na 15 min proverava da li je run pukao usred koraka i ponovo ga pokrece.
rem Iskljucuje se sa cuvar-iskljuci.cmd; sam se uklanja kad je run gotov.
title NOCNI RUN - cuvar
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0cuvar.ps1" -Install
echo.
pause
