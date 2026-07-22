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
import { listAdminWorkspaces } from '@/services/adminWorkspaces'

interface WorkspaceSwitcherProps {
  presentation?: 'sidebar' | 'toolbar'
}

export const WorkspaceSwitcher = ({ presentation = 'sidebar' }: WorkspaceSwitcherProps) => {
  const { isPlatformAdmin, user } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const routeMatch = matchPath('/admin/workspaces/:workspaceId/*', location.pathname)
  const selectedId = (routeMatch?.params.workspaceId || '').toLowerCase()
  const selectedModule = location.pathname.endsWith('/workspace-users')
    ? 'workspace-users'
    : location.pathname.endsWith('/guest-resources')
      ? 'guest-resources'
      : 'clients'

  const workspacesQuery = useQuery({
    queryKey: ['platform', user?.id || 'unknown', 'workspaces'],
    queryFn: listAdminWorkspaces,
    enabled: isPlatformAdmin,
    staleTime: 30_000,
  })

  if (!isPlatformAdmin) return null

  const workspaces = workspacesQuery.data || []
  const selected = workspaces.find((workspace) => workspace.id === selectedId)

  return (
    <div className={cn(presentation === 'sidebar' ? 'border-b border-border p-3' : 'w-full sm:w-72')}>
      {presentation === 'sidebar' && (
        <p className="mb-2 px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Switch workspace
        </p>
      )}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-label="Select a workspace"
            className="w-full justify-between"
            disabled={workspacesQuery.isLoading || Boolean(workspacesQuery.error)}
          >
            <span className="flex min-w-0 items-center gap-2">
              {workspacesQuery.isLoading
                ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                : <Building2 className="h-4 w-4 shrink-0" />}
              <span className="truncate">
                {workspacesQuery.isLoading
                  ? 'Loading workspaces…'
                  : workspacesQuery.error
                    ? 'Workspaces unavailable'
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
              <CommandEmpty>No available client workspace found.</CommandEmpty>
              <CommandGroup>
                {workspaces.map((workspace) => (
                  <CommandItem
                    key={workspace.id}
                    value={`${workspace.name} ${workspace.slug}`}
                    onSelect={() => {
                      setOpen(false)
                      navigate(`/admin/workspaces/${workspace.id}/${selectedModule}`)
                    }}
                  >
                    <Check className={cn('mr-2 h-4 w-4', selectedId === workspace.id ? 'opacity-100' : 'opacity-0')} />
                    <span className="min-w-0">
                      <span className="block truncate">{workspace.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">{workspace.slug}</span>
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
          className={cn('w-full', presentation === 'sidebar' && 'mt-2')}
          onClick={() => void workspacesQuery.refetch()}
        >
          Try again
        </Button>
      )}
    </div>
  )
}
