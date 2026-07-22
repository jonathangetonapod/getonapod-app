import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { Loader2, ShieldX } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface ProtectedRouteProps {
  children: React.ReactNode
}

const AccessUnavailable = ({ platformOnly = false }: { platformOnly?: boolean }) => {
  const { accountState, accountError, refreshAccount, user, signOut } = useAuth()

  const description = platformOnly
    ? 'This area is limited to platform administrators.'
    : accountState === 'suspended'
      ? 'Your workspace access is suspended. Contact a platform administrator for help.'
      : accountState === 'expired'
        ? 'Your invitation has expired. Ask a platform administrator for a new invitation.'
      : accountState === 'no_membership'
        ? 'Your account does not have an active workspace membership.'
        : accountError || 'Your account could not be authorized.'

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
            <ShieldX className="h-6 w-6 text-destructive" />
          </div>
          <CardTitle>Access unavailable</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-center">
          {user?.email && <p className="text-sm text-muted-foreground">Signed in as {user.email}</p>}
          {accountState === 'error' && (
            <Button onClick={() => void refreshAccount()} className="w-full">
              Try again
            </Button>
          )}
          <Button onClick={() => void signOut()} variant="outline" className="w-full">
            Sign out
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

export const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
  const { user, accountState } = useAuth()
  const location = useLocation()

  if (accountState === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!user || accountState === 'signed_out') {
    const loginPath = location.pathname.startsWith('/admin') ? '/admin/login' : '/login'
    return <Navigate to={loginPath} state={{ from: location }} replace />
  }

  if (accountState === 'pending') {
    return <Navigate to="/accept-invite" replace />
  }

  if (accountState === 'password_change_required' || accountState === 'reauthentication_required') {
    return <Navigate to="/change-password" replace />
  }

  if (accountState !== 'active') {
    return <AccessUnavailable />
  }

  return <>{children}</>
}

export const PlatformAdminRoute = ({ children }: ProtectedRouteProps) => {
  const { isPlatformAdmin } = useAuth()

  return (
    <ProtectedRoute>
      {isPlatformAdmin ? children : <AccessUnavailable platformOnly />}
    </ProtectedRoute>
  )
}

export const WorkspaceStaffRoute = ({ children }: ProtectedRouteProps) => {
  const { canManageWorkspaceStaff } = useAuth()

  return (
    <ProtectedRoute>
      {canManageWorkspaceStaff ? children : <Navigate to="/app/clients" replace />}
    </ProtectedRoute>
  )
}
