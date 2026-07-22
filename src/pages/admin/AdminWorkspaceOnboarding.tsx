import { useParams } from 'react-router-dom'
import WorkspaceOnboarding from '@/pages/app/WorkspaceOnboarding'

const AdminWorkspaceOnboarding = () => {
  const { workspaceId = '' } = useParams()
  return <WorkspaceOnboarding key={workspaceId || 'missing'} platformWorkspaceId={workspaceId} />
}

export default AdminWorkspaceOnboarding
