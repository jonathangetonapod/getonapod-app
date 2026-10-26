import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Archive, CalendarPlus, CheckCircle2, ClipboardCheck, Clock3, Copy, ExternalLink, Info, Link2, Mail, MoreHorizontal, RefreshCw, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  EXTEND_WITHIN_DAYS,
  daysUntilExpiry,
  intakeLastActivity,
  intakeStatusLabels,
  relativeTime,
  type IntakeStatus,
} from '@/lib/intakeStatus'
import type { OnboardingInstanceSummary, OnboardingTemplate } from '@/services/workspaceOnboarding'

export type IntakeFilter = 'all' | IntakeStatus | 'archived'

const statusMeta: Record<IntakeStatus, { icon: typeof Clock3; tone: string; pill: string }> = {
  chasing: { icon: AlertTriangle, tone: 'text-amber-600', pill: 'border-amber-200 bg-amber-50 text-amber-800' },
  in_progress: { icon: Clock3, tone: 'text-violet-500', pill: 'border-violet-200 bg-violet-50 text-violet-700' },
  review: { icon: ClipboardCheck, tone: 'text-amber-500', pill: 'border-amber-200 bg-amber-50 text-amber-800' },
  approved: { icon: CheckCircle2, tone: 'text-emerald-500', pill: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  expired: { icon: Link2, tone: 'text-muted-foreground', pill: 'border-slate-200 bg-slate-50 text-slate-600' },
}

const STRIP_ORDER: IntakeStatus[] = ['chasing', 'in_progress', 'review', 'approved', 'expired']

interface StripProps {
  value: IntakeFilter
  onChange: (value: IntakeFilter) => void
  counts: Record<IntakeStatus, number> & { all: number; archived: number }
}

export const IntakeFilterStrip = ({ value, onChange, counts }: StripProps) => (
  <ToggleGroup
    type="single"
    value={value}
    // A single-select strip always has a selection; clicking the active pill
    // does not clear it.
    onValueChange={(next) => { if (next) onChange(next as IntakeFilter) }}
    aria-label="Filter intakes by status"
    className="flex-wrap justify-start gap-2"
  >
    {(['all', ...STRIP_ORDER, ...(counts.archived > 0 ? ['archived' as const] : [])] as IntakeFilter[]).map((key) => {
      const meta = key === 'all' || key === 'archived' ? null : statusMeta[key]
      const Icon = meta?.icon
      const label = key === 'all' ? 'All' : key === 'archived' ? 'Archived' : intakeStatusLabels[key]
      return (
        <ToggleGroupItem
          key={key}
          value={key}
          size="sm"
          className="h-8 rounded-full border px-3 text-sm data-[state=on]:border-primary data-[state=on]:bg-primary/10 data-[state=on]:text-foreground"
        >
          {Icon && <Icon className={`mr-1.5 hidden h-4 w-4 sm:inline ${meta.tone}`} aria-hidden="true" />}
          {label}<span className="ml-1.5 text-muted-foreground">{counts[key]}</span>
        </ToggleGroupItem>
      )
    })}
  </ToggleGroup>
)

export type IntakeRowAction = 'copy' | 'remind' | 'review' | 'extend' | 'preview' | 'rotate' | 'revoke' | 'archive' | 'purge'

interface TableProps {
  instances: OnboardingInstanceSummary[]
  statusById: Map<string, IntakeStatus>
  templates: OnboardingTemplate[]
  now: number
  canManage: boolean
  emailConfigured: boolean
  busy: boolean
  highlightId: string | null
  /** Rows reminded from this page, for the inline confirmation. */
  remindedIds: Set<string>
  workspaceBaseHref: string
  onAction: (action: IntakeRowAction, instance: OnboardingInstanceSummary) => void
}

function sectionCount(instance: OnboardingInstanceSummary, templates: OnboardingTemplate[]): number | null {
  const template = templates.find((candidate) => candidate.id === instance.template_id)
  // Only the version this link is pinned to says how many sections it has.
  if (!template?.published_definition || template.published_version !== instance.template_version) return null
  return template.published_definition.sections.length
}

function progressLabel(instance: OnboardingInstanceSummary, total: number | null): string {
  const done = instance.submitted_at && ['submitted', 'approved'].includes(instance.status)
    ? total ?? 0
    : instance.started_at ? instance.progress_section : 0
  if (total === null) return done ? `Section ${done + 1}` : 'Not started'
  return `${Math.min(done, total)}/${total} sections`
}

const RowIconAction = ({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={label} disabled={disabled} onClick={onClick}>{children}</Button>
    </TooltipTrigger>
    <TooltipContent>{label}</TooltipContent>
  </Tooltip>
)

const IntakeTable = ({ instances, statusById, templates, now, canManage, emailConfigured, busy, highlightId, remindedIds, workspaceBaseHref, onAction }: TableProps) => (
  <TooltipProvider delayDuration={200}>
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Client</TableHead>
            {/* Narrow screens keep who, what happened, status and actions;
                the form folds under the client and the rest drops out. */}
            <TableHead className="hidden xl:table-cell">Form</TableHead>
            <TableHead className="hidden md:table-cell">Sent</TableHead>
            <TableHead className="hidden sm:table-cell">
              <span className="inline-flex items-center gap-1">
                Last activity
                <Tooltip>
                  <TooltipTrigger asChild><button type="button" className="text-muted-foreground" aria-label="About last activity"><Info className="h-3.5 w-3.5" /></button></TooltipTrigger>
                  <TooltipContent>First view, last save, and completion are tracked from the private link.</TooltipContent>
                </Tooltip>
              </span>
            </TableHead>
            <TableHead className="hidden lg:table-cell">Progress</TableHead>
            <TableHead className="hidden sm:table-cell">Status</TableHead>
            <TableHead className="px-1 text-right sm:px-4">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>{instances.map((instance) => {
          const status = statusById.get(instance.id) ?? 'in_progress'
          const meta = statusMeta[status]
          const live = !instance.archived_at && ['invited', 'in_progress', 'changes_requested'].includes(instance.status)
          const linkLive = live && status !== 'expired'
          const expiresIn = daysUntilExpiry(instance, now)
          const canExtend = live && (status === 'expired' || (expiresIn !== null && expiresIn <= EXTEND_WITHIN_DAYS))
            || (instance.status === 'expired' && !instance.archived_at)
          const canRemind = linkLive && (status === 'chasing' || status === 'in_progress')
          const delivery = instance.delivery
          const reminded = remindedIds.has(instance.id)
          return (
            <TableRow
              key={instance.id}
              data-highlighted={highlightId === instance.id || undefined}
              className={`${instance.archived_at ? 'opacity-60' : ''} transition-colors duration-700 data-[highlighted]:bg-primary/10`}
            >
              <TableCell>
                <Link to={`${workspaceBaseHref}/clients/${instance.client_id}`} className="font-medium hover:underline">{instance.client_name}</Link>
                <p className="text-xs text-muted-foreground">{instance.recipient_email}</p>
                <p className="text-xs text-muted-foreground xl:hidden">{instance.template_name} v{instance.template_version}</p>
                {/* On a phone, status and last activity ride under the client so
                    the actions stay on screen. */}
                <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 sm:hidden">
                  <Badge variant="outline" className={`whitespace-nowrap ${meta.pill}`}>{intakeStatusLabels[status]}</Badge>
                  <span className="text-xs text-muted-foreground">{reminded ? 'Reminder sent just now' : intakeLastActivity(instance, now)}</span>
                </div>
                {instance.archived_at && <Badge variant="outline" className="mt-1">Archived</Badge>}
              </TableCell>
              <TableCell className="hidden whitespace-nowrap xl:table-cell">{instance.template_name} v{instance.template_version}</TableCell>
              <TableCell className="hidden whitespace-nowrap text-sm md:table-cell">
                {delivery?.status === 'failed' || delivery?.status === 'skipped' ? (
                  <span className="font-medium text-red-700" title={delivery.last_error ?? undefined}>{delivery.status === 'failed' ? 'Email failed' : 'Email not sent'}</span>
                ) : delivery?.status === 'unknown' ? (
                  <span className="text-muted-foreground">Delivery unknown</span>
                ) : (
                  <time dateTime={instance.invited_at}>{relativeTime(instance.invited_at, now)}</time>
                )}
              </TableCell>
              <TableCell className="hidden min-w-36 text-sm sm:table-cell">
                {reminded ? <span className="font-medium text-emerald-700" role="status">Reminder sent just now</span> : intakeLastActivity(instance, now)}
              </TableCell>
              <TableCell className="hidden whitespace-nowrap text-sm text-muted-foreground lg:table-cell">{progressLabel(instance, sectionCount(instance, templates))}</TableCell>
              <TableCell className="hidden sm:table-cell">
                <Badge variant="outline" className={`whitespace-nowrap ${meta.pill}`}>{intakeStatusLabels[status]}</Badge>
              </TableCell>
              <TableCell className="px-1 text-right sm:px-4">
                <div className="inline-flex items-center gap-0.5">
                  {status === 'review' && <Button size="sm" variant="outline" className="mr-1" onClick={() => onAction('review', instance)}>Review</Button>}
                  {canManage && linkLive && <RowIconAction label="Copy link" disabled={busy} onClick={() => onAction('copy', instance)}><Copy className="h-4 w-4" /></RowIconAction>}
                  {canManage && canRemind && (
                    <RowIconAction label={emailConfigured ? 'Send reminder' : 'Send reminder (email is not set up)'} disabled={busy || !emailConfigured} onClick={() => onAction('remind', instance)}><Mail className="h-4 w-4" /></RowIconAction>
                  )}
                  {canManage && canExtend && <RowIconAction label="Extend 14 days" disabled={busy} onClick={() => onAction('extend', instance)}><CalendarPlus className="h-4 w-4" /></RowIconAction>}
                  {canManage && linkLive && <RowIconAction label="Fill in the form for them" disabled={busy} onClick={() => onAction('preview', instance)}><ExternalLink className="h-4 w-4" /></RowIconAction>}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild><Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`More actions for ${instance.client_name}`}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onAction('review', instance)}><ClipboardCheck className="mr-2 h-4 w-4" />{status === 'review' ? 'Review answers' : 'View details'}</DropdownMenuItem>
                      {canManage && live && <DropdownMenuItem disabled={busy} onClick={() => onAction('rotate', instance)}><RefreshCw className="mr-2 h-4 w-4" />Rotate secure link</DropdownMenuItem>}
                      {canManage && live && <DropdownMenuItem className="text-destructive" onClick={() => onAction('revoke', instance)}>Revoke link</DropdownMenuItem>}
                      {canManage && <DropdownMenuSeparator />}
                      {canManage && !instance.archived_at && <DropdownMenuItem onClick={() => onAction('archive', instance)}><Archive className="mr-2 h-4 w-4" />Archive</DropdownMenuItem>}
                      {canManage && instance.archived_at && <DropdownMenuItem className="text-destructive" onClick={() => onAction('purge', instance)}><Trash2 className="mr-2 h-4 w-4" />Permanently delete their answers and files</DropdownMenuItem>}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </TableCell>
            </TableRow>
          )
        })}</TableBody>
      </Table>
    </div>
  </TooltipProvider>
)

export default IntakeTable
