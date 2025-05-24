FROM --platform=linux/amd64 node:22-slim

WORKDIR /app

ARG PRISMA_VERSION=6
COPY ./build/server/schema.prisma ./schema.prisma

RUN apt update && apt install openssl ca-certificates -y \
    && npx --yes prisma@$PRISMA_VERSION generate \
    && rm -rf ~/root/.npm/_npx \
    && rm -rf ~/root/.npm/_cacache \
    && rm -rf ~/root/.cache

COPY docker.package.json ./package.json

RUN npm install

COPY ./build /app/build
COPY ./public /app/public

env PORT=8040

EXPOSE $PORT

CMD ["node", "./build/server/index.js"]
