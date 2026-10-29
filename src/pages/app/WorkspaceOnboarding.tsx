import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { Copy, ExternalLink, FilePlus2, Loader2, LogOut, MailWarning, Plus, RefreshCw, Search, Send, ShieldAlert, Sparkles, X } from 'lucide-react'
import { toast } from 'sonner'
import IntakeTable, { IntakeFilterStrip, type IntakeFilter, type IntakeRowAction } from '@/components/onboarding/IntakeTable'
import NewIntakeDialog, { type CreatedIntake } from '@/components/onboarding/NewIntakeDialog'
import OnboardingReviewDialog, { type OnboardingReviewComment } from '@/components/onboarding/OnboardingReviewDialog'
import ReplyToHelpDialog from '@/components/onboarding/ReplyToHelpDialog'
import OnboardingTemplateBuilder, { type OnboardingTemplateDraft } from '@/components/onboarding/OnboardingTemplateBuilder'
import { starterOnboardingTemplate } from '@/components/onboarding/starterTemplate'
import { WorkspaceLayout } from '@/components/workspace/WorkspaceLayout'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useAuth } from '@/contexts/AuthContext'
import { CHASE_AFTER_DAYS, intakeStatus, type IntakeStatus } from '@/lib/intakeStatus'
import { workspaceLogoUrl } from '@/lib/workspaceLogo'
import { selectedWorkspaceBaseHref } from '@/lib/workspaceRoutes'
import {
  approveOnboardingAnswers,
  checkOnboardingEmailDelivery,
  retryOnboardingEmail,
  hasPendingOnboardingEmail,
  requestOnboardingChanges,
  archiveOnboardingInstance,
  archiveOnboardingTemplate,
  duplicateOnboardingTemplate,
  extendOnboardingLink,
  getOnboardingLink,
  getWorkspaceOnboardingDetail,
  listWorkspaceOnboarding,
  publishOnboardingTemplate,
  purgeOnboardingInstance,
  resendOnboardingInvitation,
  revokeOnboardingLink,
  rotateOnboardingLink,
  saveOnboardingTemplate,
  setDefaultOnboardingTemplate,
  startWorkspaceOnboarding,
  updateOnboardingAssignments,
  type OnboardingInstanceSummary,
  type OnboardingInvitationResult,
  type OnboardingTemplate,
  type StartOnboardingInput,
  type WorkspaceOnboardingData,
} from '@/services/workspaceOnboarding'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** The empty state lists this many clients before asking for a search. */
const EMPTY_STATE_CLIENT_LIMIT = 5
const REPLY_TO_BANNER_KEY = 'intake-reply-to-banner-dismissed-v1'

interface Props {
  platformWorkspaceId?: string
}

type ConfirmationAction = 'revoke' | 'archive' | 'purge'
type TemplateConfirmationAction = 'default' | 'archive'
type LinkAction = 'copy' | 'preview' | 'remind' | 'rotate' | 'extend' | 'check_delivery' | 'retry_email'

const linkIsLive = (instance: OnboardingInstanceSummary) => instance.status !== 'expired'
  && new Date(instance.capability_expires_at).valueOf() > Date.now()

function nextCopyName(template: OnboardingTemplate, templates: OnboardingTemplate[]): string {
  const names = new Set(templates.map((candidate) => candidate.name.toLowerCase()))
  let index = 1
  while (names.has(`${template.name} copy ${index}`.toLowerCase())) index += 1
  return `${template.name} Copy ${index}`
}

function staffPreviewUrl(link: string): string {
  return `${link}${link.includes('?') ? '&' : '?'}preview=staff`
}

function readDismissed(workspaceId: string): boolean {
  try {
    return window.localStorage.getItem(`${REPLY_TO_BANNER_KEY}:${workspaceId}`) === '1'
  } catch {
    return false
  }
}

const WorkspaceOnboarding = ({ platformWorkspaceId }: Props) => {
  const { user, workspace, signOut } = useAuth()
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()
  const isPlatformWorkspace = platformWorkspaceId !== undefined
  const selectedWorkspaceId = (platformWorkspaceId || '').toLowerCase()
  const workspaceId = isPlatformWorkspace ? selectedWorkspaceId : workspace?.id || ''
  const validWorkspaceId = UUID_PATTERN.test(workspaceId)
  const queryKey = [isPlatformWorkspace ? 'platform' : 'tenant', user?.id || 'unknown', 'workspace', workspaceId, 'onboarding'] as const
  const [startOpen, setStartOpen] = useState(false)
  const [dialogClientId, setDialogClientId] = useState<string | null>(null)
  const [created, setCreated] = useState<CreatedIntake | null>(null)
  // The link dialog for row actions that hand the operator a link (rotate, a
  // failed reminder, a failed change-request email).
  const [invitation, setInvitation] = useState<OnboardingInvitationResult | null>(null)
  const [invitationEmailRequested, setInvitationEmailRequested] = useState(false)
  const [builderOpen, setBuilderOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<OnboardingTemplate | null>(null)
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null)
  const openedRequestedInstanceRef = useRef<string | null>(null)
  const [confirmation, setConfirmation] = useState<{ action: ConfirmationAction; instance: OnboardingInstanceSummary } | null>(null)
  const [templateConfirmation, setTemplateConfirmation] = useState<{ action: TemplateConfirmationAction; template: OnboardingTemplate } | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<IntakeFilter>('all')
  const [tab, setTab] = useState('instances')
  const [highlightId, setHighlightId] = useState<string | null>(null)
  const [remindedIds, setRemindedIds] = useState<Set<string>>(() => new Set())
  const [clientSearch, setClientSearch] = useState('')
  const [replyToDismissed, setReplyToDismissed] = useState(() => readDismissed(workspaceId))
  const [replyToHelpOpen, setReplyToHelpOpen] = useState(false)

  /*
   * The 30-second poll used to carry every client and every template
   * definition, data that changes only when someone edits it. Now the first
   * load and every explicit refresh read templates and instances; the poll in
   * between reads instances only and keeps the templates it already has.
   */
  const fullListRef = useRef(true)
  const onboardingQuery = useQuery({
    queryKey,
    queryFn: async () => {
      const previous = queryClient.getQueryData<WorkspaceOnboardingData>(queryKey)
      if (fullListRef.current || !previous) {
        const full = await listWorkspaceOnboarding(workspaceId, ['templates', 'instances'])
        fullListRef.current = false
        return full
      }
      const latest = await listWorkspaceOnboarding(workspaceId, ['instances'])
      return { ...latest, templates: previous.templates }
    },
    enabled: validWorkspaceId,
    retry: false,
    gcTime: isPlatformWorkspace ? 0 : undefined,
    refetchInterval: startOpen || builderOpen || selectedInstanceId ? false : 30_000,
  })
  const data = onboardingQuery.data
  const canManage = data?.can_manage === true
  // ?client= comes from a client's record or from the header's "Working on".
  const requestedClientId = (searchParams.get('client') || '').toLowerCase()
  const requestedInstanceId = (searchParams.get('instance') || '').toLowerCase()
  const clientFilter = UUID_PATTERN.test(requestedClientId) ? requestedClientId : null
  const visibleInstances = useMemo(
    () => data?.instances.filter((instance) => !clientFilter || instance.client_id === clientFilter) ?? [],
    [clientFilter, data?.instances],
  )
  const publishedTemplates = useMemo(
    () => data?.templates.filter((template) => template.status === 'published') ?? [],
    [data?.templates],
  )
  // The empty state offers the clients the workspace already has, so they
  // load for it too, not only when the dialog opens.
  const emptyStateNeedsClients = canManage && publishedTemplates.length > 0 && visibleInstances.length === 0
  const clientsQuery = useQuery({
    queryKey: [...queryKey, 'clients'],
    queryFn: () => listWorkspaceOnboarding(workspaceId, ['clients']),
    enabled: validWorkspaceId && (startOpen || Boolean(clientFilter) || emptyStateNeedsClients),
    staleTime: 60_000,
    retry: false,
    gcTime: isPlatformWorkspace ? 0 : undefined,
  })
  const clients = useMemo(() => clientsQuery.data?.clients ?? [], [clientsQuery.data?.clients])
  const filteredClient = clientFilter
    ? clients.find((client) => client.id === clientFilter)
      || (visibleInstances[0] ? { id: clientFilter, name: visibleInstances[0].client_name } : null)
    : null
  const agencyLogoUrl = workspaceLogoUrl(
    data?.workspace.id,
    data?.workspace.logo_path,
    data?.workspace.logo_updated_at,
  )
  const emailConfigured = data?.email_delivery.configured !== false

  const detailQuery = useQuery({
    queryKey: [...queryKey, 'detail', selectedInstanceId || 'none'],
    queryFn: () => getWorkspaceOnboardingDetail(workspaceId, selectedInstanceId || ''),
    enabled: Boolean(selectedInstanceId && validWorkspaceId),
    retry: false,
  })

  // A failed detail load left the review dialog open on nothing.
  const detailError = detailQuery.isError ? detailQuery.error : null
  useEffect(() => {
    if (!detailError) return
    toast.error(detailError instanceof Error ? detailError.message : 'Unable to load this intake.')
    setSelectedInstanceId(null)
  }, [detailError])

  useEffect(() => {
    if (
      !UUID_PATTERN.test(requestedInstanceId)
      || openedRequestedInstanceRef.current === requestedInstanceId
      || !visibleInstances.some((instance) => instance.id === requestedInstanceId)
    ) return
    openedRequestedInstanceRef.current = requestedInstanceId
    setSelectedInstanceId(requestedInstanceId)
  }, [requestedInstanceId, visibleInstances])

  useEffect(() => {
    if (!highlightId) return
    const timer = window.setTimeout(() => setHighlightId(null), 2_000)
    return () => window.clearTimeout(timer)
  }, [highlightId])

  const refresh = async () => {
    fullListRef.current = true
    await queryClient.invalidateQueries({ queryKey })
  }

  const openNewIntake = (clientId: string | null = clientFilter) => {
    setDialogClientId(clientId)
    setCreated(null)
    setStartOpen(true)
  }

  const finishNewIntake = (createdId: string | null = created?.result.instance.id ?? null) => {
    setStartOpen(false)
    setCreated(null)
    if (!createdId) return
    setTab('instances')
    setStatusFilter('all')
    setSearch('')
    setHighlightId(createdId)
  }

  // Fill it in myself opens its tab inside the click, before the intake
  // exists, or a popup blocker would stop it.
  const fillWindowRef = useRef<Window | null>(null)
  const startMutation = useMutation({
    mutationFn: (input: StartOnboardingInput) => startWorkspaceOnboarding(workspaceId, input),
    onSuccess: async (result, variables) => {
      await refresh()
      const fillWindow = fillWindowRef.current
      fillWindowRef.current = null
      if (fillWindow && !fillWindow.closed) {
        fillWindow.location.href = staffPreviewUrl(result.onboarding_url)
        finishNewIntake(result.instance.id)
        toast.success(`${result.instance.client_name}'s intake is open in a new tab. Fill it in and submit it there.`)
      } else {
        setCreated({ result, emailRequested: Boolean(variables.send_email) })
      }
      if (result.replayed) toast.info('This intake was already created. Here is its link.')
      if (result.duplicate_client) {
        toast.warning(`${result.duplicate_client.name || 'Another client'} already uses this email. Check that you did not create a duplicate client.`)
      }
    },
    onError: (error) => {
      fillWindowRef.current?.close()
      fillWindowRef.current = null
      toast.error(error instanceof Error ? error.message : 'Unable to create the intake.')
    },
  })

  const startIntake = (input: StartOnboardingInput, fillIn: boolean) => {
    if (fillIn) {
      const opened = window.open('about:blank', '_blank')
      if (opened) opened.opener = null
      fillWindowRef.current = opened
    }
    startMutation.mutate(input)
  }

  const templateMutation = useMutation({
    mutationFn: async ({ draft, publish, makeDefault }: { draft: OnboardingTemplateDraft; publish: boolean; makeDefault: boolean }) => {
      const saved = await saveOnboardingTemplate(workspaceId, draft, editingTemplate?.id)
      if (!publish) return saved
      try {
        return await publishOnboardingTemplate(workspaceId, saved.id, makeDefault)
      } catch {
        // The draft exists now; point the builder at it so a retry updates
        // it instead of creating a second copy.
        setEditingTemplate(saved)
        await refresh()
        throw new Error('The template was saved as a draft, but publishing failed. Try again.')
      }
    },
    onSuccess: async () => {
      await refresh()
      setBuilderOpen(false)
      setEditingTemplate(null)
      toast.success('Form template saved.')
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Unable to save the template.'),
  })

  // The draft a failed starter publish left behind, so a retry publishes it
  // instead of creating another copy.
  const starterDraftIdRef = useRef<string | null>(null)
  const starterMutation = useMutation({
    mutationFn: async () => {
      const pendingId = starterDraftIdRef.current
      const savedId = pendingId && (data?.templates ?? []).some((template) => template.id === pendingId)
        ? pendingId
        : (await saveOnboardingTemplate(workspaceId, starterOnboardingTemplate(data?.workspace.name ?? ''))).id
      starterDraftIdRef.current = savedId
      try {
        const published = await publishOnboardingTemplate(workspaceId, savedId, publishedTemplates.length === 0)
        starterDraftIdRef.current = null
        return published
      } catch {
        await refresh()
        throw new Error('The starter form was saved as a draft, but publishing failed. Open it under Form templates to publish.')
      }
    },
    onSuccess: async () => {
      await refresh()
      toast.success('Starter form published. Edit it anytime under Form templates.')
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Unable to create the starter form.'),
  })

  const templateActionMutation = useMutation({
    mutationFn: async ({ action, template }: { action: 'duplicate' | 'default' | 'archive'; template: OnboardingTemplate }) => {
      if (action === 'duplicate') return duplicateOnboardingTemplate(workspaceId, template.id, nextCopyName(template, data?.templates ?? []))
      if (action === 'default') return setDefaultOnboardingTemplate(workspaceId, template.id)
      return archiveOnboardingTemplate(workspaceId, template.id)
    },
    onSuccess: async (_, variables) => {
      await refresh()
      setTemplateConfirmation(null)
      toast.success(variables.action === 'duplicate' ? 'Template duplicated.' : variables.action === 'default' ? 'Default template updated.' : 'Template archived.')
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Unable to update the template.'),
  })

  const approveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedInstanceId) throw new Error('No intake is selected.')
      return approveOnboardingAnswers(workspaceId, selectedInstanceId)
    },
    onSuccess: async () => {
      await refresh()
      await detailQuery.refetch()
      toast.success('Intake approved.')
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Unable to approve the intake.'),
  })

  const requestChangesMutation = useMutation({
    mutationFn: async (comments: OnboardingReviewComment[]) => {
      if (!selectedInstanceId) throw new Error('No intake is selected.')
      return requestOnboardingChanges(workspaceId, selectedInstanceId, comments)
    },
    onSuccess: async (result) => {
      await refresh()
      await detailQuery.refetch()
      setSelectedInstanceId(null)
      // The client is emailed here, so a failed send has to be said out loud:
      // the link reopened either way and they are not expecting it. The link
      // is put in front of the operator rather than left in a row menu.
      if (result.delivery?.status === 'sent') toast.success('Changes requested. The client has been emailed their reopened link.')
      else {
        toast.warning(!result.delivery || result.delivery.status === 'unknown'
          ? 'Changes recorded. Email delivery is unknown. Check delivery before sending another message.'
          : 'Changes recorded and the link reopened, but the email did not send. Share the link below with the client.')
        if (result.onboarding_url && result.instance) {
          setInvitationEmailRequested(true)
          setInvitation({
            instance: result.instance,
            onboarding_url: result.onboarding_url,
            delivery: result.delivery ?? { status: 'unknown' },
          })
        }
      }
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Unable to request changes.'
      toast.error(selectedInstanceId && hasPendingOnboardingEmail(workspaceId, selectedInstanceId)
        ? `${message} The email outcome is unconfirmed. Close the review and use Check delivery before sending again.`
        : message)
    },
  })

  const copyLink = async (link: string): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(link)
      toast.success('Link copied.')
      return true
    } catch {
      return false
    }
  }

  // The tab for Fill in the form is opened inside the click, before the link is
  // fetched, or a popup blocker would stop it.
  const previewWindowRef = useRef<Window | null>(null)
  const linkMutation = useMutation({
    mutationFn: async ({ action, instance }: { action: LinkAction; instance: OnboardingInstanceSummary }) => {
      if (action === 'check_delivery') return checkOnboardingEmailDelivery(workspaceId, instance.id)
      if (action === 'retry_email') return retryOnboardingEmail(workspaceId, instance.id)
      if (action === 'copy' || action === 'preview') return getOnboardingLink(workspaceId, instance.id)
      // A lapsed link is never emailed as-is: resending it rotates to a fresh
      // 14-day link and emails that one.
      if (action === 'remind') {
        return linkIsLive(instance)
          ? resendOnboardingInvitation(workspaceId, instance.id)
          : rotateOnboardingLink(workspaceId, instance.id, 14, true)
      }
      return action === 'rotate'
        ? rotateOnboardingLink(workspaceId, instance.id, 14)
        : extendOnboardingLink(workspaceId, instance.id, 14)
    },
    onSuccess: async (result, variables) => {
      const showLink = (emailRequested: boolean) => {
        if (!result.onboarding_url || !result.instance) return
        setInvitationEmailRequested(emailRequested)
        setInvitation({
          instance: result.instance,
          onboarding_url: result.onboarding_url,
          delivery: result.delivery ?? { status: 'skipped' },
        })
      }
      if (variables.action === 'copy') {
        // Clipboard access can lapse while the link loads; show it instead.
        if (result.onboarding_url && !(await copyLink(result.onboarding_url))) showLink(false)
        return
      }
      if (variables.action === 'preview') {
        const target = previewWindowRef.current
        previewWindowRef.current = null
        if (result.onboarding_url && target && !target.closed) target.location.href = staffPreviewUrl(result.onboarding_url)
        else if (result.onboarding_url) showLink(false)
        return
      }
      await refresh()
      if (variables.action === 'check_delivery' || variables.action === 'retry_email') {
        if (result.delivery?.status === 'sent') toast.success('The app records this email as sent.')
        else if (result.delivery?.status === 'failed' || result.delivery?.status === 'skipped') toast.warning('The email was not sent. You can send a new message or share the link.')
        else if (result.operation_state === 'not_started' || result.operation_state === 'prepared') toast.info('The original email has not started sending. You can retry the original request.', {
          action: { label: 'Retry original email', onClick: () => linkMutation.mutate({ action: 'retry_email', instance: variables.instance }) },
        })
        else toast.info('App delivery record refreshed. If it is still unknown, contact support before sending another message.')
        return
      }
      if (variables.action === 'remind') {
        if (result.delivery?.status === 'sent') {
          setRemindedIds((current) => new Set(current).add(variables.instance.id))
          toast.success('Reminder sent')
        } else {
          toast.warning(!result.delivery || result.delivery.status === 'unknown'
            ? 'Email delivery is unknown. Check delivery before sending another message.'
            : 'The reminder did not send. Share the link below with the client.')
          showLink(true)
        }
        return
      }
      if (variables.action === 'rotate') {
        showLink(false)
        toast.success('Secure link rotated. Older links no longer work.')
        return
      }
      toast.success('Link extended by 14 days.')
    },
    onError: (error, variables) => {
      if (variables.action === 'preview') {
        previewWindowRef.current?.close()
        previewWindowRef.current = null
      }
      const message = error instanceof Error ? error.message : 'Unable to update the secure link.'
      toast.error(hasPendingOnboardingEmail(workspaceId, variables.instance.id)
        ? `${message} The email outcome is unconfirmed. Use Check delivery before sending again.`
        : message)
    },
  })

  const assignmentsMutation = useMutation({
    mutationFn: async (membershipIds: string[]) => {
      if (!selectedInstanceId) throw new Error('No intake is selected.')
      return updateOnboardingAssignments(workspaceId, selectedInstanceId, membershipIds)
    },
    onSuccess: async () => {
      await detailQuery.refetch()
      toast.success('Access updated.')
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Unable to update who can view this intake.'),
  })

  const lifecycleMutation = useMutation({
    mutationFn: async ({ action, instance }: { action: ConfirmationAction; instance: OnboardingInstanceSummary }) => {
      if (action === 'revoke') return revokeOnboardingLink(workspaceId, instance.id)
      if (action === 'archive') return archiveOnboardingInstance(workspaceId, instance.id)
      return purgeOnboardingInstance(workspaceId, instance.id)
    },
    onSuccess: async (_, variables) => {
      await refresh()
      setConfirmation(null)
      if (variables.action === 'purge' && selectedInstanceId === variables.instance.id) setSelectedInstanceId(null)
      toast.success(variables.action === 'revoke' ? 'Secure link revoked.' : variables.action === 'archive' ? 'Intake archived.' : 'Intake answers and files permanently deleted. The client record was kept.')
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Unable to update the intake.'),
  })

  const handleRowAction = (action: IntakeRowAction, instance: OnboardingInstanceSummary) => {
    if (action === 'review') setSelectedInstanceId(instance.id)
    else if (action === 'revoke' || action === 'archive' || action === 'purge') setConfirmation({ action, instance })
    else {
      if (action === 'preview') {
        const opened = window.open('about:blank', '_blank')
        if (opened) opened.opener = null
        previewWindowRef.current = opened
      }
      linkMutation.mutate({ action, instance })
    }
  }

  // Measured from the last fetch, which is every 30 seconds while the page is
  // idle. A day boundary is not worth a timer of its own.
  const now = onboardingQuery.dataUpdatedAt || Date.now()
  const statusById = useMemo(
    () => new Map<string, IntakeStatus>(visibleInstances.map((instance) => [instance.id, intakeStatus(instance, now)])),
    [now, visibleInstances],
  )

  // Archived rows are finished work; the strip counts only what is live, and
  // every live row has exactly one status, so the statuses add up to All.
  const counts = useMemo(() => {
    const result = { all: 0, chasing: 0, in_progress: 0, review: 0, approved: 0, expired: 0, archived: 0 }
    for (const instance of visibleInstances) {
      if (instance.archived_at) {
        result.archived += 1
        continue
      }
      result.all += 1
      result[statusById.get(instance.id) ?? 'in_progress'] += 1
    }
    return result
  }, [statusById, visibleInstances])

  const tableInstances = useMemo(() => {
    const query = search.trim().toLowerCase()
    return visibleInstances.filter((instance) => {
      // Archived rows are the only ones a filter hides rather than selects:
      // they are finished work and would otherwise pad every other view.
      if (statusFilter === 'archived' ? !instance.archived_at : Boolean(instance.archived_at)) return false
      if (statusFilter !== 'all' && statusFilter !== 'archived' && statusById.get(instance.id) !== statusFilter) return false
      if (!query) return true
      return instance.client_name.toLowerCase().includes(query)
        || instance.recipient_email.toLowerCase().includes(query)
        || instance.recipient_name.toLowerCase().includes(query)
        || instance.template_name.toLowerCase().includes(query)
    })
  }, [search, statusById, statusFilter, visibleInstances])
  const filtering = statusFilter !== 'all' || search.trim().length > 0

  const emptyStateClients = useMemo(() => {
    const scoped = clientFilter ? clients.filter((client) => client.id === clientFilter) : clients
    const query = clientSearch.trim().toLowerCase()
    return query
      ? scoped.filter((client) => client.name.toLowerCase().includes(query) || (client.email ?? '').toLowerCase().includes(query))
      : scoped
  }, [clientFilter, clientSearch, clients])

  const shareLink = async (link: string) => {
    const agencyName = data?.workspace.name?.trim() || 'Our agency'
    if (!navigator.share) {
      if (!(await copyLink(link))) toast.error('Copy failed. Select and copy the link manually.')
      return
    }
    try {
      await navigator.share({
        title: `${agencyName} · Client intake`,
        text: `${agencyName} sent you a private client intake form.`,
        url: link,
      })
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      toast.error('Sharing could not be opened. Copy the link instead.')
    }
  }

  const dismissReplyToBanner = () => {
    setReplyToDismissed(true)
    try {
      window.localStorage.setItem(`${REPLY_TO_BANNER_KEY}:${workspaceId}`, '1')
    } catch {
      // Dismissed for this visit only when storage is unavailable.
    }
  }

  const openBuilder = (template: OnboardingTemplate | null) => {
    setEditingTemplate(template)
    setBuilderOpen(true)
  }

  if (!isPlatformWorkspace && !workspace) {
    return <WorkspaceLayout><Card><CardHeader><CardTitle>Workspace unavailable</CardTitle><CardDescription>Your account does not have an active workspace.</CardDescription></CardHeader></Card></WorkspaceLayout>
  }

  const effectiveWorkspace = data?.workspace
  const workspaceBaseHref = isPlatformWorkspace ? selectedWorkspaceBaseHref(selectedWorkspaceId) : '/app'
  const platformWorkspace = isPlatformWorkspace
    ? {
        workspaceId: selectedWorkspaceId,
        workspaceName: effectiveWorkspace?.name || 'Client workspace',
        logoUrl: workspaceLogoUrl(effectiveWorkspace?.id, effectiveWorkspace?.logo_path, effectiveWorkspace?.logo_updated_at),
        baseHref: workspaceBaseHref,
      }
    : undefined
  const hasDefaultTemplate = publishedTemplates.some((template) => template.is_default)
  // The reply-to field itself, which Settings scrolls to and focuses.
  const replyToSettingsHref = `${workspaceBaseHref}/settings#client-contact-email`

  const emptyState = () => {
    if (!canManage) {
      return <div className="flex min-h-52 flex-col items-center justify-center gap-3 text-center"><FilePlus2 className="h-10 w-10 text-muted-foreground" /><div><p className="font-medium">Nothing has been shared with you yet</p><p className="text-sm text-muted-foreground">When an owner or admin gives you access to a client’s intake, it appears here.</p></div></div>
    }
    if (publishedTemplates.length === 0) {
      // No published form means a new intake has nothing to send, so the
      // empty state offers the form first.
      return <div className="flex min-h-52 flex-col items-center justify-center gap-3 text-center"><FilePlus2 className="h-10 w-10 text-muted-foreground" /><div><p className="font-medium">Set up your intake form first</p><p className="max-w-md text-sm text-muted-foreground">Use the starter form (name, bio, links, headshot, and speaking topics) and edit it later, or build your own.</p></div><div className="flex flex-wrap justify-center gap-2"><Button disabled={starterMutation.isPending} onClick={() => starterMutation.mutate()}>{starterMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}Use the starter form</Button><Button variant="outline" onClick={() => openBuilder(data?.templates.find((template) => template.status !== 'archived') ?? null)}><Plus className="mr-2 h-4 w-4" />Build your own</Button></div></div>
    }
    const scopedClientCount = clientFilter ? clients.filter((client) => client.id === clientFilter).length : clients.length
    if (clientsQuery.isLoading) {
      return <div className="space-y-3 py-4" aria-label="Loading clients">{[0, 1, 2].map((row) => <Skeleton key={row} className="h-10 w-full" />)}</div>
    }
    if (scopedClientCount === 0) {
      return <div className="flex min-h-52 flex-col items-center justify-center gap-3 text-center"><FilePlus2 className="h-10 w-10 text-muted-foreground" /><div><p className="font-medium">No intakes sent yet</p><p className="text-sm text-muted-foreground">Add your first client and send them the intake form.</p></div><Button onClick={() => openNewIntake(null)}><Plus className="mr-2 h-4 w-4" />New intake</Button></div>
    }
    return (
      <div className="space-y-4 py-2">
        <div><p className="font-medium">No intakes sent yet</p><p className="text-sm text-muted-foreground">Send the intake form to a client you already have, or add a new one.</p></div>
        {scopedClientCount > EMPTY_STATE_CLIENT_LIMIT && (
          <div className="relative max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={clientSearch} onChange={(event) => setClientSearch(event.target.value)} placeholder="Search clients" aria-label="Search clients" className="pl-9" />
          </div>
        )}
        <ul className="divide-y rounded-lg border">
          {emptyStateClients.slice(0, EMPTY_STATE_CLIENT_LIMIT).map((client) => (
            <li key={client.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
              <div className="min-w-0"><p className="truncate text-sm font-medium">{client.name}</p>{client.email && <p className="truncate text-xs text-muted-foreground">{client.email}</p>}</div>
              <Button size="sm" variant="outline" onClick={() => openNewIntake(client.id)}><Send className="mr-2 h-3.5 w-3.5" />Send intake</Button>
            </li>
          ))}
          {emptyStateClients.length === 0 && <li className="px-4 py-3 text-sm text-muted-foreground">No client matches that search.</li>}
        </ul>
        <Button variant="outline" onClick={() => openNewIntake(null)}><Plus className="mr-2 h-4 w-4" />New client intake</Button>
      </div>
    )
  }

  return (
    <WorkspaceLayout platformWorkspace={platformWorkspace}>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div><h1 className="text-3xl font-bold tracking-tight">{filteredClient ? `${filteredClient.name} intake` : 'Client intake'}</h1><p className="mt-1 text-muted-foreground">{filteredClient ? 'Review this client’s intake and answers.' : 'Send clients a private intake form, track who has finished, and review answers.'}</p></div>
          <div className="flex flex-wrap gap-2">
            {filteredClient && <Button asChild variant="outline"><Link to={`${workspaceBaseHref}/clients/${filteredClient.id}`}>Back to client</Link></Button>}
            {canManage && (publishedTemplates.length > 0
              ? <Button onClick={() => openNewIntake()}><Send className="mr-2 h-4 w-4" />New intake</Button>
              : <Button onClick={() => openBuilder(data?.templates.find((template) => template.status !== 'archived') ?? null)}><Plus className="mr-2 h-4 w-4" />Set up a form</Button>)}
          </div>
        </div>

        {!validWorkspaceId ? (
          <Card><CardHeader><CardTitle>Workspace address invalid</CardTitle><CardDescription>The selected workspace could not be identified.</CardDescription></CardHeader></Card>
        ) : onboardingQuery.isLoading ? (
          <div className="flex min-h-72 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : onboardingQuery.error ? (
          <Card><CardHeader><CardTitle>Client intake unavailable</CardTitle><CardDescription>{onboardingQuery.error instanceof Error ? onboardingQuery.error.message : 'Try again.'}</CardDescription></CardHeader><CardContent className="flex flex-wrap gap-2">
            {/* A stale sign-in will not fix itself on retry; the way out is
                signing in again, so offer it directly. */}
            {(onboardingQuery.error as { code?: unknown }).code === 'REAUTHENTICATION_REQUIRED' && (
              <Button onClick={() => void signOut()}><LogOut className="mr-2 h-4 w-4" />Sign out and sign in again</Button>
            )}
            <Button variant="outline" onClick={() => void onboardingQuery.refetch()}><RefreshCw className="mr-2 h-4 w-4" />Try again</Button>
          </CardContent></Card>
        ) : data ? (
          <>
            {!canManage && <Alert><ShieldAlert className="h-4 w-4" /><AlertTitle>Assigned intake access</AlertTitle><AlertDescription>You can review only the intakes assigned to you. Owners and admins manage forms and invitations.</AlertDescription></Alert>}
            {canManage && !emailConfigured && (
              <Alert className="border-amber-200 bg-amber-50 text-amber-900">
                <MailWarning className="h-4 w-4" />
                <AlertTitle>Invitation emails are not set up</AlertTitle>
                <AlertDescription>Email sending is not configured on this platform yet, so no invitation will be emailed. You can still create each private link and share it from your own inbox. Contact support to turn sending on.</AlertDescription>
              </Alert>
            )}
            {/* A setup gap is cheaper to find here than at the moment of
                sending, which is where the dialog used to say it. */}
            {canManage && emailConfigured && !data.workspace.client_contact_email && !replyToDismissed && (
              <Alert className="border-amber-200 bg-amber-50 pr-12 text-amber-900">
                <MailWarning className="h-4 w-4" />
                <AlertTitle>Client replies are not reaching you</AlertTitle>
                <AlertDescription className="space-y-2">
                  <p>If a client replies to an invitation email, the reply goes to a shared sending address you cannot read. Add your own email so replies land in your inbox.</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button asChild size="sm" className="h-8"><Link to={replyToSettingsHref}>Add reply-to email</Link></Button>
                    <Button type="button" size="sm" variant="ghost" className="h-8 text-amber-900 hover:bg-amber-100 hover:text-amber-950" onClick={() => setReplyToHelpOpen(true)}>What does this mean?</Button>
                  </div>
                </AlertDescription>
                <button type="button" className="absolute right-3 top-3 rounded p-1 text-amber-900/70 hover:text-amber-900" aria-label="Dismiss" onClick={dismissReplyToBanner}><X className="h-4 w-4" /></button>
              </Alert>
            )}
            {canManage && publishedTemplates.length === 0 && visibleInstances.length > 0 && (
              <Alert className="border-amber-200 bg-amber-50 text-amber-900">
                <FilePlus2 className="h-4 w-4" />
                <AlertDescription className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span>No published form template. Publish one before sending another intake.</span>
                  <button type="button" className="font-medium underline underline-offset-2" onClick={() => setTab('templates')}>Go to Form templates</button>
                </AlertDescription>
              </Alert>
            )}

            <Tabs value={tab} onValueChange={setTab} className="space-y-4">
              <TabsList><TabsTrigger value="instances">Intakes</TabsTrigger>{canManage && <TabsTrigger value="templates">Form templates</TabsTrigger>}</TabsList>
              {/* The status strip lives inside this tab, so a filter can never
                  be chosen while the list it filters is off screen. */}
              <TabsContent value="instances">
                <Card>
                  <CardContent className="space-y-4 px-3 pt-6 sm:px-6">
                    {visibleInstances.length === 0 ? emptyState() : (
                      <>
                        <IntakeFilterStrip value={statusFilter} onChange={setStatusFilter} counts={counts} />
                        <div className="relative">
                          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            placeholder="Search by client, contact, or form"
                            aria-label="Search intakes"
                            className="pl-9"
                          />
                        </div>
                        {filtering && (
                          <p className="text-xs text-muted-foreground">
                            {tableInstances.length} of {statusFilter === 'archived' ? counts.archived : counts.all} shown
                            <button type="button" className="ml-2 font-medium underline underline-offset-2" onClick={() => { setSearch(''); setStatusFilter('all') }}>Clear</button>
                          </p>
                        )}
                        {tableInstances.length === 0 ? (
                          <p className="py-10 text-center text-sm text-muted-foreground">
                            {statusFilter === 'chasing' && !search.trim()
                              ? `Nothing has gone quiet. Every live intake had activity in the last ${CHASE_AFTER_DAYS} days.`
                              : 'No intakes match this filter.'}
                          </p>
                        ) : (
                          <IntakeTable
                            instances={tableInstances}
                            statusById={statusById}
                            templates={data.templates}
                            now={now}
                            canManage={canManage}
                            emailConfigured={emailConfigured}
                            busy={linkMutation.isPending}
                            highlightId={highlightId}
                            remindedIds={remindedIds}
                            pendingEmailIds={new Set(tableInstances.filter((instance) => hasPendingOnboardingEmail(workspaceId, instance.id)).map((instance) => instance.id))}
                            workspaceBaseHref={workspaceBaseHref}
                            onAction={handleRowAction}
                          />
                        )}
                      </>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {canManage && <TabsContent value="templates">
                <TooltipProvider delayDuration={200}>
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-semibold">Reusable form templates</h2><p className="text-sm text-muted-foreground">Editing never changes a form a client already has. Publishing creates the next version for new links.</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" disabled={starterMutation.isPending} onClick={() => starterMutation.mutate()}>{starterMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}{hasDefaultTemplate ? 'Add another starter copy' : 'Use the starter form'}</Button><Button variant="outline" onClick={() => openBuilder(null)}><Plus className="mr-2 h-4 w-4" />New template</Button></div></div>
                  <div className="grid gap-4 lg:grid-cols-2">{data.templates.map((template) => {
                    // Archiving the default (or the last published form) would
                    // leave New intake with nothing to send.
                    const archiveBlocked = template.is_default || (template.status === 'published' && publishedTemplates.length === 1)
                    return (
                      <Card key={template.id} className={template.status === 'archived' ? 'opacity-60' : undefined}>
                        <CardHeader><div className="flex items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><CardTitle>{template.name}</CardTitle>{template.is_default && <Badge>Default</Badge>}<Badge variant="outline" className="capitalize">{template.status}</Badge></div><CardDescription className="mt-2">{template.description || 'No internal description'}</CardDescription></div></div></CardHeader>
                        <CardContent><div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground"><span>{(template.published_definition ?? template.definition).sections.length} sections</span><span>{(template.published_definition ?? template.definition).sections.reduce((total, section) => total + section.questions.length, 0)} questions</span><span>Version {template.published_version || 'draft'}</span>{template.has_unpublished_changes && <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800">Unpublished changes</Badge>}</div>{template.status !== 'archived' && <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => openBuilder(template)}>Edit builder</Button><Button size="sm" variant="outline" onClick={() => templateActionMutation.mutate({ action: 'duplicate', template })}><Copy className="mr-2 h-4 w-4" />Duplicate</Button>{template.status === 'published' && !template.is_default && <Button size="sm" variant="outline" onClick={() => setTemplateConfirmation({ action: 'default', template })}>Make default</Button>}{archiveBlocked ? (
                          <Tooltip><TooltipTrigger asChild><span tabIndex={0}><Button size="sm" variant="ghost" className="text-destructive" disabled>Archive</Button></span></TooltipTrigger><TooltipContent>Set another template as default first.</TooltipContent></Tooltip>
                        ) : <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setTemplateConfirmation({ action: 'archive', template })}>Archive</Button>}</div>}</CardContent>
                      </Card>
                    )
                  })}</div>
                </TooltipProvider>
              </TabsContent>}
            </Tabs>
          </>
        ) : null}
      </div>

      {data && (
        <NewIntakeDialog
          open={startOpen}
          onOpenChange={(open) => { if (open) setStartOpen(true); else finishNewIntake() }}
          data={data}
          publishedTemplates={publishedTemplates}
          clients={clients}
          clientsLoading={clientsQuery.isLoading}
          initialClientId={dialogClientId}
          workspaceBaseHref={workspaceBaseHref}
          agencyLogoUrl={agencyLogoUrl}
          submitting={startMutation.isPending}
          onSubmit={startIntake}
          created={created}
          onDone={() => finishNewIntake()}
        />
      )}

      <Dialog open={Boolean(invitation)} onOpenChange={(open) => { if (!open) setInvitation(null) }}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>Intake link</DialogTitle><DialogDescription>Share it from your agency’s usual client channel.</DialogDescription></DialogHeader>
          {invitation && invitation.delivery.status === 'sent' && (
            <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900" role="status">
              Invitation emailed to {invitation.instance.recipient_email}. You can still share the link directly below.
            </p>
          )}
          {invitation && invitation.delivery.status === 'failed' && (
            <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="alert">
              The email could not be delivered. Share the link below yourself.
            </p>
          )}
          {invitation && invitation.delivery.status === 'skipped' && invitationEmailRequested && (
            <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="alert">
              {invitation.delivery.reason === 'not_configured'
                ? 'Email sending is not set up on this platform, so nothing was emailed. Share the link below yourself.'
                : 'No email was sent. Share the link below yourself.'}
            </p>
          )}
          {invitation && invitation.delivery.status === 'unknown' && invitationEmailRequested && (
            <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="alert">
              Email delivery is unknown. Check delivery before sending another message.
            </p>
          )}
          {invitation && <div className="space-y-2"><Label htmlFor="onboarding-link">Private intake link for {invitation.instance.recipient_name}</Label><Input id="onboarding-link" readOnly value={invitation.onboarding_url} onFocus={(event) => event.currentTarget.select()} /><div className="grid gap-2 sm:grid-cols-2"><Button onClick={() => void shareLink(invitation.onboarding_url)}>Share link</Button><Button variant="outline" onClick={() => void copyLink(invitation.onboarding_url).then((copied) => { if (!copied) toast.error('Copy failed. Select and copy the link manually.') })}><Copy className="mr-2 h-4 w-4" />Copy link</Button></div><p className="text-xs text-muted-foreground">Anyone with this link can complete this client’s intake until it expires or is revoked. Send it only to the intended contact.</p></div>}
          <DialogFooter>{invitation && <Button variant="outline" asChild><a href={staffPreviewUrl(invitation.onboarding_url)} target="_blank" rel="noreferrer"><ExternalLink className="mr-2 h-4 w-4" />Fill in the form</a></Button>}<Button onClick={() => setInvitation(null)}>Done</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <ReplyToHelpDialog open={replyToHelpOpen} onOpenChange={setReplyToHelpOpen} workspaceName={data?.workspace.name ?? ''} settingsHref={replyToSettingsHref} />

      <OnboardingTemplateBuilder open={builderOpen} template={editingTemplate} workspaceName={data?.workspace.name ?? ''} workspaceLogoUrl={agencyLogoUrl} saving={templateMutation.isPending} onOpenChange={(open) => { setBuilderOpen(open); if (!open) setEditingTemplate(null) }} onSave={(draft, publish, makeDefault) => templateMutation.mutate({ draft, publish, makeDefault })} />

      <OnboardingReviewDialog
        open={Boolean(selectedInstanceId)}
        detail={detailQuery.data ?? null}
        canManage={canManage}
        busy={approveMutation.isPending || requestChangesMutation.isPending || detailQuery.isFetching}
        onOpenChange={(open) => { if (!open) setSelectedInstanceId(null) }}
        onApprove={() => approveMutation.mutate()}
        onRequestChanges={(comments) => requestChangesMutation.mutate(comments)}
        assignableMembers={data?.assignable_members ?? []}
        assignmentsSaving={assignmentsMutation.isPending}
        onUpdateAssignments={(membershipIds) => assignmentsMutation.mutate(membershipIds)}
      />

      {selectedInstanceId && detailQuery.isLoading && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/20" role="status" aria-label="Loading intake details"><div className="rounded-xl bg-background p-6 shadow-xl"><Loader2 className="h-7 w-7 animate-spin text-primary" aria-hidden="true" /><span className="sr-only">Loading intake details</span></div></div>}

      <AlertDialog open={Boolean(templateConfirmation)} onOpenChange={(open) => { if (!open && !templateActionMutation.isPending) setTemplateConfirmation(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{templateConfirmation?.action === 'archive' ? `Archive ${templateConfirmation.template.name}?` : `Make ${templateConfirmation?.template.name} the default?`}</AlertDialogTitle>
            <AlertDialogDescription>{templateConfirmation?.action === 'archive'
              ? 'It can no longer be chosen for new intakes. Clients who already have a link keep their form.'
              : 'New intakes will start with this form selected. Links already sent are not changed.'}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel disabled={templateActionMutation.isPending}>Cancel</AlertDialogCancel><AlertDialogAction className={templateConfirmation?.action === 'archive' ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : undefined} disabled={templateActionMutation.isPending} onClick={(event) => { event.preventDefault(); if (templateConfirmation) templateActionMutation.mutate(templateConfirmation) }}>{templateActionMutation.isPending ? 'Working…' : templateConfirmation?.action === 'archive' ? 'Archive template' : 'Make default'}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={Boolean(confirmation)} onOpenChange={(open) => { if (!open && !lifecycleMutation.isPending) setConfirmation(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>{confirmation?.action === 'purge' ? 'Permanently delete their answers and files?' : confirmation?.action === 'archive' ? 'Archive this intake?' : 'Revoke this secure link?'}</AlertDialogTitle><AlertDialogDescription>{confirmation?.action === 'purge' ? 'This permanently deletes every intake draft, saved answer revision, review note, AI draft, notification record, and private upload. It cannot be undone. The separate client record remains.' : confirmation?.action === 'archive' ? 'Archiving removes this record from active work, revokes any live client link, and is required before their answers and files can be permanently deleted. The draft and uploads remain retained.' : 'The client will immediately lose access to this link. Their existing draft and files remain retained.'}</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel disabled={lifecycleMutation.isPending}>Cancel</AlertDialogCancel><AlertDialogAction className={confirmation?.action === 'archive' ? undefined : 'bg-destructive text-destructive-foreground hover:bg-destructive/90'} disabled={lifecycleMutation.isPending} onClick={(event) => { event.preventDefault(); if (confirmation) lifecycleMutation.mutate(confirmation) }}>{lifecycleMutation.isPending ? 'Working…' : confirmation?.action === 'purge' ? 'Permanently purge' : confirmation?.action === 'archive' ? 'Archive' : 'Revoke link'}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </WorkspaceLayout>
  )
}

export default WorkspaceOnboarding
