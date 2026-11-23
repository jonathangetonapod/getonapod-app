import type { PromptModelOption } from '@/services/workspaceCampaigns'

interface ModelOptionsProps {
  models: PromptModelOption[]
  /** Appends the model id to each label, for screens where the id matters. */
  showId?: boolean
}

const optionLabel = (model: PromptModelOption, showId: boolean) =>
  showId && model.label !== model.id ? `${model.label} — ${model.id}` : model.label

/**
 * The <option>s for a model picker.
 *
 * A key that reaches one vendor (Claude, OpenAI) gets a flat list. An
 * OpenRouter key reaches hundreds of models, so they are grouped by vendor in
 * the order the server sent them (OpenRouter's routers first).
 */
export const ModelOptions = ({ models, showId = false }: ModelOptionsProps) => {
  if (!models.some((model) => model.group)) {
    return <>{models.map((model) => <option key={model.id} value={model.id}>{optionLabel(model, showId)}</option>)}</>
  }
  const groups = new Map<string, PromptModelOption[]>()
  for (const model of models) {
    const group = model.group || 'Other'
    groups.set(group, [...(groups.get(group) ?? []), model])
  }
  return (
    <>
      {[...groups].map(([group, members]) => (
        <optgroup key={group} label={`${group} (${members.length})`}>
          {members.map((model) => <option key={model.id} value={model.id}>{optionLabel(model, showId)}</option>)}
        </optgroup>
      ))}
    </>
  )
}
