import { expect, it } from 'vitest'
import { researchBatchResult } from './researchBatchResult'
it('persists the continuation identity without advancing to pitch', () => {
 expect(researchBatchResult('research',{continue_required:true,continue_token:'run-id',research_progress:{status:'running'}})).toEqual({status:'queued',continue_token:'run-id'})
})
it('only completed research advances to pitch', () => {
 expect(researchBatchResult('research',{research_progress:{status:'completed'}})).toEqual({status:'queued',phase:'pitch',continue_token:null})
 expect(()=>researchBatchResult('research',{research_progress:{status:'blocked'}})).toThrow()
 expect(()=>researchBatchResult('research',{continue_required:true,research_progress:{status:'running'}})).toThrow()
})
it('only a valid saved draft finishes the batch job', () => {
 const pitch={subject:'Guest idea',body:'An episode idea',follow_up_1_body:'Another angle'}
 expect(researchBatchResult('pitch',{pitch})).toEqual({status:'completed',pitch})
 expect(()=>researchBatchResult('pitch',{})).toThrow()
})
