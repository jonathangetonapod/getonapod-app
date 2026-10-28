import { useCallback, useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, Circle, CircleHelp, ListChecks, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { plural } from '@/lib/plural'
import { getWorkspaceClients } from '@/services/clients'
import {
  getWorkspaceCampaignOverview,
  getWorkspaceMailboxes,
  type WorkspaceInstantlyIntegration,
} from '@/services/workspaceCampaigns'
import { listWorkspaceOnboarding } from '@/services/workspaceOnboarding'
import {
  getWorkspaceSubscriptionOverview,
  listWorkspaceStaff,
  type WorkspaceStaffView,
} from '@/services/workspaceStaff'

export interface SetupStep {
  key: string
  label: string
  href: string
  required: boolean
  done: boolean
  /** Its source could not be read, so whether it is done is not known. */
  unknown: boolean
  /** Set aside by the agency; it no longer lists or holds setup open. */
  dismissed: boolean
}

export interface SetupProgress {
  steps: SetupStep[]
  requiredDone: number
  requiredTotal: number
  /** Every required step is done or dismissed. */
  complete: boolean
  /** Required steps whose source could not be read. */
  requiredUnknown: number
  /** Required steps dismissed before they were done. */
  requiredDismissed: number
  /** Nothing has answered yet, so the steps are not known either way. */
  loading: boolean
  /** The Instantly connection, for pages that show its status beside the steps. */
  integration: WorkspaceInstantlyIntegration | null
  dismissStep: (key: string) => void
  restoreDismissedSteps: () => void
}

interface UseSetupProgressOptions {
  workspaceId: string
  baseHref: string
  enabled?: boolean
  /**
   * A staff view the caller already holds. The settings page loads it for its
   * own roster, and reading it twice there would race the page's own request.
   */
  staffView?: WorkspaceStaffView | null
}

/*
 * Every read below swallows its own failure and resolves to null. A step whose
 * source cannot be read is shown as unknown rather than not done (telling an
 * agency to connect Instantly when it already has is wrong in a way they act
 * on), and without a red banner: the checklist is a nudge, and an error on a
 * page that otherwise works would be louder than the thing it reports.
 */
const dismissedStepsKey = (workspaceId: string) => `setup-checklist-dismissed-steps:${workspaceId}`

function readDismissedSteps(workspaceId: string): string[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(dismissedStepsKey(workspaceId)) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((key): key is string => typeof key === 'string') : []
  } catch {
    return []
  }
}

function writeDismissedSteps(workspaceId: string, keys: string[]) {
  try {
    if (keys.length) window.localStorage.setItem(dismissedStepsKey(workspaceId), JSON.stringify(keys))
    else window.localStorage.removeItem(dismissedStepsKey(workspaceId))
  } catch {
    // Private browsing or blocked storage: the steps come back next visit.
  }
}

const quietly = <T,>(read: () => Promise<T>) => async (): Promise<T | null> => {
  try {
    return await read()
  } catch {
    return null
  }
}

// The hook lives beside the card so the settings header and the card count the
// same steps; the two are only ever imported together.
// eslint-disable-next-line react-refresh/only-export-components
export function useSetupProgress({
  workspaceId,
  baseHref,
  enabled = true,
  staffView,
}: UseSetupProgressOptions): SetupProgress {
  const active = enabled && Boolean(workspaceId)
  const [dismissedKeys, setDismissedKeys] = useState(() => readDismissedSteps(workspaceId))
  useEffect(() => {
    setDismissedKeys(readDismissedSteps(workspaceId))
  }, [workspaceId])
  const dismissStep = useCallback((key: string) => {
    setDismissedKeys((current) => {
      const next = current.includes(key) ? current : [...current, key]
      writeDismissedSteps(workspaceId, next)
      return next
    })
  }, [workspaceId])
  const restoreDismissedSteps = useCallback(() => {
    writeDismissedSteps(workspaceId, [])
    setDismissedKeys([])
  }, [workspaceId])

  // Short-lived and refreshed on focus: most steps are finished on another
  // page, and a checklist that still says "not done" on the way back reads as
  // if the work did not take. Mutations that finish a step also invalidate
  // ['setup-checklist', workspaceId] directly.
  const common = { enabled: active, retry: false as const, staleTime: 10_000, refetchOnWindowFocus: true }

  const clientsQuery = useQuery({
    queryKey: ['setup-checklist', workspaceId, 'clients'],
    queryFn: quietly(() => getWorkspaceClients(workspaceId)),
    ...common,
  })
  const campaignsQuery = useQuery({
    queryKey: ['setup-checklist', workspaceId, 'campaigns'],
    queryFn: quietly(() => getWorkspaceCampaignOverview(workspaceId)),
    ...common,
  })
  const mailboxesQuery = useQuery({
    queryKey: ['setup-checklist', workspaceId, 'mailboxes'],
    queryFn: quietly(() => getWorkspaceMailboxes(workspaceId)),
    ...common,
  })
  const staffQuery = useQuery({
    queryKey: ['setup-checklist', workspaceId, 'staff'],
    queryFn: quietly(() => listWorkspaceStaff(workspaceId)),
    ...common,
    enabled: active && staffView === undefined,
  })
  const onboardingQuery = useQuery({
    queryKey: ['setup-checklist', workspaceId, 'onboarding'],
    queryFn: quietly(() => listWorkspaceOnboarding(workspaceId, ['templates'])),
    ...common,
  })
  const billingQuery = useQuery({
    queryKey: ['setup-checklist', workspaceId, 'billing'],
    queryFn: quietly(() => getWorkspaceSubscriptionOverview(workspaceId)),
    ...common,
  })

  const staff = staffView === undefined ? staffQuery.data ?? null : staffView
  const integration = campaignsQuery.data?.integration ?? null
  const members = (staff?.members ?? []).filter((member) => member.status !== 'revoked')
  // null is a failed read (see quietly); undefined is one still pending.
  const staffUnknown = staff === null

  const steps: SetupStep[] = ([
    {
      key: 'client-brand',
      label: 'Name what your clients see',
      href: `${baseHref}/settings#client-branding`,
      required: false,
      done: Boolean(staff?.workspace.client_brand_name?.trim()),
      unknown: staffUnknown,
    },
    {
      // Every client email carries this as its reply-to, and the server
      // sends none when it is empty, so a client's reply goes nowhere.
      key: 'reply-to',
      label: 'Set the email clients reply to',
      href: `${baseHref}/settings#client-contact-email`,
      required: true,
      done: Boolean(staff?.workspace.client_contact_email?.trim()),
      unknown: staffUnknown,
    },
    {
      key: 'instantly',
      label: 'Connect Instantly',
      href: `${baseHref}/client-campaigns`,
      required: true,
      done: integration?.connected === true,
      unknown: campaignsQuery.data === null,
    },
    {
      key: 'mailbox',
      label: 'Connect a sending mailbox to a client',
      href: `${baseHref}/mailboxes`,
      required: true,
      done: (mailboxesQuery.data?.accounts ?? []).some((account) => (account.campaigns?.length ?? 0) > 0),
      unknown: mailboxesQuery.data === null,
    },
    {
      key: 'client',
      label: 'Add your first client',
      href: `${baseHref}/clients`,
      required: true,
      done: (clientsQuery.data?.length ?? 0) > 0,
      unknown: clientsQuery.data === null,
    },
    {
      key: 'onboarding',
      label: 'Publish an onboarding template',
      href: `${baseHref}/onboarding`,
      required: false,
      done: (onboardingQuery.data?.templates ?? []).some((template) => template.status === 'published'),
      unknown: onboardingQuery.data === null,
    },
    {
      key: 'billing',
      label: 'Activate your workspace subscription',
      href: `${baseHref}/settings/billing`,
      required: true,
      done: ['active', 'comped'].includes(billingQuery.data?.billing_status ?? '')
        || (billingQuery.data?.billing_status === 'trialing' && Date.parse(billingQuery.data.trial_ends_at ?? '') > Date.now()),
      unknown: billingQuery.data === null,
    },
    {
      key: 'team',
      label: 'Invite your team',
      href: `${baseHref}/settings#workspace-access`,
      required: false,
      done: members.length > 1,
      unknown: staffUnknown,
    },
  ] satisfies Omit<SetupStep, 'dismissed'>[]).map((step) => ({ ...step, dismissed: dismissedKeys.includes(step.key) }))

  const required = steps.filter((step) => step.required)
  const isDone = (step: SetupStep) => step.done && !step.unknown
  const requiredDone = required.filter(isDone).length
  const requiredDismissed = required.filter((step) => step.dismissed && !isDone(step)).length
  // A dismissed step is not reported as unchecked: the agency has said it does
  // not need the reminder.
  const requiredUnknown = required.filter((step) => step.unknown && !step.dismissed).length
  // Waits for every read, so the card does not appear half-filled and then
  // reshuffle as the rest arrive.
  const loading = active && [
    clientsQuery,
    campaignsQuery,
    mailboxesQuery,
    onboardingQuery,
    billingQuery,
    ...(staffView === undefined ? [staffQuery] : []),
  ].some((query) => query.isPending)

  return {
    steps,
    requiredDone,
    requiredTotal: required.length,
    complete: requiredDone + requiredDismissed === required.length,
    requiredUnknown,
    requiredDismissed,
    loading,
    integration,
    dismissStep,
    restoreDismissedSteps,
  }
}

const dismissalKey = (workspaceId: string) => `setup-checklist-dismissed:${workspaceId}`

function readDismissed(workspaceId: string): boolean {
  try {
    return window.localStorage.getItem(dismissalKey(workspaceId)) === '1'
  } catch {
    return false
  }
}

function writeDismissed(workspaceId: string) {
  try {
    window.localStorage.setItem(dismissalKey(workspaceId), '1')
  } catch {
    // Private browsing or blocked storage: the card comes back next visit.
  }
}

interface SetupChecklistProps {
  workspaceId: string
  baseHref: string
  canManage: boolean
}

export const SetupChecklist = ({ workspaceId, baseHref, canManage }: SetupChecklistProps) => {
  const [dismissed, setDismissed] = useState(() => readDismissed(workspaceId))
  useEffect(() => {
    setDismissed(readDismissed(workspaceId))
  }, [workspaceId])

  const progress = useSetupProgress({ workspaceId, baseHref, enabled: canManage && !dismissed })

  const visibleSteps = progress.steps.filter((step) => !step.dismissed)
  const dismissedCount = progress.steps.length - visibleSteps.length

  // Every step set aside one by one is the same as dismissing the card.
  if (!canManage || dismissed || progress.loading || visibleSteps.length === 0) return null

  const dismiss = () => {
    writeDismissed(workspaceId)
    setDismissed(true)
  }

  return (
    <Card data-testid="setup-checklist" className="border-border/70 shadow-sm">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2 text-lg">
            {progress.complete
              ? <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-hidden="true" />
              : <ListChecks className="h-5 w-5" aria-hidden="true" />}
            {progress.complete ? 'Setup complete' : 'Set up your workspace'}
          </CardTitle>
          <CardDescription>
            {progress.complete
              ? `Every required step is ${progress.requiredDismissed > 0 ? 'done or dismissed' : 'done'}. The optional ones stay here until you dismiss this.`
              : 'Required steps are marked. Optional ones can wait.'}
          </CardDescription>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <p className="text-sm text-muted-foreground">
            {progress.requiredDone} of {progress.requiredTotal} required steps done
            {progress.requiredDismissed > 0 && `, ${progress.requiredDismissed} dismissed`}
            {progress.requiredUnknown > 0 && ` (${progress.requiredUnknown} could not be checked)`}
          </p>
          {progress.complete && (
            <Button type="button" size="sm" variant="outline" onClick={dismiss}>Dismiss</Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-border/70">
          {visibleSteps.map((step) => (
            <li
              key={step.key}
              data-step={step.key}
              data-done={step.unknown ? 'unknown' : step.done ? 'true' : 'false'}
              className="flex items-center gap-3 py-2.5"
            >
              {step.unknown
                ? <CircleHelp className="h-5 w-5 shrink-0 text-muted-foreground/60" aria-hidden="true" />
                : step.done
                  ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" />
                  : <Circle className="h-5 w-5 shrink-0 text-muted-foreground/60" aria-hidden="true" />}
              <span className="sr-only">{step.unknown ? 'Could not check:' : step.done ? 'Done:' : 'Not done:'}</span>
              <span className={step.done && !step.unknown ? 'min-w-0 flex-1 text-sm text-muted-foreground line-through' : 'min-w-0 flex-1 text-sm font-medium'}>
                {step.label}
                {step.unknown && <span className="ml-2 text-xs font-normal text-muted-foreground">Could not be checked right now</span>}
              </span>
              <Badge variant={step.required ? 'outline' : 'secondary'} className="shrink-0 rounded-full font-normal">
                {step.required ? 'Required' : 'Optional'}
              </Badge>
              <Link
                to={step.href}
                className="shrink-0 text-sm font-medium text-primary underline-offset-4 hover:underline"
                aria-label={`Open ${step.label}`}
              >
                Open
              </Link>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8 shrink-0 text-muted-foreground"
                onClick={() => progress.dismissStep(step.key)}
                aria-label={`Dismiss ${step.label}`}
                title="Dismiss this step"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
        {dismissedCount > 0 && (
          <Button
            type="button"
            size="sm"
            variant="link"
            className="mt-2 h-auto px-0 text-muted-foreground"
            onClick={progress.restoreDismissedSteps}
          >
            Show {plural(dismissedCount, 'dismissed step')}
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

export default SetupChecklist
