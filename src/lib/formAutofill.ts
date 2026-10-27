/**
 * Spread onto a text field that is not a sign-in credential. Password
 * managers guess at forms, and 1Password offered a login for "Agency name
 * shown to clients" on Settings. autoComplete stops the browser's own
 * autofill; the data attributes are how 1Password and LastPass are told to
 * leave a field alone.
 */
export const notACredentialField = {
  autoComplete: 'off',
  'data-1p-ignore': 'true',
  'data-lpignore': 'true',
} as const
