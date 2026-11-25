@echo off
title MusicMatch Jukebox
cd /d "%~dp0"

echo ======================================================
echo   Iniciando MusicMatch Jukebox Web Server...
echo ======================================================

:: Verificar se o Python esta instalado no PATH
where python >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo [ERRO] O Python nao foi encontrado no seu Windows!
    echo.
    echo Para corrigir:
    echo 1. Baixe o instalador em https://www.python.org/
    echo 2. Na instalacao, MARQUE a caixa "Add Python to PATH".
    echo.
    pause
    exit /b
)

:: Tenta iniciar em modo silencioso (segundo plano sem janela preta) com pythonw
where pythonw >nul 2>&1
if %errorlevel% equ 0 (
    start "" pythonw server.py 8081
) else (
    start "MusicMatch Server" python server.py 8081
)

:: Aguarda 1 segundo para o servidor subir e abre no navegador padrao
timeout /t 1 >nul
start http://localhost:8081

echo.
echo [OK] MusicMatch Jukebox ativo em http://localhost:8081!
echo Para usar no tablet, acesse o IP deste computador com a porta :8081.
echo.
timeout /t 2 >nul
exit
