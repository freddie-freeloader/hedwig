import type { ChainInfo } from 'drand-client'
import { roundAt } from 'drand-client'

export function roundForReleaseMs(releaseTimeMs: number, chain: ChainInfo): number {
  if (!Number.isFinite(releaseTimeMs)) {
    throw new Error('Release time must be a finite timestamp')
  }
  if (releaseTimeMs < chain.genesis_time * 1000) {
    throw new Error('Release time is before the drand chain genesis')
  }
  const round = roundAt(releaseTimeMs, chain)
  if (!Number.isInteger(round) || round < 1) {
    throw new Error('Drand round is invalid')
  }
  return round
}

export function roundForReleaseHours(
  nowMs: number,
  releaseHours: number,
  chain: ChainInfo,
): number {
  if (!Number.isFinite(releaseHours) || releaseHours < 0) {
    throw new Error('Release duration must be zero or greater')
  }
  return roundForReleaseMs(nowMs + releaseHours * 60 * 60 * 1000, chain)
}

export function roundForReleaseSeconds(
  nowMs: number,
  releaseSeconds: number,
  chain: ChainInfo,
): number {
  if (!Number.isFinite(releaseSeconds) || releaseSeconds < 0) {
    throw new Error('Release duration must be zero or greater')
  }
  return roundForReleaseMs(nowMs + releaseSeconds * 1000, chain)
}
