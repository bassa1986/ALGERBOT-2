import postgres from 'postgres'

// Single pooled connection for the whole app. Never instantiate `postgres()`
// anywhere else. process.env is read lazily inside a function (not at module
// scope) so this file can be imported safely before env vars are injected by
// the server runtime.
//
// This file is reached indirectly from route components (via
// src/server/*.ts -> src/lib/auth.ts -> this file) because createServerFn's
// automatic client/server code-splitting doesn't strip these transitive
// imports out of the client bundle in this project's build configuration.
// The actual risk this file poses to a client bundle is the `postgres`
// driver itself (a Node-only package touching fs/net/tls/crypto/perf_hooks)
// — that's handled by explicitly externalizing `postgres` in
// vite.config.ts's client environment config, which lets this file resolve
// in the client's static analysis (getDb/sql are simply never called
// client-side) without either the Node built-ins or the driver's code
// actually ending up in the shipped client bundle.

let _sql: postgres.Sql | null = null

export function getDb(): postgres.Sql {
  if (_sql) return _sql

  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set')
  }

  _sql = postgres(connectionString, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
    transform: postgres.camel, // rows come back as camelCase in JS
  })

  return _sql
}

// Convenience export for call sites: `import { sql } from '~/lib/db.server'`
// then `await sql\`select 1\``. Implemented as a Proxy so the underlying
// connection is only created on first actual use, keeping process.env reads
// inside a function call rather than at module load time.
export const sql: postgres.Sql = new Proxy((() => {}) as unknown as postgres.Sql, {
  apply(_target, _thisArg, args: [TemplateStringsArray, ...unknown[]]) {
    const db = getDb()
    return (db as unknown as (...a: typeof args) => unknown)(...args)
  },
  get(_target, prop) {
    const db = getDb()
    // @ts-expect-error dynamic proxy forwarding onto the postgres.Sql instance
    const value = db[prop]
    return typeof value === 'function' ? value.bind(db) : value
  },
})

export async function closeDb(): Promise<void> {
  if (_sql) {
    await _sql.end({ timeout: 5 })
    _sql = null
  }
}

// redeploy trigger 2026-08-29T14:28:12.1126753+01:00

