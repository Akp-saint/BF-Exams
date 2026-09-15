FROM node:20-bookworm-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY . .
RUN mkdir -p /app/backups && chown -R node:node /app

USER node
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "app.js"]
