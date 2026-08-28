# Playwright + noVNC para Northflank

Contenedor con:

- Chromium visible controlado por Playwright
- Xvfb
- Fluxbox
- x11vnc
- noVNC
- screenshots cada minuto
- carga opcional de cookies.json
- carga opcional de localStorage.json
- carga/guardado de storageState

## Puertos

- 3000: API/screenshot
- 6080: noVNC

## Variables recomendadas en Northflank

- `TARGET_URL=https://rollercoin.com/sign-in`
- `VNC_PASSWORD=pon-una-clave-fuerte`
- `PORT=3000`
- `PERSISTENT_STATE_PATH=/data/storageState.json`

## Endpoints

- `/` o `/screenshot.jpg`
- `/status`
- `/save-state`

## noVNC

Abre el puerto 6080 como HTTP público.

Normalmente puedes entrar con:

`/vnc.html?autoconnect=true&resize=scale`

## Seguridad

No subas cookies, tokens ni storageState a repositorios públicos.
Los archivos reales están ignorados mediante `.gitignore`.
