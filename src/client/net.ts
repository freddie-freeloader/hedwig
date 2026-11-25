import { isRecord } from '../crypto/bytes.ts'

export async function requestJson(
  path: string,
  body?: unknown,
): Promise<{ status: number; body: unknown }> {
  try {
    const response = await fetch(path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const text = await response.text()
    if (!text) return { status: response.status, body: null }
    try {
      const parsed: unknown = JSON.parse(text)
      return { status: response.status, body: parsed }
    } catch {
      return { status: response.status, body: null }
    }
  } catch {
    return { status: 0, body: null }
  }
}

export function readError(body: unknown): string {
  if (!isRecord(body) || typeof body.error !== 'string') return 'bad-request'
  return body.error
}

export function readDirectory(
  body: unknown,
): { address: string; displayName: string; inboxPub: string } | null {
  if (!isRecord(body)) return null
  if (typeof body.address !== 'string' || typeof body.displayName !== 'string') return null
  if (typeof body.inboxPub !== 'string') return null
  return { address: body.address, displayName: body.displayName, inboxPub: body.inboxPub }
}
