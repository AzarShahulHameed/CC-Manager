FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
RUN mkdir -p /app/data
ENV DB_PATH=/app/data/cards.db
EXPOSE 3001
CMD ["node", "server.js"]
