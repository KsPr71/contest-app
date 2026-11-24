import { test, expect } from '@playwright/test'

test('scroll hides the hero and keeps navigation and collection title pinned', async ({ page }) => {
  await page.goto('/?demo=1')
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 844 })
    await page.locator('.gallery').evaluate(el => window.scrollTo(0, (el as HTMLElement).offsetTop + 250))
    await expect.poll(() => page.locator('.intro-content').evaluate(el => Number(getComputedStyle(el).opacity))).toBe(0)
    await expect.poll(() => page.locator('header').evaluate(el => Math.round(el.getBoundingClientRect().top))).toBe(0)
    await expect.poll(async () => {
      const navigation = await page.locator('header').boundingBox()
      const title = await page.locator('.gallery > .section-heading').boundingBox()
      return Math.abs(title!.y - (navigation!.y + navigation!.height))
    }).toBeLessThanOrEqual(1)
    await expect(page.locator('#gallery-title')).toBeInViewport()
  }
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect.poll(() => page.locator('.intro-content').evaluate(el => getComputedStyle(el).opacity)).toBe('1')
})

test('search works while gallery options stay collapsed', async ({ page }) => {
  await page.goto('/?demo=1')
  await expect(page.locator('.gallery-options')).not.toHaveAttribute('open')
  await expect(page.locator('.controls select')).not.toBeVisible()
  await page.getByRole('searchbox').fill('La luz')
  await expect(page.getByRole('article')).toHaveCount(1)
  await page.locator('.gallery-options summary').click()
  await expect(page.locator('.controls select')).toBeVisible()
  await page.getByRole('searchbox').fill('')
  await expect(page.getByRole('article')).toHaveCount(4)
})

test('desktop typography stays readable and reflows with enlarged text', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/?demo=1')
  await page.locator('.gallery-options summary').click()
  await expect(page.getByRole('article')).toHaveCount(4)
  expect(await page.locator('.photo-card-description').first().evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBe(16)
  await expect(page.locator('.photo-card time')).toHaveCount(0)
  expect(await page.locator('.controls input').evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBe(16)
  await page.screenshot({ path: 'supabase/.temp/desktop-typography.png', fullPage: true })
  for (const width of [1440, 1024, 768]) {
    await page.setViewportSize({ width, height: 1000 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.addStyleTag({ content: 'html { font-size: 200%; }' })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  for (const card of await page.getByRole('article').all()) {
    expect(await card.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
  }
})

test('mobile gallery keeps readable controls and full-width cards in every layout', async ({ page }) => {
  await page.goto('/?demo=1')
  await page.locator('.gallery-options summary').click()
  for (const width of [320, 390, 540]) {
    await page.setViewportSize({ width, height: 844 })
    for (const layout of ['masonry', 'rows', 'columns']) {
      await page.locator('.controls select').selectOption(layout)
      await expect(page.getByRole('article')).toHaveCount(4)
      await expect.poll(() => page.getByRole('article').first().evaluate(el => el.getBoundingClientRect().width)).toBeGreaterThan(width - 40)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    }
    expect(await page.locator('.controls input').evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16)
    expect(await page.locator('.photo-card-description').first().evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(14)
    expect(await page.locator('.photo-vote label > span:first-of-type').first().evaluate(el => el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44)
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: 'supabase/.temp/mobile-responsive.png', fullPage: true })
})
