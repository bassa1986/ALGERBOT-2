import { readdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'

// Standalone script — not part of the request-handling app, so it reads
// process.env directly here (this file's whole job is to run at CLI-invocation
// time, not to be imported into route/server-function code).

const __dirname = dirname(fileURLToPath(import.meta.url))
const MIGRATIONS_DIR = join(__dirname, 'migrations')

type Direction = 'up' | 'down'

interface MigrationFile {
  version: string // e.g. "0001"
  name: string // e.g. "0001_init.sql"
  upPath: string
  downPath: string
}

function loadMigrations(): MigrationFile[] {
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.up.sql'))
  return files
    .map((f) => {
      const version = f.split('_')[0]
      const base = f.replace('.up.sql', '')
      return {
        version,
        name: base,
        upPath: join(MIGRATIONS_DIR, `${base}.up.sql`),
        downPath: join(MIGRATIONS_DIR, `${base}.down.sql`),
      }
    })
    .sort((a, b) => a.version.localeCompare(b.version))
}

async function ensureMigrationsTable(sql: postgres.Sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `
}

async function getAppliedVersions(sql: postgres.Sql): Promise<Set<string>> {
  const rows = await sql<{ version: string }[]>`SELECT version FROM schema_migrations`
  return new Set(rows.map((r) => r.version))
}

// Arbitrary, fixed lock key for this app's own migration runner —
// scoped to a session-level advisory lock (pg_advisory_lock), not tied to
// any table/row, so it has zero interaction with real app data. Chosen
// once and never reused elsewhere in this codebase.
const MIGRATION_LOCK_KEY = 727_483_910

/**
 * Serializes concurrent invocations of this script against the SAME
 * database. Without this, deploying multiple replicas that each run
 * `db:migrate` in their own container entrypoint (see the Dockerfile CMD)
 * at startup could have two replicas both see the same pending migration
 * as unapplied and both attempt to run it concurrently — best case a
 * harmless error from the second one (e.g. a duplicate CREATE TABLE), worst
 * case a genuine race inside the migration's own SQL. pg_advisory_lock
 * blocks the second caller until the first releases the lock (i.e. until
 * migration application finishes), rather than erroring outright — so a
 * second replica just waits its turn, then finds nothing left to do.
 */
async function withMigrationLock<T>(sql: postgres.Sql, fn: () => Promise<T>): Promise<T> {
  await sql`SELECT pg_advisory_lock(${MIGRATION_LOCK_KEY})`
  try {
    return await fn()
  } finally {
    await sql`SELECT pg_advisory_unlock(${MIGRATION_LOCK_KEY})`
  }
}

async function up(sql: postgres.Sql) {
  await ensureMigrationsTable(sql)
  const applied = await getAppliedVersions(sql)
  const migrations = loadMigrations()

  let ranAny = false
  for (const m of migrations) {
    if (applied.has(m.version)) continue
    const script = readFileSync(m.upPath, 'utf-8')
    console.log(`Applying ${m.name}...`)
    await sql.begin(async (tx) => {
      await tx.unsafe(script)
      await tx`INSERT INTO schema_migrations (version, name) VALUES (${m.version}, ${m.name})`
    })
    console.log(`  done.`)
    ranAny = true
  }
  if (!ranAny) console.log('No pending migrations.')
}

async function down(sql: postgres.Sql) {
  await ensureMigrationsTable(sql)
  const applied = await getAppliedVersions(sql)
  const migrations = loadMigrations()
    .filter((m) => applied.has(m.version))
    .sort((a, b) => b.version.localeCompare(a.version))

  const last = migrations[0]
  if (!last) {
    console.log('No migrations to roll back.')
    return
  }
  const script = readFileSync(last.downPath, 'utf-8')
  console.log(`Rolling back ${last.name}...`)
  await sql.begin(async (tx) => {
    await tx.unsafe(script)
    await tx`DELETE FROM schema_migrations WHERE version = ${last.version}`
  })
  console.log('  done.')
}

async function main() {
  const direction = process.argv[2] as Direction
  if (direction !== 'up' && direction !== 'down') {
    console.error('Usage: tsx src/db/migrate.ts <up|down>')
    process.exit(1)
  }

  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    console.error('DATABASE_URL is not set')
    process.exit(1)
  }

  const sql = postgres(connectionString, {
    max: 1,
    ssl: connectionString.includes('localhost') || connectionString.includes('127.0.0.1') ? false : 'require',
  })
  try {
    if (direction === 'up') await withMigrationLock(sql, () => up(sql))
    else await withMigrationLock(sql, () => down(sql))
  } finally {
    await sql.end()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
