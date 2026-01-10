const { Client } = require('pg');
const fs = require('fs');

async function run() {
  // Try connection through Supavisor session mode (port 5432)
  const client = new Client({
    host: 'aws-0-us-west-1.pooler.supabase.com',
    port: 5432,
    user: 'postgres.ysjwveqnwjysldpfqzov',
    password: '06Garc1210.',
    database: 'postgres',
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('Connecting to database...');
    await client.connect();
    console.log('Connected!');

    const sql = fs.readFileSync('supabase/migrations/20260109_client_podcast_approval_dashboard.sql', 'utf8');
    console.log('Running migration...');
    await client.query(sql);
    console.log('Migration completed successfully!');
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run();
