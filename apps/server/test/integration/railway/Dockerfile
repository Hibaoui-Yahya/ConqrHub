# ConqrHub security-lab test image (Phase 0C verification, F27/F28/F29).
#
# Builds the server from source on the deployed runtime (node:22-slim, pnpm 10.4.0 — the same
# pins as the production Dockerfile) and runs the real HTTP + PostgreSQL + Redis integration
# suite in `apps/server/test/integration`. It is NOT a production image: it ships devDependencies,
# runs Jest, and exits when the suite is finished.
#
# Build context is the repository root. Select this file with the service variable
#   RAILWAY_DOCKERFILE_PATH=apps/server/test/integration/railway/Dockerfile
# on a service that lives ONLY in the `conqr-security-lab` project (see README.md here).
FROM node:22-slim

RUN npm install -g pnpm@10.4.0

WORKDIR /app

ENV NX_DAEMON=false \
    NX_NO_CLOUD=true \
    CI=true

# Dependency layer first (cached across deployments while the lockfile is unchanged).
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY patches ./patches
COPY apps/client/package.json apps/client/
COPY apps/conqrplan-mcp/package.json apps/conqrplan-mcp/
COPY apps/server/package.json apps/server/
COPY packages/conqrplan-core/package.json packages/conqrplan-core/
COPY packages/editor-ext/package.json packages/editor-ext/
COPY packages/icons/package.json packages/icons/
COPY packages/integration-ui/package.json packages/integration-ui/
COPY packages/shell/package.json packages/shell/
COPY packages/tokens/package.json packages/tokens/
COPY packages/ui/package.json packages/ui/
RUN pnpm install --frozen-lockfile

# Recorded by the deployer at `railway up` time (a directory upload has no .git metadata).
ARG HARNESS_GIT_SHA=unknown
ENV HARNESS_GIT_SHA=$HARNESS_GIT_SHA

COPY . .

# CRLF guard: the repository is checked out with core.autocrlf on Windows hosts.
RUN sed -i 's/\r$//' apps/server/test/integration/railway/*.sh

# Workspace packages the server imports at runtime (same step the production build performs).
RUN pnpm exec nx run-many -t build --projects=@docmost/editor-ext,@conqr/conqrplan-core

CMD ["bash", "apps/server/test/integration/railway/run-security-tests.sh"]
