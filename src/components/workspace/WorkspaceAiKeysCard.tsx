import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, Loader2, LockKeyhole } from 'lucide-react'
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
type AiKeyProvider = keyof import('@/services/workspaceStaff').WorkspaceAiKeysView
import {
  clearWorkspaceAiKey,
  getWorkspaceAiKeys,
  setWorkspaceAiKey,
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
  {
    id: 'openai',
    label: 'OpenAI',
    keyPrefix: 'sk-',
    usedFor: 'Used for searching the podcast database.',
    consoleUrl: 'https://platform.openai.com/api-keys',
  },
  { id: 'podscan', label: 'Podscan', keyPrefix: '', usedFor: 'Live podcast discovery and data refreshes.', consoleUrl: 'https://podscan.fm', optional: true },
  { id: 'blitz', label: 'Blitz', keyPrefix: '', usedFor: 'Direct host contact enrichment.', consoleUrl: '', optional: true },
  { id: 'winnr', label: 'Winnr', keyPrefix: '', usedFor: 'Domains and mailboxes billed to your Winnr account.', consoleUrl: '', optional: true },

]

export function WorkspaceAiKeysCard({ workspaceId, queryScope }: { workspaceId: string; queryScope: readonly unknown[] }) {
  const queryClient = useQueryClient()
  // Removing a key pauses its provider-backed features, so confirm the change.
  const [removing, setRemoving] = useState<AiKeyProvider | null>(null)
  const [showAdditional, setShowAdditional] = useState(false)
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
      void queryClient.invalidateQueries({ queryKey })
      toast.success('Key saved. Your provider bills usage directly.')
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'The API key could not be saved.')
    },
  })

  const removeMutation = useMutation({
    mutationFn: (provider: AiKeyProvider) => clearWorkspaceAiKey(workspaceId, provider),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey })
      toast.success('Key removed. Connect a key to resume the features it powers.')
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'The API key could not be removed.')
    },
  })

  const busy = saveMutation.isPending || removeMutation.isPending
  const connected = PROVIDERS.filter((provider) => keysQuery.data?.[provider.id]?.configured).length
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
          <div><h3 className="font-semibold">Research & search</h3><p className="mt-1 text-sm text-muted-foreground">Start with the tools that power your daily work.</p></div>
          {keysQuery.data && !keysQuery.isError && <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium">{connected} {connected === 1 ? 'provider' : 'providers'} connected</span>}
        </div>
        {keysQuery.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
            <Loader2 className="h-4 w-4 animate-spin" />Loading key status…
          </div>
        ) : keysQuery.isError ? <div className="space-y-3 rounded-lg border border-destructive/20 bg-destructive/5 p-4" role="alert">
          <p className="text-sm">We couldn’t load your provider connections. Your saved keys haven’t been changed.</p>
          <Button variant="outline" size="sm" disabled={keysQuery.isFetching} onClick={() => void keysQuery.refetch()}>Retry connections</Button>
        </div> : <>
          <div className="space-y-4">{PROVIDERS.filter((provider) => !provider.optional).map(providerRow)}</div>
          <div className="border-t pt-4">
            <button type="button" className="flex w-full items-center justify-between gap-4 rounded-md py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-expanded={showAdditional} aria-controls="additional-billing-providers" onClick={() => setShowAdditional((open) => !open)}>
              <span><span className="block text-sm font-semibold">Additional providers</span><span className="mt-1 block text-xs text-muted-foreground">Live discovery, contact enrichment, domains and mailboxes</span></span>
              <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${showAdditional ? 'rotate-180' : ''}`} aria-hidden="true" />
            </button>
            {showAdditional && <div id="additional-billing-providers" className="mt-4 space-y-4">{PROVIDERS.filter((provider) => provider.optional).map(providerRow)}</div>}
          </div>
        </>}
        <div className="flex items-start gap-2 border-t pt-4 text-xs leading-5 text-muted-foreground"><LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /><p>Keys are encrypted and hidden after saving. Anthropic and OpenAI keys are verified on save; other connections are checked when used. Removing a key pauses the features it powers.</p></div>
      </CardContent>
      <AlertDialog open={removing !== null} onOpenChange={(open) => { if (!open) setRemoving(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Remove the {PROVIDERS.find((provider) => provider.id === removing)?.label ?? ''} key?
            </AlertDialogTitle>
            <AlertDialogDescription>
              The features powered by this key will pause until you connect a replacement.
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
