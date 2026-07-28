# Container image for anyone who would rather run the server in Docker than via
# npx, and for registry health checks that start it to enumerate tools.
#
# No credentials are baked in and none are needed to start: authentication is
# lazy, so the server boots and answers tools/list without them and fails with
# an actionable error on the first call that needs the API.

FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist

# Supply credentials at runtime:
#   docker run -i --rm \
#     -e REDDIT_CLIENT_ID=... -e REDDIT_CLIENT_SECRET=... \
#     -e REDDIT_REFRESH_TOKEN=... mcp-server-reddit-ads
# Mint a refresh token with: npx mcp-server-reddit-ads auth

# Read tier by default: no tool that can change an ad account is registered.
# Raise to safe or spend deliberately.
ENV REDDIT_ADS_WRITE_TIER=read

USER node

# stdio transport: the JSON-RPC stream is stdin/stdout, so run with -i.
ENTRYPOINT ["node", "dist/cli.js"]
