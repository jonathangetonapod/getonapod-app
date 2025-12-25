import { useQuery } from '@tanstack/react-query'
import { getPricingAnalytics } from '@/services/analytics'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ScatterChart, Scatter, Cell } from 'recharts'
import { DollarSign, TrendingUp, Users, Package, ArrowLeft, BarChart3, Info } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { DashboardLayout } from '@/components/admin/DashboardLayout'
import { Button } from '@/components/ui/button'
import { Link } from 'react-router-dom'
import { Separator } from '@/components/ui/separator'

export default function Analytics() {
  const { data: analytics, isLoading, error } = useQuery({
    queryKey: ['pricing-analytics'],
    queryFn: getPricingAnalytics,
  })

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="space-y-6">
          <div>
            <Skeleton className="h-8 w-64 mb-2" />
            <Skeleton className="h-4 w-96" />
          </div>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
        </div>
      </DashboardLayout>
    )
  }

  if (error) {
    console.error('Analytics error:', error)
    return (
      <DashboardLayout>
        <div className="p-6">
          <Card className="border-destructive">
            <CardHeader>
              <CardTitle className="text-destructive">Failed to load analytics</CardTitle>
              <CardDescription>
                {error instanceof Error ? error.message : 'Unknown error'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link to="/admin/dashboard">
                <Button variant="outline">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Dashboard
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    )
  }

  if (!analytics) {
    return (
      <DashboardLayout>
        <div className="p-6">
          <Card>
            <CardHeader>
              <CardTitle>No analytics data available</CardTitle>
              <CardDescription>Add some podcasts to your inventory to see analytics</CardDescription>
            </CardHeader>
            <CardContent>
              <Link to="/admin/premium-placements">
                <Button>
                  <Package className="h-4 w-4 mr-2" />
                  Manage Inventory
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    )
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount)
  }

  const formatCPL = (cpl: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(cpl)
  }

  // Chart colors
  const COLORS = ['#8b5cf6', '#6366f1', '#3b82f6', '#0ea5e9', '#06b6d4', '#14b8a6', '#10b981', '#84cc16']

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header with Navigation */}
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
              <Link to="/admin/dashboard" className="hover:text-foreground transition-colors">
                Dashboard
              </Link>
              <span>/</span>
              <span className="text-foreground font-medium">Analytics</span>
            </div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <BarChart3 className="h-8 w-8 text-primary" />
              Pricing Analytics
            </h1>
            <p className="text-muted-foreground mt-2">
              Real-time insights and intelligence from your podcast inventory
            </p>
          </div>
          <Link to="/admin/premium-placements">
            <Button variant="outline">
              <Package className="h-4 w-4 mr-2" />
              View Inventory
            </Button>
          </Link>
        </div>

        <Separator />

        {/* Section: Overview Metrics */}
        <div className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold flex items-center gap-2">
              Overview Metrics
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Key performance indicators across your entire inventory
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card className="hover:shadow-md transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Avg. Price Per Listener</CardTitle>
                <DollarSign className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-primary">{formatCPL(analytics.averagePricePerListener)}</div>
                <p className="text-xs text-muted-foreground mt-1">Cost per listener (CPL) - industry benchmark</p>
              </CardContent>
            </Card>

            <Card className="hover:shadow-md transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Inventory Value</CardTitle>
                <Package className="h-4 w-4 text-green-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">{formatCurrency(analytics.totalInventoryValue)}</div>
                <p className="text-xs text-muted-foreground mt-1">Total value of all placements</p>
              </CardContent>
            </Card>

            <Card className="hover:shadow-md transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Average Price</CardTitle>
                <TrendingUp className="h-4 w-4 text-blue-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-600">{formatCurrency(analytics.averagePrice)}</div>
                <p className="text-xs text-muted-foreground mt-1">Mean price per placement</p>
              </CardContent>
            </Card>

            <Card className="hover:shadow-md transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Reach</CardTitle>
                <Users className="h-4 w-4 text-purple-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-purple-600">{analytics.totalReach.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground mt-1">Combined audience across inventory</p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Section: Industry Analysis */}
        <div className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold">Industry Pricing Analysis</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Compare pricing and cost per listener across different podcast categories
            </p>
          </div>
          <Card>
        <CardHeader>
          <CardTitle>Price by Industry</CardTitle>
          <CardDescription>Average price and CPL by podcast category</CardDescription>
        </CardHeader>
        <CardContent>
          {analytics.priceByCategory.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No category data available</p>
          ) : (
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={analytics.priceByCategory}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="category" angle={-45} textAnchor="end" height={100} />
                <YAxis yAxisId="left" orientation="left" stroke="#8884d8" />
                <YAxis yAxisId="right" orientation="right" stroke="#82ca9d" />
                <Tooltip
                  formatter={(value: number, name: string) => {
                    if (name === 'avgPrice') return [formatCurrency(value), 'Avg Price']
                    if (name === 'avgCPL') return [formatCPL(value), 'Avg CPL']
                    return [value, name]
                  }}
                />
                <Legend />
                <Bar yAxisId="left" dataKey="avgPrice" fill="#8b5cf6" name="Avg Price" />
                <Bar yAxisId="right" dataKey="avgCPL" fill="#10b981" name="Avg CPL" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
          </Card>
        </div>

        {/* Section: Audience Segmentation */}
        <div className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold">Audience Size Segmentation</h2>
            <p className="text-sm text-muted-foreground mt-1">
              How pricing varies across different audience sizes (Small, Medium, Large, Mega)
            </p>
          </div>
          <Card>
        <CardHeader>
          <CardTitle>Price by Audience Tier</CardTitle>
          <CardDescription>How pricing varies across different audience sizes</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={analytics.priceByAudienceTier}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="tier" />
              <YAxis yAxisId="left" orientation="left" stroke="#8884d8" />
              <YAxis yAxisId="right" orientation="right" stroke="#82ca9d" />
              <Tooltip
                formatter={(value: number, name: string) => {
                  if (name === 'avgPrice') return [formatCurrency(value), 'Avg Price']
                  if (name === 'avgCPL') return [formatCPL(value), 'Avg CPL']
                  return [value, name]
                }}
              />
              <Legend />
              <Bar yAxisId="left" dataKey="avgPrice" fill="#6366f1" name="Avg Price" />
              <Bar yAxisId="right" dataKey="avgCPL" fill="#14b8a6" name="Avg CPL" />
            </BarChart>
          </ResponsiveContainer>

          {/* Tier Details Table */}
          <div className="mt-6 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-2">Tier</th>
                  <th className="text-left p-2">Range</th>
                  <th className="text-right p-2">Count</th>
                  <th className="text-right p-2">Avg Price</th>
                  <th className="text-right p-2">Avg CPL</th>
                </tr>
              </thead>
              <tbody>
                {analytics.priceByAudienceTier.map((tier) => (
                  <tr key={tier.tier} className="border-b">
                    <td className="p-2 font-medium">{tier.tier}</td>
                    <td className="p-2 text-muted-foreground">{tier.range}</td>
                    <td className="p-2 text-right">{tier.count}</td>
                    <td className="p-2 text-right">{tier.count > 0 ? formatCurrency(tier.avgPrice) : '-'}</td>
                    <td className="p-2 text-right">{tier.count > 0 ? formatCPL(tier.avgCPL) : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
          </Card>
        </div>

        {/* Section: Price Distribution */}
        <div className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold">Price Distribution</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Breakdown of podcasts across different price ranges
            </p>
          </div>
          <Card>
        <CardHeader>
          <CardTitle>Price Distribution</CardTitle>
          <CardDescription>Number of podcasts in each price range</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={analytics.priceDistribution}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="range" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="count" fill="#8b5cf6" name="Podcast Count">
                {analytics.priceDistribution.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
          </Card>
        </div>

        {/* Section: Top Performers */}
        <div className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold">Top Performers</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Your highest-priced podcast placements with audience reach and CPL
            </p>
          </div>
          <Card>
        <CardHeader>
          <CardTitle>Most Expensive Placements</CardTitle>
          <CardDescription>Top 5 premium podcast placements by price</CardDescription>
        </CardHeader>
        <CardContent>
          {analytics.topPodcasts.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No podcast data available</p>
          ) : (
            <div className="space-y-4">
              {analytics.topPodcasts.map((podcast, index) => (
                <div key={index} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-bold">
                      {index + 1}
                    </div>
                    <div>
                      <p className="font-medium">{podcast.name}</p>
                      <p className="text-sm text-muted-foreground">{podcast.audience} listeners</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-bold">{formatCurrency(podcast.price)}</p>
                    <p className="text-xs text-muted-foreground">{formatCPL(podcast.cpl)} CPL</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  )
}
