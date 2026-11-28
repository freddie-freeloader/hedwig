/** UTC offset changes for Elm's `Time.customZone`. Display only. */

export type TimeEra = {
  start: number
  offset: number
}

export type TimezoneFlags = {
  tzOffset: number
  tzEras: TimeEra[]
}

const MINUTE_MS = 60 * 1000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

/** Minutes east of UTC, negated from `Date#getTimezoneOffset` for Elm's `Zone`. */
export function offsetMinutes(atMs: number): number {
  return -new Date(atMs).getTimezoneOffset()
}

/**
 * Offset transitions around `nowMs`, newest first.
 * `start` is minutes since the Unix epoch, which is what Elm's `Era` stores.
 * The default offset is the one in effect at the start of the window, used for
 * anything older than the first transition.
 */
export function timezoneFlags(nowMs: number): TimezoneFlags {
  const windowStart = nowMs - 10 * 366 * DAY_MS
  const windowEnd = nowMs + 3 * 366 * DAY_MS
  const transitions: TimeEra[] = []
  let offset = offsetMinutes(windowStart)

  for (let cursor = windowStart + HOUR_MS; cursor <= windowEnd; cursor += HOUR_MS) {
    const next = offsetMinutes(cursor)
    if (next === offset) continue
    let low = cursor - HOUR_MS
    let high = cursor
    while (high - low > MINUTE_MS) {
      const mid = Math.floor((low + high) / 2)
      if (offsetMinutes(mid) === offset) low = mid
      else high = mid
    }
    // Elm's era lookup uses a strict comparison, so begin one minute earlier.
    transitions.push({ start: Math.floor(high / MINUTE_MS) - 1, offset: next })
    offset = next
  }

  transitions.sort((left, right) => right.start - left.start)
  return { tzOffset: offsetMinutes(windowStart), tzEras: transitions }
}

/** Elm's era walk: the first era whose start is strictly before this minute. */
export function offsetFromEras(fallback: number, eras: TimeEra[], atMs: number): number {
  const minutes = Math.floor(atMs / MINUTE_MS)
  for (const era of eras) {
    if (era.start < minutes) return era.offset
  }
  return fallback
}
