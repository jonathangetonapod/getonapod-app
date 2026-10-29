export class BatchYield extends Error {}
export class BatchCheckpointError extends Error {}

/** Replays durable outputs, allows one new model call, then yields before the next. */
export function batchPromptRunner(
 outputs: string[],
 save: (outputs: string[]) => Promise<void>,
) {
 let cursor = 0
 let called = false
 return async (call: () => Promise<string>): Promise<string> => {
   const index = cursor++
   if (typeof outputs[index] === 'string') return outputs[index]
   if (called) throw new BatchYield('Continue pitch on a fresh invocation')
   called = true
   const result = await call()
   outputs[index] = result
   try { await save([...outputs]) } catch { throw new BatchCheckpointError('Could not save model output') }
   return result
 }
}

export function researchBatchRecovery(runId: string | null, progress: {status?:string;started_at?:string} | null): 'continue'|'pitch'|'skip' {
 if (runId && progress?.started_at && progress.started_at !== runId) return 'skip'
 if (progress?.status === 'completed') return runId && progress.started_at === runId ? 'pitch' : 'skip'
 return 'continue'
}
