export const MY_WORKSPACE_BASE_HREF = '/app'

export type WorkspaceModule =
  | 'onboarding'
  | 'podcast-finder'
  | 'podcast-database'
  | 'client-podcast-system'
  | 'prospects'
  | 'clients'
  | 'client-campaigns'
  | 'relationships'
  | 'master-inbox'
  | 'mailboxes'
  | 'university'
  | 'settings'

const WORKSPACE_MODULES = new Set<WorkspaceModule>([
  'onboarding',
  'podcast-finder',
  'podcast-database',
  'client-podcast-system',
  'prospects',
  'clients',
  'client-campaigns',
  'relationships',
  'master-inbox',
  'mailboxes',
  'university',
  'settings',
])

export function selectedWorkspaceBaseHref(workspaceId: string): string {
  return `${MY_WORKSPACE_BASE_HREF}/workspaces/${workspaceId.toLowerCase()}`
}

export function workspaceModuleHref(baseHref: string, module: WorkspaceModule): string {
  return `${baseHref}/${module}`
}

/** The client's Shortlist tab, where the pitch flow starts and returns to. */
export function clientShortlistHref(baseHref: string, clientId: string): string {
  return `${baseHref}/clients/${encodeURIComponent(clientId)}?tab=shortlist`
}

/**
 * The pitch page for one shortlisted podcast. Addressed by the shortlist row,
 * so the same podcast on two clients is two pages, each with its own draft.
 */
export function clientPitchHref(baseHref: string, clientId: string, shortlistPodcastId: string): string {
  return `${baseHref}/clients/${encodeURIComponent(clientId)}/podcasts/${encodeURIComponent(shortlistPodcastId)}/pitch`
}

export function workspaceModuleFromPath(pathname: string): WorkspaceModule {
  if (pathname.includes('/podcast-finder')) return 'podcast-finder'
  if (pathname.includes('/prospect-dashboards')) return 'prospects'
  if (pathname.includes('/client-campaigns')) return 'client-campaigns'
  if (pathname.includes('/settings')) return 'settings'

  const segments = pathname.split('/').filter(Boolean)
  const candidate = segments.at(-1)
  return candidate && WORKSPACE_MODULES.has(candidate as WorkspaceModule)
    ? candidate as WorkspaceModule
    : 'clients'
}
