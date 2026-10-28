import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  BookOpen,
  Building2,
  Calendar,
  ClipboardList,
  Database,
  GraduationCap,
  GripVertical,
  BookUser,
  LayoutDashboard,
  LogOut,
  Mailbox,
  Megaphone,
  Menu,
  Search,
  CreditCard,
  Settings,
  Share2,
  User,
  Users,
  X,
  type LucideIcon, ShieldAlert, ShieldCheck,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'
import { JoinRequestsBadge } from '@/components/workspace/JoinRequestsBadge'
import { describeWaitingJoinRequests, useWaitingJoinRequests } from '@/hooks/useWaitingJoinRequests'
import { WorkspaceSwitcher } from '@/components/admin/WorkspaceSwitcher'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from '@/components/ui/select'
import { getWorkspaceClients } from '@/services/clients'
import { cn } from '@/lib/utils'
import {
  CLIENT_SCOPED_SEGMENTS,
  clientScopedHref,
  normalizeWorkingClientId,
  readWorkingClient,
  writeWorkingClient,
} from '@/lib/workingClient'
import { memberAvatarUrl, workspaceLogoUrl } from '@/lib/workspaceLogo'
import { platformBillingWorkspaceHref } from '@/lib/workspaceRoutes'
import { listPodcastResearchWorkspaces } from '@/services/adminWorkspaces'

interface WorkspaceNavItem {
  id: string
  name: string
  segment: string
  icon: LucideIcon
  enabled: boolean
}

// Default order follows the sidebar groups below: client work, finding shows,
// outreach, then setup and reference pages. Ids and segments are stable; only
// labels and positions move.
const workspaceNavItems: WorkspaceNavItem[] = [
  { id: 'clients', name: 'Clients', segment: 'clients', icon: Users, enabled: true },
  { id: 'client-podcast-system', name: 'Pipeline', segment: 'client-podcast-system', icon: Calendar, enabled: true },
  { id: 'onboarding', name: 'Client intake', segment: 'onboarding', icon: ClipboardList, enabled: true },
  { id: 'outreach-platform', name: 'Client Campaigns', segment: 'client-campaigns', icon: Megaphone, enabled: true },
  { id: 'podcast-finder', name: 'Podcast Finder', segment: 'podcast-finder', icon: Search, enabled: true },
  { id: 'podcast-database', name: 'Podcast Database', segment: 'podcast-database', icon: Database, enabled: true },
  { id: 'prospects', name: 'Prospect Studio', segment: 'prospects', icon: Share2, enabled: true },
  { id: 'mailboxes', name: 'Mailboxes', segment: 'mailboxes', icon: Mailbox, enabled: true },
  { id: 'relationships', name: 'Relationships', segment: 'relationships', icon: BookUser, enabled: true },
  { id: 'university', name: 'University', segment: 'university', icon: GraduationCap, enabled: true },
  // Billing sits in the main navigation rather than only inside Settings:
  // "where do I buy credits" should not require knowing that credits live
  // under a settings sub-page. Owner/admin only, and hidden when a platform
  // admin is viewing a tenant, because that route is not workspace-scoped.
  { id: 'billing', name: 'Billing', segment: 'settings/billing', icon: CreditCard, enabled: false },
  { id: 'settings', name: 'Settings', segment: 'settings', icon: Settings, enabled: false },
]

/*
 * Headings over the default order. Someone who has arranged their own order
 * keeps a flat list: headings over a custom arrangement would split it in
 * places they did not choose. Anything not named here falls under Other.
 */
const workspaceNavGroups: Array<{ label: string; ids: string[] }> = [
  { label: 'Clients', ids: ['clients', 'client-podcast-system', 'onboarding', 'outreach-platform'] },
  { label: 'Find', ids: ['podcast-finder', 'podcast-database', 'prospects'] },
  { label: 'Outreach', ids: ['mailboxes', 'relationships'] },
]

function groupWorkspaceNavItems(items: WorkspaceNavItem[]): Array<{ label: string; items: WorkspaceNavItem[] }> {
  const grouped = new Set(workspaceNavGroups.flatMap((group) => group.ids))
  return [
    ...workspaceNavGroups.map((group) => ({
      label: group.label,
      items: items.filter((item) => group.ids.includes(item.id)),
    })),
    { label: 'Other', items: items.filter((item) => !grouped.has(item.id)) },
  ].filter((group) => group.items.length > 0)
}

/*
 * The modules whose page follows the header's working client, not only the
 * other way round. The Pipeline filters on every read, the Podcast Database's
 * add buttons name whichever client is chosen, and the Podcast Finder's client
 * picker is ?client= itself.
 */
const HEADER_DRIVES_ADDRESS_SEGMENTS = ['client-podcast-system', 'onboarding', 'podcast-database', 'client-campaigns']

/*
 * The same, for pages matched exactly rather than with everything under them.
 * The advanced finder lives under podcast-finder/ and still reads ?client=
 * once on arrival, so changing the address under it would not move it.
 */
const HEADER_DRIVES_ADDRESS_EXACT_SEGMENTS = ['podcast-finder']

/*
 * A client's campaign page names its client in the path rather than in
 * ?client=, so there the header reads the path and moves between campaigns.
 */
const CLIENT_IN_PATH_SEGMENT = 'client-campaigns'

// Radix Select needs a non-empty value for the "no client" choice.
const ALL_CLIENTS = 'all-clients'

const WORKSPACE_NAV_ORDER_STORAGE_PREFIX = 'workspace-nav-order-v2'
const WORKSPACE_NAV_SCROLL_STORAGE_PREFIX = 'workspace-nav-scroll-v1'
export const WORKSPACE_NAV_ORGANIZE_EVENT = 'goap:workspace-navigation-organize'

function orderedWorkspaceNavItems(value: unknown): WorkspaceNavItem[] {
  if (!Array.isArray(value)) return [...workspaceNavItems]

  const itemsById = new Map(workspaceNavItems.map((item) => [item.id, item]))
  const seen = new Set<string>()
  const ordered = value.flatMap((candidate) => {
    if (typeof candidate !== 'string' || seen.has(candidate)) return []
    const item = itemsById.get(candidate)
    if (!item) return []
    seen.add(candidate)
    return [item]
  })
  const missing = workspaceNavItems.filter((item) => !seen.has(item.id))
  /*
   * A COMPLETE saved order missing only newly shipped modules gets each new
   * module spliced in at its default position. Plain appending put every new
   * page dead last — below Settings — for exactly the users who had cared
   * enough to arrange their sidebar, which is where nobody looks for a new
   * module. Partial orders (hand-edited storage, older shapes) keep the
   * conservative append: guessing positions inside a deliberate custom
   * arrangement would be worse than adding to the end.
   */
  const savedIsCompletePriorOrder = missing.every((item) => {
    const defaultIndex = workspaceNavItems.findIndex((candidate) => candidate.id === item.id)
    return workspaceNavItems.every((candidate, index) => (
      index > defaultIndex || candidate.id === item.id || seen.has(candidate.id)
    ))
  })
  if (savedIsCompletePriorOrder && ordered.length >= workspaceNavItems.length - missing.length) {
    const result = [...ordered]
    for (const item of missing) {
      const defaultIndex = workspaceNavItems.findIndex((candidate) => candidate.id === item.id)
      result.splice(Math.min(defaultIndex, result.length), 0, item)
    }
    return result
  }
  return [...ordered, ...missing]
}

function storedWorkspaceNavItems(
  canOrganizeNavigation: boolean,
  navStorageKey: string,
  legacyNavStorageKey: string,
): WorkspaceNavItem[] {
  if (!canOrganizeNavigation || typeof window === 'undefined') return [...workspaceNavItems]

  try {
    const currentStored = window.localStorage.getItem(navStorageKey)
    const legacyStored = currentStored ? null : window.localStorage.getItem(legacyNavStorageKey)
    const stored = currentStored || legacyStored
    return orderedWorkspaceNavItems(stored ? JSON.parse(stored) : null)
  } catch {
    return [...workspaceNavItems]
  }
}

function hasSameWorkspaceNavOrder(left: WorkspaceNavItem[], right: WorkspaceNavItem[]) {
  return left.length === right.length && left.every((item, index) => item.id === right[index]?.id)
}

function readWorkspaceNavScroll(storageKey: string) {
  if (typeof window === 'undefined') return 0
  try {
    const stored = Number(window.sessionStorage.getItem(storageKey))
    return Number.isFinite(stored) && stored > 0 ? stored : 0
  } catch {
    return 0
  }
}

function saveWorkspaceNavScroll(storageKey: string, scrollTop: number) {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(storageKey, String(Math.max(0, Math.round(scrollTop))))
  } catch {
    // Navigation remains usable when browser storage is unavailable.
  }
}

interface SortableWorkspaceNavItemProps {
  item: WorkspaceNavItem
  href: string
  isActive: boolean
  isEnabled: boolean
  isOrganizing: boolean
  restrictedLabel: string
  onNavigate: () => void
}

const SortableWorkspaceNavItem = ({
  item,
  href,
  isActive,
  isEnabled,
  isOrganizing,
  restrictedLabel,
  onNavigate,
}: SortableWorkspaceNavItemProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id, disabled: !isOrganizing })
  const Icon = item.icon
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <li ref={setNodeRef} style={style} className={cn(isDragging && 'relative z-10 opacity-60')}>
      {isOrganizing ? (
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`Drag ${item.name}`}
          className={cn(
            'flex w-full touch-none cursor-grab items-center gap-2 rounded-lg border border-transparent px-2 py-2 text-left text-sm font-medium active:cursor-grabbing',
            isActive ? 'border-primary/30 bg-primary/5 text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
          )}
        >
          <GripVertical className="h-4 w-4 shrink-0" />
          <Icon className="h-5 w-5 shrink-0" />
          <span className="min-w-0 flex-1 truncate">{item.name}</span>
          {!isEnabled && <Badge variant="outline" className="px-1.5 py-0 text-[10px] font-normal">{restrictedLabel}</Badge>}
        </button>
      ) : isEnabled ? (
        <Link
          to={href}
          onClick={onNavigate}
          aria-current={isActive ? 'page' : undefined}
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
          <Badge variant="outline" className="px-1.5 py-0 text-[10px] font-normal">{restrictedLabel}</Badge>
        </button>
      )}
    </li>
  )
}

export interface PlatformWorkspaceConfig {
  /**
   * The workspace being viewed, which is not the one in AuthContext — that is
   * always the viewer's own. Required rather than optional so a new platform
   * surface cannot quietly render a shell that reads the wrong workspace's
   * numbers.
   */
  workspaceId: string
  workspaceName: string
  logoUrl?: string | null
  baseHref: string
}

/** What pages pass as the workspace name while their own load is in flight. */
const PLATFORM_WORKSPACE_PLACEHOLDER_NAME = 'Client workspace'

interface WorkspaceLayoutProps {
  children: React.ReactNode
  platformWorkspace?: PlatformWorkspaceConfig
  /**
   * Leave the page's name out of the top bar and the sidebar subtitle, for a
   * page whose own h1 already says it right underneath.
   */
  hidePageName?: boolean
}

interface WorkspaceBrandLogoProps {
  logoUrl: string | null
  workspaceName: string
  workspaceInitials: string
  placement: 'sidebar' | 'mobile' | 'settings'
}

const brandLogoSizes: Record<WorkspaceBrandLogoProps['placement'], string> = {
  sidebar: 'h-12 w-12 shrink-0 rounded-xl',
  mobile: 'h-12 w-20 rounded-xl',
  settings: 'h-24 w-40 rounded-xl sm:h-28 sm:w-48',
}

const brandLogoImageSpacing: Record<WorkspaceBrandLogoProps['placement'], string> = {
  sidebar: 'p-1',
  mobile: 'p-1.5',
  settings: 'p-2 sm:p-3',
}

const brandLogoFallbackSizes: Record<WorkspaceBrandLogoProps['placement'], string> = {
  sidebar: 'text-sm',
  mobile: 'text-sm',
  settings: 'text-2xl',
}

interface ShellAvatarImageProps {
  src: string | null
  alt: string
  className?: string
  fallback: React.ReactNode
}

/*
 * Every page mounts its own WorkspaceLayout, so the shell's pictures mount
 * again on each navigation. Radix's AvatarImage hides the image until its own
 * load check finishes, even for one the browser already has, so the initials
 * flashed in between pages. A plain img paints a cached picture at once; the
 * initials show only when there is no picture or it fails to load.
 */
const ShellAvatarImage = ({ src, alt, className, fallback }: ShellAvatarImageProps) => {
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  if (!src || failedSrc === src) return <>{fallback}</>
  return (
    <img
      src={src}
      alt={alt}
      className={cn('aspect-square h-full w-full', className)}
      onError={() => setFailedSrc(src)}
    />
  )
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
      'isolate overflow-hidden ring-0',
      logoUrl
        // An uploaded logo sits clean on a transparent card.
        ? 'border border-transparent bg-transparent shadow-none'
        // No logo yet: a polished brand monogram, not a flat grey box.
        : 'border-0 bg-gradient-to-br from-primary via-violet-500 to-fuchsia-500 shadow-lg shadow-primary/25 ring-1 ring-inset ring-white/20',
      brandLogoSizes[placement],
      // An uploaded logo is often a wordmark; a square would shrink it unreadable.
      placement === 'sidebar' && logoUrl && 'w-24',
    )}
  >
    <ShellAvatarImage
      src={logoUrl}
      alt={`${workspaceName} logo`}
      className={cn(
        'aspect-auto object-contain',
        brandLogoImageSpacing[placement],
      )}
      fallback={(
        <AvatarFallback
          className={cn(
            // A soft top sheen over the gradient, white initials with a little
            // depth — reads as an intentional brand mark rather than a placeholder.
            'relative rounded-[inherit] bg-transparent font-bold tracking-tight text-white',
            'before:pointer-events-none before:absolute before:inset-0 before:rounded-[inherit] before:bg-gradient-to-b before:from-white/25 before:to-transparent',
            '[text-shadow:0_1px_2px_rgba(13,27,42,0.35)]',
            brandLogoFallbackSizes[placement],
          )}
        >
          <span className="relative">{workspaceInitials}</span>
        </AvatarFallback>
      )}
    />
  </Avatar>
)

/** Below Tailwind's md, where the sidebar is a drawer. False wherever matchMedia is missing. */
function useBelowMd(): boolean {
  const [below, setBelow] = useState(false)
  useEffect(() => {
    const query = typeof window.matchMedia === 'function' ? window.matchMedia('(max-width: 767px)') : null
    if (!query || typeof query.addEventListener !== 'function') return
    const update = () => setBelow(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  return below
}

export const WorkspaceLayout = ({ children, platformWorkspace, hidePageName = false }: WorkspaceLayoutProps) => {
  const { isPlatformAdmin, membership, signOut, user, workspace } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const matchesPath = (href: string) => location.pathname === href || location.pathname.startsWith(`${href}/`)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const sidebarTriggerRef = useRef<HTMLButtonElement>(null)
  const sidebarCloseRef = useRef<HTMLButtonElement>(null)
  const sidebarWasOpenRef = useRef(false)
  // On small screens the sidebar is a drawer: focus goes into it when it
  // opens, Escape closes it, and focus returns to the menu button afterwards.
  useEffect(() => {
    if (sidebarOpen) {
      sidebarWasOpenRef.current = true
      sidebarCloseRef.current?.focus()
      const closeOnEscape = (event: KeyboardEvent) => {
        if (event.key === 'Escape') setSidebarOpen(false)
      }
      window.addEventListener('keydown', closeOnEscape)
      return () => window.removeEventListener('keydown', closeOnEscape)
    }
    if (sidebarWasOpenRef.current) {
      sidebarWasOpenRef.current = false
      sidebarTriggerRef.current?.focus()
    }
  }, [sidebarOpen])
  /*
   * Each page loads the workspace it shows on its own, and hands this shell a
   * placeholder name and no logo until that load finishes — so a platform
   * admin moving between a tenant's pages saw the brand drop to initials and
   * back every time. The switcher's workspace list (same query key, so the
   * same cache) holds the brand across pages and fills in while a page loads.
   */
  const switchableWorkspacesQuery = useQuery({
    queryKey: ['platform', user?.id || 'unknown', 'switchable-workspaces', 'v3'],
    queryFn: listPodcastResearchWorkspaces,
    enabled: isPlatformAdmin && Boolean(platformWorkspace),
    staleTime: 30_000,
  })
  const listedPlatformWorkspace = platformWorkspace
    ? (switchableWorkspacesQuery.data ?? []).find(
      (candidate) => candidate.id.toLowerCase() === platformWorkspace.workspaceId.toLowerCase(),
    ) ?? null
    : null
  const platformWorkspaceName = platformWorkspace?.workspaceName === PLATFORM_WORKSPACE_PLACEHOLDER_NAME
    ? listedPlatformWorkspace?.name || platformWorkspace.workspaceName
    : platformWorkspace?.workspaceName
  const workspaceName = platformWorkspaceName || workspace?.name || 'Workspace'
  const logoUrl = platformWorkspace
    ? platformWorkspace.logoUrl
      || workspaceLogoUrl(listedPlatformWorkspace?.id, listedPlatformWorkspace?.logo_path, listedPlatformWorkspace?.logo_updated_at)
    : workspaceLogoUrl(workspace?.id, workspace?.logo_path, workspace?.logo_updated_at)
  const workspaceInitials = workspaceName
    .split(/\s+/u)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'W'
  const viewerEmail = user?.email
  /*
   * account-context returns the member's own picture alongside their name.
   * Read through a local widening rather than by extending WorkspaceMembership,
   * because AuthContext is on the do-not-modify-without-approval list and this
   * needs no behaviour from it — only two fields it already carries at runtime.
   */
  const viewerAvatar = membership as (typeof membership & {
    avatar_path?: string | null
    avatar_updated_at?: string | null
  }) | null
  const viewerAvatarUrl = memberAvatarUrl(
    workspace?.id,
    user?.id,
    viewerAvatar?.avatar_path,
    viewerAvatar?.avatar_updated_at,
  )
  const viewerName = membership?.full_name
    || user?.user_metadata?.full_name
    || 'Workspace user'
  // The footer shares its row with the role badge and the reorder button, so
  // it shows the first name, whole, rather than a full name cut to "Jo…".
  const viewerFirstName = viewerName === 'Workspace user'
    ? viewerName
    : viewerName.split(/\s+/u).filter(Boolean)[0] || viewerName
  // Initials read better than a generic silhouette while no picture is set.
  const viewerInitials = viewerName
    .split(/\s+/u)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('')
  const viewerRole = platformWorkspace ? 'platform owner' : membership?.role
  const baseHref = platformWorkspace?.baseHref || '/app'
  const navStorageOwner = user?.id || user?.email?.trim().toLowerCase() || 'current-user'
  const navStorageWorkspace = workspace?.id?.toLowerCase()
    || (isPlatformAdmin ? 'platform-owner' : 'unavailable-workspace')
  /*
   * A platform admin keeps this while viewing a tenant, and that is deliberate
   * rather than an oversight. The order lives under navStorageWorkspace, which
   * is the viewer's own workspace in every view, so the sidebar on screen is
   * already their own ordering and reordering it edits the thing they are
   * looking at. Taking the control away here would also make
   * storedWorkspaceNavItems fall back to the default order, discarding an
   * order they had set. The settings page has no matching section in that view,
   * which is a gap in the settings page and not a reason to remove this.
   */
  const canOrganizeNavigation = Boolean(user)
    && (isPlatformAdmin || (!platformWorkspace && membership?.role === 'owner'))
    && navStorageWorkspace !== 'unavailable-workspace'
  const navStorageKey = `${WORKSPACE_NAV_ORDER_STORAGE_PREFIX}:${navStorageWorkspace}:${navStorageOwner}`
  const legacyNavStorageKey = `workspace-nav-order-v1:${navStorageOwner}`
  const navScrollStorageKey = `${WORKSPACE_NAV_SCROLL_STORAGE_PREFIX}:${navStorageWorkspace}:${navStorageOwner}`
  const [navItems, setNavItems] = useState<WorkspaceNavItem[]>(() => (
    storedWorkspaceNavItems(canOrganizeNavigation, navStorageKey, legacyNavStorageKey)
  ))
  const [isOrganizing, setIsOrganizing] = useState(false)
  const navigationRef = useRef<HTMLElement>(null)
  const isDefaultNavOrder = navItems.every((item, index) => item.id === workspaceNavItems[index]?.id)
  // Billing is not workspace-scoped, so it is dropped rather than shown broken
  // while a platform admin is looking at somebody else's workspace.
  const visibleNavItems = platformWorkspace
    ? navItems.filter((item) => item.id !== 'billing')
    : navItems
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const managesWorkspace = Boolean(
    isPlatformAdmin || platformWorkspace || membership?.role === 'owner' || membership?.role === 'admin',
  )
  const isNavItemActive = (item: WorkspaceNavItem) => {
    // Only the most specific matching item is active, so Settings does not
    // light up alongside Billing on /settings/billing.
    const pathHref = `${baseHref}/${item.segment}`
    return matchesPath(pathHref) && !visibleNavItems.some((other) => (
      other !== item && other.segment.length > item.segment.length && matchesPath(`${baseHref}/${other.segment}`)
    ))
  }
  const activeNavItem = visibleNavItems.find(isNavItemActive)
  /*
   * Under the workspace name: the page the person is on, which is the thing
   * the old "Workspace dashboard" filler pretended to be. The default
   * workspace is named by its saved name like any other; it used to show a
   * fixed "My Workspace" alias, so renaming it in Settings changed nothing the
   * owner could see.
   */
  const workspaceSubtitle = hidePageName ? '' : activeNavItem?.name
  const headerTitle = hidePageName ? '' : activeNavItem?.name || workspaceName

  /*
   * The working client. One choice in the header that every client-scoped
   * module then opens on, instead of re-picking the same person on each page.
   * Keyed on the workspace on screen, which for a platform admin is the tenant
   * being viewed and not their own.
   */
  const workingClientWorkspaceId = (platformWorkspace?.workspaceId || workspace?.id || '').toLowerCase()
  // Platform administration acts on every workspace, so a working client and
  // the admin's own credit balance describe nothing on these pages.
  const onPlatformPage = isPlatformAdmin && matchesPath('/app/platform')
  // Settings and billing are about the workspace, not any one client, so a
  // working-client picker there offered a choice that changed nothing.
  const onSettingsPage = matchesPath(`${baseHref}/settings`)
  const [workingClientId, setWorkingClientId] = useState<string | null>(() => readWorkingClient(workingClientWorkspaceId, user?.id))
  const clientInPathHref = `${baseHref}/${CLIENT_IN_PATH_SEGMENT}`
  const clientInPath = location.pathname.startsWith(`${clientInPathHref}/`)
  const requestedClientId = normalizeWorkingClientId(clientInPath
    ? location.pathname.slice(clientInPathHref.length + 1).split('/')[0]
    : new URLSearchParams(location.search).get('client'))
  const currentSegmentReadsClient = Array.from(CLIENT_SCOPED_SEGMENTS)
    .some((segment) => matchesPath(`${baseHref}/${segment}`))
  const headerDrivesAddress = HEADER_DRIVES_ADDRESS_SEGMENTS
    .some((segment) => matchesPath(`${baseHref}/${segment}`))
    || HEADER_DRIVES_ADDRESS_EXACT_SEGMENTS.some((segment) => location.pathname === `${baseHref}/${segment}`)
  const waitingJoinRequests = useWaitingJoinRequests(isPlatformAdmin)
  /*
   * Below md a platform admin's header held the menu, the working client,
   * credits, two admin buttons and the workspace switcher: about 590px of
   * controls in a 358px bar, so the switcher ran off the screen. There the
   * admin controls live at the top of the drawer instead. Rendered in one
   * place or the other, never both, so there is one switcher to find.
   */
  const adminControlsInDrawer = useBelowMd() && isPlatformAdmin
  const clientsQuery = useQuery({
    queryKey: ['workspace-working-client', workingClientWorkspaceId, 'clients'],
    queryFn: () => getWorkspaceClients(workingClientWorkspaceId),
    enabled: Boolean(workingClientWorkspaceId) && !onPlatformPage,
    // Clients are added, paused and renamed on other pages and in other tabs;
    // re-read on focus so the picker does not offer a stale list.
    staleTime: 15_000,
    refetchOnWindowFocus: true,
    retry: false,
  })
  const workingClients = useMemo(
    () => (clientsQuery.data ?? []).filter((client) => client.status === 'active'),
    [clientsQuery.data],
  )
  // Paused and churned clients are left out on purpose; the picker says so,
  // or a workspace with four clients wonders where two of them went.
  const inactiveClientCount = (clientsQuery.data?.length ?? 0) - workingClients.length
  /*
   * Named from every client, not only active ones: the Pipeline can be opened
   * on a paused client (from that client's record), and the header has to say
   * who is on screen rather than "All clients".
   */
  const workingClient = (clientsQuery.data ?? []).find((client) => client.id.toLowerCase() === workingClientId) ?? null

  useEffect(() => {
    setWorkingClientId(readWorkingClient(workingClientWorkspaceId, user?.id))
  }, [user?.id, workingClientWorkspaceId])

  // A page opened with ?client= (from a link, a bookmark, another module's
  // handoff) is a choice too, and the header follows it rather than arguing.
  useEffect(() => {
    if (!workingClientWorkspaceId || !currentSegmentReadsClient || !requestedClientId) return
    writeWorkingClient(workingClientWorkspaceId, user?.id, requestedClientId)
    setWorkingClientId(requestedClientId)
  }, [currentSegmentReadsClient, requestedClientId, user?.id, workingClientWorkspaceId])

  // A client that has since been paused or churned drops out of the list, and
  // links should stop carrying them the moment that is known.
  useEffect(() => {
    if (!workingClientId || !clientsQuery.isSuccess) return
    // Except while the page on screen is showing that client by address.
    if (headerDrivesAddress && requestedClientId === workingClientId) return
    if (workingClients.some((client) => client.id.toLowerCase() === workingClientId)) return
    writeWorkingClient(workingClientWorkspaceId, user?.id, null)
    setWorkingClientId(null)
  }, [clientsQuery.isSuccess, headerDrivesAddress, requestedClientId, user?.id, workingClientId, workingClientWorkspaceId, workingClients])

  /*
   * On a page that filters by the address, the header is that page's client
   * filter: choosing here rewrites ?client=, and an address with no client
   * (cleared on the page, or a plain link) reads as All clients up here too,
   * so the two never disagree about what is on screen.
   */
  useEffect(() => {
    if (!headerDrivesAddress || requestedClientId || !workingClientId) return
    writeWorkingClient(workingClientWorkspaceId, user?.id, null)
    setWorkingClientId(null)
  }, [headerDrivesAddress, requestedClientId, user?.id, workingClientId, workingClientWorkspaceId])

  const handleWorkingClientChange = (value: string) => {
    const next = value === ALL_CLIENTS ? null : normalizeWorkingClientId(value)
    writeWorkingClient(workingClientWorkspaceId, user?.id, next)
    setWorkingClientId(next)
    if (!headerDrivesAddress) return
    if (clientInPath) {
      // Another client's campaign, or back to the list; the open page's tabs
      // and filters belong to the client it was showing.
      navigate(next ? `${clientInPathHref}/${next}` : clientInPathHref)
      return
    }
    const params = new URLSearchParams(location.search)
    if (next) params.set('client', next)
    else params.delete('client')
    // A linked show belongs to the client it was opened under.
    params.delete('podcast')
    const search = params.toString()
    navigate({ pathname: location.pathname, search: search ? `?${search}` : '' })
  }

  useLayoutEffect(() => {
    const navigation = navigationRef.current
    if (!navigation) return undefined

    navigation.scrollTop = readWorkspaceNavScroll(navScrollStorageKey)
    return () => saveWorkspaceNavScroll(navScrollStorageKey, navigation.scrollTop)
  }, [navScrollStorageKey])

  useEffect(() => {
    if (!canOrganizeNavigation) {
      setNavItems([...workspaceNavItems])
      setIsOrganizing(false)
      return
    }

    let savedOrder: unknown = null
    try {
      const currentStored = window.localStorage.getItem(navStorageKey)
      const legacyStored = currentStored ? null : window.localStorage.getItem(legacyNavStorageKey)
      const stored = currentStored || legacyStored
      savedOrder = stored ? JSON.parse(stored) : null
      if (!currentStored && legacyStored) {
        window.localStorage.setItem(navStorageKey, legacyStored)
      }
    } catch {
      // The default order remains available when browser storage is unavailable or invalid.
    }
    const nextItems = orderedWorkspaceNavItems(savedOrder)
    setNavItems((current) => (
      hasSameWorkspaceNavOrder(current, nextItems) ? current : nextItems
    ))
    setIsOrganizing(false)
  }, [canOrganizeNavigation, legacyNavStorageKey, navStorageKey])

  useEffect(() => {
    if (!canOrganizeNavigation) return

    const openNavigationOrganizer = () => {
      setIsOrganizing(true)
      setSidebarOpen(true)
    }
    window.addEventListener(WORKSPACE_NAV_ORGANIZE_EVENT, openNavigationOrganizer)
    return () => window.removeEventListener(WORKSPACE_NAV_ORGANIZE_EVENT, openNavigationOrganizer)
  }, [canOrganizeNavigation])

  const saveNavOrder = (items: WorkspaceNavItem[]) => {
    if (!canOrganizeNavigation) return
    try {
      window.localStorage.setItem(navStorageKey, JSON.stringify(items.map((item) => item.id)))
    } catch {
      // The reordered navigation remains usable in this tab when storage is unavailable.
    }
  }

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!canOrganizeNavigation || !over || active.id === over.id) return
    setNavItems((current) => {
      const oldIndex = current.findIndex((item) => item.id === active.id)
      const newIndex = current.findIndex((item) => item.id === over.id)
      if (oldIndex < 0 || newIndex < 0) return current
      const reordered = arrayMove(current, oldIndex, newIndex)
      saveNavOrder(reordered)
      return reordered
    })
  }

  const handleResetNavOrder = () => {
    if (!canOrganizeNavigation) return
    setNavItems([...workspaceNavItems])
    try {
      window.localStorage.removeItem(navStorageKey)
    } catch {
      // The default order still applies in this tab when storage is unavailable.
    }
    toast.success('Sidebar order reset.')
  }

  const handleSidebarNavigate = () => {
    if (navigationRef.current) {
      saveWorkspaceNavScroll(navScrollStorageKey, navigationRef.current.scrollTop)
    }
    setSidebarOpen(false)
  }

  const showNavGroups = isDefaultNavOrder && !isOrganizing

  const renderNavItem = (item: WorkspaceNavItem) => {
    const isSettings = item.id === 'settings'
    const isBilling = item.id === 'billing'
    const itemEnabled = isSettings || isBilling ? managesWorkspace : item.enabled

    return (
      <SortableWorkspaceNavItem
        key={item.id}
        item={item}
        href={clientScopedHref(baseHref, item.segment, workingClientId)}
        isActive={item === activeNavItem}
        isEnabled={itemEnabled}
        isOrganizing={isOrganizing}
        restrictedLabel={isSettings || isBilling ? 'Owner/Admin' : 'Soon'}
        onNavigate={handleSidebarNavigate}
      />
    )
  }

  const handleSignOut = async () => {
    try {
      await signOut()
      navigate('/login', { replace: true })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to sign out.')
    }
  }

  return (
    // Its own provider, so the shell's tooltips do not depend on where it is mounted.
    <TooltipProvider delayDuration={200}>
    <div data-testid="workspace-layout" className="min-h-screen max-w-full overflow-x-clip bg-background">
      {sidebarOpen && (
        <button
          type="button"
          aria-label="Close workspace navigation"
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Closed on a small screen, the drawer is invisible as well as off
          screen, so its links leave the tab order and the accessibility tree.
          Visibility transitions with the slide, so it hides once the slide ends. */}
      <aside
        id="workspace-sidebar"
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-64 transform border-r border-border bg-card transition-[transform,visibility] duration-200 ease-in-out lg:visible lg:translate-x-0',
          sidebarOpen ? 'visible translate-x-0' : 'invisible -translate-x-full',
        )}
      >
        <div className="flex h-full flex-col">
          <div className="flex h-16 items-center gap-3 border-b border-border px-4">
            <WorkspaceBrandLogo
              logoUrl={logoUrl}
              workspaceName={workspaceName}
              workspaceInitials={workspaceInitials}
              placement="sidebar"
            />
            {/* Not a heading: every page has its own h1, and this name repeats
                on all of them. */}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold tracking-tight">{workspaceName}</p>
              {workspaceSubtitle && (
                <p className="truncate text-xs font-medium text-muted-foreground">{workspaceSubtitle}</p>
              )}
            </div>
            <Button
              ref={sidebarCloseRef}
              variant="ghost"
              size="icon"
              className="shrink-0 lg:hidden"
              onClick={() => setSidebarOpen(false)}
              aria-label="Close workspace navigation"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          {adminControlsInDrawer && (
            <div className="space-y-2 border-b border-border px-3 py-3">
              <WorkspaceSwitcher />
              <div className="grid gap-2">
                <Button variant="outline" size="sm" className="justify-start" asChild>
                  <Link to="/app/manage-workspaces" onClick={handleSidebarNavigate}>
                    <Building2 className="h-4 w-4" />Workspaces
                    {waitingJoinRequests > 0 && (
                      <span className="ml-auto rounded-full bg-red-600 px-1.5 text-[11px] font-semibold leading-4 text-white">
                        <span aria-hidden="true">{waitingJoinRequests > 9 ? '9+' : waitingJoinRequests}</span>
                        <span className="sr-only">, {describeWaitingJoinRequests(waitingJoinRequests)}</span>
                      </span>
                    )}
                  </Link>
                </Button>
                <Button variant="outline" size="sm" className="justify-start" asChild>
                  <Link to="/app/platform/billing" onClick={handleSidebarNavigate}>
                    <ShieldCheck className="h-4 w-4" />Billing admin
                  </Link>
                </Button>
              </div>
            </div>
          )}

          <nav
            ref={navigationRef}
            aria-label="Workspace navigation"
            className="flex-1 overflow-y-auto overscroll-contain px-3 py-4 [scrollbar-gutter:stable]"
            onScroll={(event) => saveWorkspaceNavScroll(navScrollStorageKey, event.currentTarget.scrollTop)}
          >
            {!showNavGroups && (
            <div className="mb-2 flex items-center justify-between gap-2 px-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Navigation</p>
              {canOrganizeNavigation && isOrganizing && (
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    disabled={isDefaultNavOrder}
                    onClick={handleResetNavOrder}
                  >
                    Reset
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => setIsOrganizing(false)}
                  >
                    Done
                  </Button>
                </div>
              )}
            </div>
            )}
            {isOrganizing && (
              <p className="mb-2 px-1 text-xs text-muted-foreground">Drag pages into your preferred order. Changes save automatically.</p>
            )}
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={visibleNavItems.map((item) => item.id)} strategy={verticalListSortingStrategy}>
                {showNavGroups ? (
                  <div className="space-y-4">
                    {groupWorkspaceNavItems(visibleNavItems).map((group) => (
                      <div key={group.label}>
                        <p id={`workspace-nav-group-${group.label.toLowerCase()}`} className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{group.label}</p>
                        <ul aria-labelledby={`workspace-nav-group-${group.label.toLowerCase()}`} className="space-y-0.5">
                          {group.items.map(renderNavItem)}
                        </ul>
                      </div>
                    ))}
                  </div>
                ) : (
                  <ul className="space-y-1">
                    {visibleNavItems.map(renderNavItem)}
                  </ul>
                )}
              </SortableContext>
            </DndContext>
          </nav>

          <div className="flex items-center gap-1 border-t border-border p-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label={`Account menu: ${[viewerName, viewerEmail, viewerRole].filter(Boolean).join(', ')}`}
                  className="flex min-w-0 flex-1 items-center gap-3 rounded-lg p-1.5 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Avatar className="h-9 w-9">
                    <ShellAvatarImage
                      src={viewerAvatarUrl}
                      alt={viewerName ? `${viewerName} profile picture` : 'Profile picture'}
                      className="object-cover"
                      fallback={(
                        <AvatarFallback>
                          {viewerInitials || <User className="h-5 w-5" />}
                        </AvatarFallback>
                      )}
                    />
                  </Avatar>
                  <span className="min-w-0 flex-1">
                    <span className="block whitespace-nowrap text-sm font-medium">{viewerFirstName}</span>
                    <span className="block truncate text-xs text-muted-foreground">{viewerEmail}</span>
                    {viewerRole && <Badge variant="outline" className="mt-1 px-1.5 py-0 text-[10px] capitalize">{viewerRole}</Badge>}
                  </span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start" className="w-56">
                <DropdownMenuItem onSelect={() => void handleSignOut()}>
                  <LogOut className="mr-2 h-4 w-4" />Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {/* Reordering is a once-a-quarter thing, so it lives down here
                with the other housekeeping instead of above the nav. */}
            {canOrganizeNavigation && !isOrganizing && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
                    onClick={() => setIsOrganizing(true)}
                    aria-label="Reorder"
                  >
                    <GripVertical className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Reorder sidebar</TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>
      </aside>

      <div className="min-w-0 lg:pl-64">
        <header className="sticky top-0 z-30 flex h-20 items-center gap-3 border-b border-border bg-card px-4 sm:px-6">
          <Button
            ref={sidebarTriggerRef}
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(true)}
            aria-controls="workspace-sidebar"
            aria-expanded={sidebarOpen}
            aria-label="Open workspace navigation"
            className="lg:hidden"
          >
            <Menu className="h-5 w-5" />
          </Button>
          {/* The page, not the workspace again: the workspace is named in the
              sidebar and, for a platform admin, in the switcher on the right,
              so the header said "My Workspace" twice. */}
          {/* A page name is short, so it keeps its width; only a long
              workspace name, the fallback, truncates. */}
          <div className={activeNavItem ? 'hidden shrink-0 lg:block' : 'hidden min-w-0 lg:block'}>
            <p className="truncate text-sm font-semibold">{headerTitle}</p>
          </div>
          <div className="min-w-0 flex-1 lg:hidden">
            <p className="truncate text-sm font-semibold">{headerTitle}</p>
          </div>
          {workingClientWorkspaceId && !onPlatformPage && !onSettingsPage && (
            <div className="flex min-w-0 shrink items-center gap-2 lg:ml-4">
              <span className="hidden whitespace-nowrap text-xs font-medium text-muted-foreground md:inline">Working on</span>
              <Select value={workingClientId ?? ALL_CLIENTS} onValueChange={handleWorkingClientChange}>
                <SelectTrigger aria-label="Working client" className="h-9 w-36 sm:w-52">
                  {/* The name is known once the list loads; before that the
                      trigger says so rather than sitting blank. */}
                  <SelectValue placeholder="All clients">
                    {workingClientId ? workingClient?.name || 'Selected client' : 'All clients'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel className="text-xs font-medium text-muted-foreground">Active clients only</SelectLabel>
                    <SelectItem value={ALL_CLIENTS}>All clients</SelectItem>
                    {workingClients.map((client) => (
                      <SelectItem key={client.id} value={client.id.toLowerCase()}>{client.name}</SelectItem>
                    ))}
                  </SelectGroup>
                  {inactiveClientCount > 0 && (
                    <>
                      <SelectSeparator />
                      <p className="px-2 py-1.5 text-xs text-muted-foreground">
                        {inactiveClientCount === 1
                          ? '1 paused or churned client is not listed.'
                          : `${inactiveClientCount} paused or churned clients are not listed.`}
                        {' '}Set a client to Active on the Clients page to work on it.
                      </p>
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="ml-auto flex min-w-0 items-center justify-end gap-2">
            {/* Next to the workspace it belongs to. A platform admin viewing a
                tenant sees it too — supporting an agency means knowing whether
                they are about to run out — but it leads to the platform billing
                screen, because acting on somebody else's balance happens there
                and not on their own billing page. The tenant rides along in
                the address so the top-up lands on the agency whose number was
                just clicked. */}
            {onPlatformPage && (
              <Badge variant="outline" className="h-9 gap-1.5 px-3"><ShieldCheck className="h-4 w-4" />Platform admin</Badge>
            )}
            {isPlatformAdmin && !adminControlsInDrawer && (
              // Relative, so the waiting-count bubble can sit on the corner.
              <div className="relative">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline" size="sm" asChild>
                      <Link to="/app/manage-workspaces" aria-label="Manage workspaces">
                        <Building2 className="h-4 w-4 xl:mr-2" /><span className="hidden xl:inline">Manage workspaces</span>
                      </Link>
                    </Button>
                  </TooltipTrigger>
                  {/* Shown at every width: the label says where the button goes,
                      but only the tooltip says what the number on it counts. */}
                  <TooltipContent>
                    {describeWaitingJoinRequests(waitingJoinRequests) ?? 'Manage workspaces and join requests'}
                  </TooltipContent>
                </Tooltip>
                <JoinRequestsBadge enabled={isPlatformAdmin} />
              </div>
            )}
            {/* Plan pricing, credit grants and monthly allowances were only
                reachable through a link inside the platform owner's own
                billing page — so the tools for every other workspace lived
                behind one workspace's balance. */}
            {isPlatformAdmin && !adminControlsInDrawer && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="sm" asChild>
                    <Link to="/app/platform/billing" aria-label="Billing administration">
                      <ShieldCheck className="h-4 w-4 xl:mr-2" /><span className="hidden xl:inline">Billing admin</span>
                    </Link>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Billing administration: plans and subscriptions</TooltipContent>
              </Tooltip>
            )}
            {isPlatformAdmin && !adminControlsInDrawer && (
              <div className="w-60 min-w-0 lg:w-72">
                <WorkspaceSwitcher />
              </div>
            )}
          </div>
        </header>

        {/* Above the page rather than inside billing: the person who needs to
            know is mid-task somewhere else entirely. Platform admins viewing a
            tenant are excluded — it is not their balance to act on. */}


        {/* A tenant's shell looks exactly like the admin's own, which is the
            point of it, and also how an admin edits the wrong agency. This
            stays on screen for as long as they are inside somebody else's. */}
        {platformWorkspace && (
          <div
            role="status"
            data-testid="platform-tenant-strip"
            className="sticky top-20 z-20 flex flex-wrap items-center gap-x-3 gap-y-1 border-b-2 border-amber-500 bg-amber-200 px-4 py-2.5 text-sm text-amber-950 shadow-sm sm:px-6"
          >
            <span className="inline-flex items-start gap-2">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                You are viewing <strong className="font-semibold">{platformWorkspace.workspaceName}</strong> as platform admin.
                {' '}<strong className="font-bold">Changes are live</strong> for their team.
              </span>
            </span>
            <Link to="/app/manage-workspaces" className="font-semibold underline underline-offset-4 hover:text-black">
              Back to Manage workspaces
            </Link>
          </div>
        )}

        <main className="min-w-0 p-4 sm:p-6">{children}</main>
      </div>
    </div>
    </TooltipProvider>
  )
}
