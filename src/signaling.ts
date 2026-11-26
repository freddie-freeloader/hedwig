export type SignalingEnvelope = {
  type: 'offer' | 'answer'
  sdp: RTCSessionDescriptionInit
  expiresAt: number
}

export function createSignalingEnvelope(
  type: 'offer' | 'answer',
  sdp: RTCSessionDescriptionInit,
  nowMs = Date.now(),
  lifetimeMs = 10 * 60 * 1000,
): SignalingEnvelope {
  return {
    type,
    sdp,
    expiresAt: nowMs + lifetimeMs,
  }
}

export function parseSignalingEnvelope(
  serialized: string,
  expectedType: 'offer' | 'answer',
  nowMs = Date.now(),
): RTCSessionDescriptionInit {
  let parsed: unknown
  try {
    parsed = JSON.parse(serialized)
  } catch {
    throw new Error(`${expectedType} payload is invalid`)
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error(`${expectedType} payload is invalid`)
  }
  const envelope = parsed as Partial<SignalingEnvelope>
  if (
    envelope.type !== expectedType
    || !envelope.sdp
    || typeof envelope.expiresAt !== 'number'
    || !Number.isFinite(envelope.expiresAt)
  ) {
    throw new Error(`${expectedType} payload is invalid`)
  }
  if (envelope.expiresAt < nowMs) {
    throw new Error(`${expectedType} has expired`)
  }
  return envelope.sdp
}
