import { useQuery } from '@tanstack/react-query'
import { getPricingAnalytics } from '@/services/analytics'

export default function AnalyticsTest() {
  const { data: analytics, isLoading, error } = useQuery({
    queryKey: ['pricing-analytics'],
    queryFn: getPricingAnalytics,
  })

  if (isLoading) return <div className="p-6">Loading...</div>

  if (error) {
    return (
      <div className="p-6">
        <div className="text-red-500">
          <h2 className="text-xl font-bold mb-2">Error</h2>
          <p className="text-sm">{error instanceof Error ? error.message : 'Unknown error'}</p>
        </div>
      </div>
    )
  }

  if (!analytics) return <div className="p-6">No data</div>

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">Analytics Test (No Auth)</h1>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="border p-4 rounded">
          <div className="text-sm text-gray-500">Avg Price Per Listener</div>
          <div className="text-2xl font-bold">${analytics.averagePricePerListener.toFixed(4)}</div>
        </div>

        <div className="border p-4 rounded">
          <div className="text-sm text-gray-500">Total Inventory Value</div>
          <div className="text-2xl font-bold">${analytics.totalInventoryValue.toLocaleString()}</div>
        </div>

        <div className="border p-4 rounded">
          <div className="text-sm text-gray-500">Average Price</div>
          <div className="text-2xl font-bold">${analytics.averagePrice.toLocaleString()}</div>
        </div>

        <div className="border p-4 rounded">
          <div className="text-sm text-gray-500">Total Reach</div>
          <div className="text-2xl font-bold">{analytics.totalReach.toLocaleString()}</div>
        </div>
      </div>

      <div className="border p-4 rounded">
        <h2 className="text-xl font-bold mb-2">Top 5 Most Expensive</h2>
        <div className="space-y-2">
          {analytics.topPodcasts.map((podcast, index) => (
            <div key={index} className="flex justify-between">
              <span>{podcast.name}</span>
              <span className="font-bold">${podcast.price.toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="border p-4 rounded">
        <h2 className="text-xl font-bold mb-2">Raw Data</h2>
        <pre className="text-xs overflow-auto">{JSON.stringify(analytics, null, 2)}</pre>
      </div>
    </div>
  )
}
