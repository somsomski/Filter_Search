import pg from 'pg';
const { Client } = pg;

async function runMigration() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  
  try {
    await client.connect();
    console.log('✅ Connected to database');
    
    // Check current columns
    const checkResult = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'catalog_hit' 
      AND column_name IN ('engine_series', 'engine_desc_raw')
    `);
    
    console.log('📊 Current columns:', checkResult.rows.map(r => r.column_name));
    
    if (checkResult.rows.length < 2) {
      console.log('🔧 Adding missing columns...');
      await client.query(`
        ALTER TABLE catalog_hit 
        ADD COLUMN IF NOT EXISTS engine_series TEXT, 
        ADD COLUMN IF NOT EXISTS engine_desc_raw TEXT
      `);
      console.log('✅ Columns added');
    } else {
      console.log('✅ Columns already exist');
    }
    
    // Create index
    console.log('📈 Creating index...');
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_catalog_hit_engine_series 
      ON catalog_hit(engine_series)
    `);
    console.log('✅ Index created');
    
    console.log('🎉 Migration completed successfully!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await client.end();
    process.exit(0);
  }
}

runMigration();
