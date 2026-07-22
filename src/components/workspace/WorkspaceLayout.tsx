import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  BookOpen,
  Calendar,
  ClipboardList,
  Database,
  Eye,
  LayoutDashboard,
  LogOut,
  Mail,
  Menu,
  Search,
  Share2,
  User,
  UserPlus,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'
import { WorkspaceSwitcher } from '@/components/admin/WorkspaceSwitcher'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface WorkspaceNavItem {
  id: string
  name: string
  segment: string
  icon: LucideIcon
  enabled: boolean
}

const workspaceNavItems: WorkspaceNavItem[] = [
  { id: 'overview', name: 'Overview', segment: 'overview', icon: LayoutDashboard, enabled: false },
  { id: 'workspace-users', name: 'Workspace Users', segment: 'workspace-users', icon: UserPlus, enabled: false },
  { id: 'onboarding', name: 'Onboarding', segment: 'onboarding', icon: ClipboardList, enabled: false },
  { id: 'podcast-finder', name: 'Podcast Finder', segment: 'podcast-finder', icon: Search, enabled: false },
  { id: 'prospect-dashboards', name: 'Prospect Dashboards', segment: 'prospect-dashboards', icon: Share2, enabled: false },
  { id: 'podcast-database', name: 'Podcast Database', segment: 'podcast-database', icon: Database, enabled: false },
  { id: 'client-podcast-system', name: 'Client Podcast System', segment: 'client-podcast-system', icon: Calendar, enabled: false },
  { id: 'clients', name: 'Clients', segment: 'clients', icon: Users, enabled: true },
  { id: 'outreach-platform', name: 'Outreach Platform', segment: 'outreach-platform', icon: Mail, enabled: false },
  { id: 'guest-resources', name: 'Guest Resources', segment: 'guest-resources', icon: BookOpen, enabled: true },
  { id: 'unibox', name: 'Unibox', segment: 'unibox', icon: Users, enabled: false },
]

export interface WorkspacePreviewConfig {
  workspaceName: string
  viewerEmail: string
  viewerName?: string | null
  viewerRole: 'owner' | 'admin' | 'member'
  baseHref: string
  exitHref: string
}

interface WorkspaceLayoutProps {
  children: React.ReactNode
  preview?: WorkspacePreviewConfig
}

export const WorkspaceLayout = ({ children, preview }: WorkspaceLayoutProps) => {
  const { membership, signOut, user, workspace } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const workspaceName = preview?.workspaceName || workspace?.name || 'Workspace'
  const viewerEmail = preview?.viewerEmail || user?.email
  const viewerName = preview?.viewerName
    || membership?.full_name
    || user?.user_metadata?.full_name
    || 'Workspace user'
  const viewerRole = preview?.viewerRole || membership?.role
  const baseHref = preview?.baseHref || '/app'

  const handleSignOut = async () => {
    if (preview) return
    try {
      await signOut()
      navigate('/login', { replace: true })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to sign out.')
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {sidebarOpen && (
        <button
          type="button"
          aria-label="Close workspace navigation"
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-64 transform border-r border-border bg-card transition-transform duration-200 ease-in-out lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-full flex-col">
          <div className="flex h-16 items-center justify-between border-b border-border px-6">
            <h1 className="text-xl font-bold">Get On A Pod</h1>
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setSidebarOpen(false)}
              aria-label="Close workspace navigation"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          <div className="border-b border-border px-6 py-4">
            <p className="truncate text-sm font-semibold">{workspaceName}</p>
            <p className="truncate text-xs text-muted-foreground">Workspace dashboard</p>
          </div>

          <nav aria-label="Workspace navigation" className="flex-1 overflow-y-auto px-3 py-4">
            <ul className="space-y-1">
              {workspaceNavItems.map((item) => {
                const Icon = item.icon
                const href = `${baseHref}/${item.segment}`
                const isActive = location.pathname === href || location.pathname.startsWith(`${href}/`)
                const isWorkspaceUsers = item.id === 'workspace-users'
                const itemEnabled = isWorkspaceUsers
                  ? Boolean(preview || membership?.role === 'owner' || membership?.role === 'admin')
                  : item.enabled

                return (
                  <li key={item.id}>
                    {itemEnabled ? (
                      <Link
                        to={href}
                        onClick={() => setSidebarOpen(false)}
                        className={cn(
                          'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                          isActive
                            ? 'bg-primary text-primary-foreground'
                            : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                        )}
                      >
                        <Icon className="h-5 w-5 shrink-0" />
                        <span>{item.name}</span>
                      </Link>
                    ) : (
                      <button
                        type="button"
                        disabled
                        className="flex w-full cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium text-muted-foreground/70"
                      >
                        <Icon className="h-5 w-5 shrink-0" />
                        <span className="min-w-0 flex-1 truncate">{item.name}</span>
                        <Badge variant="outline" className="px-1.5 py-0 text-[10px] font-normal">{isWorkspaceUsers ? 'Owner/Admin' : 'Soon'}</Badge>
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          </nav>

          <div className="border-t border-border p-4">
            <div className="mb-3 flex items-center gap-3">
              <Avatar className="h-10 w-10">
                <AvatarFallback><User className="h-5 w-5" /></AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{viewerName}</p>
                <p className="truncate text-xs text-muted-foreground">{viewerEmail}</p>
              </div>
              {viewerRole && <Badge variant="outline" className="capitalize">{viewerRole}</Badge>}
            </div>
            <Button
              onClick={() => void handleSignOut()}
              variant="outline"
              size="sm"
              className="w-full"
              disabled={Boolean(preview)}
              aria-describedby={preview ? 'admin-preview-context' : undefined}
            >
              <LogOut className="mr-2 h-4 w-4" />Sign out
            </Button>
          </div>
        </div>
      </aside>

      <div className="lg:pl-64">
        {preview && (
          <div className="border-b border-amber-500/40 bg-amber-50/95 dark:bg-amber-950/95">
            <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <div className="flex min-w-0 items-start gap-3">
                <Eye className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
                <div className="min-w-0">
                  <p className="font-semibold">Admin preview · Read only</p>
                  <p id="admin-preview-context" className="text-sm text-muted-foreground">
                    Viewing the workspace layout and data for {viewerEmail} in {workspaceName}. Mutation controls are visible but disabled; you remain signed in as {user?.email || 'a platform administrator'}.
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

        <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-border bg-card px-4 lg:hidden">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open workspace navigation"
          >
            <Menu className="h-5 w-5" />
          </Button>
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold">{workspaceName}</p>
            <p className="truncate text-xs text-muted-foreground">Workspace dashboard</p>
          </div>
        </header>

        <main className="p-4 sm:p-6">{children}</main>
      </div>
    </div>
  )
}
