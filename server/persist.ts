import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { isRecord } from '../src/crypto/bytes.ts'
import type { Envelope } from '../src/crypto/letter.ts'
import { parseEnvelope } from '../src/crypto/letter.ts'
import type { HeldLetter, OwlRecord, RelaySnapshot } from '../src/relay/store.ts'

export async function readSnapshot(file: string): Promise<RelaySnapshot | null> {
  let text: string
  try {
    text = await readFile(file, 'utf8')
  } catch {
    return null
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return null
  }
  return parseSnapshot(parsed)
}

export async function writeSnapshot(file: string, snapshot: RelaySnapshot): Promise<void> {
  await mkdir(dirname(file), { recursive: true })
  const temporary = `${file}.tmp`
  await writeFile(temporary, JSON.stringify(snapshot), 'utf8')
  await rename(temporary, file)
}

function parseSnapshot(value: unknown): RelaySnapshot | null {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.owls)) return null
  const owls: OwlRecord[] = []
  for (const entry of value.owls) {
    const owl = parseOwl(entry)
    if (!owl) return null
    owls.push(owl)
  }
  return { version: 1, owls }
}

function parseOwl(value: unknown): OwlRecord | null {
  if (!isRecord(value)) return null
  if (typeof value.address !== 'string' || typeof value.displayName !== 'string') return null
  if (typeof value.timezone !== 'string' || typeof value.inboxPub !== 'string') return null
  if (typeof value.wrappedPriv !== 'string') return null
  if (!Array.isArray(value.mailbox)) return null
  const mailbox: HeldLetter[] = []
  for (const letter of value.mailbox) {
    const held = parseHeld(letter)
    if (!held) return null
    mailbox.push(held)
  }
  const release = parseRelease(value.release)
  if (value.release !== null && !release) return null
  const last = value.lastAckedLocalDate
  if (last !== null && typeof last !== 'string') return null
  return {
    address: value.address,
    displayName: value.displayName,
    timezone: value.timezone,
    inboxPub: value.inboxPub,
    wrappedPriv: value.wrappedPriv,
    mailbox,
    release,
    lastAckedLocalDate: typeof last === 'string' ? last : null,
  }
}

function parseRelease(value: unknown): OwlRecord['release'] {
  if (value === null) return null
  if (!isRecord(value)) return null
  if (typeof value.localDate !== 'string' || typeof value.acked !== 'boolean') return null
  if (typeof value.inboxPub !== 'string' || typeof value.wrappedPriv !== 'string') return null
  if (typeof value.releasedAt !== 'string' || !Array.isArray(value.envelopes)) return null
  const envelopes: HeldLetter[] = []
  for (const letter of value.envelopes) {
    const held = parseHeld(letter)
    if (!held) return null
    envelopes.push(held)
  }
  return {
    localDate: value.localDate,
    acked: value.acked,
    inboxPub: value.inboxPub,
    wrappedPriv: value.wrappedPriv,
    envelopes,
    releasedAt: value.releasedAt,
  }
}

function parseHeld(value: unknown): HeldLetter | null {
  if (!isRecord(value) || typeof value.receivedAt !== 'string') return null
  const envelope: Envelope | null = parseEnvelope(value.envelope)
  if (!envelope) return null
  return { envelope, receivedAt: value.receivedAt }
}
