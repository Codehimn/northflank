FROM node:22-bookworm-slim

WORKDIR /app

# X11 + VNC + escritorio liviano + utilidades mínimas.
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

EXPOSE 3000
EXPOSE 6080

CMD ["/app/start.sh"]
