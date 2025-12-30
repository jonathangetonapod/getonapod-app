import { useState } from 'react'
import { useClientPortal } from '@/contexts/ClientPortalContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Mail, Loader2, CheckCircle2, Lock, Eye, EyeOff } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

export default function PortalLogin() {
  const [activeTab, setActiveTab] = useState('password')

  // Magic Link state
  const [mlEmail, setMlEmail] = useState('')
  const [mlLoading, setMlLoading] = useState(false)
  const [mlSuccess, setMlSuccess] = useState(false)
  const [mlError, setMlError] = useState('')

  // Password state
  const [pwEmail, setPwEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [pwLoading, setPwLoading] = useState(false)
  const [pwError, setPwError] = useState('')

  const { requestMagicLink, loginWithPassword, client } = useClientPortal()
  const navigate = useNavigate()

  // If already logged in, redirect to dashboard
  if (client) {
    navigate('/portal/dashboard', { replace: true })
    return null
  }

  const handleMagicLinkSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setMlError('')
    setMlLoading(true)

    try {
      await requestMagicLink(mlEmail)
      setMlSuccess(true)
    } catch (err) {
      console.error('Failed to request magic link:', err)
      setMlError(err instanceof Error ? err.message : 'Failed to send login link. Please try again.')
    } finally {
      setMlLoading(false)
    }
  }

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setPwError('')
    setPwLoading(true)

    try {
      await loginWithPassword(pwEmail, password)
      // Context will handle navigation
    } catch (err) {
      console.error('Failed to login with password:', err)
      setPwError(err instanceof Error ? err.message : 'Login failed. Please try again.')
    } finally {
      setPwLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto mb-2 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/70">
            <Lock className="h-8 w-8 text-primary-foreground" />
          </div>
          <CardTitle className="text-2xl">Client Portal Login</CardTitle>
          <CardDescription>
            Choose your preferred login method
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="password">Password</TabsTrigger>
              <TabsTrigger value="magic-link">Magic Link</TabsTrigger>
            </TabsList>

            {/* Password Login Tab */}
            <TabsContent value="password">
              <form onSubmit={handlePasswordSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="pw-email">Email Address</Label>
                  <Input
                    id="pw-email"
                    type="email"
                    placeholder="you@example.com"
                    value={pwEmail}
                    onChange={(e) => setPwEmail(e.target.value)}
                    required
                    disabled={pwLoading}
                    className="w-full"
                    autoFocus
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      disabled={pwLoading}
                      className="w-full pr-10"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                      onClick={() => setShowPassword(!showPassword)}
                      tabIndex={-1}
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <Eye className="h-4 w-4 text-muted-foreground" />
                      )}
                    </Button>
                  </div>
                </div>

                {pwError && (
                  <div className="p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md">
                    {pwError}
                  </div>
                )}

                <Button
                  type="submit"
                  className="w-full"
                  disabled={pwLoading || !pwEmail || !password}
                >
                  {pwLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Logging in...
                    </>
                  ) : (
                    <>
                      <Lock className="mr-2 h-4 w-4" />
                      Login
                    </>
                  )}
                </Button>

                <div className="text-center text-xs text-muted-foreground space-y-1">
                  <p>
                    Don't have a password?{' '}
                    <button
                      type="button"
                      onClick={() => setActiveTab('magic-link')}
                      className="text-primary hover:underline"
                    >
                      Use Magic Link
                    </button>
                  </p>
                </div>
              </form>
            </TabsContent>

            {/* Magic Link Tab */}
            <TabsContent value="magic-link">
              {mlSuccess ? (
                <div className="space-y-4 text-center">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900">
                    <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="font-semibold text-lg">Check your email!</h3>
                    <p className="text-sm text-muted-foreground">
                      We've sent a login link to <strong>{mlEmail}</strong>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      The link will expire in 15 minutes for your security.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setMlSuccess(false)
                      setMlEmail('')
                    }}
                    className="w-full"
                  >
                    Use a different email
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleMagicLinkSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="ml-email">Email Address</Label>
                    <Input
                      id="ml-email"
                      type="email"
                      placeholder="you@example.com"
                      value={mlEmail}
                      onChange={(e) => setMlEmail(e.target.value)}
                      required
                      disabled={mlLoading}
                      className="w-full"
                    />
                  </div>

                  {mlError && (
                    <div className="p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md">
                      {mlError}
                    </div>
                  )}

                  <Button
                    type="submit"
                    className="w-full"
                    disabled={mlLoading || !mlEmail}
                  >
                    {mlLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Sending login link...
                      </>
                    ) : (
                      <>
                        <Mail className="mr-2 h-4 w-4" />
                        Send Login Link
                      </>
                    )}
                  </Button>

                  <div className="text-center text-xs text-muted-foreground space-y-1">
                    <p>No password required. We'll email you a secure login link.</p>
                    <p>
                      Have a password?{' '}
                      <button
                        type="button"
                        onClick={() => setActiveTab('password')}
                        className="text-primary hover:underline"
                      >
                        Login with password
                      </button>
                    </p>
                  </div>
                </form>
              )}
            </TabsContent>
          </Tabs>

          <div className="mt-6 text-center text-xs text-muted-foreground border-t pt-4">
            <p>
              Having trouble? Contact{' '}
              <a href="mailto:support@getonapod.com" className="text-primary hover:underline">
                support@getonapod.com
              </a>
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Branding Footer */}
      <div className="fixed bottom-4 left-0 right-0 text-center">
        <p className="text-xs text-muted-foreground">
          Powered by <span className="font-semibold">Get On A Pod</span>
        </p>
      </div>
    </div>
  )
}
