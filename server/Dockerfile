FROM node:20-alpine

WORKDIR /app

# Instala so as dependencias primeiro (cache de build)
COPY package.json ./
RUN npm install --omit=dev

# Copia o codigo
COPY server.js test-client.js ./
COPY lib ./lib
COPY public ./public

# Os videos recebidos e a config ficam em /app/data (volume)
RUN mkdir -p /app/data/uploads
VOLUME ["/app/data"]

EXPOSE 3000
ENV PORT=3000

CMD ["node", "server.js"]
