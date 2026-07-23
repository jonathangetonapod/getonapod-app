import { useParams } from 'react-router-dom'
import PodcastFinder from '@/pages/admin/PodcastFinder'

const AdminWorkspacePodcastFinder = () => {
  const { workspaceId = '', clientId = '' } = useParams()
  return (
    <PodcastFinder
      key={`${workspaceId || 'missing'}:${clientId || 'missing'}`}
      fixedClientId={clientId}
      platformWorkspaceId={workspaceId}
    />
  )
}

export default AdminWorkspacePodcastFinder
