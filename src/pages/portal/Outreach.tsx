import { useMemo } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { CalendarClock, Loader2, MessageSquare, Mic2, RefreshCw, Send } from 'lucide-react'

import { OutreachActivityList } from '@/components/portal/OutreachActivityList'
import { PortalLayout } from '@/components/portal/PortalLayout'
import { PortalStatTile } from '@/components/portal/PortalStatTile'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { usePortalExperience } from '@/hooks/usePortalExperience'
import { OUTREACH_STAGE_LABELS, PLACEMENT_STATUS_LABELS } from '@/lib/placementStatus'
import { outreachStageCounts, portalJourneyCounts, portalJourneyStatus } from '@/lib/portalJourney'

// Pitches take the portal's theme colour, so the chart wears the agency's
// brand; episodes keep a green validated against a light surface.
const MESSAGES_COLOR = 'hsl(var(--primary))'
const EPISODES_COLOR = '#059669'

interface MonthBucket {
  key: string
  label: string
  count: number
}

const lastMonths = (count: number): MonthBucket[] => {
  const now = new Date()
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (count - 1 - index), 1)
    return {
      key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
      label: date.toLocaleDateString(undefined, { month: 'short' }),
      count: 0,
    }
  })
}

const bucketByMonth = (dates: Array<string | null>, months: number): MonthBucket[] => {
  const buckets = lastMonths(months)
  const byKey = new Map(buckets.map((bucket) => [bucket.key, bucket]))
  for (const value of dates) {
    if (!value) continue
    // Bucket in the viewer's local calendar — the bucket keys are local
    // months, so slicing the UTC ISO string would misplace boundary events.
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) continue
    const bucket = byKey.get(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`)
    if (bucket) bucket.count += 1
  }
  return buckets
}

interface PipelineRow {
  label: string
  count: number
}

export default function PortalOutreach() {
  const overviewQuery = usePortalExperience()

  const overview = overviewQuery.data ?? null
  const targets = useMemo(() => overview?.outreach_targets ?? [], [overview])
  const summary = overview?.outreach ?? null
  const bookings = useMemo(
    () => (overview?.bookings ?? []).filter((booking) => booking.status !== 'cancelled'),
    [overview],
  )

  const messagesByMonth = useMemo(
    () => bucketByMonth(targets.map((target) => target.first_message_at), 6),
    [targets],
  )
  const episodesByMonth = useMemo(
    () => bucketByMonth(
      bookings.filter((booking) => booking.status === 'published').map((booking) => booking.publish_date),
      6,
    ),
    [bookings],
  )
  const hasMessageData = messagesByMonth.some((bucket) => bucket.count > 0)
  const hasEpisodeData = episodesByMonth.some((bucket) => bucket.count > 0)

  /*
   * One count for the whole page. The tiles used to quote the sending
   * platform's totals while the pipeline counted rows, and the two disagreed
   * a few centimetres apart.
   */
  const stages = useMemo(() => outreachStageCounts(overview), [overview])
  const counts = useMemo(() => portalJourneyCounts(overview), [overview])
  const status = portalJourneyStatus(counts)
  const totalTargets = stages.preparing + stages.queued + stages.contacted + stages.replied + stages.completed

  const pipeline: PipelineRow[] = useMemo(() => {
    const bookingCount = (statuses: string[]) => bookings.filter((booking) => statuses.includes(booking.status)).length
    return [
      { label: OUTREACH_STAGE_LABELS.preparing, count: stages.preparing },
      { label: OUTREACH_STAGE_LABELS.queued, count: stages.queued },
      { label: OUTREACH_STAGE_LABELS.contacted, count: stages.contacted },
      { label: OUTREACH_STAGE_LABELS.replied, count: stages.replied + stages.completed },
      { label: PLACEMENT_STATUS_LABELS.conversation_started, count: bookingCount(['conversation_started', 'in_progress']) },
      { label: PLACEMENT_STATUS_LABELS.booked, count: bookingCount(['booked']) },
      { label: PLACEMENT_STATUS_LABELS.recorded, count: bookingCount(['recorded']) },
      { label: PLACEMENT_STATUS_LABELS.published, count: bookingCount(['published']) },
    ]
  }, [stages, bookings])
  const pipelineMax = Math.max(1, ...pipeline.map((row) => row.count))
  const pipelineHasData = pipeline.some((row) => row.count > 0)

  // The platform's own totals where they run ahead of the per-show record.
  const tiles = [
    { label: 'Pitches in queue', hint: 'Written and scheduled to send', value: counts.queued, icon: CalendarClock },
    { label: 'Hosts emailed', hint: 'Your pitch has gone out', value: Math.max(counts.emailed, summary?.podcasts_contacted ?? 0), icon: Send },
    { label: 'Replies', hint: 'Hosts who wrote back', value: Math.max(counts.replied, summary?.replies ?? 0), icon: MessageSquare },
    { label: 'Shows secured', hint: 'Booked, recorded or live', value: counts.secured, icon: Mic2 },
  ]
  const hasOutreach = Boolean(summary) || totalTargets > 0

  return (
    <PortalLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Outreach & insights</h1>
          <p className="mt-1 text-muted-foreground">
            Every show your team has messaged for you, and how the conversations are going.
          </p>
        </div>

        {overviewQuery.isLoading ? (
          <div className="flex min-h-52 items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading your outreach…
          </div>
        ) : overviewQuery.error ? (
          <div className="flex min-h-52 flex-col items-center justify-center gap-3 text-center">
            <p className="text-sm text-destructive">We couldn’t load your outreach right now. Try again in a moment, or sign in again if it keeps happening.</p>
            <Button variant="outline" onClick={() => overviewQuery.refetch()}>
              <RefreshCw className="mr-2 h-4 w-4" /> Try again
            </Button>
          </div>
        ) : (
          <>
            {hasOutreach && (
              <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
                {tiles.map((stat) => (
                  <PortalStatTile key={stat.label} label={stat.label} value={stat.value} icon={stat.icon} hint={stat.hint} />
                ))}
              </div>
            )}

            <Card>
              <CardHeader>
                <CardTitle>Where everything stands</CardTitle>
                <CardDescription>Your pipeline right now, from first pitch to live episode.</CardDescription>
              </CardHeader>
              <CardContent>
                {status && (
                  <div className="mb-5 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
                    <p className="text-sm font-semibold">{status.headline}</p>
                    <p className="mt-0.5 text-sm leading-6 text-muted-foreground">{status.detail}</p>
                  </div>
                )}
                {!pipelineHasData ? (
                  <p className="text-sm text-muted-foreground">
                    Your pipeline fills in as soon as your team starts outreach for the shows you picked.
                  </p>
                ) : (
                  <ul className="space-y-2.5" aria-label="Your pipeline">
                    {pipeline.map((row) => (
                      <li key={row.label} className="grid grid-cols-[7.5rem,1fr,2rem] items-center gap-2 sm:grid-cols-[9.5rem,1fr,2.5rem] sm:gap-3">
                        <span className={`text-xs sm:text-sm ${row.count > 0 ? 'font-medium' : 'text-muted-foreground'}`}>{row.label}</span>
                        <span className="h-2.5 overflow-hidden rounded-full bg-muted/60">
                          <span
                            className="block h-full rounded-full bg-primary"
                            style={{ width: `${(row.count / pipelineMax) * 100}%` }}
                          />
                        </span>
                        <span className={`text-right text-xs tabular-nums sm:text-sm ${row.count > 0 ? 'font-semibold' : 'text-muted-foreground'}`}>{row.count}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            {/* Two empty charts are two cards of nothing; they earn their
                space once either has a month to show. */}
            {(hasMessageData || hasEpisodeData) && (
            <div className={`grid gap-4 ${hasMessageData && hasEpisodeData ? 'lg:grid-cols-2' : ''}`}>
              {hasMessageData && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Pitches emailed by month</CardTitle>
                  <CardDescription>Shows that were emailed a pitch for you.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-44" role="img" aria-label="Bar chart of outreach messages sent per month">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={messagesByMonth} margin={{ top: 8, right: 8, bottom: 0, left: -24 }}>
                          <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeOpacity={0.6} />
                          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                          <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                          <Tooltip cursor={{ fill: 'hsl(var(--muted))', opacity: 0.35 }} formatter={(value: number) => [value, 'Messages']} />
                          <Bar dataKey="count" fill={MESSAGES_COLOR} radius={[4, 4, 0, 0]} maxBarSize={28} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                </CardContent>
              </Card>
              )}
              {hasEpisodeData && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Episodes live by month</CardTitle>
                  <CardDescription>Your appearances that went live.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-44" role="img" aria-label="Bar chart of published episodes per month">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={episodesByMonth} margin={{ top: 8, right: 8, bottom: 0, left: -24 }}>
                          <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeOpacity={0.6} />
                          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                          <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                          <Tooltip cursor={{ fill: 'hsl(var(--muted))', opacity: 0.35 }} formatter={(value: number) => [value, 'Episodes']} />
                          <Bar dataKey="count" fill={EPISODES_COLOR} radius={[4, 4, 0, 0]} maxBarSize={28} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                </CardContent>
              </Card>
              )}
            </div>
            )}

            <Card>
              <CardHeader>
                <CardTitle>Outreach activity</CardTitle>
                <CardDescription>Show by show: when the pitch went out and what happened next.</CardDescription>
              </CardHeader>
              <CardContent>
                {targets.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Outreach activity appears here once your team starts contacting the shows you picked.
                  </p>
                ) : (
                  <OutreachActivityList targets={targets} total={totalTargets} />
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </PortalLayout>
  )
}
