# Retired video service

Video generation is not part of the invite-only MVP. `server.js` is a
fail-closed HTTP 410 tombstone so a forgotten deployment cannot spend HeyGen
quota or mutate Supabase.

Before promoting the MVP, deploy this tombstone once if the historical Railway
service is still live, confirm every `/api/*` request returns 410, then remove
the Railway service and all of its stored secrets. Do not add Supabase service
keys, HeyGen keys, browser CORS, or mutating routes back to this package.
