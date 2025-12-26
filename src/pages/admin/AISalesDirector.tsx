import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { DashboardLayout } from '@/components/admin/DashboardLayout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Brain,
  Sparkles,
  TrendingUp,
  TrendingDown,
  Target,
  Upload,
  Phone,
  Clock,
  CheckCircle2,
  AlertCircle,
  ArrowUpRight,
  Calendar,
  BarChart3,
  MessageSquare,
  Loader2
} from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  syncFathomCalls,
  getSalesPerformanceStats,
  getTopRecommendations,
  getRecentSalesCalls,
  analyzeSalesCall,
  hideSalesCall,
  unhideSalesCall,
  deleteSalesCall
} from '@/services/salesCalls'
import { toast } from 'sonner'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { MoreVertical, Eye, EyeOff, Trash2 } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'

const AISalesDirector = () => {
  const [syncing, setSyncing] = useState(false)
  const [daysBack, setDaysBack] = useState(30)
  const [callsLimit, setCallsLimit] = useState(10)
  const [showHidden, setShowHidden] = useState(false)
  const [analyzingCalls, setAnalyzingCalls] = useState<Record<string, boolean>>({})

  // Fetch performance stats
  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useQuery({
    queryKey: ['sales-performance-stats'],
    queryFn: getSalesPerformanceStats,
  })

  // Fetch recommendations
  const { data: recommendations, isLoading: recommendationsLoading, refetch: refetchRecommendations } = useQuery({
    queryKey: ['top-recommendations'],
    queryFn: getTopRecommendations,
  })

  // Fetch recent calls
  const { data: recentCalls, isLoading: callsLoading, refetch: refetchCalls } = useQuery({
    queryKey: ['recent-sales-calls', callsLimit, showHidden],
    queryFn: () => getRecentSalesCalls(callsLimit, showHidden),
  })

  const handleSyncCalls = async () => {
    try {
      setSyncing(true)
      toast.info(`Syncing Fathom calls from last ${daysBack} days...`)

      const result = await syncFathomCalls(daysBack)

      const { new_calls, total_meetings } = result.data

      if (new_calls > 0) {
        toast.success(
          `Synced ${new_calls} new call${new_calls > 1 ? 's' : ''}! Click "Analyze with AI" to analyze them.`,
          { duration: 5000 }
        )
      } else {
        toast.info(`No new calls found. Checked ${total_meetings} meeting${total_meetings !== 1 ? 's' : ''}.`)
      }

      // Refetch calls
      refetchCalls()
    } catch (error: any) {
      console.error('Error syncing calls:', error)
      toast.error('Failed to sync calls: ' + error.message)
    } finally {
      setSyncing(false)
    }
  }

  const handleAnalyzeCall = async (callId: string, recordingId: number, title: string) => {
    try {
      setAnalyzingCalls(prev => ({ ...prev, [callId]: true }))
      toast.info(`Analyzing "${title}"...`)

      await analyzeSalesCall(callId, recordingId)

      toast.success('Analysis complete!', { duration: 3000 })

      // Refetch all data to show updated analysis
      refetchStats()
      refetchRecommendations()
      refetchCalls()
    } catch (error: any) {
      console.error('Error analyzing call:', error)
      toast.error('Failed to analyze: ' + error.message)
    } finally {
      setAnalyzingCalls(prev => ({ ...prev, [callId]: false }))
    }
  }

  const handleHideCall = async (callId: string, title: string, isHidden: boolean) => {
    try {
      if (isHidden) {
        await unhideSalesCall(callId)
        toast.success(`Unhid "${title}"`)
      } else {
        await hideSalesCall(callId)
        toast.success(`Hid "${title}"`)
      }
      refetchCalls()
    } catch (error: any) {
      console.error('Error hiding/unhiding call:', error)
      toast.error('Failed to update: ' + error.message)
    }
  }

  const handleDeleteCall = async (callId: string, title: string) => {
    if (!confirm(`Are you sure you want to permanently delete "${title}"?`)) {
      return
    }

    try {
      await deleteSalesCall(callId)
      toast.success(`Deleted "${title}"`)
      refetchCalls()
      refetchStats()
      refetchRecommendations()
    } catch (error: any) {
      console.error('Error deleting call:', error)
      toast.error('Failed to delete: ' + error.message)
    }
  }

  const hasData = stats && stats.total_calls > 0

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="h-16 w-16 rounded-xl bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center flex-shrink-0">
                <Brain className="h-8 w-8 text-white" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h1 className="text-3xl font-bold">AI Sales Director</h1>
                  <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20">
                    <Sparkles className="h-3 w-3 mr-1" />
                    AI-Powered
                  </Badge>
                </div>
                <p className="text-muted-foreground">
                  Analyze your Fathom sales calls and improve your performance with AI insights
                </p>
              </div>
            </div>
          </div>

          {/* Sync Controls */}
          <div className="flex items-center justify-between border-t pt-4 flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Sync period:</span>
                <Select value={daysBack.toString()} onValueChange={(val) => setDaysBack(Number(val))}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="30">Last 30 days</SelectItem>
                    <SelectItem value="60">Last 60 days</SelectItem>
                    <SelectItem value="90">Last 90 days</SelectItem>
                    <SelectItem value="120">Last 120 days</SelectItem>
                    <SelectItem value="150">Last 150 days</SelectItem>
                    <SelectItem value="180">Last 180 days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button
              size="default"
              className="flex items-center gap-2"
              onClick={handleSyncCalls}
              disabled={syncing}
            >
              {syncing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Syncing...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" />
                  Sync Fathom Calls
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Overall Performance Score */}
        {statsLoading ? (
          <Card className="border-primary/20 bg-gradient-to-br from-primary/5 via-background to-purple-500/5">
            <CardHeader>
              <Skeleton className="h-8 w-64" />
              <Skeleton className="h-4 w-48 mt-2" />
            </CardHeader>
            <CardContent>
              <div className="grid gap-6 md:grid-cols-4">
                {[1, 2, 3, 4].map(i => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            </CardContent>
          </Card>
        ) : hasData ? (
          <Card className="border-primary/20 bg-gradient-to-br from-primary/5 via-background to-purple-500/5">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-2xl">Overall Sales Performance</CardTitle>
                  <CardDescription>Based on analysis of {stats.total_calls} sales calls</CardDescription>
                </div>
                <div className="text-right">
                  <div className="text-4xl font-bold text-primary">{stats.overall_score}/10</div>
                  {stats.trend !== 0 && (
                    <div className={`flex items-center gap-1 text-sm ${stats.trend > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                      {stats.trend > 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                      <span>{stats.trend > 0 ? '+' : ''}{stats.trend} vs older calls</span>
                    </div>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-6 md:grid-cols-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">Discovery</span>
                    <span className="text-sm text-muted-foreground">{stats.discovery_score}/10</span>
                  </div>
                  <Progress value={stats.discovery_score * 10} className="h-2" />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">Objection Handling</span>
                    <span className="text-sm text-muted-foreground">{stats.objection_handling_score}/10</span>
                  </div>
                  <Progress value={stats.objection_handling_score * 10} className="h-2" />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">Closing</span>
                    <span className="text-sm text-muted-foreground">{stats.closing_score}/10</span>
                  </div>
                  <Progress value={stats.closing_score * 10} className="h-2" />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">Engagement</span>
                    <span className="text-sm text-muted-foreground">{stats.engagement_score}/10</span>
                  </div>
                  <Progress value={stats.engagement_score * 10} className="h-2" />
                </div>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {/* Stats Grid */}
        {hasData && (
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Calls Analyzed</CardTitle>
                <Phone className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {statsLoading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <>
                    <div className="text-2xl font-bold">{stats.total_calls}</div>
                    <p className="text-xs text-muted-foreground">All time</p>
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Avg Call Duration</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {statsLoading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <>
                    <div className="text-2xl font-bold">{stats.avg_duration || 'N/A'} min</div>
                    <p className="text-xs text-muted-foreground">Average length</p>
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Talk-Listen Ratio</CardTitle>
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {statsLoading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <>
                    <div className="text-2xl font-bold">{stats.avg_talk_listen_ratio.talk}:{stats.avg_talk_listen_ratio.listen}</div>
                    <p className="text-xs text-muted-foreground">You:Them</p>
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Questions Asked</CardTitle>
                <MessageSquare className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {statsLoading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <>
                    <div className="text-2xl font-bold">{stats.avg_questions_asked}/call</div>
                    <p className="text-xs text-muted-foreground">Avg per call</p>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        <div className="grid gap-6 md:grid-cols-2">
          {/* Top Recommendations */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Target className="h-5 w-5 text-primary" />
                <CardTitle>Top Recommendations</CardTitle>
              </div>
              <CardDescription>AI-powered suggestions to improve your close rate</CardDescription>
            </CardHeader>
            <CardContent>
              {recommendationsLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map(i => (
                    <Skeleton key={i} className="h-20 w-full" />
                  ))}
                </div>
              ) : recommendations && recommendations.length > 0 ? (
                <div className="space-y-4">
                  {recommendations.map((rec: any, i: number) => {
                    const priorityStyles = {
                      high: {
                        bg: 'bg-orange-50 dark:bg-orange-950/20',
                        border: 'border-orange-200 dark:border-orange-900',
                        icon: 'text-orange-600',
                      },
                      medium: {
                        bg: 'bg-blue-50 dark:bg-blue-950/20',
                        border: 'border-blue-200 dark:border-blue-900',
                        icon: 'text-blue-600',
                      },
                      low: {
                        bg: 'bg-green-50 dark:bg-green-950/20',
                        border: 'border-green-200 dark:border-green-900',
                        icon: 'text-green-600',
                      },
                    }
                    const style = priorityStyles[rec.priority as keyof typeof priorityStyles] || priorityStyles.medium
                    const Icon = rec.priority === 'low' ? CheckCircle2 : AlertCircle

                    return (
                      <div key={i} className={`flex gap-3 p-3 border rounded-lg ${style.bg} ${style.border}`}>
                        <Icon className={`h-5 w-5 ${style.icon} flex-shrink-0 mt-0.5`} />
                        <div className="flex-1">
                          <p className="font-medium text-sm mb-1">{rec.title}</p>
                          <p className="text-sm text-muted-foreground">
                            {rec.description}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <p className="text-sm">No recommendations yet</p>
                  <p className="text-xs mt-1">Sync calls to get AI-powered insights</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent Calls */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Recent Call Analysis</CardTitle>
                  <CardDescription>Your latest Fathom recordings</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="show-hidden"
                    checked={showHidden}
                    onCheckedChange={(checked) => setShowHidden(checked as boolean)}
                  />
                  <label htmlFor="show-hidden" className="text-sm text-muted-foreground cursor-pointer">
                    Show hidden
                  </label>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {callsLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4].map(i => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : recentCalls && recentCalls.length > 0 ? (
                <div className="space-y-4">
                  {recentCalls.map((call) => {
                    const score = call.analysis?.overall_score || 0
                    const outcome = score >= 7.5 ? 'positive' : score >= 6 ? 'neutral' : 'negative'
                    const isAnalyzing = analyzingCalls[call.id]
                    const callTitle = call.title || call.meeting_title || 'Untitled Call'

                    // Format date
                    const callDate = call.recording_start_time
                      ? new Date(call.recording_start_time)
                      : null
                    const now = new Date()
                    let dateStr = 'Unknown'

                    if (callDate) {
                      const diffMs = now.getTime() - callDate.getTime()
                      const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
                      const diffDays = Math.floor(diffHours / 24)

                      if (diffHours < 1) {
                        dateStr = 'Just now'
                      } else if (diffHours < 24) {
                        dateStr = `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`
                      } else if (diffDays === 1) {
                        dateStr = 'Yesterday'
                      } else if (diffDays < 7) {
                        dateStr = `${diffDays} days ago`
                      } else {
                        dateStr = callDate.toLocaleDateString()
                      }
                    }

                    return (
                      <div
                        key={call.id}
                        className={`p-4 border rounded-lg ${call.hidden ? 'opacity-60 bg-muted/30' : ''}`}
                      >
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <a
                                href={call.fathom_url || '#'}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-medium text-sm hover:underline truncate"
                              >
                                {callTitle}
                              </a>
                              {call.hidden && (
                                <Badge variant="outline" className="text-xs">
                                  <EyeOff className="h-3 w-3 mr-1" />
                                  Hidden
                                </Badge>
                              )}
                              {call.analysis && (
                                <Badge
                                  variant="secondary"
                                  className={`text-xs ${
                                    outcome === 'positive' ? 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400' :
                                    outcome === 'negative' ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400' :
                                    'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400'
                                  }`}
                                >
                                  {score}/10
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-3 text-xs text-muted-foreground mb-2">
                              <span className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                {dateStr}
                              </span>
                              {call.duration_minutes && (
                                <span className="flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  {call.duration_minutes} min
                                </span>
                              )}
                            </div>
                            {call.summary && (
                              <p className="text-xs text-muted-foreground line-clamp-2 mb-3">
                                {call.summary}
                              </p>
                            )}
                          </div>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="flex-shrink-0">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {call.hidden ? (
                                <DropdownMenuItem onClick={() => handleHideCall(call.id, callTitle, true)}>
                                  <Eye className="h-4 w-4 mr-2" />
                                  Unhide
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem onClick={() => handleHideCall(call.id, callTitle, false)}>
                                  <EyeOff className="h-4 w-4 mr-2" />
                                  Hide
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem
                                onClick={() => handleDeleteCall(call.id, callTitle)}
                                className="text-destructive"
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                        <div className="flex items-center gap-2">
                          {!call.analysis && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleAnalyzeCall(call.id, call.recording_id, callTitle)}
                              disabled={isAnalyzing}
                            >
                              {isAnalyzing ? (
                                <>
                                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                  Analyzing...
                                </>
                              ) : (
                                <>
                                  <Brain className="h-3 w-3 mr-1" />
                                  Analyze with AI
                                </>
                              )}
                            </Button>
                          )}
                          {call.fathom_url && (
                            <Button
                              size="sm"
                              variant="ghost"
                              asChild
                            >
                              <a href={call.fathom_url} target="_blank" rel="noopener noreferrer">
                                <ArrowUpRight className="h-3 w-3 mr-1" />
                                View in Fathom
                              </a>
                            </Button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                  {recentCalls.length >= callsLimit && (
                    <div className="flex justify-center pt-4">
                      <Button
                        variant="outline"
                        onClick={() => setCallsLimit(prev => prev + 10)}
                      >
                        Load More
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <p className="text-sm">No calls yet</p>
                  <p className="text-xs mt-1">Click "Sync Fathom Calls" to get started</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  )
}

export default AISalesDirector
