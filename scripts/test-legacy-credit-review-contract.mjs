import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync('supabase/functions/manage-workspace-staff/index.ts', 'utf8')
const migration = readFileSync('supabase/migrations/20261031000400_legacy_credit_reviews.sql', 'utf8')
const queueStart = source.indexOf('if (action === "legacy-credit-review-queue")')
const reviewStart = source.indexOf('if (["legacy-credit-overview", "legacy-credit-review-request", "legacy-credit-review-update"].includes(action))')
const reviewEnd = source.indexOf('if (action === "subscription-overview")', reviewStart)
assert.ok(queueStart > 0 && reviewStart > queueStart && reviewEnd > reviewStart)
const queue = source.slice(queueStart, reviewStart)
const review = source.slice(reviewStart, reviewEnd)
const auth = source.slice(0, queueStart)

// The service-role aggregate must only follow fresh authentication and workspace
// manager authorization. Expired subscriptions still have recovery access.
assert.match(auth, /requireAuthenticatedUser\(req\)/u)
assert.match(auth, /workspaceCredentialIsFresh\(authContext\)/u)
assert.match(queue, /if \(!platformAdmin\) throw new HttpError\(403/u)
assert.ok(queue.indexOf('if (!platformAdmin)') < queue.indexOf('admin.from('))
assert.match(review, /requireWorkspaceFeatureAccess\(authContext, workspaceId, \{ billingRecovery: true \}\)/u)
assert.match(review, /!\["owner", "admin", "platform_admin"\]\.includes\(access.role\)/u)
assert.match(review, /action === "legacy-credit-review-update" && !platformAdmin/u)
assert.ok(review.indexOf('&& !platformAdmin') < review.indexOf('admin.rpc('))
assert.match(review, /admin.rpc\("workspace_purchased_credit_balance_v1", \{ p_workspace_id: workspaceId \}\)/u)
assert.match(review, /balanceError \|\| !Number.isSafeInteger\(remaining\) \|\| remaining < 0 \|\| balance === null/u)

// Retrying a request must not overwrite a completed review, its snapshot, or
// resolution. Completion must atomically reject a concurrent stale update.
assert.match(review, /remaining <= 0[\s\S]*?NO_PURCHASED_BALANCE/u)
assert.match(review, /\.upsert\(\{\s*workspace_id: workspaceId, requested_by: user.id, purchased_remaining_at_request: remaining,\s*\}, \{ onConflict: "workspace_id", ignoreDuplicates: true \}\)/u)
assert.match(review, /if \(inserted\?\.length\) await writeAudit/u)
assert.match(review, /!\["reviewing", "resolved"\]\.includes\(status\)/u)
assert.match(review, /status === "resolved" \? requireString\(body.resolution_note, "resolution_note", \{ min: 10, max: 1000 \}\)/u)
assert.match(review, /\.eq\("workspace_id", workspaceId\)\.neq\("status", "resolved"\)\.select\("workspace_id"\)/u)
assert.match(review, /if \(!updated\?\.length\) throw new HttpError\(409, "CREDIT_REVIEW_UNCHANGED"/u)

// Reviews only record human follow-up. They never settle money or consume lots.
assert.deepEqual([...review.matchAll(/admin\.from\("([^"]+)"\)/gu)].map((match) => match[1]),
  ['workspace_credit_reviews', 'workspace_credit_reviews', 'workspace_credit_reviews'])
assert.deepEqual([...review.matchAll(/admin\.rpc\("([^"]+)"/gu)].map((match) => match[1]),
  ['workspace_purchased_credit_balance_v1'])
assert.doesNotMatch(review + queue, /stripeRequest|stripePost|fetch\(|refunds|credits_grant|credits_spend/u)
assert.match(migration, /workspace_id uuid PRIMARY KEY REFERENCES public.workspaces\(id\) ON DELETE RESTRICT/u)
assert.match(migration, /CHECK \(status <> 'resolved' OR resolution_note IS NOT NULL\)/u)
assert.match(migration, /char_length\(resolution_note\) BETWEEN 10 AND 1000/u)
assert.match(migration, /ENABLE ROW LEVEL SECURITY/u)
assert.match(migration, /FORCE ROW LEVEL SECURITY/u)
assert.match(migration, /REVOKE ALL ON public.workspace_credit_reviews FROM PUBLIC, anon, authenticated/u)
assert.match(migration, /GRANT SELECT, INSERT, UPDATE ON public.workspace_credit_reviews TO service_role/u)
assert.match(migration, /SECURITY DEFINER SET search_path = ''/u)
assert.match(migration, /SELECT COALESCE\(sum\(remaining\), 0\) FROM public.workspace_credit_lots\s+WHERE workspace_id = p_workspace_id AND source = 'purchase'/u)
assert.match(migration, /REVOKE ALL ON FUNCTION public.workspace_purchased_credit_balance_v1\(uuid\) FROM PUBLIC, anon, authenticated/u)
assert.match(migration, /GRANT EXECUTE ON FUNCTION public.workspace_purchased_credit_balance_v1\(uuid\) TO service_role/u)
assert.doesNotMatch(migration, /(?:UPDATE|INSERT INTO|DELETE FROM) public.workspace_credit_lots/iu)
console.log('Legacy credit review contracts passed: authorization, recovery, retry preservation, conditional completion, read-only financial history.')
