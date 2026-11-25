@echo off
title Parar MusicMatch Jukebox
echo ======================================================
echo   Encerrando MusicMatch Jukebox Web Server...
echo ======================================================

powershell -NoProfile -Command "$conn = Get-NetTCPConnection -LocalPort 8081 -ErrorAction SilentlyContinue; if ($conn) { Stop-Process -Id $conn.OwningProcess -Force; Write-Host '[OK] Servidor finalizado com sucesso!' -ForegroundColor Green } else { Write-Host '[INFO] Nenhum servidor ativo na porta 8081.' -ForegroundColor Yellow }"

timeout /t 2 >nul
exit
