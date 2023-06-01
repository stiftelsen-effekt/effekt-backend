# ---- Build ----
FROM node:18-alpine AS build

WORKDIR /usr/src/app
COPY package*.json ./

# --ignore-scripts to prevent prisma generate from running.
# No use until we got the source code
RUN npm install --ignore-script

COPY . .
RUN npx prisma generate
RUN npm run build

# ---- Release ----
FROM node:18-alpine

WORKDIR /usr/src/app
COPY --from=build /usr/src/app/dist ./dist
COPY --from=build /usr/src/app/prisma ./prisma
COPY package*.json ./

# --ignore-scripts to avoid husky install from running
RUN npm ci --omit=dev --ignore-scripts
EXPOSE 5050
CMD [ "npm", "start" ]
