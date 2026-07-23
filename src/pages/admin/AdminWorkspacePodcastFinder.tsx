import { Navigate, useParams } from 'react-router-dom'
import { selectedWorkspaceBaseHref } from '@/lib/workspaceRoutes'

const AdminWorkspacePodcastFinder = () => {
  const { workspaceId = '', clientId = '' } = useParams()
  return (
    <Navigate
      to={`${selectedWorkspaceBaseHref(workspaceId)}/podcast-finder?client=${encodeURIComponent(clientId)}`}
      replace
    />
  )
}

export default AdminWorkspacePodcastFinder
