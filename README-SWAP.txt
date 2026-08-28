SWAP 16 GB - Northflank / Docker

Sobrescribe en tu repo:
- Dockerfile
- start.sh

El script intenta crear 16 GB de swap al arrancar.

Variables opcionales:
SWAP_SIZE=16G
SWAP_FILE=/swapfile

IMPORTANTE:
En plataformas gestionadas como Northflank, swapon suele estar bloqueado
porque requiere privilegios del host (CAP_SYS_ADMIN).

Si swapon falla:
- el script lo informa en logs,
- elimina /swapfile,
- y continúa arrancando Chromium/noVNC.

Además necesitas al menos 16 GB de almacenamiento disponible si el host
permite activar el swap.
