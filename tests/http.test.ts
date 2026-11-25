import type { AddressInfo } from 'node:net'
import { randomBytes } from '@noble/ciphers/utils.js'
import { WebSocket } from 'ws'
import { afterEach, describe, expect, it } from 'vitest'
import { encodeBase64Url } from '../src/crypto/bytes.ts'
import { systemClock } from '../src/inbox/clock.ts'
import { localDateISO } from '../src/inbox/daily.ts'
import { buildHello, buildPresence, buildRegister } from '../src/relay/api.ts'
import { MailboxStore } from '../src/relay/store.ts'
import { createRelay } from '../server/http.ts'
import { ackBody, letterTo, makeOwl, openBody, previewBody, rotate, type TestOwl } from './owls.ts'

const handles: { close: () => Promise<void> }[] = []

afterEach(async () => {
  while (handles.length > 0) {
    const handle = handles.pop()
    if (handle) await handle.close()
  }
})

describe('relay http', () => {
  it('serves health, rejects a bad signature, and opens the post once', async () => {
    const { base, store } = await listen()
    const health = await fetch(`${base}/v1/health`)
    expect(await health.json()).toEqual({ ok: true, service: 'hedwig-relay' })

    const alba = makeOwl('Alba', 'UTC')
    const bram = makeOwl('Bram', 'UTC')
    const registered = await post(`${base}/v1/register`, registerPayload(alba))
    expect(registered.status).toBe(200)
    const forged = { ...registerPayload(bram), sig: encodeBase64Url(randomBytes(64)) }
    const rejected = await post(`${base}/v1/register`, forged)
    expect(rejected.status).toBe(401)
    expect(await post(`${base}/v1/register`, registerPayload(bram))).toMatchObject({ status: 200 })

    const subject = 'A paper boat on the cipher'
    const envelope = letterTo(alba, bram.address, bram.inboxPub, subject, 'Meet me by the west stair.', new Date().toISOString())
    expect((await post(`${base}/v1/letters`, envelope)).status).toBe(200)
    const preview = await post(`${base}/v1/preview`, previewBody(bram, systemClock))
    expect(preview.status).toBe(200)
    const previewText = JSON.stringify(preview.body)
    expect(previewText.includes(subject)).toBe(false)
    expect(previewText.includes(bram.address) || previewText.includes(alba.address)).toBe(true)

    const next = rotate(bram)
    const opened = await post(`${base}/v1/open`, openBody(bram, systemClock, next.inboxPub, next.wrappedPriv))
    expect(opened.status).toBe(200)
    const openedText = JSON.stringify(opened.body)
    expect(openedText.includes(subject)).toBe(false)
    const localDate = localDateISO(new Date(), 'UTC')
    expect((await post(`${base}/v1/ack`, ackBody(bram, systemClock, localDate))).status).toBe(200)
    const second = rotate(bram)
    const blocked = await post(`${base}/v1/open`, openBody(bram, systemClock, second.inboxPub, second.wrappedPriv))
    expect(blocked.status).toBe(409)
    expect(store.has(alba.address)).toBe(true)
  })

  it('forwards presence and a mail hint over the websocket', async () => {
    const { base, port } = await listen()
    const alba = makeOwl('Alba', 'UTC')
    const bram = makeOwl('Bram', 'UTC')
    expect((await post(`${base}/v1/register`, registerPayload(alba))).status).toBe(200)
    expect((await post(`${base}/v1/register`, registerPayload(bram))).status).toBe(200)

    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`)
    await waitOpen(socket)
    const hello = buildHello(bram.secretKey, { address: bram.address, issuedAt: new Date().toISOString() })
    const greeted = nextMessage(socket)
    socket.send(JSON.stringify({ type: 'hello', ...hello }))
    expect(await greeted).toMatchObject({ type: 'hello-ok' })

    const presence = await post(
      `${base}/v1/presence`,
      buildPresence(alba.secretKey, {
        address: alba.address,
        peers: [bram.address],
        issuedAt: new Date().toISOString(),
      }),
    )
    expect(presence.status).toBe(200)
    expect(presence.body).toMatchObject({ online: [bram.address] })

    const hinted = nextMessage(socket)
    const envelope = letterTo(alba, bram.address, bram.inboxPub, 'A knock', 'The perch moved.', new Date().toISOString())
    expect((await post(`${base}/v1/letters`, envelope)).status).toBe(200)
    expect(await hinted).toEqual({ type: 'mail' })
    socket.close()
  })
})

function registerPayload(owl: TestOwl) {
  return buildRegister(owl.secretKey, {
    address: owl.address,
    displayName: owl.name,
    timezone: owl.timezone,
    inboxPub: owl.inboxPub,
    wrappedPriv: owl.wrappedPriv,
    issuedAt: new Date().toISOString(),
  })
}

async function listen() {
  const store = new MailboxStore(systemClock)
  const relay = createRelay(store)
  handles.push(relay)
  await new Promise<void>((resolve) => {
    relay.http.listen(0, '127.0.0.1', () => resolve())
  })
  const address = relay.http.address()
  if (!address || typeof address === 'string') throw new Error('relay did not bind a port')
  const info: AddressInfo = address
  return { store, port: info.port, base: `http://127.0.0.1:${info.port}` }
}

async function post(url: string, body: unknown): Promise<{ status: number; body: unknown }> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const text = await response.text()
  const parsed: unknown = text ? JSON.parse(text) : null
  return { status: response.status, body: parsed }
}

function waitOpen(socket: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.once('open', () => resolve())
    socket.once('error', (error) => reject(error))
  })
}

function nextMessage(socket: WebSocket): Promise<unknown> {
  return new Promise((resolve, reject) => {
    socket.once('message', (data) => {
      const text = typeof data === 'string' ? data : new TextDecoder().decode(data instanceof Uint8Array ? data : new Uint8Array())
      try {
        const parsed: unknown = JSON.parse(text)
        resolve(parsed)
      } catch (error) {
        reject(error instanceof Error ? error : new Error('bad socket json'))
      }
    })
  })
}
