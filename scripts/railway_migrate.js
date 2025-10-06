import { pool } from '../src/db.js';
import fs from 'node:fs';

async function runMigration() {
  try {
    console.log('🚀 Starting Railway migration for engine series support...');
    
    if (!pool) {
      console.error('❌ Database connection not available');
      process.exit(1);
    }

    console.log('📊 Checking current table structure...');
    
    // Check if columns already exist
    const checkResult = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'catalog_hit' 
      AND column_name IN ('engine_series', 'engine_desc_raw')
    `);
    
    if (checkResult.rows.length === 2) {
      console.log('✅ Engine series columns already exist, skipping migration');
      process.exit(0);
    }
    
    console.log('🔧 Adding engine_series and engine_desc_raw columns...');
    
    // Add columns
    await pool.query(`
      ALTER TABLE catalog_hit
      ADD COLUMN IF NOT EXISTS engine_series   TEXT,
      ADD COLUMN IF NOT EXISTS engine_desc_raw TEXT
    `);
    
    console.log('📈 Creating index for engine series disambiguation...');
    
    // Add index
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_catalog_hit_engine_series 
      ON catalog_hit(engine_series)
    `);
    
    console.log('✅ Migration completed successfully!');
    
    // Verify migration
    const verifyResult = await pool.query(`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'catalog_hit' 
      AND column_name IN ('engine_series', 'engine_desc_raw')
      ORDER BY column_name
    `);
    
    console.log('🔍 Migration verification:');
    verifyResult.rows.forEach(row => {
      console.log(`   - ${row.column_name}: ${row.data_type} (nullable: ${row.is_nullable})`);
    });
    
    // Check index
    const indexResult = await pool.query(`
      SELECT indexname, indexdef 
      FROM pg_indexes 
      WHERE tablename = 'catalog_hit' 
      AND indexname = 'idx_catalog_hit_engine_series'
    `);
    
    if (indexResult.rows.length > 0) {
      console.log('✅ Index created successfully');
    }
    
    console.log('🎉 Railway migration completed! Engine series support is now active.');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

runMigration();
