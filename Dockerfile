# ---- Build ----
FROM node:24.22.1 AS build

WORKDIR /usr/src/app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# --ignore-scripts to prevent prisma generate from running.
# No use until we got the source code
RUN pnpm install --frozen-lockfile --ignore-scripts --filter stiftelsen-effekt-backend

COPY . .
RUN pnpm exec prisma generate
RUN pnpm run build

# ---- Release ----
FROM node:24.22.1

WORKDIR /usr/src/app
RUN corepack enable
ENV CHECKPOINT_DISABLE=1
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml prisma.config.ts ./

# --ignore-scripts to avoid husky install from running. The same image runs the migrate jobs
# (`prisma migrate deploy`), so fetch Prisma's schema engine here, as root, by rebuilding just the
# Prisma CLI packages; otherwise the CLI downloads it into node_modules at runtime, which the
# unprivileged user below cannot write to. The app itself only uses Prisma's types.
RUN pnpm install --frozen-lockfile --prod --ignore-scripts --filter stiftelsen-effekt-backend \
    && pnpm rebuild prisma @prisma/engines

COPY --from=build /usr/src/app/dist ./dist
COPY --from=build /usr/src/app/prisma ./prisma

EXPOSE 5050
# The app and the Prisma CLI only read from their directory; run as the unprivileged node user
USER node
CMD [ "npm", "start" ]
