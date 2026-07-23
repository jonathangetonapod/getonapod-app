import { useParams } from 'react-router-dom'
import WorkspaceClients from '@/pages/app/WorkspaceClients'

const AdminWorkspacePodcastFinderHome = () => {
  const { workspaceId = '' } = useParams()
  return (
    <WorkspaceClients
      key={workspaceId || 'missing'}
      platformWorkspaceId={workspaceId}
      mode="research"
    />
  )
}

export default AdminWorkspacePodcastFinderHome
