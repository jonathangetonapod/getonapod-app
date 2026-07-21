import {
  toAccountMembershipDto,
  toAccountWorkspaceDto,
} from './accountContextDto.ts'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

Deno.test('account membership DTO exposes only the stable browser contract', () => {
  const membership = {
    id: '11111111-1111-4111-8111-111111111111',
    workspace_id: '22222222-2222-4222-8222-222222222222',
    full_name: 'Workspace Owner',
    role: 'owner',
    status: 'active',
    user_id: '33333333-3333-4333-8333-333333333333',
    email_normalized: 'owner@example.com',
    invited_by: '44444444-4444-4444-8444-444444444444',
    accepted_at: '2026-07-21T00:00:00.000Z',
    workspace_access_not_before_epoch: 1,
  }
  const dto = toAccountMembershipDto(membership)

  assert(
    Object.keys(dto).join(',') === 'id,workspace_id,full_name,role,status',
    'membership DTO fields changed',
  )
})

Deno.test('account workspace DTO omits creator and lifecycle metadata', () => {
  const workspace = {
    id: '22222222-2222-4222-8222-222222222222',
    name: 'Private Workspace',
    slug: 'private-workspace',
    status: 'active',
    is_default: false,
    created_by: '44444444-4444-4444-8444-444444444444',
    created_at: '2026-07-21T00:00:00.000Z',
    updated_at: '2026-07-21T00:00:00.000Z',
  }
  const dto = toAccountWorkspaceDto(workspace)

  assert(
    Object.keys(dto).join(',') === 'id,name,slug,status,is_default',
    'workspace DTO fields changed',
  )
})
