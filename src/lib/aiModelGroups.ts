import type { PromptModelOption } from '@/services/workspaceCampaigns'
import type { WorkspaceAiKeysView, WorkspaceAiProvider } from '@/services/workspaceStaff'

/**
 * What a workspace runs on when it has chosen no default model. Mirrors
 * DEFAULT_CLAUDE_MODEL, DEFAULT_OPENAI_MODEL and DEFAULT_OPENROUTER_MODEL in
 * supabase/functions/_shared/textAi.ts, which every step ships with.
 */
export const SHIPPED_DEFAULT_MODEL: Record<WorkspaceAiProvider, string> = {
  anthropic: 'claude-sonnet-5-5',
  openai: 'gpt-4.1',
  openrouter: 'anthropic/claude-sonnet-5.5',
}

export interface ModelGroups {
  latest: PromptModelOption[]
  older: PromptModelOption[]
}

interface ParsedModel {
  family: string
  version: number[]
}

const CLAUDE_FAMILY = /^claude-(?:(\d+)-(?:(\d)-)?)?(fable|opus|sonnet|haiku)(?:-(\d{1,2})(?:-(\d{1,2}))?)?(?:-|$)/u
const OPENAI_MODEL = /^gpt-(\d+)(?:\.(\d+))?/u

/**
 * The family and version a model id names, or null when it follows no
 * pattern we know. Covers both Claude id styles: claude-sonnet-5-5 and the
 * older claude-3-5-haiku-20241022.
 */
export function parseModelId(id: string): ParsedModel | null {
  const claude = CLAUDE_FAMILY.exec(id)
  if (claude) {
    const [, oldMajor, oldMinor, family, major, minor] = claude
    // An old-style id carries its version before the family and a date after it.
    const version = oldMajor ? [Number(oldMajor), Number(oldMinor ?? 0)] : [Number(major ?? 0), Number(minor ?? 0)]
    return { family: `claude-${family}`, version }
  }
  const openai = OPENAI_MODEL.exec(id)
  // OpenAI has one line of models; its sizes (mini, nano) ship together.
  if (openai) return { family: 'gpt', version: [Number(openai[1]), Number(openai[2] ?? 0)] }
  return null
}

const FAMILY_ORDER = ['claude-fable', 'claude-opus', 'claude-sonnet', 'claude-haiku', 'gpt']

const compareVersions = (a: number[], b: number[]) => (a[0] - b[0]) || (a[1] - b[1])

/**
 * Splits the models the provider reports into the newest of each family and
 * everything else. Derived from the live list, so a new release moves into
 * "Latest" the day the provider lists it, with no change here.
 */
export function groupModels(models: PromptModelOption[]): ModelGroups {
  const newest = new Map<string, number[]>()
  for (const model of models) {
    const parsed = parseModelId(model.id)
    if (!parsed) continue
    const current = newest.get(parsed.family)
    if (!current || compareVersions(parsed.version, current) > 0) newest.set(parsed.family, parsed.version)
  }
  const latest: PromptModelOption[] = []
  const older: PromptModelOption[] = []
  for (const model of models) {
    const parsed = parseModelId(model.id)
    const top = parsed ? newest.get(parsed.family) : undefined
    if (parsed && top && compareVersions(parsed.version, top) === 0) latest.push(model)
    else older.push(model)
  }
  // Largest first, the order the provider ranks its own families in.
  const rank = (model: PromptModelOption) => {
    const index = FAMILY_ORDER.indexOf(parseModelId(model.id)?.family ?? '')
    return index === -1 ? FAMILY_ORDER.length : index
  }
  latest.sort((a, b) => rank(a) - rank(b))
  return { latest, older }
}

/** A model's display name from the provider's list, or its id when the list does not have it. */
export function modelLabel(models: PromptModelOption[], id: string): string {
  return models.find((model) => model.id === id)?.label ?? id
}

/** One cache entry for the AI provider card and the AI models card, which both read the provider. */
export const workspaceAiKeysQueryKey = (workspaceId: string) => ['workspace-ai-keys', workspaceId] as const

/** The provider the workspace runs on: the one chosen, or the first with a key, in the server's order. */
export function defaultAiProvider(view: WorkspaceAiKeysView | undefined): WorkspaceAiProvider | null {
  if (!view) return null
  if (view.default_provider) return view.default_provider
  if (view.anthropic.configured) return 'anthropic'
  if (view.openai?.configured) return 'openai'
  if (view.openrouter?.configured) return 'openrouter'
  return null
}
