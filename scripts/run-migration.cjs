const { Client } = require('pg')
const fs = require('fs')
const path = require('path')

async function run() {
  const databaseUrl = process.env.DATABASE_URL
  const migrationArgument = process.env.MIGRATION_FILE
  if (!databaseUrl || !migrationArgument) {
    throw new Error('DATABASE_URL and MIGRATION_FILE are required')
  }

  const migrationsRoot = path.resolve('supabase/migrations')
  const migrationFile = path.resolve(migrationArgument)
  if (!migrationFile.startsWith(`${migrationsRoot}${path.sep}`) || !migrationFile.endsWith('.sql')) {
    throw new Error('MIGRATION_FILE must be a .sql file inside supabase/migrations')
  }

  const client = new Client({
    connectionString: databaseUrl,
    ssl: process.env.DATABASE_SSL === 'disable' ? false : { rejectUnauthorized: true },
  })

  try {
    await client.connect()
    await client.query(fs.readFileSync(migrationFile, 'utf8'))
    console.log(`Migration completed: ${path.basename(migrationFile)}`)
  } finally {
    await client.end()
  }
}

run().catch((error) => {
  console.error('Migration failed:', error instanceof Error ? error.message : 'Unknown error')
  process.exitCode = 1
})
