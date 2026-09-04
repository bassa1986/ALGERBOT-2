import postgres from 'postgres'

const url = process.env.DATABASE_URL
if (!url) {
  console.error('Set DATABASE_URL first')
  process.exit(1)
}

const sql = postgres(url, { ssl: url.includes('localhost') ? false : 'require' })

const merchants = await sql`SELECT count(*) FROM merchants WHERE telegram_user_id >= 900000001`
const products = await sql`SELECT count(*) FROM products WHERE is_published = true`
const stores = await sql`SELECT count(*) FROM stores WHERE is_published = true`
const subs = await sql`SELECT count(*) FROM subscriptions WHERE current_period_expires_at > now()`

console.log('Demo merchants found:', merchants[0].count)
console.log('Published products:', products[0].count)
console.log('Published stores:', stores[0].count)
console.log('Active subscriptions:', subs[0].count)

await sql.end()
