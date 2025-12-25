import { DashboardLayout } from '@/components/admin/DashboardLayout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Plus, Edit, Trash2, Eye } from 'lucide-react'

const BlogManagement = () => {
  // Mock blog posts - will be replaced with real data later
  const blogPosts = [
    {
      id: 1,
      title: 'Getting Started with Podcast Guesting',
      status: 'Published',
      date: '2024-01-15',
      views: 245
    },
    {
      id: 2,
      title: 'How to Pitch Your Story to Podcasters',
      status: 'Published',
      date: '2024-01-10',
      views: 189
    },
    {
      id: 3,
      title: 'Building Authority Through Media',
      status: 'Draft',
      date: '2024-01-08',
      views: 0
    }
  ]

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Blog Posts</h1>
            <p className="text-muted-foreground mt-2">
              Create and manage your blog content
            </p>
          </div>
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            New Post
          </Button>
        </div>

        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Posts</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{blogPosts.length}</div>
              <p className="text-xs text-muted-foreground">
                All blog articles
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Published</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {blogPosts.filter(p => p.status === 'Published').length}
              </div>
              <p className="text-xs text-muted-foreground">
                Live on website
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Views</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {blogPosts.reduce((sum, p) => sum + p.views, 0)}
              </div>
              <p className="text-xs text-muted-foreground">
                All time views
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Blog Posts List */}
        <Card>
          <CardHeader>
            <CardTitle>All Posts</CardTitle>
            <CardDescription>
              Manage your blog articles
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {blogPosts.map((post) => (
                <div
                  key={post.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex-1">
                    <h3 className="font-medium">{post.title}</h3>
                    <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                      <span className={post.status === 'Published' ? 'text-green-600' : 'text-yellow-600'}>
                        {post.status}
                      </span>
                      <span>{post.date}</span>
                      <span className="flex items-center gap-1">
                        <Eye className="h-3 w-3" />
                        {post.views} views
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="icon">
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon">
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  )
}

export default BlogManagement
