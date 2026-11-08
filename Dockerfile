FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY tsconfig.json tsconfig.core.json ./
COPY src ./src
COPY api ./api
COPY data ./data

RUN npm run build

FROM node:22-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

COPY --from=build /app/dist ./dist
# Keep the imported snapshot beside the compiled source even if a future
# TypeScript release changes JSON emission behaviour.
COPY --from=build /app/data ./dist/data

USER node
ENTRYPOINT ["node", "dist/src/stdio.js"]
