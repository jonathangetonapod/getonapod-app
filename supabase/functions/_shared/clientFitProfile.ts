// What the fit scorer knows about a client: the bio, the guest brief and the
// answers the client gave on their intake form.
//
// The intake was the one source nothing AI-side read. Its answers are stored
// keyed by question id, with the wording on the published template version,
// so they are joined back here into "question: answer" lines a model can read.
//
// The profile text is also fingerprinted. A shortlist score stores the hash it
// was made against, so editing the brief or receiving a new intake revision
// marks earlier scores as stale rather than silently leaving them in place.

import type { createAdminClient } from './workspaceAuth.ts'
import type { OnboardingDefinition, OnboardingQuestionType } from './workspaceOnboarding.ts'
import { targetProfile } from './compatibilityPrompt.ts'

type Admin = ReturnType<typeof createAdminClient>

const MAX_ANSWER_CHARS = 800
const MAX_INTAKE_CHARS = 6_000
/** Answers that are links, addresses or files say nothing a scorer can weigh. */
const SKIPPED_TYPES = new Set<OnboardingQuestionType>(['email', 'url', 'image_upload', 'document_upload'])
const INTAKE_STATUSES = ['approved', 'submitted', 'changes_requested']

// The block is fenced in the prompt. Every angle bracket the client typed is
// swapped for a look-alike, so no answer, label or title can rebuild a fence
// tag; removing the tag alone could be beaten by nesting one inside another.
function oneLine(value: string): string {
  return value.replace(/\s+/gu, ' ').trim().replace(/</gu, '‹').replace(/>/gu, '›')
}

/**
 * The submitted answers as readable lines, grouped by section. Mapped
 * questions (name, email, website, bio…) are left out: they were copied onto
 * the client record and reach the scorer from there.
 */
export function intakeAnswerText(definition: OnboardingDefinition, answers: Record<string, unknown>): string {
  const sections: string[] = []
  let used = 0
  for (const section of definition.sections ?? []) {
    const lines: string[] = []
    for (const question of section.questions ?? []) {
      if (question.mapping || SKIPPED_TYPES.has(question.type)) continue
      const answer = answers[question.id]
      let text = ''
      if (question.type === 'yes_no') {
        if (typeof answer === 'boolean') text = answer ? 'Yes' : 'No'
      } else if (question.type === 'single_select' || question.type === 'multi_select') {
        const labels = new Map((question.options ?? []).map((option) => [option.id, option.label]))
        const chosen = (Array.isArray(answer) ? answer : [answer])
          .filter((entry): entry is string => typeof entry === 'string')
          .map((entry) => labels.get(entry) ?? entry)
        text = chosen.join(', ')
      } else if (typeof answer === 'string') {
        text = answer
      }
      text = oneLine(text).slice(0, MAX_ANSWER_CHARS)
      if (!text) continue
      const line = `- ${oneLine(question.label)}: ${text}`
      if (used + line.length > MAX_INTAKE_CHARS) break
      used += line.length
      lines.push(line)
    }
    if (lines.length > 0) sections.push([section.title ? oneLine(section.title) : '', ...lines].filter(Boolean).join('\n'))
    if (used >= MAX_INTAKE_CHARS) break
  }
  return sections.join('\n\n')
}

/**
 * The intake to score against: the latest approved one, else the latest
 * submitted one. Drafts never count — the client has not sent them.
 */
export async function readClientIntake(admin: Admin, workspaceId: string, clientId: string): Promise<string> {
  const { data: instances, error } = await admin
    .from('workspace_onboarding_instances')
    .select('id,status,template_version_id,current_revision,approved_at,submitted_at')
    .eq('workspace_id', workspaceId)
    .eq('client_id', clientId)
    .in('status', INTAKE_STATUSES)
    .is('archived_at', null)
    .gte('current_revision', 1)
    .limit(20)
  if (error) throw new Error('the client intake could not be loaded')
  const rows = (instances ?? []) as Array<{
    id: string
    status: string
    template_version_id: string
    current_revision: number
    approved_at: string | null
    submitted_at: string | null
  }>
  const newest = (left: string | null, right: string | null) => (right ?? '').localeCompare(left ?? '')
  const chosen = rows.filter((row) => row.status === 'approved').sort((a, b) => newest(a.approved_at, b.approved_at))[0]
    ?? rows.sort((a, b) => newest(a.submitted_at, b.submitted_at))[0]
  if (!chosen) return ''

  const [revisionResult, versionResult] = await Promise.all([
    admin
      .from('workspace_onboarding_answer_revisions')
      .select('answers')
      .eq('workspace_id', workspaceId)
      .eq('instance_id', chosen.id)
      .eq('revision', chosen.current_revision)
      .maybeSingle(),
    admin
      .from('workspace_onboarding_template_versions')
      .select('definition')
      .eq('workspace_id', workspaceId)
      .eq('id', chosen.template_version_id)
      .maybeSingle(),
  ])
  if (revisionResult.error || versionResult.error) throw new Error('the client intake could not be loaded')
  const answers = revisionResult.data?.answers
  const definition = versionResult.data?.definition
  if (!answers || typeof answers !== 'object' || !definition || typeof definition !== 'object') return ''
  return intakeAnswerText(definition as OnboardingDefinition, answers as Record<string, unknown>)
}

export interface ClientFitProfile {
  status: string
  /** The prompt text: bio, brief sections and intake answers. Empty when there is nothing on file. */
  profile: string
  /** Fingerprint of `profile`; a stored score with another hash is stale. */
  hash: string
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function fitProfileHash(profile: string): Promise<string> {
  return (await sha256Hex(profile)).slice(0, 32)
}

/** The client's scoring profile, scoped to the workspace. Null when the client is not in it. */
export async function loadClientFitProfile(
  admin: Admin,
  workspaceId: string,
  clientId: string,
): Promise<ClientFitProfile | null> {
  const { data: client, error } = await admin
    .from('clients')
    .select('id,workspace_id,bio,notes,ai_sdr_profile,status')
    .eq('id', clientId)
    .eq('workspace_id', workspaceId)
    .maybeSingle()
  if (error) throw new Error('the client profile could not be loaded')
  if (!client || client.workspace_id !== workspaceId) return null
  const pitch = client.ai_sdr_profile && typeof client.ai_sdr_profile === 'object'
    ? client.ai_sdr_profile as Record<string, unknown>
    : {}
  const intake = await readClientIntake(admin, workspaceId, clientId)
  const profile = targetProfile(typeof client.bio === 'string' ? client.bio : '', [
    ['Notes', client.notes],
    ['Positioning', pitch.positioning],
    ['Topics and angles', pitch.topics_and_angles],
    ['Listener takeaways', pitch.listener_takeaways],
    ['Proof points', pitch.proof_points],
    ['Ideal opportunities', pitch.ideal_opportunities],
  ], intake)
  return { status: String(client.status ?? ''), profile, hash: await fitProfileHash(profile) }
}
