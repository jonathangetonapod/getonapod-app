import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'

// Written by the sign-in page before the Google round trip; the same key is spelled
// there, since a shared export from either component file would break Fast Refresh.
const POST_LOGIN_PATH_KEY = 'goap.post-login-path'

// Only same-origin app paths are honored, so a stored value can never send
// someone off-site or to a page that is not behind sign-in.
const readPostLoginPath = (): string | null => {
  try {
    const stored = sessionStorage.getItem(POST_LOGIN_PATH_KEY)
    sessionStorage.removeItem(POST_LOGIN_PATH_KEY)
    if (!stored) return null
    const isAppPath = /^\/(app|admin)(\/|\?|#|$)/u.test(stored)
    return isAppPath && !stored.startsWith('//') ? stored : null
  } catch {
    return null
  }
}

const AuthCallback = () => {
  const { accountState } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (accountState === 'loading') return
    if (accountState === 'pending') {
      navigate('/accept-invite', { replace: true })
    } else if (accountState === 'password_change_required' || accountState === 'reauthentication_required') {
      navigate('/change-password', { replace: true })
    } else if (accountState === 'active') {
      navigate(readPostLoginPath() ?? '/app/clients', { replace: true })
    } else {
      navigate('/admin/login', { replace: true })
    }
  }, [accountState, navigate])

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center space-y-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />
        <p className="text-muted-foreground">Completing sign in...</p>
      </div>
    </div>
  )
}

export default AuthCallback
