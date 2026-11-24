import { test, expect } from '@playwright/test'

test.use({ serviceWorkers: 'block' })

test('image skeleton remains until the thumbnail and enlarged image load', async ({ page }) => {
  let releaseThumbnail!: () => void
  let releaseFull!: () => void
  const thumbnail = new Promise<void>(resolve => { releaseThumbnail = resolve })
  const full = new Promise<void>(resolve => { releaseFull = resolve })
  await page.route('**/photos/city-thumb.webp', async route => { await thumbnail; await route.continue() })
  await page.route('**/photos/city-full.webp', async route => { await full; await route.continue() })
  await page.goto('/?demo=1', { waitUntil: 'domcontentloaded' })
  const card = page.getByRole('article').filter({ has: page.locator('img[src="/photos/city-thumb.webp"]') })
  await expect(card.locator('.image-skeleton')).toBeVisible()
  const bounds = await card.locator('.photo-card-open').boundingBox()
  releaseThumbnail()
  await expect(card.locator('.loading-image')).toHaveClass(/is-ready/)
  await expect(card.locator('.image-skeleton')).toHaveCount(0)
  expect(await card.locator('.photo-card-open').boundingBox()).toEqual(bounds)
  await card.locator('.photo-card-open').click()
  await expect(page.getByRole('dialog').locator('.image-skeleton')).toBeVisible()
  releaseFull()
  await expect(page.getByRole('dialog').locator('.loading-image')).toHaveClass(/is-ready/)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).not.toBeVisible()
})

test('a failed image replaces the skeleton with a friendly message', async ({ page }) => {
  await page.route('**/photos/city-thumb.webp', route => route.abort())
  await page.goto('/?demo=1')
  const card = page.getByRole('article').filter({ has: page.locator('img[src="/photos/city-thumb.webp"]') })
  await expect(card.locator('.image-fallback')).toBeVisible()
  await expect(card.locator('.image-skeleton')).toHaveCount(0)
})
