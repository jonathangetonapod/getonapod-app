import { useParams } from 'react-router-dom'
import WorkspaceOutreachSuite, { type OutreachWorkspaceModule } from '@/pages/app/WorkspaceOutreachSuite'

interface AdminWorkspaceOutreachSuiteProps {
  module: OutreachWorkspaceModule
}

const AdminWorkspaceOutreachSuite = ({ module }: AdminWorkspaceOutreachSuiteProps) => {
  const { workspaceId = '' } = useParams()
  return (
    <WorkspaceOutreachSuite
      key={`${workspaceId || 'missing'}:${module}`}
      module={module}
      platformWorkspaceId={workspaceId}
    />
  )
}

export default AdminWorkspaceOutreachSuite
