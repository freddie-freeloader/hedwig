export type RelayStatus = 'connecting' | 'online' | 'offline'

export type Notice = {
  tone: 'info' | 'error'
  text: string
}

export type LetterView = {
  id: string
  from: string
  fromName: string | null
  subject: string
  body: string
  sentAt: string
  openedOn: string
}

export type SentView = {
  id: string
  to: string
  toName: string | null
  subject: string
  body: string
  sentAt: string
  status: 'delivered' | 'waiting'
}

export type SealedView = {
  id: string
  from: string
  fromName: string | null
  receivedAt: string
}

export type ContactView = {
  address: string
  displayName: string
}

export type DeskSnapshot = {
  phase: 'loading' | 'join' | 'ready' | 'error'
  deskLabel: string | null
  error: string | null
  relay: RelayStatus
  profile: { displayName: string; address: string; timezone: string } | null
  todayLabel: string
  contacts: ContactView[]
  sealed: SealedView[]
  openedToday: boolean
  todayLetters: LetterView[]
  earlierLetters: LetterView[]
  sent: SentView[]
  nextOpenLabel: string | null
  notice: Notice | null
  opening: boolean
}
