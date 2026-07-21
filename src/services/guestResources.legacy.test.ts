import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createGuestResource,
  updateGuestResource,
  type GuestResource,
  type GuestResourceCreateInput,
} from '@/services/guestResources'

const { from, insert, update } = vi.hoisted(() => ({
  from: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({ supabase: { from } }))

const resource: GuestResource = {
  id: '11111111-1111-4111-8111-111111111111',
  title: 'Template',
  description: 'Description',
  content: '<p>Template body</p>',
  category: 'preparation',
  type: 'article',
  url: null,
  file_url: null,
  featured: false,
  display_order: 0,
  created_at: '2026-07-21T00:00:00.000Z',
  updated_at: '2026-07-21T00:00:00.000Z',
}

const baseInput: GuestResourceCreateInput = {
  title: 'Template',
  description: 'Description',
  category: 'preparation',
  type: 'article',
  content: '<p>Template body</p>',
}

describe('legacy platform guest resource writes', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    const createSingle = vi.fn().mockResolvedValue({ data: resource, error: null })
    const createSelect = vi.fn().mockReturnValue({ single: createSingle })
    insert.mockReturnValue({ select: createSelect })

    const updateSingle = vi.fn().mockResolvedValue({ data: resource, error: null })
    const updateSelect = vi.fn().mockReturnValue({ single: updateSingle })
    const updateEq = vi.fn().mockReturnValue({ select: updateSelect })
    update.mockReturnValue({ eq: updateEq })

    from.mockReturnValue({ insert, update })
  })

  it('normalizes create values and preserves explicit false and zero', async () => {
    await expect(createGuestResource({
      ...baseInput,
      title: '  Template  ',
      description: '  Description  ',
      content: '  <p>Template body</p>  ',
      url: '',
      file_url: '   ',
      featured: false,
      display_order: 0,
    })).resolves.toEqual(resource)

    expect(insert).toHaveBeenCalledWith({
      title: 'Template',
      description: 'Description',
      content: '<p>Template body</p>',
      category: 'preparation',
      type: 'article',
      url: null,
      file_url: null,
      featured: false,
      display_order: 0,
    })
  })

  it('normalizes partial updates without dropping false, zero, or explicit clears', async () => {
    await updateGuestResource(resource.id, {
      title: '  Updated template  ',
      content: '',
      url: ' ',
      file_url: null,
      featured: false,
      display_order: 0,
    })

    expect(update).toHaveBeenCalledWith({
      title: 'Updated template',
      content: null,
      url: null,
      file_url: null,
      featured: false,
      display_order: 0,
      updated_at: expect.any(String),
    })
  })

  it('accepts and canonicalizes safe HTTP(S) URLs', async () => {
    await createGuestResource({
      ...baseInput,
      type: 'download',
      url: ' https://example.com/resource ',
      file_url: 'http://files.example.com/guide.pdf',
    })

    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      url: 'https://example.com/resource',
      file_url: 'http://files.example.com/guide.pdf',
    }))
  })

  it.each([
    ['javascript protocol', { url: 'javascript:alert(1)' }, 'Resource URL must be a safe HTTP or HTTPS URL'],
    ['embedded credentials', { file_url: 'https://user:pass@example.com/file' }, 'File URL must be a safe HTTP or HTTPS URL'],
    ['long title', { title: 'x'.repeat(201) }, 'Title must be 200 characters or fewer'],
    ['long description', { description: 'x'.repeat(2001) }, 'Description must be 2,000 characters or fewer'],
    ['long content', { content: 'x'.repeat(100001) }, 'Content must be 100,000 characters or fewer'],
    ['plain-text content', { content: 'Plain text' }, 'Content must be formatted with the resource editor'],
    ['missing article content', { content: null }, 'Article templates require meaningful content'],
    ['empty-looking article content', { content: '<p><br></p>' }, 'Article templates require meaningful content'],
    ['video without URL', { type: 'video', url: '' }, 'Video and link templates require a resource URL'],
    ['download without file URL', { type: 'download', file_url: '' }, 'Download templates require a file URL'],
    ['fractional order', { display_order: 1.5 }, 'Display order must be an integer'],
    ['negative order', { display_order: -1 }, 'Display order must be an integer'],
    ['excessive order', { display_order: 1_000_001 }, 'Display order must be an integer'],
  ])('rejects %s before accessing Supabase', async (_label, patch, message) => {
    await expect(createGuestResource({ ...baseInput, ...patch } as GuestResourceCreateInput)).rejects.toThrow(message as string)
    expect(from).not.toHaveBeenCalled()
  })
})
