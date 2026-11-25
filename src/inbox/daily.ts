import type { Clock } from './clock.ts'

export type OpenBlock =
  | 'invalid-timezone'
  | 'timezone-mismatch'
  | 'invalid-date'
  | 'date-not-plausible'
  | 'already-opened-today'
  | 'date-went-backwards'

export type OpenDecision = { ok: true } | { ok: false; reason: OpenBlock }

export type OpenHistory = {
  timezone: string
  lastOpenedLocalDate: string | null
}

export function isValidTimeZone(timeZone: string): boolean {
  if (timeZone.length < 1 || timeZone.length > 64) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(0)
    return true
  } catch {
    return false
  }
}

export function systemTimeZone(): string {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
  return zone && isValidTimeZone(zone) ? zone : 'UTC'
}

export function isRealIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const year = Number(value.slice(0, 4))
  const month = Number(value.slice(5, 7))
  const day = Number(value.slice(8, 10))
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false
  const stamped = new Date(Date.UTC(year, month - 1, day))
  return (
    stamped.getUTCFullYear() === year &&
    stamped.getUTCMonth() === month - 1 &&
    stamped.getUTCDate() === day
  )
}

export function addIsoDays(date: string, days: number): string {
  if (!isRealIsoDate(date)) throw new Error('invalid-date')
  const year = Number(date.slice(0, 4))
  const month = Number(date.slice(5, 7))
  const day = Number(date.slice(8, 10))
  const stamped = new Date(Date.UTC(year, month - 1, day + days))
  const y = stamped.getUTCFullYear().toString().padStart(4, '0')
  const m = (stamped.getUTCMonth() + 1).toString().padStart(2, '0')
  const d = stamped.getUTCDate().toString().padStart(2, '0')
  return `${y}-${m}-${d}`
}

function part(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): number {
  const found = parts.find((item) => item.type === type)
  if (!found) throw new Error(`missing date part ${type}`)
  return Number(found.value)
}

export function localDateISO(now: Date, timeZone: string): string {
  if (!isValidTimeZone(timeZone)) throw new Error('invalid-timezone')
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const year = part(parts, 'year').toString().padStart(4, '0')
  const month = part(parts, 'month').toString().padStart(2, '0')
  const day = part(parts, 'day').toString().padStart(2, '0')
  return `${year}-${month}-${day}`
}

function zoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant)
  let hour = part(parts, 'hour')
  let day = part(parts, 'day')
  let month = part(parts, 'month')
  let year = part(parts, 'year')
  if (hour === 24) {
    hour = 0
    const rolled = new Date(Date.UTC(year, month - 1, day + 1))
    year = rolled.getUTCFullYear()
    month = rolled.getUTCMonth() + 1
    day = rolled.getUTCDate()
  }
  const asUtc = Date.UTC(year, month - 1, day, hour, part(parts, 'minute'), part(parts, 'second'))
  return asUtc - instant.getTime()
}

export function zonedMidnightUtc(dateISO: string, timeZone: string): Date {
  if (!isRealIsoDate(dateISO) || !isValidTimeZone(timeZone)) {
    throw new Error('invalid-date')
  }
  const year = Number(dateISO.slice(0, 4))
  const month = Number(dateISO.slice(5, 7))
  const day = Number(dateISO.slice(8, 10))
  const utcGuess = Date.UTC(year, month - 1, day, 0, 0, 0)
  const offset = zoneOffsetMs(new Date(utcGuess), timeZone)
  let instant = utcGuess - offset
  const corrected = zoneOffsetMs(new Date(instant), timeZone)
  if (corrected !== offset) instant = utcGuess - corrected
  return new Date(instant)
}

export function nextLocalMidnight(now: Date, timeZone: string): Date {
  return zonedMidnightUtc(addIsoDays(localDateISO(now, timeZone), 1), timeZone)
}

export function evaluateOpen(history: OpenHistory, claimedTimezone: string, claimedLocalDate: string, now: Date): OpenDecision {
  if (!isValidTimeZone(history.timezone) || !isValidTimeZone(claimedTimezone)) {
    return { ok: false, reason: 'invalid-timezone' }
  }
  if (history.timezone !== claimedTimezone) {
    return { ok: false, reason: 'timezone-mismatch' }
  }
  if (!isRealIsoDate(claimedLocalDate)) {
    return { ok: false, reason: 'invalid-date' }
  }
  const expected = localDateISO(now, history.timezone)
  if (claimedLocalDate !== expected) {
    return { ok: false, reason: 'date-not-plausible' }
  }
  if (history.lastOpenedLocalDate !== null) {
    if (!isRealIsoDate(history.lastOpenedLocalDate)) {
      return { ok: false, reason: 'invalid-date' }
    }
    if (claimedLocalDate === history.lastOpenedLocalDate) {
      return { ok: false, reason: 'already-opened-today' }
    }
    if (claimedLocalDate < history.lastOpenedLocalDate) {
      return { ok: false, reason: 'date-went-backwards' }
    }
  }
  return { ok: true }
}

export function formatDuration(milliseconds: number): string {
  const remaining = Math.max(0, milliseconds)
  const hours = Math.floor(remaining / 3_600_000)
  const minutes = Math.floor((remaining % 3_600_000) / 60_000)
  if (hours >= 1) return `${hours}h ${minutes}m`
  if (minutes >= 1) return `${minutes}m`
  return 'under a minute'
}

export function todayLabel(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(now)
}

export function issuedAtFresh(issuedAt: string, now: Date, skewMs = 120_000): boolean {
  if (issuedAt.length < 16 || issuedAt.length > 40) return false
  const parsed = Date.parse(issuedAt)
  if (Number.isNaN(parsed)) return false
  return Math.abs(now.getTime() - parsed) <= skewMs
}

export function localToday(clock: Clock, timeZone: string): string {
  return localDateISO(clock.now(), timeZone)
}
