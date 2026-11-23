import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, ExternalLink, Loader2, XCircle } from 'lucide-react'
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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { notifySaved } from '@/components/workspace/settings/savedToast'
import { defaultAiProvider, workspaceAiKeysQueryKey } from '@/lib/aiModelGroups'
import { notACredentialField } from '@/lib/formAutofill'
import { cn } from '@/lib/utils'
import {
  clearWorkspaceAiKey,
  getWorkspaceAiKeys,
  setWorkspaceAiKey,
  setWorkspaceAiProvider,
  testWorkspaceAiKey,
  type WorkspaceAiKeyTestResult,
  type WorkspaceAiProvider,
} from '@/services/workspaceStaff'

interface ProviderInfo {
  id: WorkspaceAiProvider
  name: string
  /** The name with its article, for "save an OpenAI key". */
  aName: string
  /** What the provider's keys start with, for showing a saved one masked. */
  keyPrefix: string
  consoleUrl: string
}

const PROVIDERS: ProviderInfo[] = [
  { id: 'anthropic', name: 'Claude', aName: 'a Claude', keyPrefix: 'sk-ant-', consoleUrl: 'https://console.anthropic.com/settings/keys' },
  { id: 'openai', name: 'OpenAI', aName: 'an OpenAI', keyPrefix: 'sk-', consoleUrl: 'https://platform.openai.com/api-keys' },
  // One key for many vendors' models; AI models below then groups them by vendor.
  { id: 'openrouter', name: 'OpenRouter', aName: 'an OpenRouter', keyPrefix: 'sk-or-', consoleUrl: 'https://openrouter.ai/settings/keys' },
]

type TestOutcome = WorkspaceAiKeyTestResult | 'unavailable'

const TEST_FAILURE: Record<Exclude<TestOutcome, 'valid'>, string> = {
  invalid: 'The provider rejected this key. Replace it to keep AI features running.',
  unreachable: 'The provider did not answer. Try again in a minute.',
  unavailable: 'Testing a saved key is not available yet.',
}

interface WorkspaceAiKeysCardProps { workspaceId: string }

export const WorkspaceAiKeysCard = ({ workspaceId }: WorkspaceAiKeysCardProps) => (
  // A new workspace starts clean: no draft key, test result or open dialog.
  <WorkspaceAiProviderPanel key={workspaceId} workspaceId={workspaceId} />
)

const WorkspaceAiProviderPanel = ({ workspaceId }: WorkspaceAiKeysCardProps) => {
  const queryClient = useQueryClient()
  const keysQuery = useQuery({
    queryKey: workspaceAiKeysQueryKey(workspaceId),
    queryFn: () => getWorkspaceAiKeys(workspaceId),
    enabled: Boolean(workspaceId),
    retry: false,
  })
  const currentDefault = defaultAiProvider(keysQuery.data)
  // The tab someone picked. Picking one without a key shows its key field but
  // leaves the default where it is until a key is saved.
  const [picked, setPicked] = useState<WorkspaceAiProvider | null>(null)
  const viewing = picked ?? currentDefault ?? 'anthropic'
  const provider = PROVIDERS.find((item) => item.id === viewing) ?? PROVIDERS[0]
  const status = keysQuery.data?.[viewing]
  const configured = status?.configured === true
  const [replacing, setReplacing] = useState(false)
  const [draft, setDraft] = useState('')
  const [outcome, setOutcome] = useState<TestOutcome | null>(null)
  const [confirmRemove, setConfirmRemove] = useState(false)

  const refresh = () => queryClient.invalidateQueries({ predicate: (query) => query.queryKey.includes(workspaceId) })
  const fail = (fallback: string) => (error: unknown) => toast.error(error instanceof Error ? error.message : fallback)

  const providerMutation = useMutation({
    mutationFn: (next: WorkspaceAiProvider) => setWorkspaceAiProvider(workspaceId, next),
    onSuccess: async () => { await refresh(); notifySaved() },
    onError: fail('The AI provider could not be changed.'),
  })
  const saveMutation = useMutation({
    mutationFn: async () => {
      await setWorkspaceAiKey(workspaceId, viewing, draft.trim())
      // Saving the key is what makes this provider the default.
      if (keysQuery.data?.default_provider !== viewing) {
        await setWorkspaceAiProvider(workspaceId, viewing)
      }
    },
    onSuccess: async () => {
      setDraft('')
      setReplacing(false)
      setOutcome(null)
      await refresh()
      notifySaved()
    },
    onError: fail('The API key could not be saved.'),
  })
  const removeMutation = useMutation({
    mutationFn: () => clearWorkspaceAiKey(workspaceId, viewing),
    onSuccess: async () => {
      setOutcome(null)
      await refresh()
      toast.success(`${provider.name} key removed.`)
    },
    onError: fail('The API key could not be removed.'),
  })
  const testMutation = useMutation({
    mutationFn: () => testWorkspaceAiKey(workspaceId, viewing),
    onMutate: () => setOutcome(null),
    onSuccess: (result) => setOutcome(result),
    // A server without the test action answers INVALID_ACTION; anything else
    // is a failure to ask, not an answer about the key.
    onError: (error) => setOutcome((error as { code?: string }).code === 'INVALID_ACTION' ? 'unavailable' : 'unreachable'),
  })
  const busy = providerMutation.isPending || saveMutation.isPending || removeMutation.isPending || testMutation.isPending

  const pick = (next: WorkspaceAiProvider) => {
    if (next === viewing) return
    setPicked(next)
    setReplacing(false)
    setDraft('')
    setOutcome(null)
    if (keysQuery.data?.[next]?.configured && next !== currentDefault) providerMutation.mutate(next)
  }

  const editing = !configured || replacing
  const inputId = `ai-key-${viewing}`
  const waitingForKey = currentDefault && viewing !== currentDefault && !configured

  return (
    <Card className="min-w-0 border-border/70 shadow-sm">
      <CardContent className="space-y-5 p-5 sm:p-6">
        <div>
          <h3 className="font-semibold">AI provider</h3>
          <p className="mt-1 text-sm text-muted-foreground">Powers research, pitches and inbox replies. Usage bills to your provider account.</p>
        </div>

        {keysQuery.isLoading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Loading…
          </p>
        ) : keysQuery.isError ? (
          <div className="space-y-3 rounded-lg border border-destructive/20 bg-destructive/5 p-4" role="alert">
            <p className="text-sm">We couldn't load your AI provider. Nothing has been changed.</p>
            <Button variant="outline" className="min-h-11" disabled={keysQuery.isFetching} onClick={() => void keysQuery.refetch()}>Try again</Button>
          </div>
        ) : (
          <>
            <div role="group" aria-label="Default AI provider" className="inline-flex rounded-lg border bg-muted/40 p-1">
              {PROVIDERS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={item.id === viewing}
                  disabled={busy}
                  onClick={() => pick(item.id)}
                  className={cn(
                    'min-h-11 min-w-24 rounded-md px-4 text-sm font-medium transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed',
                    item.id === viewing ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {item.name}
                </button>
              ))}
            </div>
            {waitingForKey && (
              <p className="text-sm text-muted-foreground">
                {PROVIDERS.find((item) => item.id === currentDefault)?.name} stays the default until you save {provider.aName} key.
              </p>
            )}

            {configured && !replacing && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <code className="min-h-11 w-full rounded-md sm:w-auto sm:flex-1 border bg-muted/40 px-3 py-3 font-mono text-sm" aria-label={`Saved ${provider.name} key`}>
                    {provider.keyPrefix}…{status?.last_four ?? '????'}
                  </code>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button type="button" variant="outline" className="min-h-11" disabled={busy} onClick={() => testMutation.mutate()}>
                          {testMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
                          Test
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-64">Checks that the provider accepts the key. It does not check credits, quota or model access.</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <Button type="button" variant="outline" className="min-h-11" disabled={busy} onClick={() => setReplacing(true)}>Replace</Button>
                  {outcome === 'valid' && (
                    <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-800" role="status">
                      <CheckCircle2 className="mr-1 h-3.5 w-3.5" aria-hidden="true" />Key works
                    </Badge>
                  )}
                </div>
                {outcome && outcome !== 'valid' && (
                  <p role="status" className={cn('flex items-start gap-1.5 text-sm', outcome === 'invalid' ? 'text-destructive' : 'text-muted-foreground')}>
                    {outcome === 'invalid' && <XCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />}
                    {TEST_FAILURE[outcome]}
                  </p>
                )}
                <div className="flex flex-wrap items-center justify-between gap-x-4">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setConfirmRemove(true)}
                    className="min-h-11 text-sm font-medium text-destructive underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                  >
                    Remove key
                  </button>
                  <a
                    href={provider.consoleUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline"
                  >
                    Get a {provider.name} key<ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                    <span className="sr-only"> (opens in a new tab)</span>
                  </a>
                </div>
              </div>
            )}

            {editing && (
              <form
                className="space-y-2"
                onSubmit={(event) => {
                  event.preventDefault()
                  if (!busy && draft.trim()) saveMutation.mutate()
                }}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label htmlFor={inputId} className="text-sm font-medium">{provider.name} API key</label>
                  <a
                    href={provider.consoleUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline"
                  >
                    Get a key<ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                    <span className="sr-only"> (opens in a new tab)</span>
                  </a>
                </div>
                <div className="flex flex-wrap gap-2">
                  {/* A provider key, not this person's password: kept out of
                      password managers so they neither fill nor save it. */}
                  <Input
                    id={inputId}
                    type="password"
                    {...notACredentialField}
                    spellCheck={false}
                    placeholder={`${provider.keyPrefix}…`}
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    disabled={busy}
                    className="h-11 min-w-0 flex-1 basis-56 font-mono"
                  />
                  <Button type="submit" className="min-h-11" disabled={busy || !draft.trim()}>
                    {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
                    {replacing ? 'Save key' : `Save and use ${provider.name}`}
                  </Button>
                  {replacing && (
                    <Button type="button" variant="ghost" className="min-h-11" disabled={busy} onClick={() => { setReplacing(false); setDraft('') }}>
                      Cancel
                    </Button>
                  )}
                </div>
              </form>
            )}


            <details className="group rounded-lg border px-4">
              <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium">Who can use this key?</summary>
              <p className="pb-4 text-sm text-muted-foreground">
                Everyone in this workspace shares it. If the workspace changes owners, the key stays. Replace it during a handover and revoke the old one with your provider.
              </p>
            </details>
          </>
        )}
      </CardContent>

      <AlertDialog open={confirmRemove} onOpenChange={setConfirmRemove}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove the {provider.name} key?</AlertDialogTitle>
            <AlertDialogDescription>
              New AI requests that need it stop for everyone in this workspace until you add a key. Removing it here does not revoke it with {provider.name}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep the key</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => removeMutation.mutate()}
            >
              Remove key
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
