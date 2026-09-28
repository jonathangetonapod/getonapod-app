import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, Circle, ListChecks } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { getWorkspaceClients } from '@/services/clients'
import {
  getWorkspaceCampaignOverview,
  getWorkspaceMailboxes,
  type WorkspaceInstantlyIntegration,
} from '@/services/workspaceCampaigns'
import { listWorkspaceOnboarding } from '@/services/workspaceOnboarding'
import {
  getWorkspaceBillingOverview,
  listWorkspaceStaff,
  type WorkspaceStaffView,
} from '@/services/workspaceStaff'

export interface SetupStep {
  key: string
  label: string
  href: string
  required: boolean
  done: boolean
}

export interface SetupProgress {
  steps: SetupStep[]
  requiredDone: number
  requiredTotal: number
  /** Every required step is done. */
  complete: boolean
  /** Nothing has answered yet, so the steps are not known either way. */
  loading: boolean
  /** The Instantly connection, for pages that show its status beside the steps. */
  integration: WorkspaceInstantlyIntegration | null
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
 * Every read below swallows its own failure. A step whose source cannot be
 * read is simply shown as not done: the checklist is a nudge, and a red banner
 * on a page that otherwise works would be louder than the thing it reports.
 */
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
  const common = { enabled: active, retry: false as const, staleTime: 60_000 }

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
    queryFn: quietly(() => listWorkspaceOnboarding(workspaceId)),
    ...common,
  })
  const billingQuery = useQuery({
    queryKey: ['setup-checklist', workspaceId, 'billing'],
    queryFn: quietly(() => getWorkspaceBillingOverview(workspaceId)),
    ...common,
  })

  const staff = staffView === undefined ? staffQuery.data ?? null : staffView
  const integration = campaignsQuery.data?.integration ?? null
  const members = (staff?.members ?? []).filter((member) => member.status !== 'revoked')

  const steps: SetupStep[] = [
    {
      key: 'client-brand',
      label: 'Name what your clients see',
      href: `${baseHref}/settings#client-branding`,
      required: false,
      done: Boolean(staff?.workspace.client_brand_name?.trim()),
    },
    {
      key: 'instantly',
      label: 'Connect Instantly',
      href: `${baseHref}/client-campaigns`,
      required: true,
      done: integration?.connected === true,
    },
    {
      key: 'mailbox',
      label: 'Connect a sending mailbox to a client',
      href: `${baseHref}/mailboxes`,
      required: true,
      done: (mailboxesQuery.data?.accounts ?? []).some((account) => (account.campaigns?.length ?? 0) > 0),
    },
    {
      key: 'client',
      label: 'Add your first client',
      href: `${baseHref}/clients`,
      required: true,
      done: (clientsQuery.data?.length ?? 0) > 0,
    },
    {
      key: 'onboarding',
      label: 'Publish an onboarding template',
      href: `${baseHref}/onboarding`,
      required: false,
      done: (onboardingQuery.data?.templates ?? []).some((template) => template.status === 'published'),
    },
    {
      key: 'billing',
      label: 'Check your plan and credits',
      href: `${baseHref}/settings/billing`,
      required: true,
      done: billingQuery.data?.has_subscription === true || (billingQuery.data?.balance ?? 0) > 0,
    },
    {
      key: 'team',
      label: 'Invite your team',
      href: `${baseHref}/settings#workspace-access`,
      required: false,
      done: members.length > 1,
    },
  ]

  const required = steps.filter((step) => step.required)
  const requiredDone = required.filter((step) => step.done).length
  const loading = active && [clientsQuery, campaignsQuery, mailboxesQuery, onboardingQuery, billingQuery]
    .every((query) => query.isPending)

  return {
    steps,
    requiredDone,
    requiredTotal: required.length,
    complete: requiredDone === required.length,
    loading,
    integration,
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

  if (!canManage || dismissed || progress.loading) return null

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
              ? 'Every required step is done. The optional ones stay here until you dismiss this.'
              : 'Required steps are marked. Optional ones can wait.'}
          </CardDescription>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <p className="text-sm text-muted-foreground">
            {progress.requiredDone} of {progress.requiredTotal} required steps done
          </p>
          {progress.complete && (
            <Button type="button" size="sm" variant="outline" onClick={dismiss}>Dismiss</Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-border/70">
          {progress.steps.map((step) => (
            <li
              key={step.key}
              data-step={step.key}
              data-done={step.done ? 'true' : 'false'}
              className="flex items-center gap-3 py-2.5"
            >
              {step.done
                ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" />
                : <Circle className="h-5 w-5 shrink-0 text-muted-foreground/60" aria-hidden="true" />}
              <span className="sr-only">{step.done ? 'Done:' : 'Not done:'}</span>
              <span className={step.done ? 'min-w-0 flex-1 text-sm text-muted-foreground line-through' : 'min-w-0 flex-1 text-sm font-medium'}>
                {step.label}
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
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

export default SetupChecklist
