# Imagen de producción del backend. Multi-stage para no llevar devDependencies
# ni el código fuente de test/lint a la imagen final.
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
# Usuario sin privilegios: si el proceso Node es comprometido, no corre como
# root dentro del contenedor.
RUN addgroup -S ditash && adduser -S ditash -G ditash
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN mkdir -p uploads && chown -R ditash:ditash /app
USER ditash
EXPOSE 4000
CMD ["node", "src/server.js"]
