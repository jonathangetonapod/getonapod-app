export interface AccountMembershipRecord {
  id: string
  workspace_id: string
  full_name: string | null
  role: string
  status: string
}

export interface AccountMembershipDto {
  id: string
  workspace_id: string
  full_name: string | null
  role: string
  status: string
}

export interface AccountWorkspaceRecord {
  id: string
  name: string
  slug: string | null
  status: string
  is_default: boolean
}

export interface AccountWorkspaceDto {
  id: string
  name: string
  slug: string | null
  status: string
  is_default: boolean
}

export function toAccountMembershipDto(
  membership: AccountMembershipRecord,
): AccountMembershipDto {
  return {
    id: membership.id,
    workspace_id: membership.workspace_id,
    full_name: membership.full_name,
    role: membership.role,
    status: membership.status,
  }
}

export function toAccountWorkspaceDto(
  workspace: AccountWorkspaceRecord,
): AccountWorkspaceDto {
  return {
    id: workspace.id,
    name: workspace.name,
    slug: workspace.slug,
    status: workspace.status,
    is_default: workspace.is_default,
  }
}
