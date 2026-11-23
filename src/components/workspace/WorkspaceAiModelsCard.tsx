import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ModelOptions } from '@/components/workspace/ModelOptions'
import { Card, CardContent } from '@/components/ui/card'
import { RESEARCH_PROMPT_DEFAULTS_BY_ID, type ResearchPromptId } from '@/lib/researchPromptDefaults'
import {
  getWorkspaceAiModels,
  getWorkspacePromptModels,
  getWorkspaceResearchPromptOverrides,
  setWorkspaceAiModel,
  setWorkspacePromptModel,
  type PromptModelOption,
  type WorkspaceAiModelStepId,
} from '@/services/workspaceCampaigns'

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

interface ModelSelectProps {
  id: string
  value: string | null
  emptyLabel: string
  models: PromptModelOption[]
  disabled: boolean
  onChange: (model: string | null) => void
}

const ModelSelect = ({ id, value, emptyLabel, models, disabled, onChange }: ModelSelectProps) => (
  <select
    id={id}
    className="h-9 w-full rounded-md border bg-background px-2 text-sm disabled:cursor-not-allowed disabled:opacity-60 sm:w-72"
    value={value ?? ''}
    disabled={disabled}
    onChange={(event) => onChange(event.target.value === '' ? null : event.target.value)}
  >
    <option value="">{emptyLabel}</option>
    {/* A saved model the current key no longer lists is shown, not silently blanked. */}
    {value && !models.some((model) => model.id === value) && <option value={value}>{value} (not available with the current key)</option>}
    <ModelOptions models={models} />
  </select>
)

interface WorkspaceAiModelsCardProps { workspaceId: string }

export const WorkspaceAiModelsCard = ({ workspaceId }: WorkspaceAiModelsCardProps) => {
  const queryClient = useQueryClient()
  const modelsQuery = useQuery({
    queryKey: ['workspace-prompt-models', workspaceId],
    queryFn: () => getWorkspacePromptModels(workspaceId),
    retry: false,
    staleTime: 10 * 60_000,
  })
  const settingsQuery = useQuery({
    queryKey: ['workspace-ai-models', workspaceId],
    queryFn: () => getWorkspaceAiModels(workspaceId),
    retry: false,
  })
  const stagesQuery = useQuery({
    queryKey: ['workspace-research-prompts', workspaceId],
    queryFn: () => getWorkspaceResearchPromptOverrides(workspaceId),
    retry: false,
  })
  const onError = (error: unknown) => toast.error(error instanceof Error ? error.message : 'The model could not be saved.')
  const stepMutation = useMutation({
    mutationFn: ({ id, model }: { id: 'default' | WorkspaceAiModelStepId; model: string | null }) => setWorkspaceAiModel(workspaceId, id, model),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['workspace-ai-models', workspaceId] })
      toast.success('Model saved for this workspace.')
    },
    onError,
  })
  const stageMutation = useMutation({
    mutationFn: ({ id, model }: { id: ResearchPromptId; model: string | null }) => setWorkspacePromptModel(workspaceId, id, model),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['workspace-research-prompts', workspaceId] })
      toast.success('Model saved for this workspace.')
    },
    onError,
  })

  const loading = modelsQuery.isLoading || settingsQuery.isLoading || stagesQuery.isLoading
  const failed = modelsQuery.isError || settingsQuery.isError || stagesQuery.isError
  const busy = loading || failed || stepMutation.isPending || stageMutation.isPending
  const models = modelsQuery.data ?? []
  const settings = settingsQuery.data
  const row = (key: string, label: string, description: string, select: JSX.Element) => (
    <div key={key} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0"><label htmlFor={`ai-model-${key}`} className="text-sm font-medium">{label}</label><p className="text-xs text-muted-foreground">{description}</p></div>
      {select}
    </div>
  )

  return (
    <Card>
      <CardContent className="space-y-4 p-5 sm:p-6">
        <div>
          <h3 className="font-semibold">AI models</h3>
          <p className="mt-1 text-sm text-muted-foreground">Choose which model each AI step runs on. Steps left on “Workspace default” follow the default model. Changing a model changes what that step writes and what it costs on your provider account. Changes apply to new requests for everyone in this workspace.</p>
        </div>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status"><Loader2 className="h-4 w-4 animate-spin" />Loading models…</div>
        ) : failed ? (
          <div className="space-y-3 rounded-lg border border-destructive/20 bg-destructive/5 p-4" role="alert">
            <p className="text-sm">We couldn’t read the models for this workspace. Connect a Claude, OpenAI or OpenRouter key above, then retry. Nothing has been changed.</p>
            <Button variant="outline" size="sm" onClick={() => { void modelsQuery.refetch(); void settingsQuery.refetch(); void stagesQuery.refetch() }}>Retry</Button>
          </div>
        ) : (
          <>
            {row('default', 'Default model', 'Used by every step below that is left on “Workspace default”.',
              <ModelSelect id="ai-model-default" value={settings?.default ?? null} emptyLabel="Shipped default (Claude Sonnet 5.5)" models={models} disabled={busy}
                onChange={(model) => stepMutation.mutate({ id: 'default', model })} />)}
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Research and pitch stages</h4>
              <div className="divide-y">
                {STAGES.map((id) => row(id, RESEARCH_PROMPT_DEFAULTS_BY_ID[id].label, RESEARCH_PROMPT_DEFAULTS_BY_ID[id].description,
                  <ModelSelect id={`ai-model-${id}`} value={stagesQuery.data?.[id]?.model ?? null} emptyLabel="Workspace default" models={models} disabled={busy}
                    onChange={(model) => stageMutation.mutate({ id, model })} />))}
              </div>
            </div>
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Other AI steps</h4>
              <div className="divide-y">
                {STEPS.map((step) => row(step.id, step.label, step.description,
                  <ModelSelect id={`ai-model-${step.id}`} value={settings?.[step.id] ?? null} emptyLabel="Workspace default" models={models} disabled={busy}
                    onChange={(model) => stepMutation.mutate({ id: step.id, model })} />))}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
