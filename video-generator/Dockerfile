FROM node:22.22.2-alpine

WORKDIR /app
COPY package.json server.js ./

EXPOSE 3001
ENV NODE_ENV=production
USER node
CMD ["node", "server.js"]
