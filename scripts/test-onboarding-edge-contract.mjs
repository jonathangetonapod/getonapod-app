import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

const staff = readFileSync('supabase/functions/workspace-onboarding/index.ts', 'utf8')
const client = readFileSync('supabase/functions/client-onboarding/index.ts', 'utf8')
const shared = readFileSync('supabase/functions/_shared/workspaceOnboarding.ts', 'utf8')
const migration = readFileSync('supabase/migrations/20260722000500_workspace_onboarding.sql', 'utf8')
const whiteLabelMigration = readFileSync('supabase/migrations/20260722000600_workspace_onboarding_white_label.sql', 'utf8')
const activityMigration = readFileSync('supabase/migrations/20260723000100_workspace_onboarding_activity.sql', 'utf8')
const answerApprovalMigration = readFileSync('supabase/migrations/20260723000200_workspace_onboarding_answer_approval.sql', 'utf8')
const defaultWorkspaceParityMigration = readFileSync('supabase/migrations/20260723000300_default_workspace_onboarding_parity.sql', 'utf8')
const config = readFileSync('supabase/config.toml', 'utf8')
const publicPage = readFileSync('src/pages/onboarding/ClientOnboarding.tsx', 'utf8')
const routes = readFileSync('src/App.tsx', 'utf8')

assert.match(config, /\[functions\.workspace-onboarding\]\s+verify_jwt = true/u)
assert.match(config, /\[functions\.client-onboarding\]\s+verify_jwt = false/u)
assert.doesNotMatch(config, /process-onboarding-reminders/u)

assert.match(staff, /requireAuthenticatedUser\(req\)/u)
assert.match(staff, /workspaceCredentialIsFresh\(context\)/u)
assert.match(staff, /workspace_onboarding_staff_list_v1/u)
assert.match(staff, /workspace_onboarding_start_v1/u)
assert.match(staff, /workspace_onboarding_approve_v1/u)
assert.match(staff, /action === 'approve_answers'[\s\S]*?workspace_onboarding_approve_answers_v1/u)
assert.match(staff, /record_workspace_onboarding_change_request_v1/u)
assert.match(staff, /kind: 'changes_requested'/u)
assert.match(staff, /experiencePayload\(body\.experience\)/u)
assert.match(staff, /brandLogoPath/u)
assert.match(staff, /action === 'get_link'[\s\S]*?workspace_onboarding_client_operation_v1/u)
assert.match(staff, /ONBOARDING_LINK_CHANGED/u)
assert.match(staff, /p_action: 'purge_paths'/u)
assert.match(staff, /No database records were deleted/u)
assert.match(staff, /listPrivateOnboardingFiles/u)
assert.doesNotMatch(staff, /console\.(?:log|error)\([^)]*(?:token|recipient|email)/iu)

assert.match(client, /verifyOnboardingCapability\(token, capabilitySecret\(\)\)/u)
assert.match(client, /action === 'metadata'/u)
assert.match(client, /metadata:\s*\{\s*workspace: brand\.workspace,\s*accent_color: brand\.accent_color/u)
assert.match(client, /action === 'get'[\s\S]*?mark_workspace_onboarding_viewed_v1/u)
assert.match(client, /validateOnboardingAnswers/u)
assert.match(client, /hasExpectedSignature/u)
assert.match(client, /createSignedUrl\(path, 900\)/u)
assert.doesNotMatch(client, /console\.(?:log|error)/u)

assert.match(shared, /name: 'HMAC', hash: 'SHA-256'/u)
assert.match(shared, /crypto\.subtle\.digest\('SHA-256'/u)
assert.match(shared, /timingSafeText/u)
// The email leaves through the n8n workflow under the agency's name.
assert.match(shared, /senderName: input\.workspaceName/u)
assert.doesNotMatch(shared, /api\.resend\.com|<html/u)
assert.doesNotMatch(shared, /kind: 'invitation' \| 'reminder'/u)
assert.doesNotMatch(shared, /localStorage|sessionStorage/u)

assert.equal(existsSync('supabase/functions/process-onboarding-reminders/index.ts'), false)

assert.match(migration, /'workspace-onboarding-assets',[\s\S]*?false,[\s\S]*?10485760/u)
assert.match(migration, /REVOKE ALL PRIVILEGES ON TABLE public\.workspace_onboarding_instances FROM PUBLIC, anon, authenticated/u)
assert.match(migration, /workspace_onboarding_template_versions_immutable/u)
assert.match(migration, /workspace_onboarding_answer_revisions_immutable/u)
assert.match(migration, /portal_access_changed', false/u)
assert.match(migration, /client_record_retained', true/u)
assert.doesNotMatch(migration, /GRANT (?:SELECT|INSERT|UPDATE|DELETE|ALL)[^;]+workspace_onboarding[^;]+ TO (?:anon|authenticated)/iu)
assert.match(whiteLabelMigration, /workspace_onboarding_templates_reminders_disabled_check/u)
assert.match(whiteLabelMigration, /DROP FUNCTION IF EXISTS public\.claim_workspace_onboarding_reminders_v1/u)
assert.match(whiteLabelMigration, /experience_logo_path/u)
assert.match(whiteLabelMigration, /workspace\.onboarding\.experience_snapshotted/u)
assert.match(activityMigration, /ADD COLUMN viewed_at TIMESTAMPTZ/u)
assert.match(activityMigration, /mark_workspace_onboarding_viewed_v1/u)
assert.match(activityMigration, /'viewed_at', instance\.viewed_at/u)
assert.match(answerApprovalMigration, /CREATE OR REPLACE FUNCTION public\.workspace_onboarding_approve_answers_v1/u)
assert.match(answerApprovalMigration, /'approval_mode', 'answers_only'/u)
assert.match(answerApprovalMigration, /'profile_created', false/u)
assert.match(answerApprovalMigration, /GRANT EXECUTE ON FUNCTION public\.workspace_onboarding_approve_answers_v1\([\s\S]*?\) TO service_role/u)
assert.doesNotMatch(answerApprovalMigration, /workspace_client_pitch_profiles|workspace_onboarding_profile_drafts/u)
assert.match(defaultWorkspaceParityMigration, /SELECT membership\.role[\s\S]*?IF FOUND THEN[\s\S]*?RETURN actor_role[\s\S]*?is_platform_admin_identity/u)
assert.match(defaultWorkspaceParityMigration, /workspace_onboarding_client_operation_v1\(text,uuid,text,jsonb\)', 2/u)
assert.match(defaultWorkspaceParityMigration, /restriction_count <> expected_restrictions/u)
assert.match(defaultWorkspaceParityMigration, /workspace\.is_default[\s\S]*?seed_workspace_onboarding_template_v1/u)

assert.doesNotMatch(publicPage, /localStorage|sessionStorage/u)
assert.match(publicPage, /meta\.name = 'referrer'/u)
assert.match(publicPage, /meta\.content = 'no-referrer'/u)
assert.match(publicPage, /<PageSEO[\s\S]*?noindex/u)
assert.match(publicPage, /whiteLabel/u)
assert.match(publicPage, /ClientBrandHead/u)
assert.match(publicPage, /CAPABILITY_SCOPE_PATTERN/u)
assert.ok(routes.includes('path="/onboarding/:token" element={<ClientOnboarding />}'))
assert.ok(routes.includes('path="/app/onboarding"'))
assert.ok(routes.includes('path="/admin/workspaces/:workspaceId/onboarding"'))

console.log('Workspace onboarding Edge and browser contracts passed')

// The change-request loop is reachable. The action, the status, and the email
// all existed; nothing in the UI called them, so a thin answer could only be
// approved or left sitting.
const reviewDialog = readFileSync('src/components/onboarding/OnboardingReviewDialog.tsx', 'utf8')
const onboardingPage = readFileSync('src/pages/app/WorkspaceOnboarding.tsx', 'utf8')
assert.match(onboardingPage, /requestOnboardingChanges\(workspaceId, selectedInstanceId, comments\)/u)
assert.match(reviewDialog, /onRequestChanges\(comments\)/u)
// Only noted answers are sent, and a blank or whitespace note is not one.
assert.match(reviewDialog, /body: body\.trim\(\)/u)
assert.match(reviewDialog, /comment\.body\.length > 0 && comment\.body\.length <= 2000/u)
// The edge action refuses fewer than one note, so the button cannot offer a
// round trip that only produces an error.
assert.match(reviewDialog, /disabled=\{busy \|\| comments\.length === 0\}/u)
// This reaches the client's inbox and reopens their link, so the dialog says so
// before it is pressed and the page says so if the send fails.
assert.match(reviewDialog, /reopens their intake link/u)
assert.match(onboardingPage, /result\.delivery\?\.status === 'sent'/u)
assert.match(onboardingPage, /the email did not send/u)

// Nothing chases a client automatically — process-onboarding-reminders is not
// deployed and nothing schedules it (asserted above). So the page's job is to
// stop losing track of the ones that went quiet.
const chase = readFileSync('src/lib/onboardingChase.ts', 'utf8')
assert.match(chase, /export const UNOPENED_CHASE_DAYS = 3/u)
assert.match(chase, /export const UNFINISHED_CHASE_DAYS = 7/u)
assert.match(chase, /export const EXPIRING_SOON_DAYS = 3/u)
// A submitted form is the reviewer's move, and an archived or dead one is
// nobody's, so none of them are chased.
assert.match(
  chase,
  /\['submitted', 'approved', 'expired', 'revoked'\]\.includes\(instance\.status\)/u,
)
assert.match(chase, /instance\.archived_at !== null/u)
// An unusable date produces silence rather than a guessed age.
assert.match(chase, /if \(settled \|\| ageDays === null\)/u)

// One status per intake, so the strip's counts add up to All, and the strip
// sits inside the Intakes tab so it never filters a list that is off screen.
// The table can be searched and filtered rather than rendering every
// instance ever created.
const intakeTable = readFileSync('src/components/onboarding/IntakeTable.tsx', 'utf8')
const intakeStatusSource = readFileSync('src/lib/intakeStatus.ts', 'utf8')
assert.match(intakeTable, /type="single"/u)
assert.match(intakeTable, /aria-label="Filter intakes by status"/u)
assert.match(intakeTable, /instances\.map\(\(instance\) =>/u)
assert.match(intakeStatusSource, /export function intakeStatus\(/u)
assert.match(onboardingPage, /aria-label="Search intakes"/u)
assert.match(
  onboardingPage,
  /<TabsContent value="instances">[\s\S]*<IntakeFilterStrip[\s\S]*<TabsContent value="templates">/u,
)
// Archived rows are finished work: hidden unless asked for, never padding
// another view.
assert.match(
  onboardingPage,
  /statusFilter === 'archived' \? !instance\.archived_at : Boolean\(instance\.archived_at\)/u,
)
// A filtered table says how much it is hiding.
assert.match(onboardingPage, /\{tableInstances\.length\} of \{statusFilter === 'archived' \? counts\.archived : counts\.all\} shown/u)

// A declared Content-Length over the cap is refused up front (Number('') is 0,
// so only a real integer counts as declared). A body with no length is not
// refused with 411, since the gateway and tenant worker may forward it
// chunked: it is read with a streaming byte cap instead.
assert.match(client, /\/\^\\d\+\$\/u\.test\(lengthHeader\)/u)
assert.doesNotMatch(client, /HttpError\(411, 'LENGTH_REQUIRED'/u)
assert.match(client, /if \(Number\.isSafeInteger\(declaredLength\) && declaredLength > MAX_BODY_BYTES\) \{\s*throw new HttpError\(413, 'PAYLOAD_TOO_LARGE'/u)
assert.match(client, /const body = await parseCappedJsonObject\(req, MAX_BODY_BYTES\)/u)
assert.match(client, /total \+= value\.byteLength\s*\n\s*if \(total > maxBytes\) \{\s*\n\s*await reader\.cancel\(\)/u)
assert.doesNotMatch(client, /parseJsonObject\(req/u)
// Writes through a link are throttled per instance, failing open.
assert.match(client, /reservePublicRate\(admin, \[\{\s*bucket: `onboarding-\$\{action\}:\$\{capability\.instanceId\}`/u)
assert.match(client, /save: \{ limit: \d+, windowSeconds: [\d *]+ \}/u)
assert.match(client, /upload: \{ limit: \d+, windowSeconds: [\d *]+ \}/u)
assert.match(client, /delete_upload: \{ limit: \d+, windowSeconds: [\d *]+ \}/u)

// Invitations reply to the agency and speak in the link's own welcome.
assert.match(shared, /replyTo: validEmailAddress\(input\.replyTo\)/u)
assert.match(shared, /experienceTitle\?: string \| null/u)
// An unset webhook surfaces as not configured, not a silent skip.
assert.match(shared, /reason\?: 'not_configured'/u)
assert.match(shared, /delivery\.reason \? \{ reason: delivery\.reason \}/u)
assert.match(staff, /select\('client_contact_email'\)/u)
assert.match(staff, /email_delivery = \{ configured: onboardingEmailConfigured\(\) \}/u)
// The stored kind is 'changes_requested'; asking for 'change_request'
// matched nothing.
assert.match(staff, /\.in\('kind', \['invitation', 'changes_requested'\]\)/u)
assert.doesNotMatch(staff, /\.in\('kind', \[[^\]]*'change_request'/u)
// Delivery records report whether they landed.
assert.match(staff, /if \(error \|\| data !== true\) \{\s*console\.error\('\[workspace-onboarding\] Invitation delivery could not be recorded'/u)
// Resend emails the current link; rotate honours send_email.
assert.match(staff, /action === 'resend_invitation'/u)
// One delivered resend per onboarding per ten minutes, with a coded error the
// page shows; checked before anything is sent.
assert.match(staff, /const RESEND_COOLDOWN_MS = 10 \* 60 \* 1000/u)
{
  const resendBranch = staff.slice(staff.indexOf("if (action === 'resend_invitation')"), staff.indexOf("if (action === 'approve_answers')"))
  assert.match(resendBranch, /\.not\('sent_at', 'is', null\)\s*\n\s*\.order\('sent_at', \{ ascending: false \}\)/u)
  assert.match(resendBranch, /throw new HttpError\(\s*429,\s*'ONBOARDING_RESEND_COOLDOWN',/u)
  assert.ok(
    resendBranch.indexOf("'ONBOARDING_RESEND_COOLDOWN'") < resendBranch.indexOf('await sendOnboardingEmail('),
    'the resend cooldown must be checked before the email is sent',
  )
}
assert.match(staff, /rotateSendEmail = booleanValue\(body\.send_email, 'send_email'\)/u)
assert.match(onboardingPage, /resendOnboardingInvitation\(workspaceId, instance\.id\)/u)
// Start is idempotent on a browser-minted key.
assert.match(staff, /optionalUuid\(body\.idempotency_key, 'idempotency_key'\) \?\? crypto\.randomUUID\(\)/u)
assert.match(readFileSync('src/components/onboarding/NewIntakeDialog.tsx', 'utf8'), /idempotency_key: startKeyRef\.current/u)
// Extending a lapsed link counts from today.
assert.match(staff, /Math\.max\(Date\.now\(\), currentExpiry\) \+ extensionDays \* 86_400_000/u)
// Approval covers answers only, and the client is told exactly that.
assert.match(publicPage, /has approved your answers/u)
assert.doesNotMatch(publicPage, /finalized your podcast guest profile/u)

console.log('Workspace onboarding delivery and throttling contracts passed')
