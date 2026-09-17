# syntax=docker/dockerfile:1

# Build once, configure at runtime: no secret is ever passed to the build, so
# the image can be shared and promoted between environments safely.

ARG NODE_IMAGE=node:22-alpine

FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM ${NODE_IMAGE} AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build \
 && cp -r public .next/standalone/public \
 && mkdir -p .next/standalone/.next \
 && cp -r .next/static .next/standalone/.next/static

FROM ${NODE_IMAGE} AS run
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Unprivileged user; the app files are owned by root and only readable by it,
# so a compromised process cannot rewrite its own code.
RUN addgroup -S -g 1001 portal && adduser -S -u 1001 -G portal portal \
 && mkdir -p /app/.next/cache /app/data \
 && chown portal:portal /app/.next/cache /app/data \
 && chmod 700 /app/data

COPY --from=build /app/.next/standalone ./

USER portal
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
