import { expect, test, type Page } from '@playwright/test'
import { reassembleTransfer, splitTransfer } from '../../src/transfer.ts'

async function openDesk(page: Page, path = '/') {
  await page.goto(path)
  await expect(page.locator('h1')).toBeVisible({ timeout: 15_000 })
  if (await page.getByRole('heading', { name: 'Welcome', exact: true }).isVisible()) {
    await page.getByLabel('Your name').fill('Ada')
    await page.getByRole('button', { name: 'Open my desk' }).click()
    await expect(page.getByRole('heading', { level: 1, name: /Ada/ })).toBeVisible()
  }
}

async function openMore(page: Page, name: RegExp | string) {
  await page.getByRole('button', { name: 'More' }).click()
  await page.getByRole('button', { name }).click()
}

test('explains the desk and asks for a name on a first visit', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Welcome', exact: true })).toBeVisible()
  await expect(page.getByText('It stays closed until that day arrives.')).toBeVisible()
  await page.getByRole('button', { name: 'Open my desk' }).click()
  await expect(page.getByText('Tell your friend what to call you.')).toBeVisible()
  await page.getByLabel('Your name').fill('Ada')
  await page.getByRole('button', { name: 'Open my desk' }).click()
  await expect(page.getByRole('heading', { level: 1, name: /Ada/ })).toBeVisible()
  await expect(page.getByText('Nothing is sealed right now.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Write a letter' })).toBeVisible()
})

test('follows the section hash from the mobile tab bar', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openDesk(page)
  const nav = page.getByRole('navigation', { name: 'Sections' })
  await expect(nav.getByRole('button', { name: 'Desk', exact: true })).toHaveAttribute('aria-current', 'page')
  await nav.getByRole('button', { name: 'Write', exact: true }).click()
  await expect(page).toHaveURL(/#write/)
  await expect(nav.getByRole('button', { name: 'Write', exact: true })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('heading', { name: 'Write a letter' })).toBeVisible()
})

test('loads the dark desk and shows your letter address', async ({ page }) => {
  await openDesk(page)
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Ada')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.getByRole('button', { name: 'Pair', exact: true }).click()
  await expect(page.getByText('Your letter address')).toBeVisible()
  await expect(page.getByText(/^owl1[A-Za-z0-9_-]+$/).first()).toBeVisible()
})

test('opens the FAQ and toggles to light mode', async ({ page }) => {
  await openDesk(page)
  await openMore(page, 'Help')
  await expect(page.getByRole('heading', { name: 'How letters open' })).toBeVisible()
  await page.getByText('How do I invite a friend?').click()
  await expect(page.getByText('creates an invitation', { exact: false })).toBeVisible()

  await page.getByRole('button', { name: 'Return to desk' }).click()
  await page.getByRole('button', { name: 'Light' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
})

test('hides the one second release outside dev mode', async ({ page }) => {
  await openDesk(page)
  await page.getByRole('button', { name: 'Write', exact: true }).click()
  await expect(page.getByRole('button', { name: '1 second (test)' })).toHaveCount(0)
})

test('keeps tomorrow morning at 08:00 across the spring change', async ({ browser }) => {
  const context = await browser.newContext({ timezoneId: 'America/New_York' })
  const page = await context.newPage()
  await page.clock.install({ time: new Date('2026-03-07T17:00:00.000Z') })
  await openDesk(page)
  await page.getByRole('button', { name: 'Write', exact: true }).click()
  await expect(page.getByText('Opens Sunday 8 March 2026 at 08:00.')).toBeVisible()
  await context.close()
})

test('keeps the chosen morning at 08:00 across the fall change', async ({ browser }) => {
  const context = await browser.newContext({ timezoneId: 'America/New_York' })
  const page = await context.newPage()
  await page.clock.install({ time: new Date('2026-10-31T16:00:00.000Z') })
  await openDesk(page)
  await page.getByRole('button', { name: 'Write', exact: true }).click()
  await expect(page.getByText('Opens Sunday 1 November 2026 at 08:00.')).toBeVisible()
  await context.close()
})

test('offers the 1-second test release preset in dev mode', async ({ page }) => {
  await openDesk(page, '/?dev=1')
  await page.getByRole('button', { name: 'Write', exact: true }).click()
  await page.getByRole('button', { name: '1 second (test)' }).click()
  await expect(page.getByRole('button', { name: '1 second (test)' })).toHaveAttribute('aria-pressed', 'true')
})

test('saves and restores a draft across reload', async ({ page }) => {
  await openDesk(page)
  await page.getByRole('button', { name: 'Write', exact: true }).click()
  await page.getByLabel('Subject').fill('Test subject')
  await page.getByLabel('The letter').fill('Test draft body')
  await page.getByRole('button', { name: 'Save draft' }).click()
  await expect(page.getByRole('status')).toContainText('Saved')
  await page.reload()
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await page.getByRole('button', { name: 'Write', exact: true }).click()
  await expect(page.getByLabel('Subject')).toHaveValue('Test subject')
  await expect(page.getByLabel('The letter')).toHaveValue('Test draft body')
})

test('creates an identity backup', async ({ page }) => {
  await openDesk(page)
  await page.getByRole('button', { name: 'Pair', exact: true }).click()
  await page.getByRole('button', { name: 'Create backup' }).click()
  await expect(page.getByText('Your backup is ready')).toBeVisible()
  await expect(page.locator('textarea[rows="4"]').first()).not.toHaveValue('')
})

test('shows a field error instead of a pre-genesis drand error', async ({ page }) => {
  await openDesk(page)
  await page.getByRole('button', { name: 'Write', exact: true }).click()
  await page.getByRole('button', { name: 'Seal & send' }).click()
  await expect(page.getByText("Add your friend's letter address.", { exact: true })).toBeVisible()
  await expect(page.getByText(/Cannot request a round before the genesis time/)).toHaveCount(0)
})

test('shows and retries a failed outbox item', async ({ page }) => {
  await openDesk(page, '/?dev=1')
  await page.getByRole('button', { name: 'Pair', exact: true }).click()
  const address = await page.getByText(/^owl1[A-Za-z0-9_-]+$/).first().textContent()
  if (!address) throw new Error('Letter address was not rendered')
  await page.getByRole('button', { name: 'Write', exact: true }).click()
  await page.getByLabel('Their address').fill(address)
  await page.getByLabel('Subject').fill('Outbox test')
  await page.getByLabel('The letter').fill('This letter is waiting for a peer.')
  await page.getByRole('button', { name: '1 second (test)' }).click()
  await page.getByRole('button', { name: 'Seal & send' }).click()
  await openMore(page, /^Outbox/)
  await expect(page.getByText('Outbox test')).toBeVisible()
  await expect(page.getByText('Not delivered', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible()
})

test('opens the dedicated outbox page', async ({ page }) => {
  await openDesk(page)
  await openMore(page, /^Outbox/)
  await expect(page.getByRole('heading', { name: 'Outbox', exact: true })).toBeVisible()
  await expect(page.getByText('Letters stay here until they reach your friend.')).toBeVisible()
})

test('splits the desk into focused sections', async ({ page }) => {
  await openDesk(page)
  await expect(page.getByRole('button', { name: 'Pair', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Write', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Inbox', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'More' }).click()
  await expect(page.getByRole('button', { name: /^Outbox/ })).toBeVisible()
  await page.getByRole('button', { name: 'Write', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Write a letter' })).toBeVisible()
})

test('keeps a full copy in Sent after preparing a letter', async ({ page }) => {
  await openDesk(page, '/?dev=1')
  await page.getByRole('button', { name: 'Pair', exact: true }).click()
  const address = await page.getByText(/^owl1[A-Za-z0-9_-]+$/).first().textContent()
  if (!address) throw new Error('Letter address was not rendered')
  await page.getByRole('button', { name: 'Write', exact: true }).click()
  await page.getByLabel('Their address').fill(address)
  await page.getByLabel('Subject').fill('A preserved copy')
  await page.getByLabel('The letter').fill('This full text should remain in Sent.')
  await page.getByRole('button', { name: '1 second (test)' }).click()
  await page.getByRole('button', { name: 'Seal & send' }).click()
  await openMore(page, /^Sent/)
  await expect(page.getByRole('heading', { name: 'A preserved copy' })).toBeVisible()
  await expect(page.getByText('This full text should remain in Sent.')).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await openMore(page, /^Sent/)
  await expect(page.getByText('This full text should remain in Sent.')).toBeVisible()
})

test('connects two browser contexts by manual WebRTC signaling', async ({ browser }) => {
  test.setTimeout(60_000)
  const sender = await browser.newContext()
  const recipient = await browser.newContext()
  const senderPage = await sender.newPage()
  const recipientPage = await recipient.newPage()

  await Promise.all([openDesk(senderPage), openDesk(recipientPage)])
  await senderPage.getByRole('button', { name: 'Pair', exact: true }).click()
  await recipientPage.getByRole('button', { name: 'Pair', exact: true }).click()
  await recipientPage.getByRole('tab', { name: 'Join a friend' }).click()

  await senderPage.getByRole('button', { name: 'Create invitation' }).click()
  const invitation = senderPage.getByLabel('Your invitation')
  await expect.poll(async () => (await invitation.inputValue()).length, { timeout: 20_000 }).toBeGreaterThan(100)
  await senderPage.getByRole('button', { name: 'Copy invitation' }).click()
  await expect(senderPage.getByRole('status')).toContainText('Invitation copied')
  await senderPage.getByRole('tab', { name: 'Join a friend' }).click()
  await expect(senderPage.getByLabel("Friend's invitation")).toHaveValue('')
  await senderPage.getByRole('tab', { name: 'Invite a friend' }).click()

  const invitationText = await invitation.inputValue()
  if (!invitationText) throw new Error('Invitation was not created')
  await recipientPage.getByLabel("Friend's invitation").fill(invitationText)
  await recipientPage.getByRole('button', { name: 'Create answer' }).click()
  const answer = recipientPage.getByLabel('Your answer')
  await expect.poll(async () => (await answer.inputValue()).length, { timeout: 20_000 }).toBeGreaterThan(100)
  const answerText = await answer.inputValue()
  if (!answerText) throw new Error('Answer was not created')

  await senderPage.getByLabel("Friend's answer").fill(answerText)
  await senderPage.getByRole('button', { name: 'Connect', exact: true }).click()
  await expect.poll(async () => senderPage.getByTestId('connection-status').innerText(), { timeout: 30_000 }).toBe('Connected')
  await expect.poll(async () => recipientPage.getByTestId('connection-status').innerText(), { timeout: 30_000 }).toBe('Connected')

  await recipient.close()
  await sender.close()
})

test('offers an accessible confirmation before identity restore', async ({ page }) => {
  await openDesk(page)
  await page.getByRole('button', { name: 'Pair', exact: true }).click()
  await page.getByPlaceholder('Paste backup JSON').fill('{}')
  await page.getByRole('button', { name: 'Restore backup' }).click()
  await expect(page.getByRole('dialog', { name: 'Restore this desk?' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Confirm' })).toBeVisible()
})

test('clears stale signaling with reset connection', async ({ page }) => {
  await openDesk(page)
  await page.getByRole('button', { name: 'Pair', exact: true }).click()
  await page.getByRole('button', { name: 'Reset connection' }).click()
  await expect(page.getByText('Disconnected', { exact: true }).first()).toBeVisible()
})

test('shows ICE diagnostics after creating an invitation', async ({ page }) => {
  await openDesk(page)
  await page.getByRole('button', { name: 'Pair', exact: true }).click()
  await page.getByRole('button', { name: 'Create invitation' }).click()
  await page.getByRole('button', { name: 'Details' }).click()
  await expect(page.getByText(/ICE candidates|gathering/i).first()).toBeVisible({ timeout: 15_000 })
})

test('archives and restores an outbox item', async ({ page }) => {
  await openDesk(page)
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
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await openMore(page, /^Outbox/)
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
