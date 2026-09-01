PLAYWRIGHT + noVNC LEAN v4

Sobrescribe:
- Dockerfile
- start.sh
- app.js
- package.json

Cambios:
- Eliminado completamente el swap.
- Resolución 1024x576 por defecto.
- BLOCK_IMAGES=true por defecto.
- Bloqueo de imágenes, media, fuentes, analytics, trackers y widgets comunes.
- Screenshot por Chrome DevTools Protocol (CDP), evitando la espera de fuentes de page.screenshot().
- JPEG quality 45.
- storageState/localStorage se guardan cada 2 minutos.
- Reinicio automático si la pestaña o Chromium crashean.

Variables opcionales:
BLOCK_IMAGES=true
VIEWPORT_WIDTH=1024
VIEWPORT_HEIGHT=576
SCREENSHOT_INTERVAL_MS=60000
SAVE_INTERVAL_MS=120000

Si quieres volver a ver imágenes:
BLOCK_IMAGES=false
