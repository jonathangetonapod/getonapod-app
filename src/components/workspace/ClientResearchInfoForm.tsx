import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { CLIENT_RESEARCH_FIELD_LABELS, clientResearchInfoQueryKey, type ClientResearchField } from '@/lib/researchProgress'
import { getWorkspaceClientDetail, updateWorkspaceClient, updateWorkspaceClientProfile } from '@/services/clients'

interface ClientResearchInfoFormProps {
  workspaceId: string
  clientId: string
  /** The fields to offer. Fields already filled on the client are still shown, prefilled. */
  fields: ClientResearchField[]
  saveLabel: string
  /** Runs after the client record is saved, e.g. to retry the blocked research. */
  onSaved?: () => void | Promise<void>
  /** When true (the default), saving waits until every offered field has a value. */
  requireAll?: boolean
}

/**
 * Fills in the client fields research is waiting on, without leaving the page.
 *
 * The bio and the core record are saved through their own actions: the bio
 * through the guarded profile update (it checks the record has not changed
 * since it was read), the rest through the core update rebuilt from the
 * freshest record, so nothing edited elsewhere is reverted.
 */
export const ClientResearchInfoForm = ({ workspaceId, clientId, fields, saveLabel, onSaved, requireAll = true }: ClientResearchInfoFormProps) => {
  const cache = useQueryClient()
  const detailQuery = useQuery({
    queryKey: clientResearchInfoQueryKey(workspaceId, clientId),
    queryFn: () => getWorkspaceClientDetail(workspaceId, clientId),
    retry: false,
  })
  const client = detailQuery.data?.client
  const [values, setValues] = useState<Record<ClientResearchField, string>>({ bio: '', linkedin_url: '', website: '' })
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!client) return
    setValues({ bio: client.bio || '', linkedin_url: client.linkedin_url || '', website: client.website || '' })
  }, [client])

  if (detailQuery.isLoading) {
    return <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Loading client details…</p>
  }
  if (!client) {
    return <p role="alert" className="text-xs text-destructive">Client details could not be loaded. Edit them from the client’s page instead.</p>
  }
  if (detailQuery.data?.can_manage === false) {
    return <p className="text-xs text-muted-foreground">Ask a workspace owner or admin to fill these in on the client’s page.</p>
  }

  const missingAfterEdit = requireAll ? fields.filter((field) => !values[field].trim()) : []
  const changed = fields.some((field) => values[field].trim() !== (client[field] || '').trim())

  const save = async () => {
    if (busy) return
    setBusy(true)
    try {
      if (fields.includes('bio') && values.bio.trim() !== (client.bio || '').trim()) {
        await updateWorkspaceClientProfile(workspaceId, clientId, values.bio, client.updated_at)
      }
      const coreChanged = (['linkedin_url', 'website'] as const)
        .some((field) => fields.includes(field) && values[field].trim() !== (client[field] || '').trim())
      if (coreChanged) {
        const latest = (await getWorkspaceClientDetail(workspaceId, clientId)).client
        await updateWorkspaceClient(workspaceId, clientId, {
          name: latest.name,
          email: latest.email || '',
          contact_person: latest.contact_person || '',
          linkedin_url: fields.includes('linkedin_url') ? values.linkedin_url.trim() : latest.linkedin_url || '',
          website: fields.includes('website') ? values.website.trim() : latest.website || '',
          status: latest.status,
          notes: latest.notes || '',
        })
      }
      await cache.invalidateQueries({ queryKey: clientResearchInfoQueryKey(workspaceId, clientId) })
      toast.success('Client details saved.')
      await onSaved?.()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Client details could not be saved.')
      await detailQuery.refetch()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      {fields.includes('bio') && (
        <div className="space-y-1.5">
          <Label htmlFor={`research-info-bio-${clientId}`} className="text-xs">{CLIENT_RESEARCH_FIELD_LABELS.bio}</Label>
          <Textarea
            id={`research-info-bio-${clientId}`}
            value={values.bio}
            onChange={(event) => setValues({ ...values, bio: event.target.value })}
            rows={4}
            placeholder="Who the client is, what they are known for, and the topics they can speak on."
            className="bg-background"
          />
        </div>
      )}
      {fields.includes('linkedin_url') && (
        <div className="space-y-1.5">
          <Label htmlFor={`research-info-linkedin-${clientId}`} className="text-xs">{CLIENT_RESEARCH_FIELD_LABELS.linkedin_url}</Label>
          <Input
            id={`research-info-linkedin-${clientId}`}
            type="text"
            inputMode="url"
            value={values.linkedin_url}
            onChange={(event) => setValues({ ...values, linkedin_url: event.target.value })}
            placeholder="https://www.linkedin.com/in/…"
            className="bg-background"
          />
        </div>
      )}
      {fields.includes('website') && (
        <div className="space-y-1.5">
          <Label htmlFor={`research-info-website-${clientId}`} className="text-xs">{CLIENT_RESEARCH_FIELD_LABELS.website}</Label>
          <Input
            id={`research-info-website-${clientId}`}
            type="text"
            inputMode="url"
            value={values.website}
            onChange={(event) => setValues({ ...values, website: event.target.value })}
            placeholder="https://…"
            className="bg-background"
          />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" size="sm" disabled={busy || !changed || missingAfterEdit.length > 0} onClick={() => void save()}>
          {busy && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}{saveLabel}
        </Button>
        {missingAfterEdit.length > 0 && <p className="text-xs text-muted-foreground">Fill in every field to continue.</p>}
      </div>
    </div>
  )
}
