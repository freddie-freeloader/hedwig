import { describe, expect, it } from 'vitest'
import { ManualClock } from '../src/inbox/clock.ts'
import {
  evaluateOpen,
  isRealIsoDate,
  isValidTimeZone,
  localDateISO,
  nextLocalMidnight,
} from '../src/inbox/daily.ts'

const utc = 'UTC'
const auckland = 'Pacific/Auckland'
const honolulu = 'Pacific/Honolulu'

describe('local dates', () => {
  it('follows the calendar in the locked timezone, including the date line', () => {
    const noon = new Date('2026-11-25T12:00:00Z')
    expect(localDateISO(noon, utc)).toBe('2026-11-25')
    expect(localDateISO(noon, auckland)).toBe('2026-11-26')
    expect(localDateISO(noon, honolulu)).toBe('2026-11-25')
    expect(localDateISO(new Date('2026-11-25T09:30:00Z'), honolulu)).toBe('2026-11-24')
    expect(localDateISO(new Date('2026-11-25T10:00:00Z'), honolulu)).toBe('2026-11-25')
  })

  it('places the next opening at the following local midnight', () => {
    const now = new Date('2026-11-25T12:00:00Z')
    expect(nextLocalMidnight(now, honolulu).toISOString()).toBe('2026-11-26T10:00:00.000Z')
    expect(nextLocalMidnight(now, utc).toISOString()).toBe('2026-11-26T00:00:00.000Z')
  })

  it('rejects dates and timezones that are not real', () => {
    expect(isRealIsoDate('2026-11-31')).toBe(false)
    expect(isRealIsoDate('2026-02-29')).toBe(false)
    expect(isRealIsoDate('2024-02-29')).toBe(true)
    expect(isValidTimeZone('Not/AZone')).toBe(false)
    expect(isValidTimeZone(utc)).toBe(true)
  })
})

describe('evaluateOpen', () => {
  const history: { timezone: string; lastOpenedLocalDate: string | null } = {
    timezone: utc,
    lastOpenedLocalDate: null,
  }

  it('allows the first opening of the server’s local day and blocks the second', () => {
    const now = new Date('2026-11-25T18:00:00Z')
    expect(evaluateOpen(history, utc, '2026-11-25', now)).toEqual({ ok: true })
    const opened = { timezone: utc, lastOpenedLocalDate: '2026-11-25' }
    expect(evaluateOpen(opened, utc, '2026-11-25', now)).toEqual({
      ok: false,
      reason: 'already-opened-today',
    })
  })

  it('allows the next local calendar day', () => {
    const opened = { timezone: auckland, lastOpenedLocalDate: '2026-11-26' }
    const stillToday = new Date('2026-11-25T12:00:00Z')
    expect(localDateISO(stillToday, auckland)).toBe('2026-11-26')
    expect(evaluateOpen(opened, auckland, '2026-11-26', stillToday)).toEqual({
      ok: false,
      reason: 'already-opened-today',
    })
    const tomorrow = new Date('2026-11-26T12:00:00Z')
    expect(localDateISO(tomorrow, auckland)).toBe('2026-11-27')
    expect(evaluateOpen(opened, auckland, '2026-11-27', tomorrow)).toEqual({ ok: true })
  })

  it('does not let a locked timezone hop forward for a second opening', () => {
    const opened = { timezone: utc, lastOpenedLocalDate: '2026-11-25' }
    const now = new Date('2026-11-25T12:00:00Z')
    expect(evaluateOpen(opened, auckland, '2026-11-26', now)).toEqual({
      ok: false,
      reason: 'timezone-mismatch',
    })
    expect(evaluateOpen(opened, utc, '2026-11-26', now)).toEqual({
      ok: false,
      reason: 'date-not-plausible',
    })
  })

  it('rejects a backwards date, a far date, and a bad timezone', () => {
    const now = new Date('2026-11-25T12:00:00Z')
    expect(
      evaluateOpen({ timezone: utc, lastOpenedLocalDate: '2026-11-26' }, utc, '2026-11-25', now),
    ).toEqual({ ok: false, reason: 'date-went-backwards' })
    expect(evaluateOpen(history, utc, '2026-11-27', now)).toEqual({
      ok: false,
      reason: 'date-not-plausible',
    })
    expect(evaluateOpen(history, 'Mars/Olympus', '2026-11-25', now)).toEqual({
      ok: false,
      reason: 'invalid-timezone',
    })
    expect(evaluateOpen(history, utc, '2026-11-31', now)).toEqual({
      ok: false,
      reason: 'invalid-date',
    })
  })

  it('reads the day from the injected clock', () => {
    const clock = new ManualClock(new Date('2026-11-25T23:30:00Z'))
    expect(evaluateOpen(history, utc, '2026-11-25', clock.now())).toEqual({ ok: true })
    clock.set(new Date('2026-11-26T00:10:00Z'))
    expect(evaluateOpen({ timezone: utc, lastOpenedLocalDate: '2026-11-25' }, utc, '2026-11-26', clock.now())).toEqual({
      ok: true,
    })
  })
})
