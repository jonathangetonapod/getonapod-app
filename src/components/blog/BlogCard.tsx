import { Link } from 'react-router-dom'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Calendar, Clock } from 'lucide-react'
import type { BlogPost } from '@/services/blog'

interface BlogCardProps {
  post: BlogPost
}

export function BlogCard({ post }: BlogCardProps) {
  const formattedDate = new Date(post.published_at || post.created_at).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })

  return (
    <Link to={`/blog/${post.slug}`} className="group">
      <Card className="h-full overflow-hidden transition-all hover:shadow-lg hover:-translate-y-1">
        {/* Featured Image */}
        {post.featured_image_url && (
          <div className="aspect-video overflow-hidden">
            <img
              src={post.featured_image_url}
              alt={post.featured_image_alt || post.title}
              className="w-full h-full object-cover transition-transform group-hover:scale-105"
              onError={(e) => {
                e.currentTarget.src = 'https://images.unsplash.com/photo-1499750310107-5fef28a66643?w=800&auto=format&fit=crop'
              }}
            />
          </div>
        )}

        <CardHeader className="space-y-3">
          {/* Category Badge */}
          {post.blog_categories && (
            <div>
              <Badge variant="secondary" className="text-xs">
                {post.blog_categories.name}
              </Badge>
            </div>
          )}

          {/* Title */}
          <h3 className="text-xl font-bold line-clamp-2 group-hover:text-primary transition-colors">
            {post.title}
          </h3>
        </CardHeader>

        <CardContent>
          {/* Excerpt */}
          <p className="text-muted-foreground line-clamp-3">
            {post.excerpt || post.meta_description}
          </p>
        </CardContent>

        <CardFooter className="flex items-center gap-4 text-sm text-muted-foreground">
          {/* Date */}
          <div className="flex items-center gap-1">
            <Calendar className="h-4 w-4" />
            <span>{formattedDate}</span>
          </div>

          {/* Read Time */}
          <div className="flex items-center gap-1">
            <Clock className="h-4 w-4" />
            <span>{post.read_time_minutes} min read</span>
          </div>
        </CardFooter>
      </Card>
    </Link>
  )
}
