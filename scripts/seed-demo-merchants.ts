// Demo seed data: 20 merchant accounts in Algiers (wilaya 16), each with a
// published store and one published product, spread across different
// product categories, for demoing/testing the marketplace with realistic
// data instead of an empty database.
//
// PHOTO SOURCING NOTE: product images are real photo URLs from Pexels
// (images.pexels.com), verified one at a time by fetching each photo's
// actual Pexels page during this script's creation -- not fabricated IDs.
// Pexels' license (pexels.com/license) allows free commercial use without
// attribution. All 19 catalog categories now have a distinct, verified,
// category-accurate image (previously only 7 did; the other 12 shared one
// generic fallback photo). These are still stock photos, not real merchant
// product photos -- replace with the merchant's own photos before using
// this as real launch content.
//
// Usage: npx tsx scripts/seed-demo-merchants.ts
// Safe to re-run: skips any merchant whose telegram_user_id already exists.

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

// Fake but well-formed Telegram user ids for demo accounts, well outside
// any real Telegram id range collision risk for a dev/staging database.
const DEMO_TELEGRAM_ID_BASE = 900000001

function pexelsUrl(photoId) {
  return 'https://images.pexels.com/photos/' + photoId + '/pexels-photo-' + photoId + '.jpeg?auto=compress&cs=tinysrgb&w=1200'
}

const MERCHANTS = [
  {
    storeName: 'Boutique El Djazair Homme',
    storeSlug: 'boutique-el-djazair-homme',
    fullName: 'Karim Belkacemi',
    categorySlug: 'vetements-homme',
    communeCode: 1601,
    communeNameFr: 'Alger Centre',
    productName: 'Costume homme classique',
    priceCentimes: 850000,
    imageUrl: pexelsUrl(12729102), // verified: "Clothing Boutique for Men" - Aysegul Aytoren
    imageVerified: true,
  },
  {
    storeName: 'Chic Femme Alger',
    storeSlug: 'chic-femme-alger',
    fullName: 'Amina Bouzid',
    categorySlug: 'vetements-femme',
    communeCode: 1610,
    communeNameFr: 'El Biar',
    productName: 'Robe élégante collection été',
    priceCentimes: 450000,
    imageUrl: pexelsUrl(1488463), // verified: "Photo of Women's Clothing" - Edgars Kisuro
    imageVerified: true,
  },
  {
    storeName: 'Petits Anges Kids',
    storeSlug: 'petits-anges-kids',
    fullName: 'Sonia Meziane',
    categorySlug: 'vetements-enfant',
    communeCode: 1618,
    communeNameFr: 'Kouba',
    productName: 'Ensemble enfant coton',
    priceCentimes: 180000,
    imageUrl: pexelsUrl(6461392), // verified: "A Stack of Folded Clothes on the Table" - Pavel Danilyuk
    imageVerified: true,
  },
  {
    storeName: 'Sneaker House DZ',
    storeSlug: 'sneaker-house-dz',
    fullName: 'Yacine Rahmani',
    categorySlug: 'chaussures',
    communeCode: 1617,
    communeNameFr: 'Hussein Dey',
    productName: 'Baskets running homme',
    priceCentimes: 650000,
    imageUrl: pexelsUrl(1027130), // verified: "Vibrant red sneakers" - zaktech90
    imageVerified: true,
  },
  {
    storeName: 'Beauté Naturelle Alger',
    storeSlug: 'beaute-naturelle-alger',
    fullName: 'Lina Cherif',
    categorySlug: 'beaute-soins',
    communeCode: 1609,
    communeNameFr: 'Bir Mourad Rais',
    productName: 'Coffret soins visage bio',
    priceCentimes: 320000,
    imageUrl: pexelsUrl(3735626), // verified: "Beauty Products on Table" - Polina Tankilevitch
    imageVerified: true,
  },
  {
    storeName: 'TechZone Algérie',
    storeSlug: 'techzone-algerie',
    fullName: 'Riad Ouali',
    categorySlug: 'electronique',
    communeCode: 1613,
    communeNameFr: 'El Harrach',
    productName: 'Casque audio sans fil',
    priceCentimes: 550000,
    imageUrl: pexelsUrl(2015876), // verified: "Top view of modern gadgets" - Huy Phan
    imageVerified: true,
  },
  {
    storeName: 'Mobile Store Bab Ezzouar',
    storeSlug: 'mobile-store-bab-ezzouar',
    fullName: 'Farid Hamdi',
    categorySlug: 'telephones-accessoires',
    communeCode: 1620,
    communeNameFr: 'Dar El Beida',
    productName: 'Coque de protection smartphone',
    priceCentimes: 120000,
    imageUrl: pexelsUrl(3945679), // verified: "Minimalist overhead shot of iPhones, iPad, and earphones" - cottonbro
    imageVerified: true,
  },
  {
    storeName: 'Maison & Cuisine Alger',
    storeSlug: 'maison-cuisine-alger',
    fullName: 'Nadia Boumediene',
    categorySlug: 'maison-cuisine',
    communeCode: 1611,
    communeNameFr: 'Bouzareah',
    productName: 'Service de table 12 pièces',
    priceCentimes: 280000,
    imageUrl: pexelsUrl(1395967), // verified: "Close-up Photo of Dinnerware Set on Top of Table With Glass Cups" - Mat Brown
    imageVerified: true,
  },
  {
    storeName: 'Déco Design Alger',
    storeSlug: 'deco-design-alger',
    fullName: 'Samir Belaid',
    categorySlug: 'meubles-deco',
    communeCode: 1602,
    communeNameFr: "Sidi M'hamed",
    productName: 'Lampe de salon design',
    priceCentimes: 420000,
    imageUrl: pexelsUrl(19899071), // verified: "Modern Living Room" (minimalist decor with lamp) - Lisa Anna
    imageVerified: true,
  },
  {
    storeName: 'Sport Plus Algérie',
    storeSlug: 'sport-plus-algerie',
    fullName: 'Mounir Zerrouki',
    categorySlug: 'sport-loisirs',
    communeCode: 1612,
    communeNameFr: 'Birkhadem',
    productName: 'Ballon de football officiel',
    priceCentimes: 250000,
    imageUrl: pexelsUrl(274506), // verified: "White Adidas Soccer Ball on Grass" - Pixabay
    imageVerified: true,
  },
  {
    storeName: 'Bébé Confort DZ',
    storeSlug: 'bebe-confort-dz',
    fullName: 'Warda Aissani',
    categorySlug: 'bebe-enfant',
    communeCode: 1619,
    communeNameFr: 'Bachedjerah',
    productName: 'Poussette bébé 3-en-1',
    priceCentimes: 950000,
    imageUrl: pexelsUrl(11477553), // verified: "A Couple Walking while Pushing a Baby Stroller on the Street" - Alexandros Kournoutis
    imageVerified: true,
  },
  {
    storeName: 'Bijouterie El Kasbah',
    storeSlug: 'bijouterie-el-kasbah',
    fullName: 'Hocine Brahimi',
    categorySlug: 'bijoux-montres',
    communeCode: 1607,
    communeNameFr: 'Casbah',
    productName: 'Montre homme acier inoxydable',
    priceCentimes: 780000,
    imageUrl: pexelsUrl(2113994), // verified: "Close-Up Photo of Wristwatch" (metal band) - Joey Nguyễn
    imageVerified: true,
  },
  {
    storeName: 'Maroquinerie Alger',
    storeSlug: 'maroquinerie-alger',
    fullName: 'Fatiha Kaci',
    categorySlug: 'sacs-bagagerie',
    communeCode: 1603,
    communeNameFr: 'El Madania',
    productName: 'Sac à main cuir véritable',
    priceCentimes: 380000,
    imageUrl: pexelsUrl(2977304), // verified: "Brown Leather Handbag" - Stanislav Kondratiev
    imageVerified: true,
  },
  {
    storeName: 'Épicerie Fine Alger',
    storeSlug: 'epicerie-fine-alger',
    fullName: 'Djamel Ferhat',
    categorySlug: 'epicerie',
    communeCode: 1605,
    communeNameFr: 'Bab El Oued',
    productName: 'Coffret gourmand produits du terroir',
    priceCentimes: 220000,
    imageUrl: pexelsUrl(5961371), // verified: "A Top View of a Table with Assorted Food" (charcuterie spread) - cottonbro studio
    imageVerified: true,
  },
  {
    storeName: 'Auto Pièces Alger',
    storeSlug: 'auto-pieces-alger',
    fullName: 'Abdelkader Yousfi',
    categorySlug: 'auto-moto',
    communeCode: 1615,
    communeNameFr: 'Oued Smar',
    productName: 'Kit entretien véhicule',
    priceCentimes: 320000,
    imageUrl: pexelsUrl(8478233), // verified: "Mechanic Fixing a Car" (close-up engine/tools) - Sergey Meshkov
    imageVerified: true,
  },
  {
    storeName: 'Bricolage Pro DZ',
    storeSlug: 'bricolage-pro-dz',
    fullName: 'Salim Nacer',
    categorySlug: 'bricolage-jardin',
    communeCode: 1614,
    communeNameFr: 'Baraki',
    productName: 'Coffret outils 45 pièces',
    priceCentimes: 480000,
    imageUrl: pexelsUrl(5357150), // verified: "Close up of Tools" (wrench/screwdriver/hammer flat lay) - Maria Mileta
    imageVerified: true,
  },
  {
    storeName: 'Jouet Magique Alger',
    storeSlug: 'jouet-magique-alger',
    fullName: 'Souad Larbi',
    categorySlug: 'jouets',
    communeCode: 1616,
    communeNameFr: 'Bourouba',
    productName: 'Circuit de voitures télécommandées',
    priceCentimes: 350000,
    imageUrl: pexelsUrl(6865340), // verified: "Yellow and Blue Wooden Toy Cars" - Ann H
    imageVerified: true,
  },
  {
    storeName: 'Librairie du Savoir',
    storeSlug: 'librairie-du-savoir',
    fullName: 'Mohamed Sadi',
    categorySlug: 'librairie-papeterie',
    communeCode: 1606,
    communeNameFr: 'Bologhine Ibnou Ziri',
    productName: 'Ensemble fournitures scolaires',
    priceCentimes: 150000,
    imageUrl: pexelsUrl(5088017), // verified: "Spiral Notebook Pencils and Paper Clips Flatlay" - olia danilevich
    imageVerified: true,
  },
  {
    storeName: 'Artisanat Traditionnel Alger',
    storeSlug: 'artisanat-traditionnel-alger',
    fullName: 'Khadidja Slimani',
    categorySlug: 'artisanat',
    communeCode: 1608,
    communeNameFr: 'Oued Koriche',
    productName: 'Plateau en cuivre gravé main',
    priceCentimes: 620000,
    imageUrl: pexelsUrl(827519), // verified: "Brass-colored Oil Lamp" (copper/brass decor still life) - Valeria Boltneva
    imageVerified: true,
  },
  {
    storeName: 'Bazar El Djazair',
    storeSlug: 'bazar-el-djazair',
    fullName: 'Rachid Toumi',
    categorySlug: 'divers',
    communeCode: 1604,
    communeNameFr: 'Mohamed Belouzdad',
    productName: 'Assortiment articles ménagers',
    priceCentimes: 190000,
    imageUrl: pexelsUrl(12292644), // verified: "Kitchen Cooking Utensils Photo" (hanging utensils) - dada _design
    imageVerified: true,
  },
]

async function main() {
  console.log('Seeding ' + MERCHANTS.length + ' demo merchants in Algiers (wilaya 16)...')

  const categoryRows = await sql`SELECT id, slug FROM categories`
  const categoryIdBySlug = new Map(categoryRows.map((c) => [c.slug, c.id]))

  let created = 0
  let skipped = 0
  let unverifiedImageCount = 0

  for (let i = 0; i < MERCHANTS.length; i++) {
    const m = MERCHANTS[i]
    const telegramUserId = DEMO_TELEGRAM_ID_BASE + i

    const existing = await sql`SELECT id FROM merchants WHERE telegram_user_id = ${telegramUserId}`
    if (existing.length > 0) {
      console.log('  Skipping ' + m.storeName + ' (already seeded)')
      skipped++
      continue
    }

    const categoryId = categoryIdBySlug.get(m.categorySlug) ?? null
    if (!categoryId) {
      console.warn('  WARNING: category slug "' + m.categorySlug + '" not found -- product will have no category')
    }
    if (!m.imageVerified) unverifiedImageCount++

    await sql.begin(async (tx) => {
      const [merchant] = await tx`
        INSERT INTO merchants (telegram_user_id, telegram_username, full_name, status, onboarding_completed_at, plan_id)
        VALUES (${telegramUserId}, ${'demo_' + m.storeSlug.replace(/-/g, '_')}, ${m.fullName}, 'active', now(), 'starter')
        RETURNING id
      `

      const [store] = await tx`
        INSERT INTO stores (
          merchant_id, slug, name, description, base_wilaya_code, base_commune_code, is_published
        )
        VALUES (
          ${merchant.id}, ${m.storeSlug}, ${m.storeName},
          ${'Boutique à ' + m.communeNameFr + ', Alger.'},
          16, ${m.communeCode}, true
        )
        RETURNING id
      `

      // A published store also needs an active subscription for every
      // buyer-facing query to actually surface it (see the
      // `sub.current_period_expires_at > now()` check used throughout
      // src/server/marketplace.ts and storefront-public.ts).
      await tx`
        INSERT INTO subscriptions (merchant_id, current_period_expires_at)
        VALUES (${merchant.id}, now() + interval '1 year')
      `

      const [product] = await tx`
        INSERT INTO products (store_id, category_id, sku, name, price_centimes, is_published)
        VALUES (${store.id}, ${categoryId}, 'DEMO-001', ${m.productName}, ${m.priceCentimes}, true)
        RETURNING id
      `

      await tx`
        INSERT INTO product_images (product_id, storage_key, url, sort_order, is_cover)
        VALUES (${product.id}, ${'demo/' + m.storeSlug + '/1.jpg'}, ${m.imageUrl}, 0, true)
      `
    })

    console.log('  Created ' + m.storeName + ' (' + m.categorySlug + ')' + (m.imageVerified ? '' : ' [placeholder image]'))
    created++
  }

  console.log('\nDone. Created ' + created + ', skipped ' + skipped + ' (already existed).')
  if (unverifiedImageCount > 0) {
    console.log(
      '\nNOTE: ' + unverifiedImageCount + ' product(s) are using an unverified image -- check ' +
        'the "imageVerified: false" entries in this script and replace imageUrl with a real, ' +
        'checked Pexels URL (or the merchant\'s own photo) before using this as real launch content.',
    )
  }

  await sql.end()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
