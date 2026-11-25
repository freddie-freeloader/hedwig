import { describe, expect, it } from 'vitest'
import type { ChainInfo } from 'drand-client'
import {
  roundForReleaseHours,
  roundForReleaseMs,
  roundForReleaseSeconds,
} from '../src/drand.ts'

const chain: ChainInfo = {
  public_key: 'test-public-key',
  period: 3,
  genesis_time: 1692803367,
  hash: 'test-chain',
  groupHash: 'test-group',
  schemeID: 'test-scheme',
  metadata: { beaconID: 'quicknet' },
}

describe('drand release rounds', () => {
  it('uses milliseconds and never sends a seconds timestamp to roundAt', () => {
    const releaseTime = chain.genesis_time * 1000
    expect(roundForReleaseMs(releaseTime, chain)).toBe(1)
  })

  it('calculates one hour from a 3-second drand period', () => {
    const now = chain.genesis_time * 1000
    expect(roundForReleaseHours(now, 1, chain)).toBe(1201)
  })

  it('rejects release times before chain genesis', () => {
    expect(() =>
      roundForReleaseMs(chain.genesis_time * 1000 - 1, chain),
    ).toThrow('before the drand chain genesis')
  })

  it('rejects invalid durations', () => {
    expect(() =>
      roundForReleaseHours(chain.genesis_time * 1000, -1, chain),
    ).toThrow('zero or greater')
    expect(() =>
      roundForReleaseHours(chain.genesis_time * 1000, Number.NaN, chain),
    ).toThrow('zero or greater')
  })

  it('supports a 1-second test release', () => {
    const now = chain.genesis_time * 1000
    expect(roundForReleaseSeconds(now, 1, chain)).toBe(1)
  })
})
