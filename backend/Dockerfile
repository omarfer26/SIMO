# Usar una imagen oficial de Node.js ligera
FROM node:18-alpine

# Establecer el directorio de trabajo dentro del contenedor
WORKDIR /usr/src/app

# Copiar package.json y package-lock.json (si existe)
COPY package*.json ./

# Instalar las dependencias
RUN npm install

# Copiar el resto del código de la aplicación
COPY . .

# Exponer el puerto en el que corre tu app (el que configuramos en Express)
EXPOSE 3000

# Comando para iniciar la aplicación
CMD ["npm", "start"]