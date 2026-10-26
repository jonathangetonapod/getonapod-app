import { useState, type MouseEvent } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, ChevronUp, Loader2, MoreHorizontal } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { conversationAttention, relativeTime } from '@/lib/relationshipAttention'
import {
  RELATIONSHIP_STAGE_VIEW,
  messageSnippet,
  relationshipNextStep,
  relationshipStage,
  relationshipTitle,
  type RelationshipNextStep,
} from '@/lib/relationshipLabels'
import type { HostRelationshipSummary } from '@/services/hostRelationships'

const NEXT_STEP_LABEL: Record<RelationshipNextStep, string> = {
  reply: 'View conversation',
  follow_up: 'Follow up',
  pitch: 'Pitch',
  open: 'Open',
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
  onMarkDoNotContact,
}: RelationshipRowProps) => {
  const { title, showKnown } = relationshipTitle(row)
  const stage = relationshipStage(row)
  const stageView = RELATIONSHIP_STAGE_VIEW[stage]
  const cold = conversationAttention(row, now) === 'cold'
  const nextStep = relationshipNextStep(stage)
  const clientNames = (row.client_names ?? []).filter(Boolean)
  const snippet = messageSnippet(row.last_message_body)
  const messageAge = relativeTime(row.last_message_at ?? row.last_contacted_at, now)
  const speaker = row.last_message_direction === 'inbound'
    ? 'Them'
    : row.last_message_direction === 'outbound' ? 'Us' : null

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
        {/* The badges drop below a long title rather than truncating it. */}
        <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
          <h3 className="min-w-0 max-w-full truncate text-sm font-semibold leading-6">{title}</h3>
          <div className="flex flex-wrap gap-1">
            <Badge variant="outline" className={stageView.className}>{stageView.label}</Badge>
            {cold && (
              <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-900">Went cold</Badge>
            )}
          </div>
        </div>
        {!showKnown && canManage && <ShowNameEditor title={title} onSave={onRename} />}
        {clientNames.length > 0 && (
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{clientNames.join(', ')}</p>
        )}
        <p className="mt-0.5 line-clamp-3 text-xs leading-5 text-foreground/80 sm:line-clamp-1">
          {snippet
            ? (
              <>
                {speaker && <span className="font-medium">{speaker}: </span>}
                {snippet}
                {messageAge && <span className="text-muted-foreground"> · {messageAge}</span>}
              </>
            )
            : row.last_contacted_at && messageAge
              ? <span className="text-muted-foreground">Last contact {messageAge}</span>
              : <span className="text-muted-foreground">No messages yet</span>}
        </p>
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-1">
        {nextStep === 'open'
          ? (
            <Button type="button" size="sm" variant={open ? 'secondary' : 'outline'} aria-expanded={open} onClick={onToggle}>
              {open ? 'Close' : 'Open'}
            </Button>
          )
          : (
            <>
              <Button
                type="button"
                size="sm"
                variant={nextStep === 'reply' ? 'default' : 'outline'}
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
        {canManage && stage !== 'do_not_contact' && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" size="icon" variant="ghost" className="h-8 w-8" aria-label={`More actions for ${title}`}>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={onMarkDoNotContact}>
                Mark as do not contact
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  )
}
