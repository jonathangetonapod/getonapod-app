import { DashboardLayout } from '@/components/admin/DashboardLayout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
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
  MessageSquare
} from 'lucide-react'

const AISalesDirector = () => {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
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
          <Button size="lg" className="flex items-center gap-2">
            <Upload className="h-4 w-4" />
            Upload Calls
          </Button>
        </div>

        {/* Overall Performance Score */}
        <Card className="border-primary/20 bg-gradient-to-br from-primary/5 via-background to-purple-500/5">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-2xl">Overall Sales Performance</CardTitle>
                <CardDescription>Based on analysis of your recent sales calls</CardDescription>
              </div>
              <div className="text-right">
                <div className="text-4xl font-bold text-primary">8.2/10</div>
                <div className="flex items-center gap-1 text-sm text-green-600 dark:text-green-400">
                  <TrendingUp className="h-4 w-4" />
                  <span>+0.8 vs last month</span>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6 md:grid-cols-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Discovery</span>
                  <span className="text-sm text-muted-foreground">9.1/10</span>
                </div>
                <Progress value={91} className="h-2" />
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Objection Handling</span>
                  <span className="text-sm text-muted-foreground">7.5/10</span>
                </div>
                <Progress value={75} className="h-2" />
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Closing</span>
                  <span className="text-sm text-muted-foreground">8.0/10</span>
                </div>
                <Progress value={80} className="h-2" />
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Engagement</span>
                  <span className="text-sm text-muted-foreground">8.2/10</span>
                </div>
                <Progress value={82} className="h-2" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stats Grid */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Calls Analyzed</CardTitle>
              <Phone className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">24</div>
              <p className="text-xs text-muted-foreground">Last 30 days</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Avg Call Duration</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">42 min</div>
              <p className="text-xs text-muted-foreground">Optimal range</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Talk-Listen Ratio</CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">43:57</div>
              <p className="text-xs text-green-600 dark:text-green-400">Excellent balance</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Questions Asked</CardTitle>
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">18/call</div>
              <p className="text-xs text-muted-foreground">Avg per call</p>
            </CardContent>
          </Card>
        </div>

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
              <div className="space-y-4">
                <div className="flex gap-3 p-3 border rounded-lg bg-orange-50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-900">
                  <AlertCircle className="h-5 w-5 text-orange-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-medium text-sm mb-1">Address objections earlier</p>
                    <p className="text-sm text-muted-foreground">
                      You're waiting avg 28min before handling objections. Address concerns at 15-20min mark.
                    </p>
                  </div>
                </div>

                <div className="flex gap-3 p-3 border rounded-lg bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900">
                  <AlertCircle className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-medium text-sm mb-1">Strengthen value proposition</p>
                    <p className="text-sm text-muted-foreground">
                      Mention ROI and results 2-3x more frequently in the first 10 minutes.
                    </p>
                  </div>
                </div>

                <div className="flex gap-3 p-3 border rounded-lg bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-900">
                  <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-medium text-sm mb-1">Great discovery process</p>
                    <p className="text-sm text-muted-foreground">
                      Your question quality is excellent. Continue asking open-ended questions early.
                    </p>
                  </div>
                </div>
              </div>
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
                <Button variant="ghost" size="sm">View All</Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {[
                  { name: 'Sarah Johnson - Discovery Call', score: 8.5, date: '2 hours ago', duration: '38 min', outcome: 'positive' },
                  { name: 'Michael Chen - Follow-up', score: 9.2, date: 'Yesterday', duration: '45 min', outcome: 'positive' },
                  { name: 'Alex Rivera - Demo Call', score: 7.1, date: '2 days ago', duration: '52 min', outcome: 'neutral' },
                  { name: 'Emily Brown - Closing Call', score: 6.8, date: '3 days ago', duration: '28 min', outcome: 'negative' },
                ].map((call, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-medium text-sm truncate">{call.name}</p>
                        <Badge
                          variant="secondary"
                          className={`text-xs ${
                            call.outcome === 'positive' ? 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400' :
                            call.outcome === 'negative' ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400' :
                            'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400'
                          }`}
                        >
                          {call.score}/10
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {call.date}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {call.duration}
                        </span>
                      </div>
                    </div>
                    <ArrowUpRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Upload Section */}
        <Card className="border-dashed">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                <Upload className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Upload Fathom Sales Calls</h3>
              <p className="text-sm text-muted-foreground mb-4 max-w-md">
                Drag and drop your Fathom call recordings or connect your Fathom account for automatic syncing
              </p>
              <div className="flex gap-3">
                <Button variant="outline">Connect Fathom</Button>
                <Button>Upload Files</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  )
}

export default AISalesDirector
