import { Pool } from 'pg';
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
    console.error('DATABASE_URL is not set');
    process.exit(1);
}
export const pool = new Pool({
    connectionString: DATABASE_URL,
    max: 10
});
