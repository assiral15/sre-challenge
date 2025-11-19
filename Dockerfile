FROM node:18-alpine

WORKDIR /usr/src/app

COPY package*.json ./
COPY tsconfig.json ./

RUN npm install

COPY src ./src

# Compila o TypeScript — gera dist/
RUN npm run build

# Agora copiamos manualmente o telemetry.cjs para o dist/
COPY src/telemetry.cjs dist/telemetry.cjs

EXPOSE 3001

CMD ["npm", "start"]
