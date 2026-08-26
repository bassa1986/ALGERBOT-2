# AlgerBot

Multi-merchant marketplace for Algerian merchants, built on TanStack Start (React 19 + Vite), PostgreSQL, and Adex S3-compatible storage. Buyers shop via guest checkout with cash on delivery, inside a Telegram Mini App or a normal browser. Merchants manage their own storefront through Telegram SSO; admins verify merchants and subscription payments manually.

## Stack

- TanStack Start v1 (React 19, Vite, file-based routes, server functions)
- Tailwind CSS v4, semantic design tokens (`src/styles.css`) - no hardcoded colors
- PostgreSQL via the `postgres` driver, pooled in `src/lib/db.server.ts`
- Adex (S3-compatible) object storage, hand-rolled SigV4 presigned PUT/GET/DELETE (no AWS SDK)
- SheetJS (`xlsx`) for Excel import/export
- GSAP + ScrollTrigger for storefront animations
- Telegram Bot API + WebApp SDK for Mini App integration

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Set up PostgreSQL - any Postgres 14+ works. Create a database and set `PIVOTCLOUD_DATABASE_URL` (see `.env.example`) to point at it.

3. Copy the env file and fill in real values:
   ```bash
   cp .env.example .env
   ```
   See "Environment variables" below for what each one does.

4. Run migrations and seed data:
   ```bash
   npm run db:migrate
   npm run db:seed
   ```
   This creates all tables and seeds the 58 Algerian wilayas, base product categories, and default subscription settings.

5. Generate the route tree and run the dev server:
   ```bash
   npm run dev
   ```
   Visit http://localhost:5173. The route tree (`src/routeTree.gen.ts`) is generated automatically by the Vite plugin on startup — it is gitignored, so a fresh clone will not have it until you run `npm run dev` or `npm run build` at least once. **Running `npx tsc --noEmit` before that first `dev`/`build` will fail** with unrelated-looking route-typing errors (`Argument of type "/..." is not assignable to parameter of type "undefined"`) — that's just the missing generated file, not a real type error. Run `npm run dev` (Ctrl+C once it's ready) or `npm run build` first if you want to type-check standalone.

## Production build & deployment

This has been verified end-to-end: a clean `npm run build` followed by `npm start`, hit with real HTTP requests against the actual running production server (not just the dev server).

```bash
npm run build   # outputs dist/client and dist/server
npm start        # runs server/start.mjs, which starts a real Node HTTP server on PORT (default 3000)
```

**Important, non-obvious detail**: this version of TanStack Start does not emit a self-starting `.output/server/index.mjs` launcher the way some older docs/templates describe. `npm run build` produces `dist/server/server.js`, which exports a Web-standard `{ fetch(request): Promise<Response> }` handler — a module, not a listener. `server/start.mjs` is a small, necessary adapter that wraps that handler in a real `node:http` server. If you ever see a "Cannot find module .output/server/index.mjs" error from an older script or doc, that's why — use `npm start` (which now correctly points at `server/start.mjs`) instead.

Set `PORT` (default 3000) and `HOST` (default 0.0.0.0) as needed for your hosting platform.

## Environment variables


All documented with inline comments in `.env.example`. Summary:

- `PIVOTCLOUD_DATABASE_URL` - Postgres connection string
- `SESSION_SECRET` - HMAC signing key for session cookies - use a long random value in production
- `APP_ORIGIN` - full origin of your deployment, used for CSRF origin-checking on admin login
- `ADEX_ENDPOINT`, `ADEX_REGION`, `ADEX_BUCKET`, `ADEX_ACCESS_KEY_ID`, `ADEX_SECRET_ACCESS_KEY`, `ADEX_PUBLIC_BASE_URL` - Adex S3-compatible object storage credentials
- `TELEGRAM_BOT_TOKEN` - from @BotFather, used server-side to verify Telegram auth payloads
- `TELEGRAM_BOT_USERNAME` / `VITE_TELEGRAM_BOT_USERNAME` - your bot's public @handle (not secret); the latter is exposed to the client bundle for the Login Widget
- `BARIDIMOB_RIB`, `BARIDIMOB_ACCOUNT_NAME` - displayed on the merchant billing page for manual BaridiMob transfers
- `REMBG_SERVICE_URL` - optional; self-hosted rembg server-mode instance for product-photo background removal. Leave unset to disable - uploads keep their original background if this isn't configured or is unreachable.

## Background removal (rembg)

Product photo uploads can optionally have their background removed and replaced with white, via a self-hosted rembg (https://github.com/danielgatis/rembg) instance running in HTTP server mode. This is NOT part of the Adex object-storage product already used elsewhere in this app - it needs its own server.

To enable:
1. Provision a small server (2GB+ RAM) anywhere that can run Docker - e.g. a generic VPS, or your cloud provider's own compute product if it offers one.
2. Run:
   ```bash
   docker run -d -p 7000:7000 --restart unless-stopped danielgatis/rembg s --host 0.0.0.0 --port 7000
   ```
3. Open port 7000 in whatever firewall the host provides.
4. Set `REMBG_SERVICE_URL=http://<that-server-ip>:7000` in your `.env`.

The integration (`src/lib/rembg.server.ts`) fails gracefully - if the service is unreachable or unconfigured, uploads silently keep their original background rather than erroring.

## Database migrations

Migrations live in `src/db/migrations/` as paired `.up.sql`/`.down.sql` files, applied in order by a small versioned runner (`src/db/migrate.ts`) that tracks applied versions in a `schema_migrations` table.

```bash
npm run db:migrate       # apply all pending migrations
npm run db:migrate:down  # roll back the most recently applied migration
```

## Known gaps (honest status, not hidden)

- No automated tests. Every server function and route has been manually type-checked (`tsc --noEmit`), smoke-tested against a real local Postgres + live dev server, AND verified via a real production build + production start (see above) — but there is no automated test suite.
- rembg is not deployed anywhere by default - the integration code is complete and wired in, but you must provision the service yourself (see above).
- Frontend input validation is shallower than backend validation. Every server function validates its input with Zod; forms mostly rely on HTML5 `required`/`type=` attributes rather than pre-submit checks that mirror the backend schemas exactly. Not a security gap (the backend is the real boundary), but a UX gap — invalid input round-trips to the server before the user sees an error.
- Adex image DELETE assumes Adex's S3-compatible API supports standard SigV4-signed DELETE requests the same way it supports GET/PUT. This has not been tested against real Adex credentials - verify it works against your actual Adex bucket before relying on it in production.
- Rate limiting is in-memory, per-process (see `src/lib/rate-limit.ts`). This is correct for a single-instance deployment; if you ever run multiple instances behind a load balancer, each instance tracks its own independent counters, so the effective limit becomes `configured_limit × instance_count`. Swap in a shared store (Redis, etc.) if you scale horizontally.
- A rate-limited request during server-side rendering (visiting a page directly, as opposed to a client-side mutation call) currently surfaces as a generic HTTP 500 rather than a proper 429 — the block itself works correctly (verified with a real stress test), but the status code shown to the browser in that specific path isn't ideal. Client-side mutation calls (the far more common path — every button/form submit in this app) get the thrown error message directly in a catchable way already.

### A note on `.server.ts` / `.client.ts` file naming
Earlier in development, most server-only helper files in `src/lib/` were named `*.server.ts` (e.g. `db.server.ts`, `auth.server.ts`) — a common convention, but one that collided badly with this TanStack Start version's import-protection plugin, which treats *any* file matching `**/*.server.*` reached from client-imported code as a hard build error, regardless of whether that file's contents are actually safe. Because nearly every route file imports from `src/server/*.ts` (the RPC layer), and those files in turn import shared helpers, this convention caused a codebase-wide production build failure that a full multi-environment `npm run build` was needed to catch — `vite dev` and `tsc --noEmit` never surfaced it. The fix was to rename those helpers to drop the `.server`/`.client` suffix (the real security boundary is `createServerFn`'s RPC mechanism and each middleware's own auth checks, not the filename), and to explicitly externalize the two genuinely Node-only dependencies (`postgres`, and the framework's own `@tanstack/react-start/server` entrypoint when reached transitively) from the client build in `vite.config.ts`. If you add new server-only helper modules, avoid the `.server.ts` naming convention for this reason, or verify a full production build after adding one.


## Project structure

```
src/
  db/
    migrations/         # versioned SQL migrations (paired .up.sql/.down.sql)
    migrate.ts          # migration runner CLI
    seed.ts             # wilayas + categories + default subscription settings
  lib/                  # server-side helpers (auth, crypto, storage, telegram, i18n)
  components/           # shared React components (storefront/, admin, telegram)
  server/               # createServerFn-based RPCs, grouped by domain
  routes/               # file-based routes
    _authenticated/     # merchant dashboard (session-guarded)
    admin/              # admin panel (session-guarded)
    s/$slug/            # public buyer-facing storefront
```
