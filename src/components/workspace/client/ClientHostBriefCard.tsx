import { useState } from 'react'
import { CheckCircle2, Loader2, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { Accordion } from '@/components/ui/accordion'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ClientBriefSectionRow } from '@/components/workspace/client/ClientBriefSectionRow'
import {
  CLIENT_SDR_PROFILE_FIELD_DEFINITIONS,
  clientBriefStatus,
  normalizeClientSdrProfile,
  type ClientSdrProfile,
  type ClientSdrProfileField,
} from '@/lib/clientSdrProfile'
import { draftWorkspaceClientSdrProfile, updateWorkspaceClientSdrProfile } from '@/services/clients'

// The draft is built from the source profile, so it needs one worth reading.
const MIN_SOURCE_LENGTH = 40

interface ClientHostBriefCardProps {
  workspaceId: string
  clientId: string
  bio: string | null
  profile: Partial<ClientSdrProfile> | null | undefined
  approvedFields: ClientSdrProfileField[]
  profileUpdatedAt: string | null
  canManage: boolean
  /** e.g. " · 2 credits", or empty on the workspace's own key. */
  generateCostSuffix: string
  onSaved: () => Promise<unknown>
}

const REQUIRED_FIELDS = CLIENT_SDR_PROFILE_FIELD_DEFINITIONS.filter((field) => field.core)
const OPTIONAL_FIELDS = CLIENT_SDR_PROFILE_FIELD_DEFINITIONS.filter((field) => !field.core)

/*
 * The host brief as one card: what the AI uses, how far along it is, and the
 * sections themselves. Each section is written (or generated), then approved;
 * the brief is ready when the four required sections are approved.
 */
export const ClientHostBriefCard = ({
  workspaceId,
  clientId,
  bio,
  profile,
  approvedFields,
  profileUpdatedAt,
  canManage,
  generateCostSuffix,
  onSaved,
}: ClientHostBriefCardProps) => {
  const saved = normalizeClientSdrProfile(profile)
  const status = clientBriefStatus(saved, approvedFields)
  const [edits, setEdits] = useState<Partial<ClientSdrProfile>>({})
  const [open, setOpen] = useState<string[]>([])
  const [busyField, setBusyField] = useState<ClientSdrProfileField | null>(null)
  const [generating, setGenerating] = useState(false)
  const sourceReady = (bio ?? '').trim().length >= MIN_SOURCE_LENGTH
  const hasEmptySection = Object.values(status.sections).some((section) => section === 'empty')

  const valueOf = (field: ClientSdrProfileField) => edits[field] ?? saved[field]
  const isDirty = (field: ClientSdrProfileField) => edits[field] !== undefined && edits[field]!.trim() !== saved[field]

  const saveSection = async (field: ClientSdrProfileField, approve: boolean) => {
    if (!canManage || busyField || generating) return
    const text = valueOf(field).trim()
    const nextApproved = approvedFields.filter((approved) => approved !== field)
    if (approve && text) nextApproved.push(field)
    setBusyField(field)
    try {
      await updateWorkspaceClientSdrProfile(
        workspaceId,
        clientId,
        { ...saved, [field]: text },
        profileUpdatedAt,
        nextApproved,
      )
      await onSaved()
      setEdits(({ [field]: _done, ...rest }) => rest)
      toast.success(approve ? 'Section approved.' : 'Draft saved.')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The host brief could not be saved.'
      toast.error(message)
      if (/changed since you opened/i.test(message)) await onSaved()
    } finally {
      setBusyField(null)
    }
  }

  // Fills only empty sections and saves them as drafts, so a paid draft is
  // never lost to a refresh and nothing written by hand is replaced.
  const generate = async () => {
    if (!canManage || generating || busyField || !sourceReady) return
    setGenerating(true)
    try {
      const result = await draftWorkspaceClientSdrProfile(workspaceId, clientId)
      const next = { ...saved }
      const filled: ClientSdrProfileField[] = []
      for (const field of CLIENT_SDR_PROFILE_FIELD_DEFINITIONS) {
        const value = result.draft[field.id]
        if (!next[field.id] && typeof value === 'string' && value.trim()) {
          next[field.id] = value.trim()
          filled.push(field.id)
        }
      }
      if (filled.length === 0) {
        toast.info('Every section already has text. Clear one to generate it again.')
        return
      }
      await updateWorkspaceClientSdrProfile(workspaceId, clientId, next, profileUpdatedAt, approvedFields)
      await onSaved()
      setOpen([filled.find((field) => REQUIRED_FIELDS.some((required) => required.id === field)) ?? filled[0]])
      toast.success(`Drafted ${filled.length} section${filled.length === 1 ? '' : 's'}. Review each one and approve it.`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The host brief could not be generated.')
    } finally {
      setGenerating(false)
    }
  }

  const row = (field: typeof CLIENT_SDR_PROFILE_FIELD_DEFINITIONS[number]) => (
    <ClientBriefSectionRow
      key={field.id}
      field={field}
      status={status.sections[field.id]}
      value={valueOf(field.id)}
      dirty={isDirty(field.id)}
      canManage={canManage}
      busy={busyField === field.id || generating}
      onChange={(value) => setEdits((current) => ({ ...current, [field.id]: value }))}
      onSave={() => void saveSection(field.id, false)}
      onApprove={() => void saveSection(field.id, true)}
    />
  )

  const generateButton = (variant: 'default' | 'outline') => (
    <Button type="button" variant={variant} size={variant === 'default' ? 'default' : 'sm'} disabled={generating || Boolean(busyField) || !sourceReady} onClick={() => void generate()}>
      {generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
      {generating ? 'Generating…' : variant === 'default' ? `Generate from profile${generateCostSuffix}` : `Fill empty sections${generateCostSuffix}`}
    </Button>
  )

  return (
    <Card data-testid="client-host-brief">
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <div className="min-w-0">
          <CardTitle className="text-lg">Host brief</CardTitle>
          <CardDescription className="mt-1">What the AI uses to research shows and write pitches.</CardDescription>
        </div>
        {status.ready ? (
          <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-800">
            <CheckCircle2 className="mr-1 h-3.5 w-3.5" aria-hidden="true" />Brief ready
          </Badge>
        ) : (
          <Badge variant="outline" className="tabular-nums">{status.approved_required} of {status.total_required} required</Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {canManage && !status.started && (
          <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              {sourceReady
                ? 'Draft all six sections from the source profile, then review and approve each one.'
                : 'Add a source profile of at least a few sentences first. The brief is generated from it.'}
            </p>
            {generateButton('default')}
          </div>
        )}
        {canManage && status.started && hasEmptySection && sourceReady && (
          <div className="flex justify-end">{generateButton('outline')}</div>
        )}

        <Accordion type="multiple" value={open} onValueChange={setOpen}>
          {REQUIRED_FIELDS.map(row)}
        </Accordion>
        <div className="flex items-center gap-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <span>Optional</span><span className="h-px flex-1 bg-border" />
        </div>
        <Accordion type="multiple" value={open} onValueChange={setOpen}>
          {OPTIONAL_FIELDS.map(row)}
        </Accordion>

        <p className="text-xs text-muted-foreground">Saving the brief never sends a message or turns on automation.</p>
      </CardContent>
    </Card>
  )
}
