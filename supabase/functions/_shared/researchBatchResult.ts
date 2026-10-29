/** A successful HTTP response still needs a valid hand-off before the queue may advance. */
export function researchBatchResult(phase: string, result: Record<string, unknown>): Record<string, unknown> {
  if (result.batch_skipped === true) return {status:'skipped'}
  if (phase === 'pitch') {
    if (result.pitch_continue_required === true) return {status:'queued'}
    const pitch = result.pitch as { body?: unknown; subject?: unknown } | undefined
    if (!pitch || typeof pitch.body !== 'string' || !pitch.body.trim() || typeof pitch.subject !== 'string') throw new Error('The pitch response was incomplete')
    return { status: 'completed', pitch }
  }
  const progress = result.research_progress as { status?: string } | undefined
  if (result.continue_required === true) {
    if (!progress || typeof result.continue_token !== 'string' || !result.continue_token) throw new Error('The research continuation was incomplete')
    return { status: 'queued', continue_token: result.continue_token }
  }
  if (progress?.status !== 'completed') throw new Error('Research did not complete')
  return { status: 'queued', phase: 'pitch', continue_token: null }
}
