import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, expect, it, vi } from 'vitest'
import { ShortlistResearchBatch } from './ShortlistResearchBatch'
const invoke = vi.hoisted(()=>vi.fn())
vi.mock('@/lib/supabase',()=>({supabase:{functions:{invoke}}}))
vi.mock('sonner',()=>({toast:{error:vi.fn()}}))
function mount(client = new QueryClient({defaultOptions:{queries:{retry:false}}})){return render(<QueryClientProvider client={client}><ShortlistResearchBatch workspaceId="workspace" clientId="client" selectedIds={['row-one','row-two']}/></QueryClientProvider>)}
beforeEach(()=>{invoke.mockReset();invoke.mockResolvedValue({data:{jobs:[]},error:null})})
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
 expect(await screen.findByText('2/6 research steps saved · Waiting for host identification')).toBeInTheDocument()
 expect(screen.getByRole('progressbar',{name:'Batch progress'})).toHaveAttribute('value',String(2/9))
 expect(screen.getByRole('progressbar',{name:'Research progress for Show in progress'})).toHaveAttribute('value','2')
})
