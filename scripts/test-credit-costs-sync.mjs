// Pins the frontend credit-cost display (src/lib/creditCosts.ts) to the prices
// the ledger charges. The ledger reads public.operation_credit_costs, seeded and
// re-priced by migrations; replaying every insert in migration order gives the
// value in force, so a button that quotes a price can never drift from the
// debit that follows the click.

import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

const migrationsDir = 'supabase/migrations'
const server = {}
for (const file of readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort()) {
  const sql = readFileSync(path.join(migrationsDir, file), 'utf8')
  const inserts = sql.matchAll(/INSERT INTO public\.operation_credit_costs \(operation_type, credit_cost(?:, effective_from)?\)\s*VALUES\s*([\s\S]*?);/gu)
  for (const insert of inserts) {
    for (const row of insert[1].matchAll(/\('([a-z_]+)',\s*(\d+)/gu)) {
      server[row[1]] = Number(row[2])
    }
  }
}
assert.ok(Object.keys(server).length >= 10, 'expected the seeded operation prices in the migrations')

const client = readFileSync('src/lib/creditCosts.ts', 'utf8')
const body = client.match(/export const CREDIT_COSTS: Record<MeteredOperation, number> = \{([\s\S]*?)\n\}/u)
assert.ok(body, 'client CREDIT_COSTS object not found')
const clientCosts = {}
for (const row of body[1].matchAll(/^\s*([a-z_]+):\s*(\d+),/gmu)) clientCosts[row[1]] = Number(row[2])

for (const [operation, credits] of Object.entries(clientCosts)) {
  assert.equal(server[operation], credits, `${operation}: UI quotes ${credits} credits but the ledger charges ${server[operation]}`)
}
for (const operation of Object.keys(server)) {
  if (operation === 'other') continue
  assert.ok(operation in clientCosts, `${operation} is priced by the ledger but missing from src/lib/creditCosts.ts`)
}

console.log(`credit costs in sync: ${Object.keys(clientCosts).length} operations`)
