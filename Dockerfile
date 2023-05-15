FROM node:16-alpine

#Install db-mate
RUN apk --no-cache add curl
RUN curl -fsSL -o /usr/local/bin/dbmate https://github.com/amacneil/dbmate/releases/latest/download/dbmate-linux-amd64
RUN chmod +x /usr/local/bin/dbmate

#Setup folders
RUN mkdir -p /home/node/app/node_modules && chown -R node:node /home/node/app
WORKDIR /home/node/app

#Install node packages
COPY package*.json ./
RUN npm install

#Copies source
COPY . .
COPY --chown=node:node . .

USER node

EXPOSE 8080

#Set environment varibales


#Setup default command to run server
CMD [ "npm", "run", "dev" ]
