import type { LucideIcon } from 'lucide-react'

interface PortalStatTileProps {
  label: string
  value: string | number
  icon: LucideIcon
  hint?: string
}

/**
 * One number, with what it counts. The dashboard and the outreach page each
 * drew their own tile, in two layouts; a client moving between the tabs should
 * see the same figure in the same shape.
 */
export const PortalStatTile = ({ label, value, icon: Icon, hint }: PortalStatTileProps) => (
  <div className="rounded-xl border bg-card p-4 shadow-sm sm:p-5">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight sm:text-3xl">{value}</p>
      </div>
      <span className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary min-[420px]:flex">
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
    </div>
    {hint && <p className="mt-2 text-xs text-muted-foreground">{hint}</p>}
  </div>
)
