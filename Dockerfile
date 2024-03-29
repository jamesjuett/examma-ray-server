FROM node:14
WORKDIR /usr/src/app
COPY package.json ./
COPY tsconfig.json ./
COPY ./src ./src
COPY ./.env ./.env
COPY ./webpack.config.js ./webpack.config.js
RUN npm install
RUN npm install -g node-wait-for-it
RUN npm run build
EXPOSE 3000
CMD ["node","./build/server.js"]