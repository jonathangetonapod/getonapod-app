import { useQuery } from '@tanstack/react-query'
import { listFinderScans } from '@/services/finderScans'

export const finderScansQueryKey = (workspaceId: string, clientId: string | null) =>
  ['finder-scans', workspaceId, clientId || 'all'] as const

/** The five most recent Podcast Finder scans, for one client or the whole workspace. */
export function useRecentFinderScans(workspaceId: string, clientId: string | null) {
  return useQuery({
    queryKey: finderScansQueryKey(workspaceId, clientId),
    queryFn: () => listFinderScans(workspaceId, clientId),
    enabled: Boolean(workspaceId),
    retry: false,
    staleTime: 30_000,
  })
}
