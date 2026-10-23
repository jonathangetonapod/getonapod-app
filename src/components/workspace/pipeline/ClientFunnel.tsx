import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { funnelStages, type ClientRollup } from './pipelineRollup'

/*
 * The client's podcasts by stage, each count a way into that stage's list.
 * These are where podcasts sit now, with no history behind them, so nothing
 * here claims a trend.
 */
export const ClientFunnel = ({ rollup, baseHref }: { rollup: ClientRollup; baseHref: string }) => (
  <ol aria-label={`${rollup.client.name} pipeline by stage`} className="flex overflow-x-auto rounded-lg border bg-muted/30">
    {funnelStages(rollup, baseHref).map((stage) => (
      <li key={stage.key} className="min-w-[64px] flex-1 border-l first:border-l-0">
        <Link
          to={stage.href}
          aria-label={`${stage.count.toLocaleString()} ${stage.label.toLowerCase()} for ${rollup.client.name}`}
          className="block px-2 py-1.5 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        >
          <span className="block whitespace-nowrap text-[11px] text-muted-foreground">{stage.label}</span>
          <span className={cn('block text-sm font-semibold leading-5', stage.count === 0 && 'text-muted-foreground')}>
            {stage.count.toLocaleString()}
          </span>
        </Link>
      </li>
    ))}
  </ol>
)
