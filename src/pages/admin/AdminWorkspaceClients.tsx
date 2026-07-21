import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Eye, Loader2, Users } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { DashboardLayout } from '@/components/admin/DashboardLayout'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useAuth } from '@/contexts/AuthContext'
import { getAdminWorkspaceView } from '@/services/adminWorkspaces'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const AdminWorkspaceClients = () => {
  const { workspaceId = '' } = useParams()
  const { user } = useAuth()
  const validWorkspaceId = UUID_PATTERN.test(workspaceId)
  const workspaceQuery = useQuery({
    queryKey: ['platform', 'workspace', workspaceId, 'clients'],
    queryFn: () => getAdminWorkspaceView(workspaceId),
    enabled: validWorkspaceId,
    retry: false,
  })

  const view = workspaceQuery.data
  const error = !validWorkspaceId
    ? 'The workspace address is invalid.'
    : workspaceQuery.error instanceof Error
      ? workspaceQuery.error.message
      : null

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <Alert className="border-amber-500/50 bg-amber-500/10">
          <Eye className="h-4 w-4" />
          <AlertTitle>Platform administrator view · Read only</AlertTitle>
          <AlertDescription>
            You are viewing a client workspace as {user?.email || 'a platform administrator'}. Your identity and permissions have not changed.
          </AlertDescription>
        </Alert>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{view?.workspace.name || 'Client workspace'}</h1>
            <p className="text-muted-foreground">See the client records available inside this workspace.</p>
          </div>
          <Button variant="outline" asChild>
            <Link to="/admin/dashboard"><ArrowLeft className="mr-2 h-4 w-4" />Return to platform</Link>
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" />Workspace clients</CardTitle>
            <CardDescription>This view is deliberately read-only. Changes must be made by the workspace owner.</CardDescription>
          </CardHeader>
          <CardContent>
            {workspaceQuery.isLoading ? (
              <div className="flex min-h-40 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>
            ) : error ? (
              <div className="flex min-h-40 flex-col items-center justify-center gap-3 text-center" role="alert">
                <p className="font-medium text-destructive">Workspace unavailable</p>
                <p className="max-w-md text-sm text-muted-foreground">{error}</p>
                {validWorkspaceId && <Button variant="outline" onClick={() => void workspaceQuery.refetch()}>Try again</Button>}
              </div>
            ) : !view || view.clients.length === 0 ? (
              <div className="flex min-h-40 flex-col items-center justify-center gap-3 text-center">
                <Users className="h-10 w-10 text-muted-foreground" />
                <div><p className="font-medium">No clients yet</p><p className="text-sm text-muted-foreground">This workspace has not added a client.</p></div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Contact</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {view.clients.map((client) => (
                      <TableRow key={client.id}>
                        <TableCell><p className="font-medium">{client.name}</p>{client.website && <p className="max-w-xs truncate text-xs text-muted-foreground">{client.website}</p>}</TableCell>
                        <TableCell><p>{client.contact_person || '—'}</p><p className="text-xs text-muted-foreground">{client.email || 'No email'}</p></TableCell>
                        <TableCell><Badge variant={client.status === 'active' ? 'default' : 'secondary'} className="capitalize">{client.status}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  )
}

export default AdminWorkspaceClients
