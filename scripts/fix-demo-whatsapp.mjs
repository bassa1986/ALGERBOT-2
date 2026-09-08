// One-off fix: the 20 demo merchants were originally seeded with a
// Telegram username but no whatsapp_number, so the storefront's negotiate
// panel only ever showed the Telegram option, never WhatsApp. Each demo
// merchant now gets a fake-but-well-formed Algerian number, matching the
// same DEMO_WHATSAPP_BASE + index pattern used in the updated
// seed-demo-merchants.ts (so a future full re-seed on a fresh database
// produces the identical numbers). This script updates only
// merchants.whatsapp_number for these 20 already-seeded demo merchants,
// matched by store slug -- it does not touch anything else.
//
// Usage: node scripts/fix-demo-whatsapp.mjs

import postgres from 'postgres'

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

// Must stay in the exact order MERCHANTS appears in seed-demo-merchants.ts
// -- the index here IS the same index used to derive each demo merchant's
// whatsapp_number (DEMO_WHATSAPP_BASE + index) and telegram_user_id
// (DEMO_TELEGRAM_ID_BASE + index) there.
const STORE_SLUGS_IN_SEED_ORDER = [
  'boutique-el-djazair-homme',
  'chic-femme-alger',
  'petits-anges-kids',
  'sneaker-house-dz',
  'beaute-naturelle-alger',
  'techzone-algerie',
  'mobile-store-bab-ezzouar',
  'maison-cuisine-alger',
  'deco-design-alger',
  'sport-plus-algerie',
  'bebe-confort-dz',
  'bijouterie-el-kasbah',
  'maroquinerie-alger',
  'epicerie-fine-alger',
  'auto-pieces-alger',
  'bricolage-pro-dz',
  'jouet-magique-alger',
  'librairie-du-savoir',
  'artisanat-traditionnel-alger',
  'bazar-el-djazair',
]

const DEMO_WHATSAPP_BASE = 213555000001

async function main() {
  console.log(`Updating whatsapp_number for ${STORE_SLUGS_IN_SEED_ORDER.length} demo merchants...`)
  let updated = 0
  let notFound = 0
  let skippedAlreadySet = 0

  for (let i = 0; i < STORE_SLUGS_IN_SEED_ORDER.length; i++) {
    const storeSlug = STORE_SLUGS_IN_SEED_ORDER[i]
    const whatsappNumber = String(DEMO_WHATSAPP_BASE + i)

    const existing = await sql`
      SELECT m.id, m.whatsapp_number
      FROM merchants m
      JOIN stores s ON s.merchant_id = m.id
      WHERE s.slug = ${storeSlug}
    `
    if (existing.length === 0) {
      console.warn(`  WARNING: no merchant found for store "${storeSlug}" -- skipped`)
      notFound++
      continue
    }
    if (existing[0].whatsapp_number) {
      console.log(`  Skipping ${storeSlug} -- already has a whatsapp_number set`)
      skippedAlreadySet++
      continue
    }

    await sql`
      UPDATE merchants SET whatsapp_number = ${whatsappNumber} WHERE id = ${existing[0].id}
    `
    console.log(`  Updated ${storeSlug} -> ${whatsappNumber}`)
    updated++
  }

  console.log(`\nDone. Updated ${updated}, already set ${skippedAlreadySet}, not found ${notFound}.`)
  await sql.end()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
