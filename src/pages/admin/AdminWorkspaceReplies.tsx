import { useParams } from 'react-router-dom'
import WorkspaceReplies from '@/pages/app/WorkspaceReplies'

/** Platform-admin wrapper: the same page, bound to an explicitly selected workspace. */
const AdminWorkspaceReplies = () => {
  const { workspaceId = '' } = useParams()
  return (
    <WorkspaceReplies
      key={workspaceId || 'missing'}
      platformWorkspaceId={workspaceId}
    />
  )
}

export default AdminWorkspaceReplies
