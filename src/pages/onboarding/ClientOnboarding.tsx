import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Clock3, FileText, Image as ImageIcon, Loader2, LockKeyhole, MessageSquareMore, RefreshCw, Save, Trash2, UploadCloud } from 'lucide-react'
import { useParams } from 'react-router-dom'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
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
import PageSEO from '@/components/seo/PageSEO'
import {
  deleteClientOnboardingAsset,
  getClientOnboarding,
  saveClientOnboarding,
  submitClientOnboarding,
  uploadClientOnboardingAsset,
  type ClientOnboardingView,
  type OnboardingQuestion,
} from '@/services/workspaceOnboarding'

const CAPABILITY_SCOPE_PATTERN = /^([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.([1-9][0-9]{0,9})\./iu

function emptyAnswer(value: unknown): boolean {
  return value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)
}

function sectionError(view: ClientOnboardingView, answers: Record<string, unknown>, sectionIndex: number): string | null {
  const section = view.definition?.sections[sectionIndex]
  if (!section) return 'This section is unavailable.'
  for (const question of section.questions) {
    if (question.required && emptyAnswer(answers[question.id])) return `${question.label} is required.`
    const answer = answers[question.id]
    if (emptyAnswer(answer)) continue
    if (question.type === 'email' && (typeof answer !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(answer))) {
      return `${question.label} must be a valid email address.`
    }
    if (question.type === 'url' && typeof answer === 'string') {
      try {
        const parsed = new URL(answer)
        if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return `${question.label} must be a valid web address.`
      } catch {
        return `${question.label} must be a valid web address.`
      }
    }
  }
  return null
}

const ClientOnboarding = () => {
  const { token = '' } = useParams()
  const queryClient = useQueryClient()
  const onboardingQueryKey = useMemo(() => {
    const capabilityScope = token.match(CAPABILITY_SCOPE_PATTERN)
    return ['client-onboarding-public', capabilityScope ? `${capabilityScope[1].toLowerCase()}:${capabilityScope[2]}` : 'invalid'] as const
  }, [token])
  const [answers, setAnswers] = useState<Record<string, unknown>>({})
  const [currentSection, setCurrentSection] = useState(0)
  const [dirty, setDirty] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const initializedVersion = useRef<string | null>(null)
  const editVersion = useRef(0)

  useEffect(() => {
    const meta = document.createElement('meta')
    meta.name = 'referrer'
    meta.content = 'no-referrer'
    document.head.appendChild(meta)
    return () => meta.remove()
  }, [])

  const onboardingQuery = useQuery({
    queryKey: onboardingQueryKey,
    queryFn: () => getClientOnboarding(token),
    enabled: Boolean(token),
    retry: false,
    gcTime: 0,
  })
  const view = onboardingQuery.data

  useEffect(() => {
    if (!view || !view.definition || view.lock_version === undefined) return
    const version = `${view.id}:${view.lock_version}:${view.status}`
    if (initializedVersion.current === version) return
    setAnswers(view.answers)
    setCurrentSection(Math.min(view.current_section ?? 0, view.definition.sections.length - 1))
    setDirty(false)
    editVersion.current = 0
    initializedVersion.current = version
  }, [view])

  const cacheSavedDraft = (next: ClientOnboardingView, savedEditVersion: number) => {
    queryClient.setQueryData(onboardingQueryKey, next)
    const hasNewerEdits = editVersion.current !== savedEditVersion
    setDirty(hasNewerEdits)
    setSaveState(hasNewerEdits ? 'idle' : 'saved')
    initializedVersion.current = `${next.id}:${next.lock_version}:${next.status}`
  }

  const saveMutation = useMutation({
    mutationFn: ({ nextSection }: { nextSection: number; savedEditVersion: number }) => {
      if (!view || view.lock_version === undefined) throw new Error('Your onboarding is not ready to save.')
      return saveClientOnboarding(token, answers, nextSection, view.lock_version)
    },
    onMutate: () => setSaveState('saving'),
    onSuccess: (next, variables) => cacheSavedDraft(next, variables.savedEditVersion),
    onError: (error) => {
      setSaveState('error')
      setValidationError(error instanceof Error ? error.message : 'Your progress could not be saved.')
    },
  })

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!view?.definition || view.lock_version === undefined) throw new Error('Your onboarding is not ready to submit.')
      for (let index = 0; index < view.definition.sections.length; index += 1) {
        const error = sectionError(view, answers, index)
        if (error) {
          setCurrentSection(index)
          throw new Error(error)
        }
      }
      let latest = view
      if (dirty) {
        const savedEditVersion = editVersion.current
        latest = await saveClientOnboarding(token, answers, currentSection, view.lock_version)
        cacheSavedDraft(latest, savedEditVersion)
      }
      if (latest.lock_version === undefined) throw new Error('Your saved onboarding could not be submitted.')
      return submitClientOnboarding(token, latest.lock_version)
    },
    onSuccess: (next) => {
      queryClient.setQueryData(onboardingQueryKey, next)
      setDirty(false)
      setValidationError(null)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    },
    onError: (error) => setValidationError(error instanceof Error ? error.message : 'Your onboarding could not be submitted.'),
  })

  const uploadMutation = useMutation({
    mutationFn: async ({ questionId, file }: { questionId: string; file: File }) => {
      if (!view || view.lock_version === undefined) throw new Error('Your onboarding is not ready for uploads.')
      let latest = view
      if (dirty) {
        const savedEditVersion = editVersion.current
        latest = await saveClientOnboarding(token, answers, currentSection, view.lock_version)
        cacheSavedDraft(latest, savedEditVersion)
      }
      if (latest.lock_version === undefined) throw new Error('Save your progress before uploading.')
      return uploadClientOnboardingAsset(token, questionId, file, latest.lock_version)
    },
    onSuccess: (next) => {
      queryClient.setQueryData(onboardingQueryKey, next)
      setAnswers(next.answers)
      setDirty(false)
      setValidationError(null)
      initializedVersion.current = `${next.id}:${next.lock_version}:${next.status}`
    },
    onError: (error) => setValidationError(error instanceof Error ? error.message : 'The file could not be uploaded.'),
  })

  const deleteUploadMutation = useMutation({
    mutationFn: async ({ assetId }: { assetId: string }) => {
      if (!view || view.lock_version === undefined) throw new Error('Your onboarding is not ready.')
      let latest = view
      if (dirty) {
        const savedEditVersion = editVersion.current
        latest = await saveClientOnboarding(token, answers, currentSection, view.lock_version)
        cacheSavedDraft(latest, savedEditVersion)
      }
      if (latest.lock_version === undefined) throw new Error('Save your progress before removing the file.')
      return deleteClientOnboardingAsset(token, assetId, latest.lock_version)
    },
    onSuccess: (next) => {
      queryClient.setQueryData(onboardingQueryKey, next)
      setAnswers(next.answers)
      setDirty(false)
      initializedVersion.current = `${next.id}:${next.lock_version}:${next.status}`
    },
    onError: (error) => setValidationError(error instanceof Error ? error.message : 'The file could not be removed.'),
  })

  useEffect(() => {
    if (
      !dirty
      || saveMutation.isPending
      || submitMutation.isPending
      || uploadMutation.isPending
      || deleteUploadMutation.isPending
      || !view?.definition
      || view.lock_version === undefined
    ) return
    const timeout = window.setTimeout(() => saveMutation.mutate({
      nextSection: currentSection,
      savedEditVersion: editVersion.current,
    }), 1200)
    return () => window.clearTimeout(timeout)
  }, [answers, currentSection, deleteUploadMutation.isPending, dirty, saveMutation, submitMutation.isPending, uploadMutation.isPending, view?.definition, view?.lock_version])

  const questionSection = useMemo(() => {
    const result = new Map<string, number>()
    view?.definition?.sections.forEach((section, sectionIndex) => {
      section.questions.forEach((question) => result.set(question.id, sectionIndex))
    })
    return result
  }, [view?.definition])

  const setAnswer = (questionId: string, value: unknown) => {
    editVersion.current += 1
    setAnswers((current) => ({ ...current, [questionId]: value }))
    setDirty(true)
    setSaveState('idle')
    setValidationError(null)
  }

  const goNext = async () => {
    if (!view?.definition) return
    const error = sectionError(view, answers, currentSection)
    if (error) {
      setValidationError(error)
      return
    }
    const next = Math.min(currentSection + 1, view.definition.sections.length - 1)
    setValidationError(null)
    try {
      const saved = await saveMutation.mutateAsync({
        nextSection: next,
        savedEditVersion: editVersion.current,
      })
      setAnswers(saved.answers)
    } catch {
      return
    }
    setCurrentSection(next)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  if (onboardingQuery.isLoading) {
    return <div className="flex min-h-screen items-center justify-center bg-[#f5f4ff]"><div className="text-center"><Loader2 className="mx-auto h-10 w-10 animate-spin text-[#665cf2]" /><p className="mt-3 text-sm text-slate-600">Opening your secure onboarding…</p></div></div>
  }

  if (onboardingQuery.error || !view) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f5f4ff] p-4">
        <Card className="w-full max-w-lg text-center"><CardHeader><div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-red-50"><LockKeyhole className="h-7 w-7 text-red-600" /></div><CardTitle>Onboarding link unavailable</CardTitle><CardDescription>{onboardingQuery.error instanceof Error ? onboardingQuery.error.message : 'Ask your agency for a new secure link.'}</CardDescription></CardHeader><CardContent><Button variant="outline" onClick={() => void onboardingQuery.refetch()}><RefreshCw className="mr-2 h-4 w-4" />Try again</Button></CardContent></Card>
      </div>
    )
  }

  const terminal = ['submitted', 'approved', 'expired', 'revoked'].includes(view.status)
  if (terminal) {
    const content = view.status === 'submitted'
      ? { title: 'Onboarding submitted', body: view.completion_message || 'Your answers are now with your agency for review.', icon: <CheckCircle2 className="h-9 w-9 text-emerald-600" /> }
      : view.status === 'approved'
        ? { title: 'Your profile is approved', body: 'Your agency finalized your podcast guest profile. No further action is needed here.', icon: <CheckCircle2 className="h-9 w-9 text-emerald-600" /> }
        : view.status === 'expired'
          ? { title: 'This secure link has expired', body: 'Your saved draft is retained. Ask your agency to extend or rotate the link so you can continue.', icon: <Clock3 className="h-9 w-9 text-amber-600" /> }
          : { title: 'This secure link was revoked', body: 'Contact your agency if you still need to complete onboarding.', icon: <LockKeyhole className="h-9 w-9 text-red-600" /> }
    return (
      <div className="min-h-screen bg-[#f5f4ff] px-4 py-10">
        <div className="mx-auto max-w-2xl">
          <BrandHeader workspace={view.workspace} />
          <Card className="mt-6 text-center shadow-xl shadow-violet-950/5"><CardHeader><div className="mx-auto mb-3 flex h-20 w-20 items-center justify-center rounded-full bg-slate-50">{content.icon}</div><CardTitle className="text-2xl">{content.title}</CardTitle><CardDescription className="mx-auto max-w-lg text-base leading-7">{content.body}</CardDescription></CardHeader></Card>
        </div>
      </div>
    )
  }

  if (!view.definition || view.lock_version === undefined) {
    return <div className="flex min-h-screen items-center justify-center bg-[#f5f4ff] p-4"><Card><CardHeader><CardTitle>Onboarding unavailable</CardTitle><CardDescription>The form could not be loaded. Ask your agency for help.</CardDescription></CardHeader></Card></div>
  }

  const section = view.definition.sections[currentSection]
  const progress = ((currentSection + 1) / view.definition.sections.length) * 100
  const activeComments = view.comments ?? []

  return (
    <div className="min-h-screen bg-[#f5f4ff] pb-14">
      <div className="mx-auto max-w-4xl px-4 py-6 sm:py-10">
        <BrandHeader workspace={view.workspace} />

        <Card className="mt-6 overflow-hidden border-violet-100 shadow-xl shadow-violet-950/5">
          <div className="h-1.5 bg-gradient-to-r from-[#4b42c4] via-[#776cf7] to-[#a69fff]" />
          <CardHeader className="space-y-4 p-5 sm:p-8">
            <div><Badge variant="outline" className="mb-3 border-violet-200 bg-violet-50 text-violet-700">Private client intake</Badge><CardTitle className="text-2xl sm:text-3xl">{view.definition.intro_title}</CardTitle><CardDescription className="mt-2 max-w-2xl text-base leading-7">{view.definition.intro_body}</CardDescription></div>
            <div className="space-y-2"><div className="flex items-center justify-between text-sm"><span className="font-medium">Section {currentSection + 1} of {view.definition.sections.length}</span><span className="text-slate-500">{Math.round(progress)}%</span></div><Progress value={progress} className="h-2" /></div>
            <div className="flex items-center gap-2 text-xs text-slate-500"><LockKeyhole className="h-3.5 w-3.5" />Your answers save securely to your agency workspace. This page does not store them in your browser.</div>
          </CardHeader>

          <CardContent className="space-y-6 border-t bg-white p-5 sm:p-8">
            {activeComments.length > 0 && (
              <Alert className="border-amber-200 bg-amber-50"><MessageSquareMore className="h-4 w-4 text-amber-700" /><AlertTitle>Updates requested</AlertTitle><AlertDescription><p className="mb-3">Your agency left notes on these questions. Update each answer, then resubmit.</p><div className="space-y-2">{activeComments.map((comment) => <button key={comment.id} type="button" className="block w-full rounded-lg border border-amber-200 bg-white p-3 text-left text-sm hover:border-amber-400" onClick={() => setCurrentSection(questionSection.get(comment.question_id) ?? 0)}><span className="font-semibold">{view.definition?.sections.flatMap((item) => item.questions).find((question) => question.id === comment.question_id)?.label}</span><span className="mt-1 block text-amber-900">{comment.body}</span></button>)}</div></AlertDescription></Alert>
            )}

            <div><p className="text-xs font-bold uppercase tracking-[.16em] text-[#665cf2]">Section {currentSection + 1}</p><h2 className="mt-1 text-2xl font-bold text-slate-900">{section.title}</h2>{section.description && <p className="mt-2 text-slate-600">{section.description}</p>}</div>

            <div className="space-y-7">{section.questions.map((question) => (
              <QuestionField
                key={question.id}
                question={question}
                answer={answers[question.id]}
                asset={view.assets.find((candidate) => candidate.question_id === question.id)}
                disabled={submitMutation.isPending || uploadMutation.isPending || deleteUploadMutation.isPending}
                onChange={(value) => setAnswer(question.id, value)}
                onUpload={(file) => uploadMutation.mutate({ questionId: question.id, file })}
                onDeleteUpload={(assetId) => deleteUploadMutation.mutate({ assetId })}
              />
            ))}</div>

            {validationError && <Alert variant="destructive"><AlertTitle>Please check this section</AlertTitle><AlertDescription>{validationError}</AlertDescription></Alert>}

            <div className="flex flex-col-reverse gap-3 border-t pt-6 sm:flex-row sm:items-center sm:justify-between">
              <Button variant="outline" disabled={currentSection === 0 || saveMutation.isPending || uploadMutation.isPending || deleteUploadMutation.isPending || submitMutation.isPending} onClick={() => { editVersion.current += 1; setCurrentSection((value) => Math.max(0, value - 1)); setDirty(true); window.scrollTo({ top: 0, behavior: 'smooth' }) }}><ArrowLeft className="mr-2 h-4 w-4" />Previous</Button>
              <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
                <span className={`inline-flex items-center justify-center gap-1.5 text-xs ${saveState === 'error' ? 'text-red-600' : 'text-slate-500'}`}>{saveMutation.isPending || saveState === 'saving' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : saveState === 'saved' ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Save className="h-3.5 w-3.5" />}{saveMutation.isPending || saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : saveState === 'error' ? 'Save failed' : dirty ? 'Unsaved changes' : 'Progress saved'}</span>
                {currentSection < view.definition.sections.length - 1 ? <Button disabled={saveMutation.isPending || uploadMutation.isPending || deleteUploadMutation.isPending || submitMutation.isPending} onClick={() => void goNext()}>Save & continue<ArrowRight className="ml-2 h-4 w-4" /></Button> : <Button disabled={saveMutation.isPending || uploadMutation.isPending || deleteUploadMutation.isPending || submitMutation.isPending} onClick={() => submitMutation.mutate()}>{submitMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}Submit for review</Button>}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

const BrandHeader = ({ workspace }: { workspace: ClientOnboardingView['workspace'] }) => (
  <header className="overflow-hidden rounded-3xl bg-gradient-to-br from-[#17133f] via-[#302a78] to-[#665cf2] p-5 text-white shadow-2xl shadow-violet-950/15 sm:p-7">
    <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
      {workspace.logo_url ? <div className="flex h-28 w-full max-w-xs items-center justify-center rounded-2xl border border-white/20 bg-white/10 p-3 backdrop-blur sm:h-24 sm:w-64"><img src={workspace.logo_url} alt={`${workspace.name} logo`} className="max-h-full max-w-full object-contain drop-shadow-lg" /></div> : <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-white/15 text-2xl font-black ring-1 ring-white/20">{workspace.name.split(/\s+/u).slice(0, 2).map((part) => part[0]).join('').toUpperCase()}</div>}
      <div className="min-w-0"><p className="text-xs font-bold uppercase tracking-[.18em] text-violet-200">Client onboarding</p><h1 className="mt-1 truncate text-2xl font-bold sm:text-3xl">{workspace.name}</h1><p className="mt-1 text-sm text-violet-100">Secure podcast guest intake</p></div>
    </div>
  </header>
)

interface QuestionFieldProps {
  question: OnboardingQuestion
  answer: unknown
  asset: ClientOnboardingView['assets'][number] | undefined
  disabled: boolean
  onChange: (value: unknown) => void
  onUpload: (file: File) => void
  onDeleteUpload: (assetId: string) => void
}

const QuestionField = ({ question, answer, asset, disabled, onChange, onUpload, onDeleteUpload }: QuestionFieldProps) => {
  const inputId = `onboarding-${question.id}`
  const fileInput = useRef<HTMLInputElement>(null)
  const label = <Label htmlFor={inputId} className="text-base font-semibold text-slate-900">{question.label}{question.required && <span className="text-red-500"> *</span>}</Label>
  const help = question.description && <p className="text-sm leading-6 text-slate-500">{question.description}</p>

  if (question.type === 'long_text') return <div className="space-y-2">{label}{help}<Textarea id={inputId} rows={6} maxLength={20000} disabled={disabled} value={typeof answer === 'string' ? answer : ''} placeholder={question.placeholder} onChange={(event) => onChange(event.target.value)} /></div>
  if (question.type === 'yes_no') return <div className="space-y-3">{label}{help}<RadioGroup disabled={disabled} value={typeof answer === 'boolean' ? String(answer) : ''} onValueChange={(value) => onChange(value === 'true')} className="flex gap-5"><label className="flex items-center gap-2"><RadioGroupItem value="true" />Yes</label><label className="flex items-center gap-2"><RadioGroupItem value="false" />No</label></RadioGroup></div>
  if (question.type === 'single_select') return <div className="space-y-2">{label}{help}<Select disabled={disabled} value={typeof answer === 'string' ? answer : ''} onValueChange={onChange}><SelectTrigger id={inputId}><SelectValue placeholder="Choose an option" /></SelectTrigger><SelectContent>{question.options?.map((option) => <SelectItem key={option.id} value={option.id}>{option.label}</SelectItem>)}</SelectContent></Select></div>
  if (question.type === 'multi_select') {
    const selected = Array.isArray(answer) ? answer.filter((value): value is string => typeof value === 'string') : []
    return <div className="space-y-3">{label}{help}<div className="grid gap-2 sm:grid-cols-2">{question.options?.map((option) => <label key={option.id} className="flex items-center gap-3 rounded-lg border p-3 text-sm hover:border-violet-300"><Checkbox disabled={disabled} checked={selected.includes(option.id)} onCheckedChange={(checked) => onChange(checked === true ? [...selected, option.id] : selected.filter((value) => value !== option.id))} />{option.label}</label>)}</div></div>
  }
  if (question.type === 'image_upload' || question.type === 'document_upload') {
    const accept = question.type === 'image_upload' ? 'image/png,image/jpeg,image/webp' : 'application/pdf'
    return <div className="space-y-2">{label}{help}{asset ? <div className="flex flex-col gap-3 rounded-xl border bg-slate-50 p-4 sm:flex-row sm:items-center"><div className="flex h-11 w-11 items-center justify-center rounded-lg bg-white">{question.type === 'image_upload' ? <ImageIcon className="h-5 w-5 text-violet-600" /> : <FileText className="h-5 w-5 text-violet-600" />}</div><div className="min-w-0 flex-1">{asset.signed_url ? <a className="block truncate text-sm font-semibold text-violet-700 hover:underline" href={asset.signed_url} target="_blank" rel="noreferrer">{asset.original_name}</a> : <p className="truncate text-sm font-semibold text-slate-600">{asset.original_name} · preview unavailable</p>}<p className="text-xs text-slate-500">{(asset.byte_size / 1_048_576).toFixed(1)} MB</p></div><Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => onDeleteUpload(asset.id)}><Trash2 className="mr-2 h-4 w-4" />Remove</Button></div> : <button type="button" disabled={disabled} className="flex w-full flex-col items-center justify-center rounded-xl border-2 border-dashed border-violet-200 bg-violet-50/40 p-7 text-center transition hover:border-violet-400 disabled:opacity-60" onClick={() => fileInput.current?.click()}><UploadCloud className="h-8 w-8 text-violet-600" /><span className="mt-2 text-sm font-semibold text-violet-800">Choose {question.type === 'image_upload' ? 'an image' : 'a PDF'}</span><span className="mt-1 text-xs text-slate-500">{question.type === 'image_upload' ? 'PNG, JPEG, or WebP up to 5 MB' : 'PDF up to 10 MB'}</span></button>}<input ref={fileInput} id={inputId} type="file" accept={accept} className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) onUpload(file); event.currentTarget.value = '' }} /></div>
  }
  return <div className="space-y-2">{label}{help}<Input id={inputId} disabled={disabled} type={question.type === 'email' ? 'email' : question.type === 'url' ? 'url' : question.type === 'date' ? 'date' : 'text'} maxLength={question.type === 'url' ? 2048 : 500} value={typeof answer === 'string' ? answer : ''} placeholder={question.placeholder} onChange={(event) => onChange(event.target.value)} /></div>
}

const ClientOnboardingPage = () => (
  <>
    <PageSEO
      title="Secure client onboarding"
      description="Private podcast guest onboarding shared by your agency."
      path="/onboarding"
      noindex
    />
    <ClientOnboarding />
  </>
)

export default ClientOnboardingPage
