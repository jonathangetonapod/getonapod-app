import { Link } from 'react-router-dom'
import { UserCheck } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import { plural } from '@/lib/plural'
import {
  engagementText,
  MIN_SHORTLIST,
  missingItems,
  outcomeClass,
  outcomeLabel,
  prospectStage,
  readinessPercent,
  relativeTime,
  stageClass,
  stageLabel,
} from '@/lib/prospectStage'
import type { WorkspaceProspect } from '@/services/prospectDashboards'

/** Name, stage, engagement, updated, readiness: the table and its header share these columns. */
export const PROSPECT_ROW_COLUMNS = 'md:grid md:grid-cols-[minmax(0,1.5fr)_7rem_6rem_minmax(0,1.2fr)_5rem_minmax(0,1fr)] md:items-center md:gap-3'

/** What the readiness column says for a prospect that is not live. */
function readinessText(prospect: WorkspaceProspect): string {
  const visible = prospect.readiness.visible_count
  // A partial shortlist is said as its count ("3 matches"), not as missing.
  const missing = missingItems(prospect).filter((item) => !(item === 'shortlist' && visible > 0))
  const parts: string[] = []
  if (missing.length > 0) parts.push(`Missing ${missing.join(', ')}`)
  if (visible > 0 && visible < MIN_SHORTLIST) parts.push(plural(visible, 'match', 'matches'))
  return parts.join(' · ') || 'Ready to publish'
}

/** Building and failed builds are what an operator needs to know about a non-live prospect first. */
function activityText(prospect: WorkspaceProspect): { text: string; tone?: 'warning' | 'error' } {
  if (prospectStage(prospect) === 'live') return { text: engagementText(prospect) }
  if (['matching', 'analyzing', 'researching'].includes(prospect.lifecycle_status)) return { text: 'Building shortlist' }
  if (prospect.lifecycle_status === 'failed') return { text: 'Build failed', tone: 'error' }
  return { text: 'Not live' }
}

export const ProspectRow = ({
  prospect,
  href,
  compact,
  selected,
  checked,
  onCheckedChange,
}: {
  prospect: WorkspaceProspect
  href: string
  compact: boolean
  selected: boolean
  /** Undefined hides the checkbox. */
  checked?: boolean
  onCheckedChange?: (checked: boolean) => void
}) => {
  const stage = prospectStage(prospect)
  const activity = activityText(prospect)
  const percent = readinessPercent(prospect)
  const company = [prospect.prospect_title, prospect.prospect_company].filter(Boolean).join(' · ')
  const pill = <Badge variant="outline" className={cn('shrink-0 whitespace-nowrap font-normal', stageClass(stage))}>{stageLabel(stage)}</Badge>
  const outcome = prospect.outcome
    ? <Badge variant="outline" className={cn('shrink-0 whitespace-nowrap font-normal', outcomeClass(prospect.outcome))}>{outcomeLabel(prospect.outcome)}</Badge>
    : null
  const pending = stage === 'live' && prospect.pending_review_at
    ? <span className="text-amber-700"> · Edits to review</span>
    : null

  if (compact) {
    return (
      <Link
        to={href}
        aria-current={selected ? 'page' : undefined}
        className={cn(
          'block rounded-lg border px-3 py-2 transition-colors',
          selected ? 'border-primary bg-primary/[0.04] ring-1 ring-primary/20' : 'border-transparent hover:bg-muted/40',
        )}
      >
        <span className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-medium">{prospect.prospect_name}</span>
          <span className="flex shrink-0 gap-1">{outcome}{pill}</span>
        </span>
        <span className={cn('mt-0.5 block truncate text-xs text-muted-foreground', activity.tone === 'error' && 'text-red-700')}>
          {stage === 'live' ? activity.text : readinessText(prospect)}{pending}
        </span>
      </Link>
    )
  }

  return (
    <div className={cn('flex items-start gap-3 border-b px-3 py-2.5 last:border-b-0 hover:bg-muted/30 md:items-center', selected && 'bg-primary/[0.04]')}>
      {checked !== undefined && (
        <Checkbox
          checked={checked}
          onCheckedChange={(value) => onCheckedChange?.(value === true)}
          aria-label={`Select ${prospect.prospect_name}`}
          className="mt-0.5 md:mt-0"
        />
      )}
      <Link to={href} className={cn('min-w-0 flex-1 text-sm', PROSPECT_ROW_COLUMNS)}>
        <span className="flex min-w-0 items-center gap-1.5">
          {/* The company gives way first; the name is what the row is for. */}
          <span className="max-w-full shrink-0 truncate font-medium">{prospect.prospect_name}</span>
          {company && <span className="hidden min-w-0 truncate text-muted-foreground sm:inline">· {company}</span>}
          {prospect.linked_client && (
            <UserCheck className="h-3.5 w-3.5 shrink-0 text-emerald-700" aria-label={`Became the client ${prospect.linked_client.name}`} />
          )}
        </span>
        <span className="mt-1 flex items-center gap-2 md:mt-0">
          {pill}
          <span className="md:hidden">{outcome}</span>
          <span className="text-xs text-muted-foreground md:hidden">{relativeTime(prospect.updated_at)}</span>
        </span>
        <span className="hidden md:block">{outcome}</span>
        <span className={cn('mt-1 block truncate text-muted-foreground md:mt-0', activity.tone === 'error' && 'text-red-700')}>
          {activity.text}{pending}
        </span>
        <span className="hidden text-muted-foreground md:block" title={new Date(prospect.updated_at).toLocaleString()}>
          {relativeTime(prospect.updated_at)}
        </span>
        <span className="mt-1 flex min-w-0 items-center gap-2 md:mt-0">
          {stage !== 'live' && (
            <>
              <span className="truncate text-muted-foreground">{readinessText(prospect)}</span>
              {stage === 'draft' && (
                <>
                  <Progress value={percent} className="hidden h-1 w-12 shrink-0 lg:block" aria-hidden="true" />
                  <span className="shrink-0 text-xs text-muted-foreground">{percent}%</span>
                </>
              )}
            </>
          )}
        </span>
      </Link>
    </div>
  )
}
