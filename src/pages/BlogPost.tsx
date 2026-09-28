import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { BlogSEO } from '@/components/blog/BlogSEO'
import { BlogCard } from '@/components/blog/BlogCard'
import { useToast } from '@/hooks/use-toast'
import {
  getPostBySlug,
  getRelatedPosts,
  incrementViewCount,
  type BlogPost as BlogPostType,
} from '@/services/blog'
import { ArrowLeft, Share2, Loader2 } from 'lucide-react'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'
import { CALL_URL, initials } from '@/lib/landingContent'
import DOMPurify from 'dompurify'

export default function BlogPost() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const { toast } = useToast()

  const [post, setPost] = useState<BlogPostType | null>(null)
  const [relatedPosts, setRelatedPosts] = useState<BlogPostType[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!slug) return
    // A reader who moves to another post before this one arrives must not
    // have the old one land on top of the new.
    let stale = false

    const load = async () => {
      setIsLoading(true)
      let postData: BlogPostType
      try {
        postData = await getPostBySlug(slug)
      } catch (error) {
        if (stale) return
        // Only a missing article sends the reader away.
        console.error('Failed to load post:', error)
        toast({
          title: 'Post not found',
          description: 'The blog post you are looking for does not exist.',
          variant: 'destructive',
        })
        navigate('/blog')
        setIsLoading(false)
        return
      }
      if (stale) return
      setPost(postData)
      setIsLoading(false)

      // Neither of these is the article. A view that could not be counted or
      // a related list that did not load is logged and otherwise left alone.
      incrementViewCount(postData.id).catch((error) => {
        console.error('Failed to count the view:', error)
      })
      try {
        const related = (await getRelatedPosts(postData, 3)) ?? []
        if (!stale) setRelatedPosts(related)
      } catch (error) {
        console.error('Failed to load related posts:', error)
      }
    }

    void load()
    return () => {
      stale = true
    }
  }, [slug, navigate, toast])

  const handleShare = async () => {
    if (navigator.share && post) {
      try {
        await navigator.share({
          title: post.title,
          text: post.meta_description,
          url: window.location.href,
        })
      } catch (error) {
        // User cancelled or share failed
      }
    } else {
      // Fallback: Copy to clipboard
      navigator.clipboard.writeText(window.location.href)
      toast({
        title: 'Link copied',
        description: 'Post URL copied to clipboard',
      })
    }
  }

  if (isLoading) {
    return (
      <div className="dfy-page">
        <Navbar />
        <div className="flex min-h-[60vh] items-center justify-center" role="status" aria-label="Loading article">
          <Loader2 className="h-8 w-8 animate-spin" aria-hidden="true" />
        </div>
        <Footer />
      </div>
    )
  }

  if (!post) {
    return null
  }

  const formattedDate = new Date(post.published_at || post.created_at).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })

  return (
    <div className="dfy-page">
      <Navbar />
      <BlogSEO post={post} />

      <article className="dfy-wrap">
        <header className="dfy-page-hero">
          <div className="mb-8">
            <button type="button" className="dfy-btn dfy-btn-ghost" onClick={() => navigate('/blog')}>
              <ArrowLeft aria-hidden="true" />
              Back to blog
            </button>
          </div>

          {post.blog_categories && <span className="dfy-kicker">{post.blog_categories.name}</span>}

          <h1>{post.title}</h1>

          <div className="mt-6 flex flex-wrap items-center gap-x-7 gap-y-4">
            <div className="dfy-author">
              <span className="dfy-portrait dfy-portrait-initials dfy-avatar" aria-hidden="true">
                {initials(post.author_name)}
              </span>
              <span>
                <span className="dfy-author-name">{post.author_name}</span>
                <span className="dfy-author-role">Get On A Pod</span>
              </span>
            </div>

            <p className="dfy-tag-row">
              <span className="dfy-tag">{formattedDate}</span>
              <span className="dfy-tag">{post.read_time_minutes} min read</span>
            </p>

            <button type="button" className="dfy-btn dfy-btn-ghost" onClick={handleShare}>
              <Share2 aria-hidden="true" />
              Share
            </button>
          </div>

          {post.featured_image_url && (
            <figure className="dfy-figure">
              <img src={post.featured_image_url} alt={post.featured_image_alt || post.title} />
            </figure>
          )}
        </header>

        <hr className="dfy-rule" />

        <div className="dfy-section-tight dfy-article-grid">
          <div>
            <div className="dfy-prose" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(post.content) }} />

            <div className="mt-10">
              {post.tags && post.tags.length > 0 && (
                <div className="dfy-panel">
                  <span className="dfy-kicker">Tagged with</span>
                  <p className="dfy-tag-row">
                    {post.tags.map((tag) => (
                      <span key={tag} className="dfy-tag">{tag}</span>
                    ))}
                  </p>
                </div>
              )}

              <section className="dfy-panel">
                <h2 className="dfy-title">Get booked on the podcasts your customers already listen to</h2>
                <p className="dfy-copy">
                  Get On A Pod pitches the shows, books the recordings and sends you a prep brief before each one, for $500 a month. Most clients have 2–4 bookings a month once outreach ramps up.
                </p>
                <div className="dfy-cta-row">
                  <a className="dfy-btn dfy-btn-primary" href={CALL_URL} target="_blank" rel="noopener noreferrer">
                    Book a 30-minute call
                  </a>
                </div>
              </section>
            </div>
          </div>

          <aside className="dfy-aside">
            <div className="dfy-panel">
              <span className="dfy-kicker">About the author</span>
              <div className="dfy-author">
                <span className="dfy-portrait dfy-portrait-initials dfy-avatar" aria-hidden="true">
                  {initials(post.author_name)}
                </span>
                <span>
                  <span className="dfy-author-name">{post.author_name}</span>
                  <span className="dfy-author-role">Get On A Pod</span>
                </span>
              </div>
              <p className="dfy-small">
                Get On A Pod books founders, executives, authors and coaches on podcasts their customers already listen to.
              </p>
            </div>

            <div className="dfy-panel">
              <span className="dfy-kicker">Quick links</span>
              <ul className="dfy-links">
                <li><Link to="/what-to-expect">What to expect</Link></li>
                <li><Link to="/resources">Free guest resources</Link></li>
                <li><Link to="/blog">All blog posts</Link></li>
              </ul>
            </div>
          </aside>
        </div>

        {relatedPosts.length > 0 && (
          <>
            <hr className="dfy-rule" />
            <section className="dfy-section" aria-labelledby="related-heading">
              <span className="dfy-kicker">Keep reading</span>
              <h2 id="related-heading" className="dfy-title">Related articles</h2>
              <div className="dfy-grid">
                {relatedPosts.map((relatedPost) => (
                  <BlogCard key={relatedPost.id} post={relatedPost} />
                ))}
              </div>
            </section>
          </>
        )}
      </article>

      <Footer />
    </div>
  )
}
