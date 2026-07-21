FROM node:22.22.2-alpine AS build

WORKDIR /app

RUN test "$(node --version)" = "v22.22.2" \
  && test "$(npm --version)" = "10.9.7"

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund

COPY . .

# These values are embedded in the browser bundle and must be browser-safe.
# Private provider credentials must stay in server-side secret storage.
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_APP_URL
ARG VITE_SENTRY_DSN=""
ARG VITE_SENTRY_ENVIRONMENT="production"
ARG VITE_SENTRY_RELEASE=""
ARG VITE_APP_VERSION=""

RUN test -n "${VITE_SUPABASE_URL}" \
  && test -n "${VITE_SUPABASE_ANON_KEY}" \
  && test -n "${VITE_APP_URL}" \
  && node scripts/validate-public-supabase-config.mjs \
  && npm run build \
  && node scripts/validate-browser-bundle.mjs dist

FROM node:22.22.2-alpine AS runtime

ENV NODE_ENV=production
WORKDIR /app

RUN test "$(node --version)" = "v22.22.2" \
  && test "$(npm --version)" = "10.9.7"

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund \
  && npm cache clean --force

COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node scripts/scan-release-secrets.mjs ./scripts/scan-release-secrets.mjs
COPY --chown=node:node scripts/validate-browser-bundle.mjs ./scripts/validate-browser-bundle.mjs
COPY --chown=node:node scripts/serve-production.mjs ./scripts/serve-production.mjs

USER node
EXPOSE 3000

CMD ["npm", "start"]
