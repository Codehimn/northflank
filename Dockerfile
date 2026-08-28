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
    util-linux \
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

# Swap configurable
ENV SWAP_SIZE=16G
ENV SWAP_FILE=/swapfile

EXPOSE 3000
EXPOSE 6080

CMD ["/app/start.sh"]
