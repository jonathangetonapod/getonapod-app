import { Database, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ClientShortlistEpisodeMetadata } from '@/services/clientShortlist'
import { researchSourceSummary } from '@/lib/researchSource'

export const ResearchSourceNote = ({
  metadata,
  loading,
  onRefresh,
  refreshing,
}: {
  metadata: ClientShortlistEpisodeMetadata | null
  loading: boolean
  onRefresh?: () => void
  refreshing: boolean
}) => {
  const summary = metadata ? researchSourceSummary(metadata) : null
  if (!summary) {
    if (!loading) return null
    return <p className="mt-4 text-xs text-muted-foreground" role="status">Checking the saved Podscan data…</p>
  }
  return (
    <div className="mt-4 flex flex-col gap-2 rounded-xl border bg-muted/30 px-4 py-3 text-xs leading-5 text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
      <p className="flex gap-2">
        <Database className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span><span className="font-medium text-foreground">{summary.saved}</span> {summary.reuse}</span>
      </p>
      {onRefresh && (
        <Button type="button" variant="ghost" size="sm" className="h-8 shrink-0 self-start sm:self-auto" disabled={refreshing} onClick={onRefresh}>
          <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />{refreshing ? 'Refreshing…' : 'Refresh now'}
        </Button>
      )}
    </div>
  )
}
