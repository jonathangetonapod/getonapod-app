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
    .select('workspace_id')
    .in('workspace_id', workspaces.map((workspace) => workspace.id))
    .eq('role', 'owner')
    .eq('status', 'active')

  if (membershipError) throw new Error('Client workspaces could not be loaded.')

  const previewableWorkspaceIds = new Set(
    (membershipData || []).map((membership) => membership.workspace_id),
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
    .select('workspace_id,email_normalized,full_name,role,status')
    .eq('workspace_id', canonicalWorkspaceId)
    .eq('role', 'owner')
    .eq('status', 'active')
    .order('id', { ascending: true })
    .limit(1)
  if (signal) viewerQuery = viewerQuery.abortSignal(signal)
  const { data: viewerData, error: viewerError } = await viewerQuery.maybeSingle()

  if (viewerError) throw new Error('The workspace owner could not be loaded.')
  if (
    !viewerData
    || viewerData.workspace_id !== canonicalWorkspaceId
    || viewerData.role !== 'owner'
    || viewerData.status !== 'active'
    || !viewerData.email_normalized
  ) {
    throw new Error('This client workspace does not have an active owner to preview.')
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
      workspace_id: viewerData.workspace_id,
      email: viewerData.email_normalized,
      full_name: viewerData.full_name,
      role: viewerData.role,
    },
    clients,
  }
}
