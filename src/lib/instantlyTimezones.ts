/**
 * The sending timezones Instantly accepts, and how to reach one from a zone it
 * does not carry.
 *
 * Their campaign schema pins an enum rather than taking any IANA name, and it
 * omits some of the most common ones — America/New_York and America/Los_Angeles
 * are both absent. A browser reports its own zone, that zone is usually one of
 * the missing ones, and sending it produced a campaign quietly scheduled
 * somewhere else. Substituting to a zone on the same clock is the honest
 * repair; the label says which city Instantly is actually using.
 */

export const INSTANTLY_TIMEZONES = [
  'Etc/GMT+12', 'Etc/GMT+11', 'Etc/GMT+10', 'America/Anchorage', 'America/Dawson',
  'America/Creston', 'America/Chihuahua', 'America/Boise', 'America/Belize',
  'America/Chicago', 'America/Bahia_Banderas', 'America/Regina', 'America/Bogota',
  'America/Detroit', 'America/Indiana/Marengo', 'America/Caracas', 'America/Asuncion',
  'America/Glace_Bay', 'America/Campo_Grande', 'America/Anguilla', 'America/Santiago',
  'America/St_Johns', 'America/Sao_Paulo', 'America/Argentina/La_Rioja',
  'America/Araguaina', 'America/Godthab', 'America/Montevideo', 'America/Bahia',
  'America/Noronha', 'America/Scoresbysund', 'Atlantic/Cape_Verde', 'Africa/Casablanca',
  'America/Danmarkshavn', 'Europe/Isle_of_Man', 'Atlantic/Canary', 'Africa/Abidjan',
  'Arctic/Longyearbyen', 'Europe/Belgrade', 'Africa/Ceuta', 'Europe/Sarajevo',
  'Africa/Algiers', 'Africa/Windhoek', 'Asia/Nicosia', 'Asia/Beirut', 'Africa/Cairo',
  'Asia/Damascus', 'Europe/Bucharest', 'Africa/Blantyre', 'Europe/Helsinki',
  'Europe/Istanbul', 'Asia/Jerusalem', 'Africa/Tripoli', 'Asia/Amman', 'Asia/Baghdad',
  'Europe/Kaliningrad', 'Asia/Aden', 'Africa/Addis_Ababa', 'Europe/Kirov',
  'Europe/Astrakhan', 'Asia/Tehran', 'Asia/Dubai', 'Asia/Baku', 'Indian/Mahe',
  'Asia/Tbilisi', 'Asia/Yerevan', 'Asia/Kabul', 'Antarctica/Mawson',
  'Asia/Yekaterinburg', 'Asia/Karachi', 'Asia/Kolkata', 'Asia/Colombo',
  'Asia/Kathmandu', 'Antarctica/Vostok', 'Asia/Dhaka', 'Asia/Rangoon',
  'Antarctica/Davis', 'Asia/Novokuznetsk', 'Asia/Hong_Kong', 'Asia/Krasnoyarsk',
  'Asia/Brunei', 'Australia/Perth', 'Asia/Taipei', 'Asia/Choibalsan', 'Asia/Irkutsk',
  'Asia/Dili', 'Asia/Pyongyang', 'Australia/Adelaide', 'Australia/Darwin',
  'Australia/Brisbane', 'Australia/Melbourne', 'Antarctica/DumontDUrville',
  'Australia/Currie', 'Asia/Chita', 'Antarctica/Macquarie', 'Asia/Sakhalin',
  'Pacific/Auckland', 'Etc/GMT-12', 'Pacific/Fiji', 'Asia/Anadyr', 'Asia/Kamchatka',
  'Etc/GMT-13', 'Pacific/Apia',
] as const

const TIMEZONE_SUBSTITUTES: Record<string, string> = {
  'America/New_York': 'America/Detroit',
  'America/Toronto': 'America/Detroit',
  'America/Los_Angeles': 'America/Dawson',
  'America/Vancouver': 'America/Dawson',
  'America/Denver': 'America/Boise',
  'America/Phoenix': 'America/Creston',
  'America/Lima': 'America/Bogota',
  'Europe/London': 'Europe/Isle_of_Man',
  'Europe/Dublin': 'Europe/Isle_of_Man',
  'Europe/Paris': 'Arctic/Longyearbyen',
  'Europe/Berlin': 'Arctic/Longyearbyen',
  'Europe/Madrid': 'Arctic/Longyearbyen',
  'Europe/Amsterdam': 'Arctic/Longyearbyen',
  'Australia/Sydney': 'Australia/Melbourne',
  'Asia/Singapore': 'Asia/Brunei',
  'Asia/Tokyo': 'Asia/Dili',
}

const SUPPORTED = new Set<string>(INSTANTLY_TIMEZONES)

/**
 * The clock a listed zone actually keeps, for our own wall-time arithmetic.
 *
 * Instantly's list is ordered by offset and its Pacific slot is America/Dawson,
 * but the Yukon dropped daylight saving in 2020 and the IANA rules now keep
 * Dawson on UTC-7 all year. Reading Dawson literally put every Pacific
 * campaign's window an hour early for four months a year, in silence.
 */
const CLOCK_ZONES: Record<string, string> = {
  'America/Dawson': 'America/Los_Angeles',
}

/** The IANA zone to compute wall time in for an Instantly zone. */
export function clockZoneFor(timezone: string): string {
  return CLOCK_ZONES[timezone] ?? timezone
}

const ZONE_NOTES: Record<string, string> = {
  'America/Dawson': 'Pacific Time',
  'America/Detroit': 'Eastern Time',
  'America/Boise': 'Mountain Time',
  'America/Creston': 'Arizona, no daylight saving',
  'Europe/Isle_of_Man': 'UK and Ireland',
  'Arctic/Longyearbyen': 'Central European Time',
}

/** What to show for a zone in a picker: the name, and the clock it stands for. */
export function instantlyTimezoneLabel(timezone: string): string {
  const name = timezone.replace(/_/g, ' ')
  const note = ZONE_NOTES[timezone]
  return note ? `${name} (${note})` : name
}

export function isInstantlyTimezone(timezone: string): boolean {
  return SUPPORTED.has(timezone)
}

/**
 * A zone Instantly will accept. Falls back to US Eastern rather than to the
 * viewer's own clock, because a campaign scheduled in the wrong zone emails
 * hosts at the wrong hour and nothing on screen would say so.
 */
export function toInstantlyTimezone(timezone: string | null | undefined): string {
  const candidate = timezone?.trim()
  if (candidate && SUPPORTED.has(candidate)) return candidate
  if (candidate && TIMEZONE_SUBSTITUTES[candidate]) return TIMEZONE_SUBSTITUTES[candidate]
  return 'America/Detroit'
}

/** The viewer's own zone when Instantly carries it, or the nearest it does. */
export function defaultInstantlyTimezone(): string {
  try {
    return toInstantlyTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone)
  } catch {
    return 'America/Detroit'
  }
}
