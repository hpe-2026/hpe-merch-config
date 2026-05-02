FROM node:18-alpine

RUN apk add --no-cache curl

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# Set proper permissions for non-root user (cross-platform compatible)
RUN chown -R node:node /app && chmod -R 755 /app

USER node

EXPOSE 5173

CMD ["npm", "run", "preview", "--", "--host", "0.0.0.0", "--port", "5173"]
