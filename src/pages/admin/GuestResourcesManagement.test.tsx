import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import GuestResourcesManagement from '@/pages/admin/GuestResourcesManagement'
import {
  createGuestResource,
  deleteGuestResource,
  getGuestResources,
  updateGuestResource,
} from '@/services/guestResources'
import { toast } from 'sonner'

vi.mock('@/components/admin/DashboardLayout', () => ({ DashboardLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }))
vi.mock('@/components/GuestResourceEditor', () => ({
  GuestResourceEditor: ({ content, onChange }: { content: string; onChange: (value: string) => void }) => (
    <textarea aria-label="Content" value={content} onChange={(event) => onChange(event.target.value)} />
  ),
}))
vi.mock('@/services/guestResources', () => ({
  createGuestResource: vi.fn(),
  deleteGuestResource: vi.fn(),
  getGuestResources: vi.fn(),
  updateGuestResource: vi.fn(),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const mockedCreate = vi.mocked(createGuestResource)
const mockedDelete = vi.mocked(deleteGuestResource)
const mockedList = vi.mocked(getGuestResources)
const mockedUpdate = vi.mocked(updateGuestResource)
const mockedToast = vi.mocked(toast)

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <GuestResourcesManagement />
    </QueryClientProvider>,
  )
}

describe('GuestResourcesManagement legacy template editor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedList.mockResolvedValue([])
    mockedCreate.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      title: 'New template',
      description: 'Description',
      content: null,
      category: 'preparation',
      type: 'article',
      url: null,
      file_url: null,
      featured: false,
      display_order: 0,
      created_at: '2026-07-21T00:00:00.000Z',
      updated_at: '2026-07-21T00:00:00.000Z',
    })
    mockedDelete.mockResolvedValue(undefined)
    mockedUpdate.mockResolvedValue({} as never)
  })

  it('trims required/content fields, clears empty URLs, and preserves false and zero', async () => {
    renderPage()
    const addButtons = await screen.findAllByRole('button', { name: 'Add Resource' })
    fireEvent.click(addButtons[0])

    const dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Title *'), { target: { value: '  New template  ' } })
    fireEvent.change(within(dialog).getByLabelText('Description *'), { target: { value: '  Description  ' } })
    fireEvent.change(within(dialog).getByLabelText('Content'), { target: { value: '  <p>Body content</p>  ' } })
    expect(within(dialog).getByLabelText('Display Order')).toHaveValue(0)
    expect(within(dialog).getByLabelText('Featured Resource')).not.toBeChecked()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create' }))

    await waitFor(() => expect(mockedCreate).toHaveBeenCalledWith({
      title: 'New template',
      description: 'Description',
      content: '<p>Body content</p>',
      category: 'preparation',
      type: 'article',
      url: null,
      file_url: null,
      featured: false,
      display_order: 0,
    }))
  })

  it('blocks credential-bearing URLs before calling the service', async () => {
    renderPage()
    const addButtons = await screen.findAllByRole('button', { name: 'Add Resource' })
    fireEvent.click(addButtons[0])

    const dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Title *'), { target: { value: 'Link template' } })
    fireEvent.change(within(dialog).getByLabelText('Description *'), { target: { value: 'Description' } })
    fireEvent.click(within(dialog).getByRole('combobox', { name: 'Type' }))
    fireEvent.click(await screen.findByRole('option', { name: 'External Link' }))
    fireEvent.change(await within(dialog).findByLabelText('URL *'), { target: { value: 'https://user:pass@example.com/private' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create' }))

    expect(mockedCreate).not.toHaveBeenCalled()
    expect(mockedToast.error).toHaveBeenCalledWith(
      'Resource URL must be a safe HTTP or HTTPS URL without credentials',
    )
  })
})
