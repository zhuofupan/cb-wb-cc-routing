@echo off
rem The supervisor owns profile selection (including alwaysStart) and a mutex.
rem Repeated ticks exit immediately when that supervisor is already running.
powershell -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "%~dp0start-workbuddy.ps1" -Watch
