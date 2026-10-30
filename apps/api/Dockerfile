# Production image of the API. Built from the repository root (the pnpm lockfile and workspace
# file live there):
#
#   docker build -f apps/api/Dockerfile .
#
# Uses apps/api/Dockerfile.dockerignore (BuildKit picks a <Dockerfile>.dockerignore next to the
# Dockerfile over the context's .dockerignore).

# ---- Build ----
FROM node:24.22.1 AS build

WORKDIR /usr/src/app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
# The shared tsconfig base (apps/api/tsconfig.json extends it)
COPY packages/config packages/config

# --ignore-scripts to prevent prisma generate from running.
# No use until we got the source code
RUN pnpm install --frozen-lockfile --ignore-scripts --filter stiftelsen-effekt-backend

COPY apps/api apps/api
WORKDIR /usr/src/app/apps/api
RUN pnpm exec prisma generate
RUN pnpm run build

# ---- Release ----
FROM node:24.22.1

WORKDIR /usr/src/app
RUN corepack enable
ENV CHECKPOINT_DISABLE=1
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/prisma.config.ts apps/api/

# --ignore-scripts to avoid husky install from running. The same image runs the migrate jobs
# (`prisma migrate deploy`), so fetch Prisma's schema engine here, as root, by rebuilding just the
# Prisma CLI packages; otherwise the CLI downloads it into node_modules at runtime, which the
# unprivileged user below cannot write to. The app itself only uses Prisma's types.
RUN pnpm install --frozen-lockfile --prod --ignore-scripts --filter stiftelsen-effekt-backend \
    && pnpm --dir apps/api rebuild prisma @prisma/engines

COPY --from=build /usr/src/app/apps/api/dist ./apps/api/dist
COPY --from=build /usr/src/app/apps/api/prisma ./apps/api/prisma

# The working directory is the API package: `npm start` below and the migrate jobs'
# `./node_modules/.bin/prisma migrate deploy` (Cloud Run job command) both run from here.
WORKDIR /usr/src/app/apps/api

EXPOSE 5050
# The app and the Prisma CLI only read from their directory; run as the unprivileged node user
USER node
CMD [ "npm", "start" ]
