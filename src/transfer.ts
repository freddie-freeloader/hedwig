export type TransferFrame =
  | {
      type: 'hedwig-chunk'
      envelopeId: string
      chunkIndex: number
      chunkCount: number
      payload: string
    }
  | {
      type: 'delivery-confirmation'
      envelopeId: string
    }

export type ReassemblyResult =
  | { ok: true; payload: string }
  | { ok: false; reason: 'invalid-frame' | 'missing-chunks' }

export type ChunkSession = {
  envelopeId: string
  chunkCount: number
  chunks: Map<number, string>
}

const CHUNK_SIZE = 16_000
const MAX_CHUNKS = 64

export function splitTransfer(payload: string, envelopeId: string): TransferFrame[] {
  if (!payload || payload.length > CHUNK_SIZE * MAX_CHUNKS) {
    throw new Error('Transfer payload exceeds the size limit')
  }
  const chunks: string[] = []
  for (let index = 0; index < payload.length; index += CHUNK_SIZE) {
    chunks.push(payload.slice(index, index + CHUNK_SIZE))
  }
  if (chunks.length === 0) chunks.push('')
  if (chunks.length > MAX_CHUNKS) throw new Error('Transfer has too many chunks')
  return chunks.map((chunk, index) => ({
    type: 'hedwig-chunk',
    envelopeId,
    chunkIndex: index,
    chunkCount: chunks.length,
    payload: chunk,
  }))
}

export function reassembleTransfer(
  session: ChunkSession | null,
  frame: unknown,
): { session: ChunkSession | null; result: ReassemblyResult } {
  if (!isRecord(frame) || frame.type !== 'hedwig-chunk') {
    return { session, result: { ok: false, reason: 'invalid-frame' } }
  }
  const envelopeId = frame.envelopeId
  const chunkIndex = frame.chunkIndex
  const chunkCount = frame.chunkCount
  const payload = frame.payload
  if (
    typeof envelopeId !== 'string'
    || !/^[A-Za-z0-9_-]{16,32}$/.test(envelopeId)
    || typeof chunkIndex !== 'number'
    || typeof chunkCount !== 'number'
    || !Number.isInteger(chunkIndex)
    || !Number.isInteger(chunkCount)
    || chunkIndex < 0
    || chunkCount < 1
    || chunkCount > MAX_CHUNKS
    || chunkIndex >= chunkCount
    || typeof payload !== 'string'
  ) {
    return { session, result: { ok: false, reason: 'invalid-frame' } }
  }
  if (session && (session.envelopeId !== envelopeId || session.chunkCount !== chunkCount)) {
    return { session: null, result: { ok: false, reason: 'missing-chunks' } }
  }
  const next: ChunkSession = session
    ? session
    : { envelopeId, chunkCount, chunks: new Map<number, string>() }
  next.chunks.set(chunkIndex, payload)
  if (next.chunks.size !== chunkCount) {
    return { session: next, result: { ok: false, reason: 'missing-chunks' } }
  }
  for (let index = 0; index < chunkCount; index += 1) {
    if (!next.chunks.has(index)) {
      return { session: next, result: { ok: false, reason: 'missing-chunks' } }
    }
  }
  const joined = Array.from({ length: chunkCount }, (_, index) => next.chunks.get(index) ?? '').join('')
  return { session: null, result: { ok: true, payload: joined } }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
