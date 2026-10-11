import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import WorkspaceOnboarding from '@/pages/app/WorkspaceOnboarding'
import { useAuth } from '@/contexts/AuthContext'
import {
  listWorkspaceOnboarding,
  publishOnboardingTemplate,
  saveOnboardingTemplate,
  type OnboardingInstanceSummary,
  type OnboardingTemplate,
  type WorkspaceOnboardingData,
} from '@/services/workspaceOnboarding'

vi.mock('@/contexts/AuthContext', () => ({ useAuth: vi.fn() }))
vi.mock('@/components/workspace/WorkspaceLayout', () => ({
  WorkspaceLayout: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))
vi.mock('@/services/workspaceOnboarding', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/workspaceOnboarding')>()
  return {
    ...actual,
    listWorkspaceOnboarding: vi.fn(),
    saveOnboardingTemplate: vi.fn(),
    publishOnboardingTemplate: vi.fn(),
  }
})

const mockedUseAuth = vi.mocked(useAuth)
const mockedList = vi.mocked(listWorkspaceOnboarding)
const mockedSave = vi.mocked(saveOnboardingTemplate)
const mockedPublish = vi.mocked(publishOnboardingTemplate)

const workspaceId = '11111111-1111-4111-8111-111111111111'
const signOut = vi.fn()

const template: OnboardingTemplate = {
  id: '33333333-3333-4333-8333-333333333333',
  workspace_id: workspaceId,
  name: 'Guest intake',
  description: '',
  status: 'published',
  definition: {
    schema_version: 1,
    intro_title: 'Welcome',
    intro_body: 'Hello.',
    completion_message: 'Thanks.',
    sections: [{ id: 'basics', title: 'Basics', description: '', questions: [] }],
  },
  published_definition: null,
  has_unpublished_changes: false,
  reminder_days: [],
  published_version: 1,
  is_default: true,
  created_at: '2026-10-01T00:00:00.000Z',
  updated_at: '2026-10-01T00:00:00.000Z',
  archived_at: null,
}

const instance = (overrides: Partial<OnboardingInstanceSummary>): OnboardingInstanceSummary => ({
  id: '55555555-5555-4555-8555-555555555555',
  workspace_id: workspaceId,
  client_id: '66666666-6666-4666-8666-666666666666',
  template_version_id: '44444444-4444-4444-8444-444444444444',
  template_id: template.id,
  template_name: 'Guest intake',
  template_version: 1,
  client_name: 'Client One',
  recipient_name: 'Casey',
  recipient_email: 'casey@example.com',
  status: 'approved',
  capability_generation: 1,
  capability_expires_at: '2026-12-01T00:00:00.000Z',
  current_revision: 1,
  created_at: '2026-10-01T00:00:00.000Z',
  updated_at: '2026-10-01T00:00:00.000Z',
  invited_at: '2026-10-01T00:00:00.000Z',
  viewed_at: null,
  started_at: null,
  submitted_at: null,
  changes_requested_at: null,
  approved_at: null,
  revoked_at: null,
  archived_at: null,
  progress_section: 0,
  draft_lock_version: 0,
  open_comment_count: 0,
  profile_status: null,
  delivery: null,
  ...overrides,
})

const listData = (overrides: Partial<WorkspaceOnboardingData> = {}): WorkspaceOnboardingData => ({
  workspace: {
    id: workspaceId,
    name: 'Acme Agency',
    logo_path: null,
    logo_updated_at: null,
    client_contact_email: null,
    client_brand_accent_color: null,
  },
  email_delivery: { configured: true },
  viewer_role: 'owner',
  can_manage: true,
  templates: [],
  clients: [],
  assignable_members: [],
  instances: [],
  ...overrides,
})

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <WorkspaceOnboarding />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('WorkspaceOnboarding', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedUseAuth.mockReturnValue({
      user: { id: '22222222-2222-4222-8222-222222222222' },
      workspace: { id: workspaceId, name: 'Acme Agency' },
      signOut,
    } as never)
  })

  it('offers the starter form when no template is published, and publishes it in one click', async () => {
    mockedList.mockResolvedValue(listData())
    mockedSave.mockResolvedValue({ ...template, status: 'draft' })
    mockedPublish.mockResolvedValue(template)
    renderPage()

    expect(await screen.findByText('Set up your intake form first')).toBeInTheDocument()
    // Polls and first loads never carry the client list.
    expect(mockedList).toHaveBeenCalledWith(workspaceId, ['templates', 'instances'])
    fireEvent.click(screen.getAllByRole('button', { name: /Use the starter form/u })[0])

    await waitFor(() => expect(mockedPublish).toHaveBeenCalledWith(workspaceId, template.id, true))
    expect(mockedSave.mock.calls[0][1]).toMatchObject({ name: 'Starter client intake' })
  })

  it('publishes the saved starter draft on retry instead of creating another copy', async () => {
    const draft = { ...template, status: 'draft' as const, is_default: false }
    mockedList.mockResolvedValueOnce(listData()).mockResolvedValue(listData({ templates: [draft] }))
    mockedSave.mockResolvedValue(draft)
    mockedPublish.mockRejectedValueOnce(new Error('publish failed')).mockResolvedValue(template)
    renderPage()

    fireEvent.click((await screen.findAllByRole('button', { name: /Use the starter form/u }))[0])
    await waitFor(() => expect(mockedPublish).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(mockedList.mock.calls.length).toBeGreaterThan(1))
    fireEvent.click((await screen.findAllByRole('button', { name: /Use the starter form/u }))[0])

    await waitFor(() => expect(mockedPublish).toHaveBeenCalledTimes(2))
    expect(mockedSave).toHaveBeenCalledTimes(1)
    expect(mockedPublish.mock.calls[1][1]).toBe(template.id)
  })

  it('tells a member with no assignments that nothing has been shared yet', async () => {
    mockedList.mockResolvedValue(listData({ can_manage: false, viewer_role: 'member', templates: [template] }))
    renderPage()
    expect(await screen.findByText('Nothing has been shared with you yet')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Start onboarding/u })).not.toBeInTheDocument()
  })

  it('leaves archived rows out of the summary counts', async () => {
    mockedList.mockResolvedValue(listData({
      templates: [template],
      instances: [
        instance({}),
        instance({ id: '77777777-7777-4777-8777-777777777777', archived_at: '2026-10-05T00:00:00.000Z' }),
      ],
    }))
    renderPage()
    const approved = await screen.findByRole('button', { name: /^Approved/u })
    expect(approved).toHaveTextContent('Approved1')
    expect(approved).toHaveAttribute('aria-pressed', 'false')
  })

  it('says when invitation emails cannot be sent and when delivery is unknown', async () => {
    mockedList.mockResolvedValue(listData({
      email_delivery: { configured: false },
      templates: [template],
      instances: [instance({
        status: 'invited',
        delivery: { kind: 'invitation', status: 'unknown', last_error: null, attempted_at: null, sent_at: null },
      })],
    }))
    renderPage()
    expect(await screen.findByText('Invitation emails are not set up')).toBeInTheDocument()
    expect(screen.getByText(/Delivery unknown/u)).toBeInTheDocument()
  })

  it('offers a sign-out when the sign-in is out of date', async () => {
    mockedList.mockRejectedValue(Object.assign(new Error('Your sign-in is out of date.'), { code: 'REAUTHENTICATION_REQUIRED' }))
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: /Sign out and sign in again/u }))
    expect(signOut).toHaveBeenCalledTimes(1)
  })
})
