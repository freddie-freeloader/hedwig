import { describe, expect, it } from 'vitest'
import { reassembleTransfer, splitTransfer } from '../src/transfer.ts'

describe('WebRTC transfer framing', () => {
  const envelopeId = 'AbCdEfGh12345678'

  it('splits and reassembles an envelope', () => {
    const payload = JSON.stringify({ v: 1, data: 'x'.repeat(20_000) })
    const frames = splitTransfer(payload, envelopeId)
    expect(frames.length).toBeGreaterThan(1)
    let session = null
    let result: ReturnType<typeof reassembleTransfer>['result'] = { ok: false, reason: 'missing-chunks' }
    for (const frame of frames) {
      const next = reassembleTransfer(session, frame)
      session = next.session
      result = next.result
    }
    expect(result).toEqual({ ok: true, payload })
  })

  it('waits for missing chunks', () => {
    const payload = 'abcdefghij'.repeat(3000)
    const frames = splitTransfer(payload, envelopeId)
    const first = reassembleTransfer(null, frames[0])
    expect(first.result).toEqual({ ok: false, reason: 'missing-chunks' })
  })

  it('rejects invalid envelope ids and chunk counts', () => {
    expect(reassembleTransfer(null, {
      type: 'hedwig-chunk',
      envelopeId: 'bad',
      chunkIndex: 0,
      chunkCount: 1,
      payload: '{}',
    }).result).toEqual({ ok: false, reason: 'invalid-frame' })
  })

  it('rejects payloads above the transfer limit', () => {
    expect(() => splitTransfer('x'.repeat(16_000 * 65), envelopeId)).toThrow('size limit')
  })
})
