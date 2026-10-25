/**
 * Stands in for src/lib/supabase.ts in the build-time render, which runs in
 * Node without (and must not need) Supabase credentials. Rendering never
 * queries: data loads in effects and query hooks that do not run on the
 * server. Anything that does touch the client here is a bug, so it throws.
 */
const unavailable = () => {
  throw new Error('Supabase is not available while prerendering marketing pages')
}

export const supabase = new Proxy({}, { get: unavailable }) as never
