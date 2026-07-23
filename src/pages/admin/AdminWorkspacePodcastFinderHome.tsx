import { useParams, useSearchParams } from 'react-router-dom'
import PodcastFinder from '@/pages/admin/PodcastFinder'

const AdminWorkspacePodcastFinderHome = () => {
  const { workspaceId = '' } = useParams()
  const [searchParams] = useSearchParams()
  const initialClientId = searchParams.get('client') || undefined
  return (
    <PodcastFinder
      key={`${workspaceId || 'missing'}:${initialClientId || 'workspace-default'}`}
      initialClientId={initialClientId}
      platformWorkspaceId={workspaceId}
      workspaceScoped
    />
  )
}

export default AdminWorkspacePodcastFinderHome
