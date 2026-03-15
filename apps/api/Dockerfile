FROM node:22-bookworm-slim

WORKDIR /app

ARG DATABASE_URL
ENV DATABASE_URL=$DATABASE_URL

RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

COPY prisma ./prisma
COPY prisma.config.ts ./
COPY scripts ./scripts
COPY tsconfig.json ./
COPY src ./src

RUN npx prisma generate
RUN npm run build

EXPOSE 4000

CMD ["sh", "-c", "npm run db:push && node dist/server.js"]
