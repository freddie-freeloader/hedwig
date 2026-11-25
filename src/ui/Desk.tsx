import { useEffect, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { toDataURL } from 'qrcode'
import type { HedwigSession } from '../client/session.ts'
import type { DeskSnapshot, LetterView } from '../client/types.ts'
import { formatAddress, shortenAddress } from '../crypto/address.ts'
import { BODY_MAX, SUBJECT_MAX } from '../domain/text.ts'
import { OwlMark, SealMark } from './icons.tsx'

export function Desk({ session, snap }: { session: HedwigSession; snap: DeskSnapshot }) {
  const profile = snap.profile
  const [composeOpen, setComposeOpen] = useState(false)
  const [composeTo, setComposeTo] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [qrOpen, setQrOpen] = useState(false)
  const [confirmEmpty, setConfirmEmpty] = useState(false)
  const [openError, setOpenError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)

  if (!profile) return null

  const activeId = selected ?? snap.todayLetters[0]?.id ?? snap.earlierLetters[0]?.id ?? null

  async function openPost(forceEmpty: boolean) {
    if (snap.sealed.length === 0 && !forceEmpty) {
      setConfirmEmpty(true)
      return
    }
    setConfirmEmpty(false)
    setOpenError(null)
    const error = await session.openInbox()
    if (error) setOpenError(error)
  }

  return (
    <div className="mx-auto min-h-screen max-w-6xl px-4 py-5 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-4">
        <div className="flex items-center gap-3">
          <OwlMark className="h-10 w-10 text-ink" />
          <div>
            <p className="font-serif text-2xl leading-none">Hedwig</p>
            <p className="mt-1 text-sm text-ink-soft">{snap.todayLabel}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <RelayPill relay={snap.relay} />
          <button
            type="button"
            onClick={() => {
              setComposeTo(snap.contacts[0]?.address ?? '')
              setComposeOpen(true)
            }}
            className="rounded-full bg-ink px-4 py-2 text-sm text-sheet"
          >
            Write a letter
          </button>
        </div>
      </header>

      {snap.deskLabel ? (
        <p className="mt-4 text-sm text-ink-soft">
          Desk <span className="text-ink">{snap.deskLabel}</span> keeps a separate owl in this browser.
        </p>
      ) : null}
      {snap.relay === 'offline' ? (
        <p className="mt-4 rounded-2xl border border-line bg-sheet px-4 py-3 text-sm leading-relaxed text-ink-soft" role="status">
          The relay is unreachable. Letters you have already opened stay on this desk. Sending and unsealing wait.
        </p>
      ) : null}
      {snap.notice ? (
        <div className="mt-4 flex items-start justify-between gap-4 rounded-2xl border border-line bg-sheet px-4 py-3 text-sm" role="status">
          <p className={snap.notice.tone === 'error' ? 'text-wax' : 'text-ink'}>{snap.notice.text}</p>
          <button type="button" className="text-ink-soft" onClick={() => session.dismissNotice()}>
            Dismiss
          </button>
        </div>
      ) : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-[20rem_1fr]">
        <aside className="space-y-4">
          <section className="rounded-3xl border border-line bg-sheet p-5">
            <p className="text-xs tracking-[0.16em] text-ink-soft uppercase">Your owl</p>
            <h2 className="mt-2 font-serif text-3xl">{profile.displayName}</h2>
            <p className="mt-3 font-mono text-xs leading-relaxed break-all text-ink-soft">{formatAddress(profile.address)}</p>
            <div className="mt-4 flex gap-2">
              <CopyButton value={profile.address} label="Copy address" />
              <button type="button" className="rounded-full border border-line px-3 py-2 text-sm" onClick={() => setQrOpen(true)}>
                Show the mark
              </button>
            </div>
            <p className="mt-4 text-xs leading-relaxed text-ink-soft">Post is dated in {profile.timezone}. That zone stays with this owl.</p>
          </section>

          <section className="rounded-3xl border border-line bg-sheet p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-serif text-2xl">Correspondents</h2>
              <button type="button" className="text-sm text-moss" onClick={() => setAddOpen(true)}>
                Add
              </button>
            </div>
            {snap.contacts.length === 0 ? (
              <p className="mt-3 text-sm leading-relaxed text-ink-soft">
                Exchange owl addresses to begin. A pasted <span className="text-ink">owl1…</span> string or the mark is enough.
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-line">
                {snap.contacts.map((contact) => (
                  <li key={contact.address} className="flex items-center justify-between gap-3 py-3">
                    <div>
                      <p className="font-medium">{contact.displayName}</p>
                      <p className="text-xs text-ink-soft">{shortenAddress(contact.address)}</p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="text-sm text-moss"
                        onClick={() => {
                          setComposeTo(contact.address)
                          setComposeOpen(true)
                        }}
                      >
                        Write
                      </button>
                      <button type="button" className="text-sm text-ink-soft" onClick={() => void session.removeContact(contact.address)}>
                        Remove
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>

        <main className="space-y-6">
          <section className="rounded-[2rem] border border-line bg-sheet px-5 py-8 sm:px-8" aria-live="polite">
            {snap.openedToday ? (
              <OpenedPerch snap={snap} />
            ) : (
              <div className="flex flex-col items-center text-center">
                <button
                  type="button"
                  className="seal-button"
                  disabled={snap.opening || snap.relay === 'offline'}
                  onClick={() => void openPost(false)}
                >
                  <SealMark label={snap.opening ? 'Opening the post' : 'Open today’s post'} />
                </button>
                <h2 className="mt-6 font-serif text-4xl">
                  {snap.sealed.length === 0 ? 'The perch is quiet' : sealedHeading(snap.sealed.length)}
                </h2>
                <p className="mt-3 max-w-md text-sm leading-relaxed text-ink-soft">
                  {snap.sealed.length === 0
                    ? 'Nothing has arrived. Opening now still uses today’s single unsealing.'
                    : `Waiting under the seal: ${nameList(snap.sealed.map((letter) => letter.fromName ?? shortenAddress(letter.from)))}.`}
                </p>
                {openError ? <p className="mt-3 text-sm text-wax">{openError}</p> : null}
              </div>
            )}
            {snap.openedToday && snap.sealed.length > 0 ? (
              <div className="mt-6 rounded-2xl bg-paper px-4 py-4">
                <p className="font-medium">Since you opened</p>
                <p className="mt-1 text-sm leading-relaxed text-ink-soft">
                  {sealedHeading(snap.sealed.length)} {nameList(snap.sealed.map((letter) => letter.fromName ?? shortenAddress(letter.from)))} will keep until tomorrow.
                </p>
                {snap.nextOpenLabel ? <p className="mt-2 text-sm text-ink-soft">{snap.nextOpenLabel}</p> : null}
              </div>
            ) : null}
            {snap.openedToday && snap.sealed.length === 0 && snap.nextOpenLabel ? (
              <p className="mt-4 text-center text-sm text-ink-soft">{snap.nextOpenLabel}</p>
            ) : null}
          </section>

          <LetterStack
            title="Today’s post"
            letters={snap.todayLetters}
            timeZone={profile.timezone}
            activeId={activeId}
            onSelect={setSelected}
            empty="Nothing from today’s opening yet."
          />
          {snap.earlierLetters.length > 0 ? (
            <LetterStack
              title="Earlier letters"
              letters={snap.earlierLetters}
              timeZone={profile.timezone}
              activeId={activeId}
              onSelect={setSelected}
              empty=""
            />
          ) : null}
          <SentList snap={snap} />
          <details className="rounded-3xl border border-line bg-sheet px-5 py-4 text-sm leading-relaxed text-ink-soft">
            <summary className="cursor-pointer font-medium text-ink">How the seal works</summary>
            <p className="mt-3">
              Each letter is encrypted to an inbox key this desk does not keep. The relay stores that key wrapped with a secret that stays on the device, and it will release the wrapped key only once each local day. Opening decrypts whatever has arrived, then a new inbox key takes the perch. Later letters are sealed to the new key.
            </p>
            <p className="mt-2">
              A modified copy of the app can keep the key and ignore the ritual. The README describes that limit, and what the relay can and cannot see.
            </p>
          </details>
        </main>
      </div>

      {composeOpen ? (
        <ComposeDialog
          snap={snap}
          initialTo={composeTo}
          onClose={() => setComposeOpen(false)}
          onSend={(to, subject, body) => session.sendLetter(to, subject, body)}
        />
      ) : null}
      {addOpen ? <AddDialog onClose={() => setAddOpen(false)} onAdd={(address) => session.addContact(address)} /> : null}
      {qrOpen ? <QrDialog address={profile.address} onClose={() => setQrOpen(false)} /> : null}
      {confirmEmpty ? (
        <Dialog title="Open an empty perch?" onClose={() => setConfirmEmpty(false)}>
          <h2 className="font-serif text-3xl">Open an empty perch?</h2>
          <p className="mt-3 text-sm leading-relaxed text-ink-soft">
            No letters are waiting. Breaking the seal still counts as today’s opening, and anything that arrives afterward waits until tomorrow.
          </p>
          <div className="mt-6 flex justify-end gap-3">
            <button type="button" className="rounded-full px-4 py-2 text-sm" onClick={() => setConfirmEmpty(false)}>
              Leave it shut
            </button>
            <button type="button" className="rounded-full bg-wax px-4 py-2 text-sm text-sheet" onClick={() => void openPost(true)}>
              Open anyway
            </button>
          </div>
        </Dialog>
      ) : null}
    </div>
  )
}

function OpenedPerch({ snap }: { snap: DeskSnapshot }) {
  return (
    <div className="flex flex-col items-center text-center">
      <div className="w-36 opacity-80">
        <SealMark label="Opened today" broken />
      </div>
      <h2 className="mt-4 font-serif text-4xl">Today’s post is open</h2>
      <p className="mt-2 max-w-md text-sm text-ink-soft">
        {snap.todayLetters.length === 0
          ? 'The seal broke on an empty perch.'
          : `${snap.todayLetters.length === 1 ? 'One letter' : `${snap.todayLetters.length} letters`} came out from under the wax.`}
      </p>
    </div>
  )
}

function LetterStack({
  title,
  letters,
  timeZone,
  activeId,
  onSelect,
  empty,
}: {
  title: string
  letters: LetterView[]
  timeZone: string
  activeId: string | null
  onSelect: (id: string) => void
  empty: string
}) {
  return (
    <section>
      <h2 className="font-serif text-2xl">{title}</h2>
      {letters.length === 0 ? <p className="mt-2 text-sm text-ink-soft">{empty}</p> : null}
      <div className="mt-3 space-y-3">
        {letters.map((letter) => {
          const open = letter.id === activeId
          return (
            <article key={letter.id} className="rounded-3xl border border-line bg-sheet">
              <button type="button" className="w-full px-5 py-4 text-left" onClick={() => onSelect(letter.id)} aria-expanded={open}>
                <p className="text-xs text-ink-soft">
                  {letter.fromName ?? shortenAddress(letter.from)} · {formatStamp(letter.sentAt, timeZone)}
                </p>
                <h3 className="mt-1 font-serif text-2xl">{letter.subject}</h3>
              </button>
              {open ? <p className="px-5 pb-5 text-[1.05rem] leading-relaxed whitespace-pre-wrap">{letter.body}</p> : null}
            </article>
          )
        })}
      </div>
    </section>
  )
}

function SentList({ snap }: { snap: DeskSnapshot }) {
  if (snap.sent.length === 0) return null
  return (
    <section>
      <h2 className="font-serif text-2xl">Sent</h2>
      <ul className="mt-3 divide-y divide-line rounded-3xl border border-line bg-sheet px-5">
        {snap.sent.map((letter) => (
          <li key={letter.id} className="py-3">
            <p className="text-sm">
              <span className="font-medium">{letter.subject}</span>
              <span className="text-ink-soft"> to {letter.toName ?? shortenAddress(letter.to)}</span>
            </p>
            <p className="text-xs text-ink-soft">{letter.status === 'waiting' ? 'Waiting for the relay' : 'On its way, sealed'}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}

function ComposeDialog({
  snap,
  initialTo,
  onClose,
  onSend,
}: {
  snap: DeskSnapshot
  initialTo: string
  onClose: () => void
  onSend: (to: string, subject: string, body: string) => Promise<string | null>
}) {
  const [to, setTo] = useState(initialTo)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    const result = await onSend(to, subject, body)
    setPending(false)
    if (result) {
      setError(result)
      return
    }
    onClose()
  }

  return (
    <Dialog title="Write a letter" onClose={onClose}>
      <form onSubmit={(event) => void onSubmit(event)}>
        <h2 className="font-serif text-3xl">Write a letter</h2>
        <p className="mt-2 text-sm text-ink-soft">You can write at any hour. It stays sealed until they open their post.</p>
        {snap.contacts.length === 0 ? (
          <p className="mt-4 text-sm text-ink-soft">Add a correspondent before the ink dries on a name.</p>
        ) : (
          <>
            <label className="mt-5 block text-sm font-medium" htmlFor="letter-to">
              To
            </label>
            <select
              id="letter-to"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              className="mt-2 w-full rounded-xl border border-line bg-paper px-3 py-3"
            >
              {snap.contacts.map((contact) => (
                <option key={contact.address} value={contact.address}>
                  {contact.displayName}
                </option>
              ))}
            </select>
            <label className="mt-4 block text-sm font-medium" htmlFor="letter-subject">
              Subject
            </label>
            <input
              id="letter-subject"
              value={subject}
              maxLength={SUBJECT_MAX}
              onChange={(event) => setSubject(event.target.value)}
              className="mt-2 w-full rounded-xl border border-line bg-paper px-3 py-3"
            />
            <label className="mt-4 block text-sm font-medium" htmlFor="letter-body">
              Letter
            </label>
            <textarea
              id="letter-body"
              value={body}
              maxLength={BODY_MAX}
              rows={8}
              onChange={(event) => setBody(event.target.value)}
              className="mt-2 w-full resize-y rounded-xl border border-line bg-paper px-3 py-3"
            />
            <p className="mt-1 text-right text-xs text-ink-soft">
              {body.length} / {BODY_MAX}
            </p>
          </>
        )}
        {error ? <p className="mt-3 text-sm text-wax">{error}</p> : null}
        <div className="mt-5 flex justify-end gap-3">
          <button type="button" className="rounded-full px-4 py-2 text-sm" onClick={onClose}>
            Close
          </button>
          <button
            type="submit"
            disabled={pending || snap.contacts.length === 0}
            className="rounded-full bg-wax px-4 py-2 text-sm text-sheet disabled:opacity-50"
          >
            {pending ? 'Sealing…' : 'Send the letter'}
          </button>
        </div>
      </form>
    </Dialog>
  )
}

function AddDialog({
  onClose,
  onAdd,
}: {
  onClose: () => void
  onAdd: (address: string) => Promise<string | null>
}) {
  const [address, setAddress] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    const result = await onAdd(address)
    setPending(false)
    if (result) {
      setError(result)
      return
    }
    onClose()
  }

  return (
    <Dialog title="Add a correspondent" onClose={onClose}>
      <form onSubmit={(event) => void onSubmit(event)}>
        <h2 className="font-serif text-3xl">Add a correspondent</h2>
        <label className="mt-4 block text-sm font-medium" htmlFor="owl-address">
          Owl address
        </label>
        <textarea
          id="owl-address"
          value={address}
          rows={3}
          onChange={(event) => setAddress(event.target.value)}
          placeholder="owl1…"
          className="mt-2 w-full rounded-xl border border-line bg-paper px-3 py-3 font-mono text-sm"
        />
        {error ? <p className="mt-3 text-sm text-wax">{error}</p> : null}
        <div className="mt-5 flex justify-end gap-3">
          <button type="button" className="rounded-full px-4 py-2 text-sm" onClick={onClose}>
            Close
          </button>
          <button type="submit" disabled={pending} className="rounded-full bg-moss px-4 py-2 text-sm text-sheet disabled:opacity-50">
            {pending ? 'Looking…' : 'Add to the desk'}
          </button>
        </div>
      </form>
    </Dialog>
  )
}

function QrDialog({ address, onClose }: { address: string; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    void toDataURL(address, {
      margin: 1,
      width: 320,
      color: { dark: '#1d1915', light: '#fbf7f0' },
    }).then((next) => {
      if (!cancelled) setUrl(next)
    })
    return () => {
      cancelled = true
    }
  }, [address])

  return (
    <Dialog title="Your owl mark" onClose={onClose}>
      <h2 className="font-serif text-3xl">Your mark</h2>
      <p className="mt-2 text-sm text-ink-soft">Another desk can add you from this mark or from the address.</p>
      <div className="mt-4 grid place-items-center rounded-2xl bg-paper p-4">
        {url ? <img src={url} alt="" width={240} height={240} /> : <p className="text-sm text-ink-soft">Drawing the mark…</p>}
      </div>
      <p className="mt-3 font-mono text-xs leading-relaxed break-all text-ink-soft">{formatAddress(address)}</p>
      <div className="mt-4 flex justify-end">
        <button type="button" className="rounded-full px-4 py-2 text-sm" onClick={onClose}>
          Close
        </button>
      </div>
    </Dialog>
  )
}

function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="dialog-backdrop" onMouseDown={onClose}>
      <div
        className="dialog-card p-6"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      className="rounded-full border border-line px-3 py-2 text-sm"
      onClick={() => {
        void navigator.clipboard.writeText(value).then(() => {
          setCopied(true)
          window.setTimeout(() => setCopied(false), 1600)
        })
      }}
    >
      {copied ? 'Copied' : label}
    </button>
  )
}

function RelayPill({ relay }: { relay: DeskSnapshot['relay'] }) {
  const label = relay === 'online' ? 'Relay reachable' : relay === 'connecting' ? 'Finding the relay' : 'Relay quiet'
  const dot = relay === 'online' ? 'bg-moss' : relay === 'connecting' ? 'bg-gold' : 'bg-wax'
  return (
    <p className="flex items-center gap-2 text-sm text-ink-soft" role="status">
      <span className={`h-2 w-2 rounded-full ${dot}`} />
      {label}
    </p>
  )
}

function sealedHeading(count: number): string {
  if (count === 1) return 'One letter is sealed.'
  return `${count} letters are sealed.`
}

function nameList(names: string[]): string {
  if (names.length === 0) return ''
  if (names.length === 1) return names[0] ?? ''
  if (names.length === 2) return `${names[0] ?? ''} and ${names[1] ?? ''}`
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1] ?? ''}`
}

function formatStamp(iso: string, timeZone: string): string {
  const parsed = Date.parse(iso)
  if (Number.isNaN(parsed)) return ''
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed)
}
