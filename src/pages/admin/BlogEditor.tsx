import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { RichTextEditor } from '@/components/blog/RichTextEditor'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import {
  createPost,
  updatePost,
  getPostById,
  publishPost,
  getAllCategories,
  generateSlug,
  isSlugUnique,
  calculateReadTime,
  generateExcerpt,
  generateSchemaMarkup,
  type CreateBlogPostInput,
  type BlogCategory,
} from '@/services/blog'
import { submitToGoogleIndexing, buildPostUrl } from '@/services/indexing'
import { ArrowLeft, Save, Eye, Globe, Loader2, Sparkles } from 'lucide-react'

export default function BlogEditor() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { toast } = useToast()
  const isEditMode = !!id

  // Form state
  const [title, setTitle] = useState('')
  const [slug, setSlug] = useState('')
  const [metaDescription, setMetaDescription] = useState('')
  const [content, setContent] = useState('')
  const [excerpt, setExcerpt] = useState('')
  const [featuredImageUrl, setFeaturedImageUrl] = useState('')
  const [featuredImageAlt, setFeaturedImageAlt] = useState('')
  const [focusKeyword, setFocusKeyword] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')

  // UI state
  const [categories, setCategories] = useState<BlogCategory[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [isPublishing, setIsPublishing] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [status, setStatus] = useState<'draft' | 'published'>('draft')

  // Load categories
  useEffect(() => {
    loadCategories()
  }, [])

  // Load post data if editing
  useEffect(() => {
    if (isEditMode && id) {
      loadPost(id)
    }
  }, [isEditMode, id])

  // Auto-generate slug from title
  useEffect(() => {
    if (!isEditMode && title && !slug) {
      setSlug(generateSlug(title))
    }
  }, [title, isEditMode, slug])

  const loadCategories = async () => {
    try {
      const data = await getAllCategories()
      setCategories(data)
    } catch (error) {
      console.error('Failed to load categories:', error)
      toast({
        title: 'Error',
        description: 'Failed to load categories',
        variant: 'destructive',
      })
    }
  }

  const loadPost = async (postId: string) => {
    setIsLoading(true)
    try {
      const post = await getPostById(postId)
      setTitle(post.title)
      setSlug(post.slug)
      setMetaDescription(post.meta_description)
      setContent(post.content)
      setExcerpt(post.excerpt || '')
      setFeaturedImageUrl(post.featured_image_url || '')
      setFeaturedImageAlt(post.featured_image_alt || '')
      setFocusKeyword(post.focus_keyword || '')
      setCategoryId(post.category_id || '')
      setTags(post.tags || [])
      setStatus(post.status)
    } catch (error) {
      console.error('Failed to load post:', error)
      toast({
        title: 'Error',
        description: 'Failed to load blog post',
        variant: 'destructive',
      })
      navigate('/admin/blog')
    } finally {
      setIsLoading(false)
    }
  }

  const handleAddTag = () => {
    if (tagInput.trim() && !tags.includes(tagInput.trim())) {
      setTags([...tags, tagInput.trim()])
      setTagInput('')
    }
  }

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter(tag => tag !== tagToRemove))
  }

  const validateForm = async () => {
    if (!title.trim()) {
      toast({ title: 'Title required', variant: 'destructive' })
      return false
    }

    if (!slug.trim()) {
      toast({ title: 'Slug required', variant: 'destructive' })
      return false
    }

    if (!content.trim()) {
      toast({ title: 'Content required', variant: 'destructive' })
      return false
    }

    if (!metaDescription.trim()) {
      toast({ title: 'Meta description required', variant: 'destructive' })
      return false
    }

    // Check slug uniqueness
    const isUnique = await isSlugUnique(slug, id)
    if (!isUnique) {
      toast({
        title: 'Slug already exists',
        description: 'Please use a different slug',
        variant: 'destructive',
      })
      return false
    }

    return true
  }

  const handleSaveDraft = async () => {
    if (!(await validateForm())) return

    setIsSaving(true)
    try {
      const postData: CreateBlogPostInput = {
        title,
        slug,
        meta_description: metaDescription,
        content,
        excerpt: excerpt || generateExcerpt(content),
        featured_image_url: featuredImageUrl || undefined,
        featured_image_alt: featuredImageAlt || undefined,
        focus_keyword: focusKeyword || undefined,
        category_id: categoryId || undefined,
        tags,
        status: 'draft',
        read_time_minutes: calculateReadTime(content),
      }

      if (isEditMode && id) {
        const updated = await updatePost({ id, ...postData })
        toast({ title: 'Draft saved!', description: 'Your changes have been saved.' })
        setStatus(updated.status)
      } else {
        const created = await createPost(postData)
        toast({ title: 'Draft created!', description: 'Your blog post draft has been created.' })
        navigate(`/admin/blog/${created.id}/edit`)
      }
    } catch (error) {
      console.error('Failed to save draft:', error)
      toast({
        title: 'Save failed',
        description: error instanceof Error ? error.message : 'Failed to save draft',
        variant: 'destructive',
      })
    } finally {
      setIsSaving(false)
    }
  }

  const handlePublish = async () => {
    if (!(await validateForm())) return

    setIsPublishing(true)
    try {
      let postId = id

      // If new post, create it first
      if (!isEditMode) {
        const postData: CreateBlogPostInput = {
          title,
          slug,
          meta_description: metaDescription,
          content,
          excerpt: excerpt || generateExcerpt(content),
          featured_image_url: featuredImageUrl || undefined,
          featured_image_alt: featuredImageAlt || undefined,
          focus_keyword: focusKeyword || undefined,
          category_id: categoryId || undefined,
          tags,
          status: 'draft',
          read_time_minutes: calculateReadTime(content),
        }

        const created = await createPost(postData)
        postId = created.id
      } else {
        // Update existing post
        await updatePost({
          id: postId!,
          title,
          slug,
          meta_description: metaDescription,
          content,
          excerpt: excerpt || generateExcerpt(content),
          featured_image_url: featuredImageUrl || undefined,
          featured_image_alt: featuredImageAlt || undefined,
          focus_keyword: focusKeyword || undefined,
          category_id: categoryId || undefined,
          tags,
          read_time_minutes: calculateReadTime(content),
        })
      }

      // Publish the post
      const published = await publishPost(postId!)

      // Generate and save schema markup
      const schemaMarkup = generateSchemaMarkup(published)
      await updatePost({ id: postId!, schema_markup: schemaMarkup })

      // Submit to Google Indexing API
      const postUrl = buildPostUrl(published.slug)
      try {
        await submitToGoogleIndexing(postUrl, postId!)
        toast({
          title: 'Published & Submitted!',
          description: 'Your post is live and submitted to Google for indexing.',
        })
      } catch (indexError) {
        console.error('Indexing failed:', indexError)
        toast({
          title: 'Published',
          description: 'Post is live but indexing submission failed. You can retry from the blog management page.',
        })
      }

      navigate('/admin/blog')
    } catch (error) {
      console.error('Failed to publish:', error)
      toast({
        title: 'Publish failed',
        description: error instanceof Error ? error.message : 'Failed to publish post',
        variant: 'destructive',
      })
    } finally {
      setIsPublishing(false)
    }
  }

  const handlePreview = () => {
    // Store current content in sessionStorage for preview
    sessionStorage.setItem('preview-post', JSON.stringify({
      title,
      content,
      excerpt: excerpt || generateExcerpt(content),
      featured_image_url: featuredImageUrl,
      read_time_minutes: calculateReadTime(content),
      author_name: 'Authority Lab Team',
      published_at: new Date().toISOString(),
    }))
    window.open('/blog/preview', '_blank')
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    )
  }

  return (
    <div className="container mx-auto py-8 max-w-5xl">
      {/* Header */}
      <div className="mb-8">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/admin/blog')}
          className="mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Blog Management
        </Button>

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">
              {isEditMode ? 'Edit Blog Post' : 'Create New Blog Post'}
            </h1>
            {isEditMode && (
              <p className="text-gray-600 mt-1">
                Status: <Badge variant={status === 'published' ? 'default' : 'secondary'}>{status}</Badge>
              </p>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handlePreview}>
              <Eye className="w-4 h-4 mr-2" />
              Preview
            </Button>

            <Button
              variant="outline"
              onClick={handleSaveDraft}
              disabled={isSaving || isPublishing}
            >
              {isSaving ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              Save Draft
            </Button>

            <Button
              onClick={handlePublish}
              disabled={isSaving || isPublishing}
            >
              {isPublishing ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Globe className="w-4 h-4 mr-2" />
              )}
              Publish
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Content - 2/3 width */}
        <div className="lg:col-span-2 space-y-6">
          {/* Title */}
          <Card>
            <CardHeader>
              <CardTitle>Post Content</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="title">Title *</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Enter post title..."
                  className="text-lg font-semibold"
                />
              </div>

              <div>
                <Label htmlFor="slug">Slug * (URL)</Label>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500">getonapod.com/blog/</span>
                  <Input
                    id="slug"
                    value={slug}
                    onChange={(e) => setSlug(generateSlug(e.target.value))}
                    placeholder="post-url-slug"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="excerpt">Excerpt (Optional)</Label>
                <Textarea
                  id="excerpt"
                  value={excerpt}
                  onChange={(e) => setExcerpt(e.target.value)}
                  placeholder="Short description for post previews... (auto-generated if empty)"
                  rows={2}
                />
              </div>
            </CardContent>
          </Card>

          {/* Rich Text Editor */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Content *
                <Sparkles className="w-4 h-4 text-purple-600" />
              </CardTitle>
              <CardDescription>
                Use the toolbar to format your content, or click "Generate with AI" to create content automatically.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <RichTextEditor
                content={content}
                onChange={setContent}
                placeholder="Start writing or generate content with AI..."
              />
            </CardContent>
          </Card>
        </div>

        {/* Sidebar - 1/3 width */}
        <div className="space-y-6">
          {/* SEO Settings */}
          <Card>
            <CardHeader>
              <CardTitle>SEO Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="meta-description">Meta Description *</Label>
                <Textarea
                  id="meta-description"
                  value={metaDescription}
                  onChange={(e) => setMetaDescription(e.target.value)}
                  placeholder="Description for search results (150-160 chars)"
                  rows={3}
                  maxLength={160}
                />
                <p className="text-xs text-gray-500 mt-1">
                  {metaDescription.length}/160 characters
                </p>
              </div>

              <div>
                <Label htmlFor="focus-keyword">Focus Keyword</Label>
                <Input
                  id="focus-keyword"
                  value={focusKeyword}
                  onChange={(e) => setFocusKeyword(e.target.value)}
                  placeholder="e.g., podcast booking"
                />
              </div>
            </CardContent>
          </Card>

          {/* Taxonomy */}
          <Card>
            <CardHeader>
              <CardTitle>Category & Tags</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="category">Category</Label>
                <Select value={categoryId} onValueChange={setCategoryId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="tags">Tags</Label>
                <div className="flex gap-2">
                  <Input
                    id="tags"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTag())}
                    placeholder="Add tag..."
                  />
                  <Button type="button" onClick={handleAddTag} size="sm">
                    Add
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                  {tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="cursor-pointer" onClick={() => handleRemoveTag(tag)}>
                      {tag} ×
                    </Badge>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Featured Image */}
          <Card>
            <CardHeader>
              <CardTitle>Featured Image</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="featured-image">Image URL</Label>
                <Input
                  id="featured-image"
                  value={featuredImageUrl}
                  onChange={(e) => setFeaturedImageUrl(e.target.value)}
                  placeholder="https://..."
                />
              </div>

              {featuredImageUrl && (
                <div className="rounded-lg overflow-hidden border">
                  <img
                    src={featuredImageUrl}
                    alt="Featured image preview"
                    className="w-full h-auto"
                    onError={(e) => {
                      e.currentTarget.src = 'https://via.placeholder.com/400x200?text=Invalid+Image+URL'
                    }}
                  />
                </div>
              )}

              <div>
                <Label htmlFor="image-alt">Alt Text</Label>
                <Input
                  id="image-alt"
                  value={featuredImageAlt}
                  onChange={(e) => setFeaturedImageAlt(e.target.value)}
                  placeholder="Describe the image..."
                />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
