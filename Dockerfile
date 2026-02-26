FROM node:25-alpine AS builder

# curl + unzip needed by the GTFS download script at build time
RUN apk add --no-cache curl unzip

WORKDIR /app

COPY package.json ./
RUN npm install

COPY . .
RUN npm run build

# ---

FROM platformatic/node-caged:25-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# public/ includes gtfs-preprocessed/ and sw.js generated during build
COPY --from=builder /app/public ./public

# Standalone server bundle
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000

CMD ["node", "server.js"]
