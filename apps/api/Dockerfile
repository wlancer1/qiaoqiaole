FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api ./apps/api

RUN npm ci --omit=dev

ENV PORT=3000
ENV SQLITE_PATH=/data/qiaoqiaole.sqlite

EXPOSE 3000

CMD ["node", "apps/api/src/server.mjs"]
