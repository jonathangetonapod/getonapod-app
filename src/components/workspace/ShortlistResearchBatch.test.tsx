import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, expect, it, vi } from 'vitest'
import { ShortlistResearchBatch } from './ShortlistResearchBatch'
const invoke = vi.hoisted(()=>vi.fn())
vi.mock('@/lib/supabase',()=>({supabase:{functions:{invoke}}}))
vi.mock('sonner',()=>({toast:{error:vi.fn(),success:vi.fn()}}))
const clients = vi.hoisted(()=>({getWorkspaceClientDetail:vi.fn(),updateWorkspaceClient:vi.fn(),updateWorkspaceClientProfile:vi.fn()}))
vi.mock('@/services/clients',()=>clients)
const clientRecord = (overrides:Record<string,unknown> = {})=>({can_manage:true,client:{id:'client',workspace_id:'workspace',name:'Taylor',email:'t@example.com',contact_person:'',linkedin_url:'',website:'',status:'active',notes:'keep me',bio:'',updated_at:'2026-11-04T00:00:00.000Z',...overrides}})
function mount(client = new QueryClient({defaultOptions:{queries:{retry:false}}})){return render(<QueryClientProvider client={client}><ShortlistResearchBatch workspaceId="workspace" clientId="client" selectedIds={['row-one','row-two']}/></QueryClientProvider>)}
beforeEach(()=>{
 invoke.mockReset();invoke.mockResolvedValue({data:{jobs:[]},error:null})
 clients.getWorkspaceClientDetail.mockReset().mockResolvedValue(clientRecord({bio:'Founder',linkedin_url:'https://linkedin.com/in/t',website:'https://t.com'}))
 clients.updateWorkspaceClient.mockReset().mockResolvedValue({})
 clients.updateWorkspaceClientProfile.mockReset().mockResolvedValue({})
})
it('only queues the selected shortlist row ids after reviewing the batch',async()=>{
 mount()
 fireEvent.click(screen.getByRole('button',{name:'Run research on 2 selected'}))
 expect(invoke.mock.calls.some(call=>call[1].body.action==='research-batch-start')).toBe(false)
 fireEvent.click(screen.getByRole('button',{name:'Start batch'}))
 await waitFor(()=>expect(invoke).toHaveBeenCalledWith('workspace-client-shortlist',{body:{action:'research-batch-start',workspace_id:'workspace',client_id:'client',shortlist_podcast_ids:['row-one','row-two']}}))
})
it('shows saved progress and retries only the failed job',async()=>{
 invoke.mockResolvedValue({data:{jobs:[{id:'one',batch_id:'batch',podcast_name:'One',status:'completed',phase:'pitch',pitch:{subject:'Guest idea',body:'Saved email'}},{id:'two',batch_id:'batch',podcast_name:'Two',status:'failed',phase:'research',message:'Missing transcript'}]},error:null})
 mount()
 fireEvent.click(await screen.findByRole('button',{name:'Details'}))
 expect(await screen.findByText(/1 complete · 0 running · 0 waiting · 1 need attention/)).toBeInTheDocument()
 fireEvent.click(screen.getByRole('button',{name:'View draft'}))
 expect(screen.getByText('Saved email')).toBeInTheDocument()
 fireEvent.click(screen.getByRole('button',{name:'Close'}))
 fireEvent.click(screen.getByRole('button',{name:'Retry'}))
 await waitFor(()=>expect(invoke).toHaveBeenCalledWith('workspace-client-shortlist',{body:{action:'research-batch-retry',workspace_id:'workspace',client_id:'client',job_id:'two'}}))
})
it('keeps completed drafts accessible when the newest batch only has skipped shows',async()=>{
 invoke.mockResolvedValue({data:{jobs:[{id:'new',batch_id:'new-batch',podcast_name:'New show',status:'skipped',phase:'research'}, {id:'old',batch_id:'old-batch',podcast_name:'Earlier show',status:'completed',phase:'pitch',pitch:{subject:'Earlier subject',body:'Earlier draft'}}]},error:null})
 mount()
 fireEvent.click(await screen.findByRole('button',{name:'Details'}))
 const history=await screen.findByRole('combobox',{name:'Batch history'})
 fireEvent.change(history,{target:{value:'old-batch'}})
 expect(screen.getByText('Earlier show')).toBeInTheDocument()
 fireEvent.click(screen.getByRole('button',{name:'View draft'}))
 expect(screen.getByText('Earlier draft')).toBeInTheDocument()
})

it('refreshes shortlist data when background job status changes',async()=>{
 const client=new QueryClient({defaultOptions:{queries:{retry:false}}})
 const invalidate=vi.spyOn(client,'invalidateQueries')
 const job={id:'one',batch_id:'batch',podcast_name:'One',status:'queued',phase:'research'}
 invoke.mockResolvedValue({data:{jobs:[job]},error:null})
 mount(client)
 fireEvent.click(await screen.findByRole('button',{name:'Details'}))
 await screen.findByText('One')
 await waitFor(()=>expect(invalidate).toHaveBeenCalledWith({queryKey:['client-shortlist','workspace','client']}))
 invalidate.mockClear()
 invoke.mockResolvedValue({data:{jobs:[{...job,status:'completed',phase:'pitch'}]},error:null})
 await client.invalidateQueries({queryKey:['research-batches','workspace','client']})
 await waitFor(()=>expect(invalidate).toHaveBeenCalledWith({queryKey:['client-shortlist','workspace','client']}))
})

it('shows saved research while a show waits between stages',async()=>{
 invoke.mockResolvedValue({data:{jobs:[{id:'one',batch_id:'batch',podcast_name:'Show in progress',status:'queued',phase:'research',research_progress:{completed_stages:['podcast_profile','recent_episodes'],current_stage:'host_profile'}}]},error:null})
 mount()
 fireEvent.click(await screen.findByRole('button',{name:'Details'}))
 expect(await screen.findByText('2/6 research steps saved · Waiting for host identification')).toBeInTheDocument()
 expect(screen.getByRole('progressbar',{name:'Batch progress'})).toHaveAttribute('value',String(2/9))
 expect(screen.getByRole('progressbar',{name:'Research progress for Show in progress'})).toHaveAttribute('value','2')
})

it('says research is done when all six steps are saved but the pitch has not started',async()=>{
 invoke.mockResolvedValue({data:{jobs:[{id:'one',batch_id:'batch',podcast_name:'Show done',status:'queued',phase:'research',research_progress:{completed_stages:['podcast_profile','recent_episodes','host_profile','guest_patterns','guest_fit','pitch_angles'],current_stage:null}}]},error:null})
 mount()
 fireEvent.click(await screen.findByRole('button',{name:'Details'}))
 expect(await screen.findByText('Research steps done · Waiting to start the pitch')).toBeInTheDocument()
})

const blockedJob=(id:string,name:string)=>({id,batch_id:'batch',podcast_name:name,status:'failed',phase:'research',
 message:'This podcast is missing Client bio and positioning (client_bio) and Client website (client_website), which the podcast_research stage is set to require. Nothing was generated and no credit was spent.',
 research_progress:{status:'blocked',completed_stages:[],current_stage:null,missing_fields:['client_bio','client_website']}})

it('groups podcasts blocked on client info into one fix that saves the fields and retries them all',async()=>{
 clients.getWorkspaceClientDetail.mockResolvedValue(clientRecord())
 invoke.mockResolvedValue({data:{jobs:[blockedJob('one','One'),blockedJob('two','Two')]},error:null})
 mount()
 fireEvent.click(await screen.findByRole('button',{name:'Details'}))
 expect(await screen.findByText('2 podcasts are waiting on client info')).toBeInTheDocument()
 expect(screen.getAllByText(/waiting on the client’s bio and website/)).toHaveLength(2)
 expect(screen.queryByText(/client_bio/)).not.toBeInTheDocument()
 const save=await screen.findByRole('button',{name:'Save and retry 2 podcasts'})
 expect(save).toBeDisabled()
 fireEvent.change(screen.getByLabelText('Client bio and positioning'),{target:{value:'Operator and author'}})
 fireEvent.change(screen.getByLabelText('Client website'),{target:{value:'https://taylor.example'}})
 expect(screen.queryByLabelText('Client LinkedIn')).not.toBeInTheDocument()
 fireEvent.click(save)
 await waitFor(()=>expect(invoke).toHaveBeenCalledWith('workspace-client-shortlist',{body:{action:'research-batch-retry',workspace_id:'workspace',client_id:'client',job_id:'two'}}))
 expect(invoke).toHaveBeenCalledWith('workspace-client-shortlist',{body:{action:'research-batch-retry',workspace_id:'workspace',client_id:'client',job_id:'one'}})
 expect(clients.updateWorkspaceClientProfile).toHaveBeenCalledWith('workspace','client','Operator and author','2026-11-04T00:00:00.000Z')
 // The core update keeps every other field as the server last had it.
 expect(clients.updateWorkspaceClient).toHaveBeenCalledWith('workspace','client',expect.objectContaining({website:'https://taylor.example',notes:'keep me',name:'Taylor'}))
})

it('retries every failed job at once',async()=>{
 invoke.mockResolvedValue({data:{jobs:[{id:'one',batch_id:'batch',podcast_name:'One',status:'failed',phase:'research',message:'Timeout'},{id:'two',batch_id:'batch',podcast_name:'Two',status:'failed',phase:'research',message:'Timeout'}]},error:null})
 mount()
 fireEvent.click(await screen.findByRole('button',{name:'Details'}))
 fireEvent.click(await screen.findByRole('button',{name:'Retry all 2'}))
 await waitFor(()=>expect(invoke.mock.calls.filter(call=>call[1].body.action==='research-batch-retry')).toHaveLength(2))
})

it('warns before a batch starts when the client has no bio, LinkedIn or website',async()=>{
 clients.getWorkspaceClientDetail.mockResolvedValue(clientRecord({website:'https://t.com'}))
 mount()
 fireEvent.click(screen.getByRole('button',{name:'Run research on 2 selected'}))
 expect(await screen.findByText('This client has no bio and LinkedIn URL yet.')).toBeInTheDocument()
 expect(screen.getByRole('button',{name:'Start batch'})).toBeEnabled()
})

it('collapses a batch into one status line, and hides a finished batch until a new one starts',async()=>{
 window.localStorage.clear()
 const done=(id:string,status:string)=>({id,batch_id:'batch',podcast_name:id,status,phase:'pitch'})
 invoke.mockResolvedValue({data:{jobs:[done('a','completed'),done('b','completed'),done('c','failed'),done('d','skipped')]},error:null})
 const {unmount}=mount()
 const line=await screen.findByLabelText('Research status')
 expect(line).toHaveTextContent('Research:2 done· 1 failedRetry all· 1 skipped')
 expect(screen.queryByText('a')).not.toBeInTheDocument()
 fireEvent.click(screen.getByRole('button',{name:'Retry all'}))
 await waitFor(()=>expect(invoke).toHaveBeenCalledWith('workspace-client-shortlist',{body:{action:'research-batch-retry',workspace_id:'workspace',client_id:'client',job_id:'c'}}))
 fireEvent.click(screen.getByRole('button',{name:'Hide research status'}))
 expect(screen.queryByLabelText('Research status')).not.toBeInTheDocument()
 unmount()
 mount()
 expect(await screen.findByRole('button',{name:'Show research status'})).toBeInTheDocument()
 unmount()
 invoke.mockResolvedValue({data:{jobs:[{...done('e','queued'),batch_id:'next'},...[done('a','completed')]]},error:null})
 mount()
 expect(await screen.findByLabelText('Research status')).toHaveTextContent('1 waiting')
 expect(screen.queryByRole('button',{name:'Hide research status'})).not.toBeInTheDocument()
})
