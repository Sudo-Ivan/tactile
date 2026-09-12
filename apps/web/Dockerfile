# syntax=docker/dockerfile:1

FROM node:26-alpine AS builder
WORKDIR /app
RUN corepack enable
COPY . .
RUN pnpm dlx turbo prune web --docker

FROM node:26-alpine AS installer
WORKDIR /app
RUN corepack enable
COPY --from=builder /app/out/json/ .
COPY --from=builder /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN pnpm install --frozen-lockfile
COPY --from=builder /app/out/full/ .
RUN pnpm run build --filter=web

FROM nginx:stable-alpine AS runner
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=installer /app/apps/web/build /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
