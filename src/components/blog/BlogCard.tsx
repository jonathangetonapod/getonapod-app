import { Link } from 'react-router-dom'
import type { BlogPost } from '@/services/blog'

interface BlogCardProps {
  post: BlogPost
}

/**
 * One article in a list: its picture in a mat, the category as a kicker, the
 * title in the display face, then the date and reading time. The whole card
 * is the link, as before.
 */
export function BlogCard({ post }: BlogCardProps) {
  const formattedDate = new Date(post.published_at || post.created_at).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })

  return (
    <Link to={`/blog/${post.slug}`} className="dfy-card-link">
      <article className="dfy-card">
        {post.featured_image_url && (
          <div className="dfy-card-media">
            <img
              src={post.featured_image_url}
              alt={post.featured_image_alt || post.title}
              loading="lazy"
              decoding="async"
              onError={(e) => {
                // Our own image, so a broken upload never depends on a third party.
                e.currentTarget.src = '/og-image.png'
              }}
            />
          </div>
        )}

        {post.blog_categories && <span className="dfy-tag">{post.blog_categories.name}</span>}

        <h3 className="dfy-card-title line-clamp-2">{post.title}</h3>

        <p className="dfy-card-copy line-clamp-3">{post.excerpt || post.meta_description}</p>

        <p className="dfy-kicker dfy-facts dfy-card-meta">
          <span>{formattedDate}</span>
          <span>{post.read_time_minutes} min read</span>
        </p>
      </article>
    </Link>
  )
}
