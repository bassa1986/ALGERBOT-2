// One-off fix: the 12 demo products below were seeded with a single reused
// fallback image (see scripts/seed-demo-merchants.ts). Each now has its own
// verified, category-accurate Pexels photo. This script updates only the
// product_images.url for those 12 already-seeded demo products, matched by
// store slug -- it does not touch merchants, stores, or products, and does
// not re-run the seed script.
//
// Usage: node scripts/fix-demo-images.mjs

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

function pexelsUrl(photoId) {
  return 'https://images.pexels.com/photos/' + photoId + '/pexels-photo-' + photoId + '.jpeg?auto=compress&cs=tinysrgb&w=1200'
}

const FIXES = [
  { storeSlug: 'maison-cuisine-alger', imageUrl: pexelsUrl(1395967) }, // Dinnerware Set - Mat Brown
  { storeSlug: 'deco-design-alger', imageUrl: pexelsUrl(19899071) }, // Modern Living Room - Lisa Anna
  { storeSlug: 'sport-plus-algerie', imageUrl: pexelsUrl(274506) }, // Soccer Ball on Grass - Pixabay
  { storeSlug: 'bebe-confort-dz', imageUrl: pexelsUrl(11477553) }, // Baby Stroller - Alexandros Kournoutis
  { storeSlug: 'bijouterie-el-kasbah', imageUrl: pexelsUrl(2113994) }, // Wristwatch - Joey Nguyễn
  { storeSlug: 'maroquinerie-alger', imageUrl: pexelsUrl(2977304) }, // Leather Handbag - Stanislav Kondratiev
  { storeSlug: 'epicerie-fine-alger', imageUrl: pexelsUrl(5961371) }, // Assorted Food - cottonbro studio
  { storeSlug: 'auto-pieces-alger', imageUrl: pexelsUrl(8478233) }, // Mechanic Fixing a Car - Sergey Meshkov
  { storeSlug: 'bricolage-pro-dz', imageUrl: pexelsUrl(5357150) }, // Tools flat lay - Maria Mileta
  { storeSlug: 'jouet-magique-alger', imageUrl: pexelsUrl(6865340) }, // Wooden Toy Cars - Ann H
  { storeSlug: 'librairie-du-savoir', imageUrl: pexelsUrl(5088017) }, // School Supplies Flatlay - olia danilevich
  { storeSlug: 'artisanat-traditionnel-alger', imageUrl: pexelsUrl(827519) }, // Brass Oil Lamp - Valeria Boltneva
  { storeSlug: 'bazar-el-djazair', imageUrl: pexelsUrl(12292644) }, // Kitchen Utensils - dada _design
]

async function main() {
  console.log(`Updating ${FIXES.length} demo product images...`)
  let updated = 0
  let notFound = 0

  for (const fix of FIXES) {
    const rows = await sql`
      UPDATE product_images pi
      SET url = ${fix.imageUrl}
      FROM products p
      JOIN stores s ON s.id = p.store_id
      WHERE pi.product_id = p.id
        AND s.slug = ${fix.storeSlug}
        AND pi.is_cover = true
      RETURNING pi.id
    `
    if (rows.length === 0) {
      console.warn(`  WARNING: no cover image found for store "${fix.storeSlug}" -- skipped`)
      notFound++
    } else {
      console.log(`  Updated ${fix.storeSlug} (${rows.length} row(s))`)
      updated++
    }
  }

  console.log(`\nDone. Updated ${updated}, not found ${notFound}.`)
  await sql.end()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
