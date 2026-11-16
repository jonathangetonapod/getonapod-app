import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { PortalJourneyStatus } from '@/lib/portalJourney'

interface JourneyStatusCardProps {
  status: PortalJourneyStatus
}

/**
 * One sentence on where the tour stands and one on what follows.
 *
 * During outreach the dashboard was four small numbers over "No shows yet" for
 * weeks, which reads as nothing happening at the point the most work is being
 * done. This says what is happening, and points at the page with the detail.
 */
export const JourneyStatusCard = ({ status }: JourneyStatusCardProps) => (
  <Card>
    <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Where things stand</p>
        <p className="mt-1 text-lg font-semibold">{status.headline}</p>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">{status.detail}</p>
      </div>
      <Button asChild variant="outline" size="sm" className="shrink-0">
        <Link to="/portal/outreach">
          See outreach
          <ArrowRight className="ml-2 h-4 w-4" />
        </Link>
      </Button>
    </CardContent>
  </Card>
)
