import { useEffect, useMemo, useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  Copy,
  Eye,
  FileText,
  LayoutList,
  Plus,
  Settings2,
  Trash2,
  UploadCloud,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
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

type BuilderMode = 'build' | 'settings' | 'preview'
type OnboardingSection = OnboardingDefinition['sections'][number]

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
  prefix + '_' + crypto.randomUUID().replace(/-/gu, '').slice(0, 10)

const blankQuestion = (): OnboardingQuestion => ({
  id: generatedId('question'),
  type: 'short_text',
  label: 'New question',
  description: '',
  required: false,
  placeholder: '',
  mapping: null,
})

const blankSection = (): OnboardingSection => ({
  id: generatedId('section'),
  title: 'New section',
  description: '',
  questions: [blankQuestion()],
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

function duplicateQuestion(question: OnboardingQuestion): OnboardingQuestion {
  return {
    ...structuredClone(question),
    id: generatedId('question'),
    label: (question.label.trim() || 'Untitled question') + ' copy',
    mapping: null,
    options: question.options?.map((option) => ({
      ...option,
      id: generatedId('option'),
    })),
  }
}

function duplicateSection(section: OnboardingSection): OnboardingSection {
  return {
    ...structuredClone(section),
    id: generatedId('section'),
    title: (section.title.trim() || 'Untitled section') + ' copy',
    questions: section.questions.map(duplicateQuestion),
  }
}

const PreviewControl = ({ question }: { question: OnboardingQuestion }) => {
  if (question.type === 'long_text') {
    return (
      <div className="h-24 rounded-lg border bg-background px-3 py-2 text-sm text-muted-foreground">
        {question.placeholder || 'Long-form response'}
      </div>
    )
  }

  if (question.type === 'single_select' || question.type === 'multi_select') {
    return (
      <div className="flex flex-wrap gap-2">
        {(question.options ?? []).map((option) => (
          <span key={option.id} className="rounded-full border bg-background px-3 py-1.5 text-sm text-muted-foreground">
            {option.label || 'Untitled option'}
          </span>
        ))}
      </div>
    )
  }

  if (question.type === 'yes_no') {
    return (
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg border bg-background px-3 py-2 text-center text-sm text-muted-foreground">Yes</div>
        <div className="rounded-lg border bg-background px-3 py-2 text-center text-sm text-muted-foreground">No</div>
      </div>
    )
  }

  if (question.type === 'image_upload' || question.type === 'document_upload') {
    return (
      <div className="flex min-h-20 items-center justify-center gap-2 rounded-lg border border-dashed bg-background text-sm text-muted-foreground">
        <UploadCloud className="h-4 w-4" />
        {question.type === 'image_upload' ? 'Choose an image' : 'Choose a PDF'}
      </div>
    )
  }

  return (
    <div className="rounded-lg border bg-background px-3 py-2 text-sm text-muted-foreground">
      {question.placeholder || typeLabels[question.type]}
    </div>
  )
}

const OnboardingTemplateBuilder = ({ open, template, saving, onOpenChange, onSave }: Props) => {
  const [draft, setDraft] = useState<OnboardingTemplateDraft>(emptyDraft)
  const [mode, setMode] = useState<BuilderMode>('build')
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null)
  const [activeQuestionId, setActiveQuestionId] = useState<string | null>(null)
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
    const firstSection = next.definition.sections[0]
    setDraft(next)
    setReminderText(next.reminder_days.join(', '))
    setMakeDefault(template?.is_default ?? false)
    setMode('build')
    setActiveSectionId(firstSection?.id ?? null)
    setActiveQuestionId(firstSection?.questions[0]?.id ?? null)
    setBuilderError(null)
  }, [open, template])

  const questionCount = useMemo(
    () => draft.definition.sections.reduce((total, section) => total + section.questions.length, 0),
    [draft.definition.sections],
  )

  const activeSectionIndex = Math.max(
    0,
    draft.definition.sections.findIndex((section) => section.id === activeSectionId),
  )
  const activeSection = draft.definition.sections[activeSectionIndex]

  const setDefinition = (updater: (definition: OnboardingDefinition) => OnboardingDefinition) => {
    setDraft((current) => ({ ...current, definition: updater(current.definition) }))
  }

  const updateSection = (sectionIndex: number, updates: Partial<OnboardingSection>) => {
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

  const selectSection = (section: OnboardingSection) => {
    setActiveSectionId(section.id)
    setActiveQuestionId(section.questions[0]?.id ?? null)
  }

  const addSection = () => {
    if (draft.definition.sections.length >= 12 || questionCount >= 100) return
    const section = blankSection()
    setDefinition((definition) => ({ ...definition, sections: [...definition.sections, section] }))
    setActiveSectionId(section.id)
    setActiveQuestionId(section.questions[0].id)
  }

  const copyActiveSection = () => {
    if (!activeSection || draft.definition.sections.length >= 12) return
    if (questionCount + activeSection.questions.length > 100) return
    const copy = duplicateSection(activeSection)
    setDefinition((definition) => {
      const sections = [...definition.sections]
      sections.splice(activeSectionIndex + 1, 0, copy)
      return { ...definition, sections }
    })
    setActiveSectionId(copy.id)
    setActiveQuestionId(copy.questions[0]?.id ?? null)
  }

  const removeActiveSection = () => {
    if (!activeSection || draft.definition.sections.length === 1) return
    const remaining = draft.definition.sections.filter((section) => section.id !== activeSection.id)
    const next = remaining[Math.min(activeSectionIndex, remaining.length - 1)]
    setDefinition((definition) => ({
      ...definition,
      sections: definition.sections.filter((section) => section.id !== activeSection.id),
    }))
    setActiveSectionId(next.id)
    setActiveQuestionId(next.questions[0]?.id ?? null)
  }

  const addQuestion = () => {
    if (!activeSection || questionCount >= 100) return
    const question = blankQuestion()
    updateSection(activeSectionIndex, { questions: [...activeSection.questions, question] })
    setActiveQuestionId(question.id)
  }

  const copyQuestion = (questionIndex: number) => {
    if (!activeSection || questionCount >= 100) return
    const copy = duplicateQuestion(activeSection.questions[questionIndex])
    const questions = [...activeSection.questions]
    questions.splice(questionIndex + 1, 0, copy)
    updateSection(activeSectionIndex, { questions })
    setActiveQuestionId(copy.id)
  }

  const removeQuestion = (questionIndex: number) => {
    if (!activeSection || activeSection.questions.length === 1) return
    const removed = activeSection.questions[questionIndex]
    const remaining = activeSection.questions.filter((_, index) => index !== questionIndex)
    updateSection(activeSectionIndex, { questions: remaining })
    if (activeQuestionId === removed.id) {
      setActiveQuestionId(remaining[Math.min(questionIndex, remaining.length - 1)]?.id ?? null)
    }
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

  const setQuestionType = (
    sectionIndex: number,
    questionIndex: number,
    question: OnboardingQuestion,
    value: string,
  ) => {
    const nextType = value as OnboardingQuestionType
    updateQuestion(sectionIndex, questionIndex, {
      type: nextType,
      mapping: compatibleMappings(nextType).includes(question.mapping as OnboardingMapping) ? question.mapping : null,
      ...(nextType === 'single_select' || nextType === 'multi_select'
        ? { options: question.options?.length ? question.options : [{ id: generatedId('option'), label: 'Option 1' }] }
        : { options: undefined }),
    })
  }

  const sectionCanBeDuplicated = Boolean(
    activeSection
      && draft.definition.sections.length < 12
      && questionCount + activeSection.questions.length <= 100,
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[92vh] w-[96vw] max-w-[1440px] gap-0 overflow-hidden p-0 sm:max-w-[1440px]">
        <div className="flex min-h-0 flex-1 flex-col">
          <header className="border-b bg-background px-5 pb-4 pt-5 pr-14 sm:px-7 sm:pr-14">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <DialogHeader className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <DialogTitle className="text-xl">{template ? 'Edit onboarding template' : 'Create onboarding template'}</DialogTitle>
                  <Badge variant="secondary">{draft.definition.sections.length}/12 sections</Badge>
                  <Badge variant="secondary">{questionCount}/100 questions</Badge>
                </div>
                <DialogDescription>
                  Organize the client experience by section, then preview exactly what they will receive.
                </DialogDescription>
              </DialogHeader>

              <div className="inline-flex w-fit rounded-xl border bg-muted/50 p-1" role="tablist" aria-label="Template builder views">
                <Button
                  type="button"
                  size="sm"
                  variant={mode === 'build' ? 'default' : 'ghost'}
                  role="tab"
                  aria-selected={mode === 'build'}
                  onClick={() => setMode('build')}
                >
                  <LayoutList className="mr-2 h-4 w-4" />Build
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={mode === 'settings' ? 'default' : 'ghost'}
                  role="tab"
                  aria-selected={mode === 'settings'}
                  onClick={() => setMode('settings')}
                >
                  <Settings2 className="mr-2 h-4 w-4" />Settings
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={mode === 'preview' ? 'default' : 'ghost'}
                  role="tab"
                  aria-selected={mode === 'preview'}
                  onClick={() => setMode('preview')}
                >
                  <Eye className="mr-2 h-4 w-4" />Preview
                </Button>
              </div>
            </div>
          </header>

          <div className="min-h-0 flex-1">
            {mode === 'build' && activeSection ? (
              <div className="flex h-full min-h-0 flex-col lg:flex-row" role="tabpanel" aria-label="Build form">
                <aside className="flex max-h-56 shrink-0 flex-col border-b bg-muted/20 lg:max-h-none lg:w-72 lg:border-b-0 lg:border-r">
                  <div className="border-b px-4 py-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Form outline</p>
                    <p className="mt-1 text-sm text-muted-foreground">Choose one section to edit.</p>
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto p-2">
                    <ol className="space-y-1">
                      {draft.definition.sections.map((section, sectionIndex) => (
                        <li key={section.id}>
                          <button
                            type="button"
                            aria-current={section.id === activeSection.id ? 'step' : undefined}
                            className={cn(
                              'group flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors',
                              section.id === activeSection.id
                                ? 'bg-primary text-primary-foreground shadow-sm'
                                : 'hover:bg-muted',
                            )}
                            onClick={() => selectSection(section)}
                          >
                            <span className={cn(
                              'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold',
                              section.id === activeSection.id
                                ? 'bg-primary-foreground/15 text-primary-foreground'
                                : 'bg-background text-muted-foreground ring-1 ring-border',
                            )}>
                              {sectionIndex + 1}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium">{section.title || 'Untitled section'}</span>
                              <span className={cn(
                                'block text-xs',
                                section.id === activeSection.id ? 'text-primary-foreground/75' : 'text-muted-foreground',
                              )}>
                                {section.questions.length} {section.questions.length === 1 ? 'question' : 'questions'}
                              </span>
                            </span>
                          </button>
                        </li>
                      ))}
                    </ol>
                  </div>
                  <div className="border-t p-3">
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full border-dashed"
                      disabled={draft.definition.sections.length >= 12 || questionCount >= 100}
                      onClick={addSection}
                    >
                      <Plus className="mr-2 h-4 w-4" />Add section
                    </Button>
                  </div>
                </aside>

                <main className="min-h-0 flex-1 overflow-y-auto bg-muted/10">
                  <div className="mx-auto w-full max-w-5xl space-y-5 p-4 sm:p-6 lg:p-8">
                    <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
                      <div className="border-b bg-primary/5 p-5 sm:p-6">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wider text-primary">Section {activeSectionIndex + 1}</p>
                            <h3 className="mt-1 text-xl font-semibold">{activeSection.title || 'Untitled section'}</h3>
                            <p className="mt-1 text-sm text-muted-foreground">
                              {activeSection.questions.length} {activeSection.questions.length === 1 ? 'question' : 'questions'} in this section
                            </p>
                          </div>
                          <div className="flex items-center gap-1 rounded-lg border bg-background/80 p-1">
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              aria-label="Move section up"
                              disabled={activeSectionIndex === 0}
                              onClick={() => setDefinition((definition) => ({
                                ...definition,
                                sections: move(definition.sections, activeSectionIndex, activeSectionIndex - 1),
                              }))}
                            >
                              <ArrowUp className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              aria-label="Move section down"
                              disabled={activeSectionIndex === draft.definition.sections.length - 1}
                              onClick={() => setDefinition((definition) => ({
                                ...definition,
                                sections: move(definition.sections, activeSectionIndex, activeSectionIndex + 1),
                              }))}
                            >
                              <ArrowDown className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              aria-label="Duplicate section"
                              disabled={!sectionCanBeDuplicated}
                              onClick={copyActiveSection}
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              aria-label="Remove section"
                              disabled={draft.definition.sections.length === 1}
                              onClick={removeActiveSection}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </div>

                        <div className="mt-5 grid gap-4 md:grid-cols-2">
                          <div className="space-y-1.5">
                            <Label htmlFor={'section-title-' + activeSection.id}>Section title</Label>
                            <Input
                              id={'section-title-' + activeSection.id}
                              value={activeSection.title}
                              maxLength={200}
                              onChange={(event) => updateSection(activeSectionIndex, { title: event.target.value })}
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor={'section-description-' + activeSection.id}>Short description</Label>
                            <Input
                              id={'section-description-' + activeSection.id}
                              value={activeSection.description}
                              maxLength={1000}
                              placeholder="Help the client understand this section"
                              onChange={(event) => updateSection(activeSectionIndex, { description: event.target.value })}
                            />
                          </div>
                        </div>
                      </div>

                      <div className="space-y-3 p-4 sm:p-6">
                        {activeSection.questions.map((question, questionIndex) => {
                          const mappings = compatibleMappings(question.type)
                          const optionsText = question.options?.map((option) => option.label).join('\n') ?? ''
                          const expanded = activeQuestionId === question.id
                          const panelId = 'question-panel-' + question.id
                          return (
                            <article
                              key={question.id}
                              className={cn(
                                'overflow-hidden rounded-xl border bg-background transition-shadow',
                                expanded && 'border-primary/40 shadow-sm ring-1 ring-primary/10',
                              )}
                            >
                              <div className="flex items-center gap-2 p-2 sm:p-3">
                                <h4 className="min-w-0 flex-1">
                                  <button
                                    type="button"
                                    className="flex w-full min-w-0 items-center gap-3 rounded-lg px-2 py-2 text-left outline-none transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring"
                                    aria-expanded={expanded}
                                    aria-controls={panelId}
                                    onClick={() => setActiveQuestionId(expanded ? null : question.id)}
                                  >
                                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-xs font-bold text-muted-foreground">
                                      {questionIndex + 1}
                                    </span>
                                    <span className="min-w-0 flex-1">
                                      <span className="block truncate text-sm font-semibold">{question.label || 'Untitled question'}</span>
                                      <span className="mt-1 flex flex-wrap gap-1.5">
                                        <Badge variant="secondary" className="font-normal">{typeLabels[question.type]}</Badge>
                                        {question.required && <Badge variant="outline" className="font-normal">Required</Badge>}
                                        {question.mapping && <Badge variant="outline" className="font-normal">{mappingLabels[question.mapping]}</Badge>}
                                      </span>
                                    </span>
                                    <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', expanded && 'rotate-180')} />
                                  </button>
                                </h4>
                                <div className="hidden shrink-0 items-center gap-0.5 sm:flex">
                                  <Button
                                    type="button"
                                    size="icon"
                                    variant="ghost"
                                    aria-label="Move question up"
                                    disabled={questionIndex === 0}
                                    onClick={() => updateSection(activeSectionIndex, {
                                      questions: move(activeSection.questions, questionIndex, questionIndex - 1),
                                    })}
                                  >
                                    <ArrowUp className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    type="button"
                                    size="icon"
                                    variant="ghost"
                                    aria-label="Move question down"
                                    disabled={questionIndex === activeSection.questions.length - 1}
                                    onClick={() => updateSection(activeSectionIndex, {
                                      questions: move(activeSection.questions, questionIndex, questionIndex + 1),
                                    })}
                                  >
                                    <ArrowDown className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    type="button"
                                    size="icon"
                                    variant="ghost"
                                    aria-label="Duplicate question"
                                    disabled={questionCount >= 100}
                                    onClick={() => copyQuestion(questionIndex)}
                                  >
                                    <Copy className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    type="button"
                                    size="icon"
                                    variant="ghost"
                                    aria-label="Remove question"
                                    disabled={activeSection.questions.length === 1}
                                    onClick={() => removeQuestion(questionIndex)}
                                  >
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  </Button>
                                </div>
                              </div>

                              {expanded && (
                                <div id={panelId} className="space-y-5 border-t bg-muted/10 p-4 sm:p-5">
                                  <div className="space-y-1.5">
                                    <Label htmlFor={'question-label-' + question.id}>Question label</Label>
                                    <Input
                                      id={'question-label-' + question.id}
                                      value={question.label}
                                      maxLength={300}
                                      placeholder="What do you want to ask?"
                                      onChange={(event) => updateQuestion(activeSectionIndex, questionIndex, { label: event.target.value })}
                                    />
                                  </div>

                                  <div className="grid gap-4 md:grid-cols-2">
                                    <div className="space-y-1.5">
                                      <Label>Answer type</Label>
                                      <Select value={question.type} onValueChange={(value) => setQuestionType(activeSectionIndex, questionIndex, question, value)}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                          {onboardingQuestionTypes.map((type) => (
                                            <SelectItem key={type} value={type}>{typeLabels[type]}</SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </div>
                                    <div className="space-y-1.5">
                                      <Label>Save answer to client field</Label>
                                      <Select
                                        value={question.mapping ?? 'none'}
                                        onValueChange={(value) => updateQuestion(activeSectionIndex, questionIndex, {
                                          mapping: value === 'none' ? null : value as OnboardingMapping,
                                        })}
                                      >
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="none">Do not map</SelectItem>
                                          {mappings.map((mapping) => (
                                            <SelectItem key={mapping} value={mapping}>{mappingLabels[mapping]}</SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                      <p className="text-xs text-muted-foreground">
                                        Only compatible client fields appear for this answer type.
                                      </p>
                                    </div>
                                  </div>

                                  <div className="grid gap-4 md:grid-cols-2">
                                    <div className="space-y-1.5">
                                      <Label htmlFor={'question-help-' + question.id}>Help text</Label>
                                      <Input
                                        id={'question-help-' + question.id}
                                        value={question.description}
                                        maxLength={1000}
                                        placeholder="Optional guidance shown below the question"
                                        onChange={(event) => updateQuestion(activeSectionIndex, questionIndex, { description: event.target.value })}
                                      />
                                    </div>
                                    <div className="space-y-1.5">
                                      <Label htmlFor={'question-placeholder-' + question.id}>Placeholder</Label>
                                      <Input
                                        id={'question-placeholder-' + question.id}
                                        value={question.placeholder}
                                        maxLength={500}
                                        placeholder="Optional example answer"
                                        onChange={(event) => updateQuestion(activeSectionIndex, questionIndex, { placeholder: event.target.value })}
                                      />
                                    </div>
                                  </div>

                                  {(question.type === 'single_select' || question.type === 'multi_select') && (
                                    <div className="space-y-1.5">
                                      <Label htmlFor={'question-options-' + question.id}>Answer choices</Label>
                                      <Textarea
                                        id={'question-options-' + question.id}
                                        value={optionsText}
                                        placeholder={'One choice per line\nExample choice'}
                                        onChange={(event) => updateQuestion(activeSectionIndex, questionIndex, {
                                          options: event.target.value.split('\n').map((label, index) => ({
                                            id: question.options?.[index]?.id ?? generatedId('option'),
                                            label,
                                          })).filter((option) => option.label.trim()).slice(0, 50),
                                        })}
                                      />
                                      <p className="text-xs text-muted-foreground">Add one choice per line, up to 50 choices.</p>
                                    </div>
                                  )}

                                  <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                                    <label className="flex cursor-pointer items-center gap-2 text-sm font-medium" htmlFor={question.id + '-required'}>
                                      <Checkbox
                                        id={question.id + '-required'}
                                        checked={question.required}
                                        onCheckedChange={(checked) => updateQuestion(activeSectionIndex, questionIndex, { required: checked === true })}
                                      />
                                      Require an answer
                                    </label>
                                    <div className="flex flex-wrap items-center gap-1 sm:hidden">
                                      <Button type="button" size="sm" variant="ghost" disabled={questionIndex === 0} onClick={() => updateSection(activeSectionIndex, { questions: move(activeSection.questions, questionIndex, questionIndex - 1) })}>Move up</Button>
                                      <Button type="button" size="sm" variant="ghost" disabled={questionIndex === activeSection.questions.length - 1} onClick={() => updateSection(activeSectionIndex, { questions: move(activeSection.questions, questionIndex, questionIndex + 1) })}>Move down</Button>
                                      <Button type="button" size="sm" variant="ghost" disabled={questionCount >= 100} onClick={() => copyQuestion(questionIndex)}>Duplicate</Button>
                                      <Button type="button" size="sm" variant="ghost" className="text-destructive" disabled={activeSection.questions.length === 1} onClick={() => removeQuestion(questionIndex)}>Delete</Button>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </article>
                          )
                        })}

                        <Button
                          type="button"
                          variant="outline"
                          className="w-full border-dashed py-6"
                          disabled={questionCount >= 100}
                          onClick={addQuestion}
                        >
                          <Plus className="mr-2 h-4 w-4" />Add question to this section
                        </Button>
                      </div>
                    </section>
                  </div>
                </main>
              </div>
            ) : mode === 'settings' ? (
              <div className="h-full overflow-y-auto bg-muted/10" role="tabpanel" aria-label="Template settings">
                <div className="mx-auto grid w-full max-w-5xl gap-5 p-4 sm:p-6 lg:grid-cols-2 lg:p-8">
                  <Card>
                    <CardHeader>
                      <div className="flex items-center gap-2">
                        <span className="rounded-lg bg-primary/10 p-2 text-primary"><FileText className="h-4 w-4" /></span>
                        <div>
                          <CardTitle className="text-lg">Template details</CardTitle>
                          <CardDescription>Internal information used by your team.</CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-1.5">
                        <Label htmlFor="template-name">Template name</Label>
                        <Input
                          id="template-name"
                          value={draft.name}
                          maxLength={120}
                          onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="template-description">Internal description</Label>
                        <Textarea
                          id="template-description"
                          value={draft.description}
                          maxLength={1000}
                          placeholder="Explain when your team should use this template"
                          onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
                        />
                        <p className="text-xs text-muted-foreground">Clients never see this description.</p>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <div className="flex items-center gap-2">
                        <span className="rounded-lg bg-primary/10 p-2 text-primary"><Settings2 className="h-4 w-4" /></span>
                        <div>
                          <CardTitle className="text-lg">Invitation schedule</CardTitle>
                          <CardDescription>Choose when incomplete-intake reminders are due.</CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-1.5">
                        <Label htmlFor="reminder-days">Reminder days after invitation</Label>
                        <Input
                          id="reminder-days"
                          value={reminderText}
                          placeholder="3, 7, 12"
                          onChange={(event) => setReminderText(event.target.value)}
                        />
                        <p className="text-xs leading-relaxed text-muted-foreground">
                          Enter comma-separated days or leave empty for no reminders. Reminders stop when the onboarding is submitted, approved, revoked, or expired.
                        </p>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="lg:col-span-2">
                    <CardHeader>
                      <CardTitle className="text-lg">Client-facing messages</CardTitle>
                      <CardDescription>Set the welcome and completion copy clients see while filling out the form.</CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="intro-title">Welcome title</Label>
                        <Input
                          id="intro-title"
                          value={draft.definition.intro_title}
                          maxLength={300}
                          onChange={(event) => setDefinition((definition) => ({ ...definition, intro_title: event.target.value }))}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="completion-message">Completion message</Label>
                        <Input
                          id="completion-message"
                          value={draft.definition.completion_message}
                          maxLength={2000}
                          onChange={(event) => setDefinition((definition) => ({ ...definition, completion_message: event.target.value }))}
                        />
                      </div>
                      <div className="space-y-1.5 md:col-span-2">
                        <Label htmlFor="intro-body">Welcome message</Label>
                        <Textarea
                          id="intro-body"
                          value={draft.definition.intro_body}
                          maxLength={3000}
                          onChange={(event) => setDefinition((definition) => ({ ...definition, intro_body: event.target.value }))}
                        />
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            ) : (
              <div className="h-full overflow-y-auto bg-muted/20" role="tabpanel" aria-label="Client form preview">
                <div className="mx-auto w-full max-w-4xl p-4 sm:p-6 lg:p-8">
                  <div className="overflow-hidden rounded-3xl border bg-background shadow-sm">
                    <div className="border-b bg-primary/5 px-5 py-8 sm:px-8 sm:py-10">
                      <Badge variant="secondary">Client preview</Badge>
                      <h2 className="mt-4 max-w-2xl text-2xl font-bold tracking-tight sm:text-3xl">{draft.definition.intro_title}</h2>
                      <p className="mt-3 max-w-2xl leading-relaxed text-muted-foreground">{draft.definition.intro_body}</p>
                      <div className="mt-6 flex flex-wrap gap-2">
                        {draft.definition.sections.map((section, index) => (
                          <span key={section.id} className="rounded-full border bg-background px-3 py-1 text-xs text-muted-foreground">
                            {index + 1}. {section.title || 'Untitled section'}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-6 p-4 sm:p-8">
                      {draft.definition.sections.map((section, sectionIndex) => (
                        <section key={section.id} className="rounded-2xl border p-4 sm:p-6">
                          <div className="mb-5">
                            <p className="text-xs font-semibold uppercase tracking-wider text-primary">Section {sectionIndex + 1} of {draft.definition.sections.length}</p>
                            <h3 className="mt-1 text-xl font-semibold">{section.title || 'Untitled section'}</h3>
                            {section.description && <p className="mt-1 text-sm text-muted-foreground">{section.description}</p>}
                          </div>
                          <div className="space-y-5">
                            {section.questions.map((question) => (
                              <div key={question.id} className="space-y-2">
                                <Label>
                                  {question.label || 'Untitled question'}
                                  {question.required && <span className="text-destructive"> *</span>}
                                </Label>
                                {question.description && <p className="text-xs text-muted-foreground">{question.description}</p>}
                                <PreviewControl question={question} />
                              </div>
                            ))}
                          </div>
                        </section>
                      ))}
                      <div className="rounded-2xl bg-muted/50 p-5 text-center">
                        <p className="text-sm font-medium">{draft.definition.completion_message}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <footer className="border-t bg-background px-4 py-3 sm:px-6">
            {builderError && (
              <p role="alert" className="mb-3 rounded-lg bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
                {builderError}
              </p>
            )}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center justify-between gap-4 rounded-lg border px-3 py-2 sm:border-0 sm:p-0">
                <div>
                  <Label htmlFor="default-template">Default template</Label>
                  <p className="text-xs text-muted-foreground">Preselect for new invitations</p>
                </div>
                <Switch id="default-template" checked={makeDefault} onCheckedChange={setMakeDefault} />
              </div>
              <div className="flex items-center justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
                <Button type="button" variant="secondary" disabled={saving} onClick={() => submit(false)}>Save draft</Button>
                <Button type="button" disabled={saving} onClick={() => submit(true)}>{saving ? 'Saving…' : 'Save & publish'}</Button>
              </div>
            </div>
          </footer>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default OnboardingTemplateBuilder
