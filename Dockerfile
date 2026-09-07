FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

RUN npm run build

EXPOSE 3000

# The base node:22-alpine image already ships an unprivileged "node" user
# (uid 1000) — no need to create one. Build as root above (npm ci/build
# need to write node_modules/dist), then hand ownership over and drop to
# that user only for the actual running container, so a compromised
# request handler doesn't get root inside the container.
RUN chown -R node:node /app
USER node

# No dedicated /healthz route exists in the app yet (a real one, returning
# fast without hitting Postgres, would be better) — hitting "/" is a
# pragmatic stand-in that at least confirms the Node process is up and
# answering HTTP, without requiring an app-code change here.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# NOTE for multi-replica deployments: this couples every container's
# startup to running migrations. schema_migrations tracking (see
# src/db/migrate.ts) makes re-running migrations that are already applied
# a no-op, and an advisory lock added to that script now prevents
# concurrent replicas from applying the SAME pending migration twice —
# but migrations still block that replica's own startup until they
# complete. For a zero-downtime multi-replica deploy, prefer running
# `npm run db:migrate` as a separate one-off release step BEFORE starting
# any replica, rather than inside each container's own CMD.
CMD ["sh", "-c", "npm run db:migrate && npm start"]
