import { openDB } from 'idb'
import type { DBSchema, IDBPDatabase } from 'idb'
import type { Envelope } from '../crypto/letter.ts'
import { databaseName } from './desk.ts'

export type IdentityRecord = {
  displayName: string
  address: string
  publicKey: string
  secretKey: string
  wrapKey: string
  timezone: string
  inboxPub: string
}

export type MetaRecord = {
  lastOpenedLocalDate: string | null
  pendingAckDate: string | null
}

export type ContactRecord = {
  address: string
  displayName: string
}

export type SealedRecord = {
  id: string
  from: string
  toInbox: string
  envelope: Envelope
  receivedAt: string
}

export type OpenedRecord = {
  id: string
  from: string
  fromName: string
  subject: string
  body: string
  sentAt: string
  openedOn: string
}

export type SentRecord = {
  id: string
  to: string
  subject: string
  body: string
  sentAt: string
}

export type OutboxRecord = {
  id: string
  to: string
  subject: string
  body: string
  createdAt: string
}

interface HedwigSchema extends DBSchema {
  kv: { key: string; value: IdentityRecord | MetaRecord }
  contacts: { key: string; value: ContactRecord }
  sealed: { key: string; value: SealedRecord }
  opened: { key: string; value: OpenedRecord }
  sent: { key: string; value: SentRecord }
  outbox: { key: string; value: OutboxRecord }
}

function isIdentity(value: IdentityRecord | MetaRecord | undefined): value is IdentityRecord {
  return value !== undefined && 'secretKey' in value
}

function isMeta(value: IdentityRecord | MetaRecord | undefined): value is MetaRecord {
  return value !== undefined && 'lastOpenedLocalDate' in value && !('secretKey' in value)
}

export class HedwigDb {
  private readonly db: IDBPDatabase<HedwigSchema>

  private constructor(db: IDBPDatabase<HedwigSchema>) {
    this.db = db
  }

  static async open(deskId: string | null): Promise<HedwigDb> {
    const db = await openDB<HedwigSchema>(databaseName(deskId), 1, {
      upgrade(database) {
        database.createObjectStore('kv')
        database.createObjectStore('contacts', { keyPath: 'address' })
        database.createObjectStore('sealed', { keyPath: 'id' })
        database.createObjectStore('opened', { keyPath: 'id' })
        database.createObjectStore('sent', { keyPath: 'id' })
        database.createObjectStore('outbox', { keyPath: 'id' })
      },
    })
    return new HedwigDb(db)
  }

  async getIdentity(): Promise<IdentityRecord | null> {
    const value = await this.db.get('kv', 'identity')
    return isIdentity(value) ? value : null
  }

  async putIdentity(record: IdentityRecord): Promise<void> {
    await this.db.put('kv', record, 'identity')
  }

  async getMeta(): Promise<MetaRecord> {
    const value = await this.db.get('kv', 'meta')
    if (!isMeta(value)) return { lastOpenedLocalDate: null, pendingAckDate: null }
    const pending = 'pendingAckDate' in value && typeof value.pendingAckDate === 'string' ? value.pendingAckDate : null
    return { lastOpenedLocalDate: value.lastOpenedLocalDate, pendingAckDate: pending }
  }

  async putMeta(record: MetaRecord): Promise<void> {
    await this.db.put('kv', record, 'meta')
  }

  async listContacts(): Promise<ContactRecord[]> {
    return this.db.getAll('contacts')
  }

  async putContact(record: ContactRecord): Promise<void> {
    await this.db.put('contacts', record)
  }

  async deleteContact(address: string): Promise<void> {
    await this.db.delete('contacts', address)
  }

  async listSealed(): Promise<SealedRecord[]> {
    return this.db.getAll('sealed')
  }

  async putSealed(record: SealedRecord): Promise<void> {
    await this.db.put('sealed', record)
  }

  async deleteSealed(id: string): Promise<void> {
    await this.db.delete('sealed', id)
  }

  async listOpened(): Promise<OpenedRecord[]> {
    return this.db.getAll('opened')
  }

  async putOpened(record: OpenedRecord): Promise<void> {
    await this.db.put('opened', record)
  }

  async listSent(): Promise<SentRecord[]> {
    return this.db.getAll('sent')
  }

  async putSent(record: SentRecord): Promise<void> {
    await this.db.put('sent', record)
  }

  async listOutbox(): Promise<OutboxRecord[]> {
    return this.db.getAll('outbox')
  }

  async putOutbox(record: OutboxRecord): Promise<void> {
    await this.db.put('outbox', record)
  }

  async deleteOutbox(id: string): Promise<void> {
    await this.db.delete('outbox', id)
  }
}
