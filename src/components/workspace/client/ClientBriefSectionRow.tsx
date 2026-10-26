import { Check, Loader2 } from 'lucide-react'
import { AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  CLIENT_SDR_PROFILE_FIELD_DEFINITIONS,
  CLIENT_SDR_PROFILE_MAX_FIELD_LENGTH,
  type ClientBriefSectionStatus,
} from '@/lib/clientSdrProfile'

type BriefField = typeof CLIENT_SDR_PROFILE_FIELD_DEFINITIONS[number]

const STATUS_LABELS: Record<ClientBriefSectionStatus, string> = {
  empty: 'Empty',
  draft: 'Draft',
  approved: 'Approved',
}

const STATUS_CLASSES: Record<ClientBriefSectionStatus, string> = {
  empty: 'text-muted-foreground',
  draft: 'border-amber-200 bg-amber-50 text-amber-800',
  approved: 'border-emerald-200 bg-emerald-50 text-emerald-800',
}

interface ClientBriefSectionRowProps {
  field: BriefField
  status: ClientBriefSectionStatus
  /** The text in the editor: the saved text, or an unsaved edit of it. */
  value: string
  dirty: boolean
  canManage: boolean
  busy: boolean
  onChange: (value: string) => void
  onSave: () => void
  onApprove: () => void
}

export const ClientBriefSectionRow = ({
  field,
  status,
  value,
  dirty,
  canManage,
  busy,
  onChange,
  onSave,
  onApprove,
}: ClientBriefSectionRowProps) => {
  const hasText = value.trim().length > 0
  // Saving an edit makes the section a draft again; approving saves it too.
  const shownStatus: ClientBriefSectionStatus = dirty ? (hasText ? 'draft' : 'empty') : status
  const inputId = `client-brief-${field.id}`

  return (
    <AccordionItem value={field.id} className="border-b last:border-b-0">
      <AccordionTrigger className="gap-3 py-3 text-left hover:no-underline">
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
          <span className="font-medium">{field.label}</span>
          <Badge variant="outline" className={`text-[11px] font-medium ${STATUS_CLASSES[shownStatus]}`}>
            {dirty ? 'Unsaved' : STATUS_LABELS[shownStatus]}
          </Badge>
        </span>
      </AccordionTrigger>
      <AccordionContent className="space-y-3 pb-4">
        <p className="text-sm text-muted-foreground">{field.description}</p>
        {canManage ? (
          <>
            <Label htmlFor={inputId} className="sr-only">{field.label}</Label>
            <Textarea
              id={inputId}
              value={value}
              maxLength={CLIENT_SDR_PROFILE_MAX_FIELD_LENGTH}
              disabled={busy}
              placeholder={field.placeholder}
              className="min-h-[140px] resize-y leading-6"
              onChange={(event) => onChange(event.target.value)}
            />
            <div className="flex flex-wrap items-center justify-end gap-2">
              {dirty && (
                <Button type="button" variant="outline" size="sm" disabled={busy} onClick={onSave}>
                  Save draft
                </Button>
              )}
              {shownStatus === 'approved' ? (
                <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-800">
                  <Check className="h-4 w-4" aria-hidden="true" />Approved
                </span>
              ) : (
                <Button type="button" size="sm" disabled={busy || !hasText} onClick={onApprove}>
                  {busy && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}Approve
                </Button>
              )}
            </div>
          </>
        ) : value ? (
          <p className="whitespace-pre-wrap text-sm leading-6 text-foreground/85">{value}</p>
        ) : (
          <p className="text-sm italic text-muted-foreground">Not written yet.</p>
        )}
      </AccordionContent>
    </AccordionItem>
  )
}
