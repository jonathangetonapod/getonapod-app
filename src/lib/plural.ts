/**
 * "1 view", "12 views". Counts are formatted for the reader's locale.
 * The plural form defaults to the singular plus "s".
 */
export function plural(count: number | null | undefined, singular: string, pluralForm = `${singular}s`): string {
  const value = Number(count) || 0
  return `${new Intl.NumberFormat().format(value)} ${value === 1 ? singular : pluralForm}`
}
