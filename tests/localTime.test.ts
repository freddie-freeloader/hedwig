import { describe, expect, it } from 'vitest'
import { offsetFromEras, offsetMinutes, timezoneFlags } from '../src/localTime.ts'

describe('timezone eras', () => {
  it('reproduces the offset in effect across a scanned window', () => {
    const now = Date.parse('2026-06-15T16:00:00.000Z')
    const { tzOffset, tzEras } = timezoneFlags(now)
    const samples = [
      Date.parse('2026-01-15T17:00:00.000Z'),
      Date.parse('2026-03-07T17:00:00.000Z'),
      Date.parse('2026-03-08T12:00:00.000Z'),
      Date.parse('2026-07-04T16:00:00.000Z'),
      Date.parse('2026-10-31T16:00:00.000Z'),
      Date.parse('2026-11-02T13:00:00.000Z'),
    ]
    for (const sample of samples) {
      expect(offsetFromEras(tzOffset, tzEras, sample)).toBe(offsetMinutes(sample))
    }
  })

  it('keeps the spring-forward offsets when the zone observes them', () => {
    const springEve = Date.parse('2026-03-07T17:00:00.000Z')
    const springMorning = Date.parse('2026-03-08T12:00:00.000Z')
    const before = offsetMinutes(springEve)
    const after = offsetMinutes(springMorning)
    if (before === after) return
    const { tzOffset, tzEras } = timezoneFlags(springMorning)
    expect(offsetFromEras(tzOffset, tzEras, springEve)).toBe(before)
    expect(offsetFromEras(tzOffset, tzEras, springMorning)).toBe(after)
    expect(after - before).toBe(60)
  })
})
