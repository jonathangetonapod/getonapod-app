# Retired video service

Video generation is not part of the invite-only MVP. `server.js` is a
fail-closed HTTP 410 tombstone so a forgotten deployment cannot spend HeyGen
quota or mutate Supabase.

The production Railway service was replaced with this tombstone on 2026-07-21.
`/health` reports `retired`, every tested historical `/api/*` path returns 410,
and its HeyGen/Supabase application variables were removed. The credential-free
service remains temporarily for audit and caller-observation value; delete the
project only after external caller quietness and explicit approval. Do not add Supabase
service keys, HeyGen keys, browser CORS, or mutating routes back to this package.
