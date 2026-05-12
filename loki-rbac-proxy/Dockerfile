FROM node:18-alpine
WORKDIR /app
COPY package.json .
RUN npm install --production
COPY src ./src
EXPOSE 3200
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:3200/health',(r)=>{process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1))" || exit 1
CMD ["node", "src/index.js"]
