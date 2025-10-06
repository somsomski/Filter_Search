import('./dist/src/db.js').then(async ({ pool }) => {
  try {
    console.log('🚀 Starting Railway migration...');
    
    // Check current columns
    const checkResult = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'catalog_hit' 
      AND column_name IN ('engine_series', 'engine_desc_raw')
    `);
    
    console.log('📊 Current columns:', checkResult.rows.map(r => r.column_name));
    
    if (checkResult.rows.length < 2) {
      console.log('🔧 Adding missing columns...');
      await pool.query(`
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
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_catalog_hit_engine_series 
      ON catalog_hit(engine_series)
    `);
    console.log('✅ Index created');
    
    console.log('🎉 Migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
});
