import { researchBatchResult } from '../_shared/researchBatchResult.ts'
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createAdminClient, secretsMatch } from '../_shared/workspaceAuth.ts'

serve(async req => {
 const secret = Deno.env.get('RESEARCH_TICK_SECRET')
 if (req.method !== 'POST' || !secret || !(await secretsMatch(req.headers.get('x-research-secret') ?? '',secret))) return new Response('Unauthorized',{status:401})
 const admin = createAdminClient()
 const {data:jobs,error} = await admin.rpc('claim_client_research_jobs', {p_limit:4})
 if (error) return new Response('Claim failed',{status:500})
 if (!jobs?.length) return Response.json({idle:true})
 const results = await Promise.allSettled(jobs.map(async (job: {id:string;phase:string;workspace_id:string;client_id:string;shortlist_podcast_id:string;continue_token:string|null;lease:string}) => {
 try {
   const body = {action:job.phase === 'research' ? 'research-run':'pitch-generate',workspace_id:job.workspace_id,client_id:job.client_id,shortlist_podcast_id:job.shortlist_podcast_id,
     ...(job.phase === 'research' && job.continue_token ? {continue_token:job.continue_token}:{}),...(job.phase === 'pitch'?{angle_index:0}:{})}
   const response = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/workspace-client-shortlist`,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,'x-research-secret':secret,'x-research-job':job.id,'x-research-lease':job.lease},body:JSON.stringify(body),signal:AbortSignal.timeout(140000)})
   const result = await response.json()
   if (!response.ok) throw new Error(result.message ?? result.error ?? 'Research failed')
   const update = researchBatchResult(job.phase, result)
   const {error:saveError} = await admin.from('client_research_jobs').update({...update,lease:null,leased_at:null,updated_at:new Date().toISOString()}).eq('id',job.id).eq('lease',job.lease).eq('status','running')
   if (saveError) throw saveError
 } catch(error) {
   await admin.from('client_research_jobs').update({status:'failed',message:String(error instanceof Error?error.message:error).slice(0,500),updated_at:new Date().toISOString()}).eq('id',job.id).eq('lease',job.lease).eq('status','running')
 }
 return job.id
 }))
 return Response.json({processed:results.filter(result=>result.status==='fulfilled').length,claimed:jobs.length})
})
