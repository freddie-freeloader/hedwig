import { useEffect, useState } from 'react'
import type { HedwigSession } from '../client/session.ts'
import type { DeskSnapshot } from '../client/types.ts'

export function useSnapshot(session: HedwigSession): DeskSnapshot {
  const [snapshot, setSnapshot] = useState<DeskSnapshot>(() => session.current())
  useEffect(() => session.subscribe(setSnapshot), [session])
  return snapshot
}
