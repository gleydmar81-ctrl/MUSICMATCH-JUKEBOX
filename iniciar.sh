#!/bin/bash
# Iniciar MusicMatch Jukebox Web
systemctl --user start musicmatch.service
xdg-open http://localhost:8081 2>/dev/null || sensible-browser http://localhost:8081 2>/dev/null
echo "MusicMatch Jukebox iniciado em http://localhost:8081"
