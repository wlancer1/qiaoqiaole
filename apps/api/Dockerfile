FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api ./apps/api

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && npm ci --omit=dev \
    && rm -rf /var/lib/apt/lists/*

ENV PORT=3000
ENV SQLITE_PATH=/data/qiaoqiaole.sqlite

EXPOSE 3000

CMD ["node", "apps/api/src/server.mjs"]