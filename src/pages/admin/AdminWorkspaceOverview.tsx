import { useParams } from 'react-router-dom'
import WorkspaceOverview from '@/pages/app/WorkspaceOverview'

const AdminWorkspaceOverview = () => {
  const { workspaceId = '' } = useParams()
  return <WorkspaceOverview key={workspaceId || 'missing'} platformWorkspaceId={workspaceId} />
}

export default AdminWorkspaceOverview
