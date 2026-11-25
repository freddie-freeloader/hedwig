import { expect, test } from '@playwright/test'

test('loads the dark desk and exposes owl identity', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Private letter desk' })).toBeVisible()
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
  await page.getByRole('button', { name: '1 second (test)' }).click()
  await expect(page.getByRole('button', { name: '1 second (test)' })).toBeVisible()
})

test('saves and restores a draft across reload', async ({ page }) => {
  await page.goto('/')
  await page.getByPlaceholder('A note').fill('Test subject')
  await page.getByPlaceholder('Write in ink...').fill('Test draft body')
  await page.getByRole('button', { name: 'Save draft' }).click()
  await page.reload()
  await expect(page.getByPlaceholder('A note')).toHaveValue('Test subject')
  await expect(page.getByPlaceholder('Write in ink...')).toHaveValue('Test draft body')
})

test('creates an identity backup', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Create backup' }).click()
  await expect(page.getByText('Identity backup ready')).toBeVisible()
  await expect(page.locator('textarea[rows="4"]').first()).not.toHaveValue('')
})

test('shows a clear connection error instead of a pre-genesis drand error', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Seal & send' }).click()
  await expect(
    page.getByText('Recipient owl address is invalid', { exact: true }),
  ).toBeVisible()
  await expect(page.getByText(/Cannot request a round before the genesis time/)).toHaveCount(0)
})
