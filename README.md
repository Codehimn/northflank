# Playwright + noVNC para Northflank v3

Incluye:

- Chromium visible controlado por Playwright
- noVNC para controlar el navegador remotamente
- screenshots cada minuto
- carga opcional de `cookies.json`
- carga opcional de `localStorage.json`
- carga opcional de `storageState.json`
- normalización automática de `sameSite` en cookies
- guardado automático de sesión
- guardado automático de localStorage
- restauración automática desde `/data`
- detección de navegación a zonas autenticadas
- reinicio automático de Chromium si se cae

## Puertos

### 3000
- `/`
- `/screenshot.jpg`
- `/status`
- `/save-state`
- `/restart-browser`

### 6080
noVNC.

Ejemplo:

`/vnc.html?autoconnect=true&resize=scale`

## Variables recomendadas en Northflank

- `TARGET_URL=https://rollercoin.com/sign-in`
- `VNC_PASSWORD=UNA_CLAVE_FUERTE`
- `PORT=3000`
- `PERSISTENT_STATE_PATH=/data/storageState.json`
- `PERSISTENT_LOCAL_STORAGE_PATH=/data/localStorage.json`

## Volumen persistente

Para conservar la sesión entre redeploys/reinicios,
monta un volumen persistente de Northflank en:

`/data`

Sin un volumen persistente, `/data` puede desaparecer cuando
Northflank reemplace el contenedor.

## Guardado automático

Después del login manual mediante noVNC se guardan:

- `/data/storageState.json`
- `/data/localStorage.json`

Se guardan cada minuto y también cuando se detecta navegación
a rutas como `/game`, `/dashboard`, `/marketplace` o `/achievements`.

## Seguridad

Los archivos de sesión pueden dar acceso a la cuenta.

No subas al repositorio público:

- `cookies.json`
- `localStorage.json`
- `storageState.json`

Ya están incluidos en `.gitignore`.
