import { describe, expect, it } from 'vitest'
import { encodeBase64Url } from '../src/crypto/bytes.ts'
import { openLetter } from '../src/crypto/letter.ts'
import { unwrapSecret } from '../src/crypto/wrap.ts'
import { ManualClock } from '../src/inbox/clock.ts'
import { localDateISO } from '../src/inbox/daily.ts'
import { buildOpen } from '../src/relay/api.ts'
import { MailboxStore } from '../src/relay/store.ts'
import { ackBody, letterTo, makeOwl, openBody, previewBody, registerOwl, rotate } from './owls.ts'

const PHRASE = 'silver-larch-phrase-that-must-stay-inside-the-seal'
const BODY = 'The gate is unlatched. Come before the second bell.'

describe('mailbox store', () => {
  it('delivers ciphertext, releases the inbox key once, and holds the next letter', () => {
    const clock = new ManualClock(new Date('2026-11-25T15:00:00Z'))
    const store = new MailboxStore(clock)
    const alba = makeOwl('Alba', 'UTC')
    const bram = makeOwl('Bram', 'UTC')
    expect(registerOwl(store, alba, clock).ok).toBe(true)
    expect(registerOwl(store, bram, clock).ok).toBe(true)

    const first = letterTo(alba, bram.address, bram.inboxPub, PHRASE, BODY, clock.now().toISOString())
    expect(store.postLetter(first)).toEqual({ ok: true })
    const dumped = JSON.stringify(store.snapshot())
    expect(dumped.includes(PHRASE)).toBe(false)
    expect(dumped.includes(BODY)).toBe(false)
    expect(dumped.includes(encodeBase64Url(bram.inboxSecret))).toBe(false)

    const preview = store.preview(previewBody(bram, clock))
    expect(preview.ok).toBe(true)
    if (!preview.ok) return
    expect(preview.letters).toEqual([
      { id: first.id, from: alba.address, fromName: 'Alba', receivedAt: clock.now().toISOString() },
    ])

    const next = rotate(bram)
    const opened = store.open(openBody(bram, clock, next.inboxPub, next.wrappedPriv))
    expect(opened.ok).toBe(true)
    if (!opened.ok) return
    expect(opened.replay).toBe(false)
    expect(opened.releasedInboxPub).toBe(bram.inboxPub)
    expect(opened.currentInboxPub).toBe(next.inboxPub)
    expect(opened.envelopes).toHaveLength(1)
    const secret = unwrapSecret(opened.wrappedPriv, bram.wrapKey)
    expect(secret).toEqual(bram.inboxSecret)
    const letter = opened.envelopes[0]?.envelope
    if (!letter || !secret) throw new Error('missing release')
    expect(openLetter(letter, secret)).toMatchObject({ subject: PHRASE, body: BODY })

    const replayNext = rotate(bram)
    const replay = store.open(openBody(bram, clock, replayNext.inboxPub, replayNext.wrappedPriv))
    expect(replay.ok).toBe(true)
    if (!replay.ok) return
    expect(replay.replay).toBe(true)
    expect(replay.currentInboxPub).toBe(next.inboxPub)
    expect(replay.wrappedPriv).toBe(opened.wrappedPriv)

    expect(store.ack(ackBody(bram, clock, opened.localDate))).toEqual({ ok: true })
    const blocked = rotate(bram)
    const again = store.open(openBody(bram, clock, blocked.inboxPub, blocked.wrappedPriv))
    expect(again).toMatchObject({ ok: false, error: 'already-opened-today' })

    const directory = store.directory(bram.address)
    expect(directory.ok).toBe(true)
    if (!directory.ok) return
    const second = letterTo(alba, bram.address, directory.inboxPub, 'Tomorrow’s cedar note', 'Wait for the next opening.', clock.now().toISOString())
    expect(store.postLetter(second)).toEqual({ ok: true })
    const sealed = store.preview(previewBody(bram, clock))
    expect(sealed.ok).toBe(true)
    if (!sealed.ok) return
    expect(sealed.letters.map((item) => item.id)).toEqual([second.id])
    expect(JSON.stringify(sealed).includes('Tomorrow’s cedar note')).toBe(false)

    clock.set(new Date('2026-11-26T15:00:00Z'))
    const following = rotate(bram)
    const nextDay = store.open(openBody(bram, clock, following.inboxPub, following.wrappedPriv))
    expect(nextDay.ok).toBe(true)
    if (!nextDay.ok) return
    expect(nextDay.localDate).toBe(localDateISO(clock.now(), 'UTC'))
    const nextSecret = unwrapSecret(nextDay.wrappedPriv, bram.wrapKey)
    const nextLetter = nextDay.envelopes[0]?.envelope
    if (!nextSecret || !nextLetter) throw new Error('missing second release')
    expect(openLetter(nextLetter, nextSecret)).toMatchObject({ subject: 'Tomorrow’s cedar note' })
    expect(openLetter(nextLetter, bram.inboxSecret)).toBeNull()
  })

  it('rejects a bad signature, a stale inbox, and a timezone change', () => {
    const clock = new ManualClock(new Date('2026-11-25T15:00:00Z'))
    const store = new MailboxStore(clock)
    const alba = makeOwl('Alba', 'UTC')
    const bram = makeOwl('Bram', 'UTC')
    registerOwl(store, alba, clock)
    registerOwl(store, bram, clock)

    const stale = letterTo(alba, bram.address, alba.inboxPub, 'Misaddressed key', 'This key is not Bram’s perch.', clock.now().toISOString())
    expect(store.postLetter(stale)).toMatchObject({ ok: false, error: 'stale-inbox' })

    const forged = letterTo(alba, bram.address, bram.inboxPub, 'Signed by Alba', 'Do not trust a swapped sender.', clock.now().toISOString())
    expect(store.postLetter({ ...forged, from: bram.address })).toMatchObject({ ok: false, status: 401 })

    const rotated = rotate(alba)
    expect(
      store.open(
        buildOpen(alba.secretKey, {
          address: alba.address,
          timezone: 'Pacific/Auckland',
          localDate: '2026-11-25',
          newInboxPub: rotated.inboxPub,
          wrappedNewPriv: rotated.wrappedPriv,
          issuedAt: clock.now().toISOString(),
        }),
      ),
    ).toMatchObject({ ok: false, error: 'timezone-mismatch' })
    expect(store.directory('owl1missing')).toMatchObject({ ok: false, status: 404 })
  })
})
