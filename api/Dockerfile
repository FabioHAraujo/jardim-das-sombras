FROM node:22-alpine AS builder

WORKDIR /app

RUN apk add --no-cache openssl libc6-compat fontconfig ttf-dejavu

COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci

COPY . .

RUN npx prisma generate
RUN npm run build

FROM node:22-alpine AS runner

WORKDIR /app

RUN apk add --no-cache openssl libc6-compat fontconfig ttf-dejavu

ENV NODE_ENV=production
ENV PORT=3040
ENV ASSETS_PATH=/app/assets

COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

RUN chown -R node:node /app
USER node

EXPOSE 3040

CMD ["sh", "-c", "npx prisma db push --skip-generate && node dist/server.js"]
