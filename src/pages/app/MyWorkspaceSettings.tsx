import { Navigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import WorkspaceUsers from '@/pages/admin/WorkspaceUsers'
import WorkspaceStaff from '@/pages/app/WorkspaceStaff'

const MyWorkspaceSettings = () => {
  const { canManageWorkspaceStaff, isPlatformAdmin } = useAuth()

  if (isPlatformAdmin) return <WorkspaceUsers />
  if (canManageWorkspaceStaff) return <WorkspaceStaff />
  return <Navigate to="/app/clients" replace />
}

export default MyWorkspaceSettings
