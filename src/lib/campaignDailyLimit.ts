import type { InstantlySendingAccount } from '@/services/workspaceCampaigns'

/**
 * A campaign's daily limit is new hosts per day. Instantly gets that as
 * daily_max_leads, and a total email cap of three times it (the pitch and two
 * follow-ups) as daily_limit, so follow-ups always have room.
 */
export const EMAILS_PER_HOST = 3
export const NEW_HOSTS_PER_DAY_RANGE = { min: 1, max: 1000 } as const
export const DEFAULT_NEW_HOSTS_PER_DAY = 30

export interface MailboxCapacity {
  mailboxes: number
  /** Emails a day the mailboxes can send between them; 0 when none report a limit. */
  emailsPerDay: number
}

export interface NewHostsPerDayNote {
  text: string
  overCapacity: boolean
}

/** The typed value as a number of hosts, or null while it is not one. */
export const wholeNumberOrNull = (value: string): number | null => {
  if (value.trim() === '') return null
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= NEW_HOSTS_PER_DAY_RANGE.min && parsed <= NEW_HOSTS_PER_DAY_RANGE.max
    ? parsed
    : null
}

/** Only connected mailboxes send, so only they count. */
export const mailboxCapacity = (
  accounts: InstantlySendingAccount[],
  selected: Set<string>,
): MailboxCapacity => {
  const active = accounts.filter((account) => account.status === 1 && selected.has(account.email))
  return {
    mailboxes: active.length,
    emailsPerDay: active.reduce((total, account) => total + (account.daily_limit || 0), 0),
  }
}

/** What the mailboxes can carry with follow-ups, never more than the usual 30. */
export const suggestedNewHostsPerDay = (capacity: MailboxCapacity): number => {
  if (capacity.emailsPerDay <= 0) return DEFAULT_NEW_HOSTS_PER_DAY
  return Math.min(DEFAULT_NEW_HOSTS_PER_DAY, Math.max(1, Math.floor(capacity.emailsPerDay / EMAILS_PER_HOST)))
}

const selectedMailboxes = (count: number) => (count === 1 ? 'The selected mailbox' : `The ${count} selected mailboxes`)
const hostWord = (count: number) => (count === 1 ? '1 new host' : `${count.toLocaleString()} new hosts`)

export const newHostsPerDayNote = (newHosts: number | null, capacity: MailboxCapacity): NewHostsPerDayNote | null => {
  if (newHosts === null) return null
  const emails = newHosts * EMAILS_PER_HOST
  const reach = `Up to ${hostWord(newHosts)} a day, about ${emails.toLocaleString()} emails with follow-ups.`
  if (capacity.emailsPerDay <= 0) {
    return { text: `${reach} Each mailbox also has its own daily cap in Instantly.`, overCapacity: false }
  }
  const mailboxes = `${selectedMailboxes(capacity.mailboxes)} can send ${capacity.emailsPerDay.toLocaleString()} a day`
  if (emails <= capacity.emailsPerDay) return { text: `${reach} ${mailboxes}.`, overCapacity: false }
  return {
    text: `${reach} ${mailboxes}, so Instantly will send less than this. Lower it to ${suggestedNewHostsPerDay(capacity)} or add mailboxes.`,
    overCapacity: true,
  }
}
