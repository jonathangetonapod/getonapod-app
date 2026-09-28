/**
 * Google Calendar URL Generator
 *
 * Creates a Google Calendar "Add Event" URL that opens in a new tab
 * with event details pre-filled.
 */

import { googleCalendarUrl } from '@/lib/calendarLinks'

interface CalendarEventDetails {
  title: string
  startTime: Date
  endTime: Date
  description?: string
  location?: string
  /** Set when the source was a calendar day; the event is then all-day on it. */
  day?: string
}

const DAY_ONLY = /^\d{4}-\d{2}-\d{2}$/u

/**
 * Formats a date for Google Calendar URL
 * Format: YYYYMMDDTHHmmssZ (UTC)
 */
function formatDateForGoogleCalendar(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
}

/**
 * Generates a Google Calendar URL for adding an event
 */
export function generateGoogleCalendarUrl(event: CalendarEventDetails): string {
  if (event.day) {
    const allDay = googleCalendarUrl({
      title: event.title,
      day: event.day,
      details: event.description,
      location: event.location,
    })
    if (allDay) return allDay
  }

  const baseUrl = 'https://calendar.google.com/calendar/render'

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${formatDateForGoogleCalendar(event.startTime)}/${formatDateForGoogleCalendar(event.endTime)}`,
  })

  if (event.description) {
    params.append('details', event.description)
  }

  if (event.location) {
    params.append('location', event.location)
  }

  return `${baseUrl}?${params.toString()}`
}

/**
 * Opens Google Calendar in a new tab with pre-filled event details
 */
export function openGoogleCalendar(event: CalendarEventDetails): void {
  const url = generateGoogleCalendarUrl(event)
  window.open(url, '_blank', 'noopener,noreferrer')
}

/**
 * Creates calendar event details from a podcast booking
 */
export function createCalendarEventFromBooking(booking: {
  podcast_name: string
  recording_date?: string | null
  scheduled_date?: string | null
  episode_url?: string | null
  podcast_url?: string | null
  host_name?: string | null
  notes?: string | null
}): CalendarEventDetails | null {
  // Use recording_date or fall back to scheduled_date
  const eventDate = booking.recording_date || booking.scheduled_date

  if (!eventDate) {
    return null
  }

  // Booking dates are DATE columns. Parsing one with new Date() gives UTC
  // midnight, which west of UTC is the evening before, so a day stays a day.
  const day = DAY_ONLY.test(eventDate) ? eventDate : undefined
  const startTime = day
    ? new Date(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)))
    : new Date(eventDate)

  // Default to 1 hour duration
  const endTime = new Date(startTime)
  endTime.setHours(endTime.getHours() + 1)

  // Build description
  const descriptionParts: string[] = []

  if (booking.host_name) {
    descriptionParts.push(`Host: ${booking.host_name}`)
  }

  if (booking.episode_url) {
    descriptionParts.push(`Episode: ${booking.episode_url}`)
  }

  if (booking.notes) {
    descriptionParts.push(`\nNotes: ${booking.notes}`)
  }

  return {
    title: `Podcast Recording: ${booking.podcast_name}`,
    startTime,
    endTime,
    day,
    description: descriptionParts.join('\n'),
    location: booking.podcast_url || undefined,
  }
}
