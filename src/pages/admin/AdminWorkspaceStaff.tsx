import { useParams } from 'react-router-dom'
import WorkspaceStaff from '@/pages/app/WorkspaceStaff'

const AdminWorkspaceStaff = () => {
  const { workspaceId = '' } = useParams()
  return <WorkspaceStaff key={workspaceId || 'missing'} adminPreviewWorkspaceId={workspaceId} />
}

export default AdminWorkspaceStaff
