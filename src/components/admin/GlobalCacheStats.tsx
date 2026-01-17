import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Database, CheckCircle2, TrendingUp } from 'lucide-react'
import { getCacheStatistics } from '@/services/podcastCache'

export function GlobalCacheStats() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['global-cache-stats'],
    queryFn: getCacheStatistics,
    refetchInterval: 60000 // Refresh every minute
  })

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Podcast Cache
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-muted-foreground">Loading...</div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="h-5 w-5" />
          Global Podcast Cache
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-center">
          <div className="text-4xl font-bold text-green-500">
            {stats?.total_cached.toLocaleString() || 0}
          </div>
          <div className="text-sm text-muted-foreground">
            Unique Podcasts Cached
          </div>
        </div>

        <Separator />

        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground uppercase">
            Cache Sources
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Client Dashboards</span>
            <Badge variant="outline" className="font-mono">
              {stats?.by_source.client_dashboards.toLocaleString() || 0}
            </Badge>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Prospect Dashboards</span>
            <Badge variant="outline" className="font-mono">
              {stats?.by_source.prospect_dashboards.toLocaleString() || 0}
            </Badge>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Bookings</span>
            <Badge variant="outline" className="font-mono">
              {stats?.by_source.bookings.toLocaleString() || 0}
            </Badge>
          </div>
        </div>

        <Separator />

        <div className="bg-green-50 dark:bg-green-950 p-3 rounded-lg">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="h-4 w-4 text-green-600 dark:text-green-400" />
            <div className="text-sm font-medium text-green-700 dark:text-green-300">
              Estimated Savings
            </div>
          </div>
          <div className="text-2xl font-bold text-green-600 dark:text-green-400">
            ~{stats?.estimated_credits_saved.toLocaleString() || 0}
          </div>
          <div className="text-xs text-green-600 dark:text-green-400">
            Podscan API calls saved
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
