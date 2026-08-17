FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api ./apps/api

RUN npm ci --omit=dev --ignore-scripts

COPY docker/better_sqlite3.node \
  /app/node_modules/better-sqlite3/build/Release/better_sqlite3.node

ENV PORT=3000
ENV SQLITE_PATH=/data/qiaoqiaole.sqlite

EXPOSE 3000

CMD ["node", "apps/api/src/server.mjs"]