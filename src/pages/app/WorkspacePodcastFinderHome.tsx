import { useSearchParams } from 'react-router-dom'
import PodcastFinder from '@/pages/admin/PodcastFinder'

const WorkspacePodcastFinderHome = () => {
  const [searchParams] = useSearchParams()
  const initialClientId = searchParams.get('client') || undefined
  return (
    <PodcastFinder
      key={initialClientId || 'workspace-default'}
      initialClientId={initialClientId}
      workspaceScoped
    />
  )
}

export default WorkspacePodcastFinderHome
