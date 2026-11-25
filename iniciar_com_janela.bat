@echo off
title MusicMatch Jukebox - Terminal de Logs
cd /d "%~dp0"

echo ======================================================
echo   MusicMatch Jukebox - Modo Terminal (com Logs)
echo ======================================================
echo Pressione Ctrl+C para encerrar o servidor.
echo.

python server.py 8081
pause
