import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { AiStepTestStatus } from '@/components/workspace/AiStepTestStatus'
import { ModelOptions } from '@/components/workspace/ModelOptions'
import { useAiStepTests } from '@/components/workspace/useAiStepTests'
import { notifySaved } from '@/components/workspace/settings/savedToast'
import { defaultAiProvider, groupModels, modelLabel, SHIPPED_DEFAULT_MODEL, workspaceAiKeysQueryKey } from '@/lib/aiModelGroups'
import { RESEARCH_PROMPT_DEFAULTS_BY_ID, type ResearchPromptId } from '@/lib/researchPromptDefaults'
import { cn } from '@/lib/utils'
import {
  getWorkspaceAiModels,
  getWorkspacePromptModels,
  getWorkspaceResearchPromptOverrides,
  setWorkspaceAiModel,
  setWorkspacePromptModel,
  type PromptModelOption,
  type ResearchPromptOverrides,
  type WorkspaceAiModels,
  type WorkspaceAiModelStepId,
} from '@/services/workspaceCampaigns'
import { getWorkspaceAiKeys } from '@/services/workspaceStaff'

// The research and pitch stages keep their per-stage choice (also editable on
// the Pitch page). The inbox stages are retired, so they are not offered.
const STAGES: ResearchPromptId[] = [
  'podcast_research', 'host_info', 'guest_info', 'host_name_extractor', 'find_topics', 'write_email', 'clean_email',
]

const STEPS: Array<{ id: WorkspaceAiModelStepId; label: string; description: string }> = [
  { id: 'research_structure', label: 'Research summary', description: 'Turns finished research into the show summary, fit reasons and pitch angles.' },
  { id: 'pitch_fact_check', label: 'Pitch fact-check', description: 'Checks each drafted pitch for claims the research does not support.' },
  { id: 'host_discovery', label: 'Host LinkedIn lookup', description: 'Searches the web for the host’s LinkedIn profile during an email unlock.' },
  { id: 'fit_scoring', label: 'Fit scoring', description: 'Scores how well shows fit a client in the finder and on the shortlist.' },
  { id: 'search_queries', label: 'Search queries', description: 'Drafts podcast search queries for a client or prospect.' },
  { id: 'prospect_dashboard', label: 'Prospect dashboards', description: 'Ranks shows and writes the fit explanations when a dashboard is built.' },
  { id: 'autopilot', label: 'Autopilot', description: 'Drafts searches and scores new shows for autopilot clients each week.' },
  { id: 'profile_drafts', label: 'Profile drafts', description: 'Drafts client pitch profiles from onboarding answers and research.' },
]

const TOTAL_STEPS = STAGES.length + STEPS.length
const ALL_STEP_IDS: string[] = [...STAGES, ...STEPS.map((step) => step.id)]

type Target = { kind: 'step'; id: 'default' | WorkspaceAiModelStepId } | { kind: 'stage'; id: ResearchPromptId }

interface ModelSelectProps {
  id: string
  value: string | null
  emptyLabel: string
  models: PromptModelOption[]
  custom?: boolean
  disabled: boolean
  onChange: (model: string | null) => void
}

const ModelSelect = ({ id, value, emptyLabel, models, custom, disabled, onChange }: ModelSelectProps) => {
  const grouped = models.some((model) => model.group)
  const { latest, older } = groupModels(models)
  return (
    <select
      id={id}
      className={cn(
        'h-11 w-full rounded-md border bg-background px-3 text-sm disabled:cursor-not-allowed disabled:opacity-60 sm:w-72',
        custom && 'border-2 border-primary',
      )}
      value={value ?? ''}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value === '' ? null : event.target.value)}
    >
      <option value="">{emptyLabel}</option>
      {/* A saved model the current key no longer lists is shown, not silently blanked. */}
      {value && !models.some((model) => model.id === value) && <option value={value}>{value} (not available with the current key)</option>}
      {/* An OpenRouter key reaches many vendors, so its list comes grouped
          by vendor instead of by release. */}
      {grouped && <ModelOptions models={models} />}
      {!grouped && latest.length > 0 && (
        <optgroup label="Latest">
          {latest.map((model) => <option key={model.id} value={model.id}>{model.label}</option>)}
        </optgroup>
      )}
      {!grouped && older.length > 0 && (
        <optgroup label="Older">
          {older.map((model) => <option key={model.id} value={model.id}>{model.label}</option>)}
        </optgroup>
      )}
    </select>
  )
}

interface WorkspaceAiModelsCardProps { workspaceId: string }

export const WorkspaceAiModelsCard = ({ workspaceId }: WorkspaceAiModelsCardProps) => {
  const queryClient = useQueryClient()
  const [confirmReset, setConfirmReset] = useState(false)
  const stepTests = useAiStepTests(workspaceId)
  const settingsKey = ['workspace-ai-models', workspaceId]
  const stagesKey = ['workspace-research-prompts', workspaceId]
  const modelsQuery = useQuery({
    queryKey: ['workspace-prompt-models', workspaceId],
    queryFn: () => getWorkspacePromptModels(workspaceId),
    retry: false,
    staleTime: 10 * 60_000,
  })
  const settingsQuery = useQuery({ queryKey: settingsKey, queryFn: () => getWorkspaceAiModels(workspaceId), retry: false })
  const stagesQuery = useQuery({ queryKey: stagesKey, queryFn: () => getWorkspaceResearchPromptOverrides(workspaceId), retry: false })
  const keysQuery = useQuery({ queryKey: workspaceAiKeysQueryKey(workspaceId), queryFn: () => getWorkspaceAiKeys(workspaceId), retry: false })

  /*
   * Written into the cache before the request, so every "Use default (…)"
   * label and Custom pill moves the moment a choice is made. A failed save
   * puts the last server answer back.
   */
  const applyLocally = (target: Target, model: string | null) => {
    if (target.kind === 'step') {
      queryClient.setQueryData<WorkspaceAiModels>(settingsKey, (current) => (current ? { ...current, [target.id]: model } : current))
    } else {
      queryClient.setQueryData<ResearchPromptOverrides>(stagesKey, (current) => ({
        ...current,
        [target.id]: { content: null, updated_at: null, ...current?.[target.id], model },
      }))
    }
  }
  const save = (target: Target, model: string | null) => (target.kind === 'step'
    ? setWorkspaceAiModel(workspaceId, target.id, model)
    : setWorkspacePromptModel(workspaceId, target.id, model))
  const resync = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: settingsKey }),
    queryClient.invalidateQueries({ queryKey: stagesKey }),
  ])
  const onError = (error: unknown) => {
    void resync()
    toast.error(error instanceof Error ? error.message : 'The model could not be saved.')
  }

  const choiceMutation = useMutation({
    mutationFn: ({ target, model }: { target: Target; model: string | null }) => save(target, model),
    onMutate: ({ target, model }) => {
      // A result describes the model the step ran on; the default reaches every
      // step left on it, so changing the default clears them all.
      stepTests.clear(target.id === 'default' ? undefined : [target.id])
      applyLocally(target, model)
    },
    onSuccess: () => { void resync(); notifySaved() },
    onError,
  })

  const settings = settingsQuery.data
  const stageModel = (id: ResearchPromptId) => stagesQuery.data?.[id]?.model ?? null
  const customTargets: Target[] = [
    ...STAGES.filter((id) => stageModel(id)).map((id) => ({ kind: 'stage', id }) as Target),
    ...STEPS.filter((step) => settings?.[step.id]).map((step) => ({ kind: 'step', id: step.id }) as Target),
  ]
  const customCount = customTargets.length

  const resetMutation = useMutation({
    mutationFn: async (targets: Target[]) => {
      for (const target of targets) await save(target, null)
    },
    onMutate: (targets) => {
      stepTests.clear(targets.map((target) => target.id))
      targets.forEach((target) => applyLocally(target, null))
    },
    onSuccess: () => { void resync(); notifySaved() },
    onError,
  })

  const loading = modelsQuery.isLoading || settingsQuery.isLoading || stagesQuery.isLoading
  const failed = modelsQuery.isError || settingsQuery.isError || stagesQuery.isError
  const busy = loading || failed || resetMutation.isPending
  const models = modelsQuery.data ?? []
  const provider = defaultAiProvider(keysQuery.data) ?? 'anthropic'
  const shippedName = modelLabel(models, SHIPPED_DEFAULT_MODEL[provider])
  const defaultName = settings?.default ? modelLabel(models, settings.default) : shippedName
  const useDefaultLabel = `Use default (${defaultName})`

  const row = (key: string, label: string, description: string, value: string | null, target: Target) => (
    <div key={key} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-3">
      <div className="min-w-0 flex-1 basis-64">
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor={`ai-model-${key}`} className="text-sm font-medium">{label}</label>
          {value && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">Custom</span>}
        </div>
        <p className="text-xs text-muted-foreground">{description}</p>
        <AiStepTestStatus test={stepTests.tests[key]} />
      </div>
      <div className="flex w-full items-center gap-2 sm:w-auto">
      <ModelSelect
        id={`ai-model-${key}`}
        value={value}
        emptyLabel={useDefaultLabel}
        models={models}
        custom={Boolean(value)}
        disabled={busy}
        onChange={(model) => choiceMutation.mutate({ target, model })}
      />
        <Button
          type="button"
          variant="outline"
          className="min-h-11 shrink-0"
          disabled={busy || stepTests.tests[key]?.status === 'running'}
          aria-label={`Test ${label} on its model`}
          onClick={() => void stepTests.runOne(key)}
        >
          Test
        </Button>
      </div>
    </div>
  )

  return (
    <Card className="min-w-0 border-border/70 shadow-sm">
      <CardContent className="space-y-5 p-5 sm:p-6">
        <div>
          <h3 className="font-semibold">AI models</h3>
          <p className="mt-1 text-sm text-muted-foreground">Pick a default model, then change any step you want. Bigger models write better and cost more.</p>
        </div>
        {loading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Loading models…</p>
        ) : failed ? (
          <div className="space-y-3 rounded-lg border border-destructive/20 bg-destructive/5 p-4" role="alert">
            <p className="text-sm">We couldn't read the models for this workspace. Save a Claude, OpenAI or OpenRouter key above, then try again. Nothing has been changed.</p>
            <Button variant="outline" className="min-h-11" onClick={() => { void modelsQuery.refetch(); void settingsQuery.refetch(); void stagesQuery.refetch() }}>Try again</Button>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 rounded-lg border border-primary/20 bg-primary/5 p-4">
              <div className="min-w-0 flex-1 basis-64">
                <label htmlFor="ai-model-default" className="text-sm font-semibold">Default model</label>
                <p className="text-xs text-muted-foreground">Every step set to "Use default" runs on this.</p>
              </div>
              <ModelSelect
                id="ai-model-default"
                value={settings?.default ?? null}
                emptyLabel={`Recommended (${shippedName})`}
                models={models}
                disabled={busy}
                onChange={(model) => choiceMutation.mutate({ target: { kind: 'step', id: 'default' }, model })}
              />
            </div>

            <div className="flex min-h-11 flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground" aria-live="polite">
                {customCount === 0
                  ? `All ${TOTAL_STEPS} steps use the default model`
                  : `${customCount} of ${TOTAL_STEPS} steps use a custom model`}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" className="min-h-11" disabled={busy || stepTests.running} onClick={() => void stepTests.runAll(ALL_STEP_IDS)}>
                  {stepTests.running ? 'Testing…' : `Test all ${TOTAL_STEPS} steps`}
                </Button>
                {customCount > 0 && (
                  <Button type="button" variant="outline" className="min-h-11" disabled={busy} onClick={() => setConfirmReset(true)}>
                    Reset all to default
                  </Button>
                )}
              </div>
            </div>

            <section aria-labelledby="ai-models-research">
              <h4 id="ai-models-research" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Research and pitch</h4>
              <div className="divide-y">
                {STAGES.map((id) => row(id, RESEARCH_PROMPT_DEFAULTS_BY_ID[id].label, RESEARCH_PROMPT_DEFAULTS_BY_ID[id].description, stageModel(id), { kind: 'stage', id }))}
              </div>
            </section>
            <section aria-labelledby="ai-models-other">
              <h4 id="ai-models-other" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Everything else</h4>
              <div className="divide-y">
                {STEPS.map((step) => row(step.id, step.label, step.description, settings?.[step.id] ?? null, { kind: 'step', id: step.id }))}
              </div>
            </section>
          </>
        )}
        <p className="border-t pt-4 text-xs text-muted-foreground">Changes apply to new requests for everyone in this workspace. Test sends one small request per step to its model on your AI key, to check the step works there; the host lookup test also runs a web search. Tests use no credits.</p>
      </CardContent>

      <AlertDialog open={confirmReset} onOpenChange={setConfirmReset}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset all steps to the default?</AlertDialogTitle>
            <AlertDialogDescription>
              {customCount} {customCount === 1 ? 'step goes' : 'steps go'} back to {defaultName}. The default model itself does not change.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => resetMutation.mutate(customTargets)}>Reset all</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
