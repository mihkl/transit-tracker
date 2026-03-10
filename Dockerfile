FROM node:25-alpine AS builder

# curl + unzip needed by the GTFS download script at build time
RUN apk add --no-cache curl unzip

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm run build

# ---

FROM platformatic/node-caged:25-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# public/ includes gtfs-preprocessed/ and sw.js generated during build
COPY --from=builder /app/public ./public
COPY --from=builder /app/drizzle ./drizzle

# Standalone server bundle
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000

CMD ["node", "server.js"]
