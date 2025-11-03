import fs from 'fs';
import pg from 'pg';
const { Client } = pg;

async function runMigration() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  
  try {
    await client.connect();
    console.log('✅ Connected to database');
    
    const sql = fs.readFileSync('migrate_railway.sql', 'utf8');
    const statements = sql.split(';').filter(s => s.trim());
    
    for (const statement of statements) {
      if (statement.trim()) {
        console.log('🔧 Executing:', statement.trim().substring(0, 50) + '...');
        await client.query(statement);
      }
    }
    
    console.log('🎉 Migration completed successfully!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await client.end();
    process.exit(0);
  }
}

runMigration();
