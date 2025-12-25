import { DashboardLayout } from '@/components/admin/DashboardLayout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { FileText, Video, Users, TrendingUp } from 'lucide-react'

const AdminDashboard = () => {
  // These will be replaced with real data later
  const stats = [
    {
      title: 'Total Blog Posts',
      value: '6',
      description: 'Published articles',
      icon: FileText,
      trend: '+2 this month'
    },
    {
      title: 'Videos',
      value: '0',
      description: 'Video content',
      icon: Video,
      trend: 'Coming soon'
    },
    {
      title: 'Email Leads',
      value: '0',
      description: 'Form submissions',
      icon: Users,
      trend: 'No data yet'
    },
    {
      title: 'Site Traffic',
      value: 'N/A',
      description: 'Monthly visitors',
      icon: TrendingUp,
      trend: 'Analytics pending'
    }
  ]

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Dashboard Overview</h1>
          <p className="text-muted-foreground mt-2">
            Welcome to your Authority Lab command center
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat) => {
            const Icon = stat.icon
            return (
              <Card key={stat.title}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    {stat.title}
                  </CardTitle>
                  <Icon className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stat.value}</div>
                  <p className="text-xs text-muted-foreground">
                    {stat.description}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {stat.trend}
                  </p>
                </CardContent>
              </Card>
            )
          })}
        </div>

        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>
              Manage your content and leads from here
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div>
                <p className="font-medium">Blog Posts</p>
                <p className="text-sm text-muted-foreground">
                  Create, edit, and manage your blog content
                </p>
              </div>
              <FileText className="h-8 w-8 text-muted-foreground" />
            </div>
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div>
                <p className="font-medium">Videos</p>
                <p className="text-sm text-muted-foreground">
                  Upload and manage video content
                </p>
              </div>
              <Video className="h-8 w-8 text-muted-foreground" />
            </div>
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div>
                <p className="font-medium">Email Leads</p>
                <p className="text-sm text-muted-foreground">
                  View and export lead submissions
                </p>
              </div>
              <Users className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  )
}

export default AdminDashboard
