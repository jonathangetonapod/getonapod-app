import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { AlertCircle, ArrowLeft, ArrowRight, CheckCircle2, Loader2, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

export interface PitchStagedResult {
  added: boolean
  /**
   * The lead reached the sending platform. Without it the podcast is on the
   * campaign list and the copy is saved, but no host exists to receive it.
   */
  leadStaged: boolean
  willSend: boolean
  hostName: string
  contactEmail: string
  campaignName: string
}

interface PitchStagedConfirmationProps {
  result: PitchStagedResult
  podcastName: string
  page: boolean
  campaignHref: string
  shortlistHref?: string
  /** The next podcast in the pitch queue, so the operator can keep going. */
  nextPitch?: { name: string; href: string } | null
  onDismiss?: () => void
  onAddEmail: () => void
  onRemove: () => void
  removing: boolean
  errorAlert?: ReactNode
}

const STEPS = [
  { label: 'Email 1', name: 'Opening pitch' },
  { label: 'Email 2', name: 'Follow-up' },
  { label: 'Email 3', name: 'Close the loop' },
]

/**
 * What the operator sees straight after sending a pitch to the client campaign.
 *
 * Sending into a live campaign is the outcome they confirmed a moment earlier,
 * so it reads as done, with what happens next and where to go. Amber is kept
 * for the one result that is not finished: saved, but with no lead to send to.
 */
export const PitchStagedConfirmation = ({
  result, podcastName, page, campaignHref, shortlistHref, nextPitch, onDismiss, onAddEmail, onRemove, removing, errorAlert,
}: PitchStagedConfirmationProps) => {
  const noLead = !result.leadStaged
  const live = result.leadStaged && result.willSend
  const host = result.hostName || 'The host'
  const when = live
    ? ['Next send window', 'Day 6, same thread', 'Day 13, same thread']
    : ['When you start outreach', '6 days after email 1', '13 days after email 1']

  return (
    <div
      role="status"
      aria-label="Pitch added to client campaign"
      className={`${page ? '' : 'm-6 '}flex min-h-80 flex-col items-center justify-center rounded-2xl border px-6 py-10 text-center ${
        noLead ? 'border-amber-300 bg-amber-50' : 'border-emerald-200 bg-emerald-50/60'
      }`}
    >
      {/* Green is a claim that the work is finished. Without a lead it is not. */}
      {noLead ? <AlertCircle className="h-10 w-10 text-amber-700" /> : <CheckCircle2 className="h-10 w-10 text-emerald-600" />}
      <h3 className="mt-4 text-lg font-semibold">
        {noLead
          ? `${podcastName} was added, but has no lead`
          : live
            ? `Pitch sent: ${podcastName} is in the live sequence`
            : `${podcastName} was added to ${result.campaignName}`}
      </h3>
      {/* Saying "added as a lead" when no lead exists sends somebody to the
          sending platform looking for a host who was never created. */}
      <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
        {noLead
          ? `The podcast and its sequence are saved to ${result.campaignName}. No lead was created, because there is no contact email to create one for, so nothing can reach the host yet.`
          : live
            ? `${host} was ${result.added ? 'added to' : 'updated in'} ${result.campaignName} with all three emails. No further approval is needed.`
            : `${host} was ${result.added ? 'added' : 'updated'} in ${result.campaignName} as a lead, with the full three-email sequence attached.`}
      </p>

      <dl className="mt-5 w-full max-w-sm space-y-2 rounded-xl border bg-background/80 p-4 text-left text-xs">
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Contact</dt>
          <dd className={result.contactEmail ? 'truncate font-medium' : 'truncate font-medium text-amber-800'}>{result.contactEmail || 'None yet'}</dd>
        </div>
        <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Campaign</dt><dd className="truncate font-medium">{result.campaignName}</dd></div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Sending</dt>
          <dd className={noLead ? 'font-semibold text-amber-800' : live ? 'font-semibold text-emerald-800' : 'font-medium'}>
            {noLead ? 'Nothing to send — no lead yet' : live ? 'Live — sends automatically' : 'Paused — nothing sends yet'}
          </dd>
        </div>
      </dl>

      {!noLead && (
        <ol aria-label="What happens next" className="mt-4 w-full max-w-sm space-y-2 rounded-xl border bg-background/80 p-4 text-left text-xs">
          {STEPS.map((step, index) => (
            <li key={step.label} className="flex items-center gap-3">
              <span aria-hidden="true" className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[11px] font-semibold text-emerald-800">{index + 1}</span>
              <span className="min-w-0 flex-1"><span className="font-medium">{step.label}</span> <span className="text-muted-foreground">· {step.name}</span></span>
              <span className="shrink-0 text-muted-foreground">{when[index]}</span>
            </li>
          ))}
        </ol>
      )}

      <p className="mt-4 max-w-md text-xs leading-5 text-muted-foreground">
        {noLead
          ? 'Add a contact email and send again to create the lead. Approving outreach before then starts a sequence with nobody in it.'
          : live
            ? 'Follow-ups stop as soon as the host replies. To hold this one back, remove it below, or pause the campaign in Client Campaigns.'
            : 'Open Client Campaigns and choose Approve & start outreach when you are ready for this to send. You can keep editing the sequence until then.'}
      </p>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        {/* The one move that finishes what this screen reports. */}
        {noLead && <Button type="button" onClick={onAddEmail}>Add a contact email</Button>}
        {page ? (
          <>
            {shortlistHref && <Button asChild variant="outline"><Link to={shortlistHref}><ArrowLeft className="mr-2 h-4 w-4" />Back to shortlist</Link></Button>}
            <Button asChild variant={nextPitch || live || noLead ? 'outline' : 'default'}><Link to={campaignHref}>Open campaign<ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
            {/* Pitching is done in runs; the next one is the likeliest move. */}
            {nextPitch && !noLead && (
              <Button asChild>
                <Link to={nextPitch.href} aria-label={`Next pitch: ${nextPitch.name}`}>
                  <span className="max-w-[16rem] truncate">Next pitch: {nextPitch.name}</span><ArrowRight className="ml-2 h-4 w-4 shrink-0" />
                </Link>
              </Button>
            )}
          </>
        ) : (
          <>
            <Button asChild variant={live || noLead ? 'outline' : 'default'}><Link to={campaignHref}>Open Client Campaigns</Link></Button>
            <Button type="button" variant={result.willSend ? 'outline' : 'default'} onClick={onDismiss}>Done</Button>
          </>
        )}
      </div>
      {errorAlert && <div className="mt-6 w-full max-w-xl text-left">{errorAlert}</div>}
      {/* The undo. Most valuable in exactly the moment it is offered:
          right after a send the operator did not mean to make. */}
      <Button type="button" variant="ghost" size="sm" className="mt-3 text-destructive hover:text-destructive" onClick={onRemove} disabled={removing}>
        {removing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
        Remove from campaign
      </Button>
    </div>
  )
}
