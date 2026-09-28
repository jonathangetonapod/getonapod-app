import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ExternalLink, KeyRound, Loader2, Trash2 } from 'lucide-react'
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  clearWorkspaceAiKey,
  getWorkspaceAiKeys,
  setWorkspaceAiKey,
  type WorkspaceAiKeyStatus,
} from '@/services/workspaceStaff'

type KeyProvider = 'anthropic' | 'openai'

// What each key is actually spent on, and where to get one, so the choice to
// bring a key is made knowing what it changes.
const PROVIDERS: Array<{ id: KeyProvider; label: string; placeholder: string; usedFor: string; consoleUrl: string }> = [
  {
    id: 'anthropic',
    label: 'Anthropic (Claude)',
    placeholder: 'sk-ant-…',
    usedFor: 'Podcast research, pitch writing and inbox replies.',
    consoleUrl: 'https://console.anthropic.com/settings/keys',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    placeholder: 'sk-…',
    usedFor: 'Searching the podcast database.',
    consoleUrl: 'https://platform.openai.com/api-keys',
  },
]

export function WorkspaceAiKeysCard({ workspaceId, queryScope }: { workspaceId: string; queryScope: readonly unknown[] }) {
  const queryClient = useQueryClient()
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  // Removing a key silently moves the workspace back onto platform credits, so
  // it is confirmed rather than done on one click.
  const [removing, setRemoving] = useState<KeyProvider | null>(null)
  const queryKey = [...queryScope, 'workspace-ai-keys']

  const keysQuery = useQuery({
    queryKey,
    queryFn: () => getWorkspaceAiKeys(workspaceId),
    retry: false,
  })

  const saveMutation = useMutation({
    mutationFn: ({ provider, apiKey }: { provider: 'anthropic' | 'openai' | 'winnr'; apiKey: string }) =>
      setWorkspaceAiKey(workspaceId, provider, apiKey),
    onSuccess: (_result, variables) => {
      setDrafts((current) => ({ ...current, [variables.provider]: '' }))
      void queryClient.invalidateQueries({ queryKey })
      toast.success('API key verified and saved. Operations using it will not consume platform credits.')
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'The API key could not be saved.')
    },
  })

  const removeMutation = useMutation({
    mutationFn: (provider: 'anthropic' | 'openai' | 'winnr') => clearWorkspaceAiKey(workspaceId, provider),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey })
      toast.success('API key removed. Operations now use platform credits.')
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'The API key could not be removed.')
    },
  })

  const busy = saveMutation.isPending || removeMutation.isPending

  const statusFor = (provider: 'anthropic' | 'openai' | 'winnr'): WorkspaceAiKeyStatus | null =>
    keysQuery.data?.[provider] ?? null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg"><KeyRound className="h-5 w-5" />AI API keys</CardTitle>
        <CardDescription>
          Optional. Without a key, these run on your credits. AI operations that run on your keys are
          billed to your provider account directly and never consume platform credits. Keys are stored
          encrypted and can't be viewed after saving.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {keysQuery.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />Loading key status…
          </div>
        ) : (
          PROVIDERS.map((provider) => {
            const status = statusFor(provider.id)
            return (
              <div key={provider.id} className="space-y-2 rounded-xl border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">{provider.label}</p>
                  {status?.configured ? (
                    <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-800">
                      Connected ····{status.last_four}
                    </Badge>
                  ) : (
                    <Badge variant="outline">Using platform credits</Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">Used for</span> {provider.usedFor}{' '}
                  <a
                    href={provider.consoleUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline"
                  >
                    Get a key<ExternalLink className="h-3 w-3" />
                  </a>
                </p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <div className="flex-1">
                    <Label htmlFor={`ai-key-${provider.id}`} className="sr-only">{provider.label} API key</Label>
                    <Input
                      id={`ai-key-${provider.id}`}
                      type="password"
                      autoComplete="off"
                      placeholder={status?.configured ? 'Enter a new key to replace the saved one' : provider.placeholder}
                      value={drafts[provider.id] ?? ''}
                      onChange={(event) => setDrafts((current) => ({ ...current, [provider.id]: event.target.value }))}
                      disabled={busy}
                    />
                  </div>
                  <Button
                    type="button"
                    disabled={busy || !(drafts[provider.id] ?? '').trim()}
                    onClick={() => saveMutation.mutate({ provider: provider.id, apiKey: (drafts[provider.id] ?? '').trim() })}
                  >
                    {saveMutation.isPending ? 'Verifying…' : 'Save key'}
                  </Button>
                  {status?.configured && (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy}
                      onClick={() => setRemoving(provider.id)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />Remove
                    </Button>
                  )}
                </div>
              </div>
            )
          })
        )}
      </CardContent>
      <AlertDialog open={removing !== null} onOpenChange={(open) => { if (!open) setRemoving(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Remove the {PROVIDERS.find((provider) => provider.id === removing)?.label ?? ''} key?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Research and pitch writing will start using platform credits again.
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
