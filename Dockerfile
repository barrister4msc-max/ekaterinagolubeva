# syntax=docker/dockerfile:1.7
# Timeweb App Platform Dockerfile — Node 20 runtime for KATI LAWYER.
# Does not affect Lovable/Cloudflare deployment (wrangler.jsonc, vite.config.ts,
# src/server.ts remain the source of truth for Workers). This image builds via
# vite.node.config.ts using Nitro's node-server preset, so TanStack Start SSR,
# createServerFn, /api/chat, /private-access, the Supabase auth middleware and
# the /workspace routes all run inside a normal Node process.

############################
# Stage 1 — build
############################
FROM node:20-slim AS build

WORKDIR /app

# Install bun for reproducible installs from bun.lock
RUN apt-get update \
  && apt-get install -y --no-install-recommends curl ca-certificates unzip \
  && rm -rf /var/lib/apt/lists/* \
  && curl -fsSL https://bun.sh/install | bash \
  && ln -s /root/.bun/bin/bun /usr/local/bin/bun

COPY package.json bun.lock bunfig.toml ./
RUN bun install --frozen-lockfile

COPY . .

# Build with the Node-targeted Vite config. The Cloudflare-targeted
# vite.config.ts is untouched and still used by the Lovable deployment.
RUN bun run vite build --config vite.node.config.ts

############################
# Stage 2 — runtime
############################
FROM node:20-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

# Nitro's node-server preset emits a self-contained bundle in .output/
# with all deps inlined into .output/server/node_modules.
COPY --from=build /app/.output ./.output

EXPOSE 3000

# Nitro node-server honours PORT and HOST env vars; falls back to 3000.
CMD ["node", ".output/server/index.mjs"]
