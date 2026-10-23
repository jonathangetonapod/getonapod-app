import type { OnboardingDefinition } from '@/services/workspaceOnboarding'

export interface StarterOnboardingTemplate {
  name: string
  description: string
  definition: OnboardingDefinition
  reminder_days: number[]
}

export const STARTER_TEMPLATE_NAME = 'Starter client intake'

/*
 * A form a new agency can send on day one. The builder used to open on one
 * blank question, so the first invite waited on writing a form from scratch.
 * These are the details almost every podcast booking agency asks for, mapped
 * to the client record wherever the template schema allows, so approving the
 * answers fills the client in. Fixed ids keep it deterministic; the builder
 * mints random ids only for questions added later.
 */
export const starterOnboardingTemplate = (workspaceName: string): StarterOnboardingTemplate => {
  const agency = workspaceName.trim() || 'our team'
  return {
    name: STARTER_TEMPLATE_NAME,
    description: 'Name, bio, links, headshot, and speaking topics.',
    reminder_days: [],
    definition: {
      schema_version: 1,
      intro_title: 'Welcome. Let’s get your details',
      intro_body: 'A few short questions so we can introduce you well. Your progress saves as you go, and you can come back with this secure link.',
      completion_message: `Thank you. ${agency} will review your answers within 2 business days and follow up if anything needs clarification.`,
      sections: [
        {
          id: 'about_you',
          title: 'About you',
          description: '',
          questions: [
            {
              id: 'full_name',
              type: 'short_text',
              label: 'Your full name',
              description: 'As you would like it introduced.',
              required: true,
              placeholder: 'Jane Smith',
              mapping: 'client.contact_person',
            },
            {
              id: 'short_bio',
              type: 'long_text',
              label: 'Short bio',
              description: 'Two or three sentences a host could read aloud.',
              required: true,
              placeholder: '',
              mapping: 'client.bio',
            },
            {
              id: 'headshot',
              type: 'image_upload',
              label: 'Headshot',
              description: 'A clear, recent photo. PNG, JPEG, or WebP.',
              required: false,
              placeholder: '',
              mapping: null,
            },
          ],
        },
        {
          id: 'links',
          title: 'Your links',
          description: '',
          questions: [
            {
              id: 'website',
              type: 'url',
              label: 'Website',
              description: '',
              required: false,
              placeholder: 'https://',
              mapping: 'client.website',
            },
            {
              id: 'linkedin',
              type: 'url',
              label: 'LinkedIn profile',
              description: '',
              required: false,
              placeholder: 'https://www.linkedin.com/in/',
              mapping: 'client.linkedin_url',
            },
            {
              id: 'booking_link',
              type: 'url',
              label: 'Booking link',
              description: 'Where a host can schedule time with you, if you have one.',
              required: false,
              placeholder: 'https://',
              mapping: 'client.calendar_link',
            },
          ],
        },
        {
          id: 'topics',
          title: 'What you talk about',
          description: '',
          questions: [
            {
              id: 'speaking_topics',
              type: 'long_text',
              label: 'Topics you can speak on',
              description: 'List the subjects you know well, one per line.',
              required: true,
              placeholder: '',
              mapping: null,
            },
          ],
        },
      ],
    },
  }
}
