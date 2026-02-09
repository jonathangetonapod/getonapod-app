import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Check, Copy, Brain, Info, Gauge, Lightbulb } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CodeBlock } from "./CodeBlock";
import { ParamsTable } from "./ParamsTable";
import {
  type ApiEndpoint,
  generateCurlExample,
  generateJsExample,
  generatePythonExample,
} from "@/lib/api-docs";

const METHOD_COLORS: Record<string, string> = {
  GET: "bg-emerald-600 hover:bg-emerald-600",
  POST: "bg-blue-600 hover:bg-blue-600",
  PUT: "bg-amber-600 hover:bg-amber-600",
  PATCH: "bg-orange-600 hover:bg-orange-600",
  DELETE: "bg-red-600 hover:bg-red-600",
};

interface EndpointCardProps {
  endpoint: ApiEndpoint;
}

export function EndpointCard({ endpoint }: EndpointCardProps) {
  const [pathCopied, setPathCopied] = useState(false);

  const handleCopyPath = async () => {
    await navigator.clipboard.writeText(endpoint.path);
    setPathCopied(true);
    setTimeout(() => setPathCopied(false), 2000);
  };

  return (
    <Card id={endpoint.id} className="scroll-mt-24">
      <CardHeader className="pb-4">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <Badge className={`${METHOD_COLORS[endpoint.method]} text-white font-mono text-xs px-2.5`}>
              {endpoint.method}
            </Badge>
            <h3 className="text-lg font-semibold">{endpoint.name}</h3>
          </div>
          <div className="flex items-center gap-2">
            <code className="text-sm font-mono bg-muted px-3 py-1.5 rounded-md flex-1 overflow-x-auto">
              {endpoint.path}
            </code>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={handleCopyPath}
            >
              {pathCopied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">{endpoint.description}</p>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground">Auth:</span>
            <Badge variant="outline" className="text-xs">
              {endpoint.auth}
            </Badge>
            {endpoint.aiModel && (
              <>
                <span className="text-xs text-muted-foreground ml-2">AI Model:</span>
                <Badge variant="secondary" className="text-xs gap-1">
                  <Brain className="h-3 w-3" />
                  {endpoint.aiModel}
                </Badge>
              </>
            )}
          </div>
          {endpoint.notes && (
            <div className="flex gap-2 bg-muted/50 border rounded-md p-3 text-sm text-muted-foreground">
              <Info className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{endpoint.notes}</span>
            </div>
          )}
          {endpoint.bestPractices && (
            <div className="flex gap-2 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 rounded-md p-3 text-sm text-amber-700 dark:text-amber-300">
              <Lightbulb className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{endpoint.bestPractices}</span>
            </div>
          )}
          {endpoint.performance && (
            <div className="bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 rounded-md p-3 text-sm space-y-1.5">
              <div className="flex items-center gap-1.5 font-medium text-blue-700 dark:text-blue-300 mb-2">
                <Gauge className="h-4 w-4" />
                Performance & Rate Limits
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-blue-600 dark:text-blue-400">
                <div><span className="font-medium">Avg Latency:</span> {endpoint.performance.avgLatency}</div>
                <div><span className="font-medium">Max Concurrency:</span> {endpoint.performance.maxConcurrency}</div>
                {endpoint.performance.rateLimit && (
                  <div className="sm:col-span-2"><span className="font-medium">Rate Limit:</span> {endpoint.performance.rateLimit}</div>
                )}
                {endpoint.performance.bottleneck && (
                  <div className="sm:col-span-2"><span className="font-medium">Bottleneck:</span> {endpoint.performance.bottleneck}</div>
                )}
              </div>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {endpoint.params.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold mb-3">
              {endpoint.method === "GET" || endpoint.method === "DELETE" ? "Query Parameters" : "Request Body"}
            </h4>
            <ParamsTable params={endpoint.params} />
          </div>
        )}

        <div>
          <h4 className="text-sm font-semibold mb-3">Response</h4>
          <CodeBlock code={endpoint.responseExample} language="json" />
        </div>

        <div>
          <h4 className="text-sm font-semibold mb-3">Code Examples</h4>
          <Tabs defaultValue="curl" className="w-full">
            <TabsList className="mb-2">
              <TabsTrigger value="curl">cURL</TabsTrigger>
              <TabsTrigger value="javascript">JavaScript</TabsTrigger>
              <TabsTrigger value="python">Python</TabsTrigger>
            </TabsList>
            <TabsContent value="curl">
              <CodeBlock code={generateCurlExample(endpoint)} language="bash" />
            </TabsContent>
            <TabsContent value="javascript">
              <CodeBlock code={generateJsExample(endpoint)} language="javascript" />
            </TabsContent>
            <TabsContent value="python">
              <CodeBlock code={generatePythonExample(endpoint)} language="python" />
            </TabsContent>
          </Tabs>
        </div>
      </CardContent>
    </Card>
  );
}
