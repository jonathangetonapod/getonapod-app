import { Link } from 'react-router-dom'
import { History } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useRecentFinderScans } from '@/hooks/useRecentFinderScans'
import { creditsLabel } from '@/lib/creditCosts'

interface FinderRecentScansProps {
  workspaceId: string
  /** Null lists every client's scans. */
  clientId: string | null
  clientName: string | null
  /** The finder's own address, which a scan link adds ?client= and ?scan= to. */
  finderHref: string
  /** The scan already on screen, so its row does not offer to open itself. */
  openScanId: string | null
}

function scanDate(value: string): string {
  return new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export const FinderRecentScans = ({ workspaceId, clientId, clientName, finderHref, openScanId }: FinderRecentScansProps) => {
  const scansQuery = useRecentFinderScans(workspaceId, clientId)
  const scans = scansQuery.data ?? []

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <History aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
          Recent scans
        </CardTitle>
        <CardDescription>{clientName ? `The last five for ${clientName}.` : 'The last five across all clients.'}</CardDescription>
      </CardHeader>
      <CardContent>
        {scansQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading recent scans…</p>
        ) : scansQuery.isError ? (
          <p className="flex flex-wrap items-center gap-2 text-sm text-destructive">
            Recent scans could not be loaded.
            <button type="button" className="font-medium underline underline-offset-2" onClick={() => void scansQuery.refetch()}>Try again</button>
          </p>
        ) : scans.length === 0 ? (
          <p className="text-sm text-muted-foreground">No scans yet. Pick a client and run your first one.</p>
        ) : (
          <ul aria-label="Recent scans" className="divide-y divide-border/70">
            {scans.map((scan) => (
              <li key={scan.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {scan.client_name || 'Former client'}
                    <span className="font-normal text-muted-foreground"> · {scanDate(scan.created_at)}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {scan.match_count.toLocaleString()} {scan.match_count === 1 ? 'match' : 'matches'}
                    {' · '}
                    {scan.credits_used > 0 ? `${creditsLabel(scan.credits_used)} used` : 'Provider account usage'}
                  </p>
                </div>
                {scan.id === openScanId ? (
                  <span className="text-xs font-medium text-foreground/75">Showing</span>
                ) : (
                  <Button asChild size="sm" variant="outline" className="w-fit">
                    <Link
                      to={`${finderHref}?client=${encodeURIComponent(scan.client_id)}&scan=${encodeURIComponent(scan.id)}`}
                      aria-label={`View results of the ${scan.client_name || 'client'} scan from ${scanDate(scan.created_at)}`}
                    >
                      View results
                    </Link>
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
