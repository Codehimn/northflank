FROM node:22-bookworm-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    xvfb \
    x11vnc \
    fluxbox \
    novnc \
    websockify \
    procps \
    xterm \
    dbus-x11 \
    && rm -rf /var/lib/apt/lists/*

COPY package.json ./

RUN npm install \
    && npx playwright install --with-deps chromium \
    && npm cache clean --force

COPY . .

RUN chmod +x /app/start.sh

ENV PORT=3000
ENV DISPLAY=:99
ENV TARGET_URL=https://rollercoin.com/sign-in
ENV NODE_OPTIONS=--max-old-space-size=96
ENV PERSISTENT_STATE_PATH=/data/storageState.json
ENV PERSISTENT_LOCAL_STORAGE_PATH=/data/localStorage.json

EXPOSE 3000
EXPOSE 6080

CMD ["/app/start.sh"]
