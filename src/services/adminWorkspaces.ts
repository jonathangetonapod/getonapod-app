import { supabase } from '@/lib/supabase'
import type { WorkspaceClient } from '@/services/clients'

export interface AdminWorkspace {
  id: string
  name: string
  slug: string
  status: 'active' | 'suspended' | 'archived'
  is_default: boolean
}

export interface AdminWorkspaceView {
  workspace: AdminWorkspace
  viewer: AdminWorkspaceViewer
  clients: WorkspaceClient[]
}

export interface AdminWorkspaceViewer {
  workspace_id: string
  email: string
  full_name: string | null
  role: 'owner'
}

interface AdminWorkspaceOwnerCandidate {
  workspace_id: string
  email_normalized?: string
  full_name?: string | null
  role: 'owner'
  status: 'provisioning' | 'invited' | 'active' | 'suspended' | 'revoked'
  provisioning_method: 'platform_bootstrap' | 'email_invite' | 'admin_temporary_password'
  password_change_required: boolean
}

function isPreviewableOwner(owner: AdminWorkspaceOwnerCandidate): boolean {
  return owner.status === 'active'
    || (
      owner.status === 'invited'
      && owner.provisioning_method === 'admin_temporary_password'
      && owner.password_change_required
    )
}

const WORKSPACE_CLIENT_COLUMNS = [
  'id',
  'workspace_id',
  'name',
  'email',
  'contact_person',
  'linkedin_url',
  'website',
  'status',
  'notes',
  'created_at',
  'updated_at',
].join(',')

export async function listAdminWorkspaces(): Promise<AdminWorkspace[]> {
  const { data: workspaceData, error: workspaceError } = await supabase
    .from('workspaces')
    .select('id,name,slug,status,is_default')
    .eq('is_default', false)
    .eq('status', 'active')
    .order('name', { ascending: true })
    .order('id', { ascending: true })

  if (workspaceError) throw new Error('Client workspaces could not be loaded.')

  const workspaces = (workspaceData || []) as AdminWorkspace[]
  if (workspaces.length === 0) return []

  const { data: membershipData, error: membershipError } = await supabase
    .from('workspace_memberships')
    .select('workspace_id,status,provisioning_method,password_change_required')
    .in('workspace_id', workspaces.map((workspace) => workspace.id))
    .eq('role', 'owner')
    .in('status', ['active', 'invited'])

  if (membershipError) throw new Error('Client workspaces could not be loaded.')

  const previewableWorkspaceIds = new Set(
    ((membershipData || []) as AdminWorkspaceOwnerCandidate[])
      .filter(isPreviewableOwner)
      .map((membership) => membership.workspace_id),
  )
  return workspaces.filter((workspace) => previewableWorkspaceIds.has(workspace.id))
}

export async function getAdminWorkspaceView(workspaceId: string, signal?: AbortSignal): Promise<AdminWorkspaceView> {
  const canonicalWorkspaceId = workspaceId.toLowerCase()
  let workspaceQuery = supabase
    .from('workspaces')
    .select('id,name,slug,status,is_default')
    .eq('id', canonicalWorkspaceId)
    .eq('is_default', false)
  if (signal) workspaceQuery = workspaceQuery.abortSignal(signal)
  const { data: workspaceData, error: workspaceError } = await workspaceQuery.maybeSingle()

  if (workspaceError) throw new Error('The client workspace could not be loaded.')
  if (!workspaceData || workspaceData.status !== 'active') {
    throw new Error('This client workspace is unavailable or no longer active.')
  }
  if (workspaceData.id !== canonicalWorkspaceId || workspaceData.is_default) {
    throw new Error('The workspace preview response did not match the selected workspace.')
  }

  let viewerQuery = supabase
    .from('workspace_memberships')
    .select('workspace_id,email_normalized,full_name,role,status,provisioning_method,password_change_required')
    .eq('workspace_id', canonicalWorkspaceId)
    .eq('role', 'owner')
    .in('status', ['active', 'invited'])
    .order('id', { ascending: true })
  if (signal) viewerQuery = viewerQuery.abortSignal(signal)
  const { data: viewerData, error: viewerError } = await viewerQuery

  if (viewerError) throw new Error('The workspace owner could not be loaded.')
  const previewableOwners = ((viewerData || []) as AdminWorkspaceOwnerCandidate[])
    .filter(isPreviewableOwner)
  const viewer = previewableOwners.length === 1 ? previewableOwners[0] : null
  if (
    !viewer
    || viewer.workspace_id !== canonicalWorkspaceId
    || viewer.role !== 'owner'
    || !isPreviewableOwner(viewer)
    || !viewer.email_normalized
  ) {
    throw new Error('This client workspace does not have an available owner to preview.')
  }

  let clientsQuery = supabase
    .from('clients')
    .select(WORKSPACE_CLIENT_COLUMNS)
    .eq('workspace_id', canonicalWorkspaceId)
    .order('name', { ascending: true })
    .order('id', { ascending: true })
  if (signal) clientsQuery = clientsQuery.abortSignal(signal)
  const { data: clientsData, error: clientsError } = await clientsQuery

  if (clientsError) throw new Error('The workspace clients could not be loaded.')

  const clients = (clientsData || []) as unknown as WorkspaceClient[]
  if (clients.some((client) => client.workspace_id !== canonicalWorkspaceId)) {
    throw new Error('The workspace preview response did not match the selected workspace.')
  }

  return {
    workspace: workspaceData as AdminWorkspace,
    viewer: {
      workspace_id: viewer.workspace_id,
      email: viewer.email_normalized,
      full_name: viewer.full_name ?? null,
      role: viewer.role,
    },
    clients,
  }
}
