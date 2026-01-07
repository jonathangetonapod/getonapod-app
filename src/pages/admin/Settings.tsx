import { DashboardLayout } from '@/components/admin/DashboardLayout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/contexts/AuthContext'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Save, Shield, Bell, Globe, Code, Copy, ExternalLink, Check, Plus, Trash2, Loader2, Key, Eye, EyeOff, UserPlus } from 'lucide-react'
import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'

interface AdminUser {
  id: string
  email: string
  name: string | null
  added_by: string | null
  created_at: string
}

const Settings = () => {
  const { user } = useAuth()
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)

  // Admin user management state
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([])
  const [loadingAdmins, setLoadingAdmins] = useState(true)
  const [isAddAdminOpen, setIsAddAdminOpen] = useState(false)
  const [isResetPasswordOpen, setIsResetPasswordOpen] = useState(false)
  const [deletingAdmin, setDeletingAdmin] = useState<AdminUser | null>(null)
  const [resetPasswordAdmin, setResetPasswordAdmin] = useState<AdminUser | null>(null)
  const [newAdminEmail, setNewAdminEmail] = useState('')
  const [newAdminName, setNewAdminName] = useState('')
  const [newAdminPassword, setNewAdminPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const API_ENDPOINT = 'https://ysjwveqnwjysldpfqzov.supabase.co/functions/v1/create-client-account'
  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL

  // Fetch admin users
  useEffect(() => {
    fetchAdminUsers()
  }, [])

  const fetchAdminUsers = async () => {
    setLoadingAdmins(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const response = await fetch(`${SUPABASE_URL}/functions/v1/manage-admin-users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ action: 'list' }),
      })

      const data = await response.json()
      if (data.success) {
        setAdminUsers(data.admins)
      }
    } catch (error) {
      console.error('Error fetching admin users:', error)
    } finally {
      setLoadingAdmins(false)
    }
  }

  const handleAddAdmin = async () => {
    if (!newAdminEmail || !newAdminPassword) {
      toast.error('Email and password are required')
      return
    }

    if (newAdminPassword.length < 8) {
      toast.error('Password must be at least 8 characters')
      return
    }

    setIsSubmitting(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not authenticated')

      const response = await fetch(`${SUPABASE_URL}/functions/v1/manage-admin-users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          action: 'create',
          email: newAdminEmail,
          password: newAdminPassword,
          name: newAdminName || undefined,
        }),
      })

      const data = await response.json()
      if (data.success) {
        toast.success(`Admin user ${newAdminEmail} created successfully`)
        setIsAddAdminOpen(false)
        setNewAdminEmail('')
        setNewAdminName('')
        setNewAdminPassword('')
        fetchAdminUsers()
      } else {
        toast.error(data.error || 'Failed to create admin user')
      }
    } catch (error) {
      console.error('Error adding admin:', error)
      toast.error('Failed to create admin user')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeleteAdmin = async () => {
    if (!deletingAdmin) return

    setIsSubmitting(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not authenticated')

      const response = await fetch(`${SUPABASE_URL}/functions/v1/manage-admin-users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          action: 'delete',
          id: deletingAdmin.id,
          email: deletingAdmin.email,
        }),
      })

      const data = await response.json()
      if (data.success) {
        toast.success('Admin user removed successfully')
        setDeletingAdmin(null)
        fetchAdminUsers()
      } else {
        toast.error(data.error || 'Failed to remove admin user')
      }
    } catch (error) {
      console.error('Error deleting admin:', error)
      toast.error('Failed to remove admin user')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleResetPassword = async () => {
    if (!resetPasswordAdmin || !newPassword) return

    if (newPassword.length < 8) {
      toast.error('Password must be at least 8 characters')
      return
    }

    setIsSubmitting(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not authenticated')

      const response = await fetch(`${SUPABASE_URL}/functions/v1/manage-admin-users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          action: 'reset-password',
          email: resetPasswordAdmin.email,
          newPassword: newPassword,
        }),
      })

      const data = await response.json()
      if (data.success) {
        toast.success(`Password reset for ${resetPasswordAdmin.email}`)
        setIsResetPasswordOpen(false)
        setResetPasswordAdmin(null)
        setNewPassword('')
      } else {
        toast.error(data.error || 'Failed to reset password')
      }
    } catch (error) {
      console.error('Error resetting password:', error)
      toast.error('Failed to reset password')
    } finally {
      setIsSubmitting(false)
    }
  }

  const generateRandomPassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%'
    let password = ''
    for (let i = 0; i < 12; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return password
  }

  const copyToClipboard = (text: string, index: number) => {
    navigator.clipboard.writeText(text)
    setCopiedIndex(index)
    toast.success('Copied to clipboard!')
    setTimeout(() => setCopiedIndex(null), 2000)
  }

  const codeExamples = [
    {
      language: 'cURL',
      code: `curl -X POST ${API_ENDPOINT} \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "John Doe",
    "email": "john@example.com",
    "bio": "Marketing expert",
    "enable_portal_access": true,
    "create_google_sheet": true
  }'`
    },
    {
      language: 'JavaScript',
      code: `const response = await fetch('${API_ENDPOINT}', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'John Doe',
    email: 'john@example.com',
    bio: 'Marketing expert',
    enable_portal_access: true,
    create_google_sheet: true
  })
})
const data = await response.json()`
    }
  ]

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Settings</h1>
          <p className="text-muted-foreground mt-2">
            Manage your admin dashboard preferences
          </p>
        </div>

        {/* Account Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Account Settings
            </CardTitle>
            <CardDescription>
              Your admin account information
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">Full Name</Label>
                <Input
                  id="name"
                  value={user?.user_metadata?.full_name || ''}
                  disabled
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={user?.email || ''}
                  disabled
                />
              </div>
            </div>
            <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
              <div>
                <p className="font-medium">Authentication Method</p>
                <p className="text-sm text-muted-foreground">Google OAuth</p>
              </div>
              <Button variant="outline" disabled>
                Connected
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Admin Access */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Admin Access Control
                </CardTitle>
                <CardDescription>
                  Manage admin users who can access this dashboard
                </CardDescription>
              </div>
              <Button onClick={() => setIsAddAdminOpen(true)}>
                <UserPlus className="h-4 w-4 mr-2" />
                Add Admin
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {loadingAdmins ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="space-y-2">
                {adminUsers.map((admin) => (
                  <div
                    key={admin.id}
                    className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <Shield className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium">{admin.name || admin.email}</p>
                        <p className="text-sm text-muted-foreground">{admin.email}</p>
                        {admin.added_by && (
                          <p className="text-xs text-muted-foreground">Added by {admin.added_by}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {admin.email.toLowerCase() === user?.email?.toLowerCase() && (
                        <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-full">
                          You
                        </span>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setResetPasswordAdmin(admin)
                          setIsResetPasswordOpen(true)
                        }}
                        title="Reset password"
                      >
                        <Key className="h-4 w-4" />
                      </Button>
                      {admin.email.toLowerCase() !== user?.email?.toLowerCase() && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeletingAdmin(admin)}
                          className="text-destructive hover:text-destructive"
                          title="Remove admin"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {adminUsers.length === 0 && !loadingAdmins && (
              <div className="text-center py-8 text-muted-foreground">
                <Shield className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No admin users found</p>
                <p className="text-sm">Add your first admin user to get started</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Add Admin Dialog */}
        <Dialog open={isAddAdminOpen} onOpenChange={setIsAddAdminOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Admin User</DialogTitle>
              <DialogDescription>
                Create a new admin account with dashboard access
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="admin-name">Name (optional)</Label>
                <Input
                  id="admin-name"
                  placeholder="John Doe"
                  value={newAdminName}
                  onChange={(e) => setNewAdminName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="admin-email">Email</Label>
                <Input
                  id="admin-email"
                  type="email"
                  placeholder="admin@example.com"
                  value={newAdminEmail}
                  onChange={(e) => setNewAdminEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="admin-password">Password</Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      id="admin-password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Min 8 characters"
                      value={newAdminPassword}
                      onChange={(e) => setNewAdminPassword(e.target.value)}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setNewAdminPassword(generateRandomPassword())}
                  >
                    Generate
                  </Button>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddAdminOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleAddAdmin} disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <UserPlus className="h-4 w-4 mr-2" />
                    Create Admin
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Reset Password Dialog */}
        <Dialog open={isResetPasswordOpen} onOpenChange={setIsResetPasswordOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reset Password</DialogTitle>
              <DialogDescription>
                Set a new password for {resetPasswordAdmin?.email}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="new-password">New Password</Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      id="new-password"
                      type={showNewPassword ? 'text' : 'password'}
                      placeholder="Min 8 characters"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                    >
                      {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setNewPassword(generateRandomPassword())}
                  >
                    Generate
                  </Button>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => {
                setIsResetPasswordOpen(false)
                setResetPasswordAdmin(null)
                setNewPassword('')
              }}>
                Cancel
              </Button>
              <Button onClick={handleResetPassword} disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Resetting...
                  </>
                ) : (
                  <>
                    <Key className="h-4 w-4 mr-2" />
                    Reset Password
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Admin Confirmation */}
        <AlertDialog open={!!deletingAdmin} onOpenChange={() => setDeletingAdmin(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove Admin User</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to remove <strong>{deletingAdmin?.email}</strong> as an admin?
                This will delete their account and they will no longer be able to access the admin dashboard.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteAdmin}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Removing...
                  </>
                ) : (
                  'Remove Admin'
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Notification Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              Notification Preferences
            </CardTitle>
            <CardDescription>
              Choose what updates you receive
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">New Lead Notifications</p>
                <p className="text-sm text-muted-foreground">
                  Get notified when someone submits a form
                </p>
              </div>
              <Button variant="outline" size="sm">
                Configure
              </Button>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Weekly Reports</p>
                <p className="text-sm text-muted-foreground">
                  Receive weekly analytics summary
                </p>
              </div>
              <Button variant="outline" size="sm">
                Configure
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Site Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5" />
              Site Configuration
            </CardTitle>
            <CardDescription>
              General website settings
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="site-name">Site Name</Label>
              <Input id="site-name" value="Get On A Pod" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="site-url">Site URL</Label>
              <Input id="site-url" value="https://authoritylab.com" />
            </div>
            <Button>
              <Save className="mr-2 h-4 w-4" />
              Save Changes
            </Button>
          </CardContent>
        </Card>

        {/* API Documentation */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Code className="h-5 w-5" />
              API Documentation
            </CardTitle>
            <CardDescription>
              Programmatically create client accounts with portal access
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* API Endpoint */}
            <div className="space-y-2">
              <Label>API Endpoint</Label>
              <div className="flex items-center gap-2">
                <Input
                  value={API_ENDPOINT}
                  readOnly
                  className="font-mono text-sm"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copyToClipboard(API_ENDPOINT, -1)}
                >
                  {copiedIndex === -1 ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            {/* Features */}
            <div className="space-y-2">
              <Label>Features</Label>
              <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                <li>Create client accounts with all profile details</li>
                <li>Enable portal access with password or magic link</li>
                <li>Automatically create Google Sheet for outreach</li>
                <li>Send welcome invitation emails</li>
                <li>Optional API key authentication</li>
              </ul>
            </div>

            {/* Code Examples */}
            <div className="space-y-3">
              <Label>Quick Start Examples</Label>
              {codeExamples.map((example, index) => (
                <div key={index} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-muted-foreground">
                      {example.language}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(example.code, index)}
                    >
                      {copiedIndex === index ? (
                        <>
                          <Check className="h-4 w-4 mr-2" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="h-4 w-4 mr-2" />
                          Copy
                        </>
                      )}
                    </Button>
                  </div>
                  <pre className="bg-muted p-4 rounded-lg overflow-x-auto">
                    <code className="text-sm font-mono">{example.code}</code>
                  </pre>
                </div>
              ))}
            </div>

            {/* Full Documentation Link */}
            <div className="flex items-center justify-between p-4 bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-950/20 dark:to-pink-950/20 border border-purple-200 dark:border-purple-800 rounded-lg">
              <div>
                <p className="font-medium">Complete API Documentation</p>
                <p className="text-sm text-muted-foreground">
                  Full reference with all parameters, examples, and integration guides
                </p>
              </div>
              <Button
                variant="outline"
                onClick={() => window.open('https://github.com/jonathangetonapod/authority-built/blob/main/CREATE_CLIENT_API.md', '_blank')}
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                View Docs
              </Button>
            </div>

            {/* Response Example */}
            <div className="space-y-2">
              <Label>Example Response (All Fields)</Label>
              <pre className="bg-muted p-4 rounded-lg overflow-x-auto">
                <code className="text-sm font-mono text-muted-foreground">
{`{
  "success": true,
  "message": "Client account created successfully",
  "client": {
    "client_id": "uuid-here",
    "name": "John Doe",
    "email": "john@example.com",
    "bio": "Marketing expert",
    "linkedin_url": "https://linkedin.com/in/johndoe",
    "website": "https://johndoe.com",
    "status": "active",
    "portal_access_enabled": true,
    "portal_url": "https://getonapod.com/portal/login",
    "password": "SecurePass123",
    "invitation_sent": true,
    "google_sheet_created": true,
    "google_sheet_url": "https://docs.google.com/...",
    "created_at": "2025-01-31T10:30:00Z"
  }
}`}
                </code>
              </pre>
              <p className="text-xs text-muted-foreground">
                Response includes all provided fields plus generated credentials and URLs
              </p>
            </div>

            {/* Use Cases */}
            <div className="space-y-2">
              <Label>Integration Ideas</Label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  'CRM Integration',
                  'Stripe Webhooks',
                  'Zapier/Make',
                  'Bulk Import',
                  'White Label',
                  'Custom Dashboard'
                ].map((useCase) => (
                  <div
                    key={useCase}
                    className="flex items-center gap-2 p-2 border rounded-lg"
                  >
                    <Code className="h-4 w-4 text-primary" />
                    <span className="text-sm">{useCase}</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  )
}

export default Settings
