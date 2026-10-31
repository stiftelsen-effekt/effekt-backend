# Production image of the API. Built from the repository root (the pnpm lockfile and workspace
# file live there):
#
#   docker build -f apps/api/Dockerfile .
#
# Uses apps/api/Dockerfile.dockerignore (BuildKit picks a <Dockerfile>.dockerignore next to the
# Dockerfile over the context's .dockerignore).
#
# Layers are ordered so a change to the API's source rebuilds only the last ones: Cloud Build
# (cloud.deploy.yaml) restores the others from a registry cache, and as long as the lockfile and
# the API's package.json are unchanged it neither installs dependencies nor pushes them again.

# ---- Base ----
# Slim Debian plus OpenSSL, which Prisma's schema engine (the migrate jobs) links against
FROM node:24.22.1-slim AS base

RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /usr/src/app
RUN corepack enable
ENV CHECKPOINT_DISABLE=1
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/prisma.config.ts apps/api/

# ---- Build ----
FROM base AS build

# The shared tsconfig base (apps/api/tsconfig.json extends it)
COPY packages/config packages/config

# --ignore-scripts to prevent prisma generate from running.
# No use until we got the source code
RUN pnpm install --frozen-lockfile --ignore-scripts --filter stiftelsen-effekt-backend

COPY apps/api apps/api
WORKDIR /usr/src/app/apps/api
RUN pnpm exec prisma generate && pnpm run build

# ---- Release ----
FROM base AS release

# --ignore-scripts to avoid husky install from running. The same image runs the migrate jobs
# (`prisma migrate deploy`), so fetch Prisma's schema engine here, as root, by rebuilding just the
# Prisma CLI packages; otherwise the CLI downloads it into node_modules at runtime, which the
# unprivileged user below cannot write to. The app itself only uses Prisma's types. The pnpm store
# is removed afterwards: node_modules holds its own copy of every file it needs.
RUN pnpm install --frozen-lockfile --prod --ignore-scripts --filter stiftelsen-effekt-backend \
    && pnpm --dir apps/api rebuild prisma @prisma/engines \
    && rm -rf "$(pnpm store path)" /root/.cache/pnpm

COPY --from=build /usr/src/app/apps/api/prisma ./apps/api/prisma
COPY --from=build /usr/src/app/apps/api/dist ./apps/api/dist

# The working directory is the API package: `npm start` below and the migrate jobs'
# `./node_modules/.bin/prisma migrate deploy` (Cloud Run job command) both run from here.
WORKDIR /usr/src/app/apps/api

EXPOSE 5050
# The app and the Prisma CLI only read from their directory; run as the unprivileged node user
USER node
CMD [ "npm", "start" ]
