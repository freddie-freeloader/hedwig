import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { WebSocketServer, type RawData, type WebSocket } from 'ws'
import { concatBytes } from '../src/crypto/bytes.ts'
import { isRecord } from '../src/crypto/bytes.ts'
import { publicKeyFromAddress } from '../src/crypto/address.ts'
import { issuedAtFresh } from '../src/inbox/daily.ts'
import {
  parseAck,
  parseHello,
  parseOpen,
  parsePostedLetter,
  parsePresence,
  parsePreview,
  parseRegister,
  parseSignal,
  verifyHello,
  verifyPresence,
} from '../src/relay/api.ts'
import { MailboxStore, type StoreFailure } from '../src/relay/store.ts'

type SocketState = { address: string | null }

export type RelayHandle = {
  http: ReturnType<typeof createServer>
  close: () => Promise<void>
}

const BODY_LIMIT = 200_000

export function createRelay(store: MailboxStore): RelayHandle {
  const sockets = new Map<string, WebSocket>()
  const http = createServer((req, res) => {
    void handleRequest(req, res, store, sockets)
  })
  const wss = new WebSocketServer({ server: http, path: '/ws', maxPayload: 128 * 1024 })

  wss.on('connection', (socket) => {
    const state: SocketState = { address: null }
    socket.on('message', (data) => {
      handleSocket(store, sockets, socket, state, data)
    })
    socket.on('close', () => {
      if (state.address && sockets.get(state.address) === socket) {
        sockets.delete(state.address)
      }
    })
  })

  return {
    http,
    close: () =>
      new Promise((resolve, reject) => {
        for (const socket of sockets.values()) socket.close()
        wss.close()
        http.close((error) => (error ? reject(error) : resolve()))
      }),
  }
}

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  store: MailboxStore,
  sockets: Map<string, WebSocket>,
): Promise<void> {
  try {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    if (req.method === 'OPTIONS') {
      writeJson(res, 204, {})
      return
    }
    if (req.method === 'GET' && url.pathname === '/v1/health') {
      writeJson(res, 200, { ok: true, service: 'hedwig-relay' })
      return
    }
    if (req.method === 'GET' && url.pathname.startsWith('/v1/owls/')) {
      const address = decodeURIComponent(url.pathname.slice('/v1/owls/'.length))
      const found = store.directory(address)
      if (!found.ok) {
        writeJson(res, found.status, { error: found.error })
        return
      }
      writeJson(res, 200, {
        address: found.address,
        displayName: found.displayName,
        inboxPub: found.inboxPub,
      })
      return
    }
    if (req.method !== 'POST') {
      writeJson(res, 404, { error: 'not-found' })
      return
    }
    const body = await readBody(req)
    if (body === 'too-large') {
      writeJson(res, 413, { error: 'too-large' })
      return
    }
    if (url.pathname === '/v1/register') {
      const parsed = parseRegister(body)
      writeResult(res, parsed ? store.register(parsed) : { ok: false, status: 400, error: 'bad-request' })
      return
    }
    if (url.pathname === '/v1/letters') {
      const envelope = parsePostedLetter(body)
      if (!envelope) {
        writeJson(res, 400, { error: 'bad-request' })
        return
      }
      const posted = store.postLetter(envelope)
      if (posted.ok) notify(sockets, envelope.to)
      writeResult(res, posted)
      return
    }
    if (url.pathname === '/v1/preview') {
      const parsed = parsePreview(body)
      writeResult(res, parsed ? store.preview(parsed) : { ok: false, status: 400, error: 'bad-request' })
      return
    }
    if (url.pathname === '/v1/open') {
      const parsed = parseOpen(body)
      writeResult(res, parsed ? store.open(parsed) : { ok: false, status: 400, error: 'bad-request' })
      return
    }
    if (url.pathname === '/v1/ack') {
      const parsed = parseAck(body)
      writeResult(res, parsed ? store.ack(parsed) : { ok: false, status: 400, error: 'bad-request' })
      return
    }
    if (url.pathname === '/v1/presence') {
      const parsed = parsePresence(body)
      if (!parsed || !verifyPresence(parsed) || !store.has(parsed.address)) {
        writeJson(res, 401, { error: 'bad-signature' })
        return
      }
      if (!issuedAtFresh(parsed.issuedAt, store.now())) {
        writeJson(res, 401, { error: 'stale-request' })
        return
      }
      const online = parsed.peers.filter((peer) => {
        const socket = sockets.get(peer)
        return socket !== undefined && socket.readyState === socket.OPEN
      })
      writeJson(res, 200, { ok: true, online })
      return
    }
    writeJson(res, 404, { error: 'not-found' })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'error'
    if (message === 'bad-json') {
      writeJson(res, 400, { error: 'bad-request' })
      return
    }
    writeJson(res, 500, { error: 'relay-error' })
  }
}

function handleSocket(
  store: MailboxStore,
  sockets: Map<string, WebSocket>,
  socket: WebSocket,
  state: SocketState,
  data: RawData,
): void {
  const text = rawText(data)
  if (!text) {
    socket.close()
    return
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    socket.close()
    return
  }
  if (!isRecord(parsed) || typeof parsed.type !== 'string') {
    socket.close()
    return
  }
  if (!state.address) {
    if (parsed.type !== 'hello') {
      socket.close()
      return
    }
    const hello = parseHello(parsed)
    if (!hello || !verifyHello(hello) || !store.has(hello.address) || !publicKeyFromAddress(hello.address)) {
      send(socket, { type: 'error', error: 'bad-signature' })
      socket.close()
      return
    }
    if (!issuedAtFresh(hello.issuedAt, store.now())) {
      send(socket, { type: 'error', error: 'stale-request' })
      socket.close()
      return
    }
    const previous = sockets.get(hello.address)
    if (previous && previous !== socket) previous.close()
    state.address = hello.address
    sockets.set(hello.address, socket)
    send(socket, { type: 'hello-ok' })
    return
  }
  if (parsed.type === 'signal') {
    const to = parsed.to
    const payload = parseSignal(parsed.payload)
    if (typeof to !== 'string' || !payload || !store.has(to) || to === state.address) return
    const peer = sockets.get(to)
    if (!peer || peer.readyState !== peer.OPEN) return
    send(peer, { type: 'signal', from: state.address, payload })
  }
}

function notify(sockets: Map<string, WebSocket>, address: string): void {
  const socket = sockets.get(address)
  if (!socket || socket.readyState !== socket.OPEN) return
  send(socket, { type: 'mail' })
}

function send(socket: WebSocket, value: unknown): void {
  socket.send(JSON.stringify(value))
}

function writeResult(res: ServerResponse, result: { ok: true } | StoreFailure | ({ ok: true } & Record<string, unknown>)): void {
  if (!result.ok) {
    writeJson(res, result.status, { error: result.error })
    return
  }
  writeJson(res, 200, result)
}

function writeJson(res: ServerResponse, status: number, value: unknown): void {
  const body = JSON.stringify(value)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'cache-control': 'no-store',
  })
  res.end(body)
}

async function readBody(req: IncomingMessage): Promise<unknown | 'too-large'> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buffer = typeof chunk === 'string' ? Buffer.from(chunk) : Buffer.from(chunk)
    size += buffer.length
    if (size > BODY_LIMIT) return 'too-large'
    chunks.push(buffer)
  }
  if (size === 0) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new Error('bad-json')
  }
  return parsed
}

function rawText(data: RawData): string | null {
  if (typeof data === 'string') return data
  if (data instanceof ArrayBuffer) return new TextDecoder().decode(new Uint8Array(data))
  if (Array.isArray(data)) {
    const parts: Uint8Array[] = []
    for (const part of data) {
      if (!(part instanceof Uint8Array)) return null
      parts.push(part)
    }
    return new TextDecoder().decode(concatBytes(parts))
  }
  if (data instanceof Uint8Array) return new TextDecoder().decode(data)
  return null
}
