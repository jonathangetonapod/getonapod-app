import { useQuery } from '@tanstack/react-query'

import { countWaitingJoinRequests } from '@/services/accessRequests'

/** Slow enough to be free, quick enough that you learn within the hour. */
const CHECK_EVERY_MS = 120_000

/** Join requests still waiting, polled for platform admins only. */
export function useWaitingJoinRequests(enabled: boolean): number {
  const waitingQuery = useQuery({
    queryKey: ['join-requests-waiting'],
    queryFn: countWaitingJoinRequests,
    // Platform admins only; nobody else can read the table anyway, and asking
    // would be a request per page load that always comes back empty.
    enabled,
    retry: false,
    refetchInterval: CHECK_EVERY_MS,
    refetchOnWindowFocus: true,
  })

  return enabled ? waitingQuery.data ?? 0 : 0
}

/** "2 join requests waiting", for the tooltip on the button the badge sits on. */
export function describeWaitingJoinRequests(waiting: number): string | null {
  if (waiting < 1) return null
  return waiting === 1 ? '1 join request waiting' : `${waiting} join requests waiting`
}
