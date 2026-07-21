import { Link, useNavigate } from 'react-router-dom'
import { LogOut, Users } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

export const WorkspaceLayout = ({ children }: { children: React.ReactNode }) => {
  const { membership, signOut, user, workspace } = useAuth()
  const navigate = useNavigate()

  const handleSignOut = async () => {
    try {
      await signOut()
      navigate('/login', { replace: true })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to sign out.')
    }
  }

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="border-b bg-background">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4 sm:px-6">
          <div className="min-w-0">
            <p className="truncate font-semibold">{workspace?.name || 'Workspace'}</p>
            <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
          </div>
          <nav className="flex-1">
            <Button variant="ghost" asChild>
              <Link to="/app/clients"><Users className="mr-2 h-4 w-4" />Clients</Link>
            </Button>
          </nav>
          {membership?.role && <Badge variant="outline" className="capitalize">{membership.role}</Badge>}
          <Button variant="outline" size="sm" onClick={handleSignOut}>
            <LogOut className="mr-2 h-4 w-4" />Sign out
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-7xl p-4 sm:p-6">{children}</main>
    </div>
  )
}
