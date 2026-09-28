import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Loader2, Radio } from 'lucide-react'
import { toast } from 'sonner'
import { WorkspaceLayout, type PlatformWorkspaceConfig } from '@/components/workspace/WorkspaceLayout'
import { ClientCampaignPrep } from '@/components/workspace/ClientCampaignPrepDialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuth } from '@/contexts/AuthContext'
import { workspaceLogoUrl } from '@/lib/workspaceLogo'
import { MY_WORKSPACE_BASE_HREF, clientShortlistHref, selectedWorkspaceBaseHref } from '@/lib/workspaceRoutes'
import { getWorkspaceClientDetail } from '@/services/clients'
import { getClientShortlist, updateClientShortlistPodcast, type ClientShortlistPodcast } from '@/services/clientShortlist'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

interface WorkspaceClientPitchProps {
  platformWorkspaceId?: string
}

/**
 * The pitch flow for one shortlisted podcast, as a page.
 *
 * It used to be a modal over the client's Shortlist tab, which meant it could
 * not be linked to, left and returned to, or used on a tablet. The page loads
 * what the modal was handed by its parent: the shortlist row, the client, and
 * the workspace context, and then renders the same flow.
 */
const WorkspaceClientPitch = ({ platformWorkspaceId }: WorkspaceClientPitchProps) => {
  const { clientId = '', podcastId = '' } = useParams<{ clientId: string; podcastId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user, workspace } = useAuth()
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [archiving, setArchiving] = useState(false)
  const isPlatformWorkspace = platformWorkspaceId !== undefined
  const workspaceId = (isPlatformWorkspace ? platformWorkspaceId : workspace?.id || '').toLowerCase()
  const canonicalClientId = clientId.toLowerCase()
  const requestedPodcastId = podcastId.trim()
  const validAddress = UUID_PATTERN.test(workspaceId)
    && UUID_PATTERN.test(canonicalClientId)
    && requestedPodcastId.length > 0
  const baseHref = isPlatformWorkspace
    ? selectedWorkspaceBaseHref(workspaceId)
    : MY_WORKSPACE_BASE_HREF
  const shortlistHref = clientShortlistHref(baseHref, canonicalClientId)

  // Same key as the client page, so arriving from it costs no second read.
  const detailQuery = useQuery({
    queryKey: [isPlatformWorkspace ? 'platform' : 'tenant', user?.id || 'unknown', 'workspace', workspaceId, 'client', canonicalClientId],
    queryFn: () => getWorkspaceClientDetail(workspaceId, canonicalClientId),
    enabled: validAddress,
    retry: false,
    gcTime: isPlatformWorkspace ? 0 : undefined,
  })

  const shortlistQueryKey = ['client-shortlist', workspaceId, canonicalClientId] as const
  const findPodcast = (podcasts: ClientShortlistPodcast[] | undefined) => (
    podcasts?.find((item) => (
      item.id.toLowerCase() === requestedPodcastId.toLowerCase() || item.podcast_id === requestedPodcastId
    )) ?? null
  )
  // Same key the flow invalidates after every research stage, and polled
  // while a run is going, so the row under the flow moves as the run does.
  const shortlistQuery = useQuery({
    queryKey: shortlistQueryKey,
    queryFn: () => getClientShortlist(workspaceId, canonicalClientId),
    enabled: validAddress,
    retry: false,
    refetchInterval: (query) => {
      const status = findPodcast(query.state.data?.podcasts)?.research_progress?.status
      return status === 'queued' || status === 'running' ? 2_000 : false
    },
  })

  const detail = detailQuery.data
  const client = detail?.client
  const podcast = useMemo(() => {
    return findPodcast(shortlistQuery.data?.podcasts)
    // The finder reads the route only, and the route is part of what renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shortlistQuery.data?.podcasts, requestedPodcastId])

  const effectiveWorkspace = detail?.workspace
  const platformWorkspace: PlatformWorkspaceConfig | undefined = isPlatformWorkspace
    ? {
        workspaceId,
        workspaceName: effectiveWorkspace?.name || 'Client workspace',
        logoUrl: workspaceLogoUrl(
          effectiveWorkspace?.id,
          effectiveWorkspace?.logo_path,
          effectiveWorkspace?.logo_updated_at,
        ),
        baseHref,
      }
    : undefined

  const confirmArchive = async () => {
    if (!podcast || archiving) return
    setArchiving(true)
    try {
      await updateClientShortlistPodcast(workspaceId, canonicalClientId, podcast.podcast_id, { visibility: 'archived' })
      await queryClient.invalidateQueries({ queryKey: shortlistQueryKey })
      toast.success(`${podcast.podcast_name} archived. Its history will still be used for dedupe.`)
      setArchiveOpen(false)
      navigate(shortlistHref)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The podcast could not be archived.')
    } finally {
      setArchiving(false)
    }
  }

  if (!isPlatformWorkspace && !workspace) {
    return <WorkspaceLayout><Card><CardHeader><CardTitle>Workspace unavailable</CardTitle><CardDescription>Your account does not have an active workspace.</CardDescription></CardHeader></Card></WorkspaceLayout>
  }

  if (!validAddress) {
    return (
      <WorkspaceLayout platformWorkspace={platformWorkspace}>
        <Card><CardHeader><CardTitle>Pitch unavailable</CardTitle><CardDescription>The pitch address is invalid.</CardDescription></CardHeader><CardContent><Button asChild variant="outline"><Link to={`${baseHref}/clients`}>Back to clients</Link></Button></CardContent></Card>
      </WorkspaceLayout>
    )
  }

  if (detailQuery.isLoading || shortlistQuery.isLoading) {
    return (
      <WorkspaceLayout platformWorkspace={platformWorkspace}>
        <div className="flex min-h-72 flex-col items-center justify-center gap-3" role="status" aria-label="Loading the pitch workspace">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading the pitch workspace…</p>
        </div>
      </WorkspaceLayout>
    )
  }

  if (detailQuery.error || !detail || !client) {
    return (
      <WorkspaceLayout platformWorkspace={platformWorkspace}>
        <Card><CardHeader><CardTitle>Client unavailable</CardTitle><CardDescription>{detailQuery.error instanceof Error ? detailQuery.error.message : 'This client could not be loaded.'}</CardDescription></CardHeader><CardContent className="flex gap-2"><Button asChild variant="outline"><Link to={`${baseHref}/clients`}>Back to clients</Link></Button><Button variant="outline" onClick={() => void detailQuery.refetch()}>Try again</Button></CardContent></Card>
      </WorkspaceLayout>
    )
  }

  if (shortlistQuery.error) {
    return (
      <WorkspaceLayout platformWorkspace={platformWorkspace}>
        <Card className="border-destructive/30"><CardHeader><CardTitle>Shortlist unavailable</CardTitle><CardDescription>{shortlistQuery.error instanceof Error ? shortlistQuery.error.message : 'The shortlist could not be loaded.'}</CardDescription></CardHeader><CardContent className="flex gap-2"><Button asChild variant="outline"><Link to={shortlistHref}><ArrowLeft className="mr-2 h-4 w-4" />Back to shortlist</Link></Button><Button variant="outline" onClick={() => void shortlistQuery.refetch()}>Try again</Button></CardContent></Card>
      </WorkspaceLayout>
    )
  }

  if (!podcast) {
    return (
      <WorkspaceLayout platformWorkspace={platformWorkspace}>
        <Card>
          <CardHeader>
            <Radio className="h-8 w-8 text-muted-foreground/60" />
            <CardTitle className="mt-2">Podcast not found</CardTitle>
            <CardDescription>This podcast is not on {client.name}’s shortlist. It may have been removed, or the link may be from another client.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline"><Link to={shortlistHref}><ArrowLeft className="mr-2 h-4 w-4" />Back to shortlist</Link></Button>
          </CardContent>
        </Card>
      </WorkspaceLayout>
    )
  }

  return (
    <WorkspaceLayout platformWorkspace={platformWorkspace}>
      <div className="mx-auto max-w-6xl space-y-4">
        <Button asChild variant="ghost" size="sm" className="-ml-2 text-muted-foreground">
          <Link to={shortlistHref}><ArrowLeft className="mr-2 h-4 w-4" />{client.name}’s shortlist</Link>
        </Button>
        <ClientCampaignPrep
          layout="page"
          workspaceId={workspaceId}
          clientId={canonicalClientId}
          clientName={client.name}
          clientBio={client.bio}
          viewerRole={detail.viewer_role}
          campaignHref={`${baseHref}/client-campaigns/${encodeURIComponent(canonicalClientId)}`}
          // The CRM is workspace-scoped, so it follows baseHref. Billing is
          // not: a platform admin acts on a tenant's credit from the platform
          // screen, the same split the client page makes.
          relationshipsHref={`${baseHref}/relationships`}
          billingHref={isPlatformWorkspace ? '/app/platform/billing' : '/app/settings/billing'}
          shortlistHref={shortlistHref}
          podcast={podcast}
          byoAi={detail.ai_keys?.anthropic === true}
          onArchive={() => setArchiveOpen(true)}
        />
      </div>

      <AlertDialog open={archiveOpen} onOpenChange={(open) => !archiving && setArchiveOpen(open)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Archive this podcast?</AlertDialogTitle><AlertDialogDescription>{podcast.podcast_name} will disappear from the client dashboard, but its decisions and campaign history remain available for dedupe. You can restore it later from the shortlist.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={archiving}>Keep podcast</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={archiving}
              onClick={(event) => { event.preventDefault(); void confirmArchive() }}
            >
              {archiving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Archive podcast
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </WorkspaceLayout>
  )
}

export default WorkspaceClientPitch
