import type { ReactNode } from 'react'
import { CheckCircle2, Loader2, Mail, PenLine, Search } from 'lucide-react'
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
} from '@/lib/pitchRecipients'
import { cn } from '@/lib/utils'
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
  /** The search panel is open: the operator asked for the verified email. */
  verifiedOpen: boolean
  onVerifiedOpenChange: (open: boolean) => void
  manualOpen: boolean
  onManualOpenChange: (open: boolean) => void
  /** Relationship review outstanding or do-not-contact: nothing may change. */
  disabled: boolean
  /** A search may start: relationship cleared and an AI key connected. */
  canSearch: boolean
  byoAi: boolean
  onStartSearch: () => void
}

const UseToggle = ({ label, selected, disabled, onUse }: { label: string; selected: boolean; disabled?: boolean; onUse: () => void }) => (
  <Button
    type="button"
    size="sm"
    variant={selected ? 'default' : 'outline'}
    aria-pressed={selected}
    aria-label={label}
    disabled={disabled}
    onClick={() => { if (!selected) onUse() }}
  >
    {selected ? <><CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />Selected</> : 'Use this'}
  </Button>
)

const SourceCard = ({ selected, tone, children }: { selected: boolean; tone: 'primary' | 'violet' | 'slate'; children: ReactNode }) => (
  <div
    className={cn(
      'flex flex-col rounded-2xl border p-5 transition-all',
      selected && tone === 'primary' && 'border-primary bg-primary/5 shadow-sm ring-1 ring-primary/20',
      selected && tone === 'violet' && 'border-violet-500 bg-violet-50/50 shadow-sm ring-1 ring-violet-200',
      selected && tone === 'slate' && 'border-slate-500 bg-slate-50 shadow-sm ring-1 ring-slate-200',
      !selected && 'bg-background',
    )}
  >
    {children}
  </div>
)

/**
 * The three places the address can come from. One pitch goes to one
 * address, so choosing from a card replaces whatever was chosen before.
 * Opening the verified card never spends anything — the paid search runs
 * only from its own button.
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
  const fromPodscan = Boolean(recipient?.sources.includes('podscan'))
  const fromVerified = Boolean(recipient?.sources.includes('verified'))
  const fromManual = Boolean(recipient?.sources.includes('manual'))
  const showSearch = verifiedOpen || fromVerified
  const showManual = manualOpen || fromManual

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <SourceCard selected={fromPodscan} tone="primary">
        <div className="flex items-start justify-between gap-3">
          <div className="rounded-xl bg-slate-100 p-2.5 text-slate-700"><Mail className="h-5 w-5" /></div>
          <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-800">Free · Podscan</Badge>
        </div>
        <h4 className="mt-4 font-semibold">Free podcast inbox</h4>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">Supplied with the podcast by Podscan. Always free, but may route to a general show inbox.</p>
        {podscanEmails.length === 0 ? (
          <p className="mt-4 rounded-xl border bg-background px-3 py-2.5 text-sm text-muted-foreground">No public email found</p>
        ) : podscanEmails.length === 1 ? (
          <p className="mt-4 truncate rounded-xl border bg-background px-3 py-2.5 text-sm font-medium">{podscanEmails[0]}</p>
        ) : (
          <div className="mt-4 space-y-2 rounded-xl border bg-background px-3 py-2.5">
            <p className="text-[11px] text-muted-foreground">Podscan lists {podscanEmails.length} addresses. Choose one.</p>
            <RadioGroup
              aria-label="Podscan addresses"
              value={fromPodscan ? recipient!.email : ''}
              disabled={disabled}
              onValueChange={(email) => onChange(chooseRecipient(context, email, 'podscan'))}
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
        <div className="mt-auto pt-4">
          <UseToggle
            label="Use free podcast inbox"
            selected={fromPodscan}
            disabled={disabled || podscanEmails.length === 0}
            onUse={() => onChange(chooseRecipient(context, podscanEmails[0], 'podscan'))}
          />
        </div>
      </SourceCard>

      <SourceCard selected={fromVerified} tone="violet">
        <div className="flex items-center justify-between gap-3"><Search className="h-5 w-5 text-violet-700" /><Badge variant="secondary">Provider billed</Badge></div>
        <h4 className="mt-4 font-semibold">Verified host email</h4>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">Your selected AI provider finds the host’s LinkedIn profile, then Blitz looks up their verified work email.</p>
        {showSearch && (
          <div aria-label="Direct email search" className="mt-4 rounded-xl border border-violet-200 bg-background/80 p-3">
            {verified.email && !verified.running ? (
              <div>
                <p className="truncate text-sm font-medium">{verified.email}</p>
                <p className="mt-1 text-xs text-muted-foreground">{verified.stale ? 'This contact needs a fresh lookup before outreach.' : 'Already shared across the Database. No new lookup needed.'}</p>
              </div>
            ) : verified.running ? (
              <div role="status">
                <p className="flex items-center gap-2 text-sm font-semibold"><Loader2 className="h-4 w-4 animate-spin" />Direct email search in progress</p>
                <div className="mt-2 space-y-1">{verified.steps.map((step) => <p key={step.id} className="text-xs">{step.status === 'complete' ? '✓ ' : step.status === 'active' ? '→ ' : ''}{step.title}</p>)}</div>
              </div>
            ) : verified.noResult ? (
              <p className="text-xs leading-5 text-muted-foreground">{verified.message || 'No verified work email found. Your chosen address stays selected.'}</p>
            ) : (
              <p className="text-xs leading-5 text-muted-foreground">Nothing runs until you start the search.</p>
            )}
            {verified.linkedinUrl && safeExternalUrl(verified.linkedinUrl) && (
              <a className="mt-2 block break-all text-xs text-primary underline" href={safeExternalUrl(verified.linkedinUrl)!} target="_blank" rel="noreferrer">{verified.linkedinUrl}</a>
            )}
            {(!verified.email || verified.stale) && !verified.running && (
              <div className="mt-3 space-y-1.5">
                <Button type="button" size="sm" disabled={!canSearch} onClick={onStartSearch}>
                  <Search className="mr-2 h-3.5 w-3.5" />{verified.noResult || verified.stale ? 'Try search again' : 'Start direct email search'}<span className="ml-1.5 font-normal opacity-70">· Your AI account</span>
                </Button>
                <p className="text-[11px] leading-4 text-muted-foreground">{byoAi ? 'Uses your selected AI key and platform-managed contact enrichment. AI provider charges apply.' : 'Connect your Claude or OpenAI key in Billing to start.'}</p>
              </div>
            )}
          </div>
        )}
        <div className="mt-auto pt-4">
          <UseToggle
            label="Use verified host email"
            selected={fromVerified}
            disabled={disabled}
            onUse={() => {
              onVerifiedOpenChange(true)
              // Reusing a contact the platform already holds is free; only
              // the search costs anything, and it waits for its own button.
              if (verified.email) onChange(chooseRecipient(context, verified.email, 'verified'))
            }}
          />
        </div>
      </SourceCard>

      <SourceCard selected={fromManual} tone="slate">
        <div className="flex items-start justify-between gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-700"><PenLine className="h-4 w-4" /></span>
          <Badge variant="outline">Free · No lookup</Badge>
        </div>
        <h4 className="mt-4 font-semibold">An email you found</h4>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">Add a host or producer email you found yourself. No provider lookup needed.</p>
        {showManual && (
          <div className="mt-4">
            <ManualRecipientInput
              recipient={fromManual ? recipient : null}
              disabled={disabled}
              onChoose={(email) => onChange(chooseRecipient(context, email, 'manual'))}
              onClear={() => onChange([])}
              onRoleChange={(role) => recipient && onChange(setContactRole([recipient], role))}
            />
          </div>
        )}
        <div className="mt-auto pt-4">
          <UseToggle
            label="Use an email you found"
            selected={fromManual}
            disabled={disabled}
            onUse={() => onManualOpenChange(true)}
          />
        </div>
      </SourceCard>
    </div>
  )
}
