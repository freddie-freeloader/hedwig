import { expect, test } from '@playwright/test'
import { reassembleTransfer, splitTransfer } from '../../src/transfer.ts'

test('loads the dark desk and exposes owl identity', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Private letter desk' })).toBeVisible()
  await page.getByRole('button', { name: 'Owl', exact: true }).click()
  await expect(page.getByText('Share this owl address')).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
})

test('opens the FAQ and toggles to light mode', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Help & FAQ' }).click()
  await expect(page.getByRole('heading', { name: 'How Hedwig works' })).toBeVisible()
  await page.getByText('How do I connect two owls?').click()
  await expect(page.getByText('Send your owl address to the other person.', { exact: false })).toBeVisible()

  await page.getByRole('button', { name: 'Return to desk' }).click()
  await page.getByRole('button', { name: 'Light' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
})

test('offers the 1-second test release preset', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Compose', exact: true }).click()
  await page.getByRole('button', { name: '1 second (test)' }).click()
  await expect(page.getByRole('button', { name: '1 second (test)' })).toBeVisible()
})

test('saves and restores a draft across reload', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Compose', exact: true }).click()
  await page.getByPlaceholder('A note').fill('Test subject')
  await page.getByPlaceholder('Write in ink...').fill('Test draft body')
  await page.getByRole('button', { name: 'Save draft' }).click()
  await page.reload()
  await page.getByRole('button', { name: 'Compose', exact: true }).click()
  await expect(page.getByPlaceholder('A note')).toHaveValue('Test subject')
  await expect(page.getByPlaceholder('Write in ink...')).toHaveValue('Test draft body')
})

test('creates an identity backup', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Owl', exact: true }).click()
  await page.getByRole('button', { name: 'Create backup' }).click()
  await expect(page.getByText('Identity backup ready')).toBeVisible()
  await expect(page.locator('textarea[rows="4"]').first()).not.toHaveValue('')
})

test('shows a clear connection error instead of a pre-genesis drand error', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Compose', exact: true }).click()
  await page.getByRole('button', { name: 'Seal & send' }).click()
  await expect(
    page.getByText('Recipient owl address is invalid', { exact: true }),
  ).toBeVisible()
  await expect(page.getByText(/Cannot request a round before the genesis time/)).toHaveCount(0)
})

test('shows and retries a failed outbox item', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Owl', exact: true }).click()
  const address = await page.getByText(/^owl1[A-Za-z0-9_-]+$/).first().textContent()
  if (!address) throw new Error('Owl address was not rendered')
  await page.getByRole('button', { name: 'Compose', exact: true }).click()
  await page.getByPlaceholder('owl1...').fill(address)
  await page.getByPlaceholder('A note').fill('Outbox test')
  await page.getByPlaceholder('Write in ink...').fill('This letter is waiting for a peer.')
  await page.getByRole('button', { name: '1 second (test)' }).click()
  await page.getByRole('button', { name: 'Seal & send' }).click()
  await page.getByRole('button', { name: /^Outbox/ }).click()
  await expect(page.getByText('Outbox test')).toBeVisible()
  await expect(page.getByText('failed', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible()
})

test('opens the dedicated outbox page', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /^Outbox/ }).click()
  await expect(page.getByRole('heading', { name: 'Delivery status' })).toBeVisible()
  await expect(page.getByText('Prepared letters remain here until their delivery status changes.')).toBeVisible()
})

test('splits the desk into focused tabs', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Owl', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Compose', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Inbox/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Outbox/ })).toBeVisible()
  await page.getByRole('button', { name: 'Compose' }).click()
  await expect(page.getByRole('heading', { name: 'Write' })).toBeVisible()
})

test('keeps a full copy in Sent after preparing a letter', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Owl', exact: true }).click()
  const address = await page.getByText(/^owl1[A-Za-z0-9_-]+$/).first().textContent()
  if (!address) throw new Error('Owl address was not rendered')
  await page.getByRole('button', { name: 'Compose', exact: true }).click()
  await page.getByPlaceholder('owl1...').fill(address)
  await page.getByPlaceholder('A note').fill('A preserved copy')
  await page.getByPlaceholder('Write in ink...').fill('This full text should remain in Sent.')
  await page.getByRole('button', { name: '1 second (test)' }).click()
  await page.getByRole('button', { name: 'Seal & send' }).click()
  await page.getByRole('button', { name: /^Sent/ }).click()
  await expect(page.getByRole('heading', { name: 'A preserved copy' })).toBeVisible()
  await expect(page.getByText('This full text should remain in Sent.')).toBeVisible()
  await page.reload()
  await page.getByRole('button', { name: /^Sent/ }).click()
  await expect(page.getByText('This full text should remain in Sent.')).toBeVisible()
})

test('connects two browser contexts by manual WebRTC signaling', async ({ browser }) => {
  const sender = await browser.newContext()
  const recipient = await browser.newContext()
  const senderPage = await sender.newPage()
  const recipientPage = await recipient.newPage()

  await senderPage.goto('/')
  await recipientPage.goto('/')
  await senderPage.getByRole('button', { name: 'Owl', exact: true }).click()
  await recipientPage.getByRole('button', { name: 'Owl', exact: true }).click()

  const recipientAddress = await recipientPage.locator('p.font-mono').first().textContent()
  if (!recipientAddress || !recipientAddress.startsWith('owl1')) {
    throw new Error('Recipient address was not available')
  }

  await senderPage.getByRole('button', { name: 'Create invitation' }).click()
  await expect(senderPage.getByText(/invitation|waiting/i).first()).toBeVisible()
  const invitationInput = senderPage.getByPlaceholder('Paste invitation here')
  await expect.poll(async () => (await invitationInput.inputValue()).length).toBeGreaterThan(100)
  const invitation = await invitationInput.inputValue()
  if (!invitation) throw new Error('Invitation was not created')

  await recipientPage.getByPlaceholder('Paste invitation here').fill(invitation)
  await recipientPage.getByRole('button', { name: 'Create answer' }).click()
  await expect(recipientPage.getByText(/answer|waiting/i).first()).toBeVisible()
  const answerInput = recipientPage.getByPlaceholder('Paste answer here')
  await expect.poll(async () => (await answerInput.inputValue()).length).toBeGreaterThan(100)
  const answer = await answerInput.inputValue()
  if (!answer) throw new Error('Answer was not created')

  await senderPage.getByPlaceholder('Paste answer here').fill(answer)
  await senderPage.getByRole('button', { name: 'Connect', exact: true }).click()
  await expect(senderPage.getByText(/connecting|failed/i).first()).toBeVisible({ timeout: 15_000 })
  await expect(answerInput).not.toBeEmpty()

  await recipient.close()
  await sender.close()
})

test('offers an accessible confirmation before identity restore', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Owl', exact: true }).click()
  await page.getByPlaceholder('Paste backup JSON').fill('{}')
  await page.getByRole('button', { name: 'Restore owl' }).click()
  await expect(page.getByRole('dialog', { name: 'Restore this owl?' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Confirm' })).toBeVisible()
})

test('clears stale signaling with reset connection', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Owl', exact: true }).click()
  await page.getByRole('button', { name: 'Reset connection' }).click()
  await expect(page.getByText('Disconnected', { exact: true }).first()).toBeVisible()
})

test('archives and restores an outbox item', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => {
    localStorage.setItem('hedwig-outbox', JSON.stringify([{
      id: 'AbCdEfGh12345678',
      subject: 'Archive test',
      recipient: 'owl1test',
      status: 'failed',
      envelope: '{}',
      createdAt: new Date().toISOString(),
      error: 'Connect to the peer',
    }]))
  })
  await page.reload()
  await page.getByRole('button', { name: /^Outbox/ }).click()
  await expect(page.getByText('Archive test')).toBeVisible()
  await page.getByRole('button', { name: 'Archive outbox' }).click()
  await expect(page.getByRole('dialog', { name: 'Archive the outbox?' })).toBeVisible()
  await page.getByRole('button', { name: 'Confirm' }).click()
  await expect(page.getByText('Archived: 1')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Restore' })).toBeVisible()
  await page.getByRole('button', { name: 'Restore' }).click()
  await expect(page.getByText('Archive test')).toBeVisible()
})

test('delivers bytes over a real same-page WebRTC data channel', async ({ page }) => {
  await page.goto('/')
  const payload = JSON.stringify({
    v: 1,
    envelopeId: 'AbCdEfGh12345678',
    body: 'x'.repeat(20_000),
  })
  const frames = splitTransfer(payload, 'AbCdEfGh12345678')
  const received = await page.evaluate(async (transferFrames) => {
    const left = new RTCPeerConnection({ iceServers: [] })
    const right = new RTCPeerConnection({ iceServers: [] })
    const receive = new Promise<string[]>((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error('loopback timeout')), 10_000)
      const chunks = new Map<number, string>()
      right.ondatachannel = event => {
        event.channel.onmessage = message => {
          const frame = JSON.parse(String(message.data)) as {
            chunkIndex: number
            chunkCount: number
            payload: string
          }
          chunks.set(frame.chunkIndex, frame.payload)
          if (chunks.size === frame.chunkCount) {
            window.clearTimeout(timeout)
            resolve(Array.from({ length: frame.chunkCount }, (_, index) => chunks.get(index) ?? ''))
          }
        }
      }
    })
    left.onicecandidate = event => {
      if (event.candidate) void right.addIceCandidate(event.candidate)
    }
    right.onicecandidate = event => {
      if (event.candidate) void left.addIceCandidate(event.candidate)
    }
    const channel = left.createDataChannel('hedwig-loopback')
    const offer = await left.createOffer()
    await left.setLocalDescription(offer)
    await right.setRemoteDescription(offer)
    const answer = await right.createAnswer()
    await right.setLocalDescription(answer)
    await left.setRemoteDescription(answer)
    await new Promise<void>(resolve => {
      if (channel.readyState === 'open') {
        resolve()
        return
      }
      channel.onopen = () => resolve()
    })
    for (const frame of transferFrames) channel.send(JSON.stringify(frame))
    const chunks = await receive
    left.close()
    right.close()
    return chunks
  }, frames)
  expect(received.join('')).toBe(payload)

  let session: Parameters<typeof reassembleTransfer>[0] = null
  let result: ReturnType<typeof reassembleTransfer>['result'] = { ok: false, reason: 'missing-chunks' }
  for (const frame of frames) {
    const next = reassembleTransfer(session, frame)
    session = next.session
    result = next.result
  }
  expect(result).toEqual({ ok: true, payload })
})
