import { useState, type MouseEvent } from 'react'
import { AlarmClock, BellOff, ChevronDown, ChevronUp, Hourglass, Loader2, Reply } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { RelationshipRowMenu } from '@/components/workspace/RelationshipRowMenu'
import {
  followUpOverdue,
  isSnoozed,
  lastMessageSender,
  relationshipMove,
  relationshipStatus,
  relativeTime,
  statusText,
} from '@/lib/relationshipAttention'
import {
  messageSnippet,
  relationshipNextStep,
  relationshipStage,
  relationshipTitle,
  type RelationshipNextStep,
} from '@/lib/relationshipLabels'
import type { HostRelationshipSummary } from '@/services/hostRelationships'

/** Clients shown as chips before the rest collapse into "+N". */
const VISIBLE_CLIENT_CHIPS = 2

const NEXT_STEP_LABEL: Record<Exclude<RelationshipNextStep, 'open'>, string> = {
  conversation: 'View conversation',
  pitch: 'Pitch',
}

function formatShortDate(value: string): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(value))
}

type Indicator = 'snoozed' | 'overdue' | 'yours' | 'theirs'

const INDICATOR_VIEW: Record<Exclude<Indicator, 'snoozed'>, { label: string; className: string; Icon: typeof Reply }> = {
  overdue: { label: 'Follow-up overdue', className: 'text-amber-800', Icon: AlarmClock },
  yours: { label: 'Your move', className: 'text-foreground', Icon: Reply },
  theirs: { label: 'Their move', className: 'text-muted-foreground', Icon: Hourglass },
}

function initials(name: string): string {
  // Words with a letter or digit only, so "Founder & Operator" reads FO, not F&.
  const words = name.trim().split(/\s+/u).filter((word) => /[\p{L}\p{N}]/u.test(word))
  if (words.length === 0) return '?'
  return (words.length === 1 ? words[0].slice(0, 2) : `${words[0][0]}${words[1][0]}`).toUpperCase()
}

/**
 * The square at the start of a row. A cover that never loads is routine: a
 * show can take its artwork private long after the feed keeps pointing there.
 * The initials stay mounted underneath, so a cover that 403s degrades into
 * them silently instead of flashing a broken-image glyph first.
 */
export const RelationshipAvatar = ({ imageUrl, name }: { imageUrl: string | null; name: string }) => {
  const [imageFailed, setImageFailed] = useState(false)
  const [imageLoaded, setImageLoaded] = useState(false)
  const showImage = Boolean(imageUrl) && !imageFailed
  return (
    <div
      className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-primary/5 text-xs font-semibold text-primary"
      aria-hidden="true"
    >
      <span>{initials(name)}</span>
      {showImage && (
        <img
          src={imageUrl as string}
          alt=""
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-200 ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
          loading="lazy"
          referrerPolicy="no-referrer"
          onLoad={() => setImageLoaded(true)}
          onError={() => setImageFailed(true)}
        />
      )}
    </div>
  )
}

/** "Name this show": a one-line editor in place, Enter saves and Escape cancels. */
const ShowNameEditor = ({ title, onSave }: { title: string; onSave: (name: string) => Promise<void> }) => {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)

  if (!editing) {
    return (
      <button
        type="button"
        className="text-xs font-medium text-primary hover:underline"
        onClick={() => { setDraft(''); setEditing(true) }}
      >
        Name this show
      </button>
    )
  }

  const save = async () => {
    const name = draft.trim()
    if (!name || saving) return
    setSaving(true)
    try {
      await onSave(name)
      setEditing(false)
    } catch {
      // The caller reports the failure; keep the draft so nothing typed is lost.
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-1 flex max-w-xs items-center gap-2">
      <Input
        autoFocus
        aria-label={`Show name for ${title}`}
        placeholder="Show name"
        className="h-8 text-sm"
        value={draft}
        maxLength={500}
        disabled={saving}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            void save()
          } else if (event.key === 'Escape') {
            event.preventDefault()
            event.stopPropagation()
            setEditing(false)
          }
        }}
      />
      {saving && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" aria-label="Saving" />}
    </div>
  )
}

interface RelationshipRowProps {
  row: HostRelationshipSummary
  open: boolean
  canManage: boolean
  now?: Date
  onToggle: () => void
  /** A next step with nowhere to link to opens the panel at the right place. */
  onNextStep: (step: RelationshipNextStep) => void
  onRename: (name: string) => Promise<void>
  /** Days to snooze, or null to wake the row. */
  onSnooze: (days: number | null) => void
  onSnoozeUntil: () => void
  onSetStage: (stage: 'placed' | 'not_a_fit') => void
  onEditDetails: () => void
  /** "Not a host, remove": hides the row; the page offers an undo. */
  onDismiss: () => void
  onMarkDoNotContact: () => void
}

/**
 * One host in the book, read as a decision: who they are, which clients are
 * on them, what was last said and by whom, and the one thing to do next.
 */
export const RelationshipRow = ({
  row,
  open,
  canManage,
  now = new Date(),
  onToggle,
  onNextStep,
  onRename,
  onSnooze,
  onSnoozeUntil,
  onSetStage,
  onEditDetails,
  onDismiss,
  onMarkDoNotContact,
}: RelationshipRowProps) => {
  const { title, showKnown } = relationshipTitle(row)
  const stage = relationshipStage(row)
  const status = relationshipStatus(row, now)
  const move = relationshipMove(row)
  // One indicator, most pressing first: a snooze silences the rest, and an
  // overdue follow-up outranks "Their move", which it would otherwise read as.
  const snoozed = isSnoozed(row, now)
  const indicator: Indicator | null = snoozed
    ? 'snoozed'
    : followUpOverdue(row, now) ? 'overdue' : move
  const nextStep = relationshipNextStep(stage, Boolean(row.last_message_body || row.last_thread_key))
  const clientNames = (row.client_names ?? []).filter(Boolean)
  const hiddenClients = clientNames.length - VISIBLE_CLIENT_CHIPS
  const snippet = messageSnippet(row.last_message_body)
  const messageAge = relativeTime(row.last_message_at ?? row.last_contacted_at, now)
  const sender = lastMessageSender(row)

  // The whole row opens the panel; its own controls keep their own meaning.
  const handleRowClick = (event: MouseEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('a, button, input, [role="menuitem"]')) return
    onToggle()
  }

  return (
    <div className="flex cursor-pointer flex-wrap items-start gap-x-3 gap-y-2" onClick={handleRowClick}>
      <RelationshipAvatar imageUrl={row.podcast_image_url} name={title} />
      {/* At phone width the actions wrap onto their own line rather than
          squeezing the message to a few characters. */}
      <div className="min-w-0 flex-1 basis-48">
        {/* The status drops below a long title rather than truncating it. */}
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
          <h3 className="min-w-0 max-w-full truncate text-sm font-semibold leading-6">
            {/* The title is the keyboard route into the row: Tab to it,
                Enter opens the panel. */}
            <button
              type="button"
              className="max-w-full truncate rounded-sm text-left hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-expanded={open}
              onClick={onToggle}
            >
              {title}
            </button>
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            {indicator === 'snoozed' && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
                <BellOff className="h-3.5 w-3.5" aria-hidden="true" />
                Snoozed until {formatShortDate(row.snoozed_until as string)}
              </span>
            )}
            {indicator && indicator !== 'snoozed' && (() => {
              const { label, className, Icon } = INDICATOR_VIEW[indicator]
              return (
                <span className={`inline-flex items-center gap-1 text-xs font-medium ${className}`}>
                  <Icon className="h-3.5 w-3.5" aria-hidden="true" />{label}
                </span>
              )
            })()}
            <Badge variant="outline" className={status.className}>{statusText(status)}</Badge>
          </div>
        </div>
        {!showKnown && canManage && <ShowNameEditor title={title} onSave={onRename} />}
        <p className="mt-0.5 line-clamp-3 text-xs leading-5 text-foreground/80 sm:line-clamp-1">
          {snippet
            ? (
              <>
                {sender && <span className="font-medium">{sender}: </span>}
                {snippet}
                {messageAge && <span className="text-muted-foreground"> · {messageAge}</span>}
              </>
            )
            : row.last_contacted_at && messageAge
              ? <span className="text-muted-foreground">Last contact {messageAge}</span>
              : <span className="text-muted-foreground">No messages yet</span>}
        </p>
        {clientNames.length > 0 && (
          <ul className="mt-1.5 flex flex-wrap gap-1" aria-label="Clients pitched to this host">
            {clientNames.slice(0, VISIBLE_CLIENT_CHIPS).map((name) => (
              <li key={name}>
                <Badge variant="secondary" className="max-w-[12rem] truncate px-2 py-0 text-[11px] font-normal">{name}</Badge>
              </li>
            ))}
            {hiddenClients > 0 && (
              <li>
                <Badge
                  variant="secondary"
                  className="px-2 py-0 text-[11px] font-normal"
                  title={clientNames.slice(VISIBLE_CLIENT_CHIPS).join(', ')}
                >
                  +{hiddenClients} more
                </Badge>
              </li>
            )}
          </ul>
        )}
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-1">
        {/* At phone width a manager's main action moves into the menu. */}
        {nextStep === 'open'
          ? (
            <Button
              type="button"
              size="sm"
              variant={open ? 'secondary' : 'outline'}
              aria-expanded={open}
              className={canManage ? 'hidden sm:inline-flex' : undefined}
              onClick={onToggle}
            >
              {open ? 'Close' : 'Open'}
            </Button>
          )
          : (
            <>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className={canManage ? 'hidden sm:inline-flex' : undefined}
                onClick={() => onNextStep(nextStep)}
              >
                {NEXT_STEP_LABEL[nextStep]}
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                aria-expanded={open}
                aria-label={open ? `Close details for ${title}` : `Open details for ${title}`}
                onClick={onToggle}
              >
                {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            </>
          )}
        <RelationshipRowMenu
          title={title}
          stage={stage}
          snoozed={snoozed}
          canManage={canManage}
          primaryAction={nextStep === 'open' || !canManage
            ? null
            : { label: NEXT_STEP_LABEL[nextStep], onSelect: () => onNextStep(nextStep) }}
          onSnooze={onSnooze}
          onSnoozeUntil={onSnoozeUntil}
          onSetStage={onSetStage}
          onEditDetails={onEditDetails}
          onDismiss={onDismiss}
          onMarkDoNotContact={onMarkDoNotContact}
        />
      </div>
    </div>
  )
}
