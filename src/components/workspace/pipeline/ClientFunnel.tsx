import { TrendingDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { bottleneckIndex, funnelStages, type ClientRollup } from './pipelineRollup'

/** The client's podcasts by stage, with the biggest drop-off called out. */
export const ClientFunnel = ({ rollup }: { rollup: ClientRollup }) => {
  const stages = funnelStages(rollup)
  const bottleneck = bottleneckIndex(stages)
  return (
    <ol aria-label={`${rollup.client.name} pipeline by stage`} className="flex overflow-x-auto rounded-lg border bg-muted/30">
      {stages.map((stage, index) => {
        const isBottleneck = index === bottleneck
        return (
          <li
            key={stage.label}
            className={cn(
              'min-w-[64px] flex-1 border-l px-2 py-1.5 first:border-l-0',
              isBottleneck && 'bg-amber-50 text-amber-900',
            )}
            title={isBottleneck ? `Biggest drop-off: ${stages[index - 1].count} ${stages[index - 1].label.toLowerCase()} → ${stage.count} ${stage.label.toLowerCase()}` : undefined}
          >
            <span className={cn('flex items-center gap-1 whitespace-nowrap text-[11px]', isBottleneck ? 'font-medium' : 'text-muted-foreground')}>
              {stage.label}
              {isBottleneck && <TrendingDown className="h-3 w-3" aria-hidden="true" />}
            </span>
            <span className="block text-sm font-semibold leading-5">
              {stage.count.toLocaleString()}
              {isBottleneck && <span className="sr-only"> (biggest drop-off)</span>}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
