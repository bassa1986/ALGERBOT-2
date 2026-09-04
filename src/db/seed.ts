import postgres from 'postgres'
import { WILAYAS } from './wilayas.data'
import { COMMUNES } from './communes.data'
import { BASE_CATEGORIES } from './categories.data'

// Standalone script (run via `npm run db:seed`), not part of request handling,
// so it's fine to read process.env directly at the top of main().

async function seedWilayas(sql: postgres.Sql) {
  for (const w of WILAYAS) {
    await sql`
      INSERT INTO wilayas (code, name_ar, name_fr)
      VALUES (${w.code}, ${w.nameAr}, ${w.nameFr})
      ON CONFLICT (code) DO UPDATE SET name_ar = EXCLUDED.name_ar, name_fr = EXCLUDED.name_fr
    `
  }
  console.log(`Seeded ${WILAYAS.length} wilayas.`)
}

async function seedCommunes(sql: postgres.Sql) {
  for (const c of COMMUNES) {
    await sql`
      INSERT INTO communes (wilaya_code, code, name_ar, name_fr)
      VALUES (${c.wilayaCode}, ${c.code}, ${c.nameAr}, ${c.nameFr})
      ON CONFLICT (wilaya_code, code) DO UPDATE SET name_ar = EXCLUDED.name_ar, name_fr = EXCLUDED.name_fr
    `
  }
  console.log(`Seeded ${COMMUNES.length} communes.`)
}

async function seedCategories(sql: postgres.Sql) {
  for (const c of BASE_CATEGORIES) {
    await sql`
      INSERT INTO categories (slug, name_ar, name_fr, sort_order)
      VALUES (${c.slug}, ${c.nameAr}, ${c.nameFr}, ${c.sortOrder})
      ON CONFLICT (slug) DO UPDATE SET
        name_ar = EXCLUDED.name_ar,
        name_fr = EXCLUDED.name_fr,
        sort_order = EXCLUDED.sort_order
    `
  }
  console.log(`Seeded ${BASE_CATEGORIES.length} categories.`)
}

async function seedSubscriptionSettings(sql: postgres.Sql) {
  // Default monthly price: 2000.00 DZD = 200000 centimes. Admins can change
  // this later via the admin panel (step 12).
  await sql`
    INSERT INTO subscription_settings (id, monthly_price_centimes, free_trial_days)
    VALUES (true, 200000, 15)
    ON CONFLICT (id) DO NOTHING
  `
  console.log('Ensured subscription_settings row exists.')
}

async function main() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    console.error('DATABASE_URL is not set')
    process.exit(1)
  }

  const sql = postgres(connectionString, { max: 1 })
  try {
    await seedWilayas(sql)
    await seedCommunes(sql)
    await seedCategories(sql)
    await seedSubscriptionSettings(sql)
  } finally {
    await sql.end()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
