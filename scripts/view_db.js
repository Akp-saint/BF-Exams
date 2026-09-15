/**
 * Inspecteur PostgreSQL du portail.
 * Usage: DATABASE_URL=... node scripts/view_db.js
 *        DATABASE_URL=... node scripts/view_db.js "SELECT ..."
 */
const { Client } = require('pg');

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL est obligatoire.');
}

const client = new Client({ connectionString: process.env.DATABASE_URL });
const query = process.argv[2] || `SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'public' ORDER BY table_name`;

(async () => {
  await client.connect();
  const result = await client.query(query);
  console.table(result.rows);
  await client.end();
})().catch(async (error) => {
  console.error('Erreur PostgreSQL :', error.message);
  await client.end().catch(() => {});
  process.exit(1);
});
