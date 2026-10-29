import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Clock, FlaskConical, Loader2, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { supabase } from '@/lib/supabase'
import { toFunctionError } from '@/lib/functionErrors'

interface Job {
 id: string; shortlist_podcast_id: string; batch_id: string; podcast_name: string; status: 'queued'|'running'|'completed'|'failed'|'skipped'; phase: string; message: string|null
 research_progress?: {completed_stages?:string[];current_stage?:string|null;updated_at?:string|null}|null
 pitch_steps_completed?:number
 pitch: {subject:string;body:string;follow_up_1_body?:string;follow_up_2_body?:string}|null
}
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
 const stage=STAGE_LABELS[job.research_progress?.current_stage ?? ''] ?? 'research'
 return `${saved}/6 research steps saved · ${running?'Working on':'Waiting for'} ${stage}`
}
export function ShortlistResearchBatch({workspaceId,clientId,selectedIds,pitchHref}:{workspaceId:string;clientId:string;selectedIds:string[];pitchHref?:(id:string)=>string}) {
 const cache = useQueryClient()
 const [review,setReview] = useState(false)
 const [busy,setBusy] = useState(false)
 const [draft,setDraft] = useState<Job|null>(null)
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
   {visible.length>0 && <div className="rounded-xl border bg-muted/20 p-4 space-y-3">
     <div className="flex flex-wrap justify-between gap-2"><h3 className="font-semibold">Bulk research</h3><p role="status" className="text-sm">{completed} complete · {running} running · {waiting} waiting · {failed} need attention · {skipped} skipped</p></div>
     <label className="block text-sm">Batch history<select aria-label="Batch history" className="ml-2 rounded border bg-background p-1" value={selectedBatch || batchIds[0]} onChange={event=>setSelectedBatch(event.target.value)}>{batchIds.map((id,index)=><option key={id} value={id}>{index===0 ? 'Latest batch' : `Earlier batch ${batchIds.length-index}`}</option>)}</select></label>
     <progress aria-label="Batch progress" className="w-full accent-primary" max={visible.length} value={progress}/>
     <p className="text-xs text-muted-foreground">Up to 4 podcasts run at once for your workspace. Each podcast’s steps run in order. Waiting between steps is normal; the worker checks the queue every minute. Drafts are saved here for review; no emails are sent.</p>
     <div className="max-h-80 overflow-auto divide-y">{visible.map(job=><div key={job.id} className="flex items-start gap-2 py-3 text-sm">
       {job.status==='running'?<Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-blue-600"/>:job.status==='completed'?<CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600"/>:job.status==='failed'?<AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600"/>:<Clock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"/>}
       <div className="min-w-0 flex-1"><p className="font-medium">{job.podcast_name}</p><p className="text-xs text-muted-foreground">{jobStatus(job)}{job.message?` — ${job.message}`:''}</p>{['queued','running'].includes(job.status) && <progress aria-label={`Research progress for ${job.podcast_name}`} className="mt-2 h-1.5 w-full accent-primary" max={9} value={savedResearchSteps(job)+(job.pitch_steps_completed ?? 0)}/>}</div>
       {job.status==='failed' && <Button size="sm" variant="outline" disabled={busy} onClick={()=>void act('research-batch-retry',{job_id:job.id})}>Retry</Button>}
       {job.pitch && <Button size="sm" variant="outline" onClick={()=>setDraft(job)}>View draft</Button>}
     </div>)}</div>
   </div>}
   <Dialog open={review} onOpenChange={setReview}><DialogContent><DialogHeader><DialogTitle>Research {selectedIds.length} selected shows</DialogTitle><DialogDescription>Run the saved research prompts and write a recommended pitch sequence for each eligible show. Uses the workspace’s configured AI provider. The batch continues after you leave this page.</DialogDescription></DialogHeader>
     <p className="text-sm">Shows already researched, archived, already running, or requiring relationship review will be skipped with a reason. Existing campaign drafts are preserved. Generated drafts appear in the batch for review.</p>
     <Button disabled={busy || selectedIds.length>200} onClick={()=>void act('research-batch-start',{shortlist_podcast_ids:selectedIds})}>{busy?'Queuing…':'Start batch'}</Button>
     {selectedIds.length>200 && <p className="text-sm">Select up to 200 shows per batch.</p>}
   </DialogContent></Dialog>
   <Dialog open={!!draft} onOpenChange={open=>{if(!open)setDraft(null)}}><DialogContent className="max-h-[85vh] overflow-auto"><DialogHeader><DialogTitle>{draft?.pitch?.subject}</DialogTitle><DialogDescription>{draft?.podcast_name} — generated sequence for review</DialogDescription></DialogHeader>{draft && pitchHref && <Button asChild variant="outline"><Link to={pitchHref(draft.shortlist_podcast_id)}>Continue in pitch editor</Link></Button>}{[draft?.pitch?.body,draft?.pitch?.follow_up_1_body,draft?.pitch?.follow_up_2_body].filter(Boolean).map((body,index)=><div key={index}><h4 className="font-medium">{index===0?'Opening email':`Follow-up ${index}`}</h4><p className="whitespace-pre-wrap text-sm mt-2">{body}</p></div>)}</DialogContent></Dialog>
 </section>
}
