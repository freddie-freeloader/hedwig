import { describe, expect, it } from 'vitest'
import { createSignalingEnvelope, parseSignalingEnvelope } from '../src/signaling.ts'

const sdp = { type: 'offer' as RTCSdpType, sdp: 'test-sdp' }

describe('signaling envelopes', () => {
  it('creates and parses a live offer', () => {
    const envelope = createSignalingEnvelope('offer', sdp, 1_000)
    expect(parseSignalingEnvelope(JSON.stringify(envelope), 'offer', 2_000)).toEqual(sdp)
  })

  it('rejects an expired offer', () => {
    const envelope = createSignalingEnvelope('offer', sdp, 1_000)
    expect(() =>
      parseSignalingEnvelope(JSON.stringify(envelope), 'offer', envelope.expiresAt + 1),
    ).toThrow('expired')
  })

  it('rejects the wrong signaling type', () => {
    const envelope = createSignalingEnvelope('answer', sdp, 1_000)
    expect(() =>
      parseSignalingEnvelope(JSON.stringify(envelope), 'offer', 2_000),
    ).toThrow('invalid')
  })

  it('rejects malformed JSON', () => {
    expect(() =>
      parseSignalingEnvelope('{bad', 'answer', 2_000),
    ).toThrow('invalid')
  })
})
