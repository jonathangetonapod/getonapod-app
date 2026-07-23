import { describe, expect, it } from 'vitest'
import { validateOnboardingDefinition } from './workspaceOnboarding.ts'

const question = (id: string) => ({
  id,
  type: 'short_text',
  label: 'Question',
  description: '',
  required: false,
  placeholder: '',
  mapping: null,
})

const definition = (sections: Array<{ id: string; questions: ReturnType<typeof question>[] }>) => ({
  schema_version: 1,
  intro_title: 'Welcome',
  intro_body: 'Tell us about yourself.',
  completion_message: 'Thank you.',
  sections: sections.map((section) => ({
    ...section,
    title: 'Section',
    description: '',
  })),
})

describe('validateOnboardingDefinition', () => {
  it('allows a section and question to share an id because their namespaces are independent', () => {
    expect(validateOnboardingDefinition(definition([
      { id: 'topics', questions: [question('topics')] },
      { id: 'goals', questions: [question('goals')] },
    ]))).toMatchObject({ schema_version: 1 })
  })

  it('still rejects duplicate section and duplicate question ids', () => {
    expect(() => validateOnboardingDefinition(definition([
      { id: 'duplicate', questions: [question('first')] },
      { id: 'duplicate', questions: [question('second')] },
    ]))).toThrow('section ids must be unique')

    expect(() => validateOnboardingDefinition(definition([
      { id: 'first', questions: [question('duplicate')] },
      { id: 'second', questions: [question('duplicate')] },
    ]))).toThrow('question ids must be unique')
  })
})
