# Grim Renewal shared-tips server for Cloud Run.
# Build context is the project root. .gcloudignore limits the upload to the server files only.
# Firestore 9.x needs Node 22 or newer.
FROM node:22-slim

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    TRUST_PROXY=1 \
    STORE=firestore

WORKDIR /app

# Only what the server needs. No site, no tests, no .env.
COPY server/runtime-package.json ./package.json
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force

COPY server/community-api.ts server/known-merchants.json ./server/
COPY src/community/ ./src/community/

# Run as the unprivileged user that the node image provides.
USER node

# Cloud Run sets PORT (usually 8080). tsx runs the TypeScript directly, as `npm run community` does locally.
CMD ["node", "--import", "tsx", "server/community-api.ts"]
