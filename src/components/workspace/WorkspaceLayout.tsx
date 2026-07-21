import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, Eye, LogOut, Users } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'
import { WorkspaceSwitcher } from '@/components/admin/WorkspaceSwitcher'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

export interface WorkspacePreviewConfig {
  workspaceName: string
  viewerEmail: string
  viewerRole: 'owner' | 'admin' | 'member'
  clientsHref: string
  exitHref: string
}

interface WorkspaceLayoutProps {
  children: React.ReactNode
  preview?: WorkspacePreviewConfig
}

export const WorkspaceLayout = ({ children, preview }: WorkspaceLayoutProps) => {
  const { membership, signOut, user, workspace } = useAuth()
  const navigate = useNavigate()
  const workspaceName = preview?.workspaceName || workspace?.name || 'Workspace'
  const viewerEmail = preview?.viewerEmail || user?.email
  const viewerRole = preview?.viewerRole || membership?.role
  const clientsHref = preview?.clientsHref || '/app/clients'

  const handleSignOut = async () => {
    try {
      await signOut()
      navigate(preview ? '/admin/login' : '/login', { replace: true })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to sign out.')
    }
  }

  return (
    <div className="min-h-screen bg-muted/20">
      {preview && (
        <div className="sticky top-0 z-50 border-b border-amber-500/40 bg-amber-50/95 backdrop-blur supports-[backdrop-filter]:bg-amber-50/85 dark:bg-amber-950/95">
          <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div className="flex min-w-0 items-start gap-3">
              <Eye className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
              <div className="min-w-0">
                <p className="font-semibold">Admin preview · Read only</p>
                <p id="admin-preview-context" className="text-sm text-muted-foreground">
                  Viewing exactly what {viewerEmail} sees in {workspaceName}. Controls are visible but disabled; you remain signed in as {user?.email || 'a platform administrator'}.
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <WorkspaceSwitcher presentation="toolbar" />
              <Button variant="outline" size="sm" asChild>
                <Link to={preview.exitHref}><ArrowLeft className="mr-2 h-4 w-4" />Exit preview</Link>
              </Button>
            </div>
          </div>
        </div>
      )}
      <header className="border-b bg-background">
        <div className="mx-auto flex min-h-16 max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:gap-x-6 sm:px-6">
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{workspaceName}</p>
            <p className="truncate text-xs text-muted-foreground">{viewerEmail}</p>
          </div>
          <nav className="order-last w-full sm:order-none sm:w-auto sm:flex-1">
            <Button variant="ghost" asChild>
              <Link to={clientsHref}><Users className="mr-2 h-4 w-4" />Clients</Link>
            </Button>
          </nav>
          {viewerRole && <Badge variant="outline" className="capitalize">{viewerRole}</Badge>}
          <Button
            variant="outline"
            size="sm"
            onClick={handleSignOut}
            disabled={Boolean(preview)}
            aria-describedby={preview ? 'admin-preview-context' : undefined}
          >
            <LogOut className="mr-2 h-4 w-4" />Sign out
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-7xl p-4 sm:p-6">{children}</main>
    </div>
  )
}
