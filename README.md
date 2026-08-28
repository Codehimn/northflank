# Playwright + noVNC para Northflank, versión 2

Esta versión está ajustada para contenedores de RAM limitada.

## Qué incluye

- Chromium visible controlado por Playwright
- Xvfb
- Fluxbox
- x11vnc
- noVNC
- Reinicio automático de Chromium si se cae
- Screenshot cada minuto
- `storageState` guardado cada 5 minutos
- `cookies.json` opcional
- `localStorage.json` opcional
- `storageState.json` opcional

## Puertos

### 3000
HTTP auxiliar:

- `/`
- `/screenshot.jpg`
- `/status`
- `/save-state`
- `/restart-browser`

### 6080
noVNC.

Ejemplo:

`/vnc.html?autoconnect=true&resize=scale`

## Variables Northflank

- `TARGET_URL=https://rollercoin.com/sign-in`
- `VNC_PASSWORD=UNA_CLAVE_FUERTE`
- `PORT=3000`
- `PERSISTENT_STATE_PATH=/data/storageState.json`

## Importante con 400 MB RAM

El escritorio noVNC puede funcionar mientras Chromium sea terminado por falta de RAM.
Si en los logs aparece "Chromium se cerró o fue terminado por el sistema" de forma repetida,
sube el servicio a 512 MB o más.

## Seguridad

No subas cookies, tokens, `localStorage.json` ni `storageState.json`
a un repositorio público.
