# Production image for the web app and the background worker (same image, different command).
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Build needs a syntactically valid environment but never connects to the database.
# Set by start-local only: relaxes https-only headers so the app works on http://localhost.
ARG LOCAL_HTTP=
ENV LOCAL_HTTP=${LOCAL_HTTP} NEXT_TELEMETRY_DISABLED=1 DATABASE_URL=postgres://build:build@localhost:5432/build APP_SECRET=build-time-secret-build-time-secret-0000 APP_URL=https://example.org
RUN if [ -n "$LOCAL_HTTP" ]; then APP_URL=http://localhost:3000 npm run build; else npm run build; fi

FROM node:22-bookworm-slim AS run
WORKDIR /app
# ffmpeg powers video posters and web-optimised playback for portfolios.
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000
COPY --from=build /app ./
RUN mkdir -p /app/storage && chown -R node:node /app/storage
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Migrations are idempotent, so running them on every start is safe.
CMD ["sh", "-c", "npm run db:migrate && npm start"]
