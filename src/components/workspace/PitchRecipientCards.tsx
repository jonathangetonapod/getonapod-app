import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Check, CheckCircle2, Copy, Loader2, Mail, PenLine, Search } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { safeExternalUrl } from '@/lib/externalUrl'
import {
  chooseRecipient,
  setContactRole,
  type PitchRecipient,
  type RecipientContext,
  type RecipientSource,
} from '@/lib/pitchRecipients'
import { cn } from '@/lib/utils'
import { EmailText } from './EmailText'
import { ManualRecipientInput } from './ManualRecipientInput'

export interface VerifiedSearchState {
  /** The verified host email the platform already holds, if any. */
  email: string | null
  stale: boolean
  running: boolean
  noResult: boolean
  message: string | null
  linkedinUrl: string | null
  steps: Array<{ id: string; title: string; status: string }>
}

interface PitchRecipientCardsProps {
  /** The one address the pitch goes to, or null before one is chosen. */
  recipient: PitchRecipient | null
  context: RecipientContext
  onChange: (next: PitchRecipient[]) => void
  verified: VerifiedSearchState
  /** The operator asked for the verified email: its card is chosen when nothing else holds the address. */
  verifiedOpen: boolean
  onVerifiedOpenChange: (open: boolean) => void
  /** The manual option is chosen but no address has been entered yet. */
  manualOpen: boolean
  onManualOpenChange: (open: boolean) => void
  /** Relationship review outstanding or do-not-contact: nothing may change. */
  disabled: boolean
  /** A search may start: relationship cleared and an AI key connected. */
  canSearch: boolean
  byoAi: boolean
  onStartSearch: () => void
}

/** The radio group's id, so "Change" in the Sending to strip can return focus to it. */
export const PITCH_RECIPIENT_GROUP_ID = 'pitch-recipient-sources'

const ORDER: RecipientSource[] = ['podscan', 'verified', 'manual']

interface SourceCardProps {
  source: RecipientSource
  label: string
  checked: boolean
  disabled: boolean
  focusable: boolean
  icon: ReactNode
  badge: ReactNode
  /** Shown beside the title, e.g. "Recommended". */
  tag?: ReactNode
  title: string
  description: string
  body: ReactNode
  action: ReactNode
  onSelect: () => void
  onArrow: (direction: 1 | -1) => void
  cardRef: (node: HTMLDivElement | null) => void
}

/**
 * One option, laid out the same way in every card: header, title, a line of
 * description, a body that grows, and the action pinned to the bottom so the
 * buttons line up across the row. The whole card is the radio.
 */
const SourceCard = ({ source, label, checked, disabled, focusable, icon, badge, tag, title, description, body, action, onSelect, onArrow, cardRef }: SourceCardProps) => {
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // Keys typed into the card's own field belong to that field.
    if (event.target !== event.currentTarget) return
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault()
      if (!disabled) onSelect()
    } else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault()
      onArrow(1)
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault()
      onArrow(-1)
    }
  }
  return (
    <div
      ref={cardRef}
      role="radio"
      aria-checked={checked}
      aria-disabled={disabled || undefined}
      aria-label={label}
      data-source={source}
      tabIndex={focusable ? 0 : -1}
      onClick={() => { if (!disabled && !checked) onSelect() }}
      onKeyDown={onKeyDown}
      className={cn(
        'relative flex h-full min-w-0 flex-col rounded-2xl border-2 bg-background p-5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        checked ? 'border-primary bg-primary/[0.03]' : 'border-border',
        disabled ? 'cursor-not-allowed opacity-60' : !checked && 'cursor-pointer hover:border-primary/40',
      )}
    >
      <div className="flex items-center gap-2 pr-7">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground/80">{icon}</span>
        {badge}
      </div>
      {checked && <CheckCircle2 aria-hidden="true" className="absolute right-4 top-4 h-5 w-5 text-primary" />}
      <div className="mt-4 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <h4 className="font-semibold">{title}</h4>
        {tag}
      </div>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
      <div className="mt-4 flex-1">{body}</div>
      <div className="mt-4 pt-1">{action}</div>
    </div>
  )
}

const StepIcon = ({ status }: { status: string }) => (
  status === 'complete'
    ? <CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
    : status === 'active'
      ? <Loader2 aria-hidden="true" className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
      : <span aria-hidden="true" className="h-3.5 w-3.5 shrink-0 rounded-full border" />
)

/** Read-only address with a copy button. */
const AddressLine = ({ email }: { email: string }) => {
  const [copied, setCopied] = useState(false)
  return (
    <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2">
      <span className="min-w-0 flex-1 text-sm font-medium [overflow-wrap:anywhere]"><EmailText email={email} /></span>
      <button
        type="button"
        aria-label={copied ? `Copied ${email}` : `Copy ${email}`}
        className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        onClick={(event) => {
          event.stopPropagation()
          void navigator.clipboard?.writeText(email).then(() => {
            setCopied(true)
            window.setTimeout(() => setCopied(false), 1500)
          }, () => undefined)
        }}
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </div>
  )
}

/**
 * The three places the address can come from, as one radio group. One pitch
 * goes to one address, so choosing a card replaces whatever was chosen
 * before. Choosing the verified card never spends anything — the paid search
 * runs only from its own button.
 */
export const PitchRecipientCards = ({
  recipient,
  context,
  onChange,
  verified,
  verifiedOpen,
  onVerifiedOpenChange,
  manualOpen,
  onManualOpenChange,
  disabled,
  canSearch,
  byoAi,
  onStartSearch,
}: PitchRecipientCardsProps) => {
  const podscanEmails = context.podscanEmails
  const recipientSource: RecipientSource | null = recipient
    ? recipient.sources.includes('manual') ? 'manual' : recipient.sources.includes('verified') ? 'verified' : 'podscan'
    : null
  // Which card is chosen. A verified or manual card can be chosen before it has
  // an address; the address then follows (a search result, or what is typed).
  const active: RecipientSource | null = recipientSource
    ?? (manualOpen ? 'manual' : verifiedOpen ? 'verified' : null)
  const verifiedUsable = Boolean(verified.email) && !verified.running
  const recommended: RecipientSource = verifiedUsable && !verified.stale
    ? 'verified'
    : podscanEmails.length > 0 ? 'podscan' : 'manual'

  const cards = useRef<Partial<Record<RecipientSource, HTMLDivElement | null>>>({})
  const sourceDisabled = (source: RecipientSource) => disabled || (source === 'podscan' && podscanEmails.length === 0)

  const select = (source: RecipientSource) => {
    if (sourceDisabled(source)) return
    // A verified search the operator asked for stays theirs when they pick
    // another card: its result is then offered rather than lost.
    if (source === 'podscan') {
      onManualOpenChange(false)
      onChange(chooseRecipient(context, podscanEmails[0], 'podscan'))
    } else if (source === 'verified') {
      onManualOpenChange(false)
      onVerifiedOpenChange(true)
      // Reusing a contact the platform already holds is free; only the
      // search costs anything, and it waits for its own button.
      onChange(verifiedUsable ? chooseRecipient(context, verified.email!, 'verified') : [])
    } else {
      onManualOpenChange(true)
      onChange([])
    }
  }

  const arrow = (from: RecipientSource, direction: 1 | -1) => {
    const enabled = ORDER.filter((source) => !sourceDisabled(source))
    if (enabled.length === 0) return
    const index = enabled.indexOf(from)
    const next = enabled[(index + direction + enabled.length) % enabled.length]
    select(next)
    cards.current[next]?.focus()
  }

  // Roving focus: the chosen card, else the first one that can be chosen.
  const focusTarget = active && !sourceDisabled(active) ? active : ORDER.find((source) => !sourceDisabled(source)) ?? null

  const actionButton = (source: RecipientSource, label: string, onClick: () => void, extra?: { disabled?: boolean; busy?: boolean }) => {
    const checked = active === source && (source !== 'verified' || verifiedUsable) && (source !== 'manual' || recipientSource === 'manual')
    return (
      <Button
        type="button"
        size="sm"
        // A chosen card's button reads as a state, not as a dead control.
        className={cn('w-full', checked && 'border-primary/30 bg-primary/10 text-primary disabled:opacity-100')}
        tabIndex={-1}
        variant={checked ? 'outline' : source === recommended ? 'default' : 'outline'}
        disabled={sourceDisabled(source) || checked || extra?.disabled}
        onClick={(event) => {
          event.stopPropagation()
          onClick()
        }}
      >
        {checked
          ? <><CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />Selected</>
          : extra?.busy ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />{label}</> : label}
      </Button>
    )
  }

  const common = (source: RecipientSource) => ({
    source,
    checked: active === source,
    disabled: sourceDisabled(source),
    focusable: focusTarget === source,
    onSelect: () => select(source),
    onArrow: (direction: 1 | -1) => arrow(source, direction),
    cardRef: (node: HTMLDivElement | null) => { cards.current[source] = node },
  })

  const recommendedTag = (source: RecipientSource) => source === recommended && active !== source
    ? <span className="text-[11px] font-medium text-primary">Recommended</span>
    : null

  const verifiedStatus = verified.running ? (
    <div role="status">
      <p className="flex items-center gap-2 text-sm font-medium"><Loader2 className="h-3.5 w-3.5 animate-spin" />Direct email search in progress</p>
      <ol className="mt-2 space-y-1.5">
        {verified.steps.map((step) => (
          <li key={step.id} className={cn('flex items-center gap-2 text-xs', step.status === 'queued' ? 'text-muted-foreground' : 'font-medium')}>
            <StepIcon status={step.status} />{step.title}
          </li>
        ))}
      </ol>
    </div>
  ) : verified.email ? (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-emerald-700">Found</p>
      <AddressLine email={verified.email} />
      <p className="text-xs text-muted-foreground">{verified.stale ? 'This contact needs a fresh lookup before outreach.' : 'Already shared across the Database. No new lookup needed.'}</p>
    </div>
  ) : verified.noResult ? (
    <div className="space-y-1">
      <p className="text-xs font-medium text-amber-700">Not found</p>
      <p className="text-xs leading-5 text-muted-foreground">{verified.message || 'No verified work email found. Try again, or use another option.'}</p>
    </div>
  ) : (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">Not searched</p>
      <p className="text-xs leading-5 text-muted-foreground">Nothing runs until you start the search.</p>
    </div>
  )

  const searchLabel = verified.running ? 'Searching…' : verified.noResult || verified.stale ? 'Try search again' : 'Find verified email'

  return (
    <div
      id={PITCH_RECIPIENT_GROUP_ID}
      role="radiogroup"
      aria-label="Who receives this pitch"
      className="grid items-stretch gap-4 min-[900px]:grid-cols-3"
    >
      <SourceCard
        {...common('podscan')}
        label="Use free podcast inbox"
        icon={<Mail className="h-4 w-4" />}
        badge={<Badge variant="outline" className="whitespace-nowrap border-emerald-200 bg-emerald-50 font-normal text-emerald-800">Free · Podscan</Badge>}
        tag={recommendedTag('podscan')}
        title="Free podcast inbox"
        description="From Podscan. Often a general show inbox rather than the host."
        body={podscanEmails.length === 0 ? (
          <p className="rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground">No public email found</p>
        ) : podscanEmails.length === 1 ? (
          <AddressLine email={podscanEmails[0]} />
        ) : (
          <div className="space-y-2" onClick={(event) => event.stopPropagation()}>
            <p className="text-[11px] text-muted-foreground">Podscan lists {podscanEmails.length} addresses. Choose one.</p>
            <RadioGroup
              aria-label="Podscan addresses"
              value={recipientSource === 'podscan' ? recipient!.email : ''}
              disabled={disabled}
              onValueChange={(email) => {
                onManualOpenChange(false)
                onChange(chooseRecipient(context, email, 'podscan'))
              }}
            >
              {podscanEmails.map((email) => (
                <div key={email} className="flex items-center gap-2">
                  <RadioGroupItem id={`podscan-${email}`} value={email} />
                  <Label htmlFor={`podscan-${email}`} className="min-w-0 cursor-pointer truncate text-sm font-normal">{email}</Label>
                </div>
              ))}
            </RadioGroup>
          </div>
        )}
        action={actionButton('podscan', 'Use this inbox', () => select('podscan'))}
      />

      <SourceCard
        {...common('verified')}
        label="Use verified host email"
        icon={<Search className="h-4 w-4" />}
        badge={<Badge variant="secondary" className="whitespace-nowrap font-normal">Provider billed</Badge>}
        tag={recommendedTag('verified')}
        title="Verified host email"
        description="Finds the host’s LinkedIn profile, then their verified work email."
        body={(
          <div className="space-y-3">
            <p className="text-xs leading-5 text-muted-foreground">
              <span className="font-medium text-foreground">Cost: </span>
              {verifiedUsable ? 'None. Already found.' : byoAi ? 'Billed to your AI provider. No app credits.' : 'Connect your Claude or OpenAI key in Billing to search.'}
            </p>
            {verifiedStatus}
            {verified.linkedinUrl && safeExternalUrl(verified.linkedinUrl) && (
              <p className="truncate text-xs text-muted-foreground">
                LinkedIn: <a className="text-primary underline" href={safeExternalUrl(verified.linkedinUrl)!} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>{verified.linkedinUrl}</a>
              </p>
            )}
          </div>
        )}
        action={verifiedUsable && !verified.stale
          ? actionButton('verified', 'Use verified email', () => select('verified'))
          : actionButton('verified', searchLabel, () => {
            select('verified')
            onStartSearch()
          }, { disabled: verified.running || !canSearch, busy: verified.running })}
      />

      <SourceCard
        {...common('manual')}
        label="Use an email you found"
        icon={<PenLine className="h-4 w-4" />}
        badge={<Badge variant="outline" className="whitespace-nowrap font-normal">Free · No lookup</Badge>}
        tag={recommendedTag('manual')}
        title="An email you found"
        description="A host or producer address you already have."
        body={(
          <ManualRecipientInput
            recipient={recipientSource === 'manual' ? recipient : null}
            disabled={disabled}
            onChoose={(email) => {
              onManualOpenChange(true)
              onChange(chooseRecipient(context, email, 'manual'))
            }}
            onClear={() => onChange([])}
            onRoleChange={(role) => recipient && onChange(setContactRole([recipient], role))}
          />
        )}
        action={actionButton('manual', 'Use this email', () => {
          select('manual')
          document.getElementById('campaign-manual-email')?.focus()
        })}
      />
    </div>
  )
}
