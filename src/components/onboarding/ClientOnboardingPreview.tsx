import { type CSSProperties, useEffect, useId, useState } from 'react'
import { ArrowLeft, ArrowRight, CheckCircle2, FileText, Image as ImageIcon, LockKeyhole, RotateCcw, UploadCloud } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  onboardingAccentColor,
  onboardingAccentHsl,
  onboardingWorkspaceInitials,
  onboardingWorkspaceName,
  renderOnboardingBrandText,
} from '@/lib/onboardingBrand'
import { cn } from '@/lib/utils'
import type { OnboardingDefinition, OnboardingQuestion } from '@/services/workspaceOnboarding'

interface Props {
  definition: OnboardingDefinition
  workspaceName: string
  workspaceLogoUrl?: string | null
  accentColor?: string | null
  recipientName?: string
  className?: string
}

const answerText = (value: unknown) => typeof value === 'string' ? value : ''

const isEmptyAnswer = (value: unknown) => value === undefined
  || value === null
  || value === ''
  || (Array.isArray(value) && value.length === 0)

function sectionError(
  definition: OnboardingDefinition,
  sectionIndex: number,
  answers: Record<string, unknown>,
  workspaceName: string,
): string | null {
  const section = definition.sections[sectionIndex]
  if (!section) return 'This section is unavailable.'
  for (const question of section.questions) {
    const value = answers[question.id]
    const label = renderOnboardingBrandText(question.label, workspaceName) || 'This question'
    if (question.required && isEmptyAnswer(value)) return `${label} is required.`
  }
  return null
}

const PreviewQuestion = ({
  question,
  workspaceName,
  answer,
  onChange,
}: {
  question: OnboardingQuestion
  workspaceName: string
  answer: unknown
  onChange: (value: unknown) => void
}) => {
  const fieldPrefix = useId().replace(/:/gu, '')
  const inputId = `preview-${fieldPrefix}-${question.id}`
  const label = (
    <Label htmlFor={inputId} className="text-base font-semibold text-slate-900">
      {renderOnboardingBrandText(question.label, workspaceName) || 'Untitled question'}
      {question.required && <span className="text-red-500"> *</span>}
    </Label>
  )
  const help = question.description
    ? <p className="text-sm leading-6 text-slate-500">{renderOnboardingBrandText(question.description, workspaceName)}</p>
    : null
  const placeholder = renderOnboardingBrandText(question.placeholder, workspaceName)

  if (question.type === 'long_text') {
    return <div className="space-y-2">{label}{help}<Textarea id={inputId} rows={5} value={answerText(answer)} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} /></div>
  }
  if (question.type === 'yes_no') {
    return <div className="space-y-3">{label}{help}<RadioGroup value={typeof answer === 'boolean' ? String(answer) : ''} onValueChange={(value) => onChange(value === 'true')} className="flex gap-5"><label className="flex items-center gap-2"><RadioGroupItem value="true" />Yes</label><label className="flex items-center gap-2"><RadioGroupItem value="false" />No</label></RadioGroup></div>
  }
  if (question.type === 'single_select') {
    return <div className="space-y-2">{label}{help}<Select value={answerText(answer)} onValueChange={onChange}><SelectTrigger id={inputId}><SelectValue placeholder="Choose an option" /></SelectTrigger><SelectContent>{question.options?.map((option) => <SelectItem key={option.id} value={option.id}>{renderOnboardingBrandText(option.label, workspaceName)}</SelectItem>)}</SelectContent></Select></div>
  }
  if (question.type === 'multi_select') {
    const selected = Array.isArray(answer) ? answer.filter((value): value is string => typeof value === 'string') : []
    return <div className="space-y-3">{label}{help}<div className="grid gap-2 sm:grid-cols-2">{question.options?.map((option) => <label key={option.id} className="flex items-center gap-3 rounded-lg border p-3 text-sm transition hover:border-primary/40 hover:bg-primary/5"><Checkbox checked={selected.includes(option.id)} onCheckedChange={(checked) => onChange(checked === true ? [...selected, option.id] : selected.filter((value) => value !== option.id))} />{renderOnboardingBrandText(option.label, workspaceName)}</label>)}</div></div>
  }
  if (question.type === 'image_upload' || question.type === 'document_upload') {
    const filename = answerText(answer)
    const accept = question.type === 'image_upload' ? 'image/png,image/jpeg,image/webp' : 'application/pdf'
    return (
      <div className="space-y-2">
        {label}{help}
        <label htmlFor={inputId} className="flex w-full cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-primary/25 bg-primary/5 p-6 text-center transition hover:border-primary/60">
          {question.type === 'image_upload' ? <ImageIcon className="h-7 w-7 text-primary" /> : <FileText className="h-7 w-7 text-primary" />}
          <span className="mt-2 text-sm font-semibold text-primary">{filename || `Choose ${question.type === 'image_upload' ? 'an image' : 'a PDF'}`}</span>
          <span className="mt-1 text-xs text-slate-500">{filename ? 'Choose another file' : question.type === 'image_upload' ? 'PNG, JPEG, or WebP up to 5 MB' : 'PDF up to 10 MB'}</span>
          <UploadCloud className="mt-3 h-4 w-4 text-slate-400" />
        </label>
        <input id={inputId} type="file" accept={accept} className="sr-only" onChange={(event) => { onChange(event.target.files?.[0]?.name ?? ''); event.currentTarget.value = '' }} />
      </div>
    )
  }
  return (
    <div className="space-y-2">
      {label}{help}
      <Input
        id={inputId}
        type="text"
        value={answerText(answer)}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  )
}

const ClientOnboardingPreview = ({
  definition,
  workspaceName,
  workspaceLogoUrl,
  accentColor,
  recipientName,
  className,
}: Props) => {
  const brandName = onboardingWorkspaceName(workspaceName)
  const accent = onboardingAccentColor(accentColor)
  const [currentSection, setCurrentSection] = useState(0)
  const [answers, setAnswers] = useState<Record<string, unknown>>({})
  const [complete, setComplete] = useState(false)
  const [logoUnavailable, setLogoUnavailable] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)

  useEffect(() => {
    setCurrentSection((current) => Math.min(current, Math.max(definition.sections.length - 1, 0)))
    setComplete(false)
    setValidationError(null)
  }, [definition.sections.length])

  useEffect(() => setLogoUnavailable(false), [workspaceLogoUrl])

  const section = definition.sections[currentSection]
  const progress = definition.sections.length > 0
    ? ((currentSection + 1) / definition.sections.length) * 100
    : 0
  const brandStyle = {
    '--primary': onboardingAccentHsl(accent),
    '--ring': onboardingAccentHsl(accent),
    '--primary-foreground': '0 0% 100%',
  } as CSSProperties

  const restart = () => {
    setAnswers({})
    setCurrentSection(0)
    setComplete(false)
    setValidationError(null)
  }

  const changeAnswer = (questionId: string, value: unknown) => {
    setAnswers((current) => ({ ...current, [questionId]: value }))
    setValidationError(null)
  }

  const continuePreview = () => {
    const error = sectionError(definition, currentSection, answers, brandName)
    if (error) {
      setValidationError(error)
      return
    }
    setValidationError(null)
    setCurrentSection((current) => Math.min(definition.sections.length - 1, current + 1))
  }

  const submitPreview = () => {
    for (let index = 0; index < definition.sections.length; index += 1) {
      const error = sectionError(definition, index, answers, brandName)
      if (error) {
        setCurrentSection(index)
        setValidationError(error)
        return
      }
    }
    setValidationError(null)
    setComplete(true)
  }

  const brandHeader = (
    <header className="relative overflow-hidden rounded-3xl p-5 text-white shadow-xl shadow-slate-950/20 sm:p-6" style={{ background: `linear-gradient(135deg, #111827 0%, ${accent} 100%)` }}>
      <div className="pointer-events-none absolute -right-12 -top-20 h-56 w-56 rounded-full bg-white/10 blur-2xl" />
      <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
        {workspaceLogoUrl && !logoUnavailable
          ? <div className="relative flex h-24 w-full max-w-xs items-center justify-center rounded-2xl border border-white/30 bg-white p-4 shadow-xl sm:w-56"><img src={workspaceLogoUrl} alt={`${brandName} logo`} className="max-h-full max-w-full object-contain" onError={() => setLogoUnavailable(true)} /></div>
          : <div className="relative flex h-20 w-20 items-center justify-center rounded-2xl bg-white/15 text-2xl font-black ring-1 ring-white/25">{onboardingWorkspaceInitials(brandName)}</div>}
        <div className="relative min-w-0"><p className="text-xs font-bold uppercase tracking-[.18em] text-white/70">Client onboarding</p><h2 className="mt-1 truncate text-2xl font-bold">{brandName}</h2><p className="mt-1 text-sm text-white/80">Secure client intake</p></div>
      </div>
    </header>
  )

  return (
    <div className={cn('overflow-hidden rounded-3xl border bg-slate-50', className)} style={brandStyle}>
      <div className="flex items-center justify-between gap-3 border-b bg-white px-4 py-3 text-xs text-slate-500">
        <span className="font-semibold text-slate-700">Interactive client preview</span>
        <span>Preview answers are not saved</span>
      </div>
      <div className="p-3 sm:p-5">
        {brandHeader}
        {complete ? (
          <Card className="mt-5 border-0 text-center shadow-xl shadow-slate-900/10">
            <CardHeader className="p-7">
              <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50"><CheckCircle2 className="h-8 w-8 text-emerald-600" /></div>
              <CardTitle className="text-2xl">Onboarding submitted</CardTitle>
              <CardDescription className="mx-auto max-w-lg text-base leading-7">{renderOnboardingBrandText(definition.completion_message, brandName)}</CardDescription>
              <Button type="button" variant="outline" className="mx-auto mt-3" onClick={restart}><RotateCcw className="mr-2 h-4 w-4" />Restart preview</Button>
            </CardHeader>
          </Card>
        ) : section ? (
          <Card className="mt-5 overflow-hidden border-0 shadow-xl shadow-slate-900/10">
            <div className="h-1.5" style={{ background: `linear-gradient(90deg, ${accent}, ${accent}99, ${accent}55)` }} />
            <CardHeader className="space-y-4 p-5 sm:p-7">
              <div><Badge variant="outline" className="mb-3 border-primary/20 bg-primary/5 text-primary">Private client intake</Badge>{recipientName?.trim() && <p className="mb-1 text-sm font-medium text-slate-500">Hi {recipientName.trim()},</p>}<CardTitle className="text-2xl">{renderOnboardingBrandText(definition.intro_title, brandName)}</CardTitle><CardDescription className="mt-2 max-w-2xl text-base leading-7">{renderOnboardingBrandText(definition.intro_body, brandName)}</CardDescription></div>
              <div className="space-y-2"><div className="flex items-center justify-between text-sm"><span className="font-medium">Section {currentSection + 1} of {definition.sections.length}</span><span className="text-slate-500">{Math.round(progress)}% · {section.questions.length} {section.questions.length === 1 ? 'question' : 'questions'}</span></div><Progress value={progress} className="h-2" /></div>
              <div className="flex items-start gap-2 text-xs leading-5 text-slate-500"><LockKeyhole className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>Your progress saves automatically and stays private with {brandName}.</span></div>
            </CardHeader>
            <CardContent className="space-y-6 border-t bg-white p-5 sm:p-7">
              <div><p className="text-xs font-bold uppercase tracking-[.16em] text-primary">Section {currentSection + 1}</p><h3 className="mt-1 text-2xl font-bold text-slate-900">{renderOnboardingBrandText(section.title, brandName)}</h3>{section.description && <p className="mt-2 text-slate-600">{renderOnboardingBrandText(section.description, brandName)}</p>}</div>
              <div className="space-y-7">{section.questions.map((question) => <PreviewQuestion key={question.id} question={question} workspaceName={brandName} answer={answers[question.id]} onChange={(value) => changeAnswer(question.id, value)} />)}</div>
              {validationError && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{validationError}</div>}
              <div className="flex flex-col-reverse gap-3 border-t pt-6 sm:flex-row sm:items-center sm:justify-between">
                <Button type="button" variant="outline" disabled={currentSection === 0} onClick={() => { setValidationError(null); setCurrentSection((current) => Math.max(0, current - 1)) }}><ArrowLeft className="mr-2 h-4 w-4" />Previous</Button>
                {currentSection < definition.sections.length - 1
                  ? <Button type="button" onClick={continuePreview}>Save & continue<ArrowRight className="ml-2 h-4 w-4" /></Button>
                  : <Button type="button" onClick={submitPreview}><CheckCircle2 className="mr-2 h-4 w-4" />Submit for review</Button>}
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="mt-5"><CardHeader><CardTitle>Preview unavailable</CardTitle><CardDescription>Add a section to preview the client form.</CardDescription></CardHeader></Card>
        )}
      </div>
    </div>
  )
}

export default ClientOnboardingPreview
