import { useParams } from 'react-router-dom'
import WorkspaceCampaignDetail from '@/pages/app/WorkspaceCampaignDetail'

const AdminWorkspaceCampaignDetail = () => {
  const { workspaceId = '', clientId = '' } = useParams()
  return <WorkspaceCampaignDetail key={`${workspaceId || 'missing'}:${clientId || 'missing'}`} platformWorkspaceId={workspaceId} />
}

export default AdminWorkspaceCampaignDetail
