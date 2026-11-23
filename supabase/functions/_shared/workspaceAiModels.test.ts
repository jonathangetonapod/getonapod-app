import { assertEquals } from 'jsr:@std/assert@1'
import {
  isAiModelSettingId,
  loadWorkspaceAiModels,
  NO_WORKSPACE_AI_MODELS,
  stageModel,
  stepModel,
  thinkingFields,
} from './workspaceAiModels.ts'

// deno-lint-ignore no-explicit-any
const fakeAdmin = (result: { data?: unknown; error?: unknown } | Error): any => ({
  from: (table: string) => {
    assertEquals(table, 'workspace_ai_models')
    return {
      select: () => ({
        eq: () => result instanceof Error ? Promise.reject(result) : Promise.resolve(result),
      }),
    }
  },
})

Deno.test('an untouched workspace runs every step on its shipped model', () => {
  assertEquals(stepModel(NO_WORKSPACE_AI_MODELS, 'fit_scoring'), 'claude-sonnet-5-5')
  assertEquals(stepModel(NO_WORKSPACE_AI_MODELS, 'profile_drafts', 'env-model'), 'env-model')
  assertEquals(stageModel(NO_WORKSPACE_AI_MODELS, null, 'claude-sonnet-5-5'), 'claude-sonnet-5-5')
})

Deno.test('a step choice beats the workspace default, which beats shipped', () => {
  const models = { defaultModel: 'claude-haiku-5-5', steps: { fit_scoring: 'claude-opus-5-5' } }
  assertEquals(stepModel(models, 'fit_scoring'), 'claude-opus-5-5')
  assertEquals(stepModel(models, 'autopilot'), 'claude-haiku-5-5')
  assertEquals(stageModel(models, 'claude-opus-5-5', 'claude-sonnet-5-5'), 'claude-opus-5-5')
  // An empty stage choice is no choice: it follows the workspace default.
  assertEquals(stageModel(models, '', 'claude-sonnet-5-5'), 'claude-haiku-5-5')
  assertEquals(stageModel(models, undefined, 'claude-sonnet-5-5'), 'claude-haiku-5-5')
})

Deno.test('thinking follows the model rather than staying on Sonnet 5.5 settings', () => {
  assertEquals(thinkingFields('claude-sonnet-5-5'), { thinking: { type: 'between_tools' } })
  assertEquals(thinkingFields('claude-opus-5-5'), {})
  assertEquals(thinkingFields('claude-sonnet-5'), { thinking: { type: 'disabled' } })
})

Deno.test('the loader maps rows and ignores unknown or malformed ones', async () => {
  const models = await loadWorkspaceAiModels(fakeAdmin({
    data: [
      { setting_id: 'default', model: 'claude-haiku-5-5' },
      { setting_id: 'pitch_fact_check', model: 'claude-opus-5-5' },
      { setting_id: 'not_a_step', model: 'claude-opus-5-5' },
      { setting_id: 'autopilot', model: 'bad model id!' },
    ],
    error: null,
  }), 'workspace')
  assertEquals(models, { defaultModel: 'claude-haiku-5-5', steps: { pitch_fact_check: 'claude-opus-5-5' } })
})

Deno.test('a failed settings read falls back to shipped defaults instead of stopping the AI step', async () => {
  const warn = console.warn
  console.warn = () => {}
  try {
    assertEquals(await loadWorkspaceAiModels(fakeAdmin({ data: null, error: { message: 'down' } }), 'w'), { defaultModel: null, steps: {} })
    assertEquals(await loadWorkspaceAiModels(fakeAdmin(new Error('network')), 'w'), { defaultModel: null, steps: {} })
  } finally {
    console.warn = warn
  }
})

Deno.test('only known setting ids are accepted', () => {
  assertEquals(isAiModelSettingId('default'), true)
  assertEquals(isAiModelSettingId('host_discovery'), true)
  assertEquals(isAiModelSettingId('write_email'), false)
  assertEquals(isAiModelSettingId(42), false)
})

Deno.test('OpenRouter model ids survive the loader, and junk still does not', async () => {
  const models = await loadWorkspaceAiModels(fakeAdmin({
    data: [
      { setting_id: 'default', model: '~anthropic/claude-sonnet-latest' },
      { setting_id: 'fit_scoring', model: 'meta-llama/llama-3.3-70b-instruct:free' },
      { setting_id: 'autopilot', model: 'openai/gpt-4.1 ; drop' },
      { setting_id: 'search_queries', model: 'x/'.padEnd(129, 'y') },
    ],
    error: null,
  }), 'w')
  assertEquals(models, {
    defaultModel: '~anthropic/claude-sonnet-latest',
    steps: { fit_scoring: 'meta-llama/llama-3.3-70b-instruct:free' },
  })
  // OpenRouter ids carry no Anthropic thinking setting; the transport picks reasoning.
  assertEquals(thinkingFields('anthropic/claude-sonnet-5.5'), {})
})
