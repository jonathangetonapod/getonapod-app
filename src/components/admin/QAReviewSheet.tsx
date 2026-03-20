import React, { useState, useMemo } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Loader2, Search, ChevronDown, ChevronUp, CheckCircle2, XCircle, AlertTriangle, ArrowUpDown } from 'lucide-react'
import { runQAReview, getScoreTier, type QAPodcastInput, type QAResult, type ScoreTier } from '@/services/qaReview'
import { toast } from 'sonner'

interface QAReviewSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  podcasts: QAPodcastInput[]
  prospectBio: string
  prospectName: string
  /** Maps podscan_id → database row id for converting back to parent's selectedPodcasts format */
  idMap: Map<string, string>
  onConfirm: (approvedDatabaseIds: Set<string>) => void
}

type SortField = 'name' | 'bioFit' | 'topicRelevance'

const tierColors: Record<ScoreTier, string> = {
  green: 'bg-green-100 text-green-800 border-green-300',
  yellow: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  red: 'bg-red-100 text-red-800 border-red-300',
  unavailable: 'bg-gray-100 text-gray-500 border-gray-300',
}

export function QAReviewSheet({ open, onOpenChange, podcasts, prospectBio, prospectName, idMap, onConfirm }: QAReviewSheetProps) {
  const [targetTopic, setTargetTopic] = useState('')
  const [isRunning, setIsRunning] = useState(false)
  const [progress, setProgress] = useState({ completed: 0, total: 0 })
  const [results, setResults] = useState<QAResult[]>([])
  const [hasRun, setHasRun] = useState(false)
  const [approvedIds, setApprovedIds] = useState<Set<string>>(() => new Set(podcasts.map(p => p.podcast_id)))
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [sortField, setSortField] = useState<SortField>('bioFit')
  const [sortAsc, setSortAsc] = useState(false)

  // Build result lookup
  const resultMap = useMemo(() => {
    const map = new Map<string, QAResult>()
    results.forEach(r => map.set(r.podcast_id, r))
    return map
  }, [results])

  // Summary stats
  const summary = useMemo(() => {
    if (!hasRun) return null
    let green = 0, yellow = 0, red = 0
    results.forEach(r => {
      const bioTier = getScoreTier(r.bio_fit_score)
      const topicTier = getScoreTier(r.topic_relevance_score)
      const tiers: ScoreTier[] = [bioTier, topicTier].filter(t => t !== 'unavailable') as ScoreTier[]
      const worst = tiers.includes('red') ? 'red' : tiers.includes('yellow') ? 'yellow' : 'green'
      if (worst === 'green') green++
      else if (worst === 'yellow') yellow++
      else red++
    })
    return { green, yellow, red, total: results.length }
  }, [results, hasRun])

  // Sorted podcasts
  const sortedPodcasts = useMemo(() => {
    if (!hasRun) return podcasts
    return [...podcasts].sort((a, b) => {
      const ra = resultMap.get(a.podcast_id)
      const rb = resultMap.get(b.podcast_id)
      let diff = 0
      if (sortField === 'name') {
        diff = a.podcast_name.localeCompare(b.podcast_name)
      } else if (sortField === 'bioFit') {
        diff = (rb?.bio_fit_score ?? -1) - (ra?.bio_fit_score ?? -1)
      } else if (sortField === 'topicRelevance') {
        diff = (rb?.topic_relevance_score ?? -1) - (ra?.topic_relevance_score ?? -1)
      }
      return sortAsc ? -diff : diff
    })
  }, [podcasts, hasRun, resultMap, sortField, sortAsc])

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc)
    } else {
      setSortField(field)
      setSortAsc(false)
    }
  }

  const handleRunQA = async () => {
    setIsRunning(true)
    setProgress({ completed: 0, total: podcasts.length })

    try {
      const qaResults = await runQAReview(
        prospectBio,
        targetTopic,
        podcasts,
        (completed, total) => setProgress({ completed, total }),
      )
      setResults(qaResults)
      setHasRun(true)

      // Auto-deselect red podcasts but keep them visible
      const newApproved = new Set<string>()
      qaResults.forEach(r => {
        const bioTier = getScoreTier(r.bio_fit_score)
        const topicTier = getScoreTier(r.topic_relevance_score)
        const isRed = bioTier === 'red' || topicTier === 'red'
        if (!isRed) newApproved.add(r.podcast_id)
      })
      setApprovedIds(newApproved)

      toast.success(`QA complete! ${qaResults.filter(r => r.bio_fit_score !== null).length}/${qaResults.length} scored`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'QA review failed')
    } finally {
      setIsRunning(false)
    }
  }

  const handleDeselectAllRed = () => {
    const newApproved = new Set(approvedIds)
    results.forEach(r => {
      if (getScoreTier(r.bio_fit_score) === 'red' || getScoreTier(r.topic_relevance_score) === 'red') {
        newApproved.delete(r.podcast_id)
      }
    })
    setApprovedIds(newApproved)
  }

  const handleSelectAllGreen = () => {
    const newApproved = new Set(approvedIds)
    results.forEach(r => {
      if (getScoreTier(r.bio_fit_score) === 'green' &&
          (getScoreTier(r.topic_relevance_score) === 'green' || r.topic_relevance_score === null)) {
        newApproved.add(r.podcast_id)
      }
    })
    setApprovedIds(newApproved)
  }

  const toggleRow = (id: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleApproval = (id: string) => {
    setApprovedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const renderScoreBadge = (score: number | null) => {
    const tier = getScoreTier(score)
    return (
      <Badge variant="outline" className={tierColors[tier]}>
        {score !== null ? `${score}/10` : 'N/A'}
      </Badge>
    )
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[95vw] max-w-[900px] flex flex-col p-0">
        <SheetHeader className="p-6 pb-4 border-b">
          <SheetTitle>QA Review — {prospectName || `${podcasts.length} Podcasts`}</SheetTitle>
          <SheetDescription>
            Score podcasts for relevance before exporting to prospect dashboard
          </SheetDescription>

          {/* Target Topic Input */}
          <div className="flex gap-2 mt-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={targetTopic}
                onChange={(e) => setTargetTopic(e.target.value)}
                placeholder="Target topic, e.g. wholesale real estate"
                className="pl-9"
                disabled={isRunning}
              />
            </div>
            <Button onClick={handleRunQA} disabled={isRunning}>
              {isRunning ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Scoring {progress.completed}/{progress.total}
                </>
              ) : hasRun ? 'Re-run QA' : 'Run QA'}
            </Button>
          </div>

          {/* Progress bar during scoring */}
          {isRunning && (
            <Progress value={(progress.completed / progress.total) * 100} className="mt-2" />
          )}

          {/* Summary bar */}
          {summary && !isRunning && (
            <div className="flex items-center justify-between mt-3">
              <div className="flex items-center gap-3 text-sm">
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  {summary.green} strong
                </span>
                <span className="flex items-center gap-1">
                  <AlertTriangle className="h-4 w-4 text-yellow-600" />
                  {summary.yellow} moderate
                </span>
                <span className="flex items-center gap-1">
                  <XCircle className="h-4 w-4 text-red-600" />
                  {summary.red} weak
                </span>
                <span className="text-muted-foreground">
                  | {approvedIds.size} selected for export
                </span>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleSelectAllGreen}>
                  Select green
                </Button>
                <Button variant="outline" size="sm" onClick={handleDeselectAllRed}>
                  Deselect red
                </Button>
              </div>
            </div>
          )}
        </SheetHeader>

        {/* Results Table */}
        <ScrollArea className="flex-1">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10" />
                <TableHead className="cursor-pointer" onClick={() => handleSort('name')}>
                  <span className="flex items-center gap-1">
                    Podcast
                    {sortField === 'name' && (sortAsc ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
                    {sortField !== 'name' && <ArrowUpDown className="h-3 w-3 text-muted-foreground" />}
                  </span>
                </TableHead>
                <TableHead className="w-24 cursor-pointer" onClick={() => handleSort('bioFit')}>
                  <span className="flex items-center gap-1">
                    Bio Fit
                    {sortField === 'bioFit' && (sortAsc ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
                    {sortField !== 'bioFit' && <ArrowUpDown className="h-3 w-3 text-muted-foreground" />}
                  </span>
                </TableHead>
                <TableHead className="w-24 cursor-pointer" onClick={() => handleSort('topicRelevance')}>
                  <span className="flex items-center gap-1">
                    Topic
                    {sortField === 'topicRelevance' && (sortAsc ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
                    {sortField !== 'topicRelevance' && <ArrowUpDown className="h-3 w-3 text-muted-foreground" />}
                  </span>
                </TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedPodcasts.map(podcast => {
                const result = resultMap.get(podcast.podcast_id)
                const isExpanded = expandedRows.has(podcast.podcast_id)
                const isApproved = approvedIds.has(podcast.podcast_id)

                return (
                  <React.Fragment key={podcast.podcast_id}>
                    <TableRow className={!isApproved && hasRun ? 'opacity-50' : ''}>
                      <TableCell>
                        <Checkbox
                          checked={isApproved}
                          onCheckedChange={() => toggleApproval(podcast.podcast_id)}
                        />
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium text-sm">{podcast.podcast_name}</p>
                          <p className="text-xs text-muted-foreground">{podcast.publisher_name || 'Unknown host'}</p>
                        </div>
                      </TableCell>
                      <TableCell>{hasRun ? renderScoreBadge(result?.bio_fit_score ?? null) : '—'}</TableCell>
                      <TableCell>{hasRun ? renderScoreBadge(result?.topic_relevance_score ?? null) : '—'}</TableCell>
                      <TableCell>
                        {hasRun && result && (
                          <Button variant="ghost" size="sm" onClick={() => toggleRow(podcast.podcast_id)}>
                            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                    {hasRun && result && isExpanded && (
                      <TableRow>
                        <TableCell colSpan={5} className="bg-muted/30 p-4">
                          <div className="space-y-3 text-sm">
                            {result.bio_fit_reasoning && (
                              <div>
                                <p className="font-medium text-xs text-muted-foreground mb-1">Bio Fit Reasoning</p>
                                <p>{result.bio_fit_reasoning}</p>
                              </div>
                            )}
                            {result.topic_reasoning && (
                              <div>
                                <p className="font-medium text-xs text-muted-foreground mb-1">Topic Relevance Reasoning</p>
                                <p>{result.topic_reasoning}</p>
                              </div>
                            )}
                            {result.topic_signals.length > 0 && (
                              <div>
                                <p className="font-medium text-xs text-muted-foreground mb-1">Topic Signals</p>
                                <ul className="list-disc list-inside space-y-0.5">
                                  {result.topic_signals.map((signal, i) => (
                                    <li key={i} className="text-muted-foreground">{signal}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {result.pitch_angles.length > 0 && (
                              <div>
                                <p className="font-medium text-xs text-muted-foreground mb-1">Pitch Angles</p>
                                <div className="space-y-2">
                                  {result.pitch_angles.map((pitch, i) => (
                                    <div key={i} className="pl-3 border-l-2 border-primary/30">
                                      <p className="font-medium">{pitch.title}</p>
                                      <p className="text-muted-foreground">{pitch.description}</p>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                )
              })}
            </TableBody>
          </Table>
        </ScrollArea>

        {/* Footer */}
        <div className="border-t p-4 flex items-center justify-between">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              // Convert podscan_ids back to database row IDs for the parent component
              const dbIds = new Set<string>()
              approvedIds.forEach(podscanId => {
                const dbId = idMap.get(podscanId)
                if (dbId) dbIds.add(dbId)
              })
              onConfirm(dbIds)
            }}
            disabled={approvedIds.size === 0 || !hasRun}
          >
            Confirm & Export ({approvedIds.size})
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
