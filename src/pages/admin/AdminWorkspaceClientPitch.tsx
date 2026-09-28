import { useParams } from 'react-router-dom'
import WorkspaceClientPitch from '@/pages/app/WorkspaceClientPitch'

const AdminWorkspaceClientPitch = () => {
  const { workspaceId = '', clientId = '', podcastId = '' } = useParams()
  return (
    <WorkspaceClientPitch
      key={`${workspaceId || 'missing'}:${clientId || 'missing'}:${podcastId || 'missing'}`}
      platformWorkspaceId={workspaceId}
    />
  )
}

export default AdminWorkspaceClientPitch
