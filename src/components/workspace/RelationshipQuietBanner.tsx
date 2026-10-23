import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { describeQuiet } from '@/lib/relationshipAttention'
import { relationshipTitle } from '@/lib/relationshipLabels'
import type { HostRelationshipSummary } from '@/services/hostRelationships'

const SHOWN = 6

interface RelationshipQuietBannerProps {
  /** Rows already filtered to conversations going quiet, longest silence first. */
  rows: HostRelationshipSummary[]
  replyHref: (row: HostRelationshipSummary) => string | null
  onOpen: (podcastId: string) => void
  now?: Date
}

/**
 * Live conversations going quiet, each one reply away from saved. Renders
 * nothing when none qualify: an empty warning is still a warning.
 */
export const RelationshipQuietBanner = ({ rows, replyHref, onOpen, now = new Date() }: RelationshipQuietBannerProps) => {
  if (rows.length === 0) return null
  return (
    <section aria-labelledby="quiet-conversations-title" className="rounded-xl border border-amber-200 bg-amber-50 p-4">
      <h2 id="quiet-conversations-title" className="text-sm font-semibold text-amber-900">
        {rows.length === 1 ? '1 conversation going quiet' : `${rows.length} conversations going quiet`}
      </h2>
      <ul className="mt-2.5 space-y-1.5">
        {rows.slice(0, SHOWN).map((row) => {
          const { title } = relationshipTitle(row)
          const href = replyHref(row)
          return (
            <li key={row.podcast_id} className="flex items-center justify-between gap-3">
              <button
                type="button"
                className="min-w-0 truncate text-left text-sm text-amber-900 hover:underline"
                onClick={() => onOpen(row.podcast_id)}
              >
                {title}
                <span className="ml-2 tabular-nums text-xs text-amber-700">{describeQuiet(row.last_contacted_at, now)}</span>
              </button>
              {href
                ? (
                  <Button asChild size="sm" variant="outline" className="h-7 shrink-0 border-amber-300 bg-white">
                    <Link to={href} aria-label={`Reply to ${title}`}>Reply</Link>
                  </Button>
                )
                : (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 shrink-0 border-amber-300 bg-white"
                    aria-label={`Reply to ${title}`}
                    onClick={() => onOpen(row.podcast_id)}
                  >
                    Reply
                  </Button>
                )}
            </li>
          )
        })}
      </ul>
      {rows.length > SHOWN && (
        <p className="mt-2 text-xs text-amber-800">and {rows.length - SHOWN} more under Needs attention</p>
      )}
    </section>
  )
}
