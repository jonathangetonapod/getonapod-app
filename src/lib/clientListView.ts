import type { WorkspaceClient } from '@/services/clients'

export type ClientStatusFilter = 'all' | 'active' | 'paused' | 'churned'
export type ClientListSort = 'status' | 'name' | 'updated' | 'brief'

export const CLIENT_STATUS_FILTER_LABELS: Record<ClientStatusFilter, string> = {
  all: 'All statuses',
  active: 'Active',
  paused: 'Paused',
  churned: 'Churned',
}

export const CLIENT_SORT_LABELS: Record<ClientListSort, string> = {
  status: 'Active first',
  name: 'Name A to Z',
  updated: 'Recently updated',
  brief: 'Host brief, least done first',
}

// Active work first; churned clients sit at the bottom, never between active ones.
const STATUS_RANK: Record<WorkspaceClient['status'], number> = { active: 0, paused: 1, churned: 2 }

type ListClient = Pick<WorkspaceClient, 'name' | 'status' | 'email' | 'contact_person' | 'website' | 'updated_at'> & {
  ai_sdr_profile_ready?: boolean
  ai_sdr_profile_completed_fields?: number | null
  ai_sdr_profile_total_fields?: number | null
  host_brief?: { approved_required: number; total_required: number; ready: boolean } | null
}

const byName = (left: ListClient, right: ListClient) => left.name.localeCompare(right.name, undefined, { sensitivity: 'base' })

function briefProgress(client: ListClient): number {
  if (client.host_brief) return client.host_brief.ready ? 1 : client.host_brief.approved_required / client.host_brief.total_required
  if (client.ai_sdr_profile_ready) return 1
  const total = client.ai_sdr_profile_total_fields || 6
  return Math.min(1, (client.ai_sdr_profile_completed_fields || 0) / total)
}

/** The Clients table: searched, filtered by status, then sorted. */
export function clientListView<T extends ListClient>(
  clients: T[],
  { search, status, sort }: { search: string; status: ClientStatusFilter; sort: ClientListSort },
): T[] {
  const query = search.trim().toLowerCase()
  return clients
    .filter((client) => status === 'all' || client.status === status)
    .filter((client) => !query || [client.name, client.contact_person, client.email, client.website]
      .some((value) => value?.toLowerCase().includes(query)))
    .sort((left, right) => {
      if (sort === 'name') return byName(left, right)
      if (sort === 'updated') return (right.updated_at || '').localeCompare(left.updated_at || '') || byName(left, right)
      if (sort === 'brief') return briefProgress(left) - briefProgress(right) || STATUS_RANK[left.status] - STATUS_RANK[right.status] || byName(left, right)
      return STATUS_RANK[left.status] - STATUS_RANK[right.status] || byName(left, right)
    })
}
