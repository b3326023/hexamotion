@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\Launch-HEXAMOTION.ps1"
if errorlevel 1 pause