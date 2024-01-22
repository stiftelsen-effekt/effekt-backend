# ---- Build ----
FROM node:18 AS build

# Install build dependencies for native modules
RUN apk add --no-cache make gcc g++ python3 libxml2-dev

WORKDIR /usr/src/app
COPY package*.json ./

# --ignore-scripts to prevent prisma generate from running.
# No use until we got the source code
RUN npm install --ignore-script

# After npm install
RUN npm rebuild libxmljs

COPY . .
RUN npx prisma generate
RUN npm run build

# ---- Release ----
FROM node:18

# Install build dependencies for native modules
RUN apk add --no-cache make gcc g++ python3 libxml2-dev

WORKDIR /usr/src/app
COPY --from=build /usr/src/app/dist ./dist
COPY --from=build /usr/src/app/prisma ./prisma
COPY package*.json ./

# --ignore-scripts to avoid husky install from running
RUN npm ci --omit=dev --ignore-scripts

# After npm install
RUN npm rebuild libxmljs

EXPOSE 5050
CMD [ "npm", "start" ]
