import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, LockKeyhole } from 'lucide-react'
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
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { AiKeyRow, type AiKeyProviderInfo } from '@/components/workspace/settings/AiKeyRow'
type AiKeyProvider = import('@/services/workspaceStaff').WorkspaceAiProvider
import {
  clearWorkspaceAiKey,
  getWorkspaceAiKeys,
  setWorkspaceAiKey,
  setWorkspaceAiProvider,
} from '@/services/workspaceStaff'

// What each key is actually spent on, and where to get one, so the choice to
// bring a key is made knowing what it changes.
const PROVIDERS: AiKeyProviderInfo[] = [
  {
    id: 'anthropic',
    label: 'Anthropic (Claude)',
    keyPrefix: 'sk-ant-',
    usedFor: 'Used for podcast research, pitch writing and inbox replies.',
    consoleUrl: 'https://console.anthropic.com/settings/keys',
  },
  { id: 'openai', label: 'OpenAI', keyPrefix: 'sk-', usedFor: 'An alternative to Claude for research, writing, scoring, host discovery and inbox replies.', consoleUrl: 'https://platform.openai.com/api-keys' },
]

interface WorkspaceAiKeysCardProps { workspaceId: string; queryScope: readonly unknown[] }

export function WorkspaceAiKeysCard(props: WorkspaceAiKeysCardProps) {
  // Navigation between tenants must also reset an open removal dialog.
  return <WorkspaceAiKeysPanel key={props.workspaceId} {...props} />
}

function WorkspaceAiKeysPanel({ workspaceId, queryScope }: WorkspaceAiKeysCardProps) {
  const queryClient = useQueryClient()
  // Removing a key pauses its provider-backed features, so confirm the change.
  const [removing, setRemoving] = useState<AiKeyProvider | null>(null)
  const queryKey = [...queryScope, 'workspace-ai-keys']

  const keysQuery = useQuery({
    queryKey,
    queryFn: () => getWorkspaceAiKeys(workspaceId),
    enabled: Boolean(workspaceId),
    retry: false,
  })
  const saveMutation = useMutation({
    mutationFn: ({ provider, apiKey }: { provider: AiKeyProvider; apiKey: string }) =>
      setWorkspaceAiKey(workspaceId, provider, apiKey),
    onSuccess: () => {
      void queryClient.invalidateQueries({ predicate: (query) => query.queryKey.includes(workspaceId) })
      toast.success('Key saved for everyone in this workspace. Your provider bills usage directly.')
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'The API key could not be saved.')
    },
  })

  const removeMutation = useMutation({
    mutationFn: (provider: AiKeyProvider) => clearWorkspaceAiKey(workspaceId, provider),
    onSuccess: () => {
      void queryClient.invalidateQueries({ predicate: (query) => query.queryKey.includes(workspaceId) })
      toast.success('Key removed from this workspace. Connect a replacement to resume new requests.')
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'The API key could not be removed.')
    },
  })

  const providerMutation = useMutation({
    mutationFn: (provider: AiKeyProvider) => setWorkspaceAiProvider(workspaceId, provider),
    onSuccess: () => {
      void queryClient.invalidateQueries({ predicate: (query) => query.queryKey.includes(workspaceId) })
      toast.success('Default AI provider updated for this workspace.')
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'The AI provider could not be saved.'),
  })
  const selectedProvider = keysQuery.data?.default_provider ?? (keysQuery.data?.anthropic.configured ? 'anthropic' : keysQuery.data?.openai?.configured ? 'openai' : '')
  const busy = saveMutation.isPending || removeMutation.isPending || providerMutation.isPending
  const saved = PROVIDERS.filter((provider) => keysQuery.data?.[provider.id]?.configured).length
  const providerRow = (provider: AiKeyProviderInfo) => (
    <AiKeyRow
      key={provider.id}
      workspaceId={workspaceId}
      provider={provider}
      status={keysQuery.data?.[provider.id] ?? null}
      busy={busy || keysQuery.isError}
      saving={saveMutation.isPending && saveMutation.variables?.provider === provider.id}
      onSave={(apiKey) => saveMutation.mutateAsync({ provider: provider.id, apiKey })}
      onRemove={() => setRemoving(provider.id)}
    />
  )

  return (
    <Card>
      <CardContent className="space-y-5 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h3 className="font-semibold">Research & search</h3><p className="mt-1 text-sm text-muted-foreground">Connect Claude or OpenAI and choose the default for your agency. Only one AI key is required. Podcast data, search and contact enrichment are managed by the platform.</p></div>
          {keysQuery.data && !keysQuery.isError && <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium">{saved} {saved === 1 ? 'key' : 'keys'} saved</span>}
        </div>
        <p className="text-sm leading-6 text-muted-foreground">Use company-owned provider accounts: these keys are shared by everyone in your workspace. Changing the workspace owner does not replace or revoke saved keys. Review and replace credentials during a handover, and revoke old keys with the provider when appropriate.</p>
        {keysQuery.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
            <Loader2 className="h-4 w-4 animate-spin" />Loading key status…
          </div>
        ) : keysQuery.isError ? <div className="space-y-3 rounded-lg border border-destructive/20 bg-destructive/5 p-4" role="alert">
          <p className="text-sm">We couldn’t load your provider connections. Your saved keys haven’t been changed.</p>
          <Button variant="outline" size="sm" disabled={keysQuery.isFetching} onClick={() => void keysQuery.refetch()}>Retry connections</Button>
        </div> : <div className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="default-ai-provider" className="text-sm font-medium">Default AI provider</label>
            <select id="default-ai-provider" className="block h-10 w-full rounded-md border bg-background px-3 text-sm" value={selectedProvider} disabled={busy} onChange={(event) => providerMutation.mutate(event.target.value as AiKeyProvider)}>
              {!selectedProvider && <option value="" disabled>Save a Claude or OpenAI key first</option>}
              {PROVIDERS.map((provider) => <option key={provider.id} value={provider.id} disabled={!keysQuery.data?.[provider.id]?.configured}>{provider.label}{!keysQuery.data?.[provider.id]?.configured ? ' (key not saved)' : ''}</option>)}
            </select>
            <p className="text-xs leading-5 text-muted-foreground">Used for research, pitches, scoring, onboarding, host discovery and inbox replies. Stage model choices apply to the selected provider. Switching providers keeps existing stage choices until you change them. We never switch providers automatically after a failed request.</p>
          </div>
          {PROVIDERS.map(providerRow)}
        </div>}
        <div className="flex items-start gap-2 border-t pt-4 text-xs leading-5 text-muted-foreground"><LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /><p>Keys are encrypted and hidden after saving. AI key checks confirm authentication only, not available credits, quota or model access.</p></div>
      </CardContent>
      <AlertDialog open={removing !== null} onOpenChange={(open) => { if (!open) setRemoving(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Remove the {PROVIDERS.find((provider) => provider.id === removing)?.label ?? ''} key?
            </AlertDialogTitle>
            <AlertDialogDescription>
              New requests that need this key will pause for everyone in this workspace until you connect a replacement. Jobs or campaigns already running in the provider account may continue; pause or cancel them with the provider. Removing a key here does not revoke it at the provider.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep the key</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (removing) removeMutation.mutate(removing)
                setRemoving(null)
              }}
            >
              Remove key
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
