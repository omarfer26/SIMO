# Imagen oficial de Node.js LTS ligera (Node 18 ya no recibe parches de seguridad)
FROM node:22-alpine

ENV NODE_ENV=production

# Establecer el directorio de trabajo dentro del contenedor
WORKDIR /usr/src/app

# Copiar package.json y package-lock.json primero para aprovechar la caché de capas
COPY package*.json ./

# Instalar solo dependencias de producción, exactamente las del package-lock
RUN npm ci --omit=dev

# Copiar el resto del código de la aplicación
COPY . .

# No ejecutar como root dentro del contenedor
USER node

# Exponer el puerto en el que corre la app (el que configuramos en Express)
EXPOSE 3000

# node directamente (sin npm) para que reciba las señales de apagado de Docker
CMD ["node", "index.js"]
