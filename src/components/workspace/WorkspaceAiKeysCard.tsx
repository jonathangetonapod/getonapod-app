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
import { Card, CardContent } from '@/components/ui/card'
import { AiKeyRow, type AiKeyProviderInfo } from '@/components/workspace/settings/AiKeyRow'
import { platformCreditsByProvider, type AiKeyProvider } from '@/lib/aiKeyUsage'
import {
  clearWorkspaceAiKey,
  getWorkspaceAiKeys,
  getWorkspaceBillingOverview,
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
    workName: 'Claude tasks',
    consoleUrl: 'https://console.anthropic.com/settings/keys',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    keyPrefix: 'sk-',
    usedFor: 'Used for searching the podcast database.',
    workName: 'database searches',
    consoleUrl: 'https://platform.openai.com/api-keys',
  },
]

export function WorkspaceAiKeysCard({ workspaceId, queryScope }: { workspaceId: string; queryScope: readonly unknown[] }) {
  const queryClient = useQueryClient()
  // Removing a key silently moves the workspace back onto platform credits, so
  // it is confirmed rather than done on one click.
  const [removing, setRemoving] = useState<AiKeyProvider | null>(null)
  const queryKey = [...queryScope, 'workspace-ai-keys']

  const keysQuery = useQuery({
    queryKey,
    queryFn: () => getWorkspaceAiKeys(workspaceId),
    retry: false,
  })
  // Same key as the header's credit chip, so this costs no extra request.
  // Only to say what a key would save; the card works without it.
  const billingQuery = useQuery({
    queryKey: ['workspace-billing-overview', workspaceId],
    queryFn: () => getWorkspaceBillingOverview(workspaceId),
    retry: false,
    staleTime: 120_000,
  })
  const creditsByProvider = platformCreditsByProvider(billingQuery.data?.ledger_usage_this_month)

  const saveMutation = useMutation({
    mutationFn: ({ provider, apiKey }: { provider: AiKeyProvider; apiKey: string }) =>
      setWorkspaceAiKey(workspaceId, provider, apiKey),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey })
      toast.success('Key verified and saved. The work it covers no longer uses platform credits.')
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'The API key could not be saved.')
    },
  })

  const removeMutation = useMutation({
    mutationFn: (provider: AiKeyProvider) => clearWorkspaceAiKey(workspaceId, provider),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey })
      toast.success('Key removed. That work uses platform credits again.')
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'The API key could not be removed.')
    },
  })

  const busy = saveMutation.isPending || removeMutation.isPending

  return (
    <Card>
      {/* The section heading above names this card and says what a key is
          for, so the card itself starts at the keys. */}
      <CardContent className="space-y-5 pt-6">
        <p className="text-sm text-muted-foreground">Keys are stored encrypted and can't be viewed after saving.</p>
        {keysQuery.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />Loading key status…
          </div>
        ) : (
          PROVIDERS.map((provider) => (
            <AiKeyRow
              key={provider.id}
              workspaceId={workspaceId}
              provider={provider}
              status={keysQuery.data?.[provider.id] ?? null}
              creditsThisMonth={creditsByProvider[provider.id]}
              busy={busy}
              saving={saveMutation.isPending && saveMutation.variables?.provider === provider.id}
              onSave={(apiKey) => saveMutation.mutateAsync({ provider: provider.id, apiKey })}
              onRemove={() => setRemoving(provider.id)}
            />
          ))
        )}
      </CardContent>
      <AlertDialog open={removing !== null} onOpenChange={(open) => { if (!open) setRemoving(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Remove the {PROVIDERS.find((provider) => provider.id === removing)?.label ?? ''} key?
            </AlertDialogTitle>
            <AlertDialogDescription>
              The work it covers starts using platform credits again.
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
