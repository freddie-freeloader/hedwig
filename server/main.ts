import { resolve } from 'node:path'
import { systemClock } from '../src/inbox/clock.ts'
import { MailboxStore } from '../src/relay/store.ts'
import { createRelay } from './http.ts'
import { readSnapshot, writeSnapshot } from './persist.ts'

const port = Number(process.env.HEDWIG_PORT ?? 4747)
const dataFile = resolve(process.env.HEDWIG_DATA ?? 'data/relay.json')

const store = new MailboxStore(systemClock)
const existing = await readSnapshot(dataFile)
if (existing) store.replace(existing)

let writing = Promise.resolve()
store.subscribe(() => {
  const snapshot = store.snapshot()
  writing = writing.then(() => writeSnapshot(dataFile, snapshot)).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'unknown error'
    console.error(`relay snapshot failed: ${message}`)
  })
})

const relay = createRelay(store)
relay.http.listen(port, '0.0.0.0', () => {
  console.log(`Hedwig relay listening on http://127.0.0.1:${port}`)
})
