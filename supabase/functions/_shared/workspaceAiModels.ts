import type { createAdminClient } from './workspaceAuth.ts'
import { DEFAULT_CLAUDE_MODEL } from './textAi.ts'
import { thinkingForModel } from './promptModels.ts'

/**
 * Which model each AI step runs on, chosen per workspace on the Integrations
 * page.
 *
 * Resolution, most specific first:
 *   1. the step's own choice (for a research/pitch stage, the model saved on
 *      workspace_research_prompts; for every other step, a row here),
 *   2. the workspace default (the 'default' row here),
 *   3. the step's shipped default.
 *
 * Nothing is stored until someone chooses, so an untouched workspace runs
 * exactly as it did before this existed. NULL/absent always means "follow the
 * next level", never "freeze today's default".
 */

/** Steps whose model was hardcoded before; the research/pitch stages live on workspace_research_prompts. */
export const AI_MODEL_STEP_IDS = [
  'research_structure',
  'pitch_fact_check',
  'host_discovery',
  'fit_scoring',
  'search_queries',
  'prospect_dashboard',
  'autopilot',
  'profile_drafts',
] as const

export type AiModelStepId = typeof AI_MODEL_STEP_IDS[number]

/** 'default' is the workspace-wide model every step falls back to. */
export const AI_MODEL_SETTING_IDS = ['default', ...AI_MODEL_STEP_IDS] as const
export type AiModelSettingId = typeof AI_MODEL_SETTING_IDS[number]

export function isAiModelSettingId(value: unknown): value is AiModelSettingId {
  return typeof value === 'string' && (AI_MODEL_SETTING_IDS as readonly string[]).includes(value)
}

export interface WorkspaceAiModels {
  /** The workspace default, or null to use each step's shipped default. */
  defaultModel: string | null
  /** Per-step choices; a step absent here follows the workspace default. */
  steps: Partial<Record<AiModelStepId, string>>
}

export const NO_WORKSPACE_AI_MODELS: WorkspaceAiModels = Object.freeze({ defaultModel: null, steps: {} }) as WorkspaceAiModels

const MODEL_SHAPE = /^[a-zA-Z0-9._-]{1,128}$/u

/**
 * Reads the workspace's model choices.
 *
 * Never throws: a failed read must not stop research or pitching, so it falls
 * back to the shipped defaults (what an untouched workspace runs anyway) and
 * logs once.
 */
export async function loadWorkspaceAiModels(
  admin: ReturnType<typeof createAdminClient>,
  workspaceId: string,
): Promise<WorkspaceAiModels> {
  try {
    const { data, error } = await admin
      .from('workspace_ai_models')
      .select('setting_id, model')
      .eq('workspace_id', workspaceId)
    if (error) throw error
    const result: WorkspaceAiModels = { defaultModel: null, steps: {} }
    for (const row of (data ?? []) as Array<{ setting_id?: unknown; model?: unknown }>) {
      if (!isAiModelSettingId(row.setting_id)) continue
      if (typeof row.model !== 'string' || !MODEL_SHAPE.test(row.model)) continue
      if (row.setting_id === 'default') result.defaultModel = row.model
      else result.steps[row.setting_id] = row.model
    }
    return result
  } catch (_error) {
    console.warn('[workspaceAiModels] Model settings unavailable; using shipped defaults')
    return { defaultModel: null, steps: {} }
  }
}

/** The model a hardcoded step runs on: its own choice, else the workspace default, else shipped. */
export function stepModel(
  models: WorkspaceAiModels,
  step: AiModelStepId,
  shipped: string = DEFAULT_CLAUDE_MODEL,
): string {
  return models.steps[step] ?? models.defaultModel ?? shipped
}

/** The model a research/pitch stage runs on: its saved choice, else the workspace default, else shipped. */
export function stageModel(
  models: WorkspaceAiModels,
  stageChoice: string | null | undefined,
  shipped: string,
): string {
  return (stageChoice || null) ?? models.defaultModel ?? shipped
}

/**
 * The `thinking` field to send with a model, or nothing.
 *
 * Steps used to send Sonnet 5.5's `between_tools` unconditionally; any other
 * model rejects that value, so the setting has to follow the model chosen.
 */
export function thinkingFields(model: string): { thinking?: { type: 'disabled' | 'between_tools' } } {
  const thinking = thinkingForModel(model)
  return thinking ? { thinking } : {}
}
