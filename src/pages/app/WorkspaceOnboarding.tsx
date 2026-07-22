import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Archive, ClipboardCheck, Clock3, Copy, ExternalLink, FilePlus2, ImagePlus, Link2, Loader2, MoreHorizontal, Palette, Plus, RefreshCw, Send, ShieldAlert, Sparkles, X } from 'lucide-react'
import { toast } from 'sonner'
import OnboardingReviewDialog from '@/components/onboarding/OnboardingReviewDialog'
import OnboardingTemplateBuilder, { type OnboardingTemplateDraft } from '@/components/onboarding/OnboardingTemplateBuilder'
import { WorkspaceLayout } from '@/components/workspace/WorkspaceLayout'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/contexts/AuthContext'
import { DEFAULT_ONBOARDING_ACCENT, onboardingWorkspaceInitials, renderOnboardingBrandText } from '@/lib/onboardingBrand'
import { workspaceLogoUrl } from '@/lib/workspaceLogo'
import {
  approveOnboarding,
  archiveOnboardingInstance,
  archiveOnboardingTemplate,
  duplicateOnboardingTemplate,
  extendOnboardingLink,
  getWorkspaceOnboardingDetail,
  listWorkspaceOnboarding,
  publishOnboardingTemplate,
  purgeOnboardingInstance,
  requestOnboardingChanges,
  retryOnboardingAi,
  revokeOnboardingLink,
  rotateOnboardingLink,
  saveOnboardingTemplate,
  setDefaultOnboardingTemplate,
  startWorkspaceOnboarding,
  updateOnboardingProfile,
  updateOnboardingAssignments,
  type OnboardingInstanceDetail,
  type OnboardingInstanceSummary,
  type OnboardingInvitationResult,
  type OnboardingTemplate,
  type PitchProfile,
  type StartOnboardingInput,
} from '@/services/workspaceOnboarding'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

interface Props {
  platformWorkspaceId?: string
}

interface StartForm {
  template_id: string
  client_choice: string
  client_name: string
  contact_person: string
  recipient_name: string
  recipient_email: string
  expires_in_days: string
  assigned_membership_ids: string[]
  send_email: boolean
  experience_title: string
  experience_body: string
  experience_completion_message: string
  accent_color: string
  logo_file: File | null
}

type ConfirmationAction = 'revoke' | 'archive' | 'purge'

const blankStartForm: StartForm = {
  template_id: '',
  client_choice: 'new',
  client_name: '',
  contact_person: '',
  recipient_name: '',
  recipient_email: '',
  expires_in_days: '14',
  assigned_membership_ids: [],
  send_email: false,
  experience_title: '',
  experience_body: '',
  experience_completion_message: '',
  accent_color: DEFAULT_ONBOARDING_ACCENT,
  logo_file: null,
}

const ACCENT_PRESETS = ['#665CF2', '#2563EB', '#0F766E', '#C2410C', '#BE185D', '#334155'] as const

function experienceFromTemplate(template: OnboardingTemplate | undefined, workspaceName: string) {
  return {
    experience_title: renderOnboardingBrandText(template?.definition.intro_title ?? 'Welcome', workspaceName),
    experience_body: renderOnboardingBrandText(
      template?.definition.intro_body ?? 'Please share a few details so we can prepare your profile.',
      workspaceName,
    ),
    experience_completion_message: renderOnboardingBrandText(
      template?.definition.completion_message ?? `Thank you. ${workspaceName || 'Our team'} will review your answers and follow up.`,
      workspaceName,
    ),
    accent_color: DEFAULT_ONBOARDING_ACCENT,
  }
}

const statusLabels: Record<OnboardingInstanceSummary['status'], string> = {
  invited: 'Invited',
  in_progress: 'In progress',
  submitted: 'Submitted',
  changes_requested: 'Changes requested',
  approved: 'Approved',
  expired: 'Expired',
  revoked: 'Revoked',
}

const statusStyles: Record<OnboardingInstanceSummary['status'], string> = {
  invited: 'bg-blue-50 text-blue-700 border-blue-200',
  in_progress: 'bg-violet-50 text-violet-700 border-violet-200',
  submitted: 'bg-amber-50 text-amber-800 border-amber-200',
  changes_requested: 'bg-orange-50 text-orange-800 border-orange-200',
  approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  expired: 'bg-slate-50 text-slate-600 border-slate-200',
  revoked: 'bg-red-50 text-red-700 border-red-200',
}

function nextCopyName(template: OnboardingTemplate, templates: OnboardingTemplate[]): string {
  const names = new Set(templates.map((candidate) => candidate.name.toLowerCase()))
  let index = 1
  while (names.has(`${template.name} copy ${index}`.toLowerCase())) index += 1
  return `${template.name} Copy ${index}`
}

const WorkspaceOnboarding = ({ platformWorkspaceId }: Props) => {
  const { user, workspace } = useAuth()
  const queryClient = useQueryClient()
  const isPlatformWorkspace = platformWorkspaceId !== undefined
  const selectedWorkspaceId = (platformWorkspaceId || '').toLowerCase()
  const workspaceId = isPlatformWorkspace ? selectedWorkspaceId : workspace?.id || ''
  const validWorkspaceId = UUID_PATTERN.test(workspaceId)
  const queryKey = [isPlatformWorkspace ? 'platform' : 'tenant', user?.id || 'unknown', 'workspace', workspaceId, 'onboarding'] as const
  const [startOpen, setStartOpen] = useState(false)
  const [startForm, setStartForm] = useState<StartForm>(blankStartForm)
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null)
  const [invitation, setInvitation] = useState<OnboardingInvitationResult | null>(null)
  const [builderOpen, setBuilderOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<OnboardingTemplate | null>(null)
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null)
  const [confirmation, setConfirmation] = useState<{ action: ConfirmationAction; instance: OnboardingInstanceSummary } | null>(null)

  const onboardingQuery = useQuery({
    queryKey,
    queryFn: () => listWorkspaceOnboarding(workspaceId),
    enabled: validWorkspaceId,
    retry: false,
    gcTime: isPlatformWorkspace ? 0 : undefined,
  })
  const data = onboardingQuery.data
  const canManage = data?.can_manage === true
  const publishedTemplates = useMemo(
    () => data?.templates.filter((template) => template.status === 'published') ?? [],
    [data?.templates],
  )

  useEffect(() => {
    if (!startOpen || !data) return
    const defaultTemplate = publishedTemplates.find((template) => template.is_default) ?? publishedTemplates[0]
    setLogoPreviewUrl(null)
    setStartForm({
      ...blankStartForm,
      template_id: defaultTemplate?.id ?? '',
      ...experienceFromTemplate(defaultTemplate, data.workspace.name),
    })
  }, [data, publishedTemplates, startOpen])

  const detailQuery = useQuery({
    queryKey: [...queryKey, 'detail', selectedInstanceId || 'none'],
    queryFn: () => getWorkspaceOnboardingDetail(workspaceId, selectedInstanceId || ''),
    enabled: Boolean(selectedInstanceId && validWorkspaceId),
    retry: false,
  })

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey })
  }

  const startMutation = useMutation({
    mutationFn: (input: StartOnboardingInput) => startWorkspaceOnboarding(workspaceId, input),
    onSuccess: async (result) => {
      await refresh()
      setStartOpen(false)
      setInvitation(result)
      toast.success(result.delivery.status === 'sent' ? 'Onboarding invitation sent.' : 'Onboarding link created.')
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Unable to start onboarding.'),
  })

  const templateMutation = useMutation({
    mutationFn: async ({ draft, publish, makeDefault }: { draft: OnboardingTemplateDraft; publish: boolean; makeDefault: boolean }) => {
      const saved = await saveOnboardingTemplate(workspaceId, draft, editingTemplate?.id)
      return publish ? publishOnboardingTemplate(workspaceId, saved.id, makeDefault) : saved
    },
    onSuccess: async () => {
      await refresh()
      setBuilderOpen(false)
      setEditingTemplate(null)
      toast.success('Onboarding template saved.')
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Unable to save the template.'),
  })

  const templateActionMutation = useMutation({
    mutationFn: async ({ action, template }: { action: 'duplicate' | 'default' | 'archive'; template: OnboardingTemplate }) => {
      if (action === 'duplicate') return duplicateOnboardingTemplate(workspaceId, template.id, nextCopyName(template, data?.templates ?? []))
      if (action === 'default') return setDefaultOnboardingTemplate(workspaceId, template.id)
      return archiveOnboardingTemplate(workspaceId, template.id)
    },
    onSuccess: async (_, variables) => {
      await refresh()
      toast.success(variables.action === 'duplicate' ? 'Template duplicated.' : variables.action === 'default' ? 'Default template updated.' : 'Template archived.')
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Unable to update the template.'),
  })

  const reviewMutation = useMutation({
    mutationFn: async (request:
      | { action: 'changes'; comments: Array<{ question_id: string; body: string }> }
      | { action: 'save_profile' | 'approve'; profile: PitchProfile }
      | { action: 'assignments'; membershipIds: string[] }
      | { action: 'retry_ai' }
    ) => {
      if (!selectedInstanceId) throw new Error('No onboarding is selected.')
      if (request.action === 'changes') return requestOnboardingChanges(workspaceId, selectedInstanceId, request.comments)
      if (request.action === 'save_profile') return updateOnboardingProfile(workspaceId, selectedInstanceId, request.profile)
      if (request.action === 'approve') return approveOnboarding(workspaceId, selectedInstanceId, request.profile)
      if (request.action === 'assignments') return updateOnboardingAssignments(workspaceId, selectedInstanceId, request.membershipIds)
      return retryOnboardingAi(workspaceId, selectedInstanceId)
    },
    onSuccess: async (result, variables) => {
      await refresh()
      await detailQuery.refetch()
      if (variables.action === 'approve' || variables.action === 'changes') setSelectedInstanceId(null)
      if (variables.action === 'changes' && result.onboarding_url && result.instance) {
        setInvitation({
          instance: result.instance,
          onboarding_url: result.onboarding_url,
          delivery: result.delivery ?? { status: 'skipped' },
        })
      }
      toast.success(variables.action === 'changes'
        ? result.delivery?.status === 'sent' ? 'Changes requested and client notified.' : 'Changes requested; secure link is ready to share.'
        : variables.action === 'approve' ? 'Client profile finalized.' : variables.action === 'retry_ai' ? 'Pitch profile generated.' : variables.action === 'assignments' ? 'Team assignments updated.' : 'Pitch profile draft saved.')
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Unable to update onboarding.'),
  })

  const linkMutation = useMutation({
    mutationFn: async ({ action, instance }: { action: 'rotate' | 'extend'; instance: OnboardingInstanceSummary }) => action === 'rotate'
      ? rotateOnboardingLink(workspaceId, instance.id, 14, true)
      : extendOnboardingLink(workspaceId, instance.id, 14),
    onSuccess: async (result, variables) => {
      await refresh()
      if (result.onboarding_url) {
        setInvitation({
          instance: result.instance as OnboardingInstanceDetail,
          onboarding_url: result.onboarding_url,
          delivery: result.delivery ?? { status: 'skipped' },
        })
      }
      toast.success(variables.action === 'rotate' ? 'Secure link rotated.' : 'Link extended by 14 days.')
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Unable to update the secure link.'),
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
      toast.success(variables.action === 'revoke' ? 'Secure link revoked.' : variables.action === 'archive' ? 'Onboarding archived.' : 'Onboarding PII permanently purged; the client record was retained.')
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Unable to update onboarding.'),
  })

  const counts = useMemo(() => {
    const instances = data?.instances ?? []
    return {
      active: instances.filter((instance) => ['invited', 'in_progress', 'changes_requested'].includes(instance.status)).length,
      review: instances.filter((instance) => instance.status === 'submitted').length,
      approved: instances.filter((instance) => instance.status === 'approved').length,
      expired: instances.filter((instance) => instance.status === 'expired').length,
    }
  }, [data?.instances])

  const handleClientChoice = (choice: string) => {
    if (choice === 'new') {
      setLogoPreviewUrl(null)
      setStartForm((current) => ({
        ...current,
        client_choice: 'new',
        client_name: '',
        contact_person: '',
        recipient_name: '',
        recipient_email: '',
        logo_file: null,
      }))
      return
    }
    const client = data?.clients.find((candidate) => candidate.id === choice)
    if (!client) return
    setLogoPreviewUrl(null)
    setStartForm((current) => ({
      ...current,
      client_choice: choice,
      client_name: client.name,
      contact_person: client.contact_person || '',
      recipient_name: client.contact_person || client.name,
      recipient_email: client.email || '',
      logo_file: null,
    }))
  }

  const handleTemplateChoice = (templateId: string) => {
    const template = publishedTemplates.find((candidate) => candidate.id === templateId)
    setStartForm((current) => ({
      ...current,
      template_id: templateId,
      ...experienceFromTemplate(template, data?.workspace.name ?? ''),
    }))
  }

  const handleLogoChoice = (file: File | undefined) => {
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size < 1 || file.size > 2_097_152) {
      toast.error('Choose a PNG, JPEG, or WebP logo up to 2 MB.')
      return
    }
    const reader = new FileReader()
    reader.onerror = () => toast.error('The logo preview could not be opened.')
    reader.onload = () => {
      if (typeof reader.result !== 'string') return
      setLogoPreviewUrl(reader.result)
      setStartForm((current) => ({ ...current, logo_file: file }))
    }
    reader.readAsDataURL(file)
  }

  const submitStart = () => {
    const expiry = Number(startForm.expires_in_days)
    if (!startForm.template_id || !startForm.recipient_name.trim() || !startForm.recipient_email.trim()) {
      toast.error('Choose a template and enter the invited contact name and email.')
      return
    }
    if (!Number.isSafeInteger(expiry) || expiry < 1 || expiry > 90) {
      toast.error('Link expiry must be between 1 and 90 days.')
      return
    }
    if (startForm.client_choice === 'new' && !startForm.client_name.trim()) {
      toast.error('Enter the new client name.')
      return
    }
    if (
      !startForm.experience_title.trim()
      || !startForm.experience_body.trim()
      || !startForm.experience_completion_message.trim()
    ) {
      toast.error('Complete the client-facing welcome and completion messages.')
      return
    }
    startMutation.mutate({
      template_id: startForm.template_id,
      client_id: startForm.client_choice === 'new' ? null : startForm.client_choice,
      new_client: startForm.client_choice === 'new'
        ? { name: startForm.client_name, email: startForm.recipient_email, contact_person: startForm.contact_person }
        : null,
      recipient_name: startForm.recipient_name,
      recipient_email: startForm.recipient_email,
      expires_in_days: expiry,
      assigned_membership_ids: startForm.assigned_membership_ids,
      send_email: startForm.send_email,
      experience: {
        intro_title: startForm.experience_title,
        intro_body: startForm.experience_body,
        completion_message: startForm.experience_completion_message,
        accent_color: startForm.accent_color,
        logo_file: startForm.logo_file,
      },
    })
  }

  const copyLink = async (link: string) => {
    try {
      await navigator.clipboard.writeText(link)
      toast.success('Secure onboarding link copied.')
    } catch {
      toast.error('Copy failed. Select and copy the link manually.')
    }
  }

  if (!isPlatformWorkspace && !workspace) {
    return <WorkspaceLayout><Card><CardHeader><CardTitle>Workspace unavailable</CardTitle><CardDescription>Your account does not have an active workspace.</CardDescription></CardHeader></Card></WorkspaceLayout>
  }

  const effectiveWorkspace = data?.workspace
  const agencyLogoUrl = workspaceLogoUrl(
    effectiveWorkspace?.id,
    effectiveWorkspace?.logo_path,
    effectiveWorkspace?.logo_updated_at,
  )
  const platformWorkspace = isPlatformWorkspace
    ? {
        workspaceName: effectiveWorkspace?.name || 'Client workspace',
        logoUrl: workspaceLogoUrl(effectiveWorkspace?.id, effectiveWorkspace?.logo_path, effectiveWorkspace?.logo_updated_at),
        baseHref: `/admin/workspaces/${selectedWorkspaceId}`,
        exitHref: '/admin/users',
      }
    : undefined

  return (
    <WorkspaceLayout platformWorkspace={platformWorkspace}>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div><h1 className="text-3xl font-bold tracking-tight">Client Onboarding</h1><p className="mt-1 text-muted-foreground">Create branded intake forms, invite clients, review answers, and finalize podcast pitch profiles.</p></div>
          {canManage && <Button disabled={publishedTemplates.length === 0} onClick={() => setStartOpen(true)}><Send className="mr-2 h-4 w-4" />Start onboarding</Button>}
        </div>

        {!validWorkspaceId ? (
          <Card><CardHeader><CardTitle>Workspace address invalid</CardTitle><CardDescription>The selected workspace could not be identified.</CardDescription></CardHeader></Card>
        ) : onboardingQuery.isLoading ? (
          <div className="flex min-h-72 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : onboardingQuery.error ? (
          <Card><CardHeader><CardTitle>Onboarding unavailable</CardTitle><CardDescription>{onboardingQuery.error instanceof Error ? onboardingQuery.error.message : 'Try again.'}</CardDescription></CardHeader><CardContent><Button variant="outline" onClick={() => void onboardingQuery.refetch()}><RefreshCw className="mr-2 h-4 w-4" />Try again</Button></CardContent></Card>
        ) : data ? (
          <>
            {!canManage && <Alert><ShieldAlert className="h-4 w-4" /><AlertTitle>Assigned onboarding access</AlertTitle><AlertDescription>You can review only the onboarding records assigned to you. Owners and admins manage templates, invitations, review decisions, and client profiles.</AlertDescription></Alert>}

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Card><CardHeader className="pb-2"><CardDescription>Active intake</CardDescription><CardTitle className="text-3xl">{counts.active}</CardTitle></CardHeader><CardContent><Clock3 className="h-5 w-5 text-violet-500" /></CardContent></Card>
              <Card><CardHeader className="pb-2"><CardDescription>Awaiting review</CardDescription><CardTitle className="text-3xl">{counts.review}</CardTitle></CardHeader><CardContent><ClipboardCheck className="h-5 w-5 text-amber-500" /></CardContent></Card>
              <Card><CardHeader className="pb-2"><CardDescription>Approved</CardDescription><CardTitle className="text-3xl">{counts.approved}</CardTitle></CardHeader><CardContent><Sparkles className="h-5 w-5 text-emerald-500" /></CardContent></Card>
              <Card><CardHeader className="pb-2"><CardDescription>Expired</CardDescription><CardTitle className="text-3xl">{counts.expired}</CardTitle></CardHeader><CardContent><Link2 className="h-5 w-5 text-slate-500" /></CardContent></Card>
            </div>

            <Tabs defaultValue="instances" className="space-y-4">
              <TabsList><TabsTrigger value="instances">Client onboarding</TabsTrigger>{canManage && <TabsTrigger value="templates">Form templates</TabsTrigger>}</TabsList>
              <TabsContent value="instances">
                <Card>
                  <CardHeader><CardTitle>Onboarding activity</CardTitle><CardDescription>Each invitation stays pinned to the exact form version the client received.</CardDescription></CardHeader>
                  <CardContent>
                    {data.instances.length === 0 ? (
                      <div className="flex min-h-52 flex-col items-center justify-center gap-3 text-center"><FilePlus2 className="h-10 w-10 text-muted-foreground" /><div><p className="font-medium">No onboarding invitations yet</p><p className="text-sm text-muted-foreground">Start with an existing client or create a minimal client while inviting them.</p></div>{canManage && <Button variant="outline" onClick={() => setStartOpen(true)}><Plus className="mr-2 h-4 w-4" />Start onboarding</Button>}</div>
                    ) : (
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader><TableRow><TableHead>Client</TableHead><TableHead>Template</TableHead><TableHead>Status</TableHead><TableHead>Updated</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
                          <TableBody>{data.instances.map((instance) => (
                            <TableRow key={instance.id} className={instance.archived_at ? 'opacity-60' : undefined}>
                              <TableCell><p className="font-medium">{instance.client_name}</p><p className="text-xs text-muted-foreground">{instance.recipient_email}</p>{instance.archived_at && <Badge variant="outline" className="mt-1">Archived</Badge>}</TableCell>
                              <TableCell><p>{instance.template_name}</p><p className="text-xs text-muted-foreground">Version {instance.template_version}</p></TableCell>
                              <TableCell><Badge variant="outline" className={statusStyles[instance.status]}>{statusLabels[instance.status]}</Badge>{instance.open_comment_count > 0 && <p className="mt-1 text-xs text-muted-foreground">{instance.open_comment_count} open notes</p>}</TableCell>
                              <TableCell className="text-sm text-muted-foreground">{new Date(instance.updated_at).toLocaleDateString()}</TableCell>
                              <TableCell className="text-right"><div className="inline-flex items-center gap-1"><Button size="sm" variant="outline" onClick={() => setSelectedInstanceId(instance.id)}>View</Button>{canManage && <DropdownMenu><DropdownMenuTrigger asChild><Button size="icon" variant="ghost" aria-label={`More actions for ${instance.client_name}`}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end">
                                {!['approved', 'revoked', 'submitted'].includes(instance.status) && <DropdownMenuItem onClick={() => linkMutation.mutate({ action: 'rotate', instance })}>Rotate link & email</DropdownMenuItem>}
                                {!['submitted', 'approved', 'revoked'].includes(instance.status) && <DropdownMenuItem onClick={() => linkMutation.mutate({ action: 'extend', instance })}>Extend 14 days</DropdownMenuItem>}
                                {!['approved', 'revoked'].includes(instance.status) && <DropdownMenuItem className="text-destructive" onClick={() => setConfirmation({ action: 'revoke', instance })}>Revoke link</DropdownMenuItem>}
                                <DropdownMenuSeparator />
                                {!instance.archived_at && <DropdownMenuItem onClick={() => setConfirmation({ action: 'archive', instance })}><Archive className="mr-2 h-4 w-4" />Archive</DropdownMenuItem>}
                                {instance.archived_at && <DropdownMenuItem className="text-destructive" onClick={() => setConfirmation({ action: 'purge', instance })}>Permanently purge onboarding PII</DropdownMenuItem>}
                              </DropdownMenuContent></DropdownMenu>}</div></TableCell>
                            </TableRow>
                          ))}</TableBody>
                        </Table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {canManage && <TabsContent value="templates">
                <div className="mb-4 flex items-center justify-between gap-3"><div><h2 className="text-xl font-semibold">Reusable form templates</h2><p className="text-sm text-muted-foreground">Edit drafts freely; every publish creates a new immutable version.</p></div><Button variant="outline" onClick={() => { setEditingTemplate(null); setBuilderOpen(true) }}><Plus className="mr-2 h-4 w-4" />New template</Button></div>
                <div className="grid gap-4 lg:grid-cols-2">{data.templates.map((template) => (
                  <Card key={template.id} className={template.status === 'archived' ? 'opacity-60' : undefined}>
                    <CardHeader><div className="flex items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><CardTitle>{template.name}</CardTitle>{template.is_default && <Badge>Default</Badge>}<Badge variant="outline" className="capitalize">{template.status}</Badge></div><CardDescription className="mt-2">{template.description || 'No internal description'}</CardDescription></div></div></CardHeader>
                    <CardContent><div className="mb-4 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground"><span>{template.definition.sections.length} sections</span><span>{template.definition.sections.reduce((total, section) => total + section.questions.length, 0)} questions</span><span>Version {template.published_version || 'draft'}</span></div>{template.status !== 'archived' && <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => { setEditingTemplate(template); setBuilderOpen(true) }}>Edit builder</Button><Button size="sm" variant="outline" onClick={() => templateActionMutation.mutate({ action: 'duplicate', template })}><Copy className="mr-2 h-4 w-4" />Duplicate</Button>{template.status === 'published' && !template.is_default && <Button size="sm" variant="outline" onClick={() => templateActionMutation.mutate({ action: 'default', template })}>Make default</Button>}<Button size="sm" variant="ghost" className="text-destructive" onClick={() => templateActionMutation.mutate({ action: 'archive', template })}>Archive</Button></div>}</CardContent>
                  </Card>
                ))}</div>
              </TabsContent>}
            </Tabs>

          </>
        ) : null}
      </div>

      <Dialog open={startOpen} onOpenChange={setStartOpen}>
        <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto p-0">
          <DialogHeader className="border-b px-6 pb-5 pt-6">
            <DialogTitle>Start client onboarding</DialogTitle>
            <DialogDescription>Choose the client and personalize the exact branded experience they will receive.</DialogDescription>
          </DialogHeader>

          <div className="grid gap-6 px-6 py-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(300px,.8fr)]">
            <div className="space-y-6">
              <section className="space-y-4">
                <div><h3 className="font-semibold">Invitation details</h3><p className="text-sm text-muted-foreground">The form questions stay pinned to this published template version.</p></div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2 sm:col-span-2"><Label>Template</Label><Select value={startForm.template_id} onValueChange={handleTemplateChoice}><SelectTrigger><SelectValue placeholder="Choose a published template" /></SelectTrigger><SelectContent>{publishedTemplates.map((template) => <SelectItem key={template.id} value={template.id}>{template.name} · v{template.published_version}{template.is_default ? ' · Default' : ''}</SelectItem>)}</SelectContent></Select></div>
                  <div className="space-y-2 sm:col-span-2"><Label>Client</Label><Select value={startForm.client_choice} onValueChange={handleClientChoice}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="new">Create a new client</SelectItem>{data?.clients.map((client) => <SelectItem key={client.id} value={client.id}>{client.name}{client.email ? ` · ${client.email}` : ''}</SelectItem>)}</SelectContent></Select></div>
                  {startForm.client_choice === 'new' && <><div className="space-y-2"><Label htmlFor="new-client-name">Client name</Label><Input id="new-client-name" value={startForm.client_name} onChange={(event) => setStartForm((current) => ({ ...current, client_name: event.target.value }))} /></div><div className="space-y-2"><Label htmlFor="new-contact">Contact person</Label><Input id="new-contact" value={startForm.contact_person} onChange={(event) => setStartForm((current) => ({ ...current, contact_person: event.target.value, recipient_name: event.target.value }))} /></div></>}
                  <div className="space-y-2"><Label htmlFor="recipient-name">Invited contact name</Label><Input id="recipient-name" value={startForm.recipient_name} onChange={(event) => setStartForm((current) => ({ ...current, recipient_name: event.target.value }))} /></div>
                  <div className="space-y-2"><Label htmlFor="recipient-email">Invited contact email</Label><Input id="recipient-email" type="email" value={startForm.recipient_email} onChange={(event) => setStartForm((current) => ({ ...current, recipient_email: event.target.value }))} /></div>
                </div>
              </section>

              <section className="space-y-4 rounded-2xl border bg-muted/20 p-4 sm:p-5">
                <div className="flex items-start gap-3"><div className="rounded-xl bg-primary/10 p-2 text-primary"><Palette className="h-5 w-5" /></div><div><h3 className="font-semibold">Customize this client’s experience</h3><p className="text-sm text-muted-foreground">These choices apply only to this secure link. The client sees your branding, never the platform brand.</p></div></div>
                <div className="space-y-2"><Label htmlFor="experience-title">Welcome title</Label><Input id="experience-title" maxLength={300} value={startForm.experience_title} onChange={(event) => setStartForm((current) => ({ ...current, experience_title: event.target.value }))} /></div>
                <div className="space-y-2"><Label htmlFor="experience-body">Welcome message</Label><Textarea id="experience-body" rows={4} maxLength={3000} value={startForm.experience_body} onChange={(event) => setStartForm((current) => ({ ...current, experience_body: event.target.value }))} /></div>
                <div className="space-y-2"><Label htmlFor="experience-completion">Completion message</Label><Textarea id="experience-completion" rows={3} maxLength={2000} value={startForm.experience_completion_message} onChange={(event) => setStartForm((current) => ({ ...current, experience_completion_message: event.target.value }))} /></div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2"><Label>Accent color</Label><div className="flex flex-wrap items-center gap-2">{ACCENT_PRESETS.map((color) => <button key={color} type="button" aria-label={`Use accent ${color}`} aria-pressed={startForm.accent_color === color} className="h-8 w-8 rounded-full border-2 border-background shadow ring-offset-2 transition focus-visible:outline-none focus-visible:ring-2" style={{ backgroundColor: color, boxShadow: startForm.accent_color === color ? `0 0 0 2px ${color}` : undefined }} onClick={() => setStartForm((current) => ({ ...current, accent_color: color }))} />)}<Input aria-label="Custom accent color" type="color" value={startForm.accent_color} className="h-9 w-12 cursor-pointer p-1" onChange={(event) => setStartForm((current) => ({ ...current, accent_color: event.target.value.toUpperCase() }))} /></div></div>
                  <div className="space-y-2"><Label htmlFor="client-onboarding-logo">Client logo override</Label><div className="flex flex-wrap items-center gap-2"><Button type="button" variant="outline" size="sm" asChild><label htmlFor="client-onboarding-logo" className="cursor-pointer"><ImagePlus className="mr-2 h-4 w-4" />{startForm.logo_file ? 'Replace logo' : 'Upload logo'}</label></Button>{startForm.logo_file && <Button type="button" variant="ghost" size="sm" onClick={() => { setLogoPreviewUrl(null); setStartForm((current) => ({ ...current, logo_file: null })) }}><X className="mr-1 h-4 w-4" />Use agency logo</Button>}</div><Input id="client-onboarding-logo" type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(event) => { handleLogoChoice(event.target.files?.[0]); event.currentTarget.value = '' }} /><p className="text-xs text-muted-foreground">PNG, JPEG, or WebP up to 2 MB. Leave empty to use {data?.workspace.name}’s logo.</p></div>
                </div>
              </section>

              <section className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2"><Label htmlFor="expiry-days">Link expires in days</Label><Input id="expiry-days" type="number" min={1} max={90} value={startForm.expires_in_days} onChange={(event) => setStartForm((current) => ({ ...current, expires_in_days: event.target.value }))} /></div>
                <div className="rounded-xl border p-3"><label className="flex items-start gap-3"><Checkbox id="send-email" checked={startForm.send_email} onCheckedChange={(checked) => setStartForm((current) => ({ ...current, send_email: checked === true }))} /><span><span className="block text-sm font-medium">Send branded invitation email</span><span className="mt-1 block text-xs text-muted-foreground">Optional. No automated reminder or follow-up emails are sent.</span></span></label></div>
                {data?.assignable_members.length ? <div className="space-y-2 sm:col-span-2"><Label>Assign read-only team members</Label><div className="grid gap-2 rounded-xl border p-3 sm:grid-cols-2">{data.assignable_members.map((member) => <label key={member.id} className="flex items-center gap-2 text-sm"><Checkbox checked={startForm.assigned_membership_ids.includes(member.id)} onCheckedChange={(checked) => setStartForm((current) => ({ ...current, assigned_membership_ids: checked === true ? [...current.assigned_membership_ids, member.id] : current.assigned_membership_ids.filter((id) => id !== member.id) }))} /><span>{member.full_name || member.email}</span></label>)}</div></div> : null}
              </section>
            </div>

            <aside className="lg:sticky lg:top-0 lg:self-start">
              <p className="mb-2 text-xs font-semibold uppercase tracking-[.16em] text-muted-foreground">Client preview</p>
              <div className="overflow-hidden rounded-3xl border bg-white shadow-xl shadow-slate-900/10">
                <div className="p-5 text-white" style={{ background: `linear-gradient(135deg, #171827 0%, ${startForm.accent_color} 100%)` }}>
                  <div className="flex items-center gap-3">{logoPreviewUrl || agencyLogoUrl ? <div className="flex h-14 w-20 shrink-0 items-center justify-center rounded-xl bg-white p-2"><img src={logoPreviewUrl || agencyLogoUrl || ''} alt="Onboarding logo preview" className="max-h-full max-w-full object-contain" /></div> : <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/15 font-bold ring-1 ring-white/20">{onboardingWorkspaceInitials(data?.workspace.name ?? '')}</div>}<div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-[.18em] text-white/70">Client onboarding</p><p className="truncate font-semibold">{data?.workspace.name || 'Your team'}</p></div></div>
                </div>
                <div className="space-y-4 p-5"><Badge variant="outline" style={{ borderColor: `${startForm.accent_color}55`, color: startForm.accent_color, backgroundColor: `${startForm.accent_color}0D` }}>Private intake</Badge><div><p className="text-sm text-slate-500">Hi {startForm.recipient_name.trim() || 'there'},</p><h4 className="mt-1 text-xl font-bold leading-tight text-slate-950">{startForm.experience_title || 'Your welcome title'}</h4><p className="mt-2 text-sm leading-6 text-slate-600">{startForm.experience_body || 'Your welcome message will appear here.'}</p></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full w-1/6 rounded-full" style={{ backgroundColor: startForm.accent_color }} /></div><div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-500">The client continues through the template one clear section at a time, with secure autosave.</div></div>
              </div>
            </aside>
          </div>

          <DialogFooter className="border-t bg-background px-6 py-4"><Button variant="outline" onClick={() => setStartOpen(false)}>Cancel</Button><Button disabled={startMutation.isPending} onClick={submitStart}>{startMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Create secure link</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(invitation)} onOpenChange={(open) => { if (!open) setInvitation(null) }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Secure onboarding link ready</DialogTitle><DialogDescription>{invitation?.delivery.status === 'sent' ? 'The branded email was sent. Keep the link available in case the client needs it directly.' : invitation?.delivery.status === 'failed' ? 'Email delivery failed, but the invitation is active. Copy and send the link securely.' : 'Email was skipped. Copy and send the link securely.'}</DialogDescription></DialogHeader>
          {invitation && <div className="space-y-3"><Label htmlFor="onboarding-link">Private link</Label><div className="flex gap-2"><Input id="onboarding-link" readOnly value={invitation.onboarding_url} onFocus={(event) => event.currentTarget.select()} /><Button size="icon" aria-label="Copy secure onboarding link" onClick={() => void copyLink(invitation.onboarding_url)}><Copy className="h-4 w-4" /></Button></div><p className="text-xs text-muted-foreground">Anyone with this link can act as the invited contact until it expires or is revoked. Do not post it publicly.</p><Button variant="outline" asChild><a href={invitation.onboarding_url} target="_blank" rel="noreferrer"><ExternalLink className="mr-2 h-4 w-4" />Open client form</a></Button></div>}
          <DialogFooter><Button onClick={() => setInvitation(null)}>Done</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <OnboardingTemplateBuilder open={builderOpen} template={editingTemplate} workspaceName={data?.workspace.name ?? ''} saving={templateMutation.isPending} onOpenChange={(open) => { setBuilderOpen(open); if (!open) setEditingTemplate(null) }} onSave={(draft, publish, makeDefault) => templateMutation.mutate({ draft, publish, makeDefault })} />

      <OnboardingReviewDialog
        open={Boolean(selectedInstanceId)}
        detail={detailQuery.data ?? null}
        canManage={canManage}
        busy={reviewMutation.isPending || detailQuery.isFetching}
        assignableMembers={data?.assignable_members ?? []}
        onOpenChange={(open) => { if (!open) setSelectedInstanceId(null) }}
        onRequestChanges={(comments) => reviewMutation.mutate({ action: 'changes', comments })}
        onSaveProfile={(profile) => reviewMutation.mutate({ action: 'save_profile', profile })}
        onApprove={(profile) => reviewMutation.mutate({ action: 'approve', profile })}
        onRetryAi={() => reviewMutation.mutate({ action: 'retry_ai' })}
        onSaveAssignments={(membershipIds) => reviewMutation.mutate({ action: 'assignments', membershipIds })}
      />

      {selectedInstanceId && detailQuery.isLoading && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/20"><div className="rounded-xl bg-background p-6 shadow-xl"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div></div>}

      <AlertDialog open={Boolean(confirmation)} onOpenChange={(open) => { if (!open) setConfirmation(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>{confirmation?.action === 'purge' ? 'Permanently purge onboarding PII?' : confirmation?.action === 'archive' ? 'Archive this onboarding?' : 'Revoke this secure link?'}</AlertDialogTitle><AlertDialogDescription>{confirmation?.action === 'purge' ? 'This permanently deletes every onboarding draft, immutable answer revision, review note, AI draft, notification record, and private upload. It cannot be undone. The separate client record remains.' : confirmation?.action === 'archive' ? 'Archiving removes this record from active work, revokes any live client link, and is required before permanent PII purge. The draft and uploads remain retained.' : 'The client will immediately lose access to this link. Their existing draft and files remain retained.'}</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction className={confirmation?.action === 'archive' ? undefined : 'bg-destructive text-destructive-foreground hover:bg-destructive/90'} disabled={lifecycleMutation.isPending} onClick={(event) => { event.preventDefault(); if (confirmation) lifecycleMutation.mutate(confirmation) }}>{lifecycleMutation.isPending ? 'Working…' : confirmation?.action === 'purge' ? 'Permanently purge' : confirmation?.action === 'archive' ? 'Archive' : 'Revoke link'}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </WorkspaceLayout>
  )
}

export default WorkspaceOnboarding
