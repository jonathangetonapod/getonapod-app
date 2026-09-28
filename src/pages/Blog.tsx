import { useState, useEffect, useRef } from 'react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { useScrollAnimation } from '@/hooks/useScrollAnimation';
import { Search } from 'lucide-react';
import { BlogCard } from '@/components/blog/BlogCard';
import { getAllPosts, getAllCategories, type BlogPost, type BlogCategory } from '@/services/blog';
import PageSEO from '@/components/seo/PageSEO';

/** How long the search box waits after the last keystroke before asking the database. */
const SEARCH_DEBOUNCE_MS = 300;

/** The shape of an article, drawn while the articles load. */
const CardPlaceholder = () => (
  <div className="dfy-card" aria-hidden="true">
    <span className="dfy-skeleton mb-4 aspect-video w-full" />
    <span className="dfy-skeleton h-3 w-20" />
    <span className="dfy-skeleton mt-4 h-6 w-full" />
    <span className="dfy-skeleton mt-2 h-6 w-4/5" />
    <span className="dfy-skeleton mt-4 h-4 w-full" />
    <span className="dfy-skeleton mt-2 h-4 w-full" />
    <span className="dfy-skeleton mt-2 h-4 w-3/5" />
    <span className="dfy-skeleton mt-5 h-3 w-40" />
  </div>
);

const Blog = () => {
  const { ref, isVisible } = useScrollAnimation<HTMLDivElement>();

  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [categories, setCategories] = useState<BlogCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  // Bumped by Retry so the load effect runs again with the same filters.
  const [attempt, setAttempt] = useState(0);
  // The id of the newest request. An older one that finishes later must not
  // overwrite what the newer one returned.
  const latestRequest = useRef(0);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(searchQuery.trim()), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  // Load on mount and whenever a filter settles.
  useEffect(() => {
    const requestId = ++latestRequest.current;
    const isCurrent = () => requestId === latestRequest.current;

    const load = async () => {
      setIsLoading(true);
      setLoadFailed(false);
      try {
        const [postsData, categoriesData] = await Promise.all([
          getAllPosts({
            status: 'published',
            category: selectedCategory === 'all' ? undefined : selectedCategory,
            search: debouncedSearch || undefined,
          }),
          getAllCategories(),
        ]);
        if (!isCurrent()) return;
        setPosts(postsData);
        setCategories(categoriesData);
      } catch (error) {
        if (!isCurrent()) return;
        console.error('Failed to load blog posts:', error);
        setLoadFailed(true);
      } finally {
        if (isCurrent()) setIsLoading(false);
      }
    };

    void load();
  }, [selectedCategory, debouncedSearch, attempt]);

  return (
    <div className="dfy-page">
      <PageSEO
        title="How to get booked on podcasts: guides and tactics | Get On A Pod"
        description="Practical guides on pitching podcast hosts, preparing for interviews and turning guest appearances into customers."
        path="/blog"
      />
      <Navbar />

      <main className="dfy-wrap">
        <section className="dfy-page-hero">
          <span className="dfy-kicker">The Get On A Pod blog</span>
          <h1>How to get booked on podcasts, and what to do once you are</h1>
          <p className="dfy-page-lead">
            Guides on pitching hosts, preparing for interviews and turning episodes into customers, from the team that books its clients on podcasts every week.
          </p>
        </section>

        <section className="dfy-toolbar" aria-label="Search and filter">
          <div className="dfy-input-wrap">
            <Search aria-hidden="true" />
            <input
              type="search"
              className="dfy-input"
              aria-label="Search articles"
              placeholder="Search articles..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="dfy-chip-row" role="group" aria-label="Category">
            <button
              type="button"
              className="dfy-chip"
              aria-pressed={selectedCategory === 'all'}
              onClick={() => setSelectedCategory('all')}
            >
              All
            </button>
            {categories.map((category) => (
              <button
                key={category.id}
                type="button"
                className="dfy-chip"
                aria-pressed={selectedCategory === category.id}
                onClick={() => setSelectedCategory(category.id)}
              >
                {category.name}
              </button>
            ))}
          </div>
        </section>

        <section className="dfy-section">
          <div
            ref={ref}
            className={`transition-all duration-700 ${
              isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
            }`}
          >
            {isLoading ? (
              <div className="dfy-grid" role="status" aria-label="Loading articles">
                {Array.from({ length: 6 }).map((_, i) => (
                  <CardPlaceholder key={i} />
                ))}
              </div>
            ) : loadFailed ? (
              /* The request failed: not the same as there being nothing to show. */
              <div role="alert">
                <p className="dfy-copy">Articles did not load.</p>
                <div className="dfy-cta-row">
                  <button type="button" className="dfy-btn dfy-btn-primary" onClick={() => setAttempt((count) => count + 1)}>
                    Retry
                  </button>
                </div>
              </div>
            ) : posts.length === 0 ? (
              <p className="dfy-copy">
                {debouncedSearch || selectedCategory !== 'all'
                  ? 'No articles found. Try adjusting your filters.'
                  : 'No articles published yet. Check back soon.'}
              </p>
            ) : (
              <div className="dfy-grid">
                {posts.map((post, index) => (
                  <div
                    key={post.id}
                    style={{ transitionDelay: `${index * 100}ms` }}
                    className="transition-all duration-300"
                  >
                    <BlogCard post={post} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default Blog;
