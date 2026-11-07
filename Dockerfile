FROM oven/bun:1 AS build
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM oven/bun:1-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile --production
COPY server ./server
COPY src/engine/config.ts ./src/engine/config.ts
COPY --from=build /app/dist ./dist
EXPOSE 3000
USER bun
CMD ["bun", "server/index.ts"]
