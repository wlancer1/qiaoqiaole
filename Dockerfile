FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json tsconfig.json tsconfig.node.json vitest.config.ts ./
COPY apps ./apps
COPY packages ./packages

RUN npm ci
RUN npm run build:web
RUN VITE_BASE=/h5/ npm run build:h5

FROM nginx:1.27-alpine AS runtime

COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/web /usr/share/nginx/html
COPY --from=build /app/dist/h5 /usr/share/nginx/html/h5

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
