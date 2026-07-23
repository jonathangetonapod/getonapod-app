import { useParams } from 'react-router-dom'
import WorkspaceClientDetail from '@/pages/app/WorkspaceClientDetail'

const AdminWorkspaceClientDetail = () => {
  const { workspaceId = '' } = useParams()
  return <WorkspaceClientDetail key={workspaceId || 'missing'} platformWorkspaceId={workspaceId} />
}

export default AdminWorkspaceClientDetail
