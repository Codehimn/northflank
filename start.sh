#!/bin/bash
set -e

export DISPLAY=:99

SWAP_SIZE="${SWAP_SIZE:-16G}"
SWAP_FILE="${SWAP_FILE:-/swapfile}"

echo "=== Intentando habilitar swap ==="
echo "SWAP_SIZE=$SWAP_SIZE"
echo "SWAP_FILE=$SWAP_FILE"

if grep -q "^${SWAP_FILE}[[:space:]]" /proc/swaps 2>/dev/null; then
    echo "Swap ya activo en $SWAP_FILE"
else
    # Elimina un archivo incompleto anterior.
    rm -f "$SWAP_FILE" 2>/dev/null || true

    if command -v fallocate >/dev/null 2>&1; then
        if fallocate -l "$SWAP_SIZE" "$SWAP_FILE"; then
            chmod 600 "$SWAP_FILE"

            if mkswap "$SWAP_FILE"; then
                if swapon "$SWAP_FILE"; then
                    echo "=== Swap habilitado correctamente ==="
                    swapon --show || true
                    free -h || true
                else
                    echo "ADVERTENCIA: swapon fue rechazado."
                    echo "El host probablemente no permite CAP_SYS_ADMIN dentro del contenedor."
                    echo "Eliminando $SWAP_FILE para no consumir disco."
                    rm -f "$SWAP_FILE" || true
                fi
            else
                echo "ADVERTENCIA: mkswap falló."
                rm -f "$SWAP_FILE" || true
            fi
        else
            echo "ADVERTENCIA: no se pudo reservar $SWAP_SIZE para swap."
            echo "Puede faltar espacio en disco."
            rm -f "$SWAP_FILE" || true
        fi
    else
        echo "ADVERTENCIA: fallocate no está disponible."
    fi
fi

echo "=== Estado de memoria ==="
free -h || true
cat /proc/swaps || true

echo "=== Iniciando Xvfb ==="

Xvfb :99 \
  -screen 0 1280x720x24 \
  -ac \
  -nolisten tcp &

sleep 2

echo "=== DISPLAY=$DISPLAY ==="

export TERMINAL=xterm

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
