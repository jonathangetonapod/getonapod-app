import { Link } from 'react-router-dom'
import { ArrowRight, CalendarDays } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { ClientUpcomingItem } from '@/lib/clientNextStep'

interface ClientUpcomingCardProps {
  items: ClientUpcomingItem[]
  pipelineHref: string
  formatDate: (value: string) => string
}

const KIND_LABEL: Record<ClientUpcomingItem['kind'], string> = {
  recording: 'Recording',
  release: 'Release',
}

const KIND_CLASS: Record<ClientUpcomingItem['kind'], string> = {
  recording: 'border-sky-200 bg-sky-50 text-sky-800',
  release: 'border-violet-200 bg-violet-50 text-violet-800',
}

export const ClientUpcomingCard = ({ items, pipelineHref, formatDate }: ClientUpcomingCardProps) => (
  <Card>
    <CardHeader className="pb-3">
      <CardTitle className="text-lg">Upcoming</CardTitle>
      <CardDescription>Recordings and episode releases, soonest first.</CardDescription>
    </CardHeader>
    <CardContent>
      {items.length === 0 ? (
        <div className="flex flex-col items-start gap-2 rounded-xl border border-dashed p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            Nothing scheduled yet. Recordings appear here after a podcast is booked.
          </p>
          <Link to={pipelineHref} className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline">
            View pipeline<ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      ) : (
        <ul className="divide-y rounded-xl border">
          {items.map((item) => (
            <li key={item.key} className="flex flex-wrap items-center gap-x-4 gap-y-1 p-3 sm:px-4">
              <span className="inline-flex w-28 shrink-0 items-center gap-1.5 text-sm font-medium tabular-nums">
                <CalendarDays className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                {formatDate(item.date)}
              </span>
              <Badge variant="outline" className={`w-20 shrink-0 justify-center ${KIND_CLASS[item.kind]}`}>{KIND_LABEL[item.kind]}</Badge>
              <span className="min-w-0 flex-1 basis-48">
                <span className="block font-medium">{item.booking.podcast_name}</span>
                {item.booking.host_name && (
                  <span className="block text-sm text-muted-foreground">Hosted by {item.booking.host_name}</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </CardContent>
  </Card>
)
