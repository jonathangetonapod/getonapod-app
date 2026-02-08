import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Gauge, AlertTriangle, Zap, Shield } from "lucide-react";

export function RateLimitsSection() {
  return (
    <div id="rate-limits" className="scroll-mt-24 space-y-4">
      <div className="mb-6">
        <h2 className="text-2xl font-bold">Rate Limits & Performance</h2>
        <p className="text-muted-foreground mt-1">
          Understand throughput limits and optimize your integration.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="h-4 w-4 text-green-500" />
              Supabase Edge Functions
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Concurrent Requests</span>
              <Badge variant="secondary" className="font-mono">200+</Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Function Timeout</span>
              <Badge variant="secondary" className="font-mono">60s</Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Rate Limiting</span>
              <Badge variant="outline" className="text-green-600">None</Badge>
            </div>
            <p className="text-xs text-muted-foreground pt-1">
              Supabase handles 200+ concurrent edge function invocations with zero rate limiting on our plan.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Google Sheets API
              <Badge variant="destructive" className="text-[10px] px-1.5 py-0">Bottleneck</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Read Requests</span>
              <Badge variant="secondary" className="font-mono">~60/min</Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Per Function Call</span>
              <Badge variant="secondary" className="font-mono">~2 reads</Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Safe Concurrency</span>
              <Badge variant="secondary" className="font-mono">~30 calls/min</Badge>
            </div>
            <p className="text-xs text-muted-foreground pt-1">
              Endpoints that read Google Sheets are limited by the Sheets API quota per service account. Use <code className="bg-muted px-1 rounded">cacheOnly</code> mode where available to bypass this limit.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Gauge className="h-4 w-4 text-blue-500" />
              Typical Latencies
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Cache-only reads</span>
              <Badge variant="secondary" className="font-mono">250-500ms</Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Sheet reads (cached data)</span>
              <Badge variant="secondary" className="font-mono">1.5-2.5s</Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">AI analysis endpoints</span>
              <Badge variant="secondary" className="font-mono">3-8s</Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Backfill pipeline</span>
              <Badge variant="secondary" className="font-mono">5-10s</Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="h-4 w-4 text-purple-500" />
              Best Practices
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-2.5">
            <div className="flex gap-2">
              <span className="text-green-500 font-bold shrink-0">1.</span>
              <span className="text-muted-foreground">Use <code className="bg-muted px-1 rounded">cacheOnly: true</code> with <code className="bg-muted px-1 rounded">prospectDashboardId</code> to bypass Google Sheets entirely for unlimited throughput.</span>
            </div>
            <div className="flex gap-2">
              <span className="text-green-500 font-bold shrink-0">2.</span>
              <span className="text-muted-foreground">Batch operations where possible — the cache deduplicates across all sources automatically.</span>
            </div>
            <div className="flex gap-2">
              <span className="text-green-500 font-bold shrink-0">3.</span>
              <span className="text-muted-foreground">Space Google Sheets calls to &lt;30 per minute per service account to avoid 429 errors.</span>
            </div>
            <div className="flex gap-2">
              <span className="text-green-500 font-bold shrink-0">4.</span>
              <span className="text-muted-foreground">AI endpoints have their own rate limits (OpenAI, Anthropic) but are rarely the bottleneck in practice.</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
