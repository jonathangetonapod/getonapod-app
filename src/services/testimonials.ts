import { supabase } from '@/lib/supabase'

export interface Testimonial {
  id: string
  video_url: string
  client_name: string
  client_title?: string
  client_company?: string
  client_photo_url?: string
  quote?: string
  is_featured: boolean
  display_order: number
  is_active: boolean
  created_at: string
  updated_at: string
  created_by?: string
}

export interface CreateTestimonialInput {
  video_url: string
  client_name: string
  client_title?: string
  client_company?: string
  client_photo_url?: string
  quote?: string
  is_featured?: boolean
  display_order?: number
  is_active?: boolean
}

export interface UpdateTestimonialInput extends Partial<CreateTestimonialInput> {
  id: string
}

// Get all testimonials (admin view)
export const getAllTestimonials = async (): Promise<Testimonial[]> => {
  const { data, error } = await supabase
    .from('testimonials')
    .select('*')
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: false })

  if (error) throw error
  return data || []
}

// Get active testimonials (public view)
export const getActiveTestimonials = async (): Promise<Testimonial[]> => {
  const { data, error } = await supabase
    .from('testimonials')
    .select('*')
    .eq('is_active', true)
    .order('display_order', { ascending: true })

  if (error) throw error
  return data || []
}

// Get featured testimonials (for homepage)
export const getFeaturedTestimonials = async (): Promise<Testimonial[]> => {
  const { data, error } = await supabase
    .from('testimonials')
    .select('*')
    .eq('is_active', true)
    .eq('is_featured', true)
    .order('display_order', { ascending: true })

  if (error) throw error
  return data || []
}

// Get single testimonial by ID
export const getTestimonialById = async (id: string): Promise<Testimonial | null> => {
  const { data, error } = await supabase
    .from('testimonials')
    .select('*')
    .eq('id', id)
    .single()

  if (error) throw error
  return data
}

// Create new testimonial
export const createTestimonial = async (input: CreateTestimonialInput): Promise<Testimonial> => {
  const { data: { user } } = await supabase.auth.getUser()

  const { data, error } = await supabase
    .from('testimonials')
    .insert({
      ...input,
      created_by: user?.id
    })
    .select()
    .single()

  if (error) throw error
  return data
}

// Update testimonial
export const updateTestimonial = async (input: UpdateTestimonialInput): Promise<Testimonial> => {
  const { id, ...updates } = input

  const { data, error } = await supabase
    .from('testimonials')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

// Delete testimonial
export const deleteTestimonial = async (id: string): Promise<void> => {
  const { error } = await supabase
    .from('testimonials')
    .delete()
    .eq('id', id)

  if (error) throw error
}

// Toggle featured status
export const toggleFeatured = async (id: string, isFeatured: boolean): Promise<Testimonial> => {
  const { data, error } = await supabase
    .from('testimonials')
    .update({ is_featured: isFeatured })
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

// Toggle active status
export const toggleActive = async (id: string, isActive: boolean): Promise<Testimonial> => {
  const { data, error } = await supabase
    .from('testimonials')
    .update({ is_active: isActive })
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

// Helper function to extract a video ID only from approved HTTPS hosts.
export const extractVideoId = (url: string): { platform: 'youtube' | 'vimeo' | 'unknown', id: string } => {
  try {
    const parsedUrl = new URL(url)
    if (parsedUrl.protocol !== 'https:') return { platform: 'unknown', id: '' }

    const hostname = parsedUrl.hostname.toLowerCase()
    const youtubeIdPattern = /^[a-zA-Z0-9_-]{11}$/

    if (hostname === 'youtu.be') {
      const id = parsedUrl.pathname.split('/').filter(Boolean)[0] || ''
      return youtubeIdPattern.test(id)
        ? { platform: 'youtube', id }
        : { platform: 'unknown', id: '' }
    }

    if (['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(hostname)) {
      const pathMatch = parsedUrl.pathname.match(/^\/(?:embed|shorts|live|v)\/([a-zA-Z0-9_-]{11})\/?$/)
      const id = pathMatch?.[1] || (parsedUrl.pathname === '/watch' ? parsedUrl.searchParams.get('v') : '') || ''
      return youtubeIdPattern.test(id)
        ? { platform: 'youtube', id }
        : { platform: 'unknown', id: '' }
    }

    if (['vimeo.com', 'www.vimeo.com'].includes(hostname)) {
      const match = parsedUrl.pathname.match(/^\/(\d{1,20})\/?$/)
      return match
        ? { platform: 'vimeo', id: match[1] }
        : { platform: 'unknown', id: '' }
    }

    if (hostname === 'player.vimeo.com') {
      const match = parsedUrl.pathname.match(/^\/video\/(\d{1,20})\/?$/)
      return match
        ? { platform: 'vimeo', id: match[1] }
        : { platform: 'unknown', id: '' }
    }
  } catch {
    // Invalid URLs are deliberately not embeddable.
  }

  return { platform: 'unknown', id: '' }
}

// Get embed URL for video platforms
export const getEmbedUrl = (url: string): string | null => {
  const { platform, id } = extractVideoId(url)

  if (platform === 'youtube') {
    return `https://www.youtube.com/embed/${id}`
  }

  if (platform === 'vimeo') {
    return `https://player.vimeo.com/video/${id}`
  }

  return null
}

// Get thumbnail URL for video platforms
export const getThumbnailUrl = (url: string): string => {
  const { platform, id } = extractVideoId(url)

  if (platform === 'youtube') {
    return `https://img.youtube.com/vi/${id}/maxresdefault.jpg`
  }

  if (platform === 'vimeo') {
    // Vimeo thumbnails require API call, return placeholder
    return 'https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?w=400'
  }

  return 'https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?w=400'
}
