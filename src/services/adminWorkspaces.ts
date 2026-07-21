import { supabase } from '@/lib/supabase'
export interface AdminWorkspace {
  id: string
  name: string
  slug: string
  status: 'active' | 'suspended' | 'archived'
  is_default: boolean
}

export interface AdminWorkspaceView {
  workspace: AdminWorkspace
  clients: AdminWorkspaceClient[]
}

export interface AdminWorkspaceClient {
  id: string
  workspace_id: string
  name: string
  email: string | null
  contact_person: string | null
  website: string | null
  status: string
}

const WORKSPACE_CLIENT_COLUMNS = [
  'id',
  'workspace_id',
  'name',
  'email',
  'contact_person',
  'website',
  'status',
].join(',')

export async function listAdminWorkspaces(): Promise<AdminWorkspace[]> {
  const { data, error } = await supabase
    .from('workspaces')
    .select('id,name,slug,status,is_default')
    .eq('is_default', false)
    .eq('status', 'active')
    .order('name', { ascending: true })
    .order('id', { ascending: true })

  if (error) throw new Error('Client workspaces could not be loaded.')
  return (data || []) as AdminWorkspace[]
}

export async function getAdminWorkspaceView(workspaceId: string): Promise<AdminWorkspaceView> {
  const { data: workspaceData, error: workspaceError } = await supabase
    .from('workspaces')
    .select('id,name,slug,status,is_default')
    .eq('id', workspaceId)
    .eq('is_default', false)
    .maybeSingle()

  if (workspaceError) throw new Error('The client workspace could not be loaded.')
  if (!workspaceData || workspaceData.status !== 'active') {
    throw new Error('This client workspace is unavailable or no longer active.')
  }

  const { data: clientsData, error: clientsError } = await supabase
    .from('clients')
    .select(WORKSPACE_CLIENT_COLUMNS)
    .eq('workspace_id', workspaceId)
    .order('name', { ascending: true })
    .order('id', { ascending: true })

  if (clientsError) throw new Error('The workspace clients could not be loaded.')

  return {
    workspace: workspaceData as AdminWorkspace,
    clients: (clientsData || []) as unknown as AdminWorkspaceClient[],
  }
}
