#!/bin/bash
set -e

export DISPLAY=:99

echo "=== Iniciando escritorio virtual ==="

Xvfb :99 \
  -screen 0 1280x720x24 \
  -ac \
  -nolisten tcp &

sleep 2

echo "=== Iniciando Fluxbox ==="
fluxbox &

sleep 1

echo "=== Configurando VNC ==="

VNC_PASSWORD="${VNC_PASSWORD:-cambiar123}"

x11vnc -storepasswd "$VNC_PASSWORD" /tmp/vncpasswd

echo "=== Iniciando VNC ==="

x11vnc \
  -display :99 \
  -rfbauth /tmp/vncpasswd \
  -forever \
  -shared \
  -localhost \
  -rfbport 5900 \
  -noxdamage \
  -quiet &

sleep 2

echo "=== Iniciando noVNC ==="

websockify \
  --web=/usr/share/novnc/ \
  0.0.0.0:6080 \
  localhost:5900 &

sleep 2

echo "=== Iniciando Playwright ==="
node /app/app.js
