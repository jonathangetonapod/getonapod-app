import { DashboardLayout } from '@/components/admin/DashboardLayout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Brain, Sparkles, TrendingUp, Target, Zap } from 'lucide-react'

const AISalesDirector = () => {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
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
              Your intelligent sales assistant for lead management and insights
            </p>
          </div>
        </div>

        {/* Feature Cards */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="border-primary/20">
            <CardHeader>
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center mb-3">
                <TrendingUp className="h-5 w-5 text-primary" />
              </div>
              <CardTitle className="text-lg">Lead Insights</CardTitle>
              <CardDescription>
                AI-powered analysis of your leads and conversion patterns
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="border-purple-500/20">
            <CardHeader>
              <div className="h-10 w-10 rounded-lg bg-purple-500/10 flex items-center justify-center mb-3">
                <Target className="h-5 w-5 text-purple-500" />
              </div>
              <CardTitle className="text-lg">Smart Prioritization</CardTitle>
              <CardDescription>
                Automatically identify and prioritize your hottest leads
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="border-blue-500/20">
            <CardHeader>
              <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center mb-3">
                <Zap className="h-5 w-5 text-blue-500" />
              </div>
              <CardTitle className="text-lg">Response Suggestions</CardTitle>
              <CardDescription>
                AI-generated reply suggestions for faster responses
              </CardDescription>
            </CardHeader>
          </Card>
        </div>

        {/* Main Content Area */}
        <Card className="border-primary/20 bg-gradient-to-br from-primary/5 via-background to-purple-500/5">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="h-20 w-20 rounded-full bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center mb-6">
                <Brain className="h-10 w-10 text-white" />
              </div>
              <h3 className="text-2xl font-semibold mb-3">AI Sales Director Coming Soon</h3>
              <p className="text-muted-foreground max-w-2xl mb-6">
                We're building an intelligent sales assistant that will analyze your leads, suggest optimal
                follow-up strategies, and help you close more deals with AI-powered insights.
              </p>
              <div className="flex flex-wrap gap-2 justify-center">
                <Badge variant="secondary" className="text-sm">Lead Scoring</Badge>
                <Badge variant="secondary" className="text-sm">Smart Recommendations</Badge>
                <Badge variant="secondary" className="text-sm">Response Automation</Badge>
                <Badge variant="secondary" className="text-sm">Performance Analytics</Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  )
}

export default AISalesDirector
