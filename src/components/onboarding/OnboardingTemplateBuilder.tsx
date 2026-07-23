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
  ShieldCheck,
  Trash2,
} from 'lucide-react'
import ClientOnboardingPreview from '@/components/onboarding/ClientOnboardingPreview'
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
import {
  DEFAULT_ONBOARDING_ACCENT,
  onboardingWorkspaceInitials,
  onboardingWorkspaceName,
  renderOnboardingBrandText,
} from '@/lib/onboardingBrand'
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
  workspaceName: string
  workspaceLogoUrl?: string | null
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

const blankDefinition = (workspaceName: string): OnboardingDefinition => ({
  schema_version: 1,
  intro_title: 'Let’s build your podcast guest profile',
  intro_body: 'Share the experience, stories, and ideas that make you a compelling podcast guest.',
  completion_message: 'Thank you. ' + onboardingWorkspaceName(workspaceName) + ' will review your answers and follow up if anything needs clarification.',
  sections: [{
    id: generatedId('section'),
    title: 'About you',
    description: '',
    questions: [blankQuestion()],
  }],
})

const emptyDraft = (workspaceName: string): OnboardingTemplateDraft => ({
  name: 'Podcast Guest Onboarding',
  description: '',
  definition: blankDefinition(workspaceName),
  reminder_days: [],
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

const PreviewBrandMark = ({
  workspaceName,
  logoUrl,
  logoUnavailable,
  onLogoError,
  compact = false,
}: {
  workspaceName: string
  logoUrl?: string | null
  logoUnavailable: boolean
  onLogoError: () => void
  compact?: boolean
}) => logoUrl && !logoUnavailable ? (
  <div className={cn(
    'relative flex shrink-0 items-center justify-center rounded-2xl border border-white/30 bg-white shadow-xl',
    compact ? 'h-16 w-32 p-3' : 'h-24 w-full max-w-xs p-4 sm:w-64',
  )}>
    <img
      src={logoUrl}
      alt={`${onboardingWorkspaceName(workspaceName)} logo`}
      className="max-h-full max-w-full object-contain"
      onError={onLogoError}
    />
  </div>
) : (
  <div className={cn(
    'relative flex shrink-0 items-center justify-center rounded-2xl bg-white/15 font-black ring-1 ring-white/25',
    compact ? 'h-14 w-14 text-lg' : 'h-20 w-20 text-2xl',
  )}>
    {onboardingWorkspaceInitials(workspaceName)}
  </div>
)

const OnboardingTemplateBuilder = ({ open, template, workspaceName, workspaceLogoUrl, saving, onOpenChange, onSave }: Props) => {
  const [draft, setDraft] = useState<OnboardingTemplateDraft>(() => emptyDraft(workspaceName))
  const [mode, setMode] = useState<BuilderMode>('build')
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null)
  const [activeQuestionId, setActiveQuestionId] = useState<string | null>(null)
  const [makeDefault, setMakeDefault] = useState(false)
  const [builderError, setBuilderError] = useState<string | null>(null)
  const [workspaceLogoUnavailable, setWorkspaceLogoUnavailable] = useState(false)

  useEffect(() => {
    if (!open) return
    const next = template
      ? {
          name: template.name,
          description: template.description,
          definition: structuredClone(template.definition),
          reminder_days: [...template.reminder_days],
        }
      : emptyDraft(workspaceName)
    const firstSection = next.definition.sections[0]
    setDraft(next)
    setMakeDefault(template?.is_default ?? false)
    setMode('build')
    setActiveSectionId(firstSection?.id ?? null)
    setActiveQuestionId(firstSection?.questions[0]?.id ?? null)
    setBuilderError(null)
    setWorkspaceLogoUnavailable(false)
  }, [open, template, workspaceName, workspaceLogoUrl])

  const questionCount = useMemo(
    () => draft.definition.sections.reduce((total, section) => total + section.questions.length, 0),
    [draft.definition.sections],
  )

  const activeSectionIndex = Math.max(
    0,
    draft.definition.sections.findIndex((section) => section.id === activeSectionId),
  )
  const activeSection = draft.definition.sections[activeSectionIndex]
  const brandedWorkspaceName = onboardingWorkspaceName(workspaceName)

  const setDefinition = (updater: (definition: OnboardingDefinition) => OnboardingDefinition) => {
    setDraft((current) => ({ ...current, definition: updater(current.definition) }))
  }

  const applyBrandedDefaults = () => {
    setDefinition((definition) => ({
      ...definition,
      intro_title: 'Let’s build your podcast guest profile',
      intro_body: 'Share the experience, stories, and ideas that make you a compelling podcast guest. You can save your progress and return with this secure link.',
      completion_message: 'Thank you. ' + brandedWorkspaceName + ' will review your answers and follow up if anything needs clarification.',
    }))
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

  const submit = (publish: boolean) => {
    try {
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
      onSave({ ...draft, reminder_days: [] }, publish, makeDefault)
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
      <DialogContent className="h-[min(92dvh,48rem)] w-[calc(100vw-1rem)] max-w-[1440px] gap-0 overflow-hidden p-0 sm:w-[96vw] sm:max-w-[1440px]">
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
                <div className="mx-auto w-full max-w-5xl space-y-5 p-4 sm:p-6 lg:p-8">
                  <div className="flex gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-4 sm:items-center">
                    <span className="mt-0.5 rounded-xl bg-primary p-2.5 text-primary-foreground sm:mt-0">
                      <ShieldCheck className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="font-semibold">White-label client experience</p>
                      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                        Clients see {brandedWorkspaceName}, its workspace logo, and the messages you write here. Platform branding is not shown.
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-5 lg:grid-cols-2">
                    <Card>
                      <CardHeader>
                        <div className="flex items-center gap-2">
                          <span className="rounded-lg bg-primary/10 p-2 text-primary"><FileText className="h-4 w-4" /></span>
                          <div>
                            <CardTitle className="text-lg">Template setup</CardTitle>
                            <CardDescription>Only workspace managers see these details.</CardDescription>
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
                          <Label htmlFor="template-description">Team note</Label>
                          <Textarea
                            id="template-description"
                            value={draft.description}
                            maxLength={1000}
                            placeholder="When should your team use this template?"
                            onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
                          />
                          <p className="text-xs text-muted-foreground">Clients never see this note.</p>
                        </div>
                        <div className="flex items-center justify-between gap-4 rounded-xl border bg-muted/30 p-3">
                          <div>
                            <Label htmlFor="default-template">Use as default</Label>
                            <p className="text-xs text-muted-foreground">Preselect this template for new client links.</p>
                          </div>
                          <Switch id="default-template" checked={makeDefault} onCheckedChange={setMakeDefault} />
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">Share it your way</CardTitle>
                        <CardDescription>Your team stays in control of every client follow-up.</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {[
                          ['1', 'Publish the template', 'Publishing locks a version for future client links.'],
                          ['2', 'Create a secure link', 'Start onboarding for a client and copy their private link.'],
                          ['3', 'Send and follow up', 'Share the link from your own client communication workflow.'],
                        ].map(([number, title, description]) => (
                          <div key={number} className="flex gap-3 rounded-xl border p-3">
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary">{number}</span>
                            <div><p className="text-sm font-semibold">{title}</p><p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{description}</p></div>
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  </div>

                  <Card>
                    <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <CardTitle className="text-lg">What clients see</CardTitle>
                        <CardDescription>Write the welcome and confirmation messages in your agency’s voice.</CardDescription>
                      </div>
                      <Button type="button" size="sm" variant="outline" onClick={applyBrandedDefaults}>
                        Use branded defaults
                      </Button>
                    </CardHeader>
                    <CardContent className="grid gap-6 lg:grid-cols-[1.15fr_.85fr]">
                      <div className="space-y-5">
                        <div className="space-y-4 rounded-2xl border p-4">
                          <div><p className="text-sm font-semibold">Welcome screen</p><p className="text-xs text-muted-foreground">Shown before the client starts answering questions.</p></div>
                          <div className="space-y-1.5">
                            <Label htmlFor="intro-title">Headline</Label>
                            <Input
                              id="intro-title"
                              value={draft.definition.intro_title}
                              maxLength={300}
                              onChange={(event) => setDefinition((definition) => ({ ...definition, intro_title: event.target.value }))}
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor="intro-body">Welcome message</Label>
                            <Textarea
                              id="intro-body"
                              rows={4}
                              value={draft.definition.intro_body}
                              maxLength={3000}
                              onChange={(event) => setDefinition((definition) => ({ ...definition, intro_body: event.target.value }))}
                            />
                          </div>
                        </div>
                        <div className="space-y-3 rounded-2xl border p-4">
                          <div><p className="text-sm font-semibold">After submission</p><p className="text-xs text-muted-foreground">Shown after the client sends their completed intake.</p></div>
                          <div className="space-y-1.5">
                            <Label htmlFor="completion-message">Confirmation message</Label>
                            <Textarea
                              id="completion-message"
                              rows={3}
                              value={draft.definition.completion_message}
                              maxLength={2000}
                              onChange={(event) => setDefinition((definition) => ({ ...definition, completion_message: event.target.value }))}
                            />
                          </div>
                        </div>
                      </div>

                      <aside className="h-fit rounded-2xl border bg-muted/30 p-4 lg:sticky lg:top-0">
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Live message preview</p>
                        <div className="mt-3 overflow-hidden rounded-2xl border bg-background shadow-sm">
                          <div className="relative overflow-hidden p-5 text-white" style={{ background: `linear-gradient(135deg, #111827 0%, ${DEFAULT_ONBOARDING_ACCENT} 100%)` }}>
                            <div className="pointer-events-none absolute -right-10 -top-16 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
                            <div className="relative flex items-center gap-3">
                              <PreviewBrandMark workspaceName={workspaceName} logoUrl={workspaceLogoUrl} logoUnavailable={workspaceLogoUnavailable} onLogoError={() => setWorkspaceLogoUnavailable(true)} compact />
                              <div className="min-w-0"><p className="truncate text-sm font-semibold">{brandedWorkspaceName}</p><p className="text-xs text-white/75">Client onboarding</p></div>
                            </div>
                            <h3 className="mt-5 text-lg font-semibold">{renderOnboardingBrandText(draft.definition.intro_title, workspaceName) || 'Welcome headline'}</h3>
                            <p className="mt-2 text-sm leading-relaxed text-white/80">{renderOnboardingBrandText(draft.definition.intro_body, workspaceName) || 'Your welcome message will appear here.'}</p>
                          </div>
                          <div className="border-t p-4">
                            <p className="text-xs font-semibold text-muted-foreground">After submission</p>
                            <p className="mt-2 text-sm">{renderOnboardingBrandText(draft.definition.completion_message, workspaceName) || 'Your confirmation message will appear here.'}</p>
                          </div>
                        </div>
                      </aside>
                    </CardContent>
                  </Card>
                </div>
              </div>
            ) : (
              <div className="h-full overflow-y-auto bg-muted/20" role="tabpanel" aria-label="Client form preview">
                <div className="mx-auto w-full max-w-5xl p-4 sm:p-6 lg:p-8">
                  <ClientOnboardingPreview
                    definition={draft.definition}
                    workspaceName={workspaceName}
                    workspaceLogoUrl={workspaceLogoUrl}
                    accentColor={DEFAULT_ONBOARDING_ACCENT}
                  />
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
            <div className="flex flex-wrap items-center justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
                <Button type="button" variant="secondary" disabled={saving} onClick={() => submit(false)}>Save draft</Button>
                <Button type="button" disabled={saving} onClick={() => submit(true)}>{saving ? 'Saving…' : 'Save & publish'}</Button>
            </div>
          </footer>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default OnboardingTemplateBuilder
