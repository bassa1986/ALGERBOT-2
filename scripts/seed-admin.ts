// One-time admin account creation script (command line, not the web UI).
// Only ever creates ONE admin — the same database-level singleton
// constraint that protects createFirstAdmin (admins_singleton_idx, see
// migration 0011) protects this script too, so running it twice on a
// database that already has an admin fails loudly instead of creating a
// second account.
//
// Usage:
//   ADMIN_EMAIL=you@example.com ADMIN_NAME="Your Name" npx tsx scripts/seed-admin.ts
//   (ADMIN_PASSWORD is optional — a strong random one is generated and
//   printed once if you don't supply it. Nothing is logged anywhere else.)

import postgres from 'postgres'
import { randomBytes } from 'node:crypto'

const sql = process.env.DATABASE_URL
  ? postgres(process.env.DATABASE_URL, {
      ssl:
        process.env.DATABASE_URL.includes('localhost') || process.env.DATABASE_URL.includes('127.0.0.1')
          ? false
          : 'require',
    })
  : postgres({
      host: process.env.PGHOST || 'localhost',
      port: parseInt(process.env.PGPORT || '5432'),
      database: process.env.PGDATABASE || 'pivodb',
      username: process.env.PGUSER || 'postgres',
      password: process.env.PGPASSWORD || 'postgres',
      ssl: process.env.PGHOST ? 'require' : false,
    })

// Mirrors src/lib/crypto.ts hashPassword() exactly (kept as a standalone
// copy here since this script runs outside the app's module graph via a
// plain `tsx scripts/seed-admin.ts` invocation, not the Vite/TanStack
// build — importing src/lib/crypto.ts directly works too if your `tsx`
// setup resolves the `~/` alias; this copy avoids depending on that).
const PBKDF2_ITERATIONS = 210_000

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder()
  const salt = randomBytes(16)
  const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, [
    'deriveBits',
  ])
  const derivedBits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    256,
  )
  const hex = (buf: ArrayBuffer | Uint8Array) =>
    Array.from(buf instanceof Uint8Array ? buf : new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
  return `pbkdf2$${PBKDF2_ITERATIONS}$${hex(salt)}$${hex(derivedBits)}`
}

function generateStrongPassword(): string {
  // 18 random bytes -> 24-char base64url string. Well above the app's
  // own 10-character minimum, and never logged or stored anywhere except
  // this one console.log below.
  return randomBytes(18).toString('base64url')
}

async function main() {
  const email = process.env.ADMIN_EMAIL
  const fullName = process.env.ADMIN_NAME
  const password = process.env.ADMIN_PASSWORD || generateStrongPassword()
  const generatedPassword = !process.env.ADMIN_PASSWORD

  if (!email || !fullName) {
    console.error('Usage: ADMIN_EMAIL=... ADMIN_NAME="..." [ADMIN_PASSWORD=...] npx tsx scripts/seed-admin.ts')
    process.exit(1)
  }

  const existing = await sql`SELECT id, email FROM admins LIMIT 1`
  if (existing.length > 0) {
    console.error(
      `Refusing to create a second admin account — one already exists (${existing[0].email}). ` +
        `This project allows exactly one admin account. Use the "forgot password" flow to regain access instead.`,
    )
    await sql.end()
    process.exit(1)
  }

  const passwordHash = await hashPassword(password)

  try {
    await sql`
      INSERT INTO admins (email, password_hash, full_name, is_super_admin)
      VALUES (${email.toLowerCase()}, ${passwordHash}, ${fullName}, true)
    `
  } catch (err) {
    if (err && typeof err === 'object' && 'code' in err && err.code === '23505') {
      console.error('Another admin account was created concurrently — aborting.')
      await sql.end()
      process.exit(1)
    }
    throw err
  }

  console.log('Admin account created.')
  console.log(`  Email: ${email.toLowerCase()}`)
  if (generatedPassword) {
    console.log(`  Password (save this now — it will not be shown again): ${password}`)
  } else {
    console.log('  Password: (the one you provided in ADMIN_PASSWORD)')
  }

  await sql.end()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
