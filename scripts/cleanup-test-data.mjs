import postgres from 'postgres';

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
    });

async function cleanupTestData() {
  console.log('Finding test store...');
  const storeResult = await sql`SELECT id, merchant_id FROM stores WHERE slug = 'test-store';`;

  if (storeResult.length === 0) {
    console.log('No test store found. Nothing to delete.');
  } else {
    const { id: storeId, merchant_id: merchantId } = storeResult[0];
    console.log('Store ID:', storeId, 'Merchant ID:', merchantId);

    console.log('Deleting test products...');
    const deletedProducts = await sql`
      DELETE FROM products WHERE store_id = ${storeId} RETURNING id;
    `;
    console.log(`Deleted ${deletedProducts.length} products.`);

    console.log('Deleting test store...');
    await sql`DELETE FROM stores WHERE id = ${storeId};`;
    console.log('Store deleted.');

    console.log('Deleting test merchant...');
    await sql`DELETE FROM merchants WHERE id = ${merchantId};`;
    console.log('Merchant deleted.');
  }

  // Belt-and-suspenders: also catch the merchant by telegram_user_id in case
  // the store lookup above didn't find it for some reason.
  console.log('Double-checking by telegram_user_id...');
  const leftoverMerchant = await sql`
    SELECT id FROM merchants WHERE telegram_user_id = 999999999;
  `;
  if (leftoverMerchant.length > 0) {
    const id = leftoverMerchant[0].id;
    await sql`DELETE FROM products WHERE store_id IN (SELECT id FROM stores WHERE merchant_id = ${id});`;
    await sql`DELETE FROM stores WHERE merchant_id = ${id};`;
    await sql`DELETE FROM merchants WHERE id = ${id};`;
    console.log('Cleaned up leftover merchant/store/products.');
  } else {
    console.log('No leftover test merchant found.');
  }

  console.log('Cleanup complete!');
  await sql.end();
}

cleanupTestData().catch(console.error);
