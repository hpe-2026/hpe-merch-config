# Build stage
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies with legacy peer deps flag
RUN npm install --legacy-peer-deps

# Production stage
FROM node:18-alpine

WORKDIR /app

# Create logs directory
RUN mkdir -p logs

# Install curl for health checks
RUN apk add --no-cache curl

# Copy from builder
COPY --from=builder /app/node_modules ./node_modules

# Copy application files
COPY package*.json ./
COPY src ./src
COPY openapi ./openapi

# Copy Docker environment configuration
COPY .env.docker ./.env

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

# Expose port
EXPOSE 3000

# Set environment
ENV NODE_ENV=development

# Start application
CMD ["node", "src/index.js"]
