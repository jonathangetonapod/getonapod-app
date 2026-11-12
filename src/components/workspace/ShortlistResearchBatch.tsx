import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Clock, FlaskConical, Loader2, AlertCircle, AlertTriangle, PanelRightOpen, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { supabase } from '@/lib/supabase'
import { toFunctionError } from '@/lib/functionErrors'
import { blockedClientFields, clientResearchInfoQueryKey, describeClientFields, type ClientResearchField } from '@/lib/researchProgress'
import { getWorkspaceClientDetail } from '@/services/clients'
import { ClientResearchInfoForm } from '@/components/workspace/ClientResearchInfoForm'

interface Job {
 id: string; shortlist_podcast_id: string; batch_id: string; podcast_name: string; status: 'queued'|'running'|'completed'|'failed'|'skipped'; phase: string; message: string|null
 research_progress?: {status?:string|null;completed_stages?:string[];current_stage?:string|null;updated_at?:string|null;missing_fields?:string[]|null}|null
 pitch_steps_completed?:number
 pitch: {subject:string;body:string;follow_up_1_body?:string;follow_up_2_body?:string}|null
}
const FIELD_ORDER:ClientResearchField[] = ['bio','linkedin_url','website']
const RESEARCH_STEPS = ['podcast_profile','recent_episodes','host_profile','guest_patterns','guest_fit','pitch_angles']
const STAGE_LABELS:Record<string,string> = {
 podcast_profile:'podcast research',recent_episodes:'episode analysis',host_profile:'host identification',
 guest_patterns:'guest verification',guest_fit:'topic alignment',pitch_angles:'final research summary',
}
function savedResearchSteps(job:Job) {
 return job.phase === 'pitch' || job.status === 'completed' ? 6
   : RESEARCH_STEPS.filter(id=>job.research_progress?.completed_stages?.includes(id)).length
}
function jobStatus(job:Job) {
 if (['completed','failed','skipped'].includes(job.status)) return job.status
 const running = job.status === 'running'
 if (job.phase === 'pitch') {
   const saved=job.pitch_steps_completed ?? 0
   const next=saved===0?'pitch draft':saved===1?'claim audit':'pitch cleanup'
   return `Research complete${saved ? ` · ${saved} pitch steps saved` : ''} · ${running?'Working on':'Waiting for'} ${next}`
 }
 const saved=savedResearchSteps(job)
 if (!saved && !running) return 'Waiting to start'
 if (saved===6) return `Research steps done · ${running?'Wrapping up research':'Waiting to start the pitch'}`
 const stage=STAGE_LABELS[job.research_progress?.current_stage ?? ''] ?? 'research'
 return `${saved}/6 research steps saved · ${running?'Working on':'Waiting for'} ${stage}`
}
const hiddenKey = (clientId:string) => `shortlist-research-hidden:${clientId}`
function readHidden(clientId:string):string|null { try { return window.localStorage.getItem(hiddenKey(clientId)) } catch { return null } }
function writeHidden(clientId:string,batchId:string|null) {
 try { if (batchId) window.localStorage.setItem(hiddenKey(clientId),batchId); else window.localStorage.removeItem(hiddenKey(clientId)) } catch { /* storage unavailable: hiding lasts this visit */ }
}
export function ShortlistResearchBatch({workspaceId,clientId,selectedIds,pitchHref}:{workspaceId:string;clientId:string;selectedIds:string[];pitchHref?:(id:string)=>string}) {
 const cache = useQueryClient()
 const [review,setReview] = useState(false)
 const [busy,setBusy] = useState(false)
 const [draft,setDraft] = useState<Job|null>(null)
 const [detailsOpen,setDetailsOpen] = useState(false)
 const [hiddenBatch,setHiddenBatch] = useState<string|null>(()=>readHidden(clientId))
 useEffect(()=>setHiddenBatch(readHidden(clientId)),[clientId])
 const key = ['research-batches',workspaceId,clientId]
 async function invoke(action:string,extra:Record<string,unknown> = {}) {
   const {data,error} = await supabase.functions.invoke('workspace-client-shortlist',{body:{action,workspace_id:workspaceId,client_id:clientId,...extra}})
   if(error) throw await toFunctionError(error,'The research batch could not be updated.')
   return data
 }
 const query = useQuery({queryKey:key,queryFn:async()=> (await invoke('research-batch-list')).jobs as Job[],refetchInterval:5000})
 const jobs = query.data ?? []
 const [selectedBatch,setSelectedBatch] = useState<string>('')
 const batchIds = [...new Set(jobs.map(job=>job.batch_id))]
 const visible = jobs.filter(job=>job.batch_id === (selectedBatch || batchIds[0]))
 const transitions = jobs.map(job=>`${job.id}:${job.status}:${job.phase}:${job.research_progress?.updated_at ?? ''}`).join('|')
 useEffect(()=>{
   if (transitions) void cache.invalidateQueries({queryKey:['client-shortlist',workspaceId,clientId]})
 },[transitions,cache,workspaceId,clientId])
 const running = visible.filter(job=>job.status==='running').length
 const waiting = visible.filter(job=>job.status==='queued').length
 const progress = visible.reduce((sum,job)=>sum + (['completed','failed','skipped'].includes(job.status)?1:Math.min(0.95,(savedResearchSteps(job)+(job.pitch_steps_completed ?? 0))/9)),0)
 const completed = visible.filter(job=>job.status==='completed').length
 const failed = visible.filter(job=>job.status==='failed').length
 const skipped = visible.filter(job=>job.status==='skipped').length
 // Failed only because the client profile lacks a required field: one fix covers them all.
 const blockedJobs = visible.filter(job=>job.status==='failed' && blockedClientFields(job.research_progress).length>0)
 const blockedFields = FIELD_ORDER.filter(field=>blockedJobs.some(job=>blockedClientFields(job.research_progress).includes(field)))
 const failedJobs = visible.filter(job=>job.status==='failed')
 const latestBatch = batchIds[0] ?? null
 // The status line always describes the newest batch; the drawer's history picker does not change it.
 const latestJobs = jobs.filter(job=>job.batch_id === latestBatch)
 const line = {
   completed: latestJobs.filter(job=>job.status==='completed').length,
   running: latestJobs.filter(job=>job.status==='running').length,
   waiting: latestJobs.filter(job=>job.status==='queued').length,
   failedJobs: latestJobs.filter(job=>job.status==='failed'),
   skipped: latestJobs.filter(job=>job.status==='skipped').length,
   blocked: latestJobs.filter(job=>job.status==='failed' && blockedClientFields(job.research_progress).length>0).length,
 }
 const active = line.running + line.waiting > 0
 // Hidden only while the batch it was hidden on is the latest and finished; a new batch shows again.
 const lineHidden = !active && latestBatch !== null && hiddenBatch === latestBatch
 // Hiding removes the focused button, so focus moves to whatever replaces it.
 const lineRef = useRef<HTMLDivElement>(null)
 const showRef = useRef<HTMLButtonElement>(null)
 const [focusAfterToggle,setFocusAfterToggle] = useState<'line'|'show'|null>(null)
 useEffect(()=>{
   if (focusAfterToggle==='line') lineRef.current?.focus()
   if (focusAfterToggle==='show') showRef.current?.focus()
   setFocusAfterToggle(null)
 },[focusAfterToggle])
 const hideLine = () => { setHiddenBatch(latestBatch); writeHidden(clientId,latestBatch); setFocusAfterToggle('show') }
 const showLine = () => { setHiddenBatch(null); writeHidden(clientId,null); setFocusAfterToggle('line') }
 // Before a batch starts: client fields research prompts commonly need, left empty.
 const clientInfoQuery = useQuery({queryKey:clientResearchInfoQueryKey(workspaceId,clientId),queryFn:()=>getWorkspaceClientDetail(workspaceId,clientId),enabled:review,retry:false})
 const emptyClientFields = clientInfoQuery.data ? FIELD_ORDER.filter(field=>!(clientInfoQuery.data.client[field] || '').trim()) : []
 async function retryJobs(targets:Job[]) {
   setBusy(true)
   try {
     for (const job of targets) await invoke('research-batch-retry',{job_id:job.id})
     toast.success(targets.length===1?'Research queued again.':`${targets.length} podcasts queued again.`)
   } catch(error) {toast.error(error instanceof Error?error.message:'Could not retry research')}
   finally {
     setBusy(false)
     await cache.invalidateQueries({queryKey:key})
     await cache.invalidateQueries({queryKey:['client-shortlist',workspaceId,clientId]})
   }
 }
 async function act(action:string,extra:Record<string,unknown>) {
   setBusy(true)
   try {
     const response = await invoke(action,extra)
     if (response.batch_id) setSelectedBatch(response.batch_id)
     setReview(false)
     await cache.invalidateQueries({queryKey:key})
     await cache.invalidateQueries({queryKey:['client-shortlist',workspaceId,clientId]})
   } catch(error) {toast.error(error instanceof Error?error.message:'Could not update research batch')}
   finally {setBusy(false)}
 }
 return <section aria-label="Bulk research" className="space-y-3">
   {selectedIds.length>0 && <Button variant="outline" onClick={()=>setReview(true)} disabled={busy}><FlaskConical className="mr-2 h-4 w-4"/>Run research on {selectedIds.length} selected</Button>}
   {query.isError && <p role="alert" className="text-sm text-destructive">Research batches could not be loaded. <button className="underline" onClick={()=>void query.refetch()}>Retry</button></p>}
   {latestJobs.length>0 && !lineHidden && <div ref={lineRef} tabIndex={-1} role="region" aria-label="Research status" className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border bg-muted/20 px-3 py-2 text-sm">
     {active ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-blue-600"/> : <FlaskConical className="h-4 w-4 shrink-0 text-muted-foreground"/>}
     <span className="font-medium">Research:</span>
     <span>{line.completed} done</span>
     {line.running>0 && <span>· {line.running} running</span>}
     {line.waiting>0 && <span>· {line.waiting} waiting</span>}
     {line.failedJobs.length>0 && <><span className="text-red-700">· {line.failedJobs.length} failed</span><Button size="sm" variant="link" className="h-auto p-0" disabled={busy} onClick={()=>void retryJobs(line.failedJobs)}>Retry all</Button></>}
     {line.skipped>0 && <span className="text-muted-foreground">· {line.skipped} skipped</span>}
     {line.blocked>0 && <Button size="sm" variant="link" className="h-auto p-0 text-amber-800" onClick={()=>{setSelectedBatch(latestBatch ?? '');setDetailsOpen(true)}}>· {line.blocked} waiting on client info</Button>}
     <span className="ml-auto flex items-center gap-1">
       <Button size="sm" variant="ghost" className="h-7 px-2" onClick={()=>setDetailsOpen(true)}><PanelRightOpen className="mr-1 h-3.5 w-3.5"/>Details</Button>
       {!active && <Button size="sm" variant="ghost" className="h-7 px-2 text-muted-foreground" onClick={hideLine} aria-label="Hide research status"><X className="h-3.5 w-3.5"/></Button>}
     </span>
   </div>}
   {latestJobs.length>0 && lineHidden && <button ref={showRef} type="button" className="inline-flex min-h-8 items-center rounded px-1 text-xs text-muted-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={showLine}>Show research status</button>}
   <Sheet open={detailsOpen} onOpenChange={setDetailsOpen}><SheetContent className="w-full overflow-y-auto sm:max-w-xl">
   <SheetHeader><SheetTitle>Bulk research</SheetTitle><SheetDescription>Per-podcast progress and drafts for each research batch.</SheetDescription></SheetHeader>
   {visible.length>0 && <div className="mt-4 space-y-3">
     <p role="status" className="text-sm">{completed} complete · {running} running · {waiting} waiting · {failed} need attention · {skipped} skipped</p>
     <label className="block text-sm">Batch history<select aria-label="Batch history" className="ml-2 rounded border bg-background p-1" value={selectedBatch || batchIds[0]} onChange={event=>setSelectedBatch(event.target.value)}>{batchIds.map((id,index)=><option key={id} value={id}>{index===0 ? 'Latest batch' : `Earlier batch ${batchIds.length-index}`}</option>)}</select></label>
     <progress aria-label="Batch progress" className="w-full accent-primary" max={visible.length} value={progress}/>
     <p className="text-xs text-muted-foreground">Up to 10 podcasts run at once for your workspace. Each podcast’s steps run in order. Waiting between steps is normal; the worker checks for available slots every 15 seconds. Drafts are saved here for review; no emails are sent.</p>
     {blockedJobs.length>0 && <div aria-label="Client info needed" className="space-y-3 rounded-lg border border-amber-200 bg-amber-50/70 p-4">
       <div className="flex gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700"/><div><p className="text-sm font-semibold text-amber-950">{blockedJobs.length===1?'1 podcast is':`${blockedJobs.length} podcasts are`} waiting on client info</p><p className="mt-1 text-xs leading-5 text-amber-900/80">Your research prompts require the client’s {describeClientFields(blockedFields)}. Nothing was generated and no credit was spent. Fill them in here and the blocked podcasts run again.</p></div></div>
       <ClientResearchInfoForm workspaceId={workspaceId} clientId={clientId} fields={blockedFields} saveLabel={blockedJobs.length===1?'Save and retry':`Save and retry ${blockedJobs.length} podcasts`} onSaved={()=>retryJobs(blockedJobs)}/>
     </div>}
     {failedJobs.length>1 && <div className="flex justify-end"><Button size="sm" variant="outline" disabled={busy} onClick={()=>void retryJobs(failedJobs)}>Retry all {failedJobs.length}</Button></div>}
     <div className="divide-y">{visible.map(job=><div key={job.id} className="flex items-start gap-2 py-3 text-sm">
       {job.status==='running'?<Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-blue-600"/>:job.status==='completed'?<CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600"/>:job.status==='failed'?<AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600"/>:<Clock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"/>}
       <div className="min-w-0 flex-1"><p className="font-medium">{job.podcast_name}</p><p className="text-xs text-muted-foreground">{jobStatus(job)}{blockedClientFields(job.research_progress).length>0 && job.status==='failed' ? ` — waiting on the client’s ${describeClientFields(blockedClientFields(job.research_progress))}` : job.message?` — ${job.message}`:''}</p>{['queued','running'].includes(job.status) && <progress aria-label={`Research progress for ${job.podcast_name}`} className="mt-2 h-1.5 w-full accent-primary" max={9} value={savedResearchSteps(job)+(job.pitch_steps_completed ?? 0)}/>}</div>
       {job.status==='failed' && <Button size="sm" variant="outline" disabled={busy} onClick={()=>void act('research-batch-retry',{job_id:job.id})}>Retry</Button>}
       {job.pitch && <Button size="sm" variant="outline" onClick={()=>setDraft(job)}>View draft</Button>}
     </div>)}</div>
   </div>}
   </SheetContent></Sheet>
   <Dialog open={review} onOpenChange={setReview}><DialogContent><DialogHeader><DialogTitle>Research {selectedIds.length} selected shows</DialogTitle><DialogDescription>Run the saved research prompts and write a recommended pitch sequence for each eligible show. Uses the workspace’s configured AI provider. The batch continues after you leave this page.</DialogDescription></DialogHeader>
     {emptyClientFields.length>0 && <div aria-label="Client info check" className="space-y-3 rounded-lg border border-amber-200 bg-amber-50/70 p-3">
       <p className="text-sm text-amber-950"><span className="font-semibold">This client has no {describeClientFields(emptyClientFields)} yet.</span> Research stages set to require them will stop without charging. Add them now to avoid that.</p>
       <ClientResearchInfoForm workspaceId={workspaceId} clientId={clientId} fields={emptyClientFields} saveLabel="Save client info" requireAll={false}/>
     </div>}
     <p className="text-sm">Shows already researched, archived, already running, or requiring relationship review will be skipped with a reason. Existing campaign drafts are preserved. Generated drafts appear in the batch for review.</p>
     <Button disabled={busy || selectedIds.length>200} onClick={()=>void act('research-batch-start',{shortlist_podcast_ids:selectedIds})}>{busy?'Queuing…':'Start batch'}</Button>
     {selectedIds.length>200 && <p className="text-sm">Select up to 200 shows per batch.</p>}
   </DialogContent></Dialog>
   <Dialog open={!!draft} onOpenChange={open=>{if(!open)setDraft(null)}}><DialogContent className="max-h-[85vh] overflow-auto"><DialogHeader><DialogTitle>{draft?.pitch?.subject}</DialogTitle><DialogDescription>{draft?.podcast_name} — generated sequence for review</DialogDescription></DialogHeader>{draft && pitchHref && <Button asChild variant="outline"><Link to={pitchHref(draft.shortlist_podcast_id)}>Continue in pitch editor</Link></Button>}{[draft?.pitch?.body,draft?.pitch?.follow_up_1_body,draft?.pitch?.follow_up_2_body].filter(Boolean).map((body,index)=><div key={index}><h4 className="font-medium">{index===0?'Opening email':`Follow-up ${index}`}</h4><p className="whitespace-pre-wrap text-sm mt-2">{body}</p></div>)}</DialogContent></Dialog>
 </section>
}
