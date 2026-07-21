FROM node:22-alpine

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --ignore-scripts
COPY server.js ./

EXPOSE 3001
ENV NODE_ENV=production
CMD ["node", "server.js"]
