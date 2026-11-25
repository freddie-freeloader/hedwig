import { useEffect, useState } from 'react'
import { deskIdFromLocation } from './client/desk.ts'
import { HedwigSession } from './client/session.ts'
import { Desk } from './ui/Desk.tsx'
import { Join } from './ui/Join.tsx'
import { OwlMark } from './ui/icons.tsx'
import { useSnapshot } from './ui/useSnapshot.ts'

export default function App() {
  const [session] = useState(() => new HedwigSession(deskIdFromLocation(window.location.search)))
  const snap = useSnapshot(session)

  useEffect(() => {
    void session.start()
    return () => session.stop()
  }, [session])

  if (snap.phase === 'loading') {
    return (
      <main className="grid min-h-screen place-items-center px-6 text-center">
        <div>
          <OwlMark className="mx-auto h-14 w-14 text-ink" />
          <p className="mt-4 text-ink-soft">The owl is stretching a wing…</p>
        </div>
      </main>
    )
  }

  if (snap.phase === 'error') {
    return (
      <main className="mx-auto grid min-h-screen max-w-lg place-items-center px-6 text-center">
        <div>
          <OwlMark className="mx-auto h-14 w-14 text-ink" />
          <h1 className="mt-4 font-serif text-4xl">The desk did not open</h1>
          <p className="mt-3 text-ink-soft">{snap.error ?? 'Something on this device refused the keys.'}</p>
        </div>
      </main>
    )
  }

  if (snap.phase === 'join' || !snap.profile) {
    return <Join session={session} deskLabel={snap.deskLabel} />
  }

  return <Desk session={session} snap={snap} />
}
