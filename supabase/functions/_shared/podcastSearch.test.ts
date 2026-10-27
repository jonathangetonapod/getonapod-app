import { assertEquals } from 'jsr:@std/assert@1'

import { normalizedSearchText, rememberedSearchEmbedding, rememberSearchEmbedding } from './podcastSearch.ts'

const vector = Array.from({ length: 1536 }, (_, index) => index / 1536)

// A stand-in for the admin client: one table, keyed by search_key.
function fakeAdmin(failing = false) {
  const rows = new Map<string, Record<string, unknown>>()
  const admin = {
    rows,
    from: (_table: string) => ({
      select: () => ({
        eq: (_column: string, key: string) => ({
          maybeSingle: async () => failing
            ? { data: null, error: { message: 'down' } }
            : { data: rows.get(key) ?? null, error: null },
        }),
      }),
      update: (patch: Record<string, unknown>) => ({
        eq: async (_column: string, key: string) => {
          const row = rows.get(key)
          if (row) rows.set(key, { ...row, ...patch })
          return { error: null }
        },
      }),
      upsert: async (row: Record<string, unknown>) => {
        if (failing) throw new Error('down')
        rows.set(String(row.search_key), row)
        return { error: null }
      },
    }),
  }
  return admin
}

Deno.test('normalises a search so equal searches share an entry', () => {
  assertEquals(normalizedSearchText('  Real   Estate\tInvesting '), 'real estate investing')
})

Deno.test('a remembered embedding comes back for the same search, in any case or spacing', async () => {
  const admin = fakeAdmin()
  assertEquals(await rememberedSearchEmbedding(admin, 'real estate'), null)
  await rememberSearchEmbedding(admin, 'Real Estate', vector)
  assertEquals(admin.rows.size, 1)
  assertEquals(await rememberedSearchEmbedding(admin, '  real   ESTATE '), vector)
  assertEquals(await rememberedSearchEmbedding(admin, 'real estate investing'), null)
})

Deno.test('a broken store only means a slower search, never an error', async () => {
  const admin = fakeAdmin(true)
  assertEquals(await rememberedSearchEmbedding(admin, 'sales'), null)
  await rememberSearchEmbedding(admin, 'sales', vector)
})
