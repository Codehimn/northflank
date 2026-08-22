FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json ./

RUN npm install \
    && npx playwright install --with-deps chromium \
    && npm cache clean --force

COPY app.js ./

ENV PORT=3000
ENV TARGET_URL=https://rollercoin.com/sign-in

EXPOSE 3000

CMD ["node", "app.js"]
