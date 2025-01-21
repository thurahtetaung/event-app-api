#Build
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

#Serve
FROM node:22-alpine AS serve
WORKDIR /app
COPY --from=build /app/build .
COPY package*.json ./
RUN npm install --only=production
EXPOSE 8080
CMD ["node", "src/main.js"]
