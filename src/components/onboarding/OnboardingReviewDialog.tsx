import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, ExternalLink, Loader2, MessageSquareMore, Sparkles } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { emptyPitchProfile, type OnboardingAssignableMember, type OnboardingInstanceDetail, type OnboardingQuestion, type PitchProfile } from '@/services/workspaceOnboarding'

interface Props {
  open: boolean
  detail: OnboardingInstanceDetail | null
  canManage: boolean
  busy: boolean
  assignableMembers: OnboardingAssignableMember[]
  onOpenChange: (open: boolean) => void
  onRequestChanges: (comments: Array<{ question_id: string; body: string }>) => void
  onSaveProfile: (profile: PitchProfile) => void
  onApprove: (profile: PitchProfile) => void
  onRetryAi: () => void
  onSaveAssignments: (membershipIds: string[]) => void
}

const listFields: Array<keyof Pick<PitchProfile, 'expertise' | 'key_messages' | 'story_angles' | 'talking_points' | 'suggested_show_fit'>> = [
  'expertise',
  'key_messages',
  'story_angles',
  'talking_points',
  'suggested_show_fit',
]

const fieldLabels: Record<keyof PitchProfile, string> = {
  professional_bio: 'Professional bio',
  positioning_summary: 'Positioning summary',
  expertise: 'Expertise and themes',
  key_messages: 'Key messages',
  story_angles: 'Story angles',
  talking_points: 'Talking points',
  ideal_audience: 'Ideal audience',
  suggested_show_fit: 'Suggested show fit',
}

function validProfile(value: unknown): value is PitchProfile {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const source = value as Record<string, unknown>
  return typeof source.professional_bio === 'string'
    && typeof source.positioning_summary === 'string'
    && typeof source.ideal_audience === 'string'
    && listFields.every((field) => Array.isArray(source[field]))
}

function displayAnswer(question: OnboardingQuestion, answer: unknown): string {
  if (answer === undefined || answer === null || answer === '') return 'Not answered'
  if (question.type === 'yes_no') return answer === true ? 'Yes' : 'No'
  if (question.type === 'single_select' && typeof answer === 'string') {
    return question.options?.find((option) => option.id === answer)?.label ?? answer
  }
  if (question.type === 'multi_select' && Array.isArray(answer)) {
    return answer.map((entry) => question.options?.find((option) => option.id === entry)?.label ?? String(entry)).join(', ')
  }
  if (question.type === 'image_upload' || question.type === 'document_upload') return 'Uploaded file'
  return String(answer)
}

const OnboardingReviewDialog = ({
  open,
  detail,
  canManage,
  busy,
  assignableMembers,
  onOpenChange,
  onRequestChanges,
  onSaveProfile,
  onApprove,
  onRetryAi,
  onSaveAssignments,
}: Props) => {
  const [comments, setComments] = useState<Record<string, string>>({})
  const [profile, setProfile] = useState<PitchProfile>(emptyPitchProfile)
  const [assignedMembershipIds, setAssignedMembershipIds] = useState<string[]>([])

  useEffect(() => {
    if (!open || !detail) return
    setComments({})
    setProfile(validProfile(detail.profile?.content) ? structuredClone(detail.profile.content) : structuredClone(emptyPitchProfile))
    setAssignedMembershipIds([...detail.assigned_membership_ids])
  }, [detail, open])

  const assetByQuestion = useMemo(
    () => new Map(detail?.assets.map((asset) => [asset.question_id, asset]) ?? []),
    [detail?.assets],
  )
  if (!detail) return null

  const newComments = Object.entries(comments)
    .map(([question_id, body]) => ({ question_id, body: body.trim() }))
    .filter((comment) => comment.body)
  const profileReady = profile.professional_bio.trim()
    && profile.positioning_summary.trim()
    && profile.ideal_audience.trim()
    && listFields.every((field) => profile[field].length > 0 && profile[field].every((item) => item.trim()))
  const assignmentsChanged = [...assignedMembershipIds].sort().join(',')
    !== [...detail.assigned_membership_ids].sort().join(',')

  const setProfileText = (field: 'professional_bio' | 'positioning_summary' | 'ideal_audience', value: string) => {
    setProfile((current) => ({ ...current, [field]: value }))
  }
  const setProfileList = (field: typeof listFields[number], value: string) => {
    setProfile((current) => ({
      ...current,
      [field]: value.split('\n').map((item) => item.trim()).filter(Boolean),
    }))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[94vh] max-w-6xl overflow-y-auto">
        <DialogHeader>
          <div className="flex flex-wrap items-center gap-2">
            <DialogTitle>{detail.client_name}</DialogTitle>
            <Badge className="capitalize">{detail.status.replace(/_/gu, ' ')}</Badge>
            <Badge variant="outline">Revision {detail.current_revision}</Badge>
          </div>
          <DialogDescription>{detail.template_name} v{detail.template_version} · Submitted {detail.submitted_at ? new Date(detail.submitted_at).toLocaleString() : 'not yet'}</DialogDescription>
        </DialogHeader>

        {detail.status === 'changes_requested' && (
          <Alert><MessageSquareMore className="h-4 w-4" /><AlertTitle>Changes requested</AlertTitle><AlertDescription>The client can see every open question note below and resubmit a new immutable revision.</AlertDescription></Alert>
        )}

        <div className="grid gap-6 xl:grid-cols-[1.25fr_.75fr]">
          <div className="space-y-5">
            {detail.definition.sections.map((section) => (
              <section key={section.id} className="rounded-2xl border bg-card p-5">
                <h3 className="text-lg font-semibold">{section.title}</h3>
                {section.description && <p className="mt-1 text-sm text-muted-foreground">{section.description}</p>}
                <div className="mt-4 divide-y">
                  {section.questions.map((question) => {
                    const answer = detail.answers[question.id]
                    const asset = assetByQuestion.get(question.id)
                    const existingComments = detail.comments.filter((comment) => comment.question_id === question.id)
                    return (
                      <div key={question.id} className="space-y-2 py-4 first:pt-0 last:pb-0">
                        <p className="text-sm font-semibold">{question.label}</p>
                        {asset ? asset.signed_url ? (
                          <a className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline" href={asset.signed_url} target="_blank" rel="noreferrer">
                            {asset.original_name}<ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        ) : (
                          <span className="text-sm text-muted-foreground">{asset.original_name} · preview unavailable</span>
                        ) : (
                          <p className="whitespace-pre-wrap text-sm leading-6 text-foreground/85">{displayAnswer(question, answer)}</p>
                        )}
                        {existingComments.map((comment) => (
                          <div key={comment.id} className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                            <div className="mb-1 flex items-center justify-between gap-2"><span className="font-semibold">Review note</span><Badge variant="outline" className="capitalize">{comment.status}</Badge></div>
                            {comment.body}
                          </div>
                        ))}
                        {canManage && detail.status === 'submitted' && (
                          <Textarea
                            aria-label={`Review note for ${question.label}`}
                            value={comments[question.id] ?? ''}
                            maxLength={2000}
                            placeholder="Add a question-level change request…"
                            onChange={(event) => setComments((current) => ({ ...current, [question.id]: event.target.value }))}
                          />
                        )}
                      </div>
                    )
                  })}
                </div>
              </section>
            ))}
          </div>

          <aside className="space-y-4">
            {canManage && (
              <div className="rounded-2xl border bg-card p-5">
                <h3 className="font-semibold">Assigned team members</h3>
                <p className="mt-1 text-sm text-muted-foreground">Assigned members receive read-only access to this onboarding.</p>
                {assignableMembers.length > 0 ? (
                  <div className="mt-4 space-y-2">
                    {assignableMembers.map((member) => (
                      <label key={member.id} className="flex items-center gap-3 rounded-lg border p-3 text-sm">
                        <Checkbox
                          checked={assignedMembershipIds.includes(member.id)}
                          disabled={busy}
                          onCheckedChange={(checked) => setAssignedMembershipIds((current) => checked === true
                            ? current.includes(member.id) ? current : [...current, member.id]
                            : current.filter((id) => id !== member.id))}
                        />
                        <span>{member.full_name || member.email}</span>
                      </label>
                    ))}
                    <Button type="button" size="sm" variant="outline" disabled={busy || !assignmentsChanged} onClick={() => onSaveAssignments(assignedMembershipIds)}>Save assignments</Button>
                  </div>
                ) : <p className="mt-3 text-sm text-muted-foreground">No active workspace members are available.</p>}
              </div>
            )}
            <div className="rounded-2xl border bg-card p-5">
              <div className="flex items-start justify-between gap-3">
                <div><h3 className="font-semibold">Pitch profile draft</h3><p className="text-sm text-muted-foreground">AI output is always editable and never publishes automatically.</p></div>
                {detail.profile?.status && <Badge variant="outline" className="capitalize">{detail.profile.status}</Badge>}
              </div>
              {detail.profile?.status === 'pending' && <p className="mt-3 text-sm text-muted-foreground">The first draft is still pending. Retry if it does not appear.</p>}
              {detail.profile?.status === 'failed' && <Alert variant="destructive" className="mt-3"><AlertTitle>AI draft unavailable</AlertTitle><AlertDescription>{detail.profile.generation_error || 'You can retry or write the profile manually.'}</AlertDescription></Alert>}
              {canManage && detail.status === 'submitted' && detail.profile?.status !== 'generated' && detail.profile?.status !== 'edited' && (
                <Button type="button" variant="outline" size="sm" className="mt-3" disabled={busy} onClick={onRetryAi}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}Generate AI draft</Button>
              )}
              <div className="mt-4 space-y-4">
                {(['professional_bio', 'positioning_summary', 'ideal_audience'] as const).map((field) => (
                  <div key={field} className="space-y-1.5"><Label>{fieldLabels[field]}</Label><Textarea value={profile[field]} disabled={!canManage || detail.status !== 'submitted'} rows={field === 'professional_bio' ? 8 : 4} onChange={(event) => setProfileText(field, event.target.value)} /></div>
                ))}
                {listFields.map((field) => (
                  <div key={field} className="space-y-1.5"><Label>{fieldLabels[field]} <span className="font-normal text-muted-foreground">(one per line)</span></Label><Textarea value={profile[field].join('\n')} disabled={!canManage || detail.status !== 'submitted'} rows={4} onChange={(event) => setProfileList(field, event.target.value)} /></div>
                ))}
              </div>
            </div>
          </aside>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          {canManage && detail.status === 'submitted' && (
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="button" variant="outline" disabled={busy || newComments.length === 0} onClick={() => onRequestChanges(newComments)}><MessageSquareMore className="mr-2 h-4 w-4" />Request changes</Button>
              <Button type="button" variant="secondary" disabled={busy || !profileReady} onClick={() => onSaveProfile(profile)}>Save profile draft</Button>
              <Button type="button" disabled={busy || !profileReady} onClick={() => onApprove(profile)}><CheckCircle2 className="mr-2 h-4 w-4" />Approve & finalize</Button>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default OnboardingReviewDialog
