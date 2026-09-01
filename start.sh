#!/bin/bash
set -e

export DISPLAY=:99
export TERMINAL=xterm

WIDTH="${VIEWPORT_WIDTH:-1024}"
HEIGHT="${VIEWPORT_HEIGHT:-576}"

echo "=== Arranque ligero ==="
echo "DISPLAY=$DISPLAY"
echo "Resolucion=${WIDTH}x${HEIGHT}"

echo "=== Memoria inicial ==="
free -h || true

echo "=== Iniciando Xvfb ==="

Xvfb :99 \
  -screen 0 "${WIDTH}x${HEIGHT}x24" \
  -ac \
  -nolisten tcp &

sleep 2

echo "=== Iniciando Fluxbox ==="
fluxbox >/tmp/fluxbox.log 2>&1 &

sleep 1

echo "=== Configurando VNC ==="

VNC_PASSWORD="${VNC_PASSWORD:-cambiar123}"
x11vnc -storepasswd "$VNC_PASSWORD" /tmp/vncpasswd >/dev/null

echo "=== Iniciando x11vnc ==="

x11vnc \
  -display :99 \
  -rfbauth /tmp/vncpasswd \
  -forever \
  -shared \
  -localhost \
  -rfbport 5900 \
  -noxdamage \
  -repeat \
  -quiet &

sleep 1

echo "=== Iniciando noVNC ==="

websockify \
  --web=/usr/share/novnc/ \
  0.0.0.0:6080 \
  localhost:5900 &

sleep 2

echo "=== Procesos gráficos ==="
ps aux | grep -E "Xvfb|fluxbox|x11vnc|websockify" | grep -v grep || true

echo "=== Memoria antes de Chromium ==="
free -m || true

echo "=== Iniciando Playwright ==="
exec node /app/app.js
