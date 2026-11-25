import { useState } from 'react'
import type { FormEvent } from 'react'
import type { HedwigSession } from '../client/session.ts'
import { OwlMark } from './icons.tsx'

export function Join({
  session,
  deskLabel,
}: {
  session: HedwigSession
  deskLabel: string | null
}) {
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setError(null)
    const result = await session.createOwl(name)
    setPending(false)
    if (result) setError(result)
  }

  return (
    <main className="mx-auto grid min-h-screen max-w-5xl items-center gap-10 px-5 py-10 lg:grid-cols-[1.1fr_0.9fr] lg:px-8">
      <section>
        <p className="mb-6 flex items-center gap-3 text-sm tracking-[0.18em] text-moss uppercase">
          <OwlMark className="h-9 w-9 text-ink" />
          Hedwig
        </p>
        <h1 className="font-serif text-5xl leading-tight text-ink sm:text-6xl">Letters, not chatter.</h1>
        <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-soft">
          Write whenever you wish. The inbox opens once each day. Until then, what arrives stays sealed — and
          anything that comes after the opening waits for tomorrow.
        </p>
        <dl className="mt-8 grid max-w-xl gap-4 text-sm leading-relaxed text-ink-soft sm:grid-cols-3">
          <div>
            <dt className="font-medium text-ink">No central reading</dt>
            <dd className="mt-1">The relay carries ciphertext and a wrapped key it cannot open.</dd>
          </div>
          <div>
            <dt className="font-medium text-ink">Owls, not emails</dt>
            <dd className="mt-1">You meet someone by exchanging a public address or its mark.</dd>
          </div>
          <div>
            <dt className="font-medium text-ink">Once a day</dt>
            <dd className="mt-1">The desk releases the inbox key a single time, then cuts a new one.</dd>
          </div>
        </dl>
      </section>
      <form
        onSubmit={(event) => void onSubmit(event)}
        className="rounded-3xl border border-line bg-sheet p-6 shadow-[0_20px_50px_rgba(60,40,20,0.06)] sm:p-8"
      >
        <h2 className="font-serif text-3xl">Name your owl</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          Other desks see this name. Your address is a public key, generated on this device.
        </p>
        {deskLabel ? (
          <p className="mt-4 rounded-xl bg-paper px-3 py-2 text-sm text-ink-soft">
            This tab is a separate desk, <span className="text-ink">{deskLabel}</span>, with its own owl.
          </p>
        ) : null}
        <label className="mt-6 block text-sm font-medium" htmlFor="owl-name">
          Name
        </label>
        <input
          id="owl-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={32}
          autoComplete="nickname"
          placeholder="Alba"
          className="mt-2 w-full rounded-xl border border-line bg-paper px-3 py-3 outline-none"
        />
        {error ? (
          <p className="mt-3 text-sm text-wax" role="alert">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={pending}
          className="mt-6 w-full rounded-full bg-wax px-4 py-3 font-medium text-sheet disabled:opacity-60"
        >
          {pending ? 'Cutting the key…' : 'Create your owl'}
        </button>
      </form>
    </main>
  )
}
