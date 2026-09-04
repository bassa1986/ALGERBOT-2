import postgres from 'postgres'
const url = process.env.DATABASE_URL
const sql = postgres(url, { ssl: url.includes('localhost') ? false : 'require' })

const total = await sql`SELECT count(*) FROM communes`
const w16 = await sql`SELECT count(*) FROM communes WHERE wilaya_code = 16`
const wilayas = await sql`SELECT count(*) FROM wilayas`

console.log('Total communes:', total[0].count)
console.log('Wilaya 16 communes:', w16[0].count)
console.log('Total wilayas:', wilayas[0].count)

await sql.end()
