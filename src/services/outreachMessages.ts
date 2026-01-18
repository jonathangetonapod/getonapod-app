import { supabase } from '@/lib/supabase'

export interface OutreachMessage {
  id: string
  client_id: string
  podcast_id: string | null
  podcast_name: string
  podcast_url: string | null
  host_name: string
  host_email: string
  subject_line: string
  email_body: string
  bison_campaign_id: string | null
  personalization_data: Record<string, unknown> | null
  status: 'pending_review' | 'approved' | 'sent' | 'failed' | 'archived'
  priority: 'high' | 'medium' | 'low' | null
  scheduled_send_at: string | null
  sent_at: string | null
  email_platform_response: Record<string, unknown> | null
  error_message: string | null
  created_by: string
  created_at: string
  updated_at: string
}

export interface OutreachMessageWithClient extends OutreachMessage {
  client: {
    id: string
    name: string
    photo_url: string | null
  }
}

/**
 * Get all outreach messages with optional filtering
 */
export async function getOutreachMessages(options?: {
  clientId?: string
  campaignId?: string
  status?: string
  limit?: number
}) {
  let query = supabase
    .from('outreach_messages')
    .select(`
      *,
      client:clients(id, name, photo_url)
    `)
    .order('created_at', { ascending: false })

  if (options?.clientId) {
    query = query.eq('client_id', options.clientId)
  }

  if (options?.campaignId) {
    query = query.eq('bison_campaign_id', options.campaignId)
  }

  if (options?.status) {
    query = query.eq('status', options.status)
  }

  if (options?.limit) {
    query = query.limit(options.limit)
  }

  const { data, error } = await query

  if (error) {
    throw new Error(`Failed to fetch outreach messages: ${error.message}`)
  }

  return data as OutreachMessageWithClient[]
}

/**
 * Update outreach message
 */
export async function updateOutreachMessage(
  id: string,
  updates: Partial<OutreachMessage>
) {
  const { data, error } = await supabase
    .from('outreach_messages')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to update outreach message: ${error.message}`)
  }

  return data as OutreachMessage
}

/**
 * Delete outreach message
 */
export async function deleteOutreachMessage(id: string) {
  const { error } = await supabase
    .from('outreach_messages')
    .delete()
    .eq('id', id)

  if (error) {
    throw new Error(`Failed to delete outreach message: ${error.message}`)
  }
}

/**
 * Get message counts grouped by status
 */
export async function getOutreachStats(clientId?: string) {
  let query = supabase
    .from('outreach_messages')
    .select('status', { count: 'exact' })

  if (clientId) {
    query = query.eq('client_id', clientId)
  }

  const { data, error, count } = await query

  if (error) {
    throw new Error(`Failed to fetch outreach stats: ${error.message}`)
  }

  const stats = {
    total: count || 0,
    pending_review: 0,
    approved: 0,
    sent: 0,
    failed: 0
  }

  data?.forEach((row: any) => {
    if (row.status in stats) {
      stats[row.status as keyof typeof stats]++
    }
  })

  return stats
}
