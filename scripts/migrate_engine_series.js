import { pool } from '../src/db.js';
import fs from 'node:fs';

async function runMigration() {
  try {
    console.log('Starting engine series migration...');
    
    if (!pool) {
      console.error('Database connection not available');
      process.exit(1);
    }

    // Read migration file
    const migrationSQL = fs.readFileSync('migrations/003_engine_series.sql', 'utf8');
    
    // Execute migration
    await pool.query(migrationSQL);
    
    console.log('Migration completed successfully!');
    
    // Verify migration
    const result = await pool.query(`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'catalog_hit' 
      AND column_name IN ('engine_series', 'engine_desc_raw')
      ORDER BY column_name
    `);
    
    console.log('Migration verification:');
    result.rows.forEach(row => {
      console.log(`- ${row.column_name}: ${row.data_type} (nullable: ${row.is_nullable})`);
    });
    
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

runMigration();
