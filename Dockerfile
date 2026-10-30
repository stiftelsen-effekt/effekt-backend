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
COPY --from=build /usr/src/app/dist ./dist
COPY --from=build /usr/src/app/prisma ./prisma
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# --ignore-scripts to avoid husky install from running
RUN pnpm install --frozen-lockfile --prod --ignore-scripts --filter stiftelsen-effekt-backend

EXPOSE 5050
# nosemgrep: dockerfile.security.missing-user.missing-user -- the migrate job's Prisma 4 CLI writes to node_modules/@prisma/engines; revisit with a chown and a migration test
CMD [ "npm", "start" ]
