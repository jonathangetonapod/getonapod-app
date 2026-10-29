import { createAdminClient, secretsMatch, HttpError, type AuthContext } from './workspaceAuth.ts'

// Internal invocation is bound to one claimed job and one exact action, never a general service-role bypass.
export async function researchBatchAuth(req: Request, body: Record<string, unknown>): Promise<AuthContext | null> {
 const jobId = req.headers.get('x-research-job')
 if (!jobId) return null
 const secret = Deno.env.get('RESEARCH_TICK_SECRET')
 if (!secret || !(await secretsMatch(req.headers.get('x-research-secret') ?? '', secret))) throw new HttpError(401,'INVALID_WORKER','Invalid worker')
 const admin = createAdminClient()
 const { data: job, error } = await admin.from('client_research_jobs').select('*').eq('id',jobId).eq('status','running').eq('lease', req.headers.get('x-research-lease')).single()
 if (error || !job || Date.now()-Date.parse(job.leased_at)>600000
 || body.workspace_id !== job.workspace_id || body.client_id !== job.client_id || body.shortlist_podcast_id !== job.shortlist_podcast_id
 || body.action !== (job.phase === 'research' ? 'research-run' : 'pitch-generate') || body.relationship_acknowledged === true
 || (body.continue_token ?? null) !== job.continue_token) throw new HttpError(403,'INVALID_JOB','Invalid research job')
 const { data, error: userError } = await admin.auth.admin.getUserById(job.actor_id)
 if (userError || !data.user) throw new HttpError(403,'ACTOR_UNAVAILABLE','The batch owner no longer has access')
 const email = data.user.email?.trim().toLowerCase() ?? ''
 const { data: platformAdmin, error: identityError } = await admin.rpc('is_platform_admin_identity',{p_user_id:data.user.id,p_email:email})
 if (identityError) throw new HttpError(503,'ACCESS_UNAVAILABLE','Cannot verify batch owner')
 return { admin, user:data.user, email, platformAdmin:platformAdmin === true, accessToken:'', tokenIssuedAt:job.actor_issued_at, tokenAppMetadata:job.actor_metadata }
}
