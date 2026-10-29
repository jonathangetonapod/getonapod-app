import { expect, it, vi } from 'vitest'
import { BatchYield, BatchCheckpointError, batchPromptRunner } from './researchBatchCheckpoint'
it('resumes durable model outputs after a lost response without regenerating them',async()=>{
 let persisted:string[]=[]
 const first=vi.fn(async()=> 'draft')
 const second=vi.fn(async()=> 'audit')
 const run=batchPromptRunner([],async values=>{persisted=values})
 expect(await run(first)).toBe('draft')
 await expect(run(second)).rejects.toBeInstanceOf(BatchYield)
 expect(second).not.toHaveBeenCalled()
 const resume=batchPromptRunner(persisted,async values=>{persisted=values})
 expect(await resume(first)).toBe('draft')
 expect(first).toHaveBeenCalledTimes(1)
 expect(await resume(second)).toBe('audit')
 expect(persisted).toEqual(['draft','audit'])
})
it('does not report an unpersisted output as successful',async()=>{
 const run=batchPromptRunner([],async()=>{throw new Error('database unavailable')})
 await expect(run(async()=> 'draft')).rejects.toBeInstanceOf(BatchCheckpointError)
})
it('reconciles a committed research result after its response is lost',async()=>{
 const {researchBatchRecovery}=await import('./researchBatchCheckpoint')
 expect(researchBatchRecovery('run-one',{status:'completed',started_at:'run-one'})).toBe('pitch')
 expect(researchBatchRecovery(null,{status:'completed',started_at:'manual-run'})).toBe('skip')
 expect(researchBatchRecovery('run-one',{status:'running',started_at:'new-run'})).toBe('skip')
 expect(researchBatchRecovery('run-one',{status:'failed',started_at:'run-one'})).toBe('continue')
})
