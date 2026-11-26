import { decodeBase64Url, decodeFixed, fromUtf8, isRecord } from './crypto/bytes.ts'

export type OuterEnvelope = {
  v: 1
  from: string
  to: string
  envelopeId: string
  releaseRound: number
  tlock: string
}

export type InnerEnvelope = {
  v: 1
  id: string
  from: string
  fromName: string
  to: string
  releaseRound: number
  sentAt: string
  ephPub: string
  nonce: string
  ct: string
  sig: string
  subject: string
  subjectCt: string
}

export function parseOuterEnvelope(value: unknown): OuterEnvelope | null {
  if (!isRecord(value) || value.v !== 1) return null
  if (typeof value.from !== 'string' || !/^owl1[A-Za-z0-9_-]+$/.test(value.from)) return null
  if (typeof value.to !== 'string' || !/^owl1[A-Za-z0-9_-]+$/.test(value.to)) return null
  if (typeof value.envelopeId !== 'string' || !/^[A-Za-z0-9_-]{16,32}$/.test(value.envelopeId)) return null
  if (!Number.isInteger(value.releaseRound) || (value.releaseRound as number) < 1) return null
  if (typeof value.tlock !== 'string' || value.tlock.length === 0 || value.tlock.length > 1_024_000) return null
  return {
    v: 1,
    from: value.from,
    to: value.to,
    envelopeId: value.envelopeId,
    releaseRound: value.releaseRound as number,
    tlock: value.tlock,
  }
}

export function validateEnvelopePair(
  outer: OuterEnvelope,
  inner: InnerEnvelope,
): boolean {
  return inner.v === 1
    && inner.id === outer.envelopeId
    && inner.from === outer.from
    && inner.to === outer.to
    && inner.releaseRound === outer.releaseRound
    && decodeFixed(inner.ephPub, 32) !== null
    && decodeFixed(inner.nonce, 24) !== null
    && decodeFixed(inner.sig, 64) !== null
    && fromUtf8(decodeBase64Url(inner.ct) ?? new Uint8Array()).length <= 12000
}

export function envelopeReplayKey(envelope: OuterEnvelope): string {
  return `${envelope.to}:${envelope.envelopeId}`
}

export type EnvelopePairResult =
  | { ok: true }
  | { ok: false; reason: 'wrong-recipient' | 'wrong-envelope' | 'invalid-fields' }

export function classifyEnvelopePair(
  outer: OuterEnvelope,
  inner: InnerEnvelope,
  recipientAddress: string,
): EnvelopePairResult {
  if (outer.to !== recipientAddress) {
    return { ok: false, reason: 'wrong-recipient' }
  }
  if (
    inner.v !== 1
    || inner.id !== outer.envelopeId
    || inner.from !== outer.from
    || inner.to !== outer.to
    || inner.releaseRound !== outer.releaseRound
  ) {
    return { ok: false, reason: 'wrong-envelope' }
  }
  if (
    decodeFixed(inner.ephPub, 32) === null
    || decodeFixed(inner.nonce, 24) === null
    || decodeFixed(inner.sig, 64) === null
  ) {
    return { ok: false, reason: 'invalid-fields' }
  }
  return { ok: true }
}
