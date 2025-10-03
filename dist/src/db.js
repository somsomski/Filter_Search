import { Pool } from 'pg';
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
    console.warn('DATABASE_URL is not set - database functionality will be limited');
}
export const pool = DATABASE_URL ? new Pool({
    connectionString: DATABASE_URL,
    max: 10
}) : null;
