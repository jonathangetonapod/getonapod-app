import { useParams } from 'react-router-dom'
import WorkspaceClients from '@/pages/app/WorkspaceClients'

const AdminWorkspaceClients = () => {
  const { workspaceId = '' } = useParams()
  return <WorkspaceClients key={workspaceId || 'missing'} adminPreviewWorkspaceId={workspaceId} />
}

export default AdminWorkspaceClients
