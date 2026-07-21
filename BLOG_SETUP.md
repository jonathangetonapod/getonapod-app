# Public blog in the invite-only MVP

The public `/blog` and `/blog/:slug` marketing routes remain available. The
former administrator blog application, editor, and `/admin/blog/*` routes are
retired; those URLs redirect to `/admin/dashboard` and their page source is not
part of this release.

Public reads use the bounded `get-blog-posts` and `get-blog-categories` Edge
Functions. Database tables remain anonymous-denied; the functions return only
published content through narrow projections. The public routes stay in the
sitemap when a strict release build can read published posts.

There is no supported browser publishing workflow in this MVP. Any temporary
operator publishing process must use server-side credentials outside the
frontend and receive its own review. Do not restore the deleted admin editor or
put provider/service keys in a `VITE_` environment variable.

See [README.md](README.md) and
[docs/invite-only-mvp.md](docs/invite-only-mvp.md) for the release scope,
function allowlist, and staging gates.
