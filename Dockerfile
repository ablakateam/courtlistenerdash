FROM node:24-bookworm-slim AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund

COPY index.html tsconfig.json tsconfig.server.json vite.config.ts ./
COPY src ./src
COPY tests ./tests
RUN npm run check && npm test && npm run build
RUN npm prune --omit=dev --ignore-scripts

FROM node:24-bookworm-slim AS runtime

ENV NODE_ENV=production \
    COURTLISTENER_WEB_HOST=0.0.0.0 \
    COURTLISTENER_WEB_PORT=8788 \
    COURTLISTENER_WEB_DATA_DIR=/data

WORKDIR /app
RUN groupadd --system courtlistener && useradd --system --gid courtlistener --home-dir /app courtlistener \
    && mkdir -p /data && chown courtlistener:courtlistener /data

COPY --from=build --chown=courtlistener:courtlistener /app/package.json /app/package-lock.json ./
COPY --from=build --chown=courtlistener:courtlistener /app/node_modules ./node_modules
COPY --from=build --chown=courtlistener:courtlistener /app/dist ./dist
COPY --from=build --chown=courtlistener:courtlistener /app/dist-server ./dist-server

USER courtlistener
EXPOSE 8788
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8788/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "dist-server/server/index.js"]
