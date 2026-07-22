import { useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Eye, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import type {
  OnboardingDefinition,
  OnboardingMapping,
  OnboardingQuestion,
  OnboardingQuestionType,
  OnboardingTemplate,
} from '@/services/workspaceOnboarding'
import { onboardingQuestionTypes } from '@/services/workspaceOnboarding'

export interface OnboardingTemplateDraft {
  name: string
  description: string
  definition: OnboardingDefinition
  reminder_days: number[]
}

interface Props {
  open: boolean
  template: OnboardingTemplate | null
  saving: boolean
  onOpenChange: (open: boolean) => void
  onSave: (draft: OnboardingTemplateDraft, publish: boolean, makeDefault: boolean) => void
}

const typeLabels: Record<OnboardingQuestionType, string> = {
  short_text: 'Short text',
  long_text: 'Long text',
  email: 'Email',
  url: 'URL',
  single_select: 'Single select',
  multi_select: 'Multi-select',
  yes_no: 'Yes / No',
  date: 'Date',
  image_upload: 'Image upload',
  document_upload: 'PDF upload',
}

const mappingLabels: Record<OnboardingMapping, string> = {
  'client.name': 'Client name',
  'client.email': 'Client email',
  'client.contact_person': 'Contact person',
  'client.website': 'Website',
  'client.linkedin_url': 'LinkedIn URL',
  'client.calendar_link': 'Calendar link',
  'client.bio': 'Client bio',
}

const compatibleMappings = (type: OnboardingQuestionType): OnboardingMapping[] => {
  if (type === 'email') return ['client.email']
  if (type === 'url') return ['client.website', 'client.linkedin_url', 'client.calendar_link']
  if (type === 'long_text') return ['client.bio']
  if (type === 'short_text') return ['client.name', 'client.contact_person']
  return []
}

const generatedId = (prefix: 'section' | 'question' | 'option') =>
  `${prefix}_${crypto.randomUUID().replace(/-/gu, '').slice(0, 10)}`

const blankQuestion = (): OnboardingQuestion => ({
  id: generatedId('question'),
  type: 'short_text',
  label: 'New question',
  description: '',
  required: false,
  placeholder: '',
  mapping: null,
})

const blankDefinition = (): OnboardingDefinition => ({
  schema_version: 1,
  intro_title: 'Let’s build your podcast guest profile',
  intro_body: 'Share the experience, stories, and ideas that make you a compelling podcast guest.',
  completion_message: 'Thank you. Your agency will review your answers and follow up if anything needs clarification.',
  sections: [{
    id: generatedId('section'),
    title: 'About you',
    description: '',
    questions: [blankQuestion()],
  }],
})

const emptyDraft = (): OnboardingTemplateDraft => ({
  name: 'Podcast Guest Onboarding',
  description: '',
  definition: blankDefinition(),
  reminder_days: [3, 7, 12],
})

function move<T>(values: T[], from: number, to: number): T[] {
  if (to < 0 || to >= values.length) return values
  const result = [...values]
  const [item] = result.splice(from, 1)
  result.splice(to, 0, item)
  return result
}

const OnboardingTemplateBuilder = ({ open, template, saving, onOpenChange, onSave }: Props) => {
  const [draft, setDraft] = useState<OnboardingTemplateDraft>(emptyDraft)
  const [preview, setPreview] = useState(false)
  const [makeDefault, setMakeDefault] = useState(false)
  const [reminderText, setReminderText] = useState('3, 7, 12')
  const [builderError, setBuilderError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    const next = template
      ? {
          name: template.name,
          description: template.description,
          definition: structuredClone(template.definition),
          reminder_days: [...template.reminder_days],
        }
      : emptyDraft()
    setDraft(next)
    setReminderText(next.reminder_days.join(', '))
    setMakeDefault(template?.is_default ?? false)
    setPreview(false)
    setBuilderError(null)
  }, [open, template])

  const questionCount = useMemo(
    () => draft.definition.sections.reduce((total, section) => total + section.questions.length, 0),
    [draft.definition.sections],
  )

  const setDefinition = (updater: (definition: OnboardingDefinition) => OnboardingDefinition) => {
    setDraft((current) => ({ ...current, definition: updater(current.definition) }))
  }

  const updateSection = (sectionIndex: number, updates: Partial<OnboardingDefinition['sections'][number]>) => {
    setDefinition((definition) => ({
      ...definition,
      sections: definition.sections.map((section, index) => index === sectionIndex ? { ...section, ...updates } : section),
    }))
  }

  const updateQuestion = (sectionIndex: number, questionIndex: number, updates: Partial<OnboardingQuestion>) => {
    setDefinition((definition) => ({
      ...definition,
      sections: definition.sections.map((section, index) => index === sectionIndex
        ? {
            ...section,
            questions: section.questions.map((question, innerIndex) => innerIndex === questionIndex
              ? { ...question, ...updates }
              : question),
          }
        : section),
    }))
  }

  const parseReminders = (): number[] => {
    const values = reminderText.split(',').map((value) => value.trim()).filter(Boolean)
    if (values.length > 10) throw new Error('Use no more than 10 reminder days.')
    const days = values.map(Number)
    if (days.some((day) => !Number.isSafeInteger(day) || day < 1 || day > 89)) {
      throw new Error('Reminder days must be whole numbers from 1 to 89.')
    }
    return [...new Set(days)].sort((left, right) => left - right)
  }

  const submit = (publish: boolean) => {
    try {
      const reminderDays = parseReminders()
      if (!draft.name.trim()) throw new Error('Enter a template name.')
      if (!draft.definition.intro_title.trim() || !draft.definition.intro_body.trim() || !draft.definition.completion_message.trim()) {
        throw new Error('Complete the client intro title, intro text, and completion message.')
      }
      const questions = draft.definition.sections.flatMap((section) => {
        if (!section.title.trim()) throw new Error('Every section needs a title.')
        return section.questions
      })
      if (questions.some((question) => !question.label.trim())) {
        throw new Error('Every question needs a label.')
      }
      if (questions.some((question) => (
        question.type === 'single_select' || question.type === 'multi_select'
      ) && (!question.options?.length || question.options.some((option) => !option.label.trim())))) {
        throw new Error('Every select question needs at least one labeled option.')
      }
      const mappings = questions
        .map((question) => question.mapping)
        .filter((mapping): mapping is OnboardingMapping => mapping !== null)
      if (new Set(mappings).size !== mappings.length) {
        throw new Error('Each client field can be mapped only once.')
      }
      setBuilderError(null)
      onSave({ ...draft, reminder_days: reminderDays }, publish, makeDefault)
    } catch (error) {
      setBuilderError(error instanceof Error ? error.message : 'The template is invalid.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-6xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{template ? 'Edit onboarding template' : 'Create onboarding template'}</DialogTitle>
          <DialogDescription>Build up to 12 sections and 100 questions. Publishing creates an immutable version for future invitations.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/30 p-3">
          <div className="text-sm text-muted-foreground">{draft.definition.sections.length} sections · {questionCount} questions</div>
          <Button type="button" variant={preview ? 'default' : 'outline'} size="sm" onClick={() => setPreview((value) => !value)}>
            <Eye className="mr-2 h-4 w-4" />{preview ? 'Edit builder' : 'Preview form'}
          </Button>
        </div>

        {preview ? (
          <div className="mx-auto w-full max-w-3xl space-y-6 rounded-2xl border bg-background p-6 shadow-sm">
            <div><h2 className="text-2xl font-bold">{draft.definition.intro_title}</h2><p className="mt-2 text-muted-foreground">{draft.definition.intro_body}</p></div>
            {draft.definition.sections.map((section, sectionIndex) => (
              <div key={section.id} className="space-y-4 rounded-xl border p-5">
                <div><p className="text-xs font-semibold uppercase tracking-wider text-primary">Section {sectionIndex + 1}</p><h3 className="text-xl font-semibold">{section.title}</h3><p className="text-sm text-muted-foreground">{section.description}</p></div>
                {section.questions.map((question) => (
                  <div key={question.id} className="space-y-1.5">
                    <Label>{question.label}{question.required && <span className="text-destructive"> *</span>}</Label>
                    <div className="min-h-10 rounded-md border bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
                      {question.type === 'single_select' || question.type === 'multi_select'
                        ? question.options?.map((option) => option.label).join(' · ')
                        : question.placeholder || typeLabels[question.type]}
                    </div>
                    {question.description && <p className="text-xs text-muted-foreground">{question.description}</p>}
                  </div>
                ))}
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2"><Label htmlFor="template-name">Template name</Label><Input id="template-name" value={draft.name} maxLength={120} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} /></div>
              <div className="space-y-2"><Label htmlFor="reminder-days">Reminder days after invitation</Label><Input id="reminder-days" value={reminderText} placeholder="3, 7, 12" onChange={(event) => setReminderText(event.target.value)} /><p className="text-xs text-muted-foreground">Leave empty for no reminders. Reminders stop after submission, approval, revocation, or expiry.</p></div>
              <div className="space-y-2 md:col-span-2"><Label htmlFor="template-description">Internal description</Label><Textarea id="template-description" value={draft.description} maxLength={1000} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} /></div>
              <div className="space-y-2"><Label htmlFor="intro-title">Client intro title</Label><Input id="intro-title" value={draft.definition.intro_title} maxLength={300} onChange={(event) => setDefinition((definition) => ({ ...definition, intro_title: event.target.value }))} /></div>
              <div className="space-y-2"><Label htmlFor="completion-message">Completion message</Label><Input id="completion-message" value={draft.definition.completion_message} maxLength={2000} onChange={(event) => setDefinition((definition) => ({ ...definition, completion_message: event.target.value }))} /></div>
              <div className="space-y-2 md:col-span-2"><Label htmlFor="intro-body">Client intro</Label><Textarea id="intro-body" value={draft.definition.intro_body} maxLength={3000} onChange={(event) => setDefinition((definition) => ({ ...definition, intro_body: event.target.value }))} /></div>
            </div>

            {draft.definition.sections.map((section, sectionIndex) => (
              <div key={section.id} className="space-y-4 rounded-2xl border bg-card p-4 sm:p-5">
                <div className="flex flex-wrap items-start gap-2">
                  <div className="grid min-w-0 flex-1 gap-3 md:grid-cols-2">
                    <div className="space-y-1.5"><Label>Section title</Label><Input value={section.title} maxLength={200} onChange={(event) => updateSection(sectionIndex, { title: event.target.value })} /></div>
                    <div className="space-y-1.5"><Label>Section description</Label><Input value={section.description} maxLength={1000} onChange={(event) => updateSection(sectionIndex, { description: event.target.value })} /></div>
                  </div>
                  <div className="flex gap-1">
                    <Button type="button" size="icon" variant="ghost" aria-label="Move section up" disabled={sectionIndex === 0} onClick={() => setDefinition((definition) => ({ ...definition, sections: move(definition.sections, sectionIndex, sectionIndex - 1) }))}><ArrowUp className="h-4 w-4" /></Button>
                    <Button type="button" size="icon" variant="ghost" aria-label="Move section down" disabled={sectionIndex === draft.definition.sections.length - 1} onClick={() => setDefinition((definition) => ({ ...definition, sections: move(definition.sections, sectionIndex, sectionIndex + 1) }))}><ArrowDown className="h-4 w-4" /></Button>
                    <Button type="button" size="icon" variant="ghost" aria-label="Remove section" disabled={draft.definition.sections.length === 1} onClick={() => setDefinition((definition) => ({ ...definition, sections: definition.sections.filter((_, index) => index !== sectionIndex) }))}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </div>
                </div>

                <div className="space-y-3">
                  {section.questions.map((question, questionIndex) => {
                    const mappings = compatibleMappings(question.type)
                    const optionsText = question.options?.map((option) => option.label).join('\n') ?? ''
                    return (
                      <div key={question.id} className="space-y-3 rounded-xl border bg-background p-4">
                        <div className="flex flex-wrap items-start gap-2">
                          <div className="grid min-w-0 flex-1 gap-3 lg:grid-cols-[1.5fr_1fr_1fr]">
                            <div className="space-y-1.5"><Label>Question</Label><Input value={question.label} maxLength={300} onChange={(event) => updateQuestion(sectionIndex, questionIndex, { label: event.target.value })} /></div>
                            <div className="space-y-1.5"><Label>Field type</Label><Select value={question.type} onValueChange={(value) => {
                              const nextType = value as OnboardingQuestionType
                              updateQuestion(sectionIndex, questionIndex, {
                              type: nextType,
                              mapping: compatibleMappings(nextType).includes(question.mapping as OnboardingMapping) ? question.mapping : null,
                              ...(nextType === 'single_select' || nextType === 'multi_select'
                                ? { options: question.options?.length ? question.options : [{ id: generatedId('option'), label: 'Option 1' }] }
                                : { options: undefined }),
                            })
                            }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{onboardingQuestionTypes.map((type) => <SelectItem key={type} value={type}>{typeLabels[type]}</SelectItem>)}</SelectContent></Select></div>
                            <div className="space-y-1.5"><Label>Client mapping</Label><Select value={question.mapping ?? 'none'} onValueChange={(value) => updateQuestion(sectionIndex, questionIndex, { mapping: value === 'none' ? null : value as OnboardingMapping })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">No mapping</SelectItem>{mappings.map((mapping) => <SelectItem key={mapping} value={mapping}>{mappingLabels[mapping]}</SelectItem>)}</SelectContent></Select></div>
                          </div>
                          <div className="flex gap-1">
                            <Button type="button" size="icon" variant="ghost" aria-label="Move question up" disabled={questionIndex === 0} onClick={() => updateSection(sectionIndex, { questions: move(section.questions, questionIndex, questionIndex - 1) })}><ArrowUp className="h-4 w-4" /></Button>
                            <Button type="button" size="icon" variant="ghost" aria-label="Move question down" disabled={questionIndex === section.questions.length - 1} onClick={() => updateSection(sectionIndex, { questions: move(section.questions, questionIndex, questionIndex + 1) })}><ArrowDown className="h-4 w-4" /></Button>
                            <Button type="button" size="icon" variant="ghost" aria-label="Remove question" disabled={section.questions.length === 1} onClick={() => updateSection(sectionIndex, { questions: section.questions.filter((_, index) => index !== questionIndex) })}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                          </div>
                        </div>
                        <div className="grid gap-3 md:grid-cols-2">
                          <div className="space-y-1.5"><Label>Help text</Label><Input value={question.description} maxLength={1000} onChange={(event) => updateQuestion(sectionIndex, questionIndex, { description: event.target.value })} /></div>
                          <div className="space-y-1.5"><Label>Placeholder</Label><Input value={question.placeholder} maxLength={500} onChange={(event) => updateQuestion(sectionIndex, questionIndex, { placeholder: event.target.value })} /></div>
                        </div>
                        {(question.type === 'single_select' || question.type === 'multi_select') && (
                          <div className="space-y-1.5"><Label>Options, one per line</Label><Textarea value={optionsText} onChange={(event) => updateQuestion(sectionIndex, questionIndex, {
                            options: event.target.value.split('\n').map((label, index) => ({
                              id: question.options?.[index]?.id ?? generatedId('option'),
                              label,
                            })).filter((option) => option.label.trim()).slice(0, 50),
                          })} /></div>
                        )}
                        <div className="flex items-center gap-2"><Checkbox id={`${question.id}-required`} checked={question.required} onCheckedChange={(checked) => updateQuestion(sectionIndex, questionIndex, { required: checked === true })} /><Label htmlFor={`${question.id}-required`}>Required</Label></div>
                      </div>
                    )
                  })}
                  <Button type="button" variant="outline" size="sm" disabled={questionCount >= 100} onClick={() => updateSection(sectionIndex, { questions: [...section.questions, blankQuestion()] })}><Plus className="mr-2 h-4 w-4" />Add question</Button>
                </div>
              </div>
            ))}

            <Button type="button" variant="outline" disabled={draft.definition.sections.length >= 12 || questionCount >= 100} onClick={() => setDefinition((definition) => ({
              ...definition,
              sections: [...definition.sections, { id: generatedId('section'), title: 'New section', description: '', questions: [blankQuestion()] }],
            }))}><Plus className="mr-2 h-4 w-4" />Add section</Button>
          </div>
        )}

        <div className="flex items-center justify-between rounded-xl border p-3">
          <div><Label htmlFor="default-template">Make this the default when published</Label><p className="text-xs text-muted-foreground">The default is preselected for new invitations.</p></div>
          <Switch id="default-template" checked={makeDefault} onCheckedChange={setMakeDefault} />
        </div>

        {builderError && <p role="alert" className="text-sm font-medium text-destructive">{builderError}</p>}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="button" variant="secondary" disabled={saving} onClick={() => submit(false)}>Save draft</Button>
          <Button type="button" disabled={saving} onClick={() => submit(true)}>{saving ? 'Saving…' : 'Save & publish'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default OnboardingTemplateBuilder
