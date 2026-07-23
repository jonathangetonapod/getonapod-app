import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  BookOpen,
  Calendar,
  ClipboardList,
  Database,
  LayoutDashboard,
  LogOut,
  Mail,
  Menu,
  Settings,
  Share2,
  User,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'
import { WorkspaceSwitcher } from '@/components/admin/WorkspaceSwitcher'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { workspaceLogoUrl } from '@/lib/workspaceLogo'

interface WorkspaceNavItem {
  id: string
  name: string
  segment: string
  icon: LucideIcon
  enabled: boolean
}

const workspaceNavItems: WorkspaceNavItem[] = [
  { id: 'overview', name: 'Overview', segment: 'overview', icon: LayoutDashboard, enabled: false },
  { id: 'onboarding', name: 'Onboarding', segment: 'onboarding', icon: ClipboardList, enabled: true },
  { id: 'prospect-dashboards', name: 'Prospect Dashboards', segment: 'prospect-dashboards', icon: Share2, enabled: false },
  { id: 'podcast-database', name: 'Podcast Database', segment: 'podcast-database', icon: Database, enabled: false },
  { id: 'client-podcast-system', name: 'Client Podcast System', segment: 'client-podcast-system', icon: Calendar, enabled: false },
  { id: 'clients', name: 'Clients', segment: 'clients', icon: Users, enabled: true },
  { id: 'outreach-platform', name: 'Outreach Platform', segment: 'outreach-platform', icon: Mail, enabled: false },
  { id: 'guest-resources', name: 'Guest Resources', segment: 'guest-resources', icon: BookOpen, enabled: true },
  { id: 'unibox', name: 'Unibox', segment: 'unibox', icon: Users, enabled: false },
  { id: 'settings', name: 'Settings', segment: 'settings', icon: Settings, enabled: false },
]

export interface PlatformWorkspaceConfig {
  workspaceName: string
  logoUrl?: string | null
  baseHref: string
  exitHref: string
}

interface WorkspaceLayoutProps {
  children: React.ReactNode
  platformWorkspace?: PlatformWorkspaceConfig
}

interface WorkspaceBrandLogoProps {
  logoUrl: string | null
  workspaceName: string
  workspaceInitials: string
  placement: 'sidebar' | 'mobile' | 'settings'
}

const brandLogoSizes: Record<WorkspaceBrandLogoProps['placement'], string> = {
  sidebar: 'h-24 w-full rounded-2xl',
  mobile: 'h-12 w-20 rounded-xl',
  settings: 'h-44 w-full max-w-md rounded-2xl sm:h-52',
}

const brandLogoImageSpacing: Record<WorkspaceBrandLogoProps['placement'], string> = {
  sidebar: 'p-2',
  mobile: 'p-1.5',
  settings: 'p-4 sm:p-5',
}

const brandLogoFallbackSizes: Record<WorkspaceBrandLogoProps['placement'], string> = {
  sidebar: 'text-3xl',
  mobile: 'text-sm',
  settings: 'text-5xl',
}

export const WorkspaceBrandLogo = ({
  logoUrl,
  workspaceName,
  workspaceInitials,
  placement,
}: WorkspaceBrandLogoProps) => (
  <Avatar
    data-testid={`workspace-logo-${placement}`}
    data-logo-state={logoUrl ? 'uploaded' : 'initials'}
    className={cn(
      'isolate overflow-hidden border border-white/15 bg-gradient-to-br from-[#141229] via-[#302a70] to-[#665cf2] shadow-[0_18px_40px_-24px_rgba(34,28,100,0.95)] ring-1 ring-black/10',
      brandLogoSizes[placement],
    )}
  >
    {logoUrl && (
      <AvatarImage
        src={logoUrl}
        alt={`${workspaceName} logo`}
        className={cn(
          'aspect-auto h-full w-full object-contain drop-shadow-[0_5px_14px_rgba(0,0,0,0.3)]',
          brandLogoImageSpacing[placement],
        )}
      />
    )}
    <AvatarFallback
      className={cn(
        'rounded-[inherit] bg-transparent font-bold tracking-tight text-white',
        brandLogoFallbackSizes[placement],
      )}
    >
      {workspaceInitials}
    </AvatarFallback>
  </Avatar>
)

export const WorkspaceLayout = ({ children, platformWorkspace }: WorkspaceLayoutProps) => {
  const { membership, signOut, user, workspace } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const workspaceName = platformWorkspace?.workspaceName || workspace?.name || 'Workspace'
  const logoUrl = platformWorkspace
    ? platformWorkspace.logoUrl || null
    : workspaceLogoUrl(workspace?.id, workspace?.logo_path, workspace?.logo_updated_at)
  const workspaceInitials = workspaceName
    .split(/\s+/u)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'W'
  const viewerEmail = user?.email
  const viewerName = membership?.full_name
    || user?.user_metadata?.full_name
    || 'Workspace user'
  const viewerRole = platformWorkspace ? 'platform owner' : membership?.role
  const baseHref = platformWorkspace?.baseHref || '/app'

  const handleSignOut = async () => {
    try {
      await signOut()
      navigate(platformWorkspace ? '/admin/login' : '/login', { replace: true })
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

          <div className="border-b border-border px-4 py-4">
            <WorkspaceBrandLogo
              logoUrl={logoUrl}
              workspaceName={workspaceName}
              workspaceInitials={workspaceInitials}
              placement="sidebar"
            />
            <div className="mt-3 min-w-0 px-1">
              <p className="truncate text-base font-bold tracking-tight">{workspaceName}</p>
              <p className="truncate text-xs font-medium text-muted-foreground">Workspace dashboard</p>
            </div>
            {platformWorkspace && (
              <div className="mt-4 space-y-2">
                <WorkspaceSwitcher presentation="toolbar" />
                <Button variant="ghost" size="sm" className="w-full justify-start" asChild>
                  <Link to={platformWorkspace.exitHref}>
                    <ArrowLeft className="mr-2 h-4 w-4" />Back to platform
                  </Link>
                </Button>
              </div>
            )}
          </div>

          <nav aria-label="Workspace navigation" className="flex-1 overflow-y-auto px-3 py-4">
            <ul className="space-y-1">
              {workspaceNavItems.map((item) => {
                const Icon = item.icon
                const href = `${baseHref}/${item.segment}`
                const isActive = location.pathname === href || location.pathname.startsWith(`${href}/`)
                const isSettings = item.id === 'settings'
                const itemEnabled = isSettings
                  ? Boolean(platformWorkspace || membership?.role === 'owner' || membership?.role === 'admin')
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
                        <Badge variant="outline" className="px-1.5 py-0 text-[10px] font-normal">{isSettings ? 'Owner/Admin' : 'Soon'}</Badge>
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
            >
              <LogOut className="mr-2 h-4 w-4" />Sign out
            </Button>
          </div>
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 flex h-20 items-center gap-4 border-b border-border bg-card px-4 lg:hidden">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open workspace navigation"
          >
            <Menu className="h-5 w-5" />
          </Button>
          <WorkspaceBrandLogo
            logoUrl={logoUrl}
            workspaceName={workspaceName}
            workspaceInitials={workspaceInitials}
            placement="mobile"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-semibold">{workspaceName}</p>
            <p className="truncate text-xs text-muted-foreground">Workspace dashboard</p>
          </div>
        </header>

        <main className="p-4 sm:p-6">{children}</main>
      </div>
    </div>
  )
}
