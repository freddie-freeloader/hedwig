import { describe, expect, it } from 'vitest'
import { envelopeReplayKey, parseOuterEnvelope, validateEnvelopePair } from '../src/envelope.ts'

describe('envelope validation', () => {
  const outer = {
    v: 1 as const,
    from: 'owl1sender',
    to: 'owl1recipient',
    envelopeId: 'AbCdEfGh12345678',
    releaseRound: 123,
    tlock: 'ciphertext',
  }

  it('accepts a valid outer envelope shape', () => {
    expect(parseOuterEnvelope(outer)).toEqual(outer)
  })

  it('rejects invalid IDs, rounds, and recipients', () => {
    expect(parseOuterEnvelope({ ...outer, envelopeId: 'bad' })).toBeNull()
    expect(parseOuterEnvelope({ ...outer, releaseRound: 0 })).toBeNull()
    expect(parseOuterEnvelope({ ...outer, to: 'other' })).toBeNull()
  })

  it('binds inner and outer envelope fields', () => {
    const inner = {
      v: 1 as const,
      id: outer.envelopeId,
      from: outer.from,
      fromName: 'Sender',
      to: outer.to,
      releaseRound: outer.releaseRound,
      sentAt: '2026-11-26T10:00:00Z',
      ephPub: 'A'.repeat(43),
      nonce: 'A'.repeat(32),
      ct: 'A'.repeat(32),
      sig: 'A'.repeat(86),
      subject: 'Test',
      subjectCt: '',
    }
    expect(validateEnvelopePair(outer, inner)).toBe(true)
    expect(validateEnvelopePair(outer, { ...inner, to: 'owl1other' })).toBe(false)
  })

  it('creates a recipient-scoped replay key', () => {
    expect(envelopeReplayKey(outer)).toBe('owl1recipient:AbCdEfGh12345678')
  })
})
