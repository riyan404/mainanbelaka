FROM node:22-alpine AS build
WORKDIR /app
RUN apk add --no-cache openssl
COPY package*.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci
COPY tsconfig.base.json ./
COPY apps/api apps/api
RUN npm run prisma:generate --workspace @cctv/api && npm run build --workspace @cctv/api

FROM node:22-alpine AS runtime
WORKDIR /app
RUN apk add --no-cache ffmpeg openssl
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/prisma ./apps/api/prisma
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
CMD ["sh", "-c", "cd apps/api && npx prisma migrate deploy && node dist/main.js"]
