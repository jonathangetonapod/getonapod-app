import { decodeFeedText } from '@/lib/feedText'
import type {
  HostRelationshipDerivedState,
  HostRelationshipManualStage,
  HostRelationshipSummary,
} from '@/services/hostRelationships'

/**
 * What a relationship with a host is called, in one place.
 *
 * The relationship book used four vocabularies at once: header chips said
 * "engaged", the filter said "Warm & nurturing", row badges said "Pitched, no
 * reply", and the stage control said "Use outreach activity". The same host
 * read differently depending on where you looked. These seven stages are the
 * only words for it, on the book and on the podcast database alike.
 */
export type RelationshipStage =
  | 'new'
  | 'pitched'
  | 'in_conversation'
  | 'nurturing'
  | 'placed'
  | 'not_a_fit'
  | 'do_not_contact'

/** Display order: the filter, the stage control and the add form all use it. */
export const RELATIONSHIP_STAGES: RelationshipStage[] = [
  'new',
  'pitched',
  'in_conversation',
  'nurturing',
  'placed',
  'not_a_fit',
  'do_not_contact',
]

export const RELATIONSHIP_STAGE_VIEW: Record<RelationshipStage, { label: string; className: string }> = {
  new: { label: 'New', className: 'border-muted bg-muted/30 text-muted-foreground' },
  pitched: { label: 'Pitched', className: 'border-slate-200 bg-slate-50 text-slate-700' },
  in_conversation: { label: 'In conversation', className: 'border-sky-200 bg-sky-50 text-sky-900' },
  nurturing: { label: 'Nurturing', className: 'border-indigo-200 bg-indigo-50 text-indigo-900' },
  placed: { label: 'Placed', className: 'border-emerald-200 bg-emerald-50 text-emerald-900' },
  not_a_fit: { label: 'Not a fit', className: 'border-amber-200 bg-amber-50 text-amber-900' },
  do_not_contact: { label: 'Do not contact', className: 'border-destructive/30 bg-destructive/5 text-destructive' },
}

/** Where each value the platform derives from outreach lands. */
const DERIVED_TO_STAGE: Record<HostRelationshipDerivedState, RelationshipStage> = {
  none: 'new',
  pitched: 'pitched',
  // A reply is a live thread whether or not anyone has answered it yet.
  replied: 'in_conversation',
  in_conversation: 'in_conversation',
  booked: 'placed',
  declined: 'not_a_fit',
  suppressed: 'do_not_contact',
}

/** Where each value an operator can store lands. */
const MANUAL_TO_STAGE: Record<HostRelationshipManualStage, RelationshipStage> = {
  new: 'new',
  pitched: 'pitched',
  in_conversation: 'in_conversation',
  nurturing: 'nurturing',
  // Written before the shared vocabulary; it meant the same thing.
  warm: 'nurturing',
  placed: 'placed',
  not_a_fit: 'not_a_fit',
  do_not_contact: 'do_not_contact',
}

/** The stage outreach activity alone implies, ignoring any override. */
export function autoStage(derived: HostRelationshipDerivedState | null | undefined): RelationshipStage {
  return (derived && DERIVED_TO_STAGE[derived]) || 'new'
}

/** The stored override as a stage, or null when the row follows activity. */
export function manualStage(manual: HostRelationshipManualStage | null | undefined): RelationshipStage | null {
  return (manual && MANUAL_TO_STAGE[manual]) || null
}

/**
 * The stage a person sees for a relationship.
 *
 * A host who opted out (derived 'suppressed') reads Do not contact whatever
 * else is set: that marking exists to stop somebody pitching. Otherwise an
 * explicit stage wins over activity, with one exception. Nurturing describes
 * a host nobody has pitched yet, and the add form sets it by default, so it
 * only holds while there is no outreach. Once a pitch goes out or the host
 * replies, activity takes over; otherwise a hand-added host would sit at
 * Nurturing through a live conversation and never reach the quiet banner.
 *
 * Mirrored in SQL by workspace_host_relationship_book_v4 for whole-book counts.
 */
export function relationshipStage(
  relationship: Pick<HostRelationshipSummary, 'derived_state' | 'manual_stage'>,
): RelationshipStage {
  const auto = autoStage(relationship.derived_state)
  if (auto === 'do_not_contact') return auto
  const manual = manualStage(relationship.manual_stage)
  if (!manual) return auto
  if (manual === 'nurturing') return auto === 'new' ? 'nurturing' : auto
  return manual
}

/**
 * The label for any stage value the backend or the page holds: a derived
 * state, a stored override, or a canonical stage.
 */
export function stageLabel(
  value: RelationshipStage | HostRelationshipDerivedState | HostRelationshipManualStage | null | undefined,
): string {
  if (!value) return RELATIONSHIP_STAGE_VIEW.new.label
  if (value in RELATIONSHIP_STAGE_VIEW) return RELATIONSHIP_STAGE_VIEW[value as RelationshipStage].label
  if (value in DERIVED_TO_STAGE) return RELATIONSHIP_STAGE_VIEW[DERIVED_TO_STAGE[value as HostRelationshipDerivedState]].label
  if (value in MANUAL_TO_STAGE) return RELATIONSHIP_STAGE_VIEW[MANUAL_TO_STAGE[value as HostRelationshipManualStage]].label
  return RELATIONSHIP_STAGE_VIEW.new.label
}

export interface RelationshipBadge {
  label: string
  className: string
}

/**
 * The one thing worth saying about a relationship where there is room for one
 * badge, such as a podcast card in the database.
 *
 * A host at New returns null. On the podcast database that is every podcast
 * in the catalogue, and a badge on all of them says nothing while making the
 * ones that matter harder to see.
 */
export function relationshipBadge(
  relationship: Pick<HostRelationshipSummary, 'derived_state' | 'manual_stage'>,
): RelationshipBadge | null {
  const stage = relationshipStage(relationship)
  return stage === 'new' ? null : RELATIONSHIP_STAGE_VIEW[stage]
}

/**
 * What a relationship row is called.
 *
 * A host often reaches the book before anyone knows their show: an inbound
 * reply, or an address added by hand. Those rows used to be titled "Show not
 * identified" over "Host not identified", which made every one of them look
 * the same. The title is now the most specific real thing we have: the show,
 * then the host, then the address they write from.
 */
export function relationshipTitle(
  relationship: Pick<HostRelationshipSummary, 'podcast_name' | 'host_name' | 'contact_email'>,
): { title: string; showKnown: boolean } {
  const show = decodeFeedText(relationship.podcast_name ?? '').trim()
  if (show) return { title: show, showKnown: true }
  const host = decodeFeedText(relationship.host_name ?? '').trim()
  const email = (relationship.contact_email ?? '').trim()
  return { title: host || email || 'Unnamed host', showKnown: false }
}

/** A message cut to one scannable line: whitespace collapsed, at most max characters. */
export function messageSnippet(body: string | null | undefined, max = 90): string | null {
  const text = (body ?? '').replace(/\s+/gu, ' ').trim()
  if (!text) return null
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`
}

export type RelationshipNextStep = 'pitch' | 'conversation' | 'open'

/**
 * The one action a row offers. Replying from the app is retired, so a live
 * exchange opens what was said; a host nobody has pitched opens the pitch.
 */
export function relationshipNextStep(stage: RelationshipStage, hasConversation: boolean): RelationshipNextStep {
  if (stage === 'new' || stage === 'nurturing') return 'pitch'
  return hasConversation ? 'conversation' : 'open'
}
