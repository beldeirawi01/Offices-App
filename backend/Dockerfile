FROM node:20-slim AS base
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production

COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/dist ./dist
COPY --from=base /app/prisma ./prisma
COPY --from=base /app/package.json ./package.json

EXPOSE 4000

# Applies any pending migrations, then starts the server. Safe to run on every
# deploy — a no-op when the schema is already up to date.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
