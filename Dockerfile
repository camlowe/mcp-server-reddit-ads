# Container image for MCP registry introspection (Glama and similar) and for
# anyone who would rather run the server in Docker than via npx.
#
# Registry health checks need the server to start and answer tools/list without
# real credentials. Authentication is lazy: the token exchange happens on the
# first API call, not at startup, so the placeholder values below are enough to
# boot and enumerate the read-tier tools without any request reaching Reddit.

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

# Placeholders, not credentials. Override all three at runtime:
#   docker run -i --rm \
#     -e REDDIT_CLIENT_ID=... -e REDDIT_CLIENT_SECRET=... \
#     -e REDDIT_REFRESH_TOKEN=... mcp-server-reddit-ads
# Mint a refresh token with: npx mcp-server-reddit-ads auth
ENV REDDIT_CLIENT_ID=placeholder \
    REDDIT_CLIENT_SECRET=placeholder \
    REDDIT_REFRESH_TOKEN=placeholder

# Read tier by default: no tool that can change an ad account is registered.
# Raise to safe or spend deliberately.
ENV REDDIT_ADS_WRITE_TIER=read

USER node

# stdio transport: the JSON-RPC stream is stdin/stdout, so run with -i.
ENTRYPOINT ["node", "dist/cli.js"]
