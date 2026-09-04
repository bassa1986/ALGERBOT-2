import postgres from 'postgres'
const url = process.env.DATABASE_URL
const sql = postgres(url, { ssl: url.includes('localhost') ? false : 'require' })

const cats = await sql`SELECT count(*) FROM categories`
const merchants = await sql`SELECT id, telegram_user_id, full_name, status FROM merchants ORDER BY id`
const stores = await sql`SELECT id, merchant_id, slug, name, is_published FROM stores`
const products = await sql`SELECT id, store_id, name, is_published FROM products`
const subs = await sql`SELECT merchant_id, current_period_expires_at FROM subscriptions`

console.log('Categories count:', cats[0].count)
console.log('Merchants:', JSON.stringify(merchants, null, 2))
console.log('Stores:', JSON.stringify(stores, null, 2))
console.log('Products:', JSON.stringify(products, null, 2))
console.log('Subscriptions:', JSON.stringify(subs, null, 2))

await sql.end()
