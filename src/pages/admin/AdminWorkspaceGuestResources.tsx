import { useParams } from 'react-router-dom'
import WorkspaceGuestResources from '@/pages/app/WorkspaceGuestResources'

const AdminWorkspaceGuestResources = () => {
  const { workspaceId = '' } = useParams()
  return <WorkspaceGuestResources key={workspaceId || 'missing'} adminPreviewWorkspaceId={workspaceId} />
}

export default AdminWorkspaceGuestResources
