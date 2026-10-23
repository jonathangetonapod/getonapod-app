import type { OnboardingWorkflowStatus } from '@/lib/onboardingActivity'

/*
 * One status per intake, so the filter strip's counts add up to All. The old
 * page counted "Needs chasing" on top of "Active intake", and the same row
 * sat in both.
 */
export type IntakeStatus = 'chasing' | 'in_progress' | 'review' | 'approved' | 'expired'

/** Days without client activity before a live intake needs chasing. */
export const CHASE_AFTER_DAYS = 3
/** A live link inside this window is offered "Extend 14 days" on its row. */
export const EXTEND_WITHIN_DAYS = 3

const DAY_MS = 86_400_000

export const intakeStatusLabels: Record<IntakeStatus, string> = {
  chasing: 'Needs chasing',
  in_progress: 'In progress',
  review: 'Awaiting review',
  approved: 'Approved',
  expired: 'Expired',
}

export interface IntakeStatusInput {
  status: OnboardingWorkflowStatus
  invited_at: string
  viewed_at: string | null
  started_at: string | null
  submitted_at: string | null
  changes_requested_at: string | null
  capability_expires_at: string
  progress_section?: number
  delivery?: { status: string; sent_at?: string | null; attempted_at?: string | null } | null
}

function time(value: string | null | undefined): number | null {
  if (!value) return null
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * A resend updates the original invitation's delivery row, so a send well
 * after the invitation was created is a reminder.
 */
export function reminderSentAt(instance: IntakeStatusInput): number | null {
  const sent = time(instance.delivery?.sent_at)
  const invited = time(instance.invited_at)
  if (sent === null || invited === null) return null
  return sent - invited > 5 * 60_000 ? sent : null
}

/** The latest moment either side moved: invite, view, save, reminder, request. */
function lastTouch(instance: IntakeStatusInput): number | null {
  const times = [
    time(instance.invited_at),
    time(instance.viewed_at),
    time(instance.started_at),
    time(instance.changes_requested_at),
    reminderSentAt(instance),
  ].filter((value): value is number => value !== null)
  return times.length ? Math.max(...times) : null
}

export function intakeStatus(instance: IntakeStatusInput, now: number): IntakeStatus {
  if (instance.status === 'approved') return 'approved'
  if (instance.status === 'submitted') return 'review'
  const expiry = time(instance.capability_expires_at)
  if (instance.status === 'expired' || instance.status === 'revoked' || (expiry !== null && expiry <= now)) return 'expired'
  // An email that never left is the operator's to chase, however recent.
  if (!instance.viewed_at && (instance.delivery?.status === 'failed' || instance.delivery?.status === 'skipped')) {
    return 'chasing'
  }
  const touched = lastTouch(instance)
  if (touched !== null && now - touched >= CHASE_AFTER_DAYS * DAY_MS) return 'chasing'
  return 'in_progress'
}

/** Whole days until the link dies, or null when the date is unusable. */
export function daysUntilExpiry(instance: IntakeStatusInput, now: number): number | null {
  const expiry = time(instance.capability_expires_at)
  return expiry === null ? null : Math.floor((expiry - now) / DAY_MS)
}

export function relativeTime(value: string | number, now: number): string {
  const at = typeof value === 'number' ? value : Date.parse(value)
  if (!Number.isFinite(at)) return ''
  const minutes = Math.round((now - at) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days}d ago`
  return new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/** What the client (or the operator's last nudge) did most recently. */
export function intakeLastActivity(instance: IntakeStatusInput, now: number): string {
  const submitted = time(instance.submitted_at)
  const changesRequested = time(instance.changes_requested_at)
  if (submitted !== null && (changesRequested === null || submitted > changesRequested)) {
    return `Submitted ${relativeTime(submitted, now)}`
  }
  const reminder = reminderSentAt(instance)
  const started = time(instance.started_at)
  const viewed = time(instance.viewed_at)
  const clientLatest = Math.max(started ?? -1, viewed ?? -1)
  if (reminder !== null && reminder > clientLatest) return `Reminder sent ${relativeTime(reminder, now)}`
  // started_at is the first save; the list carries no later save time, so
  // this names the section the client reached and when they began.
  if (started !== null) return `Saved section ${(instance.progress_section ?? 0) + 1} ${relativeTime(started, now)}`
  if (viewed !== null) return `Opened ${relativeTime(viewed, now)}`
  return 'Not opened'
}
