import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Building2, Check, ChevronsUpDown, Loader2 } from 'lucide-react'
import { matchPath, useLocation, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'
import {
  MY_WORKSPACE_BASE_HREF,
  selectedWorkspaceBaseHref,
  workspaceModuleFromPath,
  workspaceModuleHref,
} from '@/lib/workspaceRoutes'
import { listPodcastResearchWorkspaces } from '@/services/adminWorkspaces'

export const WorkspaceSwitcher = () => {
  const { isPlatformAdmin, user, workspace } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const routeMatch = matchPath('/app/workspaces/:workspaceId/*', location.pathname)
  const selectedId = (
    routeMatch?.params.workspaceId
    || workspace?.id
    || ''
  ).toLowerCase()
  const selectedModule = workspaceModuleFromPath(location.pathname)

  const workspacesQuery = useQuery({
    queryKey: ['platform', user?.id || 'unknown', 'switchable-workspaces', 'v3'],
    queryFn: listPodcastResearchWorkspaces,
    enabled: isPlatformAdmin,
    staleTime: 30_000,
  })

  if (!isPlatformAdmin) return null

  const workspaces = workspacesQuery.data || []
  const selected = workspaces.find((workspace) => workspace.id === selectedId)

  return (
    <div
      data-testid="workspace-switcher"
      className="w-full min-w-0 max-w-full"
    >
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-label="Select a workspace"
            className="w-full min-w-0 justify-between overflow-hidden"
            disabled={workspacesQuery.isLoading || Boolean(workspacesQuery.error)}
          >
            <span className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
              {workspacesQuery.isLoading
                ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                : <Building2 className="h-4 w-4 shrink-0" />}
              <span className="truncate">
                {workspacesQuery.isLoading
                  ? 'Loading workspaces…'
                  : workspacesQuery.error
                    ? 'Workspaces unavailable'
                    : selected?.is_default
                      ? 'My Workspace'
                      : selected?.name || 'Select workspace…'}
              </span>
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command>
            <CommandInput placeholder="Search workspaces…" />
            <CommandList>
              <CommandEmpty>No available workspace found.</CommandEmpty>
              <CommandGroup>
                {workspaces.map((workspace) => (
                  <CommandItem
                    key={workspace.id}
                    value={`${workspace.is_default ? 'My Workspace' : workspace.name} ${workspace.name} ${workspace.slug}`}
                    onSelect={() => {
                      setOpen(false)
                      const baseHref = workspace.is_default
                        ? MY_WORKSPACE_BASE_HREF
                        : selectedWorkspaceBaseHref(workspace.id)
                      navigate(workspaceModuleHref(baseHref, selectedModule))
                    }}
                  >
                    <Check className={cn('mr-2 h-4 w-4', selectedId === workspace.id ? 'opacity-100' : 'opacity-0')} />
                    <span className="min-w-0 flex-1 overflow-hidden">
                      <span className="block truncate">
                        {workspace.is_default ? 'My Workspace' : workspace.name}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {workspace.is_default ? workspace.name : workspace.slug}
                      </span>
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {workspacesQuery.error && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-full"
          onClick={() => void workspacesQuery.refetch()}
        >
          Try again
        </Button>
      )}
    </div>
  )
}
