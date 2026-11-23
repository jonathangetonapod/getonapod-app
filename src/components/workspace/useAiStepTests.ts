import { useCallback, useRef, useState } from 'react'
import { testWorkspaceAiStep, type AiStepTestResult } from '@/services/workspaceCampaigns'

export interface AiStepTestState {
  status: 'running' | 'done' | 'error'
  result?: AiStepTestResult
  /** Set when the test itself could not run (not when the model failed it). */
  error?: string
}

/** How many step tests run at once for "Test all": enough to be quick, few enough not to trip provider rate limits. */
const CONCURRENCY = 3

/**
 * Per-step test results for the AI models card. A result describes the model
 * the step used when it ran, so changing a choice clears the results it no
 * longer describes.
 */
export const useAiStepTests = (workspaceId: string) => {
  const [tests, setTests] = useState<Record<string, AiStepTestState>>({})
  // Bumped on clear, so a test still in flight for an old choice is dropped.
  const generation = useRef(0)

  const runOne = useCallback(async (stepId: string) => {
    const started = generation.current
    setTests((current) => ({ ...current, [stepId]: { status: 'running' } }))
    let next: AiStepTestState
    try {
      next = { status: 'done', result: await testWorkspaceAiStep(workspaceId, stepId) }
    } catch (error) {
      next = { status: 'error', error: error instanceof Error ? error.message : 'The model test could not be run.' }
    }
    if (generation.current === started) setTests((current) => ({ ...current, [stepId]: next }))
  }, [workspaceId])

  const runAll = useCallback(async (stepIds: string[]) => {
    const queue = [...stepIds]
    const worker = async () => {
      for (let next = queue.shift(); next; next = queue.shift()) await runOne(next)
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker))
  }, [runOne])

  const clear = useCallback((stepIds?: string[]) => {
    generation.current += 1
    setTests((current) => {
      if (!stepIds) return {}
      const kept = { ...current }
      for (const id of stepIds) delete kept[id]
      return kept
    })
  }, [])

  const running = Object.values(tests).some((test) => test.status === 'running')
  return { tests, runOne, runAll, clear, running }
}
