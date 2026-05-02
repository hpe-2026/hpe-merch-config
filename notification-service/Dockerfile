FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --only=production

# Copy application code
COPY src ./src
COPY .env.example ./.env.example

EXPOSE 9100

# Health check via the metrics server
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -qO- http://127.0.0.1:9100/health || exit 1

# Run the service
CMD ["node", "src/index.js"]
